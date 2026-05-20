/**
 * EventLog —— 左侧实时日志面板。
 *
 * 把 useAgentStream 的 state 变化翻译成一条条带时间戳的日志条目，
 * 让用户能直观看到 agent 正在做什么（避免"看起来卡死"）。
 *
 * 设计说明：
 * - 日志是"推导态"：纯从 state diff 累加出来的；一旦 state.upload 变 null（reset），
 *   整个日志重置。
 * - 之前的实现在 useMemo 内部 push 到 ref，依赖 React 永远只执行一次 memo。
 *   React 18 StrictMode 开发模式下每次 render 都会双调 useMemo（为了捕获副作用），
 *   会导致每条日志被 push 两次。这版改用 useEffect + useState —— effect 在提交后
 *   运行，保证"每次 state 变化 push 一次"。
 *
 * 日志类型：
 *   - upload      蓝色    上传完成、列扫描就绪
 *   - agent       emerald/amber  agent 启停
 *   - tool        灰/emerald/coral  工具调用开始/结束/失败
 *   - chart       emerald  新图生成
 *   - insight     amber    洞察写入（summary / per_chart）
 *   - cost        muted    成本/耗时更新
 *   - done        emerald  全部完成
 *   - error       coral    错误
 */
import { useEffect, useRef, useState } from "react";
import type { AgentStreamState, ToolInvocation } from "../hooks/useAgentStream";
import { formatDuration } from "../lib/format";
import styles from "./EventLog.module.css";

type LogKind =
  | "upload"
  | "agent"
  | "tool"
  | "chart"
  | "insight"
  | "cost"
  | "done"
  | "error";

interface LogEntry {
  id: string;
  kind: LogKind;
  time: number;
  text: string;
  detail?: string;
}

export interface EventLogProps {
  state: AgentStreamState;
}

interface SeenRecord {
  upload: boolean;
  chartStart: boolean;
  chartDone: boolean;
  insightStart: boolean;
  insightDone: boolean;
  done: boolean;
  error: string | null;
  toolState: Map<string, string>;
  chartIds: Set<string>;
  insightKeys: Set<string>;
  costKey: string | null;
}

function emptySeen(): SeenRecord {
  return {
    upload: false,
    chartStart: false,
    chartDone: false,
    insightStart: false,
    insightDone: false,
    done: false,
    error: null,
    toolState: new Map(),
    chartIds: new Set(),
    insightKeys: new Set(),
    costKey: null,
  };
}

