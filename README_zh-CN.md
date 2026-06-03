# CSV Analyze

一个全栈 Web 应用，基于 `@anthropic-ai/claude-agent-sdk` 自动分析上传的 CSV 文件，生成 Vega-Lite 图表和文字洞察。

模版项目运行在 EdgeOne Makers 上，前端使用 React + Tailwind。

## 部署

[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/makers/new?template=csv-analyze-agent&from=within&fromAgent=1&agentLang=typescript)

## 功能特性

- **拖拽上传 CSV**，自动编码检测（UTF-8、GBK、UTF-16）
- **双 Agent 流水线**：
  - **Chart Agent** — 分析 CSV 数据结构，生成 3–6 张 Vega-Lite 图表并渲染为 SVG
  - **Insight Agent** — 读取图表元数据，撰写基于数据的洞察（包含具体数字）
- **实时 SSE 流** — 实时观看 Agent 的思考和工作过程
- **Markdown + HTML 报告** — 可下载的分析报告，内嵌 SVG 图表
- **分析历史** — 通过 EdgeOne store 持久化保存历史记录和完整制品
- **Demo 模式** — 更快速的分析，生成更少图表，适合快速预览

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18, Tailwind CSS v4, Framer Motion, CSS Modules |
| 后端 | EdgeOne Maker |
| AI | `@anthropic-ai/claude-agent-sdk` |
| 图表 | Vega-Lite|
| CSV | PapaParse, iconv-lite, simple-statistics |

## 快速开始

### 前置要求

- Node.js 18+
- AI 网关或 Anthropic API 密钥

### 安装

```bash
npm install
```

### 环境变量

创建 `.env` 文件：

```env
AI_GATEWAY_BASE_URL=https://your-gateway-url
AI_GATEWAY_API_KEY=your-api-key
```

### 开发

```bash
edgeone makers dev
```

### 构建

```bash
edgeone makers build
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器 (React SPA)                                         │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │DropZone │→ │ PassCard │→ │AgentCanvas│→ │ReportView │  │
│  └─────────┘  └──────────┘  └───────────┘  └───────────┘  │
│        │              SSE 流 ↑                              │
└────────┼──────────────────────┼─────────────────────────────┘
         ↓ POST /upload         ↓ POST /analyze/stream
┌─────────────────────────────────────────────────────────────┐
│  EdgeOne Makers                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  analyze()                                             │ │
│  │  ┌─────────────┐         ┌──────────────┐             │ │
│  │  │ Chart Agent │ ──MCP──→│ Insight Agent│             │ │
│  │  │ (3-6 张图表) │         │ (撰写洞察)   │             │ │
│  │  └─────────────┘         └──────────────┘             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### API 路由

所有路由使用 POST（EdgeOne 运行时限制）。「所在目录」一列说明该路由由 `agents/`（有状态，持有内存 Session map 和 SSE 流）还是 `cloud-functions/`（无状态，仅读 `context.agent.store`）提供：

| 路由 | 所在目录 | 用途 |
|------|----------|------|
| `/upload` | `agents/` | Multipart CSV 上传；返回 taskId + profile |
| `/analyze` | `agents/` | `action: "get"\|"start"\|"cancel"\|"delete"` |
| `/analyze/stream` | `agents/` | SSE 流（body: `{taskId}`） |
| `/analyze/rerun-insights` | `agents/` | 基于已有图表重跑 Insight Agent |
| `/analyze/download` | `agents/` | 下载报告文件 |
| `/analyze/stop` | `agents/` | 通过 `context.utils.abortActiveRun()` 走平台原生中断 |
| `/static` | `agents/` | 提供生成的 SVG / 图表文件（访问时会刷新对应 session 的 TTL，防止用户查看图表期间被回收） |
| `/history` | `cloud-functions/` | 按对话维度的分析历史 |
| `/history-detail` | `cloud-functions/` | 某个 taskId 的完整制品（SVG、洞察、报告 HTML） |

### 项目结构

```
csv-analyze/
├── agents/                  # 有状态的 EdgeOne Makers Agent Functions（持有 Session map 和 SSE 流）
│   ├── _lib/               # 共享库
│   │   ├── analyze.ts      # 双 Agent 编排
│   │   ├── system-prompt.ts # Agent 系统提示词
│   │   ├── report.ts       # Markdown/HTML 报告组装
│   │   ├── session.ts      # 内存 Session 管理
│   │   ├── events.ts       # 类型化事件协议
│   │   ├── tools/
│   │   │   ├── chart-agent/   # Chart Agent 的 MCP 工具
│   │   │   ├── insight-agent/ # Insight Agent 的 MCP 工具
│   │   │   └── shared/       # 共享工具（CSV 统计、缓存）
│   │   └── ...
│   ├── analyze/            # /analyze、/analyze/stream、/analyze/rerun-insights、/analyze/download、/analyze/stop
│   ├── upload/             # /upload 路由
│   └── static/             # /static 路由 — 从活跃 session 读取并返回 SVG/图表
├── cloud-functions/         # 无状态的 EdgeOne Pages Node Functions（只读 context.agent.store）
│   ├── history/            # /history — 按对话维度的分析记录
│   ├── history-detail/     # /history-detail — 某 taskId 的完整制品
│   ├── _http.ts            # 共享 HTTP 辅助函数
│   └── _logger.ts          # 日志工具
├── src/                    # 前端（React SPA）
│   ├── components/         # UI 组件 + CSS Modules
│   ├── hooks/              # useAgentStream（SSE 状态机）
│   ├── lib/                # API 客户端、事件类型、格式化工具
│   └── types.ts            # 前端类型定义
├── index.html
└── package.json
```

> **为什么后端拆成两个目录？** 在 EdgeOne 上 `agents/` 和 `cloud-functions/` 跑在不同的进程上下文里。agents 进程持有 `Map<string, Session>` 和按会话维度的生命周期（运行中的任务、abort 信号、SSE 流）；cloud-functions 进程是无状态的，通过 `context.agent.store` 访问持久化数据。不需要活跃 Session 的路由放在 `cloud-functions/`，这样它们就不会和正在跑的分析争抢同一会话的锁。
