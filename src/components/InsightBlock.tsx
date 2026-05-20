/**
 * InsightBlock：展示某条洞察。
 * 后端一次性推一整段 text，前端做"伪流式打字机"（每 12ms 一个字）——视觉上比直接淡入更有仪式感。
 */
import { useEffect, useState } from "react";
import styles from "./InsightBlock.module.css";

export interface InsightBlockProps {
  text: string;
  /** 是否在写——尚在最新一条时 true，旧的为 false（不做打字机） */
  live?: boolean;
}

const TYPE_INTERVAL_MS = 12;

export function InsightBlock({ text, live }: InsightBlockProps) {
  const [shown, setShown] = useState(live ? "" : text);

  useEffect(() => {
    if (!live) {
      setShown(text);
      return;
    }
    let i = 0;
    setShown("");
    const timer = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(timer);
      }
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [text, live]);

  return (
    <div className={styles.block}>
      <div className={styles.tag}>
        <span className={styles.dot} aria-hidden="true" />
        insight
      </div>
      <p
        className={styles.body}
        dangerouslySetInnerHTML={{ __html: highlightNumbers(shown) }}
      />
      {live && shown.length < text.length && (
        <span className={styles.caret} aria-hidden="true">
          ▍
        </span>
      )}
    </div>
  );
}

/**
 * 粗暴高亮常见数字：百分数、货币、比率、倍数、相关系数。
 *
 * 但要跳过 ISO 日期（2024-01-05）、时间（14:30:00）、版本号（1.2.3）——
 * 否则会被拆成一堆零散的 <mark>2024</mark>-<mark>01</mark>-<mark>05</mark>，观感很差。
 *
 * 做法：先用占位符把这些"复合数字结构"保护起来，做完高亮再放回。
 */
function highlightNumbers(s: string): string {
  const escaped = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const placeholders: string[] = [];
  const protect = (re: RegExp, text: string): string =>
    text.replace(re, (m) => {
      const token = `\u0000P${placeholders.length}\u0000`;
      placeholders.push(m);
      return token;
    });

  // 按"先长后短"顺序 protect：datetime > date > time > 版本号
  let working = escaped;
  // ISO 日期 + 可选时间：2024-01-05T14:30:00 / 2024/1/5 14:30
  working = protect(
    /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?/g,
    working,
  );
  // 中文日期：2024年1月5日
  working = protect(/\d{4}年\d{1,2}月\d{1,2}日/g, working);
  // 纯时间：14:30(:00)
  working = protect(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, working);
  // 版本号：1.2.3
  working = protect(/\b\d+\.\d+\.\d+\b/g, working);

  const highlighted = working.replace(
    /(\d+(?:\.\d+)?\s?(?:%|倍|次|天|小时|分钟|元|USD|\$)|\b\d+(?:\.\d+)?\b)/g,
    (m) => `<mark>${m}</mark>`,
  );

  // 放回占位
  return highlighted.replace(/\u0000P(\d+)\u0000/g, (_, idx) => {
    const raw = placeholders[Number(idx)] ?? "";
    return raw;
  });
}
