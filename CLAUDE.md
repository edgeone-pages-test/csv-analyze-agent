# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CSV Analyze is a full-stack web application that uses a two-agent AI pipeline (via `@anthropic-ai/claude-agent-sdk`) to automatically analyze uploaded CSV files — generating Vega-Lite charts and written insights. It runs on EdgeOne Pages Functions (Tencent Cloud) with a React + Tailwind frontend.

## Development Commands

```bash
npm run dev            # Start Vite dev server (frontend only, port 5173)
npm run dev:agents     # Start EdgeOne Pages dev server (backend agents, port 8088)
npm run build          # TypeScript check + Vite production build
npm run typecheck      # TypeScript type checking only (tsc --noEmit)
```

Both `dev` and `dev:agents` must run simultaneously during development. The Vite dev server proxies `/upload`, `/analyze`, `/history`, `/static` to the EdgeOne backend at localhost:8088.

## Architecture

### Two-Layer Split

- **Frontend** (`src/`): React 18 SPA with CSS Modules + Tailwind v4. Single-page state machine driven by SSE events from the backend.
- **Backend** (`agents/`): EdgeOne Pages Functions (file-based routing). Each file exports `onRequest(context)`. All routes use POST (EdgeOne runtime limitation — no query params on GET).

### Agent Pipeline (`agents/_lib/analyze.ts`)

The core analysis orchestrates two Claude agents sequentially via `@anthropic-ai/claude-agent-sdk`'s `query()` + `createSdkMcpServer()`:

1. **Chart Agent** — receives CSV profile, plans 3–6 charts, renders Vega-Lite specs to SVG via custom MCP tools (`profile_csv`, `sample_rows`, `get_column_values`, `compute_correlation`, `render_chart`, `save_chart_meta`).
2. **Insight Agent** — reads cached profile + chart metadata, writes per-chart insights and an overall summary via MCP tools (`read_profile`, `read_chart_meta`, `read_column_stats`, `read_correlation`, `save_insight`).

Both agents have `demoMode` variants (faster, fewer charts, lower budget caps).

### Event / SSE Protocol (`agents/_lib/events.ts`)

A typed union `AgentEvent` flows: backend `analyze()` → `onEvent` callback → in-memory `Session.events[]` → SSE stream → frontend `useAgentStream` reducer. Event types: `session`, `agent`, `tool`, `chart`, `insight`, `cost`, `done`, `error`.

### Session Management (`agents/_lib/session.ts`)

In-memory `Map<string, Session>` — sessions persist within a single EdgeOne process instance. Auto-sweeper evicts sessions after 24h (configurable via `SESSION_TTL_MS` env var). Max 200 concurrent sessions.

### Frontend State Machine (`src/hooks/useAgentStream.ts`)

Phases: `idle` → `scanning` → `charting` → `insights` → `report`. The reducer replays all `AgentEvent`s (including session restore from URL `?task=xxx`).

## Key API Routes

All routes are POST with JSON body (except `/upload` which is multipart):

| Route | Purpose |
|-------|---------|
| `/upload` | Multipart CSV upload; returns `taskId` + profile |
| `/analyze` | `action: "get"\|"start"\|"cancel"\|"delete"` |
| `/analyze/stream` | SSE stream (POST body `{taskId}`) |
| `/analyze/rerun-insights` | Re-run insight agent on existing charts |
| `/analyze/download` | Download report files |
| `/static` | Serve generated SVG/chart files |
| `/history` | Per-conversation analysis history |

## Environment Variables (`.env`)

- `AI_GATEWAY_BASE_URL` / `AI_GATEWAY_API_KEY` / `AI_GATEWAY_MODEL` — mapped to `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` at runtime in `agents/_lib/model.ts`
- `WORK_ROOT` — where CSV files and output go (defaults to `$TMPDIR/csv-analyze-sessions`)
- `SESSION_TTL_MS` — session expiry (default 24h)

## Tech Stack Notes

- **Vega-Lite** is a backend-only dependency (used for server-side SVG rendering); excluded from Vite's dep optimizer to avoid oversized headers.
- `.npmrc` sets `--max-http-header-size=65536` due to large dependency metadata.
- Frontend uses `framer-motion` for animations, CSS Modules for component styles, and Tailwind v4 beta for utility classes.
- The app language is Chinese (zh-CN) throughout — system prompts, UI labels, and reports are all in Chinese.
- Types are mirrored between `agents/_lib/types.ts` (canonical) and `src/types.ts` (frontend subset).
