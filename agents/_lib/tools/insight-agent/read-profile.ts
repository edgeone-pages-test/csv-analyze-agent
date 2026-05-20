/**
 * read_profile：读 Chart Agent 阶段落盘的 profile.json。
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { TaskContext } from "../../types.js";
import { textResult, errorResult } from "../shared/result.js";
import { readProfileFile } from "../shared/cache.js";

export const readProfile = (ctx: TaskContext) =>
  tool(
    "read_profile",
    "Read the CSV profile (column types, basic statistics) cached by the Chart Agent. This is your ONLY view into the raw data structure.",
    {},
    async () => {
      try {
        if (ctx.cache.profile) return textResult(ctx.cache.profile);
        const p = await readProfileFile(ctx.outDir);
        if (!p) return errorResult("profile not found; run Chart Agent first");
        ctx.cache.profile = p;
        return textResult(p);
      } catch (e) {
        return errorResult(
          `read_profile failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );
