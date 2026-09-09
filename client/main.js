/**
 * cfg-view 客户端主进程 (Electron)
 *
 * 启动时：
 *  1. 以「子进程 + Electron 内置 Node 运行时」拉起三个后端服务
 *     （backend/start.js → data:8101 / business:8102 / subscription:8103）
 *  2. 轮询后端健康检查，就绪后打开窗口加载内嵌画面前端（web/index.html）
 *  3. 退出时统一回收后端子进程
 *
 * 前端默认访问 http://127.0.0.1:8101 / ws://127.0.0.1:8103/ws，
 * 与桌面内嵌运行方式一致，无需代理。
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

// 打包后由 electron-builder extraResources 复制到 resources/（不在 asar 内，
// 因此子进程 Node 可直接读取，且运行数据可写）；开发模式直接用 client/ 下
// 由 npm run prep 准备的 web / backend 目录。
function appRoot() {
  return app.isPackaged ? process.resourcesPath : __dirname;
}

const webDir = () => path.join(appRoot(), 'web');
const backendDir = () => path.join(appRoot(), 'backend');

// 服务端口（可用环境变量覆盖，避免与已有进程冲突）
const cfgPort = (envName, def) => Number(process.env[envName] || def);
const DATA_PORT = cfgPort('CFG_DATA_PORT', 8101);
const BUSINESS_PORT = cfgPort('CFG_BUSINESS_PORT', 8102);
const SUB_PORT = cfgPort('CFG_SUB_PORT', 8103);

/** 已启动的后端进程（退出时统一回收） */
const children = new Set();

/** 以 Electron 内置 Node 运行时执行 start.js，拉起三个后端服务 */
function startBackendServices() {
  const startScript = path.join(backendDir(), 'start.js');
  const env = Object.assign({}, process.env, {
    ELECTRON_RUN_AS_NODE: '1', // 让 Electron 二进制以纯 Node 模式运行脚本
    // 运行数据（事件日志/值快照）放到用户数据目录，避免安装目录只读
    CFG_VAR_DIR: app.getPath('userData'),
  });
  delete env.NODE_OPTIONS; // 避免把宿主 NODE_OPTIONS 传给服务子进程
  const p = spawn(process.execPath, [startScript], {
    env,
    cwd: backendDir(),
  });
  p.on('error', (e) => console.error('[cfg-view] 后端启动失败:', e.message));
  children.add(p);
}

/** 轮询数据传输服务健康接口，直到可用或超时 */
function waitForBackend(timeoutMs, cb) {
  const deadline = Date.now() + timeoutMs;
  const url = { hostname: '127.0.0.1', port: DATA_PORT, path: '/api/health' };
  const tryOnce = () => {
    const req = http.request(url, (res) => {
      res.resume();
      if (res.statusCode === 200) cb();
      else if (Date.now() > deadline) cb();
      else setTimeout(tryOnce, 300);
    });
    req.on('error', () => {
      if (Date.now() > deadline) cb();
      else setTimeout(tryOnce, 300);
    });
    req.end();
  };
  tryOnce();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'cfg-view',
    autoHideMenuBar: true,
    backgroundColor: '#1e2430',
  });
  // 把实际服务端口传给前端（cfg-view 前端支持 ?data=&business=&ws= 参数）
  const query = `data=http://127.0.0.1:${DATA_PORT}&business=http://127.0.0.1:${BUSINESS_PORT}&ws=ws://127.0.0.1:${SUB_PORT}/ws`;
  win.loadFile(path.join(webDir(), 'index.html'), { query });
  // 页面加载诊断（冒烟测试时输出到控制台）
  win.webContents.on('did-fail-load', (code, desc, url) => {
    console.error('[cfg-view] 页面加载失败', code, desc, url);
  });
  if (process.env.CFG_SMOKE_TEST) {
    // 旧签名：(level, message, line, source)；新签名：Event 对象
    win.webContents.on('console-message', (level, msg) => {
      const m = (typeof level === 'object' && level !== null) ? level.message : msg;
      console.log('[page]', m);
    });
  }
  return win;
}

app.whenReady().then(() => {
  startBackendServices();
  // 后端就绪后再开窗口，保证画面列表/点值首次加载成功
  waitForBackend(20000, createWindow);
});

// 冒烟测试：CFG_SMOKE_TEST=1 时后端就绪后停留数秒自动退出（CI/本地验证用）
if (process.env.CFG_SMOKE_TEST) {
  setTimeout(() => {
    console.log('[cfg-view] 冒烟测试：窗口已打开，正常退出');
    app.quit();
  }, 12000);
}

/** 回收后端子进程树（Windows 用 taskkill /T 连子代一并结束，避免端口残留） */
function killTree(p) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/T', '/F', '/PID', String(p.pid)], { stdio: 'ignore' });
    } else {
      p.kill();
    }
  } catch (e) {
    try { p.kill(); } catch (_) { /* ignore */ }
  }
}

app.on('before-quit', () => {
  for (const p of children) killTree(p);
  children.clear();
});

app.on('window-all-closed', () => {
  app.quit();
});