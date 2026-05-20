/**
 * save_chart_meta：追加图表元数据到 ctx.charts 并落盘。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import path from "node:path";
import type { TaskContext, ChartMeta, ChartType } from "../../types.js";
import { textResult, errorResult } from "../shared/result.js";
import { writeCharts } from "../shared/cache.js";

const CHART_TYPES: ChartType[] = [
  "bar", "line", "scatter", "histogram", "heatmap", "boxplot", "pie", "area", "other",
];

export const saveChartMeta = (ctx: TaskContext) =>
  tool(
    "save_chart_meta",
    "Register metadata for a chart you just rendered. Must be called exactly once per successful render_chart, with the chart_id returned by render_chart.",
    {
      chart_id: z.string().describe("render_chart 返回的 chart_id"),
      title: z.string(),
      description: z
        .string()
        .describe("一句话说明这图画的是什么（不是结论；结论是 Insight Agent 的工作）"),
      chart_type: z.enum(CHART_TYPES as [ChartType, ...ChartType[]]),
      relevant_columns: z.array(z.string()).describe("该图涉及的列名"),
    },
    async ({ chart_id, title, description, chart_type, relevant_columns }) => {
      try {
        if (ctx.charts.some((c) => c.id === chart_id)) {
          return errorResult(`chart_id "${chart_id}" already registered`);
        }
        const meta: ChartMeta = {
          id: chart_id,
          title,
          description,
          chartType: chart_type,
          relevantColumns: relevant_columns,
          filePath: path.join(ctx.outDir, "charts", `${chart_id}.svg`),
          relPath: `charts/${chart_id}.svg`,
        };
        ctx.charts.push(meta);
        await writeCharts(ctx.outDir, ctx.charts);
        ctx.emit?.({ type: "chart", chart: meta });
        return textResult({ ok: true, chart_id });
      } catch (e) {
        return errorResult(
          `save_chart_meta failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
