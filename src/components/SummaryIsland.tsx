/**
 * SummaryIsland：Insight Agent 的 summary 洞察。
 * 视觉权重一档以上，amber 柔光边。
 */
import { motion } from "framer-motion";
import styles from "./SummaryIsland.module.css";

export interface SummaryIslandProps {
  text: string;
}

export function SummaryIsland({ text }: SummaryIslandProps) {
  return (
    <motion.section
      className={styles.island}
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.52, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className={styles.label}>SUMMARY</div>
      <h2 className={styles.heading}>总体结论</h2>
      <p className={styles.body}>{text}</p>
    </motion.section>
  );
}
