/**
 * cfg-view service-business 业务服务 (Koa, 端口 8102)
 *
 * 职责：
 *  - 接收前端气泡菜单动作/控制指令（REST）
 *  - 业务校验（允许的动作、书写权限）
 *  - 调用数据服务落数据，通过订阅库推送事件回馈
 */
'use strict';
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const config = require('../config');

const app = new Koa();
const router = new Router();
app.use(cors());
app.use(bodyParser());

const dataUrl = `http://${config.services.data.host}:${config.services.data.port}`;
const subUrl = `http://${config.services.subscription.host}:${config.services.subscription.port}`;

/** 允许的业务动作（气泡菜单按钮 action），可按 point 类型扩展 */
const ACTION_POLICY = {
  open:    { desc: '打开画面/详情' },
  control: { desc: '发送控制指令（写值）' },
  ack:     { desc: '确认报警' },
  refresh: { desc: '刷新数据' },
};

// ---- 前端气泡菜单动作 ----
router.post('/api/commands/execute', async (ctx) => {
  const { point, action, payload } = ctx.request.body || {};
  if (!point || !action) {
    ctx.status = 400;
    ctx.body = { ok: false, message: 'point and action required' };
    return;
  }
  // 1. 校验
  if (!ACTION_POLICY[action]) {
    ctx.body = { ok: false, message: 'action not allowed: ' + action };
    return;
  }
  // 2. 落数据（control 类动作写值）
  let dataResult = { skip: true };
  if (action === 'control') {
    try {
      const r = await fetch(`${dataUrl}/internal/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ point, value: payload && payload.value, action, payload: payload || {} }),
      });
      dataResult = await r.json();
    } catch (e) {
      dataResult = { ok: false, message: 'data service unavailable: ' + e.message };
    }
  } else {
    // 非写值动作：直接推送事件回馈
    try {
      await fetch(`${subUrl}/internal/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'event', point, action, payload: payload || {} }),
      });
    } catch (e) { /* ignore */ }
  }

  ctx.body = {
    ok: true,
    point,
    action,
    payload: payload || {},
    data: dataResult,
    ts: Date.now(),
  };
});

// ---- 菜单模板：前端按 point 请求可用动作 ----
router.get('/api/actions/point/:name', async (ctx) => {
  ctx.body = {
    point: ctx.params.name,
    actions: [
      { id: 'control', label: '控制' },
      { id: 'ack',     label: '确认' },
      { id: 'refresh', label: '刷新' },
      { id: 'open',    label: '详情' },
    ],
  };
});

router.get('/api/health', async (ctx) => {
  ctx.body = { service: 'business', ok: true, actions: Object.keys(ACTION_POLICY) };
});

app.use(router.routes());
app.use(router.allowedMethods());

const port = config.services.business.port;
app.listen(port, () => {
  console.log(`[service-business] 业务服务 http://${config.services.business.host}:${port}`);
});