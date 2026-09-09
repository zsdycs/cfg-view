/** REST 客户端 */
import { cfg } from '../config.js';

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}

export const api = {
  /** 画面列表 */
  listDisplays: () => get(cfg.data + '/api/displays'),
  /** 画面 JSON（本地静态也可直接 fetch public/displays） */
  loadDisplay: (name) => get(cfg.data + '/api/displays/' + encodeURIComponent(name)),
  /** 符号库（symbolchange 状态切换） */
  loadSymbols: (name) => get(cfg.data + '/api/displays/' + encodeURIComponent(name) + '/symbols'),
  /** 点表与点值 */
  listPoints: () => get(cfg.data + '/api/points'),
  point: (name) => get(cfg.data + '/api/points/' + encodeURIComponent(name)),
  /** 气泡菜单可用动作模板 */
  actionsOf: (point) => get(cfg.business + '/api/actions/point/' + encodeURIComponent(point)),
  /** 执行业务动作 */
  executeCommand: (point, action, payload) =>
    post(cfg.business + '/api/commands/execute', { point, action, payload: payload || {} }),
};