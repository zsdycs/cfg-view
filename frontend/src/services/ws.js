/**
 * WebSocket 订阅客户端（连接订阅库 /ws）
 *
 * 生命周期：
 *   ws.connect()                     建立连接
 *   ws.subscribe(['P1','P2'])        订阅点位（画面加载后整批订阅）
 *   ws.on('data',  (msg)=>...)       点数据推送
 *   ws.on('event', (msg)=>...)       业务事件推送
 *   ws.sendEvent(point, action, payload)  气泡菜单动作 -> 后端
 */
import { cfg } from '../config.js';

export class WsClient {
  constructor(url) {
    this.url = url || cfg.ws;
    this._handlers = { data: [], event: [], connected: [], disconnected: [] };
    this._ws = null;
    this._reconnectDelay = 2000;
    this._closed = false;
  }

  on(type, fn) {
    (this._handlers[type] = this._handlers[type] || []).push(fn);
    return this;
  }

  _emit(type, msg) {
    for (const fn of this._handlers[type] || []) {
      try { fn(msg); } catch (e) { console.error('[ws]', e); }
    }
  }

  connect() {
    this._closed = false;
    try {
      this._ws = new WebSocket(this.url);
    } catch (e) {
      console.error('[ws] connect failed', e);
      return this;
    }
    this._ws.onopen = () => {
      this._emit('connected', {});
    };
    this._ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (msg.type === 'data' || msg.type === 'state') this._emit('data', msg);
      else if (msg.type === 'event') this._emit('event', msg);
      else if (msg.type === 'eventAck') this._emit('eventAck', msg);
      else this._emit('any', msg);
    };
    this._ws.onclose = () => {
      this._emit('disconnected', {});
      if (!this._closed) {
        setTimeout(() => this.connect(), this._reconnectDelay);
      }
    };
    this._ws.onerror = () => { /* onclose 会处理重连 */ };
    return this;
  }

  close() {
    this._closed = true;
    if (this._ws) this._ws.close();
  }

  _send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  }

  /** 订阅点位（画面对点位全集） */
  subscribe(points) {
    this._send({ op: 'subscribe', points });
  }

  /** 画面切换：整批更换订阅 */
  setDisplay(display, points) {
    this._send({ op: 'display', display, points });
  }

  /** 气泡菜单动作 → 后端 */
  sendEvent(point, action, payload) {
    // 1) 订阅库直接转发（所有客户端可见）
    this._send({ op: 'event', point, action, payload: payload || {} });
    // 2) 业务服务执行（落数据/校验）——由调用方决定，这里仅作约定注释
  }

  /** 连接状态（供 UI 显示） */
  get connected() {
    return !!(this._ws && this._ws.readyState === WebSocket.OPEN);
  }
}

export const ws = new WsClient();