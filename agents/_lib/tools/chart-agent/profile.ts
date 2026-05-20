/**
 * profile_csv：读 CSV → 算每列统计 + 语义类型。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/result.js";
import { loadCsv, computeProfile } from "../shared/csv-stats.js";
import { writeProfile } from "../shared/cache.js";

export const profileCsv = (ctx: TaskContext) =>
  tool(
    "profile_csv",
    "Load the CSV, infer each column's semantic type, and return per-column statistics (min/max/mean/std/missing/unique/top-values/date-range). Call this FIRST. Returns a compact JSON summary — NOT the raw rows.",
    {},
    async () => {
      try {
        if (ctx.cache.profile) {
          return textResult(ctx.cache.profile);
        }
        const { rows, totalRows, sampledRows } = await loadCsv(ctx.csvPath);
        ctx.cache.rows = rows;
        const profile = computeProfile(rows, ctx.csvPath, totalRows, sampledRows);
        ctx.cache.profile = profile;
        await writeProfile(ctx.outDir, profile);
        return textResult(profile);
      } catch (e) {
        return errorResult(
          `profile_csv failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
