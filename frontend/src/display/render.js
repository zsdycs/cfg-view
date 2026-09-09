/**
 * HT 画面 JSON → SVG 轻量渲染器
 *
 * 支持条目：
 *  - ht.Shape : p.points.__a + p.segments.__a → <path d="...">
 *      段类型: 1=移动(M), 2=直线(L), 3=二次贝塞尔(Q), 4=三次贝塞尔(C), 5=闭合(Z)
 *  - ht.Text  : <text x y> + fill/font
 *
 * 交互（svg2json.js 写入）：
 *  - p.tag            点名（HT 兼容）
 *  - a.point/a.pointType/a.pointStates/a.menu/a.hyperLink/a.bindKey
 *  - a.states(符号状态列表)/a.stateDefault/a.groupTransform （symbolchange）
 *
 * 渲染结果返回 { svgAttrs, paths:[], texts:[], stateGroups:{}, interactiveRefs:[] }
 *  以普通对象返回，由 Vue 组件组装 <svg>，保证对 DOM 引用可控。
 */

/** 数值保留 5 位小数格式 */
function n(v) {
  return Math.round(v * 1e5) / 1e5;
}

/** 清除质量为 NaN/Inf 的值 */
function coord(v) {
  const x = Number(v);
  return isFinite(x) ? x : 0;
}

/**
 * 由 points + segments 生成 SVG path d
 * 编码约定（svg2json.js 与 canvg 一致）：
 *   段 1 移动(M) 占用1点；段 2 直线(L) 占用1点
 *   段 3 二次贝塞尔(Q) 占用2点(控制点, 终点)
 *   段 4 三次贝塞尔(C) 占用3点(控制点1, 控制点2, 终点)
 *   段 5 闭合(Z) 不占点
 * 因此 points 与 segments 不是一一对应，需按段类型消费 points。
 */
export function buildPath(pts, segs) {
  if (!pts || !segs || pts.length === 0 || segs.length === 0) return '';
  const d = [];
  let i = 0;
  for (let sIdx = 0; sIdx < segs.length; sIdx++) {
    const s = segs[sIdx];
    if (s === 1) {
      if (i >= pts.length) break;
      const p = pts[i++];
      d.push(`M${n(coord(p.x))} ${n(coord(p.y))}`);
    } else if (s === 2) {
      if (i >= pts.length) break;
      const p = pts[i++];
      d.push(`L${n(coord(p.x))} ${n(coord(p.y))}`);
    } else if (s === 3) {
      if (i + 1 >= pts.length) break;
      const c = pts[i++], e = pts[i++];
      d.push(`Q${n(coord(c.x))} ${n(coord(c.y))} ${n(coord(e.x))} ${n(coord(e.y))}`);
    } else if (s === 4) {
      if (i + 2 >= pts.length) break;
      const c1 = pts[i++], c2 = pts[i++], e = pts[i++];
      d.push(`C${n(coord(c1.x))} ${n(coord(c1.y))} ${n(coord(c2.x))} ${n(coord(c2.y))} ${n(coord(e.x))} ${n(coord(e.y))}`);
    } else if (s === 5) {
      d.push('Z');
    }
  }
  return d.join(' ');
}

/**
 * 解析一个 ht.Shape 条目为 SVG path 属性
 */
export function shapePathAttrs(entry) {
  const p = entry.p || {};
  const s = entry.s || {};
  const pts = (p.points && p.points.__a) || [];
  const segs = (p.segments && p.segments.__a) || [];
  const d = buildPath(pts, segs);
  const attrs = {
    d,
    fill: s['shape.background'] || 'none',
    'fill-opacity': s.opacity != null ? s.opacity : 1,
  };
  if (s['shape.border.color']) {
    attrs.stroke = s['shape.border.color'];
    attrs['stroke-width'] = s['shape.border.width'] || 1;
    attrs['stroke-opacity'] = s.opacity != null ? s.opacity : 1;
    attrs['stroke-linejoin'] = 'round';
  } else {
    attrs.stroke = 'none';
  }
  if (s['shape.dash.pattern'] && Array.isArray(s['shape.dash.pattern'])) {
    attrs['stroke-dasharray'] = s['shape.dash.pattern'].join(' ');
  }
  return attrs;
}

/**
 * 渲染一个画面 JSON
 * @param json 画面 JSON（{v,p,a,d}）
 * @param symbols 符号库对象（可选，symbolchange 状态切换需要）
 * @returns {width,height,shapes:[],texts:[],stateGroups:{bindKey:[{symbolIndex, opacity}]}, registry:{}}
 */
export function renderDisplay(json, symbols) {
  const width = (json.a && json.a.width) || 1280;
  const height = (json.a && json.a.height) || 1024;
  const shapes = [];
  const texts = [];
  const stateGroups = {}; // bindKey -> { key, point, stateSymbols:[symbolId...], transform, wrappers:[{idx, symbol}] }
  const registry = {};    // point -> [ { entry, type, bindKey, shapeIdx|textIdx } ]

  const entries = json.d || [];

  /** 注册数据点索引 */
  function reg(colIdx, entry, type) {
    const a = entry.a;
    if (!a || !a.interactive) return;
    const point = a.point || (entry.p && entry.p.tag);
    if (!point) return;
    const rec = {
      entry,
      type,
      a: a,
      bindKey: a.bindKey || null,
      idx: colIdx,
      point,
    };
    (registry[point] = registry[point] || []).push(rec);
  }

  entries.forEach((entry) => {
    if (!entry) return;
    const c = entry.c;
    if (c === 'ht.Shape') {
      const idx = shapes.length;
      shapes.push({
        attrs: shapePathAttrs(entry),
        interactive: !!(entry.a && entry.a.interactive),
        entry,
      });
      reg(idx, entry, 'shape');
    } else if (c === 'ht.Text') {
      const p = entry.p || {};
      const s = entry.s || {};
      const idx = texts.length;
      texts.push({
        x: p.position && coord(p.position.x),
        y: p.position && coord(p.position.y),
        text: s.text || '',
        fill: s['text.color'] || '#000',
        font: s['text.font'] || '12px SimSun',
        interactive: !!(entry.a && entry.a.interactive),
        entry,
      });
      reg(idx, entry, 'text');
    }
  });

  // symbolchange 状态组：绑定切换用的符号层
  for (const point in registry) {
    const recs = registry[point];
    const a = recs[0].a;
    if (a.stateKind !== 'symbolchange' && a.pointType !== 'symbolchange') continue;
    const key = a.bindKey;
    if (!key || stateGroups[key]) continue;
    // 去掉符号 ID 的 '#' 前缀（符号库键名不带 #）
    const norm = (sid) => String(sid).startsWith('#') ? String(sid).substring(1) : String(sid);
    const stateIds = (a.states && a.states.length ? a.states : [a.stateDefault])
      .map(norm);
    stateGroups[key] = {
      key,
      point,
      stateSymbols: stateIds,
      transform: a.groupTransform,
      current: 0,
      recs,
    };
  }

  return {
    width,
    height,
    shapes,
    texts,
    stateGroups,
    registry,
  };
}