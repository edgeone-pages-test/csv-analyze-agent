/**
 * POST /history — 读取分析历史记录
 *
 * 从 context.store 中读取当前 conversation 的分析记录，
 * 按 taskId 去重保留最新状态，并标注是否可恢复。
 */
import { getSession } from "../_lib/session.js";
import { jsonResponse } from "../_lib/handlers.js";
import {
  APP_NAME,
  RECORD_KIND,
  type CsvAnalysisHistoryRecord,
} from "../_lib/history.js";

interface StoreMessage {
  messageId?: string;
  role?: string;
  content?: unknown;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

export type HistoryRecordWithRestore = CsvAnalysisHistoryRecord & {
  restorable: boolean;
};

export async function onRequest(context: any) {
  const conversationId: string = context.conversation_id ?? "";
  const store = context.store ?? null;

  console.log(`[history] GET conversationId=${conversationId || "(empty)"} store=${store ? "ok" : "null"}`);

  if (!store || !conversationId) {
    return jsonResponse({ conversation_id: conversationId, records: [] });
  }

  let messages: StoreMessage[];
  try {
    messages = await store.getMessages({
      conversationId,
      limit: 100,
      order: "asc",
    });
    console.log(`[history] getMessages returned ${messages.length} items`);
  } catch (err) {
    console.warn(
      "[history] getMessages failed:",
      err instanceof Error ? err.message : String(err),
    );
    return jsonResponse({ conversation_id: conversationId, records: [] });
  }

  // 按 taskId 去重，保留 updatedAt 最大的一条
  const latest = new Map<string, CsvAnalysisHistoryRecord>();

  for (const item of messages) {
    const meta = item.metadata ?? {};
    if (meta.app !== APP_NAME) continue;
    if (meta.kind !== RECORD_KIND) continue;

    const record = item.content as CsvAnalysisHistoryRecord | null;
    if (!record?.taskId) continue;
    if (record.kind !== "csv_analysis") continue;

    const prev = latest.get(record.taskId);
    if (!prev || record.updatedAt >= prev.updatedAt) {
      latest.set(record.taskId, record);
    }
  }

  // 按 updatedAt 降序排列，并标注 restorable
  const records: HistoryRecordWithRestore[] = [...latest.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((record) => ({
      ...record,
      restorable: Boolean(getSession(record.taskId)),
    }));

  return jsonResponse({ conversation_id: conversationId, records });
}
