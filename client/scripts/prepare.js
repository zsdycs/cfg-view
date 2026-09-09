/**
 * cfg-view 客户端资源准备脚本
 *
 * 在电子(electron-builder)打包前执行，把仓库产物组装成客户端运行时布局：
 *   client/web/       ← frontend/dist/ + frontend/public/displays/
 *   client/backend/   ← backend/（三服务 + common + config + start + node_modules）
 *
 * 打包后 electron-builder 会把这些目录（extraResources）放进 resources/，
 * 运行时布局为 resources/web 与 resources/backend 同级，
 * backend/config.js 通过 ../web/displays 定位画面数据。
 *
 * 用法：
 *   1. cd backend && npm ci
 *   2. cd frontend && npm ci && npm run build
 *   3. cd client && npm ci && npm run prepare
 */
'use strict';
const fs = require('fs');
const path = require('path');

const scripts = __dirname;
const client = path.join(scripts, '..');
const root = path.join(client, '..');

function copyDir(src, dst) {
  if (!fs.existsSync(src)) {
    throw new Error('缺少目录: ' + src);
  }
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const st = fs.lstatSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else if (st.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(s), d);
    else fs.copyFileSync(s, d);
  }
}

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isDirectory()) rmrf(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

const SKIP_IN_BACKEND = new Set(['node_modules', 'var']);

function copyBackend(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (SKIP_IN_BACKEND.has(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.lstatSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
  // 依赖目录单独拷贝（跳过临时目录）
  const nm = path.join(src, 'node_modules');
  if (!fs.existsSync(nm)) throw new Error('缺少 backend/node_modules（先执行 cd backend && npm ci）');
  copyDir(nm, path.join(dst, 'node_modules'));
  fs.mkdirSync(path.join(dst, 'var'), { recursive: true });
}

function main() {
  console.log('== 准备 cfg-view 客户端资源 ==');

  const webDist = path.join(root, 'frontend', 'dist');
  const displays = path.join(root, 'frontend', 'public', 'displays');
  const backend = path.join(root, 'backend');
  for (const p of [webDist, displays, backend]) {
    if (!fs.existsSync(p)) {
      console.error('缺少前置产物: ' + p + ' （先构建前端/安装后端依赖）');
      process.exit(1);
    }
  }

  console.log('[1/2] 前端 web/（dist + 画面数据）');
  rmrf(path.join(client, 'web'));
  copyDir(webDist, path.join(client, 'web'));
  copyDir(displays, path.join(client, 'web', 'displays'));

  console.log('[2/2] 后端 backend/（三服务 + node_modules）');
  rmrf(path.join(client, 'backend'));
  copyBackend(backend, path.join(client, 'backend'));

  console.log('\n完成！客户端布局:');
  console.log('  client/web/      (前端静态 + displays)');
  console.log('  client/backend/  (三个后端服务 + node_modules)');
}

main();