/**
 * FoxCode IDE - 主应用逻辑
 * 功能：Monaco Editor 集成、文件管理、终端、UI 交互
 */

// ========== 全局状态管理 ==========
const AppState = {
    editor: null,
    editorReady: false,
    currentFile: null,
    currentFileName: '',
    isModified: false,
    fileTreeData: [],
    contextMenuTarget: null,
    workspaceConfigured: false,
    workspacePath: null,
    browserCurrentPath: null,
    browserParentPath: null,
    openTabs: [],
    activeTabIndex: -1,
    virtualTabs: {
        settings: { name: '设置', icon: '⚙️', language: 'plaintext' },
        about: { name: '关于', icon: 'ℹ️', language: 'plaintext' },
        git: { name: 'Git', icon: '📦', language: 'plaintext' },
        terminal: { name: '终端', icon: '💻', language: 'plaintext' },
        browser: { name: '浏览器', icon: '🌐', language: 'plaintext' }
    },
    saveDebounceTimer: null,
    toastTimer: null,
    terminalState: {
        socket: null,
        xterm: null,
        fitAddon: null,
        ptyReady: false,
        cwd: '',
        displayDir: ''
    },
    languageMap: {
        '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
        '.py': 'python', '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.h': 'cpp',
        '.cs': 'csharp', '.go': 'go', '.rs': 'rust', '.rb': 'ruby', '.php': 'php',
        '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
        '.json': 'json', '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
        '.md': 'markdown', '.sql': 'sql', '.sh': 'shell', '.bash': 'shell',
        '.txt': 'plaintext', '.vue': 'html', '.svelte': 'html'
    },
    fileIcons: {
        directory: 'folder-icon', default: 'file-icon-default',
        '.js': 'file-icon-js', '.jsx': 'file-icon-js', '.ts': 'file-icon-ts', '.tsx': 'file-icon-ts',
        '.py': 'file-icon-py', '.html': 'file-icon-html', '.htm': 'file-icon-html',
        '.css': 'file-icon-css', '.scss': 'file-icon-sass', '.less': 'file-icon-sass',
        '.json': 'file-icon-json', '.md': 'file-icon-md', '.vue': 'file-icon-vue',
        '.gitignore': 'file-icon-git', '.java': 'file-icon-java', '.c': 'file-icon-cpp',
        '.cpp': 'file-icon-cpp', '.h': 'file-icon-cpp', '.hpp': 'file-icon-cpp',
        '.go': 'file-icon-go', '.rs': 'file-icon-rust', '.php': 'file-icon-php',
        '.rb': 'file-icon-ruby', '.sh': 'file-icon-shell', '.bash': 'file-icon-shell',
        '.sql': 'file-icon-sql', '.yaml': 'file-icon-yaml', '.yml': 'file-icon-yaml',
        '.xml': 'file-icon-xml', '.txt': 'file-icon-txt', '.png': 'file-icon-image',
        '.jpg': 'file-icon-image', '.jpeg': 'file-icon-image', '.gif': 'file-icon-image',
        '.svg': 'file-icon-image', '.ico': 'file-icon-image', '.config': 'file-icon-config',
        '.ini': 'file-icon-config', '.env': 'file-icon-config'
    },
    runCommands: {
        '.py': 'python', '.js': 'node', '.ts': 'ts-node',
        '.html': 'start', '.htm': 'start', '.bat': 'call', '.cmd': 'call',
        '.ps1': 'powershell -File', '.sh': 'bash', '.java': 'java',
        '.c': 'gcc', '.cpp': 'g++', '.go': 'go run', '.rs': 'rustc',
        '.php': 'php', '.rb': 'ruby', '.lua': 'lua', '.sql': 'sqlite3'
    }
};

// ========== DOM 元素引用 ==========
const DOM = {
    sidebar: document.getElementById('sidebar'),
    sidebarResizeHandle: document.getElementById('sidebarResizeHandle'),
    toggleSidebarBtn: document.getElementById('toggleSidebar'),
    fileTree: document.getElementById('fileTree'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    workspacePicker: document.getElementById('workspacePicker'),
    workspacePathInput: document.getElementById('workspacePathInput'),
    workspaceBrowseBtn: document.getElementById('workspaceBrowseBtn'),
    workspaceConfirmBtn: document.getElementById('workspaceConfirmBtn'),
    workspaceError: document.getElementById('workspaceError'),
    directoryBrowser: document.getElementById('directoryBrowser'),
    browserBackBtn: document.getElementById('browserBackBtn'),
    browserCurrentPath: document.getElementById('browserCurrentPath'),
    browserList: document.getElementById('browserList'),
    workspaceRecent: document.getElementById('workspaceRecent'),
    recentList: document.getElementById('recentList'),
    monacoWrapper: document.getElementById('monacoWrapper'),
    monacoEditor: document.getElementById('monacoEditor'),
    currentFileName: document.getElementById('currentFileName'),
    runBtn: document.getElementById('runBtn'),
    saveAllBtn: document.getElementById('saveAllBtn'),
    newFileBtnSidebar: document.getElementById('newFileBtnSidebar'),
    newFolderBtn: document.getElementById('newFolderBtn'),
    statusbar: document.getElementById('statusbar'),
    cursorPosition: document.getElementById('cursorPosition'),
    languageMode: document.getElementById('languageMode'),
    encoding: document.getElementById('encoding'),
    contextMenu: document.getElementById('contextMenu'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalTitle: document.getElementById('modalTitle'),
    modalInput: document.getElementById('modalInput'),
    modalConfirm: document.getElementById('modalConfirm'),
    toast: document.getElementById('toast'),
    tabsBar: document.getElementById('tabsBar'),
    fileBtn: document.getElementById('fileBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    aboutBtn: document.getElementById('aboutBtn'),
    gitBtn: document.getElementById('gitBtn'),
    terminalBtn: document.getElementById('terminalBtn'),
    browserBtn: document.getElementById('browserBtn')
};

// ========== 初始化入口 ==========
document.addEventListener('DOMContentLoaded', function () {
    console.log('[FoxCode] 初始化中...');
    initMonacoEditor();
    bindEventListeners();
    checkWorkspaceStatus();
    console.log('[FoxCode] 初始化完成');
});

// ========== Monaco Editor 初始化 ==========
function initMonacoEditor() {
    require.config({
        paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
    });
    require(['vs/editor/editor.main'], function () {
        AppState.editor = monaco.editor.create(document.getElementById('monacoEditor'), {
            value: '',
            language: 'plaintext',
            theme: 'vs-dark',
            fontSize: 14,
            wordWrap: 'on',
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true }
        });
        AppState.editorReady = true;
        AppState.editor.onDidChangeModelContent(function () {
            if (AppState.activeTabIndex >= 0 && AppState.activeTabIndex < AppState.openTabs.length) {
                var tab = AppState.openTabs[AppState.activeTabIndex];
                if (!tab.isVirtual) {
                    tab.content = AppState.editor.getValue();
                    tab.isModified = true;
                    AppState.isModified = true;
                    updateRunButtonState();
                    updateTabsUI();
                }
            }
        });
        console.log('[FoxCode] Monaco Editor 初始化完成');
    });
}

// ========== 事件绑定 ==========
function bindEventListeners() {
    // 侧边栏切换
    if (DOM.toggleSidebarBtn) DOM.toggleSidebarBtn.addEventListener('click', toggleSidebar);
    // 运行按钮
    if (DOM.runBtn) DOM.runBtn.addEventListener('click', runCurrentFile);
    // 保存所有
    if (DOM.saveAllBtn) DOM.saveAllBtn.addEventListener('click', saveAllFiles);
    // 新建文件
    if (DOM.newFileBtnSidebar) DOM.newFileBtnSidebar.addEventListener('click', createNewFile);
    // 新建文件夹
    if (DOM.newFolderBtn) DOM.newFolderBtn.addEventListener('click', createNewFolder);
    // 工作目录
    if (DOM.workspaceConfirmBtn) DOM.workspaceConfirmBtn.addEventListener('click', setWorkspace);
    if (DOM.workspaceBrowseBtn) DOM.workspaceBrowseBtn.addEventListener('click', browseDirectory);
    if (DOM.workspacePathInput) {
        DOM.workspacePathInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') setWorkspace();
        });
    }
    // 目录浏览器
    if (DOM.browserBackBtn) DOM.browserBackBtn.addEventListener('click', browseDirectoryUp);
    // 模态框
    if (DOM.modalConfirm) DOM.modalConfirm.addEventListener('click', handleModalConfirm);
    if (DOM.modalInput) {
        DOM.modalInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') handleModalConfirm();
        });
    }
    // 底部栏按钮
    if (DOM.gitBtn) DOM.gitBtn.addEventListener('click', showGitPanel);
    if (DOM.terminalBtn) DOM.terminalBtn.addEventListener('click', showTerminal);
    if (DOM.browserBtn) DOM.browserBtn.addEventListener('click', showBrowser);
    if (DOM.settingsBtn) DOM.settingsBtn.addEventListener('click', showSettings);
    if (DOM.aboutBtn) DOM.aboutBtn.addEventListener('click', showAbout);
    if (DOM.fileBtn) DOM.fileBtn.addEventListener('click', showFileMenu);
    // 全局快捷键
    document.addEventListener('keydown', handleGlobalKeydown);
    // 全局点击关闭菜单
    document.addEventListener('click', function (e) {
        if (DOM.contextMenu && DOM.contextMenu.style.display !== 'none') {
            if (!DOM.contextMenu.contains(e.target)) hideContextMenu();
        }
    });
    // 编辑器快捷键：Ctrl+S 保存
    if (DOM.monacoEditor) {
        DOM.monacoEditor.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveCurrentFile();
            }
        });
    }
}

