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

方案 B — **Electron 桌面应用**（后续扩展）：
`deploy/electron/` 预留工程骨架：主进程嵌入前端，随应用启动时
以子进程拉起三个后端服务（data/business/subscription），退出时统一回收。

```bash
cd deploy
node pack-client.js      # 产物在 dist-client/
```

打包产物结构：

```
dist-client/
├── 启动客户端.bat（Windows 双击启动）
├── web/                 # 前端 dist + displays
├── backend/             # 三个服务 + node_modules
└── node.exe             # 捆绑的 Node 运行时（可选）
```

---

## 5. 服务地址与配置

统一在 `backend/config.js` 修改端口与数据源（默认 `simulator` 模拟采集，
接入真实系统时实现 `backend/common/datasource.js` 的 `IDataSource` 接口替换即可）。