export function EventLog({ state }: EventLogProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const seenRef = useRef<SeenRecord>(emptySeen());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = seenRef.current;
    // 重置：upload 变 null 意味着用户点了 reset
    if (!state.upload) {
      seenRef.current = emptySeen();
      setEntries([]);
      return;
    }

    const additions: LogEntry[] = [];
    const now = Date.now();
    let seq = 0;
    const push = (kind: LogKind, text: string, detail?: string) => {
      additions.push({
        id: `${kind}-${now}-${seq++}`,
        kind,
        time: now,
        text,
        detail,
      });
    };

    // 上传完成
    if (!seen.upload) {
      const u = state.upload;
      push(
        "upload",
        `uploaded ${u.csvName ?? "csv"}`,
        `${u.profile?.rows ?? "?"} rows · ${u.profile?.columns?.length ?? "?"} cols`,
      );
      seen.upload = true;
    }

    // chart agent 生命周期
    const chartStatus = state.agentStatus.chart;
    if (chartStatus === "running" && !seen.chartStart) {
      push("agent", "chart agent started", "planning visualizations");
      seen.chartStart = true;
    }
    if (
      (chartStatus === "done" || chartStatus === "skipped") &&
      !seen.chartDone
    ) {
      push(
        "agent",
        chartStatus === "skipped" ? "chart agent skipped" : "chart agent done",
        `${state.charts.length} charts generated`,
      );
      seen.chartDone = true;
    }

    // insight agent 生命周期
    const insightStatus = state.agentStatus.insight;
    if (insightStatus === "running" && !seen.insightStart) {
      push("agent", "insight agent started", "writing insights");
      seen.insightStart = true;
    }
    if (
      (insightStatus === "done" || insightStatus === "skipped") &&
      !seen.insightDone
    ) {
      push(
        "agent",
        insightStatus === "skipped"
          ? "insight agent skipped"
          : "insight agent done",
        `${state.insights.length} insights written`,
      );
      seen.insightDone = true;
    }

    // 工具调用
    for (const tool of state.tools) {
      const prev = seen.toolState.get(tool.id);
      if (prev === tool.state) continue;
      seen.toolState.set(tool.id, tool.state);

      if (tool.state === "running") {
        push("tool", `${tool.name}`, toolArgs(tool));
      } else if (tool.state === "done") {
        push(
          "tool",
          `${tool.name} ✓`,
          tool.durationMs != null ? `${tool.durationMs} ms` : undefined,
        );
      } else if (tool.state === "failed") {
        push(
          "tool",
          `${tool.name} ✗ failed`,
          tool.error ?? "unknown error",
        );
      }
    }

    // 图表生成
    for (const chart of state.charts) {
      if (seen.chartIds.has(chart.id)) continue;
      seen.chartIds.add(chart.id);
      push("chart", `new chart: ${chart.title}`, chart.chartType);
    }

    // 洞察生成
    for (const ins of state.insights) {
      const key = `${ins.kind}-${ins.chartId ?? "summary"}-${ins.text.slice(0, 24)}`;
      if (seen.insightKeys.has(key)) continue;
      seen.insightKeys.add(key);
      if (ins.kind === "summary") {
        push("insight", "summary written", `${ins.text.length} chars`);
      } else {
        push(
          "insight",
          `insight for ${ins.chartId}`,
          `${ins.text.length} chars`,
        );
      }
    }

    // 成本更新（只在 total 明显变化时记录）
    const costKey = `${state.cost.total.toFixed(6)}`;
    if (costKey !== seen.costKey && state.cost.total > 0) {
      seen.costKey = costKey;
      push(
        "cost",
        `cost update`,
        `$${state.cost.total.toFixed(4)}  ·  ${formatDuration(state.durationMs)}`,
      );
    }

    // 完成
    if (state.done && !seen.done) {
      push(
        "done",
        `analysis complete`,
        `${state.charts.length} charts · ${state.insights.length} insights · $${state.cost.total.toFixed(4)}`,
      );
      seen.done = true;
    }

    // 错误
    if (state.error && state.error !== seen.error) {
      push("error", "error", state.error);
      seen.error = state.error;
    }

    if (additions.length > 0) {
      setEntries((prev) => [...prev, ...additions]);
    }
  }, [state]);

  // 新条目进来时自动滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <section className={styles.panel} aria-label="Agent activity log">
      <header className={styles.header}>
        <span className={styles.dot} data-active={!state.done} />
        <span className={styles.title}>ACTIVITY LOG</span>
        <span className={styles.count}>{entries.length}</span>
      </header>

      <div className={styles.scroll} ref={scrollRef}>
        {entries.length === 0 ? (
          <div className={styles.empty}>waiting for events…</div>
        ) : (
          <ul className={styles.list}>
            {entries.map((e) => (
              <li key={e.id} className={styles.item} data-kind={e.kind}>
                <span className={styles.time}>{formatTime(e.time)}</span>
                <span className={styles.kind}>{e.kind}</span>
                <span className={styles.text}>
                  {e.text}
                  {e.detail && (
                    <span className={styles.detail}>{e.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function toolArgs(t: ToolInvocation): string | undefined {
  if (!t.argsSummary) return undefined;
  // 过长截断
  return t.argsSummary.length > 80
    ? t.argsSummary.slice(0, 77) + "…"
    : t.argsSummary;
}
