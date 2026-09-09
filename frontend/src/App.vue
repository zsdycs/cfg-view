<template>
  <div class="app">
    <header class="app-header">
      <!-- <h1>cfg-view</h1> -->
      <!-- <span class="sub">画面可视化 · 数据订阅 · 交互控制</span> -->
      <div class="status">
        <span class="dot" :style="{ background: wsOk ? '#3fbf6f' : '#e05b5b' }"></span>
        {{ wsOk ? '订阅已连接' : '订阅未连接(重连中…)' }}
        <span v-if="pointCount > 0" class="pt">| 已绑定点位 <b>{{ pointCount }}</b></span>
      </div>
    </header>
    <DisplayView ref="dv" />
  </div>
</template>

<script>
import DisplayView from './components/DisplayView.vue';
import { ws } from './services/ws';

export default {
  components: { DisplayView },
  data() {
    return { wsOk: false, pointCount: 0 };
  },
  mounted() {
    ws.on('connected', () => { this.wsOk = true; });
    ws.on('disconnected', () => { this.wsOk = false; });
    this.wsOk = ws.connected;
  },
};
</script>

<style>
#app, html, body { height: 100%; }
.app { width: 100%; height: 100%; display: flex; flex-direction: column; }
.app-header {
  height: 44px; background: #232a38; color: #e6ecf5; display: flex; align-items: center;
  padding: 0 16px; gap: 10px;
}
.app-header h1 { font-size: 16px; margin: 0; }
.app-header .sub { color: #7f8da0; font-size: 12px; }
.status { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #b8c2d4; margin-left: auto; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.pt b { color: #e6ecf5; }
</style>