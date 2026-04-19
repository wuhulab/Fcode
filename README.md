# FCode IDE

一个轻量、实用的 Web 代码编辑器，专为移动端优化。

## 特性

- **文件管理**：浏览、创建、编辑、删除、重命名文件和文件夹
- **代码编辑**：基于 Monaco Editor，支持多语言语法高亮
- **终端**：集成终端，支持 subprocess 和交互式 PTY 模式
- **Git 集成**：查看状态、提交历史、执行提交和推送
- **跨平台**：支持 Windows、macOS、Linux

## 技术栈

- **后端**：Flask + Flask-SocketIO
- **前端**：原生 HTML/CSS/JS + Monaco Editor + Socket.IO + xterm.js

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python app.py
```

访问 `http://localhost:5000`

## 项目结构

```
foxcode_ide/
├── app.py              # Flask 后端主程序
├── templates/
│   └── index.html    # 前端页面
├── static/
│   ├── css/style.css  # 样式
│   ├── js/app.js    # 前端逻辑
│   └── icons/       # 文件图标
└── workspace/       # 默认工作目录
```

## API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/files` | GET | 获取文件树 |
| `/api/file/read` | GET | 读取文件 |
| `/api/file/write` | POST | 保存文件 |
| `/api/file/create` | POST | 创建文件/目录 |
| `/api/file/delete` | DELETE | 删除文件 |
| `/api/file/run` | POST | 运行文件 |
| `/api/terminal/execute` | POST | 执行终端命令 |
| `/api/git/status` | GET | Git 状态 |
| `/api/git/commit` | POST | 提交更改 |
| `/api/git/push` | POST | 推送到远程 |

## 依赖

- Flask
- flask-socketio
- pywinpty (可选，用于交互式终端)