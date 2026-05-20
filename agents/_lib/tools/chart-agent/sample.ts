/**
 * sample_rows：随机抽 n 行原始数据让 agent 看看实际内容（n ≤ 10）。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/result.js";
import { loadCsv } from "../shared/csv-stats.js";

export const sampleRows = (ctx: TaskContext) =>
  tool(
    "sample_rows",
    "Return up to 10 sample rows from the CSV (uniformly spread). Use ONLY to see what each column looks like — do not enumerate the dataset.",
    {
      n: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("抽样行数（1–10）"),
    },
    async ({ n }) => {
      try {
        if (!ctx.cache.rows) {
          const { rows } = await loadCsv(ctx.csvPath);
          ctx.cache.rows = rows;
        }
        const rows = ctx.cache.rows!;
        if (rows.length === 0) return textResult({ rows: [] });
        const step = Math.max(1, Math.floor(rows.length / n));
        const out: Record<string, unknown>[] = [];
        for (let i = 0; i < rows.length && out.length < n; i += step) {
          out.push(rows[i]!);
        }
        return textResult({ rows: out });
      } catch (e) {
        return errorResult(
          `sample_rows failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
