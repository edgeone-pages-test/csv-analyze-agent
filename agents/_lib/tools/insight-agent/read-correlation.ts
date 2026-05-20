/**
 * read_correlation：读之前 compute_correlation 缓存的相关系数。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/result.js";
import { readCorrelationFile, orderedPair } from "../shared/cache.js";

export const readCorrelation = (ctx: TaskContext) =>
  tool(
    "read_correlation",
    "Return cached Pearson correlation for a pair of columns. Only pairs the Chart Agent computed are available.",
    {
      col_a: z.string(),
      col_b: z.string(),
    },
    async ({ col_a, col_b }) => {
      try {
        const [a, b] = orderedPair(col_a, col_b);
        const key = `${a}__${b}`;
        const mem = ctx.cache.correlations.get(key);
        if (mem) return textResult(mem);
        const disk = await readCorrelationFile(ctx.outDir, col_a, col_b);
        if (!disk) {
          return errorResult(
            `No cached correlation for ("${col_a}", "${col_b}"). Pick another pair the Chart Agent examined.`,
          );
        }
        ctx.cache.correlations.set(key, disk);
        return textResult(disk);
      } catch (e) {
        return errorResult(
          `read_correlation failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