// ========== 工作目录 ==========
async function checkWorkspaceStatus() {
    try {
        var response = await fetch('/api/workspace/status');
        var result = await response.json();
        if (result.success && result.data.configured) {
            AppState.workspaceConfigured = true;
            AppState.workspacePath = result.data.workspace;
            AppState.terminalState.cwd = result.data.workspace;
            AppState.terminalState.displayDir = result.data.name;
            showMainInterface();
            loadFileTree();
        } else {
            showWorkspacePicker();
        }
    } catch (error) {
        console.error('[FoxCode] 检查工作目录状态失败:', error);
        showWorkspacePicker();
    }
}

function showWorkspacePicker() {
    if (DOM.workspacePicker) DOM.workspacePicker.style.display = 'flex';
    if (DOM.welcomeScreen) DOM.welcomeScreen.style.display = 'none';
    if (DOM.monacoWrapper) DOM.monacoWrapper.style.display = 'none';
    if (DOM.tabsBar) DOM.tabsBar.style.display = 'none';
    loadRecentWorkspaces();
    setTimeout(function () { if (DOM.workspacePathInput) DOM.workspacePathInput.focus(); }, 200);
}

function showMainInterface() {
    if (DOM.workspacePicker) DOM.workspacePicker.style.display = 'none';
    if (DOM.welcomeScreen) DOM.welcomeScreen.style.display = 'flex';
    if (AppState.workspacePath) {
        var projectName = AppState.workspacePath.split(/[/\\]/).filter(Boolean).pop() || '项目';
        var sidebarTitle = document.querySelector('.sidebar-title-text');
        if (sidebarTitle) sidebarTitle.textContent = projectName;
    }
}

