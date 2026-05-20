/**
 * 前端共用的业务类型，与后端 agents/src/types.ts 对齐。
 * 只镜像 *前端真正要用* 的字段，不求完全一致。
 */

export type SemanticType =
  | "numeric"
  | "categorical"
  | "datetime"
  | "id"
  | "boolean"
  | "text";

export interface ColumnProfile {
  name: string;
  semanticType: SemanticType;
  rawType: "number" | "string" | "boolean" | "date";
  count: number;
  missing: number;
  unique: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  quantiles?: Record<string, number>;
  topValues?: Array<{ value: string; count: number }>;
  minDate?: string;
  maxDate?: string;
}

export interface CsvProfile {
  csvPath: string;
  rows: number;
  sampledRows: number;
  columns: ColumnProfile[];
  generatedAt: string;
}

export interface ColumnDistribution {
  column: string;
  semanticType: SemanticType;
  bins: number[]; // length 60
}

export type ChartType =
  | "bar"
  | "line"
  | "scatter"
  | "histogram"
  | "heatmap"
  | "boxplot"
  | "pie"
  | "area"
  | "other";

export interface ChartMeta {
  id: string;
  title: string;
  description: string;
  chartType: ChartType;
  relevantColumns: string[];
  filePath: string;
  relPath: string;
  /** 后端附加：可直接拿去做 fetch/inline SVG 的地址 */
  svgUrl?: string;
}

export type InsightKind = "per_chart" | "summary";

export interface Insight {
  kind: InsightKind;
  chartId?: string;
  text: string;
  createdAt: string;
}

export interface UploadResponse {
  taskId: string;
  csvName: string;
  size: number;
  profile: CsvProfile;
  distributions: ColumnDistribution[];
}
