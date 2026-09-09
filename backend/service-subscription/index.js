/**
 * cfg-view service-subscription 订阅库服务 (Koa + WebSocket, 端口 8103)
 *
 * 职责：
 *  - WebSocket 网关 /ws：
 *      { op:'subscribe',   points:[...] }     订阅点位
 *      { op:'unsubscribe', points:[...] }     取消订阅
 *      { op:'display', display, points:[...] } 画面切换（整批更换订阅）
 *      { op:'event', point, action, payload } 转发业务事件（前端气泡菜单）
 *  - 内部推送接口 /internal/push：data/business 服务把数据/事件推送过来，
 *    匹配订阅关系后向相关客户端广播。
 *  - 事件记录到 backend/var/events.log
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const { WebSocketServer } = require('ws');
const config = require('../config');

const app = new Koa();
const router = new Router();
app.use(cors());
app.use(bodyParser());

const varDir = config.varDir;
if (!fs.existsSync(varDir)) fs.mkdirSync(varDir, { recursive: true });
const eventLog = path.join(varDir, 'events.log');

/** 所有已连接客户端：{ ws, points:Set, id } */
const clients = new Map();
let clientSeq = 0;

function logEvent(line) {
  try {
    fs.appendFileSync(eventLog, line + '\n', 'utf-8');
  } catch (e) { /* ignore */ }
}

function send(ws, obj) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }
}

/** 广播数据/事件给订阅了该点位的客户端 */
function broadcast(payload) {
  const point = payload.point;
  let hit = 0;
  for (const [ws, client] of clients) {
    if (client.points.has(point) || client.points.has('*')) {
      send(ws, payload);
      hit++;
    }
  }
  return hit;
}

// ---- 内部推送（http）：data / business 调用 ----
router.post('/internal/push', async (ctx) => {
  const body = ctx.request.body || {};
  const kind = body.kind || 'data';
  const point = body.point;
  if (!point) { ctx.body = { ok: false, message: 'point required' }; return; }

  const payload = {
    type: kind,                 // 'data' | 'event'
    point,
    value: body.value,
    action: body.action,
    payload: body.payload,
    result: body.result,
    ts: Date.now(),
  };
  if (kind === 'event') logEvent(JSON.stringify(payload));
  const hit = broadcast(payload);
  ctx.body = { ok: true, pushed: hit };
});

router.get('/api/health', async (ctx) => {
  ctx.body = { service: 'subscription', ok: true, clients: clients.size };
});

router.get('/api/clients', async (ctx) => {
  ctx.body = Array.from(clients.values()).map((c) => ({
    id: c.id,
    points: c.points.size,
  }));
});

app.use(router.routes());
app.use(router.allowedMethods());

// ---- WebSocket ----
const server = http.createServer(app.callback());

/** 处理 wss 消息 */
function handleMessage(ws, client, text) {
  let msg;
  try { msg = JSON.parse(text); } catch (e) {
    send(ws, { type: 'error', message: 'invalid json' });
    return;
  }
  const op = msg.op;
  if (op === 'subscribe') {
    for (const p of msg.points || []) client.points.add(p);
    // 应答订阅确认
    send(ws, { type: 'subscribed', points: Array.from(client.points) });
  } else if (op === 'unsubscribe') {
    for (const p of msg.points || []) client.points.delete(p);
    send(ws, { type: 'unsubscribed', points: Array.from(client.points) });
  } else if (op === 'display') {
    // 画面切换：清空并整批订阅
    client.points.clear();
    for (const p of msg.points || []) client.points.add(p);
    client.display = msg.display;
    send(ws, { type: 'displayChanged', display: msg.display, points: Array.from(client.points) });
  } else if (op === 'event') {
    // 业务事件直接转发给 ALL 客户端（含发送者），由业务服务记录
    const payload = {
      type: 'event',
      point: msg.point,
      action: msg.action,
      payload: msg.payload,
      ts: Date.now(),
    };
    logEvent(JSON.stringify(payload));
    for (const [w, c] of clients) send(w, payload);
    send(ws, { type: 'eventAck', point: msg.point, action: msg.action });
  } else if (op === 'ping') {
    send(ws, { type: 'pong', ts: Date.now() });
  } else {
    send(ws, { type: 'error', message: 'unknown op: ' + op });
  }
}

const wss = new WebSocketServer({
  server,
  path: config.ws.path,
});

wss.on('connection', (ws, req) => {
  const id = 'c' + (++clientSeq);
  clients.set(ws, { id, ws, points: new Set() });
  send(ws, { type: 'connected', id, message: 'welcome to cfg-view subscription' });

  ws.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString('utf-8');
    handleMessage(ws, clients.get(ws), text);
  });

  ws.on('close', () => {
    clients.delete(ws);
  });

  // 心跳
  ws.on('pong', () => { /* keepalive */ });
});

const port = config.services.subscription.port;
// ws 库内部使用 server; 由 server.listen 接管
server.listen(port, () => {
  console.log(`[service-subscription] 订阅库 ws://${config.services.subscription.host}:${port}${config.ws.path}`);
  console.log(`[service-subscription] 内部推送 http://${config.services.subscription.host}:${port}/internal/push`);
});