/**
 * App.tsx —— 整体状态机。
 *
 * 布局：
 *   左侧 44vw：DropZone（idle）→ PassCard（running）
 *   右侧 56vw：AgentCanvas
 *   底部浮动状态栏
 *   右侧抽屉（按需）
 *
 * 关键行为：
 *   - upload 成功 → setUpload → connect SSE → POST /start
 *   - insight agent 运行时 → body 加 insight-active class（切 accent 到 amber）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { UploadResponse } from "./types";
import {
  uploadCsv,
  startAnalyze,
  fetchSession,
  rerunInsights,
  cancelAnalyze,
  fetchAnalysisHistory,
} from "./lib/api";
import type { HistoryRecordWithRestore } from "./lib/api";
import { useAgentStream } from "./hooks/useAgentStream";
import { MeshGradient } from "./components/MeshGradient";
import { DropZone } from "./components/DropZone";
import { SamplePicker } from "./components/SamplePicker";
import { PassCard } from "./components/PassCard";
import { EventLog } from "./components/EventLog";
import { ReportActions } from "./components/ReportActions";
import { AgentCanvas } from "./components/AgentCanvas";
import { StatusBar } from "./components/StatusBar";
import { ToolDrawer } from "./components/ToolDrawer";
import { HistoryPanel } from "./components/HistoryPanel";
import { ReportView } from "./components/ReportView";
import type { ToolInvocation } from "./hooks/useAgentStream";

// ─── Conversation ID ────────────────────────────────────────

const CSV_CONVERSATION_ID_STORAGE_KEY = "csv_analyze_conversation_id";

function getOrCreateConversationId(): string {
  const cached = localStorage.getItem(CSV_CONVERSATION_ID_STORAGE_KEY);
  if (cached) return cached;

  const conversationId = crypto.randomUUID();
  localStorage.setItem(CSV_CONVERSATION_ID_STORAGE_KEY, conversationId);
  return conversationId;
}

// ─── URL helpers ────────────────────────────────────────────

/** 把 taskId 放进 URL（?task=xxx），刷新后能读到 */
function setTaskIdInUrl(taskId: string | null) {
  const url = new URL(window.location.href);
  if (taskId) url.searchParams.set("task", taskId);
  else url.searchParams.delete("task");
  window.history.replaceState({}, "", url.toString());
}

function getTaskIdFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get("task");
}

function getReportIdFromUrl(): string | null {
  return new URL(window.location.href).searchParams.get("report");
}

function setReportIdInUrl(taskId: string | null) {
  const url = new URL(window.location.href);
  if (taskId) {
    url.searchParams.set("report", taskId);
    url.searchParams.delete("task");
  } else {
    url.searchParams.delete("report");
  }
  window.history.replaceState({}, "", url.toString());
}

// ─── App ────────────────────────────────────────────────────

