/**
 * ColumnScan：ACT 2 的核心可视化。
 *
 * 每列一行，60 个 div 方块代表归一化的分布值。
 * 颜色映射：
 *   numeric   → emerald
 *   datetime  → cyan
 *   categorical / boolean → blue
 *   id        → muted grey
 *   text      → dimmed
 *
 * Scanline 效果：行内依次亮起（CSS stagger）；外层用一条 sweeping line 作为额外视觉。
 */
import { useMemo } from "react";
import type { ColumnDistribution } from "../types";
import styles from "./ColumnScan.module.css";

export interface ColumnScanProps {
  distributions: ColumnDistribution[];
  /** 是否处于"正在扫描"态——控制 sweeping 线 */
  scanning: boolean;
}

export function ColumnScan({ distributions, scanning }: ColumnScanProps) {
  const rows = useMemo(
    () => distributions.slice(0, 24), // 多于 24 列的截断，保持画面密度
    [distributions],
  );
  return (
    <div className={`${styles.wrap} ${scanning ? styles.scanning : ""}`}>
      <div className={styles.legend}>
        <span className={styles.legendLabel}>COLUMN SCAN</span>
        <span className={styles.legendMeta}>
          {distributions.length} columns · 60-bin profile
        </span>
      </div>
      <div className={styles.table}>
        {rows.map((d, i) => (
          <div
            key={d.column}
            className={styles.row}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className={styles.name} title={d.column}>
              {d.column}
            </div>
            <div className={styles.bins}>
              {d.bins.map((v, j) => (
                <span
                  key={j}
                  className={`${styles.bin} ${styles[d.semanticType] ?? ""}`}
                  style={
                    {
                      "--v": v.toFixed(3),
                      "--delay": `${j * 12}ms`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
            <div className={`${styles.chip} ${styles[`chip_${d.semanticType}`] ?? ""}`}>
              {d.semanticType}
            </div>
          </div>
        ))}
      </div>
      {scanning && <div className={styles.sweep} aria-hidden="true" />}
    </div>
  );
}
