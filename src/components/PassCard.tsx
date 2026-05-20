/**
 * PassCard：上传完成后，drop zone 折叠为一张"电影票根"卡片。
 * 左侧有 vertical 撕齿边（用 radial-gradient 画），左边框 emerald 2px。
 */
import styles from "./PassCard.module.css";
import type { UploadResponse } from "../types";
import { formatSize } from "../lib/format";

export interface PassCardProps {
  upload: UploadResponse;
  status?: string;
  active?: boolean;
}

export function PassCard({ upload, status, active }: PassCardProps) {
  const { profile, csvName, size } = upload;
  return (
    <div className={`${styles.card} ${active ? styles.active : ""}`}>
      <div className={styles.perf} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.name}>{csvName}</div>
        <div className={styles.rule} />
        <div className={styles.stats}>
          <span>{profile.rows.toLocaleString()} rows</span>
          <span className={styles.sep}>·</span>
          <span>{profile.columns.length} columns</span>
        </div>
        <div className={styles.meta}>
          {formatSize(size)} · utf-8 · comma-delimited
        </div>
        {status && (
          <div className={styles.status}>
            <span className={styles.dot} />
            <span>{status}</span>
          </div>
        )}
      </div>
    </div>
  );
}
