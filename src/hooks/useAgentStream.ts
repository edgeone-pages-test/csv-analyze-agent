/**
 * useAgentStream：把 SSE 事件流收拢成一份可渲染的 state。
 *
 * state 机器大致：
 *   idle → scanning (chart agent running)
 *        → charting (已有至少 1 张图)
 *        → insights (insight agent running)
 *        → report (done)
 *
 * 注意：SSE 可能在 charts 还没全部 done 时就开始 insights，
 * 所以我们不完全按"阶段"切换，而是综合 currentAgent / charts / insights 推导 UI。
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  AgentEvent,
  AgentRole,
  AgentState,
  ToolEvent,
} from "../lib/events";
import type { ChartMeta, Insight, UploadResponse } from "../types";
import { subscribeStream } from "../lib/api";
import type { SessionSnapshot } from "../lib/api";

export type Phase = "idle" | "scanning" | "charting" | "insights" | "report";

export interface ToolInvocation {
  id: string;
  name: string;
  agent: AgentRole;
  state: ToolEvent["state"];
  startedAt: number;
  durationMs?: number;
  argsSummary?: string;
  resultSummary?: string;
  error?: string;
}

export interface AgentStreamState {
  phase: Phase;
  taskId: string | null;
  upload: UploadResponse | null;

  currentAgent: AgentRole | null;
  agentStatus: Record<AgentRole, AgentState | "idle">;

  /** 工具调用按执行顺序记录 */
  tools: ToolInvocation[];
  /** 当前 running 的 tool id（便于 scanline 同步） */
  runningTool: string | null;

  charts: ChartMeta[];
  insights: Insight[];

  cost: { chart?: number; insight?: number; total: number };
  durationMs: number;

  done: boolean;
  error: string | null;
  reports: null | {
    charts: string;
    insight?: string;
    merged: string;
    html?: string;
  };
}

type Action =
  | { kind: "set_upload"; payload: UploadResponse }
  | { kind: "reset" }
  | { kind: "event"; payload: AgentEvent }
  | { kind: "restore"; payload: SessionSnapshot }
  | { kind: "error"; payload: string };

const initialState: AgentStreamState = {
  phase: "idle",
  taskId: null,
  upload: null,
  currentAgent: null,
  agentStatus: { chart: "idle", insight: "idle" },
  tools: [],
  runningTool: null,
  charts: [],
  insights: [],
  cost: { total: 0 },
  durationMs: 0,
  done: false,
  error: null,
  reports: null,
};

function reducer(s: AgentStreamState, a: Action): AgentStreamState {
  switch (a.kind) {
    case "reset":
      return initialState;
    case "set_upload":
      return {
        ...initialState,
        upload: a.payload,
        taskId: a.payload.taskId,
        phase: "idle",
      };
    case "restore": {
      // 从后端快照恢复：先建立 upload state，再把 events 依次 replay
      const snap = a.payload;
      const base: AgentStreamState = {
        ...initialState,
        taskId: snap.taskId,
        upload: {
          taskId: snap.taskId,
          csvName: snap.csvName,
          size: snap.size,
          profile: snap.profile,
          distributions: snap.distributions,
        },
        phase: "idle",
      };
      // 一轮 reduce 把所有历史事件应用一遍
      let next = base;
      for (const evt of snap.events) {
        next = applyEvent(next, evt);
      }
      // 如果快照里没有 done 事件，但 status 明确是 done/error，也兜底标记
      if (!next.done && (snap.status === "done" || snap.status === "error")) {
        next = { ...next, done: snap.status === "done" };
      }
      return next;
    }
    case "error":
      return { ...s, error: a.payload };
    case "event":
      return applyEvent(s, a.payload);
  }
}

