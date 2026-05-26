export type NovelGraphTier = "core" | "active" | "background" | "transient";

export interface NovelGraphProjectMeta {
  id: string;
  title: string;
  language: string;
  schema_version: number;
  created_at?: string;
}

export interface NovelGraphChapter {
  id: string;
  title: string;
  order: number;
}

export interface NovelGraphNode {
  id: string;
  name: string;
  aliases: string[];
  tier: NovelGraphTier;
  importance: number;
  summary: string;
  first_seen_chapter_id?: string;
  last_seen_chapter_id?: string;
  appearance_count: number;
}

export interface NovelGraphPairEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  summary: string;
  confidence?: number;
  first_seen_chapter_id?: string;
  last_seen_chapter_id?: string;
  co_event_count?: number;
  co_appearance_count?: number;
  inferred?: boolean;
  shared_intensity_score?: number;
  stable_graph_eligible?: boolean;
  stable_graph_eligibility_score?: number;
  stable_graph_eligibility_reason?: string;
}

export interface NovelGraphDirectedEdge {
  id: string;
  source: string;
  target: string;
  raw_label?: string;
  structural_base: string;
  structural_label: string;
  stance: string;
  stance_label: string;
  display_relation: string;
  summary: string;
  strength: number;
  first_seen_chapter_id?: string;
  last_seen_chapter_id?: string;
  mention_count?: number;
  stable_graph_eligible?: boolean;
  stable_graph_eligibility_score?: number;
  stable_graph_eligibility_reason?: string;
}

export interface NovelGraphSnapshot {
  project: NovelGraphProjectMeta;
  chapters: NovelGraphChapter[];
  nodes: NovelGraphNode[];
  pair_edges: NovelGraphPairEdge[];
  directed_edges: NovelGraphDirectedEdge[];
}

export type NovelGraphPreciseAnalysisState =
  | "disabled"
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type NovelGraphPreciseAnalysisTrigger =
  | "manual"
  | "chapter_drafted"
  | "pipeline_completed";

export interface NovelGraphPreciseAnalysisRequest {
  trigger?: NovelGraphPreciseAnalysisTrigger;
  force?: boolean;
  chapterId?: string | null;
  chapterOrder?: number | null;
}

export interface NovelGraphPreciseAnalysisStatus {
  novelId: string;
  enabled: boolean;
  providerConfigured: boolean;
  graphAvailable: boolean;
  status: NovelGraphPreciseAnalysisState;
  trigger: NovelGraphPreciseAnalysisTrigger | null;
  chapterId: string | null;
  chapterOrder: number | null;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  lastSuccessfulAt: string | null;
  error: string | null;
  analyzableChapterCount: number | null;
  currentChapterIndex: number | null;
  currentChapterTitle: string | null;
  workspacePath: string | null;
  exportPath: string | null;
}

export type NovelGraphPreciseRuntimeIssueSeverity = "info" | "warning" | "error";

export interface NovelGraphPreciseRuntimeIssue {
  code: string;
  severity: NovelGraphPreciseRuntimeIssueSeverity;
  message: string;
}

export interface NovelGraphPreciseRuntimeReadiness {
  novelId: string;
  ready: boolean;
  enabled: boolean;
  enabledByFlag: boolean;
  autoAnalyze: boolean;
  engineDetected: boolean;
  pythonAvailable: boolean;
  pythonVersion: string | null;
  pythonVersionSupported: boolean;
  requiredPythonVersion: string;
  engineImportAvailable: boolean;
  engineImportError: string | null;
  providerConfigured: boolean;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  modelConfigured: boolean;
  engineRoot: string;
  projectsRoot: string;
  workspacePath: string;
  sourceTxtPath: string;
  exportPath: string;
  pythonExecutable: string;
  pythonArgs: string[];
  provider: string;
  model: string | null;
  issues: NovelGraphPreciseRuntimeIssue[];
}
