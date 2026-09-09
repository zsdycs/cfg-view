# cfg-view

画面可视化 + 实时数据订阅 + 交互控制 的一体化前后端库。

- **画面显示**：渲染 ht-edit 导出的画面 JSON（`svg2json.js` 转换、绑定点名），自研轻量 SVG 渲染器（不依赖商业 HT 运行时）。
- **数据订阅**：前端通过 WebSocket 订阅库订阅点名，实时更新画面上的数值 / 颜色 / 状态。
- **交互控制**：点击画面元素弹出气泡菜单，菜单按钮动作通过 WebSocket + 业务服务下发。

架构设计见 **[ARCHITECTURE.md](./ARCHITECTURE.md)**。

## 目录

```
cfg-view/
├── ARCHITECTURE.md      # 架构设计
├── backend/             # Node.js + Koa 三服务（数据传输 / 订阅库 / 业务）
├── frontend/            # Vue3 + Vite 前端（自研渲染器 + ws 订阅 + 气泡菜单）
└── deploy/              # nginx / 客户端 / 服务可执行程序 打包说明
```

## 快速启动

### 1. 启动后端（三服务：data 8101 / business 8102 / subscription 8103）

```bash
cd backend
npm install
npm start          # 一键启动三个服务
```

### 2. 启动前端（开发）

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

默认画面数据位于 `frontend/public/displays/`（由 ht-edit `storage/displays/test1` 转换/拷贝而来）。

> 前端默认把 `/api/*` 代理到本地后端；也可通过 URL 参数指定服务地址，例如：
> `http://host:5173/?data=http://host:8101&ws=ws://host:8103&business=http://host:8102`

### 3. 生产构建

```bash
cd frontend && npm run build   # 产物在 frontend/dist
```

## 画面数据来源

1. 用 `svg2json.js` 将 SVG 画面转换为 JSON（自动携带交互 / 点名绑定）：

```bash
node svg2json.js <存放 SVG 的目录>
# 生成：同名.json（画面）+ 同名.symbols.json（符号库）
```

2. 把生成的 JSON 拷贝到 `frontend/public/displays/`。

画面 JSON 的交互标注（由 svg2json.js 写入）：

| 字段 | 说明 |
|---|---|
| `p.tag` | 点名（数据点 ID），HT 兼容 |
| `a.point` | 点名 |
| `a.pointType` | `string` / `symbolchange` / `colourchange` / `stringchange` / `ipmSymChange` / `bangtuchange` |
| `a.pointStates` | 状态列表（颜色 / 文本 / 符号 ID） |
| `a.menu` / `a.menuPoint` | 右键菜单（strMenu） |
| `a.hyperLink` | 画面跳转目标 |
| `a.bindKey` / `a.states` / `a.stateDefault` / `a.groupTransform` | symbolchange 状态切换组 |

## 数据订阅（示例）

前端画面加载后会把画面内全部点名发到订阅库：

```json
{ "op": "display", "display": "27F_SLJ", "points": ["RB.LCU27R.ANA.PG2__P1MP__AI13", "..."] }
```

订阅库推送：

```json
{ "type": "data", "point": "RB.LCU27R.ANA.PG2__P1MP__AI13", "value": 12.3, "ts": 1700000000000 }
```

前端注册表按点名更新：文本值、颜色（colourchange）、符号状态（symbolchange 叠加图层切换）。

## 交互（示例）

点击画面中可交互元素 → 气泡菜单（详情 / 控制 / 确认 / 刷新）→ 点击按钮：

1. 前端 `ws.sendEvent(point, action, payload)` 广播事件；
2. 前端同时调用业务服务 `POST /api/commands/execute`（校验 + 落数据 + 推送事件回馈）。

详见 `ARCHITECTURE.md` 的协议章节。打包部署见 `deploy/README.md`。