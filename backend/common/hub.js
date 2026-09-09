/**
 * cfg-view 事件总线（进程内）
 * 订阅库内部使用。如需跨进程/跨机，可替换为 Redis Pub/Sub 或 MQTT。
 * 总线消息：{ channel: 'data'|'event', payload: {...} }
 */
'use strict';

class Hub {
  constructor() {
    /** @type {Map<string, Set<function>>} */
    this._chans = new Map();
  }

  /** 订阅通道，返回取消函数 */
  subscribe(channel, fn) {
    if (!this._chans.has(channel)) this._chans.set(channel, new Set());
    this._chans.get(channel).add(fn);
    return () => {
      const s = this._chans.get(channel);
      if (s) s.delete(fn);
    };
  }

  publish(channel, payload) {
    const s = this._chans.get(channel);
    if (!s) return;
    for (const fn of Array.from(s)) {
      try { fn(payload); } catch (e) { console.error('[hub]', e); }
    }
  }
}

module.exports = new Hub();