function applyEvent(
  s: AgentStreamState,
  evt: AgentEvent,
): AgentStreamState {
  switch (evt.type) {
    case "session":
      return {
        ...s,
        taskId: evt.taskId,
        phase: "scanning",
      };
    case "agent": {
      const status = { ...s.agentStatus, [evt.role]: evt.state };
      let phase = s.phase;
      let currentAgent = s.currentAgent;
      if (evt.state === "running") {
        currentAgent = evt.role;
        phase = evt.role === "insight" ? "insights" : "scanning";
      } else if (evt.state === "done" || evt.state === "skipped") {
        if (s.currentAgent === evt.role) currentAgent = null;
        if (evt.role === "chart" && s.charts.length > 0 && phase === "scanning") {
          phase = "charting";
        }
      }
      return { ...s, agentStatus: status, currentAgent, phase };
    }
    case "tool": {
      const existing = s.tools.find((t) => t.id === evt.id);
      let tools: ToolInvocation[];
      if (existing) {
        tools = s.tools.map((t) =>
          t.id === evt.id
            ? {
                ...t,
                state: evt.state,
                durationMs: evt.durationMs ?? t.durationMs,
                resultSummary: evt.resultSummary ?? t.resultSummary,
                error: evt.error ?? t.error,
              }
            : t,
        );
      } else {
        tools = [
          ...s.tools,
          {
            id: evt.id,
            name: evt.name,
            agent: evt.agent,
            state: evt.state,
            startedAt: Date.now(),
            durationMs: evt.durationMs,
            argsSummary: evt.argsSummary,
            resultSummary: evt.resultSummary,
            error: evt.error,
          },
        ];
      }
      const runningTool =
        evt.state === "running"
          ? evt.id
          : s.runningTool === evt.id
            ? null
            : s.runningTool;
      return { ...s, tools, runningTool };
    }
    case "chart": {
      // 幂等，按 id 合并
      const exists = s.charts.some((c) => c.id === evt.chart.id);
      const charts = exists
        ? s.charts.map((c) => (c.id === evt.chart.id ? evt.chart : c))
        : [...s.charts, evt.chart];
      const phase = s.phase === "scanning" ? "charting" : s.phase;
      return { ...s, charts, phase };
    }
    case "insight": {
      // summary 去重替换；per_chart 按内容追加
      if (evt.insight.kind === "summary") {
        const withoutOld = s.insights.filter((i) => i.kind !== "summary");
        return { ...s, insights: [...withoutOld, evt.insight] };
      }
      const dup = s.insights.some(
        (i) =>
          i.kind === "per_chart" &&
          i.chartId === evt.insight.chartId &&
          i.text === evt.insight.text,
      );
      return dup ? s : { ...s, insights: [...s.insights, evt.insight] };
    }
    case "cost":
      return {
        ...s,
        cost: {
          chart: evt.chart ?? s.cost.chart,
          insight: evt.insight ?? s.cost.insight,
          total: evt.total,
        },
        durationMs: evt.durationMs,
      };
    case "done":
      return {
        ...s,
        done: true,
        phase: "report",
        reports: evt.reports,
        cost: { ...s.cost, ...evt.cost },
        durationMs: evt.durationMs,
      };
    case "error":
      return { ...s, error: evt.message };
  }
}

export interface UseAgentStream {
  state: AgentStreamState;
  setUpload: (u: UploadResponse) => void;
  restore: (snapshot: SessionSnapshot) => void;
  connect: (taskId: string) => void;
  reset: () => void;
}

export function useAgentStream(): UseAgentStream {
  const [state, dispatch] = useReducer(reducer, initialState);
  const closeRef = useRef<null | (() => void)>(null);

  const setUpload = useCallback((u: UploadResponse) => {
    dispatch({ kind: "set_upload", payload: u });
  }, []);

  const restore = useCallback((snapshot: SessionSnapshot) => {
    dispatch({ kind: "restore", payload: snapshot });
  }, []);

  const connect = useCallback((taskId: string) => {
    closeRef.current?.();
    closeRef.current = subscribeStream(
      taskId,
      (evt) => dispatch({ kind: "event", payload: evt }),
      () => {
        // EventSource 自身会重连；只在致命错误时才清理
      },
    );
  }, []);

  const reset = useCallback(() => {
    closeRef.current?.();
    closeRef.current = null;
    dispatch({ kind: "reset" });
  }, []);

  useEffect(() => () => closeRef.current?.(), []);

  return { state, setUpload, restore, connect, reset };
}