export default function App() {
  const { state, setUpload, restore, connect, reset } = useAgentStream();
  const [drawer, setDrawer] = useState<ToolInvocation | null>(null);
  const [bootstrapping, setBootstrapping] = useState<boolean>(
    () => !!getTaskIdFromUrl(),
  );
  const bootstrappedRef = useRef(false);
  /** 用户在 DropZone 下方勾选的 analyze 选项（持久到本次 session） */
  const [chartsOnly, setChartsOnly] = useState<boolean>(false);
  /** 上次分析用的选项——retry 时复用 */
  const lastOptsRef = useRef<{ chartsOnly: boolean; demoMode?: boolean } | null>(null);
  const [rerunning, setRerunning] = useState<boolean>(false);

  // ─── Report view state ─────────────────────────────────
  const [reportTaskId, setReportTaskId] = useState<string | null>(
    () => getReportIdFromUrl(),
  );

  // ─── Conversation ID ────────────────────────────────────
  const conversationIdRef = useRef<string>(getOrCreateConversationId());

  // ─── History state ──────────────────────────────────────
  const [historyRecords, setHistoryRecords] = useState<HistoryRecordWithRestore[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);

  const active =
    state.agentStatus.chart === "running" ||
    state.agentStatus.insight === "running";

  // insight-active body class
  useEffect(() => {
    const body = document.body;
    if (state.agentStatus.insight === "running") {
      body.classList.add("insight-active");
    } else {
      body.classList.remove("insight-active");
    }
    return () => body.classList.remove("insight-active");
  }, [state.agentStatus.insight]);

  useEffect(() => {
    setHistoryLoading(true);
    fetchAnalysisHistory(conversationIdRef.current)
      .then(setHistoryRecords)
      .finally(() => setHistoryLoading(false));
  }, []);

  // 启动时：若 URL 里带了 task=xxx，尝试从后端拉快照恢复
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const tid = getTaskIdFromUrl();
    if (!tid) {
      setBootstrapping(false);
      return;
    }

    (async () => {
      try {
        const snap = await fetchSession(tid, conversationIdRef.current);
        if (!snap) {
          // session 已过期或服务器重启，清理 URL
          setTaskIdInUrl(null);
          return;
        }
        restore(snap);
        // 如果 session 还在跑 / 待跑，继续订阅 SSE
        if (snap.status === "running" || snap.status === "uploaded") {
          connect(snap.taskId);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("restore session failed", e);
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [restore, connect]);

  // upload 成功后把 taskId 写进 URL
  useEffect(() => {
    if (state.upload?.taskId) {
      setTaskIdInUrl(state.upload.taskId);
    }
  }, [state.upload?.taskId]);

  useEffect(() => {
    if (state.done) {
      fetchAnalysisHistory(conversationIdRef.current).then(setHistoryRecords);
    }
  }, [state.done]);

  const onFile = useCallback(
    async (f: File) => {
      const result: UploadResponse = await uploadCsv(f, conversationIdRef.current);
      setUpload(result);
      connect(result.taskId);
      const opts = { chartsOnly, demoMode: true };
      lastOptsRef.current = opts;
      await startAnalyze(result.taskId, opts, conversationIdRef.current);
    },
    [setUpload, connect, chartsOnly],
  );

  const handleReset = useCallback(() => {
    setTaskIdInUrl(null);
    reset();
    // 不删除 session——它会自动过期（24h TTL）。
    // 这样历史记录能通过 live session fallback 正确加载报告。
    fetchAnalysisHistory(conversationIdRef.current).then(setHistoryRecords);
  }, [reset]);

  const handleRetry = useCallback(async () => {
    if (!state.taskId) return;
    const opts = lastOptsRef.current ?? { chartsOnly, demoMode: true };
    try {
      await startAnalyze(state.taskId, opts, conversationIdRef.current);
      connect(state.taskId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("retry failed", e);
    }
  }, [state.taskId, connect, chartsOnly]);

  const handleRerunInsights = useCallback(async () => {
    if (!state.taskId || rerunning) return;
    setRerunning(true);
    try {
      await rerunInsights(state.taskId, {}, conversationIdRef.current);
      connect(state.taskId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("rerun failed", e);
    } finally {
      setRerunning(false);
    }
  }, [state.taskId, connect, rerunning]);

  const handleCancel = useCallback(async () => {
    if (!state.taskId) return;
    await cancelAnalyze(state.taskId, conversationIdRef.current);
  }, [state.taskId]);

  // ─── History handlers ───────────────────────────────────

  const handleOpenHistory = useCallback(
    async (record: HistoryRecordWithRestore) => {
      if (!record.restorable) return;

      // done/deleted 状态 → 打开报告视图（从 store 或 live session 加载）
      if (record.status === "done" || record.status === "deleted") {
        setReportTaskId(record.taskId);
        setReportIdInUrl(record.taskId);
        return;
      }

      // running/uploaded → 先尝试从 live session 获取快照
      const snap = await fetchSession(record.taskId, conversationIdRef.current);
      if (!snap) return;

      // 如果 live session 实际已完成，直接打开报告视图
      if (snap.status === "done") {
        setReportTaskId(record.taskId);
        setReportIdInUrl(record.taskId);
        return;
      }

      // 仍在运行中，恢复实时会话
      restore(snap);
      setTaskIdInUrl(record.taskId);

      if (snap.status === "running" || snap.status === "uploaded") {
        connect(snap.taskId);
      }
    },
    [restore, connect],
  );

  const handleClearHistory = useCallback(() => {
    // Generates a new conversation_id so the current browser no longer sees
    // old history records. The old data remains in context.store — this is
    // intentional to avoid accidentally deleting non-csv-analyze messages.
    // To truly purge old records, a dedicated endpoint would be needed.
    const id = crypto.randomUUID();
    localStorage.setItem(CSV_CONVERSATION_ID_STORAGE_KEY, id);
    conversationIdRef.current = id;
    setHistoryRecords([]);
  }, []);

  const pending =
    state.phase !== "idle" || !!state.upload || !!state.error;

  const passStatus = currentPassStatus(state);

  // 恢复中展示一个极简 loader（保持 OLED 黑底，不闪）
  if (bootstrapping) {
    return (
      <>
        <MeshGradient />
        <main
          style={{
            position: "relative",
            zIndex: 1,
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-muted)",
            letterSpacing: "0.2em",
          }}
        >
          <span>RESTORING SESSION...</span>
        </main>
      </>
    );
  }

  // 报告视图（从历史记录打开）
  if (reportTaskId) {
    return (
      <ReportView
        taskId={reportTaskId}
        conversationId={conversationIdRef.current}
        onBack={() => {
          setReportTaskId(null);
          setReportIdInUrl(null);
        }}
      />
    );
  }

  return (
    <>
      <MeshGradient />

      <main
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "flex",
          gap: 0,
        }}
      >
        {/* 左栏 44vw */}
        <aside
          style={{
            width: "44vw",
            maxWidth: 640,
            minWidth: 360,
            padding: "72px 40px 120px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {!state.upload && (
            <>
              <DropZone onFile={onFile} disabled={pending} />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                  letterSpacing: "0.12em",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={chartsOnly}
                  onChange={(e) => setChartsOnly(e.target.checked)}
                  style={{ accentColor: "var(--accent-emerald)" }}
                />
                CHARTS ONLY (skip insight agent · ~1/2 cost)
              </label>
              <SamplePicker onPick={onFile} disabled={pending} />

              <HistoryPanel
                records={historyRecords}
                loading={historyLoading}
                onSelect={handleOpenHistory}
                onClear={handleClearHistory}
              />
            </>
          )}
          {state.upload && (
            <PassCard
              upload={state.upload}
              status={passStatus}
              active={active}
            />
          )}
          {state.upload && active && !state.done && (
            <button
              onClick={handleCancel}
              style={{
                alignSelf: "flex-start",
                padding: "3px 10px",
                background: "transparent",
                border: "1px solid rgba(255,107,107,0.2)",
                borderRadius: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "color 160ms, border-color 160ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--accent-coral, #ff6b6b)";
                e.currentTarget.style.borderColor = "rgba(255,107,107,0.45)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "rgba(255,107,107,0.2)";
              }}
            >
              cancel
            </button>
          )}
          {state.upload && <EventLog state={state} />}
          {state.upload && state.done && state.reports && state.taskId && (
            <ReportActions
              compact
              taskId={state.taskId}
              charts={state.charts.length}
              insights={state.insights.length}
              costUsd={state.cost.total}
              durationMs={state.durationMs}
              kinds={{
                charts: true,
                insight: Boolean(state.reports.insight),
                merged: true,
                html: Boolean(state.reports.html),
              }}
            />
          )}

          {/* 完成 + 有图 → 提供"重跑 insight"入口 */}
          {state.upload &&
            state.done &&
            state.charts.length > 0 && (
              <button
                onClick={handleRerunInsights}
                disabled={rerunning}
                style={{
                  padding: "10px 14px",
                  background: "transparent",
                  border: "1px solid rgba(255,191,94,0.28)",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  color: "var(--accent-amber, #ffbf5e)",
                  textTransform: "uppercase",
                  textAlign: "left",
                  cursor: rerunning ? "wait" : "pointer",
                  opacity: rerunning ? 0.55 : 1,
                }}
              >
                rerun insights (keep charts)
              </button>
            )}

          {state.upload && state.done && (
            <button
              onClick={handleReset}
              className="resetLink"
              style={{
                marginTop: 4,
                padding: "10px 14px",
                background: "transparent",
                border: "1px solid rgba(0,255,163,0.22)",
                borderRadius: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.18em",
                color: "var(--accent-emerald)",
                textTransform: "uppercase",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 180ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0,255,163,0.06)";
                e.currentTarget.style.borderColor = "rgba(0,255,163,0.55)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(0,255,163,0.22)";
              }}
            >
              analyze another csv
            </button>
          )}
          {state.error && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(255,107,107,0.08)",
                border: "1px solid rgba(255,107,107,0.25)",
                borderRadius: 6,
                color: "var(--accent-coral)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                lineHeight: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <span>{state.error}</span>
              {state.taskId && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleRetry}
                    style={{
                      padding: "6px 10px",
                      background: "transparent",
                      border: "1px solid rgba(255,107,107,0.4)",
                      borderRadius: 4,
                      color: "var(--accent-coral)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    retry
                  </button>
                  <button
                    onClick={handleReset}
                    style={{
                      padding: "6px 10px",
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 4,
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    reset
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* 右栏 56vw */}
        <AgentCanvas phase={state.phase} state={state} onReset={handleReset} />
      </main>

      {state.upload && (
        <StatusBar
          tools={state.tools}
          agentStatus={state.agentStatus}
          durationMs={state.durationMs}
          costUsd={state.cost.total}
          onToolClick={(t) => setDrawer(t)}
        />
      )}

      <ToolDrawer tool={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

function currentPassStatus(state: ReturnType<typeof useAgentStream>["state"]): string | undefined {
  if (state.done) return "report ready";
  if (state.agentStatus.insight === "running") return "writing insights...";
  if (state.agentStatus.chart === "running") {
    const running = state.tools.find((t) => t.state === "running");
    if (running) return `${running.name.replaceAll("_", " ")}...`;
    return "chart agent thinking...";
  }
  if (state.agentStatus.chart === "done" && state.agentStatus.insight === "idle") {
    return "preparing insights...";
  }
  return "uploaded · ready";
}
