/**
 * cfg-view 数据源接口 + 模拟器
 * 实际接入采集系统时，实现 IDataSource 接口替换即可。
 */
'use strict';
const config = require('../config');

/** 数据源接口 */
class IDataSource {
  /**
   * 初始化
   * @param {(point, value) => void} onValue 值变化回调（由调用方注入推送逻辑）
   */
  init(onValue) { throw new Error('not implemented'); }
  start() { throw new Error('not implemented'); }
  stop() { throw new Error('not implemented'); }
  /** 查询当前值（name -> value） */
  getValue(name) { throw new Error('not implemented'); }
  /** 是否可写（控制型点） */
  isWritable(name) { return false; }
  /** 写入设定值，返回 {ok, value} */
  setValue(name, value) { throw new Error('not implemented'); }
}

/** 模拟器数据源：数值点随机游走，状态点周期跳变 */
class SimulatorDataSource extends IDataSource {
  constructor(registry, options) {
    super();
    this._registry = registry;
    this._opts = Object.assign({ intervalMs: 1000, randomWalk: true, stateMax: 15 }, options || {});
    this._timer = null;
    this._onValue = null;
  }

  init(onValue) {
    this._onValue = onValue;
  }

  start() {
    if (this._timer) return;
    // 初始值
    const seed = () => {
      for (const p of this._registry.all()) {
        if (p.value === undefined) this._next(p, true);
      }
    };
    seed();
    let tick = 0;
    this._timer = setInterval(() => {
      tick++;
      // 每拍更新全部点（数值随机游走，状态点每 3 拍跳变一次）
      for (const p of this._registry.all()) {
        if (tick % 3 === 1 || !this._isStateType(p.type)) {
          this._next(p, false);
        }
      }
    }, this._opts.intervalMs);
  }

  _isStateType(t) {
    return t === 'colourchange' || t === 'stringchange' || t === 'symbolchange' ||
           t === 'ipmSymChange' || t === 'bangtuchange';
  }

  _next(p, initial) {
    const t = p.type;
    const isText = p.kind === 'text';
    let v = p.value;
    const cnt = (p._cnt = (p._cnt || 0) + 1);

    if (t === 'stringchange') {
      // 状态文字（如运行状态）：按状态列表轮换，保证文字可读
      const states = (p.states && p.states.length) ? p.states : null;
      v = states ? states[cnt % states.length] : (cnt % 2);
    } else if (t === 'string' && (p.states && p.states.length)) {
      const states = p.states;
      v = states[cnt % states.length];
    } else if (t === 'string') {
      // 文字绑定的模拟量（AI）：连续数值随机游走
      const base = (typeof v === 'number' && !isNaN(v)) ? v : (Math.random() * 100);
      const delta = this._opts.randomWalk ? (Math.random() * 8 - 4) : 0;
      v = Math.round((base + delta) * 100) / 100;
      if (initial) v = Math.round(Math.random() * 10000) / 100;
    } else if (t === 'bangtuchange') {
      // 开关量（显式切换型）：0/1 跳变
      v = initial ? 0 : (v === 1 ? 0 : 1);
    } else if (isText) {
      // 文字绑定、带状态（colourchange 等）：按状态序号切换颜色/文本
      const max = (p.states && Array.isArray(p.states) && p.states.length) ? p.states.length : this._opts.stateMax;
      v = cnt % Math.max(max, 1);
    } else {
      // 图形绑定 → 开关量：0/1（阀门开闭、设备启停等 DI 点）
      v = cnt % 2;
    }

    if (!this._onValue) return;
    const updated = this._registry.setValue(p.name, v, 'simulator');
    this._onValue(updated);
  }

  getValue(name) {
    const p = this._registry.get(name);
    return p ? p.value : undefined;
  }

  isWritable(name) {
    const p = this._registry.get(name);
    return !!(p && (p.type === 'bangtuchange' || p.menu));
  }

  setValue(name, value) {
    const p = this._registry.get(name);
    if (!p) return { ok: false, message: 'point not found' };
    if (!this.isWritable(name)) return { ok: false, message: 'point not writable' };
    const updated = this._registry.setValue(name, value, 'simulator.write');
    if (this._onValue) this._onValue(updated);
    return { ok: true, value };
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
}

/** 工厂 */
function createDataSource(registry) {
  const opt = config.simulator || {};
  return new SimulatorDataSource(registry, opt);
}

module.exports = { IDataSource, SimulatorDataSource, createDataSource };