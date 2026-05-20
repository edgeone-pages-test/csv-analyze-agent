/**
 * ReanalyzeButton —— 分析完成后的"再来一次"CTA。
 *
 * 风格跟 ReportActions 一个层级，但 emerald 主色（不是 accent），
 * 放在 Canvas 最底部、看完报告自然滚到的位置。
 */
import styles from "./ReanalyzeButton.module.css";

export interface ReanalyzeButtonProps {
  onClick: () => void;
}

export function ReanalyzeButton({ onClick }: ReanalyzeButtonProps) {
  return (
    <section className={styles.wrap}>
      <div className={styles.divider} aria-hidden />

      <button type="button" className={styles.btn} onClick={onClick}>
        <span className={styles.inner}>
          <span className={styles.arrow} aria-hidden>
            ↻
          </span>
          <span className={styles.labels}>
            <span className={styles.title}>Analyze another CSV</span>
            <span className={styles.hint}>
              back to upload · or pick a sample dataset
            </span>
          </span>
          <span className={styles.chev} aria-hidden>
            →
          </span>
        </span>
      </button>
    </section>
  );
}
