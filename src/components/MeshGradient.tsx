/**
 * 背景极光 mesh——纯 CSS，2% 透明度的 radial-gradient 拼接。
 * 位置在右上/右下，缓慢呼吸 30s。
 */
import styles from "./MeshGradient.module.css";

export function MeshGradient() {
  return <div className={styles.mesh} aria-hidden="true" />;
}
