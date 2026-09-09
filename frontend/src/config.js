/**
 * cfg-view 前端配置：后端服务地址
 * 可通过 URL 参数覆盖（便于不同部署环境）：
 *   ?data=http://host:8101&ws=ws://host:8103&business=http://host:8102
 */
function param(name, def) {
  const m = window.location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : def;
}

export const cfg = {
  // 数据传输服务（画面/点位 REST）
  data: param('data', 'http://127.0.0.1:8101'),
  // 业务服务（菜单动作/控制指令）
  business: param('business', 'http://127.0.0.1:8102'),
  // 订阅库（WebSocket）
  ws: param('ws', 'ws://127.0.0.1:8103/ws'),
  // 默认画面
  defaultDisplay: param('display', ''),
  // 轮询周期（订阅库不可用时降级，保持画面仍有更新演示）
  fallbackPollMs: 1000,
};