/**
 * analyze()：两 agent 串行编排。
 */
import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

import type {
  AnalyzeOptions,
  AnalyzeResult,
  TaskContext,
} from "./types.js";
import type { AgentEvent, AgentRole, ToolState } from "./events.js";
import { CHART_AGENT_PROMPT, CHART_AGENT_PROMPT_DEMO, INSIGHT_AGENT_PROMPT, INSIGHT_AGENT_PROMPT_DEMO } from "./system-prompt.js";
import { resolveModelName, collectGatewayEnv } from "./model.js";
import { logProgress } from "./tools/shared/progress.js";
import {
  profileCsv,
  sampleRows,
  getColumnValues,
  computeCorrelation,
  renderChart,
  saveChartMeta,
} from "./tools/chart-agent/index.js";
import {
  readProfile,
  readChartMeta,
  readColumnStats,
  readCorrelation,
  saveInsight,
} from "./tools/insight-agent/index.js";
import { assembleReports } from "./report.js";
import { writeProfile } from "./tools/shared/cache.js";

export async function analyze(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  await mkdir(path.join(opts.outDir, "charts"), { recursive: true });

  const ctx: TaskContext = {
    csvPath: path.resolve(opts.csvPath),
    outDir: path.resolve(opts.outDir),
    charts: [],
    insights: [],
    demoMode: opts.demoMode,
    cache: {
      profile: opts.prewarmedProfile ?? null,
      columnStats: new Map(),
      correlations: new Map(),
      rows: opts.prewarmedRows ?? null,
      nextChartId: 1,
    },
    emit: opts.onEvent,
  };

  if (ctx.cache.profile) {
    try {
      await writeProfile(ctx.outDir, ctx.cache.profile);
    } catch {
      /* 预热写盘失败不致命 */
    }
  }

  const model = resolveModelName(opts.model);
  const chartsOnly = Boolean(opts.chartsOnly && !opts.insightsOnly);
  const insightsOnly = Boolean(opts.insightsOnly);
  const taskId = opts.taskId ?? path.basename(ctx.outDir);
  const t0 = Date.now();

  console.log(`\n🚀 CSV 分析启动`);
  console.log(`   CSV   : ${ctx.csvPath}`);
  console.log(`   Out   : ${ctx.outDir}`);
  console.log(`   Model : ${model}`);
  console.log(`   Demo  : ${opts.demoMode ? "yes" : "no"}`);
  console.log(
    `   Mode  : ${
      insightsOnly
        ? "insight-only (rerun)"
        : chartsOnly
          ? "chart-only"
          : "chart + insight"
    }\n`,
  );

  ctx.emit?.({
    type: "session",
    taskId,
    model,
    startedAt: new Date(t0).toISOString(),
    csvName: path.basename(ctx.csvPath),
    profileAvailable: !!ctx.cache.profile,
  });

  try {
    // ── Agent 1: Chart ─────────────────────────────────────
    let chartCost: number | undefined;
    if (insightsOnly) {
      ctx.emit?.({ type: "agent", role: "chart", state: "done" });
    } else {
      ctx.emit?.({ type: "agent", role: "chart", state: "running" });
      console.log("▶ Stage 1/2: Chart Agent 出图...");
      chartCost = await runChartAgent(ctx, model, opts);
      await reconcileOrphanCharts(ctx);
      console.log(`✅ Chart Agent 完成，生成 ${ctx.charts.length} 张图\n`);
      ctx.emit?.({ type: "agent", role: "chart", state: "done" });

      // 释放原始行数据——Insight Agent 只读缓存统计，不需要 raw rows
      ctx.cache.rows = null;
    }

    // ── Agent 2: Insight（可选） ────────────────────────────
    let insightCost: number | undefined;
    if (!chartsOnly) {
      if (ctx.charts.length === 0) {
        console.warn("⚠️  Chart Agent 未生成任何图表，跳过 Insight Agent");
        ctx.emit?.({ type: "agent", role: "insight", state: "skipped" });
      } else {
        ctx.emit?.({ type: "agent", role: "insight", state: "running" });
        console.log("▶ Stage 2/2: Insight Agent 写洞察...");
        insightCost = await runInsightAgent(ctx, model, opts);
        console.log(`✅ Insight Agent 完成，写入 ${ctx.insights.length} 条洞察\n`);
        ctx.emit?.({ type: "agent", role: "insight", state: "done" });
      }
    } else {
      ctx.emit?.({ type: "agent", role: "insight", state: "skipped" });
    }

    // ── 组装 ───────────────────────────────────────────────
    const out = await assembleReports(ctx, { chartsOnly });
    const durationMs = Date.now() - t0;
    const total = (chartCost ?? 0) + (insightCost ?? 0);

    ctx.emit?.({
      type: "cost",
      chart: chartCost,
      insight: insightCost,
      total,
      durationMs,
    });
    ctx.emit?.({
      type: "done",
      taskId,
      reports: {
        charts: "charts",
        insight: out.insightReportPath ? "insight" : undefined,
        merged: "merged",
        html: out.htmlReportPath ? "html" : undefined,
      },
      charts: ctx.charts.length,
      insights: ctx.insights.length,
      cost: { chart: chartCost, insight: insightCost, total },
      durationMs,
    });

    return {
      chartsReportPath: out.chartsReportPath,
      insightReportPath: out.insightReportPath,
      combinedReportPath: out.combinedReportPath,
      htmlReportPath: out.htmlReportPath,
      charts: ctx.charts,
      insights: ctx.insights,
      costUsd: {
        chart: chartCost,
        insight: insightCost,
        total,
      },
    };
  } catch (err) {
    ctx.emit?.({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// Chart Agent
// ─────────────────────────────────────────────────────────

/**
 * 构造 Chart Agent 的 prompt——把预热好的 profile 摘要注入，
 * 减少一次 profile_csv 工具调用并防止 Agent 幻觉列名。
 */
function buildChartAgentPrompt(ctx: TaskContext): string {
  const p = ctx.cache.profile;
  if (!p) {
    // 无预热 profile（极少见），降级为原始方式
    return `请为这份 CSV 生成 3–6 张图表：${ctx.csvPath}。首先调用 profile_csv。`;
  }

  const colSummary = p.columns
    .map((c) => {
      let desc = `${c.name} (${c.semanticType})`;
      if (c.semanticType === "numeric" && c.min !== undefined) {
        desc += ` [${c.min}..${c.max}, mean=${c.mean}]`;
      }
      if (c.semanticType === "categorical" && c.topValues?.length) {
        const top3 = c.topValues.slice(0, 3).map((v) => v.value).join("/");
        desc += ` [${c.unique} values: ${top3}…]`;
      }
      if (c.semanticType === "datetime") {
        desc += ` [${c.minDate} → ${c.maxDate}]`;
      }
      return desc;
    })
    .join("\n  ");

  const chartTarget = ctx.demoMode ? "恰好 3 张" : "3–6 张有信息量的";
  const demoSuffix = ctx.demoMode
    ? "\n\n**不要调用 profile_csv 和 sample_rows**——以上 profile 已足够。严格生成 3 张图，不要多。"
    : "\n你仍可调用 profile_csv 获取完整统计（含 quantiles/topValues），或调用 sample_rows 查看实际数据样本。";

  return `CSV 文件：${path.basename(ctx.csvPath)}
行数：${p.rows}${p.sampledRows < p.rows ? `（已抽样 ${p.sampledRows} 行）` : ""}
列（${p.columns.length} 个）：
  ${colSummary}

请基于以上 profile 生成 ${chartTarget}图表。${demoSuffix}`;
}

async function runChartAgent(
  ctx: TaskContext,
  model: string,
  opts: AnalyzeOptions,
): Promise<number | undefined> {
  const mcp = createSdkMcpServer({
    name: "chart-agent",
    version: "1.0.0",
    tools: [
      profileCsv(ctx),
      sampleRows(ctx),
      getColumnValues(ctx),
      computeCorrelation(ctx),
      renderChart(ctx),
      saveChartMeta(ctx),
      logProgress(ctx, "chart"),
    ],
  });

  const demo = opts.demoMode;

  return await runAgent({
    ctx,
    role: "chart",
    mcp,
    mcpName: "chart-agent",
    toolNames: [
      "profile_csv",
      "sample_rows",
      "get_column_values",
      "compute_correlation",
      "render_chart",
      "save_chart_meta",
      "log_progress",
    ],
    systemPrompt: demo ? CHART_AGENT_PROMPT_DEMO : CHART_AGENT_PROMPT,
    prompt: buildChartAgentPrompt(ctx),
    model,
    maxTurns: opts.maxTurns ?? (demo ? 14 : 30),
    maxBudgetUsd: opts.maxBudgetUsd ?? (demo ? 0.08 : 0.3),
    signal: opts.signal,
  });
}

// ─────────────────────────────────────────────────────────
// Insight Agent
// ─────────────────────────────────────────────────────────
async function runInsightAgent(
  ctx: TaskContext,
  model: string,
  opts: AnalyzeOptions,
): Promise<number | undefined> {
  const mcp = createSdkMcpServer({
    name: "insight-agent",
    version: "1.0.0",
    tools: [
      readProfile(ctx),
      readChartMeta(ctx),
      readColumnStats(ctx),
      readCorrelation(ctx),
      saveInsight(ctx),
      logProgress(ctx, "insight"),
    ],
  });

  const demo = opts.demoMode;

  return await runAgent({
    ctx,
    role: "insight",
    mcp,
    mcpName: "insight-agent",
    toolNames: [
      "read_profile",
      "read_chart_meta",
      "read_column_stats",
      "read_correlation",
      "save_insight",
      "log_progress",
    ],
    systemPrompt: demo ? INSIGHT_AGENT_PROMPT_DEMO : INSIGHT_AGENT_PROMPT,
    prompt: demo
      ? "请为每张图写 1–2 句洞察，再写 2–3 句总结。首先调用 read_profile。"
      : "请根据前一步生成的图表和数据摘要，为每张图写洞察并给出总体结论。首先调用 read_profile。",
    model,
    maxTurns: opts.maxTurns ?? (demo ? 8 : 15),
    maxBudgetUsd: opts.maxBudgetUsd ?? (demo ? 0.04 : 0.2),
    signal: opts.signal,
  });
}

// ─────────────────────────────────────────────────────────
// 公共执行器
// ─────────────────────────────────────────────────────────
interface RunAgentParams {
  ctx: TaskContext;
  role: AgentRole;
  mcp: ReturnType<typeof createSdkMcpServer>;
  mcpName: string;
  toolNames: string[];
  systemPrompt: string;
  prompt: string;
  model: string;
  maxTurns: number;
  maxBudgetUsd: number;
  signal?: AbortSignal;
}

async function runAgent(params: RunAgentParams): Promise<number | undefined> {
  const allowed = params.toolNames.map(
    (n) => `mcp__${params.mcpName}__${n}`,
  );
  const toolPrefix = `mcp__${params.mcpName}__`;
  const inflight = new Map<string, { name: string; startedAt: number }>();

  if (params.signal?.aborted) {
    throw new Error("analysis cancelled");
  }

  const q = query({
    prompt: params.prompt,
    options: {
      model: params.model,
      systemPrompt: params.systemPrompt,
      mcpServers: { [params.mcpName]: params.mcp },
      allowedTools: allowed,
      disallowedTools: [
        "Bash",
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "WebFetch",
        "WebSearch",
        "NotebookEdit",
        "TodoWrite",
        "Agent",
        "Task",
        "AskUserQuestion",
        "BashOutput",
        "KillBash",
      ],
      settingSources: [],
      permissionMode: "default",
      maxTurns: params.maxTurns,
      env: collectGatewayEnv(),
    },
  });

  let costUsd: number | undefined;

  const onAbort = () => {
    try {
      (q as { interrupt?: () => void }).interrupt?.();
    } catch {
      /* noop */
    }
  };
  params.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const msg of q) {
      if (params.signal?.aborted) {
        throw new Error("analysis cancelled");
      }
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            const fullName = typeof block.name === "string" ? block.name : "";
            const shortName = fullName.startsWith(toolPrefix)
              ? fullName.slice(toolPrefix.length)
              : fullName;
            const id =
              (block as { id?: string }).id ??
              crypto.randomBytes(4).toString("hex");
            inflight.set(id, { name: shortName, startedAt: Date.now() });
            console.log(`  [tool] ${shortName}`);
            params.ctx.emit?.({
              type: "tool",
              id,
              name: shortName,
              agent: params.role,
              state: "running",
              argsSummary: truncate(safeJson(block.input), 240),
            });
          }
        }
      } else if (msg.type === "user") {
        const content = (msg.message as { content?: unknown }).content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (
              item &&
              typeof item === "object" &&
              (item as { type?: string }).type === "tool_result"
            ) {
              const toolUseId = (item as { tool_use_id?: string }).tool_use_id;
              if (!toolUseId) continue;
              const meta = inflight.get(toolUseId);
              if (!meta) continue;
              inflight.delete(toolUseId);
              const rawContent = (item as { content?: unknown }).content;
              const resultText = extractToolResultText(rawContent);
              const isError =
                (item as { is_error?: boolean }).is_error === true;
              const state: ToolState = isError ? "failed" : "done";
              params.ctx.emit?.({
                type: "tool",
                id: toolUseId,
                name: meta.name,
                agent: params.role,
                state,
                durationMs: Date.now() - meta.startedAt,
                resultSummary: truncate(resultText, 240),
                error: isError ? truncate(resultText, 240) : undefined,
              });
            }
          }
        }
      } else if (msg.type === "result") {
        costUsd = msg.total_cost_usd;
        if (msg.subtype !== "success") {
          throw new Error(
            `${params.mcpName} 结束异常：${msg.subtype}${
              "error" in msg ? " — " + (msg as { error?: string }).error : ""
            }`,
          );
        }
      }
    }
  } finally {
    params.signal?.removeEventListener("abort", onAbort);
  }
  return costUsd;
}

// ─────────────────────────────────────────────────────────
async function reconcileOrphanCharts(ctx: TaskContext): Promise<void> {
  const chartsDir = path.join(ctx.outDir, "charts");
  let files: string[];
  try {
    files = await readdir(chartsDir);
  } catch {
    return;
  }
  const registered = new Set(
    ctx.charts.map((c) => path.basename(c.filePath)),
  );
  for (const f of files) {
    if (!f.endsWith(".svg")) continue;
    if (registered.has(f)) continue;
    try {
      await unlink(path.join(chartsDir, f));
      console.log(`  🧹 removed orphan chart file: ${f}`);
    } catch {
      /* ignore */
    }
  }
}

function safeJson(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function extractToolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const kind = (c as { type?: string }).type;
      if (kind === "text") {
        const t = (c as { text?: unknown }).text;
        if (typeof t === "string") parts.push(t);
      } else if (kind === "image") {
        parts.push("[image omitted]");
      } else if (kind) {
        parts.push(`[${kind} block]`);
      }
    }
    return parts.join("\n");
  }
  return "";
}

export type { AgentEvent } from "./events.js";
