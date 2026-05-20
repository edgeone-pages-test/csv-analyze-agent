/**
 * log_progress：两个 agent 共用的结构化进度日志工具。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { TaskContext } from "../../types.js";
import { textResult } from "./result.js";

export const logProgress = (ctx: TaskContext, agentName: "chart" | "insight") =>
  tool(
    "log_progress",
    "Print a structured progress update (stage/message/progress%) to stdout. Call this when you move to a new stage or complete a milestone.",
    {
      stage: z.string().describe("短阶段名，例如 'profile' / 'planning' / 'executing'"),
      message: z.string().describe("一句话说明当前动作"),
      progress: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe("0-100 的进度百分比（可选）"),
    },
    async ({ stage, message, progress }) => {
      const pct = typeof progress === "number" ? ` (${progress}%)` : "";
      console.log(`  [${agentName}:${stage}]${pct} ${message}`);
      return textResult({ ok: true });
    },
  );
