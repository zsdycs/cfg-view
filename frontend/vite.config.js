import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // 相对路径：Electron 中通过 file:// 加载 index.html 时也能找到资源
  base: './',
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 开发时把 /api 反向代理到后端三个服务
      '/api/displays': { target: 'http://127.0.0.1:8101', changeOrigin: true },
      '/api/points':   { target: 'http://127.0.0.1:8101', changeOrigin: true },
      '/api/health':   { target: 'http://127.0.0.1:8101', changeOrigin: true },
      '/api/commands': { target: 'http://127.0.0.1:8102', changeOrigin: true },
      '/api/actions':  { target: 'http://127.0.0.1:8102', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2000,
  },
});