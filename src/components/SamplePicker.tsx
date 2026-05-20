/**
 * SamplePicker —— 预制 CSV 数据选择器。
 *
 * 放在 DropZone 下方，用户点击任意一张卡片即可快速体验模版，
 * 走和手动上传完全一样的 onFile 流程。
 *
 * 数据文件从 /public/mock/ 提供，部署时会作为静态资源和前端一起打包。
 */
import { useState } from "react";
import styles from "./SamplePicker.module.css";

export interface SampleDataset {
  file: string;            // public 路径，如 /mock/employees.csv
  name: string;            // 文件名，如 employees.csv（传给 onFile 用）
  title: string;           // 展示标题
  meta: string;            // "50 × 11"
  hint: string;            // 一句话介绍用途
  icon: string;            // emoji 或 2 字符标记
}

const SAMPLES: SampleDataset[] = [
  {
    file: "/mock/employees.csv",
    name: "employees.csv",
    title: "Employees",
    meta: "40 × 7",
    hint: "部门 · 职级 · 薪资分布",
    icon: "👥",
  },
  {
    file: "/mock/sales_2025.csv",
    name: "sales_2025.csv",
    title: "E-commerce Sales",
    meta: "48 × 8",
    hint: "地区 · 品类 · 时间序列",
    icon: "🛒",
  },
  {
    file: "/mock/restaurant_reviews.csv",
    name: "restaurant_reviews.csv",
    title: "Restaurant Reviews",
    meta: "40 × 7",
    hint: "价格 vs 评分相关性",
    icon: "🍽️",
  },
  {
    file: "/mock/users_behavior.csv",
    name: "users_behavior.csv",
    title: "SaaS User Behavior",
    meta: "40 × 7",
    hint: "留存 · MRR · 付费分层",
    icon: "📈",
  },
];

export interface SamplePickerProps {
  onPick: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function SamplePicker({ onPick, disabled }: SamplePickerProps) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function handlePick(s: SampleDataset) {
    if (disabled || loadingKey) return;
    setLoadingKey(s.name);
    try {
      const res = await fetch(s.file);
      if (!res.ok) throw new Error(`sample load failed: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], s.name, { type: "text/csv" });
      await onPick(file);
    } catch (e) {
      // 出错时短暂反馈后解除
      console.error(e);
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className={styles.wrap} aria-label="Sample datasets">
      <div className={styles.header}>
        <span className={styles.label}>OR TRY A SAMPLE</span>
        <span className={styles.rule} aria-hidden />
      </div>

      <div className={styles.grid}>
        {SAMPLES.map((s) => {
          const loading = loadingKey === s.name;
          return (
            <button
              key={s.name}
              type="button"
              className={[
                styles.card,
                loading ? styles.loading : "",
                disabled ? styles.disabled : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handlePick(s)}
              disabled={disabled || !!loadingKey}
              aria-busy={loading}
            >
              <div className={styles.cardTop}>
                <span className={styles.icon} aria-hidden>
                  {s.icon}
                </span>
                <span className={styles.meta}>{s.meta}</span>
              </div>
              <div className={styles.cardTitle}>{s.title}</div>
              <div className={styles.cardHint}>{s.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