async function setWorkspace() {
    var path = DOM.workspacePathInput ? DOM.workspacePathInput.value.trim() : '';
    if (!path) { showWorkspaceError('请输入文件夹路径'); return; }
    try {
        if (DOM.workspaceConfirmBtn) { DOM.workspaceConfirmBtn.disabled = true; DOM.workspaceConfirmBtn.textContent = '正在打开...'; }
        hideWorkspaceError();
        var response = await fetch('/api/workspace/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        });
        var result = await response.json();
        if (!result.success) throw new Error(result.error || '设置失败');
        saveRecentWorkspace(path);
        AppState.workspaceConfigured = true;
        AppState.workspacePath = result.data.workspace;
        AppState.terminalState.cwd = result.data.workspace;
        AppState.terminalState.displayDir = result.data.name;
        showToast('已打开项目: ' + result.data.name, 'success');
        showMainInterface();
        loadFileTree();
    } catch (error) {
        showWorkspaceError(error.message || '设置失败');
    } finally {
        if (DOM.workspaceConfirmBtn) { DOM.workspaceConfirmBtn.disabled = false; DOM.workspaceConfirmBtn.textContent = '打开文件夹'; }
    }
}

function showWorkspaceError(msg) {
    if (DOM.workspaceError) { DOM.workspaceError.textContent = msg; DOM.workspaceError.style.display = 'block'; }
}
function hideWorkspaceError() {
    if (DOM.workspaceError) DOM.workspaceError.style.display = 'none';
}

function saveRecentWorkspace(path) {
    try {
        var recent = JSON.parse(localStorage.getItem('foxcode_recent_workspaces') || '[]');
        recent = recent.filter(function (p) { return p !== path; });
        recent.unshift(path);
        if (recent.length > 5) recent = recent.slice(0, 5);
        localStorage.setItem('foxcode_recent_workspaces', JSON.stringify(recent));
    } catch (e) { /* ignore */ }
}

function loadRecentWorkspaces() {
    try {
        var recent = JSON.parse(localStorage.getItem('foxcode_recent_workspaces') || '[]');
        if (recent.length > 0 && DOM.workspaceRecent && DOM.recentList) {
            DOM.workspaceRecent.style.display = 'block';
            DOM.recentList.innerHTML = recent.map(function (p) {
                return '<div class="recent-item" onclick="document.getElementById(\'workspacePathInput\').value=\'' + escapeHtml(p) + '\';setWorkspace();" style="padding:6px 8px;cursor:pointer;border-radius:4px;">' + escapeHtml(p) + '</div>';
            }).join('');
        }
    } catch (e) { /* ignore */ }
}

async function browseDirectory() {
    var path = DOM.workspacePathInput ? DOM.workspacePathInput.value.trim() : '';
    if (!path) path = 'C:\\';
    try {
        var response = await fetch('/api/workspace/browse?path=' + encodeURIComponent(path));
        var result = await response.json();
        if (result.success) {
            if (DOM.directoryBrowser) DOM.directoryBrowser.style.display = 'block';
            if (DOM.browserCurrentPath) DOM.browserCurrentPath.textContent = result.data.currentPath;
            AppState.browserCurrentPath = result.data.currentPath;
            AppState.browserParentPath = result.data.parentPath;
            if (DOM.browserList) {
                DOM.browserList.innerHTML = result.data.directories.map(function (d) {
                    return '<div class="browser-item" onclick="selectBrowserDir(\'' + escapeHtml(d.path).replace(/'/g, "\\'") + '\')" style="padding:6px 8px;cursor:pointer;">📁 ' + escapeHtml(d.name) + '</div>';
                }).join('');
            }
        }
    } catch (error) {
        showToast('浏览目录失败', 'error');
    }
}

function browseDirectoryUp() {
    if (AppState.browserParentPath) {
        if (DOM.workspacePathInput) DOM.workspacePathInput.value = AppState.browserParentPath;
        browseDirectory();
    }
}

window.selectBrowserDir = function (path) {
    if (DOM.workspacePathInput) DOM.workspacePathInput.value = path;
    browseDirectory();
};

// ========== 文件树 ==========
async function loadFileTree(path) {
    try {
        if (DOM.fileTree) DOM.fileTree.innerHTML = '<div class="loading"><div class="loading-spinner"></div><span>加载文件列表...</span></div>';
        var response = await fetch('/api/files' + (path ? '?path=' + encodeURIComponent(path) : ''));
        var result = await response.json();
        if (result.needWorkspace) { showWorkspacePicker(); return; }
        if (!result.success) throw new Error(result.error || '加载失败');
        AppState.fileTreeData = result.data || [];
        renderFileTree(AppState.fileTreeData);
    } catch (error) {
        if (DOM.fileTree) DOM.fileTree.innerHTML = '<div class="empty-state"><div>加载失败</div><div style="font-size:12px;margin-top:8px;opacity:0.7;">' + escapeHtml(error.message) + '</div></div>';
        showToast('文件列表加载失败', 'error');
    }
}

function renderFileTree(items, level, container) {
    level = level || 0;
    container = container || DOM.fileTree;
    if (!container) return;
    if (level === 0) container.innerHTML = '';
    if (!items || items.length === 0) { container.innerHTML = '<div class="empty-state">空文件夹</div>'; return; }
    var fragment = document.createDocumentFragment();
    items.forEach(function (item) {
        var div = document.createElement('div');
        div.className = 'tree-item level-' + level;
        div.dataset.path = item.path;
        div.dataset.type = item.type;
        div.dataset.name = item.name;
        var iconClass = item.type === 'directory' ? AppState.fileIcons.directory : getFileIconClass(item.name);
        var arrowHtml = item.type === 'directory' ? '<span class="folder-arrow"></span>' : '<span class="folder-arrow" style="visibility:hidden;"></span>';
        div.innerHTML = arrowHtml + '<span class="tree-icon ' + iconClass + '"></span><span class="tree-name">' + escapeHtml(item.name) + '</span>';
        div.addEventListener('click', function (e) { e.stopPropagation(); handleItemClick(item, div); });
        div.addEventListener('dblclick', function (e) { e.stopPropagation(); if (item.type === 'file') openFile(item.path, item.name); });
        div.addEventListener('contextmenu', function (e) { e.preventDefault(); showContextMenu(e, item, div); });
        fragment.appendChild(div);
        if (item.type === 'directory' && item.children && item.children.length > 0) {
            var childContainer = document.createElement('div');
            childContainer.className = 'tree-children';
            childContainer.style.display = 'none';
            fragment.appendChild(childContainer);
            renderFileTree(item.children, level + 1, childContainer);
            div._childContainer = childContainer;
        }
    });
    container.appendChild(fragment);
}

function handleItemClick(item, element) {
    document.querySelectorAll('.tree-item.active').forEach(function (el) { el.classList.remove('active'); });
    element.classList.add('active');
    if (item.type === 'file') {
        openFile(item.path, item.name);
    } else {
        var arrow = element.querySelector('.folder-arrow');
        var icon = element.querySelector('.tree-icon');
        if (arrow) {
            arrow.classList.toggle('expanded');
            if (icon) { icon.classList.toggle('expanded', arrow.classList.contains('expanded')); }
            var childContainer = element._childContainer;
            if (childContainer) childContainer.style.display = arrow.classList.contains('expanded') ? 'block' : 'none';
        }
    }
}

// ========== 文件操作 ==========
async function openFile(filePath, fileName) {
    try {
        var existingTabIndex = AppState.openTabs.findIndex(function (tab) { return tab.path === filePath; });
        if (existingTabIndex !== -1) { switchToTab(existingTabIndex); return; }
        showToast('正在打开 ' + fileName + '...');
        var response = await fetch('/api/file/read?path=' + encodeURIComponent(filePath));
        var result = await response.json();
        if (!result.success) throw new Error(result.error || '读取失败');
        var ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
        var language = AppState.languageMap[ext] || 'plaintext';
        var newTab = { path: filePath, name: fileName, language: language, content: result.data.content, isModified: false };
        AppState.openTabs.push(newTab);
        switchToTab(AppState.openTabs.length - 1);
        updateTabsUI();
        showToast('已打开 ' + fileName, 'success');
    } catch (error) {
        showToast(error.message || '文件打开失败', 'error');
    }
}

function updateUIForOpenFile(fileName, language) {
    if (DOM.welcomeScreen) DOM.welcomeScreen.style.display = 'none';
    if (DOM.monacoWrapper) DOM.monacoWrapper.style.display = 'block';
    if (DOM.tabsBar) DOM.tabsBar.style.display = 'flex';
    document.title = fileName + ' - FoxCode IDE';
    if (DOM.languageMode) DOM.languageMode.textContent = getLanguageDisplayName(language);
    if (DOM.encoding) DOM.encoding.textContent = 'UTF-8';
    updateRunButtonState();
    if (AppState.editor) requestAnimationFrame(function () { AppState.editor.layout(); });
}

function switchToTab(index) {
    if (index < 0 || index >= AppState.openTabs.length) return;
    AppState.activeTabIndex = index;
    var tab = AppState.openTabs[index];
    if (tab.isVirtual) { renderVirtualTab(tab); return; }
    var virtualContainer = document.getElementById('virtualContentContainer');
    if (virtualContainer) virtualContainer.style.display = 'none';
    if (DOM.monacoWrapper) DOM.monacoWrapper.style.display = 'block';
    if (!AppState.editorReady || !AppState.editor) {
        setTimeout(function () { switchToTab(index); }, 100);
        return;
    }
    var model = AppState.editor.getModel();
    if (!model) return;
    var currentLang = model.getLanguageId().toLowerCase();
    if (currentLang !== tab.language.toLowerCase()) monaco.editor.setModelLanguage(model, tab.language);
    AppState.editor.setValue(tab.content);
    AppState.editor.revealLine(1);
    requestAnimationFrame(function () { if (AppState.editor) { AppState.editor.layout(); AppState.editor.focus(); } });
    AppState.currentFile = tab.path;
    AppState.currentFileName = tab.name;
    AppState.isModified = tab.isModified;
    updateUIForOpenFile(tab.name, tab.language);
    updateTabsUI();
}

function updateTabsUI() {
    if (!DOM.tabsBar) return;
    DOM.tabsBar.innerHTML = '';
    AppState.openTabs.forEach(function (tab, index) {
        var tabElement = document.createElement('div');
        tabElement.className = 'tab' + (index === AppState.activeTabIndex ? ' active' : '') + (tab.isVirtual ? ' virtual-tab' : '');
        var displayName = tab.isVirtual ? (tab.icon || '') + ' ' + tab.name : tab.name;
        tabElement.innerHTML = '<span class="tab-name">' + escapeHtml(displayName) + (tab.isModified ? ' ●' : '') + '</span><span class="tab-close" title="关闭">×</span>';
        tabElement.addEventListener('click', function (e) { if (!e.target.classList.contains('tab-close')) switchToTab(index); });
        tabElement.querySelector('.tab-close').addEventListener('click', function (e) { e.stopPropagation(); closeTab(index); });
        DOM.tabsBar.appendChild(tabElement);
    });
}

function closeTab(index) {
    if (index === undefined) index = AppState.activeTabIndex;
    if (index < 0 || index >= AppState.openTabs.length) return;
    var tab = AppState.openTabs[index];
    if (tab.isModified && !confirm('文件 "' + tab.name + '" 有未保存的更改，确定要关闭吗？')) return;
    AppState.openTabs.splice(index, 1);
    if (AppState.openTabs.length === 0) {
        AppState.activeTabIndex = -1;
        AppState.currentFile = null;
        AppState.currentFileName = '';
        AppState.isModified = false;
        if (DOM.welcomeScreen) DOM.welcomeScreen.style.display = 'flex';
        if (DOM.monacoWrapper) DOM.monacoWrapper.style.display = 'none';
        if (DOM.tabsBar) DOM.tabsBar.style.display = 'none';
        document.title = 'FoxCode IDE';
        if (AppState.editor) AppState.editor.setValue('');
    } else {
        if (AppState.activeTabIndex >= AppState.openTabs.length) AppState.activeTabIndex = AppState.openTabs.length - 1;
        else if (AppState.activeTabIndex === index) switchToTab(Math.min(index, AppState.openTabs.length - 1));
    }
    updateTabsUI();
    updateRunButtonState();
}

function closeCurrentTab() { closeTab(AppState.activeTabIndex); }

async function saveCurrentFile() {
    if (!AppState.currentFile || !AppState.editor) { showToast('没有可保存的文件', 'error'); return false; }
    try {
        var content = AppState.editor.getValue();
        showToast('正在保存...');
        var response = await fetch('/api/file/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: AppState.currentFile, content: content })
        });
        var result = await response.json();
        if (!result.success) throw new Error(result.error || '保存失败');
        AppState.isModified = false;
        if (AppState.activeTabIndex >= 0 && AppState.activeTabIndex < AppState.openTabs.length) {
            AppState.openTabs[AppState.activeTabIndex].isModified = false;
            AppState.openTabs[AppState.activeTabIndex].content = content;
        }
        updateRunButtonState();
        updateTabsUI();
        showToast(AppState.currentFileName + ' 已保存', 'success');
        return true;
    } catch (error) {
        showToast(error.message || '保存失败', 'error');
        return false;
    }
}

async function saveAllFiles() {
    if (AppState.openTabs.length === 0) return true;
    var savedFiles = [];
    for (var i = 0; i < AppState.openTabs.length; i++) {
        var tab = AppState.openTabs[i];
        if (tab.isVirtual || tab.path.startsWith('virtual://') || tab.path.startsWith('virtual:')) continue;
        try {
            if (AppState.activeTabIndex === i && AppState.editor) tab.content = AppState.editor.getValue();
            var response = await fetch('/api/file/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: tab.path, content: tab.content })
            });
            var result = await response.json();
            if (result.success) { tab.isModified = false; savedFiles.push(tab.name); }
        } catch (e) { /* skip */ }
    }
    AppState.isModified = false;
    updateRunButtonState();
    updateTabsUI();
    if (savedFiles.length > 0) showToast('已保存 ' + savedFiles.length + ' 个文件', 'success');
    return true;
}

