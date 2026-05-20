/**
 * AgentEvent：前后端共用的事件协议。
 *
 * 后端通过 analyze() 的 onEvent 回调把这些事件吐出来；
 * HTTP 服务器把它们以 SSE 的形式推给浏览器；
 * 前端 useAgentStream 消费后驱动 UI。
 */
import type { ChartMeta, Insight } from "./types.js";

export type AgentRole = "chart" | "insight";

export type AgentState = "running" | "done" | "skipped";

export type ToolState = "running" | "done" | "failed";

/** session：任务启动时发送一次；包含静态元信息 */
export interface SessionEvent {
  type: "session";
  taskId: string;
  model: string;
  startedAt: string;
  csvName: string;
  profileAvailable: boolean;
}

export interface AgentEventMsg {
  type: "agent";
  role: AgentRole;
  state: AgentState;
}

export interface ToolEvent {
  type: "tool";
  id: string;
  name: string;
  agent: AgentRole;
  state: ToolState;
  durationMs?: number;
  argsSummary?: string;
  resultSummary?: string;
  error?: string;
}

export interface ChartEvent {
  type: "chart";
  chart: ChartMeta;
}

export interface InsightEvent {
  type: "insight";
  insight: Insight;
}

export interface CostEvent {
  type: "cost";
  chart?: number;
  insight?: number;
  total: number;
  durationMs: number;
}

export interface DoneEvent {
  type: "done";
  taskId: string;
  reports: {
    charts: string;
    insight?: string;
    merged: string;
    html?: string;
  };
  charts: number;
  insights: number;
  cost: { chart?: number; insight?: number; total: number };
  durationMs: number;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  role?: AgentRole;
}

export type AgentEvent =
  | SessionEvent
  | AgentEventMsg
  | ToolEvent
  | ChartEvent
  | InsightEvent
  | CostEvent
  | DoneEvent
  | ErrorEvent;

/** 用于 in-process 回调的签名 */
export type EventEmitter = (event: AgentEvent) => void;
