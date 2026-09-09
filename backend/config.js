/**
 * cfg-view 后端配置
 */
'use strict';
const fs = require('fs');
const path = require('path');

// 画面数据目录：源码布局 / 打包客户端布局 均兼容
const DISPLAY_CANDIDATES = [
  path.join(__dirname, '..', 'frontend', 'public', 'displays'), // 源码布局
  path.join(__dirname, '..', 'web', 'displays'),                // 打包客户端布局 (dist-client/backend/../web)
  path.join(__dirname, '..', 'displays'),
];
const displaysDir = DISPLAY_CANDIDATES.find((d) => fs.existsSync(d)) || DISPLAY_CANDIDATES[0];

module.exports = {
  // 三服务地址（内部互调）；端口可用环境变量覆盖（桌面客户端多开/冲突时）
  services: {
    data:         { host: '127.0.0.1', port: Number(process.env.CFG_DATA_PORT || 8101) },
    business:     { host: '127.0.0.1', port: Number(process.env.CFG_BUSINESS_PORT || 8102) },
    subscription: { host: '127.0.0.1', port: Number(process.env.CFG_SUB_PORT || 8103) },
  },
  // 前端页面数据源（画面 JSON 目录）
  displaysDir,
  // 运行时数据（客户端桌面运行时用 CFG_VAR_DIR 指向用户数据目录，避免安装目录只读）
  varDir: process.env.CFG_VAR_DIR || path.join(__dirname, 'var'),
  // 数据源：simulator（模拟） | file（读取 var/points.json 静态值）
  datasource: 'simulator',
  simulator: {
    intervalMs: 1000,        // 模拟值变化周期
    randomWalk: true,        // 数值点随机游走
    stateMax: 15,            // 状态类点模拟取值范围 0..stateMax
  },
  // WebSocket ping 间隔
  ws: {
    path: '/ws',
    pingIntervalMs: 30000,
  },
};