// ========== 运行文件 ==========
async function runCurrentFile() {
    var filePath = AppState.currentFile;
    var fileName = AppState.currentFileName;
    if (!filePath || !fileName) { showToast('没有可运行的文件', 'error'); return; }
    var ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    var runCommand = AppState.runCommands[ext];
    if (!runCommand) { showToast('不支持的文件类型: ' + ext, 'error'); return; }
    await saveCurrentFile();
    if (ext === '.html' || ext === '.htm') {
        showToast('正在打开浏览器...');
        try {
            var response = await fetch('/api/file/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath, command: runCommand }) });
            var result = await response.json();
            if (result.success) showToast('已在浏览器中打开', 'success');
            else throw new Error(result.error || '打开失败');
        } catch (error) { showToast(error.message || '打开浏览器失败', 'error'); }
        return;
    }
    showToast('正在运行...');
    showTerminal();
    await new Promise(function (r) { setTimeout(r, 500); });

    // 使用 PTY 终端发送运行命令
    var runCmdStr = runCommand + ' ' + filePath;
    if (AppState.terminalState.socket && AppState.terminalState.ptyReady) {
        // 通过 PTY 终端执行命令
        AppState.terminalState.socket.emit('terminal_input', { data: runCmdStr + '\r' });
        showToast('已在终端中运行: ' + fileName, 'success');
    } else {
        // PTY 未就绪，回退到旧 API
        try {
            var response = await fetch('/api/file/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath, command: runCommand }) });
            var result = await response.json();
            if (result.success) {
                if (result.output && AppState.terminalState.xterm) {
                    AppState.terminalState.xterm.write('\r\n\x1b[33m--- 运行输出 ---\x1b[0m\r\n');
                    AppState.terminalState.xterm.write(result.output);
                    AppState.terminalState.xterm.write('\r\n\x1b[33m--- 运行结束 ---\x1b[0m\r\n');
                }
                showToast('运行完成: ' + fileName, 'success');
            } else {
                throw new Error(result.error || '运行失败');
            }
        } catch (error) {
            if (AppState.terminalState.xterm) {
                AppState.terminalState.xterm.write('\r\n\x1b[31m运行失败: ' + error.message + '\x1b[0m\r\n');
            }
            showToast('运行失败: ' + error.message, 'error');
        }
    }
}

function updateRunButtonState() {
    if (DOM.runBtn) {
        DOM.runBtn.textContent = AppState.isModified ? '运行' : '运行';
        DOM.runBtn.style.backgroundColor = AppState.isModified ? '#cca700' : '';
    }
}

// ========== 文件创建/删除/重命名 ==========
function createNewFile() {
    var activeItem = document.querySelector('.tree-item.active');
    var parentPath = '';
    if (activeItem) {
        if (activeItem.dataset.type === 'directory') parentPath = activeItem.dataset.path;
        else { var lp = activeItem.dataset.path.replace(/\\/g, '/'); parentPath = lp.substring(0, lp.lastIndexOf('/')); }
    }
    showModal('新建文件', '请输入文件名（含扩展名）', 'newFile', parentPath);
}

function createNewFolder() {
    var activeItem = document.querySelector('.tree-item.active');
    var parentPath = '';
    if (activeItem) {
        if (activeItem.dataset.type === 'directory') parentPath = activeItem.dataset.path;
        else { var lp = activeItem.dataset.path.replace(/\\/g, '/'); parentPath = lp.substring(0, lp.lastIndexOf('/')); }
    }
    showModal('新建文件夹', '请输入文件夹名称', 'newFolder', parentPath);
}

async function executeAction(action, name, parentPath) {
    try {
        var url, method, body;
        if (action === 'newFile') { url = '/api/file/create'; method = 'POST'; body = { name: name, type: 'file', parentPath: parentPath || '' }; }
        else if (action === 'newFolder') { url = '/api/file/create'; method = 'POST'; body = { name: name, type: 'directory', parentPath: parentPath || '' }; }
        else if (action === 'rename') { url = '/api/file/rename'; method = 'PUT'; body = { oldPath: parentPath, newName: name }; }
        else throw new Error('未知操作: ' + action);
        var response = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        var result = await response.json();
        if (!result.success) throw new Error(result.error || '操作失败');
        showToast(result.message || '操作成功', 'success');
        loadFileTree();
        if (action === 'newFile' && result.path) setTimeout(function () { openFile(result.path, name); }, 300);
    } catch (error) { showToast(error.message || '操作失败', 'error'); }
}

async function deleteItem(path, name) {
    if (!confirm('确定要删除 "' + name + '" 吗？\n\n此操作不可撤销！')) return;
    try {
        var response = await fetch('/api/file/delete?path=' + encodeURIComponent(path), { method: 'DELETE' });
        var result = await response.json();
        if (!result.success) throw new Error(result.error || '删除失败');
        showToast('已删除 ' + name, 'success');
        loadFileTree();
        if (path === AppState.currentFile) { var idx = AppState.openTabs.findIndex(function (t) { return t.path === path; }); if (idx !== -1) closeTab(idx); }
    } catch (error) { showToast(error.message || '删除失败', 'error'); }
}

// ========== UI 交互 ==========
function toggleSidebar() {
    if (DOM.sidebar) DOM.sidebar.classList.toggle('collapsed');
    setTimeout(function () { if (AppState.editor) AppState.editor.layout(); }, 260);
}

function showContextMenu(event, item, element) {
    event.stopPropagation(); event.preventDefault();
    AppState.contextMenuTarget = { item: item, element: element };
    var x = event.clientX || (event.touches && event.touches[0] ? event.touches[0].clientX : 10);
    var y = event.clientY || (event.touches && event.touches[0] ? event.touches[0].clientY : 10);
    if (x + 180 > window.innerWidth) x = window.innerWidth - 190;
    if (y + 200 > window.innerHeight) y = window.innerHeight - 210;
    x = Math.max(10, x); y = Math.max(10, y);
    DOM.contextMenu.style.left = x + 'px'; DOM.contextMenu.style.top = y + 'px'; DOM.contextMenu.style.display = 'block';
    DOM.contextMenu.querySelectorAll('.menu-item').forEach(function (menuItem) {
        menuItem.onclick = function (e) { e.stopPropagation(); handleContextAction(this.dataset.action); hideContextMenu(); };
    });
}

function hideContextMenu() { if (DOM.contextMenu) DOM.contextMenu.style.display = 'none'; AppState.contextMenuTarget = null; }

function handleContextAction(action) {
    if (!AppState.contextMenuTarget) return;
    var item = AppState.contextMenuTarget.item;
    if (action === 'newFile') {
        var pp = item.type === 'directory' ? item.path : item.path.substring(0, item.path.lastIndexOf('/'));
        showModal('新建文件', '请输入文件名', 'newFile', pp);
    } else if (action === 'newFolder') {
        var pp = item.type === 'directory' ? item.path : item.path.substring(0, item.path.lastIndexOf('/'));
        showModal('新建文件夹', '请输入文件夹名称', 'newFolder', pp);
    } else if (action === 'rename') {
        showModal('重命名', '请输入新名称', 'rename', item.path);
        if (DOM.modalInput) { DOM.modalInput.value = item.name; DOM.modalInput.select(); }
    } else if (action === 'delete') {
        deleteItem(item.path, item.name);
    }
}

function showModal(title, placeholder, action, parentPath) {
    if (DOM.modalTitle) DOM.modalTitle.textContent = title;
    if (DOM.modalInput) { DOM.modalInput.placeholder = placeholder; DOM.modalInput.value = ''; }
    if (DOM.modalOverlay) { DOM.modalOverlay.dataset.action = action; DOM.modalOverlay.dataset.parentPath = parentPath || ''; DOM.modalOverlay.style.display = 'flex'; }
    setTimeout(function () { if (DOM.modalInput) DOM.modalInput.focus(); }, 100);
}

function closeModal() { if (DOM.modalOverlay) DOM.modalOverlay.style.display = 'none'; if (DOM.modalInput) DOM.modalInput.value = ''; }

function handleModalConfirm() {
    var action = DOM.modalOverlay ? DOM.modalOverlay.dataset.action : '';
    var name = DOM.modalInput ? DOM.modalInput.value.trim() : '';
    var parentPath = DOM.modalOverlay ? DOM.modalOverlay.dataset.parentPath || '' : '';
    if (!name) { showToast('请输入名称', 'error'); return; }
    if (/[<>:"|?*\\]/.test(name)) { showToast('名称包含非法字符', 'error'); return; }
    executeAction(action, name, parentPath);
    closeModal();
}

function showToast(message, type) {
    if (!DOM.toast) return;
    DOM.toast.textContent = message;
    DOM.toast.className = 'toast ' + (type || '');
    DOM.toast.style.display = 'block';
    clearTimeout(AppState.toastTimer);
    AppState.toastTimer = setTimeout(function () { DOM.toast.style.display = 'none'; }, 2500);
}

function handleGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') { e.preventDefault(); runCurrentFile(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); createNewFile(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); toggleSidebar(); }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') { e.preventDefault(); saveAllFiles(); }
    if (e.key === 'Escape') { closeModal(); hideContextMenu(); }
}

// ========== 工具函数 ==========
function getFileIconClass(filename) {
    var lowerName = filename.toLowerCase();
    if (lowerName === '.gitignore' || lowerName === '.gitattributes') return AppState.fileIcons['.gitignore'];
    if (lowerName === '.env' || lowerName.startsWith('.env.')) return AppState.fileIcons['.env'];
    var ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return AppState.fileIcons[ext] || AppState.fileIcons.default;
}

function getLanguageDisplayName(langId) {
    var names = { javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java', html: 'HTML', css: 'CSS', json: 'JSON', markdown: 'Markdown', plaintext: '纯文本', sql: 'SQL', shell: 'Shell', xml: 'XML', yaml: 'YAML', go: 'Go', rust: 'Rust', php: 'PHP', csharp: 'C#', cpp: 'C++', c: 'C', ruby: 'Ruby' };
    return names[langId] || langId || '纯文本';
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    text = String(text);
    return text.replace(/[&<>"'`=\/]/g, function (m) {
        return ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#039;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;' })[m];
    });
}

// ========== 侧边栏拖拽 ==========
function initSidebarResize() {
    var handle = DOM.sidebarResizeHandle;
    var sidebar = DOM.sidebar;
    var isResizing = false, startX = 0, startWidth = 0;
    if (!handle || !sidebar) return;
    handle.addEventListener('mousedown', function (e) { isResizing = true; startX = e.clientX; startWidth = sidebar.offsetWidth; handle.classList.add('dragging'); document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; e.preventDefault(); });
    document.addEventListener('mousemove', function (e) { if (!isResizing) return; var w = Math.max(150, Math.min(400, startWidth + e.clientX - startX)); sidebar.style.width = w + 'px'; document.documentElement.style.setProperty('--sidebar-width', w + 'px'); if (AppState.editor) AppState.editor.layout(); });
    document.addEventListener('mouseup', function () { if (isResizing) { isResizing = false; handle.classList.remove('dragging'); document.body.style.cursor = ''; document.body.style.userSelect = ''; } });
}
initSidebarResize();

// ========== 顶部菜单 ==========
function showFileMenu() {
    var existingMenu = document.getElementById('fileDropdownMenu');
    if (existingMenu) { existingMenu.remove(); return; }
    var menu = document.createElement('div');
    menu.id = 'fileDropdownMenu'; menu.className = 'dropdown-menu';
    menu.innerHTML = '<div class="dropdown-item" data-action="newFile"><span>新建文件</span><span class="shortcut">Ctrl+N</span></div><div class="dropdown-item" data-action="newFolder"><span>新建文件夹</span></div><div class="dropdown-divider"></div><div class="dropdown-item" data-action="saveAll"><span>保存所有</span><span class="shortcut">Ctrl+Shift+S</span></div><div class="dropdown-divider"></div><div class="dropdown-item" data-action="openWorkspace"><span>打开工作目录</span></div>';
    var btn = DOM.fileBtn; if (!btn) return;
    var rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed'; menu.style.top = (rect.bottom + 4) + 'px'; menu.style.left = rect.left + 'px'; menu.style.zIndex = '1000';
    document.body.appendChild(menu);
    menu.querySelectorAll('.dropdown-item').forEach(function (item) {
        item.addEventListener('click', function () {
            var a = this.dataset.action;
            if (a === 'newFile') createNewFile(); else if (a === 'newFolder') createNewFolder(); else if (a === 'saveAll') saveAllFiles(); else if (a === 'openWorkspace') showWorkspacePicker();
            menu.remove();
        });
    });
    setTimeout(function () { document.addEventListener('click', function closeMenu(e) { if (!menu.contains(e.target) && e.target !== btn) { menu.remove(); document.removeEventListener('click', closeMenu); } }); }, 0);
}

function showSettings() { openVirtualTab('settings'); }
function showAbout() { openVirtualTab('about'); }
function showGitPanel() { openVirtualTab('git'); }
function showTerminal() { openVirtualTab('terminal'); }
function showBrowser() { openVirtualTab('browser'); }

// ========== 虚拟标签页 ==========
function openVirtualTab(type) {
    var virtualTab = AppState.virtualTabs[type];
    if (!virtualTab) return;
    var existingIndex = AppState.openTabs.findIndex(function (tab) { return tab.isVirtual && tab.virtualType === type; });
    if (existingIndex !== -1) { switchToTab(existingIndex); return; }
    var newTab = { path: 'virtual://' + type, name: virtualTab.name, icon: virtualTab.icon, language: virtualTab.language, content: '', isModified: false, isVirtual: true, virtualType: type };
    AppState.openTabs.push(newTab);
    switchToTab(AppState.openTabs.length - 1);
    updateTabsUI();
}

function renderVirtualTab(tab) {
    if (!DOM.monacoWrapper) return;
    DOM.monacoWrapper.style.display = 'none';
    var virtualContainer = document.getElementById('virtualContentContainer');
    if (!virtualContainer) {
        virtualContainer = document.createElement('div');
        virtualContainer.id = 'virtualContentContainer';
        virtualContainer.className = 'virtual-content-container';
        DOM.monacoWrapper.parentNode.appendChild(virtualContainer);
    }
    virtualContainer.style.display = 'block';
    switch (tab.virtualType) {
        case 'settings': renderSettingsContent(virtualContainer); break;
        case 'about': renderAboutContent(virtualContainer); break;
        case 'git': renderGitContent(virtualContainer); break;
        case 'terminal': renderTerminalContent(virtualContainer); break;
        case 'browser': renderBrowserContent(virtualContainer); break;
        default: virtualContainer.innerHTML = '<div class="virtual-empty">内容加载中...</div>';
    }
    AppState.currentFile = tab.path;
    AppState.currentFileName = tab.name;
    AppState.isModified = false;
    updateUIForVirtualTab(tab.name);
    updateTabsUI();
}

function updateUIForVirtualTab(name) {
    if (DOM.welcomeScreen) DOM.welcomeScreen.style.display = 'none';
    if (DOM.tabsBar) DOM.tabsBar.style.display = 'flex';
    document.title = name + ' - FoxCode IDE';
    if (DOM.languageMode) DOM.languageMode.textContent = '虚拟页面';
    if (DOM.encoding) DOM.encoding.textContent = '-';
    updateRunButtonState();
}

function renderSettingsContent(container) {
    container.innerHTML = '<div class="virtual-page settings-page"><div class="virtual-page-header"><h2>⚙️ 设置</h2><p>自定义 FoxCode IDE 的外观和行为</p></div><div class="virtual-page-content"><div class="settings-section"><h3>编辑器设置</h3><div class="settings-item"><label><span>字体大小</span><select id="settingFontSize"><option value="12">12px</option><option value="14" selected>14px</option><option value="16">16px</option><option value="18">18px</option><option value="20">20px</option></select></label></div><div class="settings-item"><label><span>自动换行</span><input type="checkbox" id="settingWordWrap" checked></label></div><div class="settings-item"><label><span>显示行号</span><input type="checkbox" id="settingLineNumbers" checked></label></div><div class="settings-item"><label><span>Tab 大小</span><select id="settingTabSize"><option value="2">2 空格</option><option value="4" selected>4 空格</option><option value="8">8 空格</option></select></label></div></div><div class="settings-section"><h3>外观设置</h3><div class="settings-item"><label><span>主题</span><select id="settingTheme"><option value="vs-dark" selected>VS Dark</option><option value="vs-light">VS Light</option></select></label></div></div><div class="settings-section"><h3>工作目录</h3><div class="settings-item"><label><span>当前工作目录</span><span class="setting-info">' + escapeHtml(AppState.workspacePath || '未设置') + '</span></label><button class="settings-btn" onclick="showWorkspacePicker()">更改目录</button></div></div></div></div>';
    var fontSizeSelect = document.getElementById('settingFontSize');
    if (fontSizeSelect && AppState.editor) { fontSizeSelect.addEventListener('change', function () { AppState.editor.updateOptions({ fontSize: parseInt(this.value) }); }); }
    var wordWrapCheck = document.getElementById('settingWordWrap');
    if (wordWrapCheck && AppState.editor) { wordWrapCheck.addEventListener('change', function () { AppState.editor.updateOptions({ wordWrap: this.checked ? 'on' : 'off' }); }); }
    var themeSelect = document.getElementById('settingTheme');
    if (themeSelect) { themeSelect.addEventListener('change', function () { monaco.editor.setTheme(this.value); }); }
}

function renderAboutContent(container) {
    container.innerHTML = '<div class="virtual-page about-page"><div class="virtual-page-header"><div class="about-logo">FoxCode</div><h2>FoxCode IDE</h2><p class="version">版本 1.0.0</p></div><div class="virtual-page-content"><div class="about-section"><h3>简约 · 高效 · 轻量级</h3><p>FoxCode IDE 是一款轻量级代码编辑器，提供流畅的编码体验。</p></div><div class="about-section"><h3>快捷键</h3><div class="shortcuts-grid"><div class="shortcut-item"><kbd>Ctrl+R</kbd> 运行文件</div><div class="shortcut-item"><kbd>Ctrl+N</kbd> 新建文件</div><div class="shortcut-item"><kbd>Ctrl+S</kbd> 保存文件</div><div class="shortcut-item"><kbd>Ctrl+Shift+S</kbd> 保存所有</div><div class="shortcut-item"><kbd>Ctrl+B</kbd> 切换侧边栏</div></div></div><div class="about-footer"><p>基于 Flask + Monaco Editor 构建</p></div></div></div>';
}

async function renderGitContent(container) {
    container.innerHTML = '<div class="virtual-page git-page"><div class="virtual-page-header"><h2>📦 Git 版本控制</h2></div><div class="virtual-page-content"><div class="git-section"><h3>当前状态</h3><div class="git-status-card" id="gitStatusCard"><div class="git-loading">加载中...</div></div></div><div class="git-section"><h3>快捷操作</h3><div class="git-actions"><button class="git-action-btn" onclick="gitInit()">🔧 初始化仓库</button><button class="git-action-btn" onclick="gitRefresh()">📊 刷新状态</button></div><div class="git-commit-section" style="margin-top:12px;"><input type="text" id="gitCommitMessage" placeholder="输入提交信息..." class="git-input" style="width:calc(100% - 80px);"><button class="git-execute-btn" onclick="gitCommit()" style="width:70px;">提交</button></div></div><div class="git-section"><h3>文件变更</h3><div id="gitChangesContainer"><div class="git-loading">加载中...</div></div></div><div class="git-section"><h3>提交历史</h3><div id="gitLogContainer"><div class="git-loading">加载中...</div></div></div></div></div>';
    await gitRefresh();
}

async function gitRefresh() { await Promise.all([loadGitStatus(), loadGitLog()]); }

async function loadGitStatus() {
    var statusCard = document.getElementById('gitStatusCard');
    var changesContainer = document.getElementById('gitChangesContainer');
    if (!statusCard) return;
    try {
        var response = await fetch('/api/git/status');
        var result = await response.json();
        if (result.success && result.data.isRepo) {
            var data = result.data;
            statusCard.innerHTML = '<div class="git-status-item"><span>分支:</span> <span>' + escapeHtml(data.branch) + '</span></div><div class="git-status-item"><span>状态:</span> <span class="' + (data.clean ? 'clean' : 'dirty') + '">' + (data.clean ? '干净' : '有变更') + '</span></div>';
            if (changesContainer) {
                if (data.changes && data.changes.length > 0) {
                    changesContainer.innerHTML = data.changes.map(function (c) { return '<div class="git-change-item"><span>' + escapeHtml(c.status) + '</span> <span>' + escapeHtml(c.file) + '</span></div>'; }).join('');
                } else { changesContainer.innerHTML = '<div class="git-empty">暂无文件变更</div>'; }
            }
        } else {
            statusCard.innerHTML = '<div class="git-not-repo"><p>当前目录不是 Git 仓库</p><button class="git-action-btn" onclick="gitInit()">🔧 初始化 Git 仓库</button></div>';
            if (changesContainer) changesContainer.innerHTML = '<div class="git-empty">请先初始化 Git 仓库</div>';
        }
    } catch (e) { statusCard.innerHTML = '<div class="git-error">加载失败</div>'; }
}

async function loadGitLog() {
    var logContainer = document.getElementById('gitLogContainer');
    if (!logContainer) return;
    try {
        var response = await fetch('/api/git/log?limit=10');
        var result = await response.json();
        if (result.success && result.data.commits && result.data.commits.length > 0) {
            logContainer.innerHTML = result.data.commits.map(function (c) { return '<div class="git-log-item"><span class="log-hash">' + escapeHtml(c.shortHash) + '</span> <span>' + escapeHtml(c.message) + '</span></div>'; }).join('');
        } else { logContainer.innerHTML = '<div class="git-empty">暂无提交历史</div>'; }
    } catch (e) { logContainer.innerHTML = '<div class="git-empty">暂无提交历史</div>'; }
}

async function gitInit() {
    try {
        showToast('正在初始化 Git 仓库...');
        var response = await fetch('/api/git/init', { method: 'POST' });
        var result = await response.json();
        if (result.success) { showToast('Git 仓库初始化成功', 'success'); await gitRefresh(); }
        else showToast(result.error || '初始化失败', 'error');
    } catch (e) { showToast('初始化失败', 'error'); }
}

async function gitCommit() {
    var msgInput = document.getElementById('gitCommitMessage');
    var message = msgInput ? msgInput.value.trim() : '';
    if (!message) { showToast('请输入提交信息', 'error'); return; }
    try {
        await fetch('/api/git/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: ['.'] }) });
        var response = await fetch('/api/git/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message }) });
        var result = await response.json();
        if (result.success) { showToast('提交成功', 'success'); if (msgInput) msgInput.value = ''; await gitRefresh(); }
        else showToast(result.error || '提交失败', 'error');
    } catch (e) { showToast('提交失败', 'error'); }
}

// ========== 终端系统 (xterm.js + WebSocket PTY) ==========
function renderTerminalContent(container) {
    if (!AppState.terminalState.cwd && AppState.workspacePath) {
        AppState.terminalState.cwd = AppState.workspacePath;
        AppState.terminalState.displayDir = AppState.workspacePath.split(/[\\/]/).pop();
    }

    container.innerHTML = '<div class="terminal-container">' +
        '<div class="terminal-header">' +
            '<div class="terminal-header-title"><span class="terminal-icon">💻</span><span>终端</span></div>' +
            '<div class="terminal-header-controls">' +
                '<button class="terminal-control-btn" id="termNewBtn" title="新建终端">新建</button>' +
                '<button class="terminal-control-btn" id="termClearBtn" title="清屏">清屏</button>' +
                '<button class="terminal-control-btn" onclick="closeCurrentTab()" title="关闭终端">关闭</button>' +
            '</div>' +
        '</div>' +
        '<div class="terminal-body" id="xtermContainer" style="padding:0;height:calc(100% - 70px);overflow:hidden;"></div>' +
        '<div class="terminal-footer">' +
            '<span class="terminal-footer-info" id="terminalFooterInfo">PTY 交互式终端 | 支持交互式程序</span>' +
        '</div>' +
    '</div>';

    var xtermContainer = document.getElementById('xtermContainer');
    var termClearBtn = document.getElementById('termClearBtn');
    var termNewBtn = document.getElementById('termNewBtn');

    // 初始化 xterm.js
    var xterm = new Terminal({
        theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            selectionBackground: '#264f78',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#ffffff'
        },
        fontFamily: '"Cascadia Code", "Fira Code", "Consolas", "Courier New", monospace',
        fontSize: 14,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 5000,
        tabStopWidth: 8,
        convertEol: true
    });

    var fitAddon = new FitAddon.FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(xtermContainer);
    setTimeout(function () {
        fitAddon.fit();
    }, 50);

    AppState.terminalState.xterm = xterm;
    AppState.terminalState.fitAddon = fitAddon;

    // 连接 WebSocket
    initTerminalSocket();

    // xterm 输入 → WebSocket → PTY
    xterm.onData(function (data) {
        if (AppState.terminalState.socket && AppState.terminalState.ptyReady) {
            AppState.terminalState.socket.emit('terminal_input', { data: data });
        }
    });

    // xterm 二进制数据（如粘贴）
    xterm.onBinary(function (data) {
        if (AppState.terminalState.socket && AppState.terminalState.ptyReady) {
            AppState.terminalState.socket.emit('terminal_input', { data: data });
        }
    });

    // 清屏按钮
    if (termClearBtn) {
        termClearBtn.addEventListener('click', function () {
            xterm.clear();
        });
    }

    // 新建终端按钮
    if (termNewBtn) {
        termNewBtn.addEventListener('click', function () {
            AppState.terminalState.ptyReady = false;
            xterm.clear();
            xterm.write('\r\n\x1b[33m正在创建新终端...\x1b[0m\r\n');
            if (AppState.terminalState.socket) {
                AppState.terminalState.socket.emit('terminal_create', { cwd: AppState.terminalState.cwd || AppState.workspacePath });
            }
        });
    }

    // 点击终端区域聚焦
    xtermContainer.addEventListener('click', function () {
        xterm.focus();
    });

    // 窗口大小变化时重新适配
    var resizeObserver = new ResizeObserver(function () {
        if (fitAddon && xterm.element) {
            try { fitAddon.fit(); } catch (e) { /* ignore */ }
        }
    });
    resizeObserver.observe(xtermContainer);

    // 监听 xterm 尺寸变化，通知 PTY
    xterm.onResize(function (size) {
        if (AppState.terminalState.socket && AppState.terminalState.ptyReady) {
            AppState.terminalState.socket.emit('terminal_resize', { cols: size.cols, rows: size.rows });
        }
    });
}

function initTerminalSocket() {
    var socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
    });

    AppState.terminalState.socket = socket;

    socket.on('connect', function () {
        console.log('[FoxCode Terminal] WebSocket 已连接');
        var xterm = AppState.terminalState.xterm;
        if (xterm) {
            xterm.write('\x1b[32m✓ WebSocket 已连接\x1b[0m\r\n');
        }
        // 创建 PTY 终端
        socket.emit('terminal_create', { cwd: AppState.terminalState.cwd || AppState.workspacePath });
    });

    socket.on('terminal_created', function (data) {
        console.log('[FoxCode Terminal] PTY 终端已创建:', data);
        AppState.terminalState.ptyReady = true;
        var xterm = AppState.terminalState.xterm;
        if (xterm) {
            xterm.focus();
            // 适配终端大小
            if (AppState.terminalState.fitAddon) {
                try { AppState.terminalState.fitAddon.fit(); } catch (e) { /* ignore */ }
            }
        }
        var footerInfo = document.getElementById('terminalFooterInfo');
        if (footerInfo) footerInfo.textContent = 'PTY 交互式终端 | ' + (data.cwd || '');
    });

    socket.on('terminal_output', function (data) {
        var xterm = AppState.terminalState.xterm;
        if (xterm && data.data) {
            xterm.write(data.data);
        }
    });

    socket.on('terminal_error', function (data) {
        var xterm = AppState.terminalState.xterm;
        if (xterm) {
            xterm.write('\r\n\x1b[31m错误: ' + (data.message || '未知错误') + '\x1b[0m\r\n');
        }
    });

    socket.on('terminal_exit', function (data) {
        AppState.terminalState.ptyReady = false;
        var xterm = AppState.terminalState.xterm;
        if (xterm) {
            xterm.write('\r\n\x1b[33m[进程已退出]\x1b[0m\r\n');
        }
    });

    socket.on('disconnect', function () {
        AppState.terminalState.ptyReady = false;
        var xterm = AppState.terminalState.xterm;
        if (xterm) {
            xterm.write('\r\n\x1b[31m✗ WebSocket 连接已断开\x1b[0m\r\n');
        }
    });

    socket.on('connect_error', function (err) {
        console.error('[FoxCode Terminal] WebSocket 连接错误:', err);
        var xterm = AppState.terminalState.xterm;
        if (xterm) {
            xterm.write('\r\n\x1b[31m连接错误，正在重试...\x1b[0m\r\n');
        }
    });
}

function clearTerminal() {
    if (AppState.terminalState.xterm) {
        AppState.terminalState.xterm.clear();
    }
}

// 保留旧函数名的兼容（运行文件时使用）
function appendTerminalLine(className, html) { /* deprecated, kept for compat */ }
function removeTerminalLine(lineEl, html) { /* deprecated, kept for compat */ }
function scrollTerminalToBottom() { /* deprecated, kept for compat */ }

// ========== 浏览器预览 ==========
function renderBrowserContent(container) {
    container.innerHTML = '<div class="virtual-page browser-page"><div class="virtual-page-header"><h2>🌐 浏览器预览</h2></div><div class="virtual-page-content"><div class="browser-toolbar"><input type="text" id="browserUrl" placeholder="输入 URL..." class="browser-url-input"><button class="browser-btn" onclick="browserRefresh()">刷新</button><button class="browser-btn" onclick="browserOpenFile()">打开文件</button></div><div class="browser-preview-container"><iframe id="browserPreviewFrame" class="browser-preview-frame" sandbox="allow-scripts allow-same-origin"></iframe><div class="browser-placeholder" id="browserPlaceholder"><div class="placeholder-icon">🌐</div><p>在上方输入 URL 或打开本地 HTML 文件</p></div></div></div></div>';
}

function browserRefresh() {
    var url = document.getElementById('browserUrl').value.trim();
    var frame = document.getElementById('browserPreviewFrame');
    var placeholder = document.getElementById('browserPlaceholder');
    if (url && frame) { frame.src = url; frame.style.display = 'block'; if (placeholder) placeholder.style.display = 'none'; }
}

function browserOpenFile() {
    var htmlTab = AppState.openTabs.find(function (t) { return !t.isVirtual && (t.name.endsWith('.html') || t.name.endsWith('.htm')); });
    if (htmlTab) {
        var frame = document.getElementById('browserPreviewFrame');
        var placeholder = document.getElementById('browserPlaceholder');
        if (frame) { frame.srcdoc = htmlTab.content; frame.style.display = 'block'; if (placeholder) placeholder.style.display = 'none'; document.getElementById('browserUrl').value = htmlTab.name; }
    } else { showToast('请先打开一个 HTML 文件', 'error'); }
}

// ========== 全局暴露函数 ==========
window.createNewFile = createNewFile;
window.createNewFolder = createNewFolder;
window.closeTab = closeTab;
window.closeCurrentTab = closeCurrentTab;
window.closeModal = closeModal;
window.setWorkspace = setWorkspace;
window.browseDirectory = browseDirectory;
window.clearTerminal = clearTerminal;
window.showWorkspacePicker = showWorkspacePicker;
window.gitInit = gitInit;
window.gitRefresh = gitRefresh;
window.gitCommit = gitCommit;
window.browserRefresh = browserRefresh;
window.browserOpenFile = browserOpenFile;
window.showSettings = showSettings;
window.showAbout = showAbout;

console.log('[FoxCode] 应用脚本加载完成');