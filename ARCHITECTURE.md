# cfg-view 系统架构设计

版本：v0.1（初版）
更新：2025-09-08

## 1. 目标

cfg-view 是一套「画面可视化 + 实时数据订阅 + 交互控制」的前后端一体化库：

- **画面显示**：渲染 HT 画师（ht-edit）导出的画面 JSON（如 `27F_SLJ.json`），
  画面中的每个元素可通过 **tag（点名）** 或绑定属性被定位。
- **数据订阅**：前端通过 WebSocket 向后端订阅库订阅点名数据，实时更新画面上的数值/颜色/状态。
- **交互控制**：点击画面元素弹出气泡菜单，点击菜单按钮后通过 WebSocket 向后端发送事件数据（如控制指令）。

## 2. 总体架构

```
┌────────────────────────────── 客户端 ──────────────────────────────┐
│  前端 (Vue3)                                                      │
│  ├─ 画面渲染器 (自定义 SVG 渲染, 无需商业 HT 依赖)                 │
│  ├─ 数据注册表 (点名 → 画面元素索引)                               │
│  ├─ WebSocket 订阅客户端                                           │
│  └─ 气泡菜单组件 (点击元素 → 菜单按钮 → 事件发送)                   │
└──────────────┬──────────────────────────────┬─────────────────────┘
               │ HTTP (画面/点位/业务)          │ WebSocket (订阅/推送)
┌──────────────▼──────────────────────────────▼─────────────────────┐
│                        后端多个服务 (Node.js + Koa)                │
│                                                                   │
│  service-data           service-subscription     service-business │
│  数据传输服务               订阅库服务               业务服务        │
│  ├ 点表管理/数据源接入     ├ WebSocket 网关          ├ 业务校验      │
│  ├ 画面数据访问           ├ 订阅关系管理            ├ 指令执行      │
│  ├ 模拟数据源(可替换)      ├ 数据推送广播            └ 事件记录      │
│  └ 提供点/画面 REST        └ 内部推送接口 (/internal)               │
└──────────────┬───────────────────────────────┬────────────────────┘
               │ HTTP 内部调用                    │ HTTP 内部调用
               ▼                                 ▼
        ┌─────────────────────────────────────────────────────┐
        │            公共支撑 (backend/common)                 │
        │  点表注册 (points.js) · 画面访问 (displays.js)       │
        │  数据源接口 (datasource) · 进程内事件总线 (hub.js)    │
        └─────────────────────────────────────────────────────┘
```

### 2.1 服务划分（三服务独立进程、独立端口）

| 服务 | 目录 | 端口 | 职责 |
|---|---|---|---|
| service-data（数据传输） | `backend/service-data` | 8101 | 点表注册与值维护、画面 JSON 访问、模拟/采集数据源、数据变化推送（调用订阅库内部接口） |
| service-subscription（订阅库） | `backend/service-subscription` | 8103 | WebSocket 网关：客户端订阅/取消点名，把数据变化、业务事件推送给相关客户端；提供 `/internal/push` 内部推送接口 |
| service-business（业务） | `backend/service-business` | 8102 | 接收前端事件/控制指令，做业务校验，把指令落到数据层，推送事件回馈 |

> 说明：
> - 三服务各自独立进程与端口，通过 HTTP 内部接口解耦，可单独部署/单独打包可执行程序；
> - 进程内 `common/hub.js` 为事件总线占位（订阅库内部使用），如需跨机部署可替换为 Redis/消息队列；
> - `backend/start.js` 一键同时启动三个服务（开发用）。

### 2.2 数据流

```
数据源(模拟器/采集) ──► service-data ──(HTTP /internal/push)──► service-subscription
                                                                │  订阅关系匹配
前端画面元素(点名) ◄──WebSocket 广播 { type:'data', point, value }  │
前端气泡菜单按钮 ─► service-business ──(指令执行)──► service-data   │
                  └──(HTTP /internal/push)──► service-subscription ─WebSocket 事件推送 { type:'event', ... }
```

## 3. 数据点模型

点名（Tag）：画面 JSON 中条目 `p.tag`（由 svg2json.js 从 SVG 事件中的点名自动绑定）。

