<template>
  <div class="display-view" ref="wrap">
    <!-- 画面选择 -->
    <div class="display-toolbar">
      <select v-model="current" @change="onSelect" :disabled="!displays.length">
        <option v-for="d in displays" :key="d.name" :value="d.name">{{ d.name }}</option>
      </select>
      <span class="dim">{{ width }} × {{ height }}</span>
      <button class="fit" @click="fit">适应</button>
    </div>

    <!-- 画面 SVG -->
    <div class="display-canvas" ref="canvas" @click.stop="onSvgClick">
      <!-- 自适应：SVG 撑满容器，viewBox + preserveAspectRatio 自动等比缩放并居中 -->
      <svg
        v-if="render"
        :viewBox="'0 0 ' + width + ' ' + height"
        preserveAspectRatio="xMidYMid meet"
        class="display-svg"
      >
        <!-- 基础图形 -->
        <path
          v-for="(sh, i) in render.shapes"
          :key="'s' + i"
          :d="sh.attrs.d"
          :fill="sh.attrs.fill"
          :fill-opacity="sh.attrs['fill-opacity']"
          :stroke="sh.attrs.stroke || 'none'"
          :stroke-width="sh.attrs.stroke ? sh.attrs['stroke-width'] : null"
          :stroke-opacity="sh.attrs['stroke-opacity']"
          :stroke-dasharray="sh.attrs['stroke-dasharray']"
          :stroke-linejoin="'round'"
          :data-idx="i"
          :data-point="sh.entry && sh.entry.a ? sh.entry.a.point : ''"
          :data-hyperlink="sh.entry && sh.entry.a ? (sh.entry.a.hyperLink || '') : ''"
          :data-interactive="sh.entry && sh.entry.a && sh.entry.a.interactive ? '1' : '0'"
          :pointer-events="(sh.entry && sh.entry.a && sh.entry.a.interactive) ? 'visiblePainted' : 'none'"
        />
        <!-- 符号状态图层（symbolchange）：每个状态一个隐藏图层，数据变化时切换可见性 -->
        <g
          v-for="grp in stateLayerList"
          :key="'g' + grp.key"
          :transform="matrixAttr(grp.transform)"
          :data-state-key="grp.key"
          :style="{ display: 'none' }"
        >
          <g v-for="(layer, li) in stateLayers(grp)" :key="'l' + li" :data-state-idx="li" :style="{ display: 'none' }">
            <template v-for="(prop, pi) in layer">
              <path v-if="prop.kind === 'path'" :key="'p' + pi" v-bind="prop.attrs" />
              <text v-else-if="prop.kind === 'text'"
                :key="'t' + pi" :x="prop.x" :y="prop.y" :fill="prop.fill"
                :font-family="fontFamily(prop.font)" :font-size="fontSize(prop.font)">{{ prop.text }}</text>
            </template>
          </g>
        </g>
        <!-- 文本 -->
        <text
          v-for="(tx, i) in render.texts"
          :key="'t' + i"
          :x="tx.x" :y="tx.y"
          :fill="tx.fill"
          :font-family="fontFamily(tx.font)"
          :font-size="fontSize(tx.font)"
          :data-idx="i"
          :data-kind="'text'"
          :data-point="tx.entry && tx.entry.a ? tx.entry.a.point : ''"
          :data-hyperlink="tx.entry && tx.entry.a ? (tx.entry.a.hyperLink || '') : ''"
          :data-interactive="tx.entry && tx.entry.a && tx.entry.a.interactive ? '1' : '0'"
          :pointer-events="(tx.entry && tx.entry.a && tx.entry.a.interactive) ? 'visiblePainted' : 'none'"
        >{{ tx.text }}</text>
      </svg>
      <div v-else class="loading">加载画面中…（请先启动后端三个服务）</div>
    </div>

    <!-- 气泡菜单 -->
    <BubbleMenu
      v-if="menu.visible"
      :x="menu.x" :y="menu.y"
      :rect="menu.rect"
      :entry="menu.entry"
      @action="onMenuAction"
      @close="menu.visible = false"
    />
  </div>
</template>

<script>
import { api } from '../services/api.js';
import { ws } from '../services/ws';
import { renderDisplay } from '../display/render.js';
import { symbolToProps, matrixAttr } from '../display/symbols.js';
import BubbleMenu from './BubbleMenu.vue';

