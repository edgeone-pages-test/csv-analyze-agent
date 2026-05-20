/**
 * AI Gateway 调试版配置。
 *
 * Claude Agent SDK 子进程仍读取 Anthropic 协议环境变量，
 * 所以这里把 AI_GATEWAY_* 映射成 ANTHROPIC_* 传给 SDK。
 */
import "dotenv/config";

export const CLAUDE_MODEL = process.env.AI_GATEWAY_MODEL || "@Pages/hy3-preview";

export function collectGatewayEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const baseUrl = process.env.AI_GATEWAY_BASE_URL;
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const smallModel = process.env.AI_GATEWAY_SMALL_MODEL || CLAUDE_MODEL;

  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  if (smallModel) env.ANTHROPIC_SMALL_FAST_MODEL = smallModel;
  if (process.env.ANTHROPIC_CUSTOM_HEADERS) {
    env.ANTHROPIC_CUSTOM_HEADERS = process.env.ANTHROPIC_CUSTOM_HEADERS;
  }

  return env;
}

export function resolveModelName(explicit?: string): string {
  return explicit || CLAUDE_MODEL;
}
