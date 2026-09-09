/**
 * 符号库渲染辅助
 * cfg-view 的 .symbols.json 由 svg2json.js 生成：
 *   { symbolId: [ {c:'ht.Shape',p,s}, {c:'ht.Text',p,s}, ... ] }
 * 符号条目坐标为其“符号本地坐标系”（默认 use 矩形 -25,-25,50,50 经 viewBox 映射）。
 * 使用时用 groupTransform（矩阵）作为 <g transform="matrix(a b c d tx ty)"> 包裹。
 */
import { shapePathAttrs } from './render.js';

/** 把一个符号的条目转为 SVG 子元素描述 */
export function symbolToProps(symbolEntries) {
  const out = [];
  for (const e of symbolEntries || []) {
    if (!e) continue;
    if (e.c === 'ht.Shape') {
      out.push({ kind: 'path', attrs: shapePathAttrs(e) });
    } else if (e.c === 'ht.Text') {
      const p = e.p || {}, s = e.s || {};
      out.push({
        kind: 'text',
        x: p.position && p.position.x,
        y: p.position && p.position.y,
        text: s.text || '',
        fill: s['text.color'] || '#000',
        font: s['text.font'] || '12px SimSun',
      });
    }
  }
  return out;
}

/** 矩阵数组 → SVG transform 属性值 */
export function matrixAttr(m) {
  if (!m || m.length < 6) return '';
  const [a, b, c, d, tx, ty] = m;
  return `matrix(${a} ${b} ${c} ${d} ${tx} ${ty})`;
}