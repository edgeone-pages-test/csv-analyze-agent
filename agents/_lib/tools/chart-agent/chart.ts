/**
 * create_chart：渲染 Vega-Lite 为 SVG + 注册图表元数据，一步到位。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as vl from "vega-lite";
import { View, parse } from "vega";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { TaskContext, ChartMeta, ChartType } from "../../types.js";
import { textResult, errorResult } from "../shared/helpers.js";
import { ensureDir, writeCharts } from "../shared/cache.js";

const CHART_TYPES: ChartType[] = [
  "bar", "line", "scatter", "histogram", "heatmap", "boxplot", "pie", "area", "other",
];

export const createChart = (ctx: TaskContext) =>
  tool(
    "create_chart",
    "Render a Vega-Lite spec to SVG and register chart metadata in one step. The spec MUST include `data.values` inline. Returns { chart_id, file_path }.",
    {
      title: z.string().describe("图表标题（人类可读）"),
      description: z
        .string()
        .describe("一句话说明这图画的是什么（不是结论；结论是 Insight Agent 的工作）"),
      chart_type: z.enum(CHART_TYPES as [ChartType, ...ChartType[]]),
      relevant_columns: z.array(z.string()).describe("该图涉及的列名"),
      vega_lite_spec: z
        .record(z.string(), z.any())
        .describe("合法的 Vega-Lite v5 规格；必须含 data.values"),
    },
    async ({ title, description, chart_type, relevant_columns, vega_lite_spec }) => {
      try {
        // ── 渲染 SVG ──────────────────────────────────────
        const spec: Record<string, unknown> = { ...(vega_lite_spec as Record<string, unknown>) };
        if (!spec.$schema) spec.$schema = "https://vega.github.io/schema/vega-lite/v5.json";
        if (!spec.width && !spec.height) {
          spec.width = 480;
          spec.height = 300;
        }
        if (!spec.title) spec.title = title;
        if (!spec.background) spec.background = "white";

        const data = (spec as { data?: { values?: unknown[] } }).data;
        if (!data || !Array.isArray(data.values) || data.values.length === 0) {
          return errorResult(
            "vega_lite_spec.data.values 必须是非空数组 —— 把 get_column_values / compute_correlation 的返回值填进去",
          );
        }

        const compiled = vl.compile(spec as never).spec;
        const view = new View(parse(compiled), { renderer: "none" });
        const svg = await view.toSVG();

        const seq = ctx.cache.nextChartId++;
        const id = `chart-${seq}`;
        const chartsDir = path.join(ctx.outDir, "charts");
        await ensureDir(chartsDir);
        const filePath = path.join(chartsDir, `${id}.svg`);
        await writeFile(filePath, svg, "utf-8");

        // ── 注册元数据 ────────────────────────────────────
        const meta: ChartMeta = {
          id,
          title,
          description,
          chartType: chart_type,
          relevantColumns: relevant_columns,
          filePath,
          relPath: `charts/${id}.svg`,
        };
        ctx.charts.push(meta);
        await writeCharts(ctx.outDir, ctx.charts);
        ctx.emit?.({ type: "chart", chart: meta });

        return textResult({ chart_id: id, file_path: filePath });
      } catch (e) {
        return errorResult(
          `create_chart failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
