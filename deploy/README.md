# cfg-view 部署与打包说明

## 1. 产物列表

| # | 产物 | 内容 | 说明 |
|---|------|------|------|
| 1 | **nginx web 静态资源包** | `frontend/dist` + `frontend/public/displays` | 画面前端静态文件，反向代理 `/api.*` 到后端服务 |
| 2 | **后端服务可执行程序** | `service-data` / `service-subscription` / `service-business` 三份 | 每服务独立打包、独立进程、独立端口部署 |
| 3 | **客户端软件（含后端服务）** | 前端 dist + 三个后端服务 + Node 运行时 | 双击启动，浏览器或内嵌界面打开画面 |

---

## 2. nginx web 静态资源包

### 2.1 构建前端

```bash
cd frontend
npm install
npm run build
# 产物：frontend/dist/（含 index.html 与 assets/）
# 画面数据：frontend/public/displays/ 拷贝到静态根目录下的 displays/
```

### 2.2 部署（nginx.conf 示例见 nginx.conf.example）

```
静态根：/srv/cfg-view/web      ← dist/* + displays/*
服务：  :8101 (data), :8102 (business), :8103 (subscription ws)
```

前端通过 URL 参数指定服务地址，或在构建时把 `src/config.js` 固定为部署地址。

---

## 3. 后端服务可执行程序

### 3.1 直接部署（Node 环境）

```bash
cd backend
npm install --production
# 三个服务各自独立启动：
node service-data/index.js
node service-business/index.js
node service-subscription/index.js
```

### 3.2 打包为可执行程序（可选）

任一 Node 打包工具均可（如 `pkg` / `node-tap` / 自研运行时捆绑）：

```bash
# 示例：用 pkg 将每个服务打成单文件 exe
npm i -g @yao-pkg/pkg
pkg backend/service-data/index.js         -o bin/service-data
pkg backend/service-business/index.js     -o bin/service-business
pkg backend/service-subscription/index.js -o bin/service-subscription
```

生成的三个可执行程序 + `frontend/dist` 即构成最小部署集。

---

## 4. 客户端软件（含后端服务）

方案 A — **本地捆绑启动器（最简单）**：
`deploy/pack-client.js` 把前端 `dist` + `backend`（含 node_modules）+ 画面数据
合成一个自包含目录，提供 `启动客户端.bat`：启动三个后端服务并打开系统浏览器。

方案 B — **Electron 桌面应用**（`client/`）：
以 Electron（≥ 37，内置 Node ≥ 22）作为主进程，启动时以子进程方式
（`ELECTRON_RUN_AS_NODE=1`）拉起三个后端服务，窗口内嵌画面前端。

```bash
# 0. 一次安装（CI 等价：cd backend && npm ci 等）
cd backend  && npm ci
cd frontend && npm ci && npm run build   # 产物 frontend/dist
cd client   && npm ci

# 1. 组装客户端资源（frontend/dist + displays → client/web；backend → client/backend）
cd client && npm run prep

# 2. 打包
cd client
npm run build-client:win-x64      # dist/cfg-view-1.0.0-win-x64.exe（可移植 exe）
npm run build-client:linux-x64    # dist/cfg-view-1.0.0-linux-x64.AppImage
npm run build-client:linux-arm64  # 如需 ARM 版

# 本地调试（开发模式）
cd client && npm start
```

产物/布局（electron-builder extraResources，不在 asar 内，便于后端子进程读取）：

```
cfg-view.exe / cfg-view.AppImage
└─ resources/
   ├─ web/          # 前端 dist + displays（file:// 内嵌加载）
   └─ backend/      # 三服务 + start.js + node_modules（由 Electron 内置 Node 运行时执行）
```

要点：

- 后端脚本使用新版 Node fs 同步 API（`readFileSync`/`appendFileSync`/…），
  因此 Electron 必须内置 Node ≥ 22（本项目锁 electron ^37，内置 Node 22）。
- 运行数据（事件日志）经 `CFG_VAR_DIR` 指向用户数据目录，避免安装目录只读；
  三个服务端口可用 `CFG_DATA_PORT` / `CFG_BUSINESS_PORT` / `CFG_SUB_PORT` 覆盖。
- 退出时主进程用 `taskkill /T`（Windows）回收后端子进程树，避免端口残留。
- 冒烟测试：`CFG_SMOKE_TEST=1` 时应用启动并加载页面后自动退出（CI 中使用）。

GitHub Actions（`.github/workflows/build-release.yml`，参考 data-in-png 方案）：
每次 push 触发 → 分别在 windows-latest / ubuntu-latest / ubuntu-24.04-arm 上
构建 exe / AppImage → 上传 Actions artifact → 发布到 GitHub Releases
（版本 tag：`v<版本>-build.<运行号>`，滚动 tag：`latest-build`）。
需要时可在仓库 Settings → Actions → General 打开 Workflow permissions 的
写入权限（或该仓库已有）以便发布 Release。

---

## 5. 服务地址与配置

统一在 `backend/config.js` 修改端口与数据源（默认 `simulator` 模拟采集，
接入真实系统时实现 `backend/common/datasource.js` 的 `IDataSource` 接口替换即可）。