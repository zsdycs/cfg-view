/**
 * cfg-view 一键启动脚本：同时启动 数据传输 / 订阅库 / 业务 三个服务
 * 开发使用；生产建议各服务独立部署。
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const config = require('./config');

const services = [
  { name: 'service-data',         port: config.services.data.port },
  { name: 'service-subscription', port: config.services.subscription.port },
  { name: 'service-business',     port: config.services.business.port },
];

const procs = [];
for (const svc of services) {
  console.log(`[start] 启动 ${svc.name}  端口 ${svc.port}`);
  const p = spawn(process.execPath, [path.join(__dirname, svc.name, 'index.js')], {
    stdio: 'inherit',
  });
  procs.push(p);
}

function shutdown() {
  console.log('\n[start] 正在停止所有服务...');
  for (const p of procs) p.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('\n[start] 所有服务已启动，Ctrl+C 停止。');
console.log('[start] 订阅库(websocket): ws://127.0.0.1:%d/ws', config.services.subscription.port);