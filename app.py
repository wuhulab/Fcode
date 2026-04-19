"""
FoxCode - 简约手机IDE
基于 Flask + Monaco Editor 的轻量级代码编辑器
"""

import os
import sys
import threading
import logging
import subprocess
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit

# 配置日志记录
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'foxcode_ide_secret_key'

# 初始化 SocketIO
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# 默认工作目录（启动时为空，等待用户选择项目文件夹）
DEFAULT_WORKSPACE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'workspace')
_workspace_root = None
_workspace_lock = threading.Lock()


def get_workspace_root():
    """获取当前工作目录（线程安全）"""
    with _workspace_lock:
        return _workspace_root


def set_workspace_root(path):
    """设置当前工作目录（线程安全）"""
    global _workspace_root
    with _workspace_lock:
        _workspace_root = path
        logger.info(f"工作目录已设置为: {path}")


# 初始化默认工作目录
if not os.path.exists(DEFAULT_WORKSPACE):
    os.makedirs(DEFAULT_WORKSPACE)
    logger.info(f"创建默认工作目录: {DEFAULT_WORKSPACE}")

# 设置默认工作目录
set_workspace_root(DEFAULT_WORKSPACE)


def normalize_path(input_path):
    """
    路径规范化与安全处理
    将相对路径转换为绝对路径，并进行安全校验
    
    Args:
        input_path: 输入的文件/目录路径（支持绝对路径或相对路径）
    
    Returns:
        str: 规范化后的绝对路径
    
    Raises:
        ValueError: 当路径包含非法字符或超出工作范围时，或工作目录未设置时
    """
    workspace_root = get_workspace_root()
    if not workspace_root:
        raise ValueError("工作目录未设置，请先选择项目文件夹")
    
    if not input_path:
        return workspace_root
    
    # 统一路径分隔符为当前系统格式
    input_path = input_path.replace('/', os.sep).replace('\\', os.sep)
    
    # 获取工作目录的真实路径
    real_workspace = os.path.realpath(workspace_root)
    
    # 如果已经是绝对路径，直接验证并返回
    if os.path.isabs(input_path):
        normalized = os.path.normpath(input_path)
        real_path = os.path.realpath(normalized)
        
        # 安全检查：确保路径在工作目录内
        if not real_path.startswith(real_workspace):
            raise ValueError(f"访问被拒绝：路径超出工作范围")
        
        return normalized
    
    # 处理相对路径：移除可能的 workspace 前缀
    workspace_name = os.path.basename(workspace_root)
    workspace_prefixes = [
        workspace_name + os.sep,
        workspace_name,
        os.sep + workspace_name + os.sep,
        os.sep + workspace_name
    ]
    
    for prefix in workspace_prefixes:
        if input_path == prefix.rstrip(os.sep) or input_path.startswith(prefix):
            input_path = input_path[len(prefix):]
            break
    
    # 移除可能残留的前导分隔符后拼接工作目录
    input_path = input_path.lstrip(os.sep)
    normalized = os.path.normpath(os.path.join(workspace_root, input_path))
    
    # 安全检查：防止路径穿越攻击（如 ../../../etc/passwd）
    real_path = os.path.realpath(normalized)
    
    if not real_path.startswith(real_workspace):
        raise ValueError(f"访问被拒绝：路径超出工作范围")
    
    return normalized


@app.route('/')
def index():
    """渲染主页面"""
    return render_template('index.html')


@app.route('/api/workspace/status', methods=['GET'])
def workspace_status():
    """查询当前工作目录状态"""
    workspace_root = get_workspace_root()
    if workspace_root:
        return jsonify({
            'success': True,
            'data': {
                'workspace': workspace_root,
                'name': os.path.basename(workspace_root),
                'configured': True
            }
        })
    else:
        return jsonify({
            'success': True,
            'data': {
                'workspace': None,
                'name': None,
                'configured': False
            }
        })


