/**
 * AgentCanvas：右侧主画面，随 phase 切换内容。
 *
 * idle       → 巨型引导
 * scanning   → ColumnScan
 * charting   → ChartCard 堆叠
 * insights   → ChartCard + InsightBlock
 * report     → ReportActions + 所有内容
 */
import { AnimatePresence, motion } from "framer-motion";
import type { Phase } from "../hooks/useAgentStream";
import type { AgentStreamState } from "../hooks/useAgentStream";
import { ColumnScan } from "./ColumnScan";
import { ChartCard } from "./ChartCard";
import { InsightBlock } from "./InsightBlock";
import { SummaryIsland } from "./SummaryIsland";
import { ReanalyzeButton } from "./ReanalyzeButton";
import styles from "./AgentCanvas.module.css";

export interface AgentCanvasProps {
  phase: Phase;
  state: AgentStreamState;
  onReset: () => void;
}

export function AgentCanvas({ phase, state, onReset }: AgentCanvasProps) {
  const { upload, charts, insights, done } = state;
  const summary = insights.find((i) => i.kind === "summary");
  const perChart = insights.filter((i) => i.kind === "per_chart");

  return (
    <section className={styles.canvas}>
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div
            key="idle"
            className={styles.hero}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className={styles.title}>
              <span>CSV.</span>
              <span>ANALYZE.</span>
            </h1>
            <p className={styles.sub}>
              Two agents.<br />
              Three reports.<br />
              One truth.
            </p>
            <div className={styles.poweredBy}>Powered by Claude Agent SDK</div>
          </motion.div>
        )}

        {(phase === "scanning" ||
          phase === "charting" ||
          phase === "insights" ||
          phase === "report") && (
          <motion.div
            key="running"
            className={styles.stack}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* summary 浮岛：仅报告阶段展示在最顶端 */}
            {done && summary && <SummaryIsland text={summary.text} />}

            {/* Column Scan —— 在分析过程中一直可见（做为数据概览），完成后隐藏 */}
            {!done && upload && (
              <ColumnScan
                distributions={upload.distributions}
                scanning={phase === "scanning"}
              />
            )}

            {/* Chart 卡片 + 对应 insights */}
            {charts.map((c, i) => {
              const liveIdx = perChart.length - 1;
              const chartInsights = perChart.filter(
                (ins) => ins.chartId === c.id,
              );
              return (
                <ChartCard key={c.id} chart={c} index={i}>
                  {chartInsights.map((ins, j) => {
                    const globalIdx = perChart.indexOf(ins);
                    const isLive = globalIdx === liveIdx && !done;
                    return (
                      <InsightBlock
                        key={`${c.id}-${j}`}
                        text={ins.text}
                        live={isLive}
                      />
                    );
                  })}
                </ChartCard>
              );
            })}

            {/* 分析完成后在 canvas 底部出现"再来一次"CTA */}
            {done && <ReanalyzeButton onClick={onReset} />}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
