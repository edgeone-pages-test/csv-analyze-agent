/**
 * read_chart_meta：读 charts.json。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/result.js";
import { readChartsFile } from "../shared/cache.js";

export const readChartMeta = (ctx: TaskContext) =>
  tool(
    "read_chart_meta",
    "Return the list of charts the Chart Agent produced: id, title, description, chart_type, relevant_columns. Use the ids here when calling save_insight / read_column_stats.",
    {},
    async () => {
      try {
        if (ctx.charts.length > 0) return textResult({ charts: ctx.charts });
        const charts = await readChartsFile(ctx.outDir);
        if (charts.length === 0) {
          return errorResult("No charts found — the Chart Agent produced nothing");
        }
        ctx.charts = charts;
        return textResult({ charts });
      } catch (e) {
        return errorResult(
          `read_chart_meta failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