@app.route('/api/workspace/set', methods=['POST'])
def set_workspace():
    """
    设置工作目录（项目文件夹）
    接受用户输入的绝对路径，验证后设为当前工作目录
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '请求体为空'}), 400
        
        raw_path = data.get('path', '').strip()
        if not raw_path:
            return jsonify({'error': '请输入项目文件夹路径'}), 400
        
        # 规范化路径
        normalized = os.path.normpath(raw_path.replace('/', os.sep).replace('\\', os.sep))
        
        # 验证路径是否存在且为目录
        if not os.path.exists(normalized):
            return jsonify({'error': f'路径不存在: {normalized}'}), 404
        
        if not os.path.isdir(normalized):
            return jsonify({'error': f'路径不是文件夹: {normalized}'}), 400
        
        # 检查读取权限
        if not os.access(normalized, os.R_OK):
            return jsonify({'error': f'无读取权限: {normalized}'}), 403
        
        # 设置工作目录
        set_workspace_root(normalized)
        
        logger.info(f"工作目录已设置: {normalized}")
        return jsonify({
            'success': True,
            'message': '工作目录设置成功',
            'data': {
                'workspace': normalized,
                'name': os.path.basename(normalized)
            }
        })
    
    except Exception as e:
        logger.error(f"设置工作目录失败: {str(e)}")
        return jsonify({'error': f'设置失败: {str(e)}'}), 500


@app.route('/api/workspace/browse', methods=['GET'])
def browse_directory():
    """
    浏览文件系统目录，用于辅助用户选择项目文件夹
    返回指定路径下的子目录列表
    """
    try:
        raw_path = request.args.get('path', '').strip()
        
        # 默认列出系统根目录或用户主目录
        if not raw_path:
            raw_path = os.path.expanduser('~')
        
        normalized = os.path.normpath(raw_path.replace('/', os.sep).replace('\\', os.sep))
        
        if not os.path.exists(normalized) or not os.path.isdir(normalized):
            return jsonify({'error': '路径不存在或不是文件夹'}), 404
        
        if not os.access(normalized, os.R_OK):
            return jsonify({'error': '无读取权限'}), 403
        
        # 只返回目录，不返回文件
        directories = []
        try:
            items = sorted(os.listdir(normalized))
            for item in items:
                # 跳过隐藏文件和系统文件
                if item.startswith('.') or item in ['$RECYCLE.BIN', 'System Volume Information']:
                    continue
                full_path = os.path.join(normalized, item)
                if os.path.isdir(full_path):
                    # 检查是否可读
                    readable = os.access(full_path, os.R_OK)
                    directories.append({
                        'name': item,
                        'path': full_path,
                        'readable': readable
                    })
        except PermissionError:
            pass
        
        # 返回当前路径和父路径（用于导航）
        parent_path = os.path.dirname(normalized)
        if parent_path == normalized:
            parent_path = None
        
        return jsonify({
            'success': True,
            'data': {
                'currentPath': normalized,
                'parentPath': parent_path,
                'directories': directories
            }
        })
    
    except Exception as e:
        logger.error(f"浏览目录失败: {str(e)}")
        return jsonify({'error': f'浏览失败: {str(e)}'}), 500


@app.route('/api/files', methods=['GET'])
def get_files():
    """
    获取文件树结构
    支持参数: path (可选，指定目录路径)
    """
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置，请先选择项目文件夹', 'needWorkspace': True}), 400
        
        raw_path = request.args.get('path') or workspace_root
        path = normalize_path(raw_path)
        
        if not os.path.exists(path):
            return jsonify({'error': '路径不存在'}), 404
        
        file_tree = build_file_tree(path)
        return jsonify({'success': True, 'data': file_tree})
    
    except ValueError as e:
        # 工作目录未设置的情况
        if '工作目录未设置' in str(e):
            return jsonify({'error': str(e), 'needWorkspace': True}), 400
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"获取文件列表失败: {str(e)}")
        return jsonify({'error': f'服务器错误: {str(e)}'}), 500


def build_file_tree(root_path, max_depth=3, current_depth=0):
    """
    递归构建文件树结构
    
    性能优化：
    - 限制递归深度，防止性能问题
    - 限制子项数量，防止内存溢出
    - 跳过特殊目录
    
    Args:
        root_path: 根目录路径
        max_depth: 最大递归深度（默认3层）
        current_depth: 当前递归深度
    
    Returns:
        list: 文件树结构
    """
    tree = []
    
    # 深度限制检查
    if current_depth >= max_depth:
        return tree
    
    try:
        items = sorted(os.listdir(root_path))
        # 限制顶级目录项数量，防止性能问题
        max_items = 100 if current_depth == 0 else 50
        items = items[:max_items]
        
        for item in items:
            full_path = os.path.join(root_path, item)
            
            # 跳过隐藏文件和特殊目录
            if item.startswith('.') or item in ['__pycache__', 'node_modules', '.git', '.svn', '.hg', 'venv', 'env', '.venv', '.env']:
                continue
            
            # 跳过无法访问的目录
            if os.path.isdir(full_path) and not os.access(full_path, os.R_OK):
                continue
            
            item_info = {
                'name': item,
                'path': full_path,
                'type': 'directory' if os.path.isdir(full_path) else 'file'
            }
            
            # 如果是目录且未达到最大深度，递归获取子项
            if os.path.isdir(full_path) and current_depth < max_depth - 1:
                item_info['children'] = []
                try:
                    sub_items = sorted(os.listdir(full_path))[:30]  # 限制子项数量
                    for sub_item in sub_items:
                        if sub_item.startswith('.'):
                            continue
                        sub_full_path = os.path.join(full_path, sub_item)
                        
                        # 跳过无法访问的文件/目录
                        if not os.access(sub_full_path, os.R_OK):
                            continue
                        
                        item_info['children'].append({
                            'name': sub_item,
                            'path': sub_full_path,
                            'type': 'directory' if os.path.isdir(sub_full_path) else 'file'
                        })
                except PermissionError:
                    logger.warning(f"无权限访问目录: {full_path}")
                except Exception as e:
                    logger.warning(f"读取子目录失败: {full_path}, 错误: {str(e)}")
            
            tree.append(item_info)
    except PermissionError:
        logger.warning(f"无权限访问目录: {root_path}")
    except Exception as e:
        logger.error(f"构建文件树失败: {root_path}, 错误: {str(e)}")
    
    return tree


@app.route('/api/file/read', methods=['GET'])
def read_file():
    """读取文件内容"""
    try:
        raw_path = request.args.get('path')
        if not raw_path:
            return jsonify({'error': '缺少文件路径参数'}), 400
        
        file_path = normalize_path(raw_path)
        
        if not os.path.exists(file_path):
            return jsonify({'error': '文件不存在'}), 404
        
        # 限制文件大小（最大5MB）
        file_size = os.path.getsize(file_path)
        if file_size > 5 * 1024 * 1024:
            return jsonify({'error': '文件过大，无法打开'}), 413
        
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        logger.info(f"成功读取文件: {file_path}")
        return jsonify({
            'success': True,
            'data': {
                'path': file_path,
                'content': content,
                'size': file_size
            }
        })
    
    except Exception as e:
        logger.error(f"读取文件失败: {str(e)}")
        return jsonify({'error': f'读取失败: {str(e)}'}), 500


@app.route('/api/file/write', methods=['POST'])
def write_file():
    """写入/保存文件内容"""
    try:
        data = request.get_json()
        raw_path = data.get('path')
        content = data.get('content')
        
        if not raw_path or content is None:
            return jsonify({'error': '缺少必要参数'}), 400
        
        file_path = normalize_path(raw_path)
        
        # 跳过虚拟标签页的保存
        if 'virtual' in file_path.lower():
            return jsonify({'success': True})
        
        # 确保目录存在
        dir_path = os.path.dirname(file_path)
        if not os.path.exists(dir_path):
            os.makedirs(dir_path)
        
        # 写入文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        logger.info(f"成功保存文件: {file_path}")
        return jsonify({'success': True, 'message': '保存成功'})
    
    except Exception as e:
        logger.error(f"保存文件失败: {str(e)}")
        return jsonify({'error': f'保存失败: {str(e)}'}), 500


@app.route('/api/file/create', methods=['POST'])
def create_file():
    """创建新文件或文件夹"""
    try:
        data = request.get_json()
        if not data:
            logger.error("创建失败: 请求体为空")
            return jsonify({'error': '请求体为空'}), 400
        
        name = data.get('name')
        file_type = data.get('type')  # 'file' 或 'directory'
        raw_parent_path = data.get('parentPath')
        
        # 验证必要参数
        if not name:
            logger.error("创建失败: 缺少文件名")
            return jsonify({'error': '缺少文件名'}), 400
        
        if not file_type:
            logger.error("创建失败: 缺少类型参数")
            return jsonify({'error': '缺少类型参数'}), 400
        
        # 处理父路径：空字符串或 None 都使用工作目录
        workspace_root = get_workspace_root()
        if not raw_parent_path:
            if not workspace_root:
                return jsonify({'error': '工作目录未设置，请先选择项目文件夹'}), 400
            raw_parent_path = workspace_root
            logger.info(f"使用当前工作目录: {workspace_root}")
        
        # 规范化父路径
        parent_path = normalize_path(raw_parent_path)
        logger.info(f"规范化后的父路径: {parent_path}")
        
        # 验证父路径是否存在
        if not os.path.exists(parent_path):
            logger.error(f"创建失败: 父路径不存在 - {parent_path}")
            return jsonify({'error': f'父路径不存在: {parent_path}'}), 404
        
        # 构建新路径
        new_path = os.path.join(parent_path, name)
        logger.info(f"准备创建: {new_path}")
        
        # 检查是否已存在
        if os.path.exists(new_path):
            logger.warning(f"创建失败: 已存在同名项目 - {new_path}")
            return jsonify({'error': '已存在同名项目'}), 409
        
        # 执行创建操作
        if file_type == 'directory':
            os.makedirs(new_path)
            logger.info(f"成功创建文件夹: {new_path}")
        else:
            # 确保父目录存在
            os.makedirs(parent_path, exist_ok=True)
            with open(new_path, 'w', encoding='utf-8') as f:
                f.write('')
            logger.info(f"成功创建文件: {new_path}")
        
        return jsonify({
            'success': True, 
            'message': f'{file_type} 创建成功',
            'path': new_path
        })
    
    except ValueError as e:
        logger.error(f"路径验证失败: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except PermissionError as e:
        logger.error(f"权限不足: {str(e)}")
        return jsonify({'error': f'权限不足: {str(e)}'}), 403
    except Exception as e:
        logger.error(f"创建失败: {str(e)}", exc_info=True)
        return jsonify({'error': f'创建失败: {str(e)}'}), 500


@app.route('/api/file/delete', methods=['DELETE'])
def delete_file():
    """删除文件或文件夹"""
    try:
        raw_path = request.args.get('path')
        if not raw_path:
            return jsonify({'error': '缺少路径参数'}), 400
        
        file_path = normalize_path(raw_path)
        
        if not os.path.exists(file_path):
            return jsonify({'error': '项目不存在'}), 404
        
        if os.path.isdir(file_path):
            import shutil
            shutil.rmtree(file_path)
        else:
            os.remove(file_path)
        
        logger.info(f"删除成功: {file_path}")
        return jsonify({'success': True, 'message': '删除成功'})
    
    except Exception as e:
        logger.error(f"删除失败: {str(e)}")
        return jsonify({'error': f'删除失败: {str(e)}'}), 500


@app.route('/api/file/rename', methods=['PUT'])
def rename_file():
    """重命名文件或文件夹"""
    try:
        data = request.get_json()
        raw_old_path = data.get('oldPath')
        new_name = data.get('newName')
        
        if not raw_old_path or not new_name:
            return jsonify({'error': '缺少必要参数'}), 400
        
        old_path = normalize_path(raw_old_path)
        
        dir_path = os.path.dirname(old_path)
        new_path = os.path.join(dir_path, new_name)
        
        if os.path.exists(new_path):
            return jsonify({'error': '目标名称已存在'}), 409
        
        os.rename(old_path, new_path)
        logger.info(f"重命名: {old_path} -> {new_path}")
        return jsonify({'success': True, 'message': '重命名成功'})
    
    except Exception as e:
        logger.error(f"重命名失败: {str(e)}")
        return jsonify({'error': f'重命名失败: {str(e)}'}), 500


@app.route('/api/file/run', methods=['POST'])
def run_file():
    """
    运行文件
    根据文件类型执行相应的运行命令
    
    安全改进：
    - 使用列表形式传递命令参数，避免 shell 注入
    - 验证命令是否在允许列表中
    - 限制可执行的命令类型
    """
    # 允许的运行命令白名单
    ALLOWED_COMMANDS = {
        'python': ['python', 'python3'],
        'node': ['node', 'nodejs'],
        'ts-node': ['ts-node'],
        'go run': ['go'],
        'ruby': ['ruby'],
        'php': ['php'],
        'lua': ['lua'],
        'java': ['java'],
        'gcc': ['gcc'],
        'g++': ['g++'],
        'rustc': ['rustc'],
        'bash': ['bash'],
        'sh': ['sh'],
        'powershell': ['powershell'],
        'cmd': ['cmd'],
        'start': ['start'],  # Windows 打开文件
        'open': ['open'],    # macOS 打开文件
        'xdg-open': ['xdg-open']  # Linux 打开文件
    }
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '请求体为空'}), 400
        
        raw_path = data.get('path')
        command = data.get('command', '')
        
        if not raw_path:
            return jsonify({'error': '缺少文件路径参数'}), 400
        
        # 直接使用文件路径，不依赖于工作目录设置
        # 安全检查：确保路径是有效的文件路径
        if not os.path.isabs(raw_path):
            # 如果是相对路径，使用当前目录
            raw_path = os.path.abspath(raw_path)
        
        file_path = raw_path
        
        if not os.path.exists(file_path):
            return jsonify({'error': '文件不存在'}), 404
        
        if not os.path.isfile(file_path):
            return jsonify({'error': '路径不是文件'}), 400
        
        # 获取文件扩展名
        _, ext = os.path.splitext(file_path)
        ext = ext.lower()
        
        # HTML 文件用默认浏览器打开（安全方式）
        if ext in ['.html', '.htm']:
            try:
                if os.name == 'nt':  # Windows
                    # 使用列表形式，避免 shell 注入
                    subprocess.Popen(['cmd', '/c', 'start', '', file_path], shell=False)
                elif sys.platform == 'darwin':  # macOS
                    subprocess.Popen(['open', file_path], shell=False)
                else:  # Linux
                    subprocess.Popen(['xdg-open', file_path], shell=False)
                
                logger.info(f"在浏览器中打开: {file_path}")
                return jsonify({
                    'success': True,
                    'message': '已在浏览器中打开',
                    'output': ''
                })
            except Exception as e:
                logger.error(f"打开浏览器失败: {str(e)}")
                return jsonify({'error': f'打开浏览器失败: {str(e)}'}), 500
        
        # 其他文件类型需要验证命令
        if not command:
            return jsonify({'error': f'不支持的文件类型: {ext}，请指定运行命令'}), 400
        
        # 安全检查：验证命令是否在白名单中
        command_base = command.split()[0] if ' ' in command else command
        is_allowed = False
        for cmd_name, cmd_variants in ALLOWED_COMMANDS.items():
            if command_base in cmd_variants or command == cmd_name:
                is_allowed = True
                break
        
        if not is_allowed:
            logger.warning(f"拒绝执行未授权命令: {command}")
            return jsonify({'error': f'不允许执行的命令: {command_base}'}), 403
        
        # 使用列表形式构建命令，避免 shell 注入
        if ' ' not in command:
            cmd_list = [command, file_path]
        else:
            cmd_parts = command.split()
            cmd_parts.append(file_path)
            cmd_list = cmd_parts
        
        # 同步执行命令并捕获输出
        try:
            # 使用文件所在目录作为工作目录
            cwd = os.path.dirname(file_path)
            
            result = subprocess.run(
                cmd_list,
                shell=False,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=60,
                encoding='utf-8',
                errors='replace'
            )
            
            output = result.stdout
            if result.stderr:
                output += '\n' + result.stderr
            
            # 输出长度限制
            max_output_length = 50000
            if len(output) > max_output_length:
                output = output[:max_output_length] + '\n... (输出已截断)'
            
            success = result.returncode == 0
            logger.info(f"运行文件: {' '.join(cmd_list)}, 返回码: {result.returncode}")
            
            return jsonify({
                'success': True,
                'output': output.strip() if output.strip() else '(命令执行完成，无输出)',
                'returnCode': result.returncode,
                'command': ' '.join(cmd_list)
            })
        except subprocess.TimeoutExpired:
            logger.warning(f"运行文件超时: {' '.join(cmd_list)}")
            return jsonify({'error': '运行超时（60秒）', 'success': False}), 408
        except FileNotFoundError:
            return jsonify({'error': f'命令未找到: {command_base}，请确保已安装相关环境'}), 404
        except PermissionError:
            return jsonify({'error': f'权限不足，无法执行命令'}), 403
    
    except Exception as e:
        logger.error(f"运行文件失败: {str(e)}")
        return jsonify({'error': f'运行失败: {str(e)}'}), 500


# ========== 终端 API ==========
# 终端会话状态：存储每个终端的工作目录
_terminal_sessions = {}

def _get_display_dir(cwd, workspace_root):
    """生成终端显示的目录路径"""
    try:
        display_dir = os.path.relpath(cwd, os.path.dirname(workspace_root))
        if display_dir == '.' or display_dir.startswith('..'):
            display_dir = os.path.basename(cwd) or cwd
    except ValueError:
        display_dir = os.path.basename(cwd) or cwd
    return display_dir

def _get_terminal_cwd(session_id):
    """获取终端会话的当前工作目录"""
    if session_id and session_id in _terminal_sessions:
        return _terminal_sessions[session_id]
    return None

def _set_terminal_cwd(session_id, cwd):
    """设置终端会话的当前工作目录"""
    if session_id:
        _terminal_sessions[session_id] = cwd

@app.route('/api/terminal/execute', methods=['POST'])
def terminal_execute():
    """
    执行终端命令
    在工作目录中执行命令并返回结果
    
    改进：
    - 支持 cd 命令切换目录
    - 支持 cwd 参数传递当前工作目录
    - 会话状态保持工作目录
    - Windows 兼容性改进
    - 合理的危险命令过滤
    """
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        data = request.get_json()
        if not data:
            return jsonify({'error': '请求体为空', 'success': False}), 400
        
        command = data.get('command', '').strip()
        session_id = data.get('sessionId', 'default')
        request_cwd = data.get('cwd', '').strip()
        
        if not command:
            return jsonify({'error': '命令为空', 'success': False}), 400
        
        # 确定当前工作目录：优先使用请求中的cwd，其次使用会话记录，最后使用workspace根目录
        current_cwd = workspace_root
        if request_cwd and os.path.isdir(request_cwd):
            current_cwd = request_cwd
        else:
            session_cwd = _get_terminal_cwd(session_id)
            if session_cwd and os.path.isdir(session_cwd):
                current_cwd = session_cwd
        
        # 安全检查：确保工作目录有效
        try:
            abs_cwd = os.path.abspath(current_cwd)
            if not os.path.isdir(abs_cwd):
                current_cwd = workspace_root
        except Exception:
            current_cwd = workspace_root
        
        # 命令长度限制
        if len(command) > 1000:
            return jsonify({'error': '命令过长，最大允许1000字符', 'success': False}), 400
        
        # 处理 pwd 命令（内置命令）
        if command.strip().lower() == 'pwd':
            display_dir = _get_display_dir(current_cwd, workspace_root)
            return jsonify({
                'success': True,
                'output': current_cwd,
                'cwd': current_cwd,
                'displayDir': display_dir
            })
        
        # 处理 cd 命令（内置命令，不发送到shell）
        cmd_stripped = command.strip()
        if cmd_stripped.lower().startswith('cd ') or cmd_stripped.lower() == 'cd':
            target_dir = cmd_stripped[3:].strip() if len(cmd_stripped) > 2 else ''
            # 去除可能的引号
            target_dir = target_dir.strip('"').strip("'")
            
            if not target_dir:
                # cd 无参数 -> 回到workspace根目录
                new_cwd = workspace_root
            elif os.path.isabs(target_dir):
                # 绝对路径
                if os.path.isdir(target_dir):
                    new_cwd = os.path.normpath(target_dir)
                else:
                    display_dir = _get_display_dir(current_cwd, workspace_root)
                    return jsonify({
                        'success': False,
                        'error': f'目录不存在: {target_dir}',
                        'cwd': current_cwd,
                        'displayDir': display_dir
                    })
            else:
                # 相对路径（包括 .., ../.., 等）
                candidate = os.path.normpath(os.path.join(current_cwd, target_dir))
                if os.path.isdir(candidate):
                    new_cwd = candidate
                else:
                    display_dir = _get_display_dir(current_cwd, workspace_root)
                    return jsonify({
                        'success': False,
                        'error': f'目录不存在: {target_dir}',
                        'cwd': current_cwd,
                        'displayDir': display_dir
                    })
            
            # 安全检查：确保新目录存在且合理
            try:
                abs_new = os.path.abspath(new_cwd)
                if not os.path.isdir(abs_new):
                    new_cwd = current_cwd
            except Exception:
                new_cwd = workspace_root
            
            _set_terminal_cwd(session_id, new_cwd)
            display_dir = _get_display_dir(new_cwd, workspace_root)
            
            return jsonify({
                'success': True,
                'output': '',
                'cwd': new_cwd,
                'displayDir': display_dir
            })
        
        # 安全检查：禁止危险命令
        dangerous_patterns = [
            'rm -rf', 'rm -r /', 'del /s /q', 'rmdir /s /q',
            'format', 'mkfs', 'fdisk',
            'shutdown', 'reboot', 'halt', 'poweroff',
            'sudo rm', 'chmod 777 /',
            'reg delete', 'bcdedit',
            'net user', 'net localgroup',
            ':(){ :|:& };:',
        ]
        
        command_lower = command.lower()
        for dangerous in dangerous_patterns:
            if dangerous.lower() in command_lower:
                logger.warning(f"拒绝执行危险命令: {command}")
                display_dir = _get_display_dir(current_cwd, workspace_root)
                
                return jsonify({
                    'error': '禁止执行危险命令',
                    'success': False,
                    'cwd': current_cwd,
                    'displayDir': display_dir
                }), 403
        
        # 执行命令
        try:
            if os.name == 'nt':
                # Windows: 使用 cmd /c 并设置 UTF-8 代码页
                exec_cmd = f'chcp 65001 >nul 2>&1 && {command}'
            else:
                exec_cmd = command
            
            result = subprocess.run(
                exec_cmd,
                shell=True,
                cwd=current_cwd,
                capture_output=True,
                text=True,
                timeout=30,
                encoding='utf-8',
                errors='replace'
            )
            
            output = result.stdout
            if result.stderr:
                if output:
                    output += '\n' + result.stderr
                else:
                    output = result.stderr
            
            # 输出长度限制
            max_output_length = 50000
            if len(output) > max_output_length:
                output = output[:max_output_length] + '\n... (输出已截断)'
            
            display_dir = _get_display_dir(current_cwd, workspace_root)
            
            return jsonify({
                'success': result.returncode == 0,
                'output': output.strip() if output.strip() else '(命令执行完成，无输出)',
                'returnCode': result.returncode,
                'cwd': current_cwd,
                'displayDir': display_dir
            })
            
        except subprocess.TimeoutExpired:
            logger.warning(f"命令执行超时: {command}")
            display_dir = _get_display_dir(current_cwd, workspace_root)
            
            return jsonify({
                'error': '命令执行超时（30秒）',
                'success': False,
                'cwd': current_cwd,
                'displayDir': display_dir
            }), 408
        except FileNotFoundError:
            display_dir = _get_display_dir(current_cwd, workspace_root)
            
            return jsonify({
                'error': '命令未找到',
                'success': False,
                'cwd': current_cwd,
                'displayDir': display_dir
            }), 404
        except PermissionError:
            display_dir = _get_display_dir(current_cwd, workspace_root)
            
            return jsonify({
                'error': '权限不足',
                'success': False,
                'cwd': current_cwd,
                'displayDir': display_dir
            }), 403
        except Exception as e:
            logger.error(f"命令执行失败: {str(e)}")
            display_dir = _get_display_dir(current_cwd, workspace_root)
            
            return jsonify({
                'error': f'执行失败: {str(e)}',
                'success': False,
                'cwd': current_cwd,
                'displayDir': display_dir
            }), 500
            
    except ValueError as e:
        logger.error(f"参数验证失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 400
    except Exception as e:
        logger.error(f"终端执行失败: {str(e)}")
        return jsonify({'error': f'执行失败: {str(e)}', 'success': False}), 500


# ========== PTY 终端系统 (WebSocket + pywinpty) ==========
try:
    import winpty
    HAS_WINPTY = True
except ImportError:
    HAS_WINPTY = False
    logger.warning("pywinpty 未安装，交互式终端不可用，将回退到 subprocess 模式")

# PTY 进程管理
_pty_processes = {}  # sid -> { process, read_thread, alive }
_pty_lock = threading.Lock()


def _kill_pty_process(pty_process):
    """安全终止 PTY 进程"""
    try:
        if hasattr(pty_process, 'cancel_io'):
            pty_process.cancel_io()
    except Exception:
        pass
    try:
        if hasattr(pty_process, 'isalive') and pty_process.isalive():
            # 通过 PID 终止进程
            pid = getattr(pty_process, 'pid', None)
            if pid:
                try:
                    import signal
                    os.kill(pid, signal.SIGTERM)
                except Exception:
                    try:
                        subprocess.run(['taskkill', '/F', '/PID', str(pid)],
                                      capture_output=True, timeout=5)
                    except Exception:
                        pass
    except Exception:
        pass


def _read_pty_output(sid, pty_process):
    """在后台线程中持续读取 PTY 输出并通过 WebSocket 推送"""
    try:
        while _pty_processes.get(sid, {}).get('alive', False):
            try:
                # 检查进程是否仍然存活
                if hasattr(pty_process, 'isalive') and not pty_process.isalive():
                    break
                data = pty_process.read(4096)
                if data:
                    socketio.emit('terminal_output', {'data': data}, room=sid)
                else:
                    # 无数据时短暂休眠避免 CPU 空转
                    socketio.sleep(0.01)
            except EOFError:
                # PTY 已关闭
                break
            except OSError:
                # PTY I/O 错误，进程可能已退出
                break
            except Exception as e:
                # 其他读取错误
                error_str = str(e)
                if 'EOF' in error_str or 'closed' in error_str.lower():
                    break
                # 短暂休眠后重试
                socketio.sleep(0.01)
    except Exception as e:
        logger.error(f"PTY 读取线程异常: {str(e)}")
    finally:
        # 进程退出，通知前端
        with _pty_lock:
            if sid in _pty_processes:
                _pty_processes[sid]['alive'] = False
        try:
            socketio.emit('terminal_exit', {'message': '进程已退出'}, room=sid)
        except Exception:
            pass


@socketio.on('connect')
def handle_connect():
    """WebSocket 连接建立"""
    logger.info(f"WebSocket 客户端连接: {request.sid}")


@socketio.on('disconnect')
def handle_disconnect():
    """WebSocket 连接断开，清理 PTY 进程"""
    sid = request.sid
    logger.info(f"WebSocket 客户端断开: {sid}")
    with _pty_lock:
        if sid in _pty_processes:
            _pty_processes[sid]['alive'] = False
            try:
                _pty_processes[sid]['process'].close()
            except Exception:
                pass
            del _pty_processes[sid]


@socketio.on('terminal_create')
def handle_terminal_create(data):
    """创建新的 PTY 终端会话"""
    sid = request.sid
    workspace_root = get_workspace_root()
    cwd = data.get('cwd', '') if data else ''
    
    if not cwd or not os.path.isdir(cwd):
        cwd = workspace_root or os.path.expanduser('~')
    
    if not HAS_WINPTY:
        emit('terminal_error', {'message': 'pywinpty 未安装，交互式终端不可用'})
        return
    
    # 清理该会话之前的 PTY 进程
    with _pty_lock:
        if sid in _pty_processes:
            _pty_processes[sid]['alive'] = False
            try:
                _pty_processes[sid]['process'].close()
            except Exception:
                pass
            del _pty_processes[sid]
    
    try:
        # 使用 winpty 创建 PTY 进程
        if os.name == 'nt':
            # Windows: 启动 cmd.exe
            pty_process = winpty.PTY(80, 24)
            pty_process.spawn(r'cmd.exe', cwd=cwd)
        else:
            # Unix: 使用 pty 模块
            import pty as unix_pty
            import fcntl
            import termios
            import struct
            
            master_fd, slave_fd = unix_pty.openpty()
            # 设置终端大小
            winsize = struct.pack('HHHH', 24, 80, 0, 0)
            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
            
            proc = subprocess.Popen(
                ['/bin/bash'],
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                cwd=cwd,
                close_fds=True
            )
            os.close(slave_fd)
            
            # 为 Unix 创建一个兼容的 PTY 对象
            class UnixPTY:
                def __init__(self, master_fd, proc):
                    self.master_fd = master_fd
                    self.proc = proc
                
                def read(self, size=4096):
                    try:
                        return os.read(self.master_fd, size).decode('utf-8', errors='replace')
                    except Exception:
                        return ''
                
                def write(self, data):
                    try:
                        os.write(self.master_fd, data.encode('utf-8'))
                    except Exception:
                        pass
                
                def close(self):
                    try:
                        os.close(self.master_fd)
                    except Exception:
                        pass
                    try:
                        self.proc.terminate()
                    except Exception:
                        pass
                
                def set_size(self, rows, cols):
                    try:
                        winsize = struct.pack('HHHH', rows, cols, 0, 0)
                        fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
                    except Exception:
                        pass
            
            pty_process = UnixPTY(master_fd, proc)
        
        with _pty_lock:
            _pty_processes[sid] = {
                'process': pty_process,
                'alive': True
            }
        
        # 启动后台读取线程
        read_thread = threading.Thread(
            target=_read_pty_output,
            args=(sid, pty_process),
            daemon=True
        )
        read_thread.start()
        _pty_processes[sid]['read_thread'] = read_thread
        
        emit('terminal_created', {'cwd': cwd})
        logger.info(f"PTY 终端已创建: {sid}, cwd={cwd}")
        
    except Exception as e:
        logger.error(f"创建 PTY 终端失败: {str(e)}")
        emit('terminal_error', {'message': f'创建终端失败: {str(e)}'})


@socketio.on('terminal_input')
def handle_terminal_input(data):
    """接收终端输入并发送到 PTY 进程"""
    sid = request.sid
    input_data = data.get('data', '') if data else ''
    
    with _pty_lock:
        if sid in _pty_processes and _pty_processes[sid]['alive']:
            try:
                _pty_processes[sid]['process'].write(input_data)
            except Exception as e:
                logger.error(f"写入 PTY 失败: {str(e)}")


@socketio.on('terminal_resize')
def handle_terminal_resize(data):
    """调整终端大小"""
    sid = request.sid
    cols = data.get('cols', 80) if data else 80
    rows = data.get('rows', 24) if data else 24
    
    with _pty_lock:
        if sid in _pty_processes and _pty_processes[sid]['alive']:
            try:
                _pty_processes[sid]['process'].set_size(rows, cols)
            except Exception as e:
                logger.error(f"调整终端大小失败: {str(e)}")


@socketio.on('terminal_kill')
def handle_terminal_kill():
    """终止 PTY 进程"""
    sid = request.sid
    with _pty_lock:
        if sid in _pty_processes:
            _pty_processes[sid]['alive'] = False
            try:
                _pty_processes[sid]['process'].close()
            except Exception:
                pass
            del _pty_processes[sid]
    emit('terminal_exit', {'message': '终端已终止'})
    logger.info(f"PTY 终端已终止: {sid}")


# ========== Git API ==========
@app.route('/api/git/status', methods=['GET'])
def git_status():
    """获取Git仓库状态"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        # 检查是否是Git仓库
        git_dir = os.path.join(workspace_root, '.git')
        if not os.path.exists(git_dir):
            return jsonify({
                'success': True,
                'data': {
                    'isRepo': False,
                    'message': '当前目录不是Git仓库'
                }
            })
        
        # 获取状态
        result = subprocess.run(
            ['git', 'status', '--porcelain', '-b'],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        # 获取当前分支
        branch_result = subprocess.run(
            ['git', 'branch', '--show-current'],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        current_branch = branch_result.stdout.strip()
        
        # 获取远程分支
        remote_result = subprocess.run(
            ['git', 'remote', '-v'],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        # 解析状态
        lines = result.stdout.strip().split('\n') if result.stdout.strip() else []
        changes = []
        for line in lines:
            if line.startswith('##'):
                continue
            if len(line) >= 3:
                status = line[:2].strip()
                file_path = line[3:].strip()
                changes.append({
                    'status': status,
                    'file': file_path
                })
        
        return jsonify({
            'success': True,
            'data': {
                'isRepo': True,
                'branch': current_branch or 'main',
                'remote': remote_result.stdout.strip().split('\n')[0] if remote_result.stdout.strip() else '',
                'changes': changes,
                'clean': len(changes) == 0
            }
        })
        
    except Exception as e:
        logger.error(f"Git状态获取失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/git/log', methods=['GET'])
def git_log():
    """获取Git提交历史"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        limit = request.args.get('limit', 20, type=int)
        
        result = subprocess.run(
            ['git', 'log', f'-{limit}', '--pretty=format:%H|%h|%an|%ae|%ad|%s', '--date=iso'],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        if result.returncode != 0:
            return jsonify({
                'success': True,
                'data': {
                    'commits': [],
                    'message': '无法获取提交历史'
                }
            })
        
        commits = []
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split('|', 5)
                if len(parts) == 6:
                    commits.append({
                        'hash': parts[0],
                        'shortHash': parts[1],
                        'author': parts[2],
                        'email': parts[3],
                        'date': parts[4],
                        'message': parts[5]
                    })
        
        return jsonify({
            'success': True,
            'data': {
                'commits': commits
            }
        })
        
    except Exception as e:
        logger.error(f"Git日志获取失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/git/init', methods=['POST'])
def git_init():
    """初始化Git仓库"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        result = subprocess.run(
            ['git', 'init'],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr, 'success': False}), 500
        
        return jsonify({
            'success': True,
            'message': 'Git仓库初始化成功',
            'output': result.stdout
        })
        
    except Exception as e:
        logger.error(f"Git初始化失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/git/add', methods=['POST'])
def git_add():
    """添加文件到暂存区"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        data = request.get_json()
        files = data.get('files', ['.'])  # 默认添加所有文件
        
        cmd = ['git', 'add'] + files
        result = subprocess.run(
            cmd,
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr, 'success': False}), 500
        
        return jsonify({
            'success': True,
            'message': '文件已添加到暂存区',
            'output': result.stdout
        })
        
    except Exception as e:
        logger.error(f"Git添加失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/git/commit', methods=['POST'])
def git_commit():
    """提交更改"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        data = request.get_json()
        message = data.get('message', '').strip()
        
        if not message:
            return jsonify({'error': '请输入提交信息', 'success': False}), 400
        
        result = subprocess.run(
            ['git', 'commit', '-m', message],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr, 'success': False}), 500
        
        return jsonify({
            'success': True,
            'message': '提交成功',
            'output': result.stdout
        })
        
    except Exception as e:
        logger.error(f"Git提交失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/git/push', methods=['POST'])
def git_push():
    """推送到远程仓库"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        data = request.get_json()
        remote = data.get('remote', 'origin')
        branch = data.get('branch', '')
        
        cmd = ['git', 'push', remote]
        if branch:
            cmd.append(branch)
        
        result = subprocess.run(
            cmd,
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=60
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr, 'success': False}), 500
        
        return jsonify({
            'success': True,
            'message': '推送成功',
            'output': result.stdout
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({'error': '推送超时', 'success': False}), 408
    except Exception as e:
        logger.error(f"Git推送失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/git/pull', methods=['POST'])
def git_pull():
    """从远程仓库拉取"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        result = subprocess.run(
            ['git', 'pull'],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=60
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr, 'success': False}), 500
        
        return jsonify({
            'success': True,
            'message': '拉取成功',
            'output': result.stdout
        })
        
    except subprocess.TimeoutExpired:
        return jsonify({'error': '拉取超时', 'success': False}), 408
    except Exception as e:
        logger.error(f"Git拉取失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/git/branch', methods=['GET'])
def git_branch():
    """获取分支列表"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        result = subprocess.run(
            ['git', 'branch', '-a'],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        branches = []
        current_branch = None
        for line in result.stdout.strip().split('\n'):
            line = line.strip()
            if line:
                is_current = line.startswith('*')
                branch_name = line.lstrip('* ').strip()
                if is_current:
                    current_branch = branch_name
                branches.append({
                    'name': branch_name,
                    'current': is_current,
                    'remote': 'remotes/' in line
                })
        
        return jsonify({
            'success': True,
            'data': {
                'branches': branches,
                'currentBranch': current_branch
            }
        })
        
    except Exception as e:
        logger.error(f"Git分支获取失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/git/checkout', methods=['POST'])
def git_checkout():
    """切换分支"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        data = request.get_json()
        branch = data.get('branch', '').strip()
        
        if not branch:
            return jsonify({'error': '请指定分支名称', 'success': False}), 400
        
        result = subprocess.run(
            ['git', 'checkout', branch],
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr, 'success': False}), 500
        
        return jsonify({
            'success': True,
            'message': f'已切换到分支 {branch}',
            'output': result.stdout
        })
        
    except Exception as e:
        logger.error(f"Git切换分支失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


@app.route('/api/git/diff', methods=['GET'])
def git_diff():
    """获取文件差异"""
    try:
        workspace_root = get_workspace_root()
        if not workspace_root:
            return jsonify({'error': '工作目录未设置', 'success': False}), 400
        
        file_path = request.args.get('file', '')
        
        cmd = ['git', 'diff']
        if file_path:
            cmd.append(file_path)
        
        result = subprocess.run(
            cmd,
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace'
        )
        
        return jsonify({
            'success': True,
            'data': {
                'diff': result.stdout
            }
        })
        
    except Exception as e:
        logger.error(f"Git差异获取失败: {str(e)}")
        return jsonify({'error': str(e), 'success': False}), 500


if __name__ == '__main__':
    logger.info("FoxCode IDE 启动中...")
    print("\n" + "="*50)
    print("   FoxCode IDE - 简约手机代码编辑器")
    print("="*50)
    print(f"   访问地址: http://127.0.0.1:5000")
    print(f"   请在浏览器中选择项目文件夹")
    print("="*50 + "\n")
    
    socketio.run(app, host='127.0.0.1', port=5000, debug=True, allow_unsafe_werkzeug=True)