export default {
  components: { BubbleMenu },
  data() {
    return {
      displays: [],
      current: '',
      render: null,
      symbols: {},
      width: 1280,
      height: 1024,
      menu: { visible: false, x: 0, y: 0, rect: null, entry: null },
      /** 点 → 视觉元素引用（由渲染后绑定 DOM 建立） */
      registry: {},
      stateLayerList: [],
    };
  },
  methods: {
    matrixAttr,

    fontFamily(font) {
      const m = String(font).match(/([^0-9]+)$/);
      return m ? m[1].split(',')[0].trim() : 'sans-serif';
    },
    fontSize(font) {
      const m = String(font).match(/([\d.]+)\s*px/);
      return m ? m[1] : '12';
    },
    /** 状态图层：每个状态符号 → 几何 props 数组 */
    stateLayers(grp) {
      return (grp.statesId || []).map((sid) => symbolToProps(this.symbols[sid] || []));
    },
    async refreshDisplays() {
      try {
        this.displays = await api.listDisplays();
      } catch (e) {
        this.displays = [];
      }
    },
    async onSelect() {
      await this.load(this.current);
    },
    async load(name) {
      if (!name) return;
      const json = await api.loadDisplay(name);
      if (!json) return;
      let symbols = {};
      try { symbols = (await api.loadSymbols(name)) || {}; } catch (e) { symbols = {}; }
      this.symbols = symbols;
      const r = renderDisplay(json, symbols);
      this.render = r;
      this.width = r.width;
      this.height = r.height;
      this.registry = r.registry;
      // 状态图层列表
      this.stateLayerList = [];
      for (const key in r.stateGroups) {
        const g = r.stateGroups[key];
        this.stateLayerList.push({ key, transform: g.transform, statesId: g.stateSymbols, group: g });
      }
      await this.$nextTick();
      this.bindDom();
      // 订阅当前画面所有点位
      const points = Object.keys(this.registry);
      ws.setDisplay(name, points);
      // 请求点快照（订阅库回复或通过 REST）
      this.fetchInitialValues();
    },
    /** 把 registry 与 DOM 元素关联（供 ws 更新时直接改 SVG 属性） */
    bindDom() {
      const svg = this.$refs.canvas ? this.$refs.canvas.querySelector('svg') : null;
      if (!svg) return;
      const shapeMap = {};
      svg.querySelectorAll('path[data-idx]').forEach((el) => {
        shapeMap['s' + el.getAttribute('data-idx')] = el;
      });
      const textMap = {};
      svg.querySelectorAll('text[data-idx]').forEach((el) => {
        textMap['t' + el.getAttribute('data-idx')] = el;
      });
      for (const point in this.registry) {
        for (const rec of this.registry[point]) {
          const el = rec.type === 'shape' ? shapeMap['s' + rec.idx] : textMap['t' + rec.idx];
          if (el) {
            rec.el = el;
            rec.setColor = (color) => { el.setAttribute('fill', color); };
            rec.setText = (txt) => { el.textContent = txt; };
          }
        }
      }
    },
    /** 画面打开时拉取一次点值（订阅推送到来前的初值） */
    fetchInitialValues() {
      try {
        api.listPoints().then((list) => {
          for (const p of list) {
            if (this.registry[p.name]) this.applyValue(p.name, p.value);
          }
        });
      } catch (e) { /* ignore */ }
    },
    /** 应用点值到绑定元素（由 ws 数据推送调用） */
    applyValue(point, value) {
      const recs = this.registry[point];
      if (!recs) return;
      for (const rec of recs) {
        const a = rec.a;
        const t = a.pointType;
        if (t === 'string') {
          if (rec.setText) rec.setText(String(value));
        } else if (t === 'colourchange') {
          const states = a.pointStates || [];
          const idx = this.stateIndex(value, states.length);
          const color = states[idx % states.length] || '#000';
          if (rec.setColor) rec.setColor(color);
        } else if (t === 'stringchange') {
          const states = a.pointStates || [];
          const idx = this.stateIndex(value, states.length);
          if (rec.setText) rec.setText(states[idx] || '');
        } else if (t === 'symbolchange' || a.stateKind === 'symbolchange') {
          // 交由状态图层切换
          this.switchStateLayer(a.bindKey, this.stateIndex(value, (a.states || []).length));
        } else if (t === 'ipmSymChange') {
          this.switchStateLayer(a.bindKey, this.stateIndex(value, (a.states || []).length));
        }
        // bangtuchange 等其它类型暂不处理视觉（可扩展闪烁）
      }
    },
    /** 状态序号：value 可能是数字状态 或 直接等于状态列表里的字符串 */
    stateIndex(value, len) {
      if (typeof value === 'number') return Math.max(0, Math.min(Math.floor(value), Math.max(len - 1, 0)));
      return 0;
    },
    /** 切换 symbolchange 状态图层可见性 */
    switchStateLayer(bindKey, idx) {
      const wrap = this.$refs.canvas ? this.$refs.canvas.querySelector('[data-state-key="' + bindKey + '"]') : null;
      if (!wrap) return;
      const children = Array.from(wrap.children);
      if (children.length === 0) return;
      const show = children[Math.min(idx, children.length - 1)];
      children.forEach((el) => { el.style.display = 'none'; });
      show.style.display = '';
      // 默认（全隐藏）时保持包裹层隐藏，避免多余捕获
      wrap.style.display = '';
    },
    /** 点击画布 → 命中交互元素 → 气泡菜单 */
    onSvgClick(e) {
      const target = e.target;
      if (!target || !target.getAttribute) return;
      const interactive = target.getAttribute && target.getAttribute('data-interactive') === '1';
      if (!interactive) { this.menu.visible = false; return; }
      const point = target.getAttribute('data-point') || '';
      // 元素在窗口中的范围（供气泡菜单围绕元素摆放，避免遮挡/出界）
      let rect = null;
      try {
        const r = target.getBoundingClientRect();
        if (r) rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      } catch (err) { /* ignore */ }
      this.menu = {
        visible: true,
        x: e.clientX,
        y: e.clientY,
        rect,
        entry: { point, hyperLink: target.getAttribute('data-hyperlink') || '' },
      };
    },
    /** 气泡菜单动作：优先走业务服务执行，同时已由 ws.sendEvent 广播 */
    async onMenuAction(actionId, payload) {
      const entry = this.menu.entry || {};
      this.menu.visible = false;
      if (entry.hyperLink) {
        // 画面跳转（本库内直接切换画面；也可调用业务服务）
        if (actionId === 'open') {
          const name = entry.hyperLink.replace(/\.svg$/i, '');
          const exists = this.displays.some((d) => d.name === name);
          if (exists) { this.current = name; await this.load(name); }
          else alert('画面 ' + entry.hyperLink + ' 不在 displays 库中');
        }
        return;
      }
      if (!entry.point) return;
      // 1) ws 事件广播
      ws.sendEvent(entry.point, actionId, payload || {});
      // 2) 业务服务执行（返回结果可显示）
      try {
        await api.executeCommand(entry.point, actionId, payload);
      } catch (e) { /* ignore */ }
    },
    /** 适应窗口：SVG 撑满容器，由 viewBox + preserveAspectRatio 自动等比缩放并居中 */
    fit() {
      const canvas = this.$refs.canvas;
      if (!canvas || !this.render) return;
      const svg = canvas.querySelector('svg');
      if (!svg) return;
      svg.style.width = '100%';
      svg.style.height = '100%';
    },
  },
  async mounted() {
    await this.refreshDisplays();
    const initName = this.current || (this.displays.length ? this.displays[0].name : '');
    if (initName) {
      this.current = initName;
      await this.load(initName);
    }
    // ws 数据推送 → 画面更新
    ws.on('data', (msg) => {
      if (msg.type === 'state') {
        for (const p of msg.points || []) this.applyValue(p.point, p.value);
      } else if (msg.point) {
        this.applyValue(msg.point, msg.value);
      }
    });
    ws.connect();
  },
};
</script>

<style scoped>
.display-view { width: 100%; height: 100%; display: flex; flex-direction: column; }
.display-toolbar {
  display: flex; align-items: center; gap: 8px; padding: 4px 10px;
  background: #2a3242; color: #cfd6e4; font-size: 13px;
}
.display-toolbar select { background: #1e2430; color: #cfd6e4; border: 1px solid #3a4560; }
.display-toolbar .dim { color: #7f8da0; }
.display-toolbar .fit { background: #3a4560; color: #cfd6e4; border: 0; cursor: pointer; }
/* 自适应：容器不滚动，SVG 撑满后由 viewBox 等比缩放、居中展示 */
.display-canvas {
  flex: 1; overflow: hidden; background: #171b24;
  display: flex; align-items: center; justify-content: center;
}
.display-canvas svg { width: 100%; height: 100%; }
.loading { color: #7f8da0; padding: 40px; }
</style>