/**
 * read_column_stats：读之前 get_column_values 缓存的单列统计。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/result.js";
import { readColumnStatsFile } from "../shared/cache.js";

export const readColumnStats = (ctx: TaskContext) =>
  tool(
    "read_column_stats",
    "Return cached column statistics (top values + histogram + numeric summary). Only columns the Chart Agent actually looked at are available — otherwise returns an error.",
    {
      column: z.string(),
    },
    async ({ column }) => {
      try {
        const mem = ctx.cache.columnStats.get(column);
        if (mem) return textResult(mem);
        const disk = await readColumnStatsFile(ctx.outDir, column);
        if (!disk) {
          return errorResult(
            `No cached stats for "${column}". Pick another column that the Chart Agent already analyzed (see relevant_columns in read_chart_meta).`,
          );
        }
        ctx.cache.columnStats.set(column, disk);
        return textResult(disk);
      } catch (e) {
        return errorResult(
          `read_column_stats failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
