/**
 * 路由处理器公共辅助。
 */
import type { Session } from "./session.js";
import { getSession, touchSession } from "./session.js";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** 构造 JSON 响应 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/** 构造错误 JSON 响应 */
export function errorResponse(error: string, status = 400): Response {
  return jsonResponse({ error }, status);
}

/** 获取并 touch session，不存在时返回 404 Response */
export function getAndTouchSession(
  taskId: string | null,
): Session | Response {
  if (!taskId) {
    return errorResponse("taskId is required", 400);
  }
  const s = getSession(taskId);
  if (!s) {
    return errorResponse("session not found", 404);
  }
  touchSession(s);
  return s;
}

/**
 * 从 EdgeOne context.request 获取 body。
 * EdgeOne runtime 对 JSON content-type 已自动解析为对象，直接取即可。
 */
export function getRequestBody(
  request: any,
): { body: any } | { error: Response } {
  const body = request.body;
  if (body === undefined || body === null) {
    return { error: errorResponse("request body is empty") };
  }
  return { body };
}

