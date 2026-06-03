# CSV Analyze

A full-stack web application based on `@anthropic-ai/claude-agent-sdk` that automatically analyzes uploaded CSV files — generating Vega-Lite charts and written insights.

Runs on EdgeOne Makers with a React + Tailwind frontend.

## Deploy

[![Deploy with EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=csv-analyze-agent&from=within&fromAgent=1&agentLang=typescript)

## Features

- **Drag & drop CSV upload** with automatic encoding detection (UTF-8, GBK, UTF-16)
- **Two-agent pipeline**:
  - **Chart Agent** — profiles CSV data and generates 3–6 Vega-Lite charts rendered as SVG
  - **Insight Agent** — reads chart metadata and writes data-driven insights with specific numbers
- **Real-time SSE streaming** — watch agents think and work in real time
- **Markdown + HTML reports** — downloadable analysis reports with embedded SVGs
- **Analysis history** — persistent history with full artifact retrieval via EdgeOne store
- **Demo mode** — faster analysis with fewer charts for quick previews

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS v4, Framer Motion, CSS Modules |
| Backend | EdgeOne Maker |
| AI | `@anthropic-ai/claude-agent-sdk` |
| Charts | Vega-Lite |
| CSV | PapaParse, iconv-lite, simple-statistics |

## Getting Started

### Prerequisites

- Node.js 18+
- An AI gateway or Anthropic API key

### Install

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```env
AI_GATEWAY_BASE_URL=https://your-gateway-url
AI_GATEWAY_API_KEY=your-api-key
```

### Development

```bash
edgeone makers dev
```

### Build

```bash
edgeone makers build
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                        │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │DropZone │→ │ PassCard │→ │AgentCanvas│→ │ReportView │  │
│  └─────────┘  └──────────┘  └───────────┘  └───────────┘  │
│        │              SSE stream ↑                           │
└────────┼──────────────────────┼─────────────────────────────┘
         ↓ POST /upload         ↓ POST /analyze/stream
┌─────────────────────────────────────────────────────────────┐
│  EdgeOne Makers                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  analyze()                                             │ │
│  │  ┌─────────────┐         ┌──────────────┐             │ │
│  │  │ Chart Agent │ ──MCP──→│ Insight Agent│             │ │
│  │  │ (3-6 charts)│         │ (insights)   │             │ │
│  │  └─────────────┘         └──────────────┘             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### API Routes

All routes use POST (EdgeOne runtime limitation). The "Side" column shows whether the route is served by `agents/` (stateful — owns the in-memory Session map and SSE streams) or `cloud-functions/` (stateless — only reads `context.agent.store`):

| Route | Side | Purpose |
|-------|------|---------|
| `/upload` | `agents/` | Multipart CSV upload; returns taskId + profile |
| `/analyze` | `agents/` | `action: "get"\|"start"\|"cancel"\|"delete"` |
| `/analyze/stream` | `agents/` | SSE stream (body: `{taskId}`) |
| `/analyze/rerun-insights` | `agents/` | Re-run insight agent on existing charts |
| `/analyze/download` | `agents/` | Download report files |
| `/analyze/stop` | `agents/` | Platform-native abort via `context.utils.abortActiveRun()` |
| `/static` | `agents/` | Serve generated SVG/chart files (touches the live session to keep it alive while a tab views it) |
| `/history` | `cloud-functions/` | Per-conversation analysis history |
| `/history-detail` | `cloud-functions/` | Full analysis artifacts (SVG, insights, report HTML) for a given taskId |

### Project Structure

```
csv-analyze/
├── agents/                  # Stateful EdgeOne Makers Agent Functions (own the Session map + SSE streams)
│   ├── _lib/               # Shared libraries
│   │   ├── analyze.ts      # Two-agent orchestration
│   │   ├── system-prompt.ts # Agent system prompts
│   │   ├── report.ts       # Markdown/HTML report assembly
│   │   ├── session.ts      # In-memory session management
│   │   ├── events.ts       # Typed event protocol
│   │   ├── tools/
│   │   │   ├── chart-agent/   # MCP tools for Chart Agent
│   │   │   ├── insight-agent/ # MCP tools for Insight Agent
│   │   │   └── shared/       # Shared utilities (CSV stats, cache)
│   │   └── ...
│   ├── analyze/            # /analyze, /analyze/stream, /analyze/rerun-insights, /analyze/download, /analyze/stop
│   ├── upload/             # /upload route
│   └── static/             # /static route — serves SVG/chart files from the live session
├── cloud-functions/         # Stateless EdgeOne Pages Node Functions (read-only on context.agent.store)
│   ├── history/            # /history — per-conversation analysis records
│   ├── history-detail/     # /history-detail — full artifacts blob for one taskId
│   ├── _http.ts            # Shared HTTP helpers
│   └── _logger.ts          # Logger utility
├── src/                    # Frontend (React SPA)
│   ├── components/         # UI components with CSS Modules
│   ├── hooks/              # useAgentStream (SSE state machine)
│   ├── lib/                # API client, event types, formatters
│   └── types.ts            # Frontend type definitions
├── index.html
└── package.json
```

> **Why two backend folders?** `agents/` and `cloud-functions/` run in separate process contexts on EdgeOne. The agents process owns the `Map<string, Session>` and the per-conversation lifecycle (running tasks, abort signals, SSE streams); the cloud-functions process is stateless and reaches the persisted store via `context.agent.store`. Routes that don't need a live Session live in `cloud-functions/` so they don't compete with active analyses for the per-conversation lock.
