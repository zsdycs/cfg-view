/**
 * cfg-view 数据点名 注册表与取值
 * 点表由画面 JSON 中的绑定信息自动建立（p.tag / a.point / a.pointType / a.pointStates）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config');

class PointRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._points = new Map();
  }

  /** 注册一个点（幂等，保留已有 value） */
  register(name, info) {
    if (!name) return;
    const exist = this._points.get(name);
    if (exist) {
      // 增量补充信息
      for (const k of ['type', 'kind', 'states', 'display', 'menu', 'hyperLink']) {
        if (info[k] !== undefined && exist[k] === undefined) exist[k] = info[k];
      }
      return exist;
    }
    const p = {
      name,
      type: info.type || 'string',
      // 绑定元素类型：text=文字（模拟量），shape=图形（开关量）
      kind: info.kind === 'text' ? 'text' : 'shape',
      value: info.value,
      ts: 0,
      source: null,
      states: info.states,
      display: info.display,
      menu: info.menu ? true : false,
      hyperLink: info.hyperLink,
    };
    this._points.set(name, p);
    return p;
  }

  get(name) {
    return this._points.get(name);
  }

  /** 所有点（表） */
  all() {
    return Array.from(this._points.values());
  }

  has(name) {
    return this._points.has(name);
  }

  /** 更新值（不做类型换算，原样保存） */
  setValue(name, value, source) {
    const p = this._points.get(name);
    if (!p) return null;
    p.value = value;
    p.source = source || p.source;
    p.ts = Date.now();
    return p;
  }

  /**
   * 从画面 JSON 扫描点表
   * @param displayName 画面名（如 27F_SLJ）
   * @param json 画面 JSON 对象
   */
  registerDisplay(displayName, json) {
    let n = 0;
    for (const d of (json.d || [])) {
      const a = d.a;
      if (!a || !a.interactive) continue;
      const point = a.point || (d.p && d.p.tag);
      if (!point) continue;
      const info = {
        type: a.pointType || 'string',
        // 根据点绑定的元素类型区分数据性质
        kind: d.c === 'ht.Text' ? 'text' : 'shape',
        states: a.pointStates,
        menu: a.menu,
        hyperLink: a.hyperLink,
        display: displayName,
      };
      if (this.register(point, info)) n++;
    }
    return n;
  }

  /** 扫描 displaysDir 下所有画面 JSON，注册点表 */
  scanDisplays(dir) {
    const ddir = dir || config.displaysDir;
    if (!fs.existsSync(ddir)) return 0;
    const files = fs.readdirSync(ddir).filter((f) => /\.json$/.test(f) && !/\.symbols\.json$/.test(f));
    let total = 0;
    for (const f of files) {
      try {
        const json = JSON.parse(fs.readFileSync(path.join(ddir, f), 'utf-8'));
        total += this.registerDisplay(f.replace(/\.json$/i, ''), json);
      } catch (e) {
        // 忽略损坏文件
      }
    }
    return total;
  }
}

module.exports = new PointRegistry();