| 字段 | 说明 |
|---|---|
| `name` | 点名（唯一），如 `RB.LCU27R.POL.BU85_SPL75_DI28` |
| `type` | 数据/展示类型：`string`、`number`、`symbolchange`、`colourchange`、`stringchange`、`ipmSymChange`、`bangtuchange` |
| `value` | 当前值（数值或状态序号或字符串） |
| `ts` | 更新时间（毫秒） |
| `source` | 数据来源（simulator 等） |
| `states` | 可选：由画面绑定声明的状态列表（颜色/文本/符号） |

前端注册表按点名索引画面元素：

```
registry: {
  "<点名>": [ { entry, elementRef, bindKey, renderer } , ... ]
}
```

## 4. 画面显示

- 画面 JSON（svg2json.js 生成）携带交互信息：
  - `p.tag`：点名（HT 兼容，可用 `dataModel.getDataByTag()` 或注册表查找）
  - `a.*`：绑定信息（`a.point`、`a.pointType`、`a.pointStates`、`a.menu`、`a.hyperLink`、`a.bindKey` 等）
- 符号库文件 `*.symbols.json`（svg2json.js 同步生成）：symbolchange 状态切换时，
  用 `a.groupTransform` 把状态符号的本地几何放到目标位置。
- 渲染器为自研轻量 SVG 渲染（`frontend/src/display/`），支持：
  - ht.Shape：`p.points` + `p.segments` → SVG path（1=M,2=L,3=Q,4=C,5=Z）
  - ht.Text：位置/字体/颜色
  - 状态切换：colourchange 变色、stringchange 换文本、symbolchange 换符号几何（叠加隐藏图层切换可见性）

## 5. 订阅与推送协议

### 5.1 WebSocket（前端 → service-subscription，路径 `/ws`）

```json
// 订阅
{ "op": "subscribe",   "points": ["P1", "P2"] }
// 取消
{ "op": "unsubscribe", "points": ["P1"] }
// 发送事件（气泡菜单动作）
{ "op": "event", "point": "P1", "action": "open", "payload": { } }
// 画面切换订阅（批量更换点位）
{ "op": "display", "display": "27F_SLJ", "points": ["P1", ...] }
```

### 5.2 推送（service-subscription → 前端）

```json
{ "type": "data",  "point": "P1", "value": 12.3, "ts": 1700000000000 }
{ "type": "event", "point": "P1", "action": "open", "result": "ok", "ts": ... }
{ "type": "state", "points": [ {"point":"P1","value":1}, ... ] }   // 批量快照
```

### 5.3 内部推送（data/business → subscription）

```
POST http://127.0.0.1:8103/internal/push
{ "kind": "data"|"event", "point": "...", "value": ...|null, "action": "...", "payload": {...} }
```

## 6. 打包产物（deploy）

| 产物 | 说明 | 方式 |
|---|---|---|
| 客户端软件（含后端服务） | 前端 dist + 三个后端服务 + Node 运行时，双击启动 | `deploy/pack-client.js`（生成 electron 工程骨架或本地捆绑启动器） |
| nginx web 静态资源包 | 前端构建产物 `frontend/dist` + 画面数据，配置 `deploy/nginx.conf.example`，反向代理 `/api.*` 到后端服务 | `npm run build` 后拷贝 dist |
| 各后端服务可执行程序 | 每个服务独立打包（pkg / node embed 运行环境），独立部署 | `deploy/pack-backend.js` |

## 7. 目录结构

```
cfg-view/
├── ARCHITECTURE.md              # 本文档
├── README.md                    # 快速启动
├── backend/                     # 后端（Node.js + Koa）
│   ├── package.json
│   ├── config.js                # 端口/路径配置
│   ├── common/                  # 共享库
│   │   ├── hub.js               # 进程内事件总线（可替换为 Redis）
│   │   ├── points.js            # 点表注册与取值
│   │   ├── displays.js          # 画面数据访问
│   │   └── datasource.js        # 数据源接口 + 模拟器
│   ├── service-data/
│   ├── service-subscription/
│   ├── service-business/
│   ├── start.js                 # 一键启动三个服务
│   └── var/                     # 运行时数据（值快照/事件日志）
├── frontend/                    # 前端（Vue3 + Vite）
│   ├── src/                     # 渲染器/订阅/气泡菜单
│   └── public/displays/         # 画面数据（由 test1 拷贝）
└── deploy/                      # 打包与部署