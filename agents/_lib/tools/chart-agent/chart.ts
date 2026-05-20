/**
 * render_chart：把 agent 传来的 Vega-Lite 规格编译并渲染为 SVG。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as vl from "vega-lite";
import { View, parse } from "vega";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/result.js";
import { ensureDir } from "../shared/cache.js";

export const renderChart = (ctx: TaskContext) =>
  tool(
    "render_chart",
    "Compile a Vega-Lite spec to SVG and save to charts/<id>.svg. Returns { chart_id, file_path, rel_path }. The spec MUST include `data.values` inline — do not reference the original CSV.",
    {
      title: z.string().describe("图表标题（人类可读）"),
      vega_lite_spec: z
        .record(z.string(), z.any())
        .describe("合法的 Vega-Lite v5 规格；必须含 data.values"),
    },
    async ({ title, vega_lite_spec }) => {
      try {
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

        return textResult({
          chart_id: id,
          file_path: filePath,
          rel_path: `charts/${id}.svg`,
        });
      } catch (e) {
        return errorResult(
          `render_chart failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
