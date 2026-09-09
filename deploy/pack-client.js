/**
 * cfg-view 客户端软件打包脚本
 * 把前端 dist + 画面数据 + 后端（三服务）合成一个自包含目录，
 * 并生成客户端运行程序（静态页面服务 + 后端三服务 + 画面数据代理）。
 * 产物：deploy/dist-client/
 *
 * 用法：
 *   cd backend && npm install --production
 *   cd frontend && npm run build
 *   node deploy/pack-client.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'deploy', 'dist-client');

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else {
      fs.copyFileSync(s, d);
      console.log('  copy', path.relative(root, s));
    }
  }
}

function write(f, content) {
  fs.writeFileSync(f, content, 'utf-8');
  console.log('  write', path.relative(root, f));
}

const SERVER_WEB = `/**
 * cfg-view 客户端运行时：静态页面服务 + 把 /api 反向代理到三个后端服务
 * 无需 nginx，双击启动器即可运行。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const WEB = path.join(ROOT, 'web');
const PORT = Number(process.env.CFG_WEB_PORT || 5173);

const BACKEND_SCRIPT = path.join(ROOT, 'backend', 'start.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = req.url;
  // /api/* -> 后端（数据 8101 / 业务 8102）
  const apiMap = [
    ['/api/displays', 8101],
    ['/api/points', 8101],
    ['/api/health', 8101],
    ['/api/commands', 8102],
    ['/api/actions', 8102],
  ];
  for (const [prefix, port] of apiMap) {
    if (url.startsWith(prefix)) {
      return proxy(req, res, port, url);
    }
  }
  // 静态
  let rel = url.split('?')[0];
  if (rel === '/') rel = '/index.html';
  const file = path.join(WEB, rel);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } else if (!fs.existsSync(file)) {
    const idx = path.join(WEB, 'index.html');
    if (fs.existsSync(idx)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      fs.createReadStream(idx).pipe(res);
    } else {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  } else {
    res.writeHead(403); res.end('403');
  }
});

function proxy(req, res, port, url) {
  const options = {
    hostname: '127.0.0.1',
    port,
    path: url,
    method: req.method,
    headers: { ...req.headers, host: '127.0.0.1:' + port },
  };
  const out = http.request(options, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  req.pipe(out);
}

server.listen(PORT, () => {
  console.log('[web] cfg-view 页面: http://127.0.0.1:' + PORT);
});

// 启动三个后端服务
try {
  const p = spawn(process.execPath, [BACKEND_SCRIPT], { stdio: 'inherit' });
  p.on('error', (e) => console.error('[web] 后端启动失败:', e.message));
} catch (e) {
  console.error('[web] 后端启动失败:', e.message);
}
`;

const BAT = `@echo off
cd /d %~dp0
echo 启动 cfg-view 客户端（页面 + 三个后端服务）...
start "cfg-view-backend" node run-client.js
timeout /t 5 /nobreak >nul
start "" http://127.0.0.1:5173
echo 已启动。关闭本窗口即可停止（建议直接关闭 backend 窗口）。
pause
`;

function main() {
  console.log('== 打包 cfg-view 客户端 ==');
  const web = path.join(dist, 'web');
  const backend = path.join(dist, 'backend');

  const webDist = path.join(root, 'frontend', 'dist');
  const displays = path.join(root, 'frontend', 'public', 'displays');
  for (const p of [webDist, displays]) {
    if (!fs.existsSync(p)) {
      console.error('缺少前置产物: ' + p + ' （先执行 frontend npm run build）');
      process.exit(1);
    }
  }

  if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true });
  fs.mkdirSync(dist, { recursive: true });

  console.log('[1/4] 前端静态 + 画面数据');
  copyDir(webDist, path.join(web, ''));
  copyDir(displays, path.join(web, 'displays'));

  console.log('[2/4] 后端三服务 + 公共库');
  copyDir(path.join(root, 'backend', 'service-data'),         path.join(backend, 'service-data'));
  copyDir(path.join(root, 'backend', 'service-business'),     path.join(backend, 'service-business'));
  copyDir(path.join(root, 'backend', 'service-subscription'), path.join(backend, 'service-subscription'));
  copyDir(path.join(root, 'backend', 'common'),               path.join(backend, 'common'));
  fs.copyFileSync(path.join(root, 'backend', 'config.js'),    path.join(backend, 'config.js'));
  fs.copyFileSync(path.join(root, 'backend', 'start.js'),     path.join(backend, 'start.js'));
  copyDir(path.join(root, 'backend', 'node_modules'),         path.join(backend, 'node_modules'));
  fs.copyFileSync(path.join(root, 'backend', 'package.json'), path.join(backend, 'package.json'));
  fs.mkdirSync(path.join(backend, 'var'), { recursive: true });

  console.log('[3/4] 客户端运行程序（静态服务 + 后端托管）');
  write(path.join(dist, 'run-client.js'), SERVER_WEB);

  console.log('[4/4] Windows 启动器');
  write(path.join(dist, '启动客户端.bat'), BAT);

  console.log('\n完成！产物: ' + dist);
  console.log('双击 dist-client/启动客户端.bat 运行。');
}

main();