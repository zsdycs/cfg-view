/**
 * cfg-view service-data 数据传输服务 (Koa, 端口 8101)
 *
 * 职责：
 *  - 点表/点值访问（REST）
 *  - 画面数据访问（画面 JSON + 符号库）
 *  - 运行数据源（模拟器/采集），值变化时调用订阅库内部推送接口
 *  - 接收业务服务的写入指令
 */
'use strict';
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const config = require('../config');
const points = require('../common/points');
const displays = require('../common/displays');
const { createDataSource } = require('../common/datasource');

const app = new Koa();
const router = new Router();
app.use(cors());
app.use(bodyParser());

const subUrl = () =>
  `http://${config.services.subscription.host}:${config.services.subscription.port}`;

/** 把值变化推送到订阅库 */
async function pushToSubscription(kind, point, extra) {
  try {
    await fetch(`${subUrl()}/internal/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ kind, point }, extra || {})),
    });
  } catch (e) {
    // 订阅库未就绪时静默忽略（写本地日志）
    console.log('[data] push failed:', e.message);
  }
}

// ---- REST：画面 ----
router.get('/api/displays', async (ctx) => {
  ctx.body = displays.list();
});

router.get('/api/displays/:name', async (ctx) => {
  const json = displays.load(ctx.params.name);
  if (!json) { ctx.status = 404; ctx.body = { error: 'display not found' }; return; }
  ctx.body = json;
});

router.get('/api/displays/:name/symbols', async (ctx) => {
  const lib = displays.loadSymbols(ctx.params.name);
  if (!lib) { ctx.status = 404; ctx.body = { error: 'symbols not found' }; return; }
  ctx.body = lib;
});

// ---- REST：点位 ----
router.get('/api/points', async (ctx) => {
  ctx.body = points.all();
});

router.get('/api/points/:name', async (ctx) => {
  const p = points.get(ctx.params.name);
  if (!p) { ctx.status = 404; ctx.body = { error: 'point not found' }; return; }
  ctx.body = p;
});

// 写入（业务服务/测试调用）：dataSource.setValue
router.post('/api/points/:name/write', async (ctx) => {
  const p = points.get(ctx.params.name);
  if (!p) { ctx.status = 404; ctx.body = { error: 'point not found' }; return; }
  const value = (ctx.request.body && ctx.request.body.value !== undefined) ? ctx.request.body.value : undefined;
  const r = dataSource.setValue(ctx.params.name, value);
  ctx.body = r;
});

// ---- 内部：业务服务落数据（写入后推送） ----
router.post('/internal/write', async (ctx) => {
  const { point, value, action, payload } = ctx.request.body || {};
  if (!point || !dataSource.isWritable(point)) {
    ctx.body = { ok: false, message: 'point not writable' };
    return;
  }
  const r = dataSource.setValue(point, value);
  // 推送事件回馈（所有订阅该点的客户端）
  await pushToSubscription('event', point, { action: action || 'write', payload, result: r.ok ? 'ok' : 'fail' });
  ctx.body = r;
});

// ---- 健康检查 ----
router.get('/api/health', async (ctx) => {
  ctx.body = { service: 'data', ok: true, points: points.all().length, displays: displays.list().length };
});

app.use(router.routes());
app.use(router.allowedMethods());

// 启动
const dataSource = createDataSource(points);

// 注入数据源回调：值变化 -> 推送订阅库
dataSource.init((p) => {
  pushToSubscription('data', p.name, { value: p.value });
});

// 建立点表
points.scanDisplays();
console.log(`[data] 扫描画面点表: ${points.all().length} 个点名`);

dataSource.start();
console.log(`[data] 数据源已启动: ${config.datasource}`);

const port = config.services.data.port;
app.listen(port, () => {
  console.log(`[service-data] 数据传输服务 http://${config.services.data.host}:${port}`);
});