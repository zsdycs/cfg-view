<template>
  <div class="bubble-menu" :style="menuStyle" @click.stop>
    <div class="bm-title">操作</div>
    <button v-for="act in actions" :key="act.id" @click="fire(act.id)">
      {{ act.label }}
    </button>
    <button class="bm-close" @click="$emit('close')">关闭</button>
  </div>
</template>

<script>
import { api } from '../services/api.js';
import { cfg } from '../config.js';

export default {
  props: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    /** 点击元素在窗口中的范围 { left, top, width, height }（client 坐标） */
    rect: { type: Object, default: null },
    entry: { type: Object, default: () => ({}) },
  },
  data() {
    return { actions: [], left: 0, top: 0, ready: false };
  },
  computed: {
    // 先隐藏测量，reposition 完成后一次性显示，避免闪烁/错位
    menuStyle() {
      return {
        left: this.left + 'px',
        top: this.top + 'px',
        visibility: this.ready ? 'visible' : 'hidden',
      };
    },
  },
  async mounted() {
    // 默认动作模板；优先向业务服务获取
    const def = [
      { id: 'open', label: '详情' },
      { id: 'control', label: '控制' },
      { id: 'ack', label: '确认' },
      { id: 'refresh', label: '刷新' },
    ];
    this.actions = def;
    if (this.entry && this.entry.point && cfg.business) {
      try {
        const r = await api.actionsOf(this.entry.point);
        if (r && r.actions && r.actions.length) this.actions = r.actions;
      } catch (e) { /* 业务服务未启动时用默认模板 */ }
    }
    this.left = this.x;
    this.top = this.y;
    await this.$nextTick();
    this.reposition();
    this.ready = true;
  },
  methods: {
    /**
     * 根据菜单自身尺寸 + 元素位置，在元素四周选择不遮挡、不越界的摆放位置。
     * 优先级：右侧（垂直居中）→ 左侧（垂直居中）→ 下方（水平居中）→ 上方（水平居中）→ 兜底钳制
     */
    reposition() {
      const el = this.$el;
      const w = el.offsetWidth || 140;
      const h = el.offsetHeight || 120;
      const vw = window.innerWidth, vh = window.innerHeight;
      const gap = 8, pad = 8;

      const clampX = (x) => Math.max(pad, Math.min(x, vw - w - pad));
      const clampY = (y) => Math.max(pad, Math.min(y, vh - h - pad));
      const fits = (p) => p.x >= pad - 0.5 && p.y >= pad - 0.5 &&
                          p.x + w <= vw - pad + 0.5 && p.y + h <= vh - pad + 0.5;

      let p;
      const r = this.rect;
      if (r && (r.width > 0 || r.height > 0)) {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const candidates = [
          { x: r.right + gap, y: cy - h / 2 },      // 右：紧贴元素右侧，垂直居中
          { x: r.left - gap - w, y: cy - h / 2 },   // 左：紧贴元素左侧，垂直居中
          { x: cx - w / 2, y: r.bottom + gap },     // 下：元素下方，水平居中
          { x: cx - w / 2, y: r.top - gap - h },    // 上：元素上方，水平居中
        ];
        p = candidates.find(fits);
        if (!p) p = candidates[0];
      } else {
        p = { x: this.left, y: this.top };
      }
      this.left = Math.round(clampX(p.x));
      this.top = Math.round(clampY(p.y));
    },
    fire(actionId) {
      this.$emit('action', actionId, {});
    },
  },
};
</script>

<style scoped>
.bubble-menu {
  position: fixed; z-index: 999;
  background: #232a38; border: 1px solid #3a4560; border-radius: 6px;
  padding: 6px 10px; box-shadow: 0 6px 18px rgba(0,0,0,.5);
  min-width: 120px; color: #cfd6e4;
}
.bm-title { font-size: 12px; color: #7f8da0; margin-bottom: 4px; }
.bubble-menu button {
  display: block; width: 100%; margin: 2px 0; padding: 5px 0;
  background: #33405a; color: #e6ecf5; border: 0; border-radius: 4px; cursor: pointer;
}
.bm-close { background: #4a3a5a; color: #cfd6e4; }
</style>