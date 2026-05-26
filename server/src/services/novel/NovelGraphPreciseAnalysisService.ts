import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import type {
  NovelGraphChapter,
  NovelGraphDirectedEdge,
  NovelGraphNode,
  NovelGraphPairEdge,
  NovelGraphPreciseAnalysisStatus,
  NovelGraphPreciseRuntimeIssue,
  NovelGraphPreciseRuntimeReadiness,
  NovelGraphPreciseAnalysisTrigger,
  NovelGraphSnapshot,
  NovelGraphTier,
} from "@ai-novel/shared/types/novelGraph";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { resolveDataRoot, resolveWorkspaceRoot } from "../../runtime/appPaths";
import {
  getGraphEngineRuntimeSettingsSnapshot,
  GRAPH_ENGINE_REQUIRED_PYTHON_VERSION,
} from "../settings/GraphEngineRuntimeSettingsService";

type PreciseAnalysisRequest = {
  trigger: NovelGraphPreciseAnalysisTrigger;
  force?: boolean;
  chapterId?: string | null;
  chapterOrder?: number | null;
};

type NormalizedPreciseAnalysisRequest = {
  trigger: NovelGraphPreciseAnalysisTrigger;
  force: boolean;
  chapterId: string | null;
  chapterOrder: number | null;
};

type GraphEngineProviderConfig = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
};

type GraphEngineRuntimeConfig = {
  enabled: boolean;
  enabledByFlag: boolean;
  autoAnalyze: boolean;
  engineDetected: boolean;
  projectsRoot: string;
  engineRoot: string;
  pythonExecutable: string;
  pythonArgs: string[];
  provider: GraphEngineProviderConfig;
};

type PythonRuntimeProbe = {
  available: boolean;
  version: string | null;
  error: string | null;
};

type PythonImportProbe = {
  available: boolean;
  error: string | null;
};

type PythonBridgeChapterPayload = {
  id: string;
  title: string;
  order: number;
  content: string;
};

type PythonBridgePayload = {
  engine_root: string;
  workspace_path: string;
  source_txt_path: string;
  novel_id: string;
  title: string;
  provider: {
    provider: string;
    base_url: string;
    api_key: string;
    model: string;
    temperature: number;
    max_tokens: number;
  };
  chapters: PythonBridgeChapterPayload[];
  chapter_ids: string[];
  force: boolean;
};

type PythonBridgeResult = {
  analyzed_count: number;
  export_path: string;
  workspace_path: string;
};

type PreciseSourceChapter = {
  chapterId: string;
  order: number;
  title: string;
  content: string;
  preciseChapterId: string;
};

type PreciseSourceBundle = {
  novelId: string;
  title: string;
  description: string;
  chapters: PreciseSourceChapter[];
};

type PreciseRunProgress = {
  currentChapterIndex: number | null;
  currentChapterTitle: string | null;
  analyzableChapterCount: number | null;
};

class PreciseAnalysisInterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreciseAnalysisInterruptedError";
  }
}

const GRAPH_ENGINE_PROJECTS_DIR = "novel-graphs";
const GRAPH_ENGINE_SNAPSHOT_FILE = "precise-snapshot.json";
const GRAPH_ENGINE_STATUS_FILE = "status.json";
const GRAPH_ENGINE_SOURCE_TXT = "source.txt";
const GRAPH_ENGINE_RUNTIME_DIR = "_runtime";
const GRAPH_ENGINE_BRIDGE_SCRIPT = "run_precise_graph_analysis.py";
const GRAPH_ENGINE_RUNS_LOG_FILE = "runs.jsonl";

const GRAPH_ENGINE_BRIDGE_SCRIPT_CONTENT = String.raw`from __future__ import annotations

import asyncio
import json
import shutil
import sys
from pathlib import Path


def _require_text(value: object, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required")
    return value.strip()


def _require_dict(value: object, name: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    return value


def _require_list(value: object, name: str) -> list[object]:
    if not isinstance(value, list):
        raise ValueError(f"{name} must be a list")
    return value


def _read_payload() -> dict[str, object]:
    raw = sys.stdin.buffer.read()
    if not raw.strip():
        raise ValueError("stdin payload is empty")
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("payload root must be an object")
    return parsed


async def _main() -> None:
    payload = _read_payload()
    engine_root = Path(_require_text(payload.get("engine_root"), "engine_root"))
    workspace_path = Path(_require_text(payload.get("workspace_path"), "workspace_path"))
    source_txt_path = Path(_require_text(payload.get("source_txt_path"), "source_txt_path"))
    novel_id = _require_text(payload.get("novel_id"), "novel_id")
    title = _require_text(payload.get("title"), "title")
    provider_payload = _require_dict(payload.get("provider"), "provider")
    chapters_payload = _require_list(payload.get("chapters"), "chapters")
    chapter_ids_value = payload.get("chapter_ids")
    chapter_ids = []
    if isinstance(chapter_ids_value, list):
        chapter_ids = [str(item).strip() for item in chapter_ids_value if str(item).strip()]
    force = bool(payload.get("force"))

    src_dir = engine_root / "src"
    if not src_dir.exists():
        raise FileNotFoundError(f"graph engine src directory not found: {src_dir}")
    if str(src_dir) not in sys.path:
        sys.path.insert(0, str(src_dir))

    from novel_graph_engine.ai.openai_compatible_client import AiProviderConfig
    from novel_graph_engine.project.settings import AiSettings
    from novel_graph_engine.project.workspace import ProjectWorkspace
    from novel_graph_engine.schema.project import BookProject, Chapter

    provider = AiProviderConfig(
        provider=_require_text(provider_payload.get("provider"), "provider.provider"),
        base_url=_require_text(provider_payload.get("base_url"), "provider.base_url"),
        api_key=_require_text(provider_payload.get("api_key"), "provider.api_key"),
        model=_require_text(provider_payload.get("model"), "provider.model"),
        temperature=float(provider_payload.get("temperature") or 0.0),
        max_tokens=int(provider_payload.get("max_tokens") or 15000),
    )

    workspace = ProjectWorkspace(workspace_path)
    workspace.init()
    workspace.save_ai_settings(
        AiSettings(
            provider=provider.provider,
            base_url=provider.base_url,
            api_key=provider.api_key,
            model=provider.model,
            temperature=provider.temperature,
            max_response_tokens=provider.max_tokens,
        )
    )

    source_copy_path = workspace.source_dir / source_txt_path.name
    if source_txt_path.exists() and source_txt_path.resolve() != source_copy_path.resolve():
        shutil.copy2(source_txt_path, source_copy_path)
    elif source_txt_path.exists():
        source_copy_path = source_txt_path

    if workspace.chapters_dir.exists():
        shutil.rmtree(workspace.chapters_dir)
    workspace.chapters_dir.mkdir(parents=True, exist_ok=True)

    chapters: list[Chapter] = []
    for index, chapter_payload in enumerate(chapters_payload):
        chapter_record = _require_dict(chapter_payload, f"chapters[{index}]")
        chapter_id = _require_text(chapter_record.get("id"), f"chapters[{index}].id")
        chapter_title = _require_text(chapter_record.get("title"), f"chapters[{index}].title")
        chapter_content = _require_text(chapter_record.get("content"), f"chapters[{index}].content")
        order_value = chapter_record.get("order")
        if isinstance(order_value, bool) or not isinstance(order_value, int):
            raise ValueError(f"chapters[{index}].order must be an integer")
        chapter_text_path = workspace.chapters_dir / f"{chapter_id}.txt"
        chapter_text_path.write_text(chapter_content, encoding="utf-8")
        chapters.append(
            Chapter(
                id=chapter_id,
                title=chapter_title,
                order=order_value,
                source_href=f"novel:{novel_id}/chapter:{chapter_id}",
                text_path=chapter_text_path.relative_to(workspace.root).as_posix(),
            )
        )

    project = BookProject(
        id=novel_id,
        title=title,
        source_txt_path=source_copy_path.relative_to(workspace.root).as_posix() if source_copy_path.exists() else None,
        source_format="txt",
        chapters=chapters,
    )
    workspace.save_project(project)
    analyzed_count = await workspace.analyze_project(
        provider=provider,
        chapter_ids=chapter_ids or None,
        force=force,
    )
    export_path = await workspace.export_character_graph_async()
    result = {
        "analyzed_count": analyzed_count,
        "export_path": str(export_path),
        "workspace_path": str(workspace.root),
    }
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    asyncio.run(_main())
`;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return defaultValue;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function splitCommandArgs(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function toIsoTimestamp(input: Date = new Date()): string {
  return input.toISOString();
}

function normalizeSourceText(input: string | null | undefined): string {
  return (input ?? "").replace(/\r\n?/g, "\n").trim();
}

function buildPreciseChapterId(chapterId: string): string {
  return chapterId.trim();
}

function buildPreciseSourceSignature(bundle: PreciseSourceBundle): string {
  return bundle.chapters.map((chapter) => `${chapter.chapterId}:${chapter.order}`).join("|");
}

function buildPreciseSourceContent(bundle: PreciseSourceBundle): string {
  const lines: string[] = [];
  lines.push(`《${bundle.title}》`);
  lines.push("");

  const description = normalizeSourceText(bundle.description);
  if (description) {
    lines.push("【作品描述】");
    lines.push(description);
    lines.push("");
  }

  if (bundle.chapters.length === 0) {
    lines.push("（暂无可分析的章节内容）");
    return lines.join("\n");
  }

  for (const chapter of bundle.chapters) {
    lines.push("=".repeat(48));
    lines.push(`?${chapter.order}? ${chapter.title}`);
    lines.push("-".repeat(48));
    lines.push(chapter.content);
    lines.push("");
  }

  return lines.join("\n");
}

function isPythonVersionSupported(version: string | null): boolean {
  if (!version) {
    return false;
  }

  const match = version.match(/Python\s+(\d+)\.(\d+)/i);
  if (!match) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) {
    return false;
  }

  return major > 3 || (major === 3 && minor >= 11);
}

function normalizeGraphTier(input: unknown): NovelGraphTier {
  return input === "core" || input === "active" || input === "background" || input === "transient"
    ? input
    : "active";
}

function normalizeAliases(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object" && "alias" in item && typeof item.alias === "string") {
        return item.alias.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeOptionalString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input : undefined;
}

function normalizeNumber(input: unknown, fallback: number): number {
  return typeof input === "number" && Number.isFinite(input) ? input : fallback;
}

function hasProviderConfig(provider: GraphEngineProviderConfig): boolean {
  return Boolean(provider.baseUrl.trim() && provider.apiKey.trim() && provider.model.trim());
}

function detectGraphProviderLabel(message: string): string {
  if (/api\.deepseek\.com/i.test(message)) {
    return "DeepSeek";
  }
  if (/api\.minimax\.io/i.test(message)) {
    return "MiniMax";
  }
  if (/api\.openai\.com/i.test(message)) {
    return "OpenAI";
  }
  if (/dashscope\.aliyuncs\.com/i.test(message)) {
    return "Qwen";
  }
  if (/generativelanguage\.googleapis\.com/i.test(message)) {
    return "Gemini";
  }
  return "Unknown provider";
}

function summarizeGraphEngineErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Precise graph analysis failed.";
  }

  const providerLabel = detectGraphProviderLabel(trimmed);
  if (/402 Payment Required/i.test(trimmed)) {
    return `Precise graph analysis failed: ${providerLabel} balance is insufficient or the account is in arrears.`;
  }
  if (/401 Unauthorized/i.test(trimmed)) {
    return `Precise graph analysis failed: ${providerLabel} authentication failed. Please check the API key, base URL, and model name.`;
  }
  if (/429 Too Many Requests/i.test(trimmed)) {
    return `Precise graph analysis failed: ${providerLabel} is rate limited. Please try again later.`;
  }

  const bridgePrefix = "Graph analysis engine execution failed:";
  if (trimmed.startsWith(bridgePrefix)) {
    const detail = trimmed.slice(bridgePrefix.length).trim();
    if (!detail) {
      return "Precise graph analysis failed: graph engine returned an empty error.";
    }
    return `Precise graph analysis failed: ${detail}`;
  }

  return trimmed;
}

function errorToMessage(error: unknown): string {
  if (error instanceof AppError) {
    return summarizeGraphEngineErrorMessage(error.message);
  }
  if (error instanceof Error) {
    return summarizeGraphEngineErrorMessage(error.message);
  }
  if (typeof error === "string" && error.trim()) {
    return summarizeGraphEngineErrorMessage(error);
  }
  return "Precise graph analysis failed.";
}

function buildDefaultStatus(
  novelId: string,
  runtime: GraphEngineRuntimeConfig,
  graphAvailable: boolean,
  workspacePath: string,
  exportPath: string | null,
): NovelGraphPreciseAnalysisStatus {
  const timestamp = toIsoTimestamp();
  return {
    novelId,
    enabled: runtime.enabled,
    providerConfigured: hasProviderConfig(runtime.provider),
    graphAvailable,
    status: runtime.enabled ? "idle" : "disabled",
    trigger: null,
    chapterId: null,
    chapterOrder: null,
    queuedAt: null,
    startedAt: null,
    finishedAt: null,
    updatedAt: timestamp,
    lastSuccessfulAt: null,
    error: null,
    analyzableChapterCount: null,
    currentChapterIndex: null,
    currentChapterTitle: null,
    workspacePath,
    exportPath,
  };
}

function normalizePreciseGraphSnapshot(
  payload: unknown,
  fallbackNovelId: string,
  fallbackTitle: string,
): NovelGraphSnapshot {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const projectRecord = record.project && typeof record.project === "object"
    ? record.project as Record<string, unknown>
    : {};
  const chapterList = Array.isArray(record.chapters) ? record.chapters : [];
  const nodeList = Array.isArray(record.nodes) ? record.nodes : [];
  const pairEdgeList = Array.isArray(record.pair_edges) ? record.pair_edges : [];
  const directedEdgeList = Array.isArray(record.directed_edges) ? record.directed_edges : [];

  const chapters: NovelGraphChapter[] = [];
  for (const item of chapterList) {
    const chapter = item && typeof item === "object" ? item as Record<string, unknown> : null;
    if (!chapter) {
      continue;
    }
    const id = normalizeOptionalString(chapter.id);
    const title = normalizeOptionalString(chapter.title);
    const order = normalizeNumber(chapter.order, NaN);
    if (!id || !title || !Number.isFinite(order)) {
      continue;
    }
    chapters.push({ id, title, order });
  }

  const nodes: NovelGraphNode[] = [];
  for (const item of nodeList) {
    const node = item && typeof item === "object" ? item as Record<string, unknown> : null;
    if (!node) {
      continue;
    }
    const id = normalizeOptionalString(node.id);
    const name = normalizeOptionalString(node.name) ?? normalizeOptionalString(node.canonical_name);
    if (!id || !name) {
      continue;
    }

    const normalizedNode: NovelGraphNode = {
      id,
      name,
      aliases: normalizeAliases(node.aliases),
      tier: normalizeGraphTier(node.tier),
      importance: normalizeNumber(node.importance, normalizeNumber(node.importance_score, 40)),
      summary: normalizeOptionalString(node.summary) ?? normalizeOptionalString(node.profile_summary) ?? "",
      appearance_count: normalizeNumber(node.appearance_count, 0),
    };

    const firstSeenChapterId = normalizeOptionalString(node.first_seen_chapter_id);
    const lastSeenChapterId = normalizeOptionalString(node.last_seen_chapter_id);
    if (firstSeenChapterId) {
      normalizedNode.first_seen_chapter_id = firstSeenChapterId;
    }
    if (lastSeenChapterId) {
      normalizedNode.last_seen_chapter_id = lastSeenChapterId;
    }

    nodes.push(normalizedNode);
  }

  const pair_edges: NovelGraphPairEdge[] = [];
  for (const item of pairEdgeList) {
    const edge = item && typeof item === "object" ? item as Record<string, unknown> : null;
    if (!edge) {
      continue;
    }
    const id = normalizeOptionalString(edge.id);
    const source = normalizeOptionalString(edge.source) ?? normalizeOptionalString(edge.entity_a_id);
    const target = normalizeOptionalString(edge.target) ?? normalizeOptionalString(edge.entity_b_id);
    const type = normalizeOptionalString(edge.type) ?? "unknown";
    if (!id || !source || !target) {
      continue;
    }

    const normalizedEdge: NovelGraphPairEdge = {
      id,
      source,
      target,
      type,
      label: normalizeOptionalString(edge.label) ?? type,
      summary: normalizeOptionalString(edge.summary) ?? normalizeOptionalString(edge.pair_summary) ?? "",
      confidence: normalizeNumber(edge.confidence, 0.6),
      co_event_count: normalizeNumber(edge.co_event_count, 0),
      co_appearance_count: normalizeNumber(edge.co_appearance_count, 0),
      inferred: Boolean(edge.inferred),
      shared_intensity_score: normalizeNumber(edge.shared_intensity_score, 50),
    };

    const firstSeenChapterId = normalizeOptionalString(edge.first_seen_chapter_id);
    const lastSeenChapterId = normalizeOptionalString(edge.last_seen_chapter_id);
    const stableGraphEligibilityScore =
      typeof edge.stable_graph_eligibility_score === "number" ? edge.stable_graph_eligibility_score : undefined;
    const stableGraphEligibilityReason = normalizeOptionalString(edge.stable_graph_eligibility_reason);
    if (firstSeenChapterId) {
      normalizedEdge.first_seen_chapter_id = firstSeenChapterId;
    }
    if (lastSeenChapterId) {
      normalizedEdge.last_seen_chapter_id = lastSeenChapterId;
    }
    if (typeof edge.stable_graph_eligible === "boolean") {
      normalizedEdge.stable_graph_eligible = edge.stable_graph_eligible;
    }
    if (stableGraphEligibilityScore !== undefined) {
      normalizedEdge.stable_graph_eligibility_score = stableGraphEligibilityScore;
    }
    if (stableGraphEligibilityReason) {
      normalizedEdge.stable_graph_eligibility_reason = stableGraphEligibilityReason;
    }

    pair_edges.push(normalizedEdge);
  }

  const directed_edges: NovelGraphDirectedEdge[] = [];
  for (const item of directedEdgeList) {
    const edge = item && typeof item === "object" ? item as Record<string, unknown> : null;
    if (!edge) {
      continue;
    }
    const id = normalizeOptionalString(edge.id);
    const source = normalizeOptionalString(edge.source) ?? normalizeOptionalString(edge.from_entity_id);
    const target = normalizeOptionalString(edge.target) ?? normalizeOptionalString(edge.to_entity_id);
    if (!id || !source || !target) {
      continue;
    }

    const structuralBase = normalizeOptionalString(edge.structural_base) ?? "unknown";
    const structuralLabel = normalizeOptionalString(edge.structural_label)
      ?? normalizeOptionalString(edge.structural_base_label)
      ?? structuralBase;
    const stance = normalizeOptionalString(edge.stance) ?? normalizeOptionalString(edge.dynamic_stance) ?? "neutral";
    const stanceLabel = normalizeOptionalString(edge.stance_label)
      ?? normalizeOptionalString(edge.dynamic_stance_label)
      ?? stance;
    const displayRelation = normalizeOptionalString(edge.display_relation) ?? structuralLabel;

    const normalizedEdge: NovelGraphDirectedEdge = {
      id,
      source,
      target,
      structural_base: structuralBase,
      structural_label: structuralLabel,
      stance,
      stance_label: stanceLabel,
      display_relation: displayRelation,
      summary: normalizeOptionalString(edge.summary) ?? normalizeOptionalString(edge.state_summary) ?? "",
      strength: normalizeNumber(edge.strength, normalizeNumber(edge.strength_score, 50)),
      mention_count: normalizeNumber(edge.mention_count, 0),
    };

    const rawLabel = normalizeOptionalString(edge.raw_label);
    const firstSeenChapterId = normalizeOptionalString(edge.first_seen_chapter_id);
    const lastSeenChapterId = normalizeOptionalString(edge.last_seen_chapter_id);
    const stableGraphEligibilityScore =
      typeof edge.stable_graph_eligibility_score === "number" ? edge.stable_graph_eligibility_score : undefined;
    const stableGraphEligibilityReason = normalizeOptionalString(edge.stable_graph_eligibility_reason);
    if (rawLabel) {
      normalizedEdge.raw_label = rawLabel;
    }
    if (firstSeenChapterId) {
      normalizedEdge.first_seen_chapter_id = firstSeenChapterId;
    }
    if (lastSeenChapterId) {
      normalizedEdge.last_seen_chapter_id = lastSeenChapterId;
    }
    if (typeof edge.stable_graph_eligible === "boolean") {
      normalizedEdge.stable_graph_eligible = edge.stable_graph_eligible;
    }
    if (stableGraphEligibilityScore !== undefined) {
      normalizedEdge.stable_graph_eligibility_score = stableGraphEligibilityScore;
    }
    if (stableGraphEligibilityReason) {
      normalizedEdge.stable_graph_eligibility_reason = stableGraphEligibilityReason;
    }

    directed_edges.push(normalizedEdge);
  }

  return {
    project: {
      id: normalizeOptionalString(projectRecord.id) ?? fallbackNovelId,
      title: normalizeOptionalString(projectRecord.title) ?? fallbackTitle,
      language: normalizeOptionalString(projectRecord.language) ?? "zh-CN",
      schema_version: normalizeNumber(projectRecord.schema_version, 1),
      created_at: normalizeOptionalString(projectRecord.created_at),
    },
    chapters,
    nodes,
    pair_edges,
    directed_edges,
  };
}

export class NovelGraphPreciseAnalysisService {
  private readonly scheduledRuns = new Map<string, NodeJS.Timeout>();

  private readonly runningNovelIds = new Set<string>();

  private readonly pendingRequests = new Map<string, NormalizedPreciseAnalysisRequest>();

  private readonly runningProcesses = new Map<string, ChildProcessWithoutNullStreams>();

  private readonly runningSourceSignatures = new Map<string, string>();

  private readonly interruptedRuns = new Map<string, string>();

  private async resolveAnalyzableChapterCountSafe(novelId: string): Promise<number | null> {
    try {
      const sourceBundle = await this.buildPreciseSourceBundle(novelId);
      return sourceBundle.chapters.length;
    } catch {
      return null;
    }
  }

  async getStatus(novelId: string): Promise<NovelGraphPreciseAnalysisStatus> {
    const runtime = this.getRuntimeConfig();
    const statusPath = this.resolveStatusPath(novelId);
    const workspacePath = this.resolveWorkspacePath(novelId);
    const snapshotPath = this.resolveSnapshotPath(novelId);
    const exportPath = this.resolvePreciseExportPath(novelId);
    const graphAvailable = await this.fileExists(snapshotPath);

    let stored = await this.readStatusFile(statusPath);
    if (!stored) {
      return buildDefaultStatus(
        novelId,
        runtime,
        graphAvailable,
        workspacePath,
        (await this.fileExists(exportPath)) ? exportPath : null,
      );
    }

    if (
      (stored.status === "running" || stored.status === "queued")
      && !this.runningNovelIds.has(novelId)
      && !this.pendingRequests.has(novelId)
      && !this.scheduledRuns.has(novelId)
    ) {
      const analyzableChapterCount =
        await this.resolveAnalyzableChapterCountSafe(novelId) ?? stored.analyzableChapterCount ?? null;
      const fallbackStatus: NovelGraphPreciseAnalysisStatus = {
        ...stored,
        status: graphAvailable ? "succeeded" : "idle",
        error: null,
        analyzableChapterCount,
        currentChapterIndex: graphAvailable ? analyzableChapterCount : null,
        currentChapterTitle: null,
        finishedAt: stored.lastSuccessfulAt ?? stored.finishedAt ?? stored.updatedAt ?? toIsoTimestamp(),
        updatedAt: toIsoTimestamp(),
      };
      await this.writeStatus(novelId, fallbackStatus);
      stored = fallbackStatus;
    }

    if (stored.status === "running" && this.runningNovelIds.has(novelId)) {
      const reconciledStatus = await this.reconcileRunningAnalysisSource(novelId, stored);
      if (reconciledStatus) {
        stored = reconciledStatus;
      }
    }

    const runProgress =
      stored.status === "running" || stored.status === "queued"
        ? await this.readRunProgress(novelId)
        : null;
    const analyzableChapterCount = runProgress?.analyzableChapterCount ?? stored.analyzableChapterCount ?? null;
    const currentChapterIndex =
      stored.status === "succeeded" && analyzableChapterCount
        ? analyzableChapterCount
        : runProgress?.currentChapterIndex ?? stored.currentChapterIndex ?? null;
    const currentChapterTitle = runProgress?.currentChapterTitle ?? stored.currentChapterTitle ?? null;

    return {
      ...stored,
      novelId,
      enabled: runtime.enabled,
      providerConfigured: hasProviderConfig(runtime.provider),
      graphAvailable,
      status: runtime.enabled ? stored.status : "disabled",
      analyzableChapterCount,
      currentChapterIndex,
      currentChapterTitle,
      workspacePath,
      exportPath: (await this.fileExists(exportPath)) ? exportPath : stored.exportPath,
      updatedAt: stored.updatedAt || toIsoTimestamp(),
    };
  }

  async reconcileActiveAnalysis(novelId: string): Promise<void> {
    if (!this.runningNovelIds.has(novelId)) {
      return;
    }

    const stored = await this.readStatusFile(this.resolveStatusPath(novelId));
    if (!stored || stored.status !== "running") {
      return;
    }

    await this.reconcileRunningAnalysisSource(novelId, stored);
  }

  async readPreciseSnapshot(novelId: string): Promise<NovelGraphSnapshot> {
    const snapshotPath = this.resolveSnapshotPath(novelId);
    if (!await this.fileExists(snapshotPath)) {
      throw new AppError("Precise graph result has not been generated yet.", 404);
    }
    const raw = await fs.readFile(snapshotPath, "utf-8");
    return JSON.parse(raw) as NovelGraphSnapshot;
  }

  async readPreciseSnapshotSafe(novelId: string): Promise<NovelGraphSnapshot> {
    const snapshotPath = this.resolveSnapshotPath(novelId);
    if (!await this.fileExists(snapshotPath)) {
      throw new AppError("Precise graph result has not been generated yet.", 404);
    }
    const raw = await fs.readFile(snapshotPath, "utf-8");
    return JSON.parse(raw) as NovelGraphSnapshot;
  }

  async getReadiness(novelId: string): Promise<NovelGraphPreciseRuntimeReadiness> {
    const runtime = this.getRuntimeConfig();
    const baseUrlConfigured = Boolean(runtime.provider.baseUrl.trim());
    const apiKeyConfigured = Boolean(runtime.provider.apiKey.trim());
    const modelConfigured = Boolean(runtime.provider.model.trim());
    const providerConfigured = hasProviderConfig(runtime.provider);
    const pythonProbe = await this.probePythonRuntime(runtime);
    const issues: NovelGraphPreciseRuntimeIssue[] = [];

    if (!runtime.enabledByFlag) {
      issues.push({
        code: "engine-disabled",
        severity: "warning",
        message: "Precise graph engine is disabled by configuration. Please check AI_NOVEL_GRAPH_ENGINE_ENABLED.",
      });
    }
    if (!runtime.engineDetected) {
      issues.push({
        code: "engine-missing",
        severity: "error",
        message: `Graph engine root not found: ${runtime.engineRoot}`,
      });
    }
    if (!pythonProbe.available) {
      issues.push({
        code: "python-unavailable",
        severity: "error",
        message: pythonProbe.error || "Local Python runtime is unavailable.",
      });
    }
    if (!baseUrlConfigured) {
      issues.push({
        code: "provider-base-url-missing",
        severity: "error",
        message: "Graph model base URL is missing. Please configure AI_NOVEL_GRAPH_ENGINE_BASE_URL or OPENAI_BASE_URL.",
      });
    }
    if (!apiKeyConfigured) {
      issues.push({
        code: "provider-api-key-missing",
        severity: "error",
        message: "Graph model API key is missing. Please configure AI_NOVEL_GRAPH_ENGINE_API_KEY or OPENAI_API_KEY.",
      });
    }
    if (!modelConfigured) {
      issues.push({
        code: "provider-model-missing",
        severity: "error",
        message: "Graph model name is missing. Please configure AI_NOVEL_GRAPH_ENGINE_MODEL or OPENAI_MODEL.",
      });
    }
    if (!runtime.autoAnalyze) {
      issues.push({
        code: "auto-analyze-disabled",
        severity: "info",
        message: "Auto precise analysis is disabled, so chapter drafts will not refresh the precise graph automatically.",
      });
    }

    return {
      novelId,
      ready: runtime.enabled && providerConfigured && pythonProbe.available,
      enabled: runtime.enabled,
      enabledByFlag: runtime.enabledByFlag,
      autoAnalyze: runtime.autoAnalyze,
      engineDetected: runtime.engineDetected,
      pythonAvailable: pythonProbe.available,
      pythonVersion: pythonProbe.version,
      pythonVersionSupported: isPythonVersionSupported(pythonProbe.version),
      requiredPythonVersion: GRAPH_ENGINE_REQUIRED_PYTHON_VERSION,
      engineImportAvailable: runtime.engineDetected && pythonProbe.available,
      engineImportError: null,
      providerConfigured,
      baseUrlConfigured,
      apiKeyConfigured,
      modelConfigured,
      engineRoot: runtime.engineRoot,
      projectsRoot: runtime.projectsRoot,
      workspacePath: this.resolveWorkspacePath(novelId),
      sourceTxtPath: this.resolveSourceTxtPath(novelId),
      exportPath: this.resolvePreciseExportPath(novelId),
      pythonExecutable: runtime.pythonExecutable,
      pythonArgs: runtime.pythonArgs,
      provider: runtime.provider.provider,
      model: runtime.provider.model.trim() || null,
      issues,
    };
  }

  async getRuntimeReadiness(novelId: string): Promise<NovelGraphPreciseRuntimeReadiness> {
    const runtime = this.getRuntimeConfig();
    const baseUrlConfigured = Boolean(runtime.provider.baseUrl.trim());
    const apiKeyConfigured = Boolean(runtime.provider.apiKey.trim());
    const modelConfigured = Boolean(runtime.provider.model.trim());
    const providerConfigured = hasProviderConfig(runtime.provider);
    const pythonProbe = await this.probePythonRuntimeSafe(runtime);
    const pythonVersionSupported = isPythonVersionSupported(pythonProbe.version);
    const engineImportProbe = await this.probeEngineImport(runtime, pythonProbe);
    const issues: NovelGraphPreciseRuntimeIssue[] = [];

    if (!runtime.enabledByFlag) {
      issues.push({
        code: "engine-disabled",
        severity: "warning",
        message: "Precise graph engine is disabled by configuration. Please check AI_NOVEL_GRAPH_ENGINE_ENABLED.",
      });
    }
    if (!runtime.engineDetected) {
      issues.push({
        code: "engine-missing",
        severity: "error",
        message: `Graph engine root not found: ${runtime.engineRoot}`,
      });
    }
    if (!pythonProbe.available) {
      issues.push({
        code: "python-unavailable",
        severity: "error",
        message: pythonProbe.error || "Local Python runtime is unavailable.",
      });
    }
    if (pythonProbe.available && !pythonVersionSupported) {
      issues.push({
        code: "python-version-unsupported",
        severity: "error",
        message: `graph-every-novel requires Python ${GRAPH_ENGINE_REQUIRED_PYTHON_VERSION}+ in the current environment.`, 
      });
    }
    if (runtime.engineDetected && pythonProbe.available && !engineImportProbe.available) {
      issues.push({
        code: "engine-import-failed",
        severity: "error",
        message: engineImportProbe.error || "graph-every-novel dependencies could not be imported. Please check the local Python environment.",
      });
    }
    if (!baseUrlConfigured) {
      issues.push({
        code: "provider-base-url-missing",
        severity: "error",
        message: "Graph model base URL is missing. Please configure AI_NOVEL_GRAPH_ENGINE_BASE_URL or OPENAI_BASE_URL.",
      });
    }
    if (!apiKeyConfigured) {
      issues.push({
        code: "provider-api-key-missing",
        severity: "error",
        message: "Graph model API key is missing. Please configure AI_NOVEL_GRAPH_ENGINE_API_KEY or OPENAI_API_KEY.",
      });
    }
    if (!modelConfigured) {
      issues.push({
        code: "provider-model-missing",
        severity: "error",
        message: "Graph model name is missing. Please configure AI_NOVEL_GRAPH_ENGINE_MODEL or OPENAI_MODEL.",
      });
    }
    if (!runtime.autoAnalyze) {
      issues.push({
        code: "auto-analyze-disabled",
        severity: "info",
        message: "Auto precise analysis is disabled, so chapter drafts will not refresh the precise graph automatically.",
      });
    }

    return {
      novelId,
      ready: runtime.enabled && providerConfigured && pythonProbe.available && engineImportProbe.available,
      enabled: runtime.enabled,
      enabledByFlag: runtime.enabledByFlag,
      autoAnalyze: runtime.autoAnalyze,
      engineDetected: runtime.engineDetected,
      pythonAvailable: pythonProbe.available,
      pythonVersion: pythonProbe.version,
      pythonVersionSupported,
      requiredPythonVersion: GRAPH_ENGINE_REQUIRED_PYTHON_VERSION,
      engineImportAvailable: engineImportProbe.available,
      engineImportError: engineImportProbe.error,
      providerConfigured,
      baseUrlConfigured,
      apiKeyConfigured,
      modelConfigured,
      engineRoot: runtime.engineRoot,
      projectsRoot: runtime.projectsRoot,
      workspacePath: this.resolveWorkspacePath(novelId),
      sourceTxtPath: this.resolveSourceTxtPath(novelId),
      exportPath: this.resolvePreciseExportPath(novelId),
      pythonExecutable: runtime.pythonExecutable,
      pythonArgs: runtime.pythonArgs,
      provider: runtime.provider.provider,
      model: runtime.provider.model.trim() || null,
      issues,
    };
  }

  async requestAnalysis(novelId: string, request: PreciseAnalysisRequest): Promise<NovelGraphPreciseAnalysisStatus> {
    const runtime = this.getRuntimeConfig();
    if (!runtime.enabled) {
      throw new AppError("Precise graph analysis engine is not enabled. Please configure the local graph engine first.", 503);
    }
    if (!hasProviderConfig(runtime.provider)) {
      throw new AppError("Precise graph analysis is missing a configured model provider.", 400);
    }
    const pythonProbe = await this.probePythonRuntimeSafe(runtime);
    if (!pythonProbe.available) {
      throw new AppError(pythonProbe.error || "Local Python runtime is unavailable.", 503);
    }
    if (!isPythonVersionSupported(pythonProbe.version)) {
      throw new AppError(
        `graph-every-novel requires Python ${GRAPH_ENGINE_REQUIRED_PYTHON_VERSION}+; please upgrade the local Python runtime.`, 
        503,
      );
    }
    const engineImportProbe = await this.probeEngineImport(runtime, pythonProbe);
    if (!engineImportProbe.available) {
      throw new AppError(
        engineImportProbe.error || "graph-every-novel dependencies could not be imported. Please check the local Python environment.",
        503,
      );
    }
    if (!runtime.enabled) {
      throw new AppError("Precise graph analysis engine is not enabled. Please configure the local graph engine first.", 503);
    }
    if (!hasProviderConfig(runtime.provider)) {
      throw new AppError("Precise graph analysis is missing a configured model provider.", 400);
    }

    const normalizedRequest = this.normalizeRequest(request);
    const sourceBundle = await this.buildPreciseSourceBundle(novelId);
    if (sourceBundle.chapters.length === 0) {
      throw new AppError("There is no chapter content available for precise graph analysis yet.", 400);
    }
    if (!this.findSourceChapterForRequest(sourceBundle, normalizedRequest) && (normalizedRequest.chapterId || normalizedRequest.chapterOrder != null)) {
      throw new AppError("The requested chapter does not have eligible content for precise graph analysis yet.", 400);
    }
    const analyzableChapterCount = sourceBundle.chapters.length;
    const sourceSignature = buildPreciseSourceSignature(sourceBundle);
    const currentStatus = await this.getStatus(novelId);
    const queuedAt = toIsoTimestamp();
    const resolvedExportPath = await this.fileExists(this.resolvePreciseExportPath(novelId))
      ? this.resolvePreciseExportPath(novelId)
      : currentStatus.exportPath;

    if (this.runningNovelIds.has(novelId)) {
      const redundantWholeNovelRerun =
        normalizedRequest.trigger === "pipeline_completed"
        && !normalizedRequest.chapterId
        && normalizedRequest.chapterOrder == null
        && this.isWholeNovelStatus(currentStatus)
        && ["queued", "running", "succeeded"].includes(currentStatus.status);

      if (redundantWholeNovelRerun) {
        return this.buildStatusWithResolvedExportPath(
          {
            ...currentStatus,
            enabled: true,
            providerConfigured: true,
            analyzableChapterCount: analyzableChapterCount,
            updatedAt: queuedAt,
          },
          resolvedExportPath,
        );
      }

      const runningSignature = this.runningSourceSignatures.get(novelId);
      if (runningSignature && runningSignature !== sourceSignature) {
        return this.interruptRunningAnalysis(
          novelId,
          currentStatus,
          analyzableChapterCount,
          normalizedRequest,
        );
      }

      this.pendingRequests.set(novelId, normalizedRequest);
      const runningStatus = this.buildStatusWithResolvedExportPath(
        {
          ...currentStatus,
          enabled: true,
          providerConfigured: true,
          analyzableChapterCount,
          queuedAt,
          updatedAt: queuedAt,
        },
        resolvedExportPath,
      );
      await this.writeStatus(novelId, runningStatus);
      return runningStatus;
    }

    const queuedStatus: NovelGraphPreciseAnalysisStatus = {
      ...currentStatus,
      enabled: true,
      providerConfigured: true,
      status: "queued",
      trigger: normalizedRequest.trigger,
      chapterId: normalizedRequest.chapterId,
      chapterOrder: normalizedRequest.chapterOrder,
      queuedAt,
      updatedAt: queuedAt,
      error: null,
      analyzableChapterCount,
      currentChapterIndex: 0,
      currentChapterTitle: null,
      workspacePath: this.resolveWorkspacePath(novelId),
      exportPath: resolvedExportPath,
    };

    this.pendingRequests.set(novelId, normalizedRequest);
    await this.writeStatus(novelId, queuedStatus);

    this.scheduleRun(novelId, this.resolveTriggerDelay(normalizedRequest.trigger));
    return queuedStatus;
  }

  scheduleAutoAnalysis(novelId: string, request: Omit<PreciseAnalysisRequest, "force">): void {
    const runtime = this.getRuntimeConfig();
    if (!runtime.enabled || !runtime.autoAnalyze || !hasProviderConfig(runtime.provider)) {
      return;
    }

    void this.requestAnalysis(novelId, { ...request, force: true }).catch((error) => {
      console.warn("[graph] failed to schedule precise analysis", {
        novelId,
        trigger: request.trigger,
        error: errorToMessage(error),
      });
    });
  }

  private normalizeRequest(request: PreciseAnalysisRequest): NormalizedPreciseAnalysisRequest {
    return {
      trigger: request.trigger,
      force: request.force ?? true,
      chapterId: request.chapterId?.trim() ? request.chapterId.trim() : null,
      chapterOrder: typeof request.chapterOrder === "number" && Number.isFinite(request.chapterOrder)
        ? Math.max(1, Math.floor(request.chapterOrder))
        : null,
    };
  }

  private resolveTriggerDelay(trigger: NovelGraphPreciseAnalysisTrigger): number {
    switch (trigger) {
      case "chapter_drafted":
        return 4_000;
      case "pipeline_completed":
        return 1_500;
      case "manual":
      default:
        return 0;
    }
  }

  private async buildPreciseSourceBundle(novelId: string): Promise<PreciseSourceBundle> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        description: true,
        chapters: {
          select: {
            id: true,
            order: true,
            title: true,
            content: true,
            chapterStatus: true,
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!novel) {
      throw new AppError("Novel not found.", 404);
    }

    const chapters: PreciseSourceChapter[] = [];
    for (const chapter of novel.chapters) {
      if (chapter.chapterStatus === "unplanned") {
        continue;
      }
      const content = normalizeSourceText(chapter.content);
      if (!content) {
        continue;
      }
      chapters.push({
        chapterId: chapter.id,
        order: chapter.order,
        title: chapter.title,
        content,
        preciseChapterId: buildPreciseChapterId(chapter.id),
      });
    }

    return {
      novelId: novel.id,
      title: novel.title,
      description: novel.description ?? "",
      chapters,
    };
  }

  private findSourceChapterForRequest(
    sourceBundle: PreciseSourceBundle,
    request: NormalizedPreciseAnalysisRequest,
  ): PreciseSourceChapter | null {
    if (request.chapterId) {
      const matchedById = sourceBundle.chapters.find((chapter) => chapter.chapterId === request.chapterId) ?? null;
      if (matchedById) {
        return matchedById;
      }
    }
    if (request.chapterOrder != null) {
      return sourceBundle.chapters.find((chapter) => chapter.order === request.chapterOrder) ?? null;
    }
    return null;
  }

  private resolvePreciseChapterIds(
    sourceBundle: PreciseSourceBundle,
    request: NormalizedPreciseAnalysisRequest,
  ): string[] {
    const targetChapter = this.findSourceChapterForRequest(sourceBundle, request);
    if (!targetChapter) {
      return [];
    }
    return [targetChapter.preciseChapterId];
  }

  private isWholeNovelStatus(status: NovelGraphPreciseAnalysisStatus): boolean {
    return !status.chapterId && status.chapterOrder == null;
  }

  private buildStatusWithResolvedExportPath(
    status: NovelGraphPreciseAnalysisStatus,
    exportPath: string | null,
  ): NovelGraphPreciseAnalysisStatus {
    return {
      ...status,
      workspacePath: this.resolveWorkspacePath(status.novelId),
      exportPath: exportPath ?? status.exportPath,
    };
  }

  private buildRequestFromStatus(status: NovelGraphPreciseAnalysisStatus): NormalizedPreciseAnalysisRequest {
    return {
      trigger: status.trigger ?? "manual",
      force: true,
      chapterId: status.chapterId,
      chapterOrder: status.chapterOrder,
    };
  }

  private async reconcileRunningAnalysisSource(
    novelId: string,
    currentStatus: NovelGraphPreciseAnalysisStatus,
  ): Promise<NovelGraphPreciseAnalysisStatus | null> {
    const runningSignature = this.runningSourceSignatures.get(novelId);
    if (!runningSignature) {
      return null;
    }

    const sourceBundle = await this.buildPreciseSourceBundle(novelId);
    const nextSignature = buildPreciseSourceSignature(sourceBundle);
    if (nextSignature === runningSignature) {
      return null;
    }

    const activeRequest = this.buildRequestFromStatus(currentStatus);
    const shouldRerun =
      !activeRequest.chapterId
      && activeRequest.chapterOrder == null
        ? sourceBundle.chapters.length > 0
        : Boolean(this.findSourceChapterForRequest(sourceBundle, activeRequest));

    const nextRequest = shouldRerun ? activeRequest : null;
    const interruptedStatus = await this.interruptRunningAnalysis(
      novelId,
      currentStatus,
      sourceBundle.chapters.length,
      nextRequest,
    );
    return interruptedStatus;
  }

  private async interruptRunningAnalysis(
    novelId: string,
    currentStatus: NovelGraphPreciseAnalysisStatus,
    analyzableChapterCount: number,
    nextRequest: NormalizedPreciseAnalysisRequest | null,
  ): Promise<NovelGraphPreciseAnalysisStatus> {
    const child = this.runningProcesses.get(novelId);
    if (!child) {
      return currentStatus;
    }

    const now = toIsoTimestamp();
    if (nextRequest) {
      this.pendingRequests.set(novelId, nextRequest);
    } else {
      this.pendingRequests.delete(novelId);
    }

    const nextStatus = this.buildStatusWithResolvedExportPath(
      {
        ...currentStatus,
        status: nextRequest
          ? "queued"
          : (currentStatus.graphAvailable ? "succeeded" : "idle"),
        trigger: nextRequest?.trigger ?? currentStatus.trigger,
        chapterId: nextRequest?.chapterId ?? null,
        chapterOrder: nextRequest?.chapterOrder ?? null,
        queuedAt: nextRequest ? now : currentStatus.queuedAt,
        startedAt: nextRequest ? null : currentStatus.startedAt,
        finishedAt: nextRequest ? null : now,
        updatedAt: now,
        error: null,
        analyzableChapterCount,
        currentChapterIndex: nextRequest ? 0 : null,
        currentChapterTitle: null,
      },
      await this.fileExists(this.resolvePreciseExportPath(novelId))
        ? this.resolvePreciseExportPath(novelId)
        : currentStatus.exportPath,
    );

    await this.writeStatus(novelId, nextStatus);
    this.interruptedRuns.set(
      novelId,
      nextRequest
        ? "Precise graph analysis has been re-queued to match the latest chapter status."
        : "The target chapter is now unplanned or has no content, so the current precise graph analysis has been stopped.",
    );
    child.kill();
    return nextStatus;
  }

  private scheduleRun(novelId: string, delayMs: number): void {
    this.clearScheduledRun(novelId);
    const timer = setTimeout(() => {
      this.scheduledRuns.delete(novelId);
      void this.runPendingAnalysis(novelId);
    }, Math.max(0, delayMs));
    timer.unref?.();
    this.scheduledRuns.set(novelId, timer);
  }

  private clearScheduledRun(novelId: string): void {
    const timer = this.scheduledRuns.get(novelId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.scheduledRuns.delete(novelId);
  }

  private async runPendingAnalysis(novelId: string): Promise<void> {
    if (this.runningNovelIds.has(novelId)) {
      return;
    }

    const request = this.pendingRequests.get(novelId);
    if (!request) {
      return;
    }

    this.pendingRequests.delete(novelId);
    this.clearScheduledRun(novelId);
    this.runningNovelIds.add(novelId);

    const currentStatus = await this.getStatus(novelId);
    const startedAt = toIsoTimestamp();
    await this.writeStatus(novelId, {
      ...currentStatus,
      enabled: true,
      providerConfigured: true,
      status: "running",
      trigger: request.trigger,
      chapterId: request.chapterId,
      chapterOrder: request.chapterOrder,
      startedAt,
      updatedAt: startedAt,
      error: null,
      analyzableChapterCount: currentStatus.analyzableChapterCount,
      currentChapterIndex: currentStatus.currentChapterIndex,
      currentChapterTitle: currentStatus.currentChapterTitle,
      workspacePath: this.resolveWorkspacePath(novelId),
      exportPath: await this.fileExists(this.resolvePreciseExportPath(novelId))
        ? this.resolvePreciseExportPath(novelId)
        : currentStatus.exportPath,
    });

    try {
      const result = await this.executeAnalysis(novelId, request);
      const finishedAt = toIsoTimestamp();
      await this.writeStatus(novelId, {
        ...(await this.getStatus(novelId)),
        enabled: true,
        providerConfigured: true,
        graphAvailable: true,
        status: "succeeded",
        trigger: request.trigger,
        chapterId: request.chapterId,
        chapterOrder: request.chapterOrder,
        finishedAt,
        updatedAt: finishedAt,
        lastSuccessfulAt: finishedAt,
        error: null,
        analyzableChapterCount: result.analyzableChapterCount,
        currentChapterIndex: result.analyzableChapterCount,
        currentChapterTitle: null,
        workspacePath: this.resolveWorkspacePath(novelId),
        exportPath: result.exportPath,
      });
    } catch (error) {
      if (error instanceof PreciseAnalysisInterruptedError) {
        return;
      }
      const finishedAt = toIsoTimestamp();
      const runtime = this.getRuntimeConfig();
      await this.writeStatus(novelId, {
        ...(await this.getStatus(novelId)),
        enabled: runtime.enabled,
        providerConfigured: hasProviderConfig(runtime.provider),
        status: "failed",
        trigger: request.trigger,
        chapterId: request.chapterId,
        chapterOrder: request.chapterOrder,
        finishedAt,
        updatedAt: finishedAt,
        error: errorToMessage(error),
        analyzableChapterCount: (await this.getStatus(novelId)).analyzableChapterCount,
        workspacePath: this.resolveWorkspacePath(novelId),
        exportPath: await this.fileExists(this.resolvePreciseExportPath(novelId))
          ? this.resolvePreciseExportPath(novelId)
          : null,
      });
      console.warn("[graph] precise analysis failed", {
        novelId,
        trigger: request.trigger,
        error: errorToMessage(error),
      });
    } finally {
      this.runningNovelIds.delete(novelId);
      this.runningProcesses.delete(novelId);
      this.runningSourceSignatures.delete(novelId);
      this.interruptedRuns.delete(novelId);
      if (this.pendingRequests.has(novelId)) {
        this.scheduleRun(novelId, 0);
      }
    }
  }

  private async executeAnalysis(
    novelId: string,
    request: NormalizedPreciseAnalysisRequest,
  ): Promise<{ exportPath: string; snapshotPath: string; analyzableChapterCount: number }> {
    const runtime = this.getRuntimeConfig();
    const workspacePath = this.resolveWorkspacePath(novelId);
    const sourceTxtPath = this.resolveSourceTxtPath(novelId);
    const novelRoot = this.resolveNovelRoot(novelId);
    await fs.mkdir(novelRoot, { recursive: true });

    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true },
    });
    if (!novel) {
      throw new AppError("Novel not found.", 404);
    }
    if (!novel) {
      throw new AppError("Novel not found.", 404);
    }

    const sourceBundle = await this.buildPreciseSourceBundle(novelId);
    this.runningSourceSignatures.set(novelId, buildPreciseSourceSignature(sourceBundle));
    if (sourceBundle.chapters.length === 0) {
      throw new AppError("There is no chapter content available for precise graph analysis yet.", 400);
    }
    await fs.writeFile(sourceTxtPath, buildPreciseSourceContent(sourceBundle), "utf-8");
    const bridgeScriptPath = await this.ensureBridgeScript();

    const payload: PythonBridgePayload = {
      engine_root: runtime.engineRoot,
      workspace_path: workspacePath,
      source_txt_path: sourceTxtPath,
      novel_id: novel.id,
      title: novel.title,
      provider: {
        provider: runtime.provider.provider,
        base_url: runtime.provider.baseUrl,
        api_key: runtime.provider.apiKey,
        model: runtime.provider.model,
        temperature: runtime.provider.temperature,
        max_tokens: runtime.provider.maxTokens,
      },
      chapters: sourceBundle.chapters.map((chapter) => ({
        id: chapter.preciseChapterId,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content,
      })),
      chapter_ids: this.resolvePreciseChapterIds(sourceBundle, request),
      force: request.force,
    };

    const pythonResult = await this.runPythonBridgeSafe(novelId, runtime, bridgeScriptPath, payload);
    const preciseExportPath = pythonResult.export_path;
    const preciseSnapshotPath = this.resolveSnapshotPath(novelId);
    const exportPayload = JSON.parse(await fs.readFile(preciseExportPath, "utf-8")) as unknown;
    const normalizedSnapshot = normalizePreciseGraphSnapshot(exportPayload, novel.id, novel.title);
    await fs.writeFile(preciseSnapshotPath, JSON.stringify(normalizedSnapshot, null, 2), "utf-8");

    return {
      exportPath: preciseExportPath,
      snapshotPath: preciseSnapshotPath,
      analyzableChapterCount: sourceBundle.chapters.length,
    };
  }

  private async runPythonBridge(
    runtime: GraphEngineRuntimeConfig,
    bridgeScriptPath: string,
    payload: PythonBridgePayload,
  ): Promise<PythonBridgeResult> {
    return new Promise<PythonBridgeResult>((resolve, reject) => {
      const child = spawn(runtime.pythonExecutable, [...runtime.pythonArgs, bridgeScriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: resolveWorkspaceRoot(),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
        },
      });

      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        reject(new AppError(`无法启动图谱分析 Python 进程：${error.message}`, 500));
      });
      child.on("close", (code) => {
        if (code !== 0) {
          const detail = stderr.trim() || stdout.trim() || `Python process exited with code ${code}.`;
          reject(new AppError(`图谱分析引擎执行失败：${detail}`, 500));
          return;
        }

        try {
          const parsed = JSON.parse(stdout) as PythonBridgeResult;
          if (!parsed?.export_path?.trim()) {
            reject(new AppError("Graph analysis engine did not return a valid export path.", 500));
            return;
          }
          resolve(parsed);
        } catch (error) {
          reject(new AppError(`Graph analysis result parsing failed: ${errorToMessage(error)}`, 500));
        }
      });

      child.stdin.end(Buffer.from(JSON.stringify(payload), "utf-8"));
    });
  }

  private async runPythonBridgeSafe(
    novelId: string,
    runtime: GraphEngineRuntimeConfig,
    bridgeScriptPath: string,
    payload: PythonBridgePayload,
  ): Promise<PythonBridgeResult> {
    return new Promise<PythonBridgeResult>((resolve, reject) => {
      const child = spawn(runtime.pythonExecutable, [...runtime.pythonArgs, bridgeScriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: resolveWorkspaceRoot(),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
        },
      });
      this.runningProcesses.set(novelId, child);

      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        if (this.runningProcesses.get(novelId) === child) {
          this.runningProcesses.delete(novelId);
        }
        reject(new AppError(`Unable to start precise graph Python process: ${error.message}`, 500));
      });
      child.on("close", (code) => {
        if (this.runningProcesses.get(novelId) === child) {
          this.runningProcesses.delete(novelId);
        }
        const interruptedReason = this.interruptedRuns.get(novelId);
        if (interruptedReason) {
          reject(new PreciseAnalysisInterruptedError(interruptedReason));
          return;
        }
        if (code !== 0) {
          const detail = stderr.trim() || stdout.trim() || `Python process exited with code ${code}.`;
          reject(new AppError(`图谱分析引擎执行失败：${detail}`, 500));
          return;
        }

        try {
          const parsed = JSON.parse(stdout) as PythonBridgeResult;
          if (!parsed?.export_path?.trim()) {
            reject(new AppError("Graph analysis engine did not return a valid export path.", 500));
            return;
          }
          resolve(parsed);
        } catch (error) {
          reject(new AppError(`Graph analysis result parsing failed: ${errorToMessage(error)}`, 500));
        }
      });

      child.stdin.end(Buffer.from(JSON.stringify(payload), "utf-8"));
    });
  }

  private getRuntimeConfig(): GraphEngineRuntimeConfig {
    const snapshot = getGraphEngineRuntimeSettingsSnapshot();
    const configuredProjectsRoot = snapshot?.projectsRoot || process.env.AI_NOVEL_GRAPH_ENGINE_PROJECT_ROOT?.trim();
    const configuredEngineRoot = snapshot?.engineRoot || process.env.AI_NOVEL_GRAPH_ENGINE_ROOT?.trim();
    const projectsRoot = configuredProjectsRoot
      ? path.resolve(configuredProjectsRoot)
      : path.join(resolveDataRoot(), GRAPH_ENGINE_PROJECTS_DIR);
    const engineRoot = configuredEngineRoot
      ? path.resolve(configuredEngineRoot)
      : path.resolve(resolveWorkspaceRoot(), "..", "graph-every-novel-main");
    const enabledByFlag = snapshot?.enabled ?? parseBoolean(process.env.AI_NOVEL_GRAPH_ENGINE_ENABLED, true);
    const engineDetected = existsSync(path.join(engineRoot, "src", "novel_graph_engine"));
    const enabled = enabledByFlag && engineDetected;

    return {
      enabled,
      enabledByFlag,
      autoAnalyze: snapshot?.autoAnalyze ?? parseBoolean(process.env.AI_NOVEL_GRAPH_ENGINE_AUTO_ANALYZE, true),
      engineDetected,
      projectsRoot,
      engineRoot,
      pythonExecutable: snapshot?.pythonExecutable || process.env.AI_NOVEL_GRAPH_PYTHON_EXECUTABLE?.trim() || "python",
      pythonArgs: splitCommandArgs(snapshot?.pythonArgs || process.env.AI_NOVEL_GRAPH_PYTHON_ARGS),
      provider: {
        provider: snapshot?.provider || process.env.AI_NOVEL_GRAPH_ENGINE_PROVIDER?.trim() || "openai-compatible",
        baseUrl: snapshot?.baseUrl
          || process.env.AI_NOVEL_GRAPH_ENGINE_BASE_URL?.trim()
          || process.env.OPENAI_BASE_URL?.trim()
          || "",
        apiKey: snapshot?.apiKey
          || process.env.AI_NOVEL_GRAPH_ENGINE_API_KEY?.trim()
          || process.env.OPENAI_API_KEY?.trim()
          || "",
        model: snapshot?.model
          || process.env.AI_NOVEL_GRAPH_ENGINE_MODEL?.trim()
          || process.env.OPENAI_MODEL?.trim()
          || "",
        temperature: snapshot?.temperature ?? parseNumber(process.env.AI_NOVEL_GRAPH_ENGINE_TEMPERATURE, 0),
        maxTokens: snapshot?.maxTokens ?? parseNumber(process.env.AI_NOVEL_GRAPH_ENGINE_MAX_TOKENS, 15_000),
      },
    };
  }

  private resolveNovelRoot(novelId: string): string {
    return path.join(this.getRuntimeConfig().projectsRoot, novelId);
  }

  private resolveWorkspacePath(novelId: string): string {
    return path.join(this.resolveNovelRoot(novelId), "workspace");
  }

  private resolveStatusPath(novelId: string): string {
    return path.join(this.resolveNovelRoot(novelId), GRAPH_ENGINE_STATUS_FILE);
  }

  private resolveSourceTxtPath(novelId: string): string {
    return path.join(this.resolveNovelRoot(novelId), GRAPH_ENGINE_SOURCE_TXT);
  }

  private resolveSnapshotPath(novelId: string): string {
    return path.join(this.resolveNovelRoot(novelId), GRAPH_ENGINE_SNAPSHOT_FILE);
  }

  private resolvePreciseExportPath(novelId: string): string {
    return path.join(this.resolveWorkspacePath(novelId), "export", "character_graph.json");
  }

  private resolveRunsLogPath(novelId: string): string {
    return path.join(this.resolveWorkspacePath(novelId), "logs", GRAPH_ENGINE_RUNS_LOG_FILE);
  }

  private resolveBridgeScriptPath(): string {
    return path.join(this.getRuntimeConfig().projectsRoot, GRAPH_ENGINE_RUNTIME_DIR, GRAPH_ENGINE_BRIDGE_SCRIPT);
  }

  private async ensureBridgeScript(): Promise<string> {
    const bridgeScriptPath = this.resolveBridgeScriptPath();
    await fs.mkdir(path.dirname(bridgeScriptPath), { recursive: true });
    await fs.writeFile(bridgeScriptPath, GRAPH_ENGINE_BRIDGE_SCRIPT_CONTENT, "utf-8");
    return bridgeScriptPath;
  }

  private async readRunProgress(novelId: string): Promise<PreciseRunProgress | null> {
    const runsLogPath = this.resolveRunsLogPath(novelId);
    if (!await this.fileExists(runsLogPath)) {
      return null;
    }

    try {
      const raw = await fs.readFile(runsLogPath, "utf-8");
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
          const entry = JSON.parse(lines[index]) as Record<string, unknown>;
          if (entry.event !== "chapter_analysis_start") {
            continue;
          }

          const currentChapterIndex = typeof entry.chapter_index === "number"
            ? entry.chapter_index
            : Number(entry.chapter_index);
          const analyzableChapterCount = typeof entry.chapter_total === "number"
            ? entry.chapter_total
            : Number(entry.chapter_total);

          return {
            currentChapterIndex: Number.isFinite(currentChapterIndex) ? currentChapterIndex : null,
            currentChapterTitle: typeof entry.chapter_title === "string" ? entry.chapter_title : null,
            analyzableChapterCount: Number.isFinite(analyzableChapterCount) ? analyzableChapterCount : null,
          };
        } catch {
          continue;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private async readStatusFile(statusPath: string): Promise<NovelGraphPreciseAnalysisStatus | null> {
    if (!await this.fileExists(statusPath)) {
      return null;
    }
    try {
      const raw = await fs.readFile(statusPath, "utf-8");
      return JSON.parse(raw) as NovelGraphPreciseAnalysisStatus;
    } catch {
      return null;
    }
  }

  private async writeStatus(novelId: string, status: NovelGraphPreciseAnalysisStatus): Promise<void> {
    const statusPath = this.resolveStatusPath(novelId);
    await fs.mkdir(path.dirname(statusPath), { recursive: true });
    await fs.writeFile(statusPath, JSON.stringify(status, null, 2), "utf-8");
  }

  private async probePythonRuntime(runtime: GraphEngineRuntimeConfig): Promise<PythonRuntimeProbe> {
    return new Promise<PythonRuntimeProbe>((resolve) => {
      const child = spawn(runtime.pythonExecutable, [...runtime.pythonArgs, "--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: resolveWorkspaceRoot(),
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finalize = (result: PythonRuntimeProbe) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill();
        finalize({
          available: false,
          version: null,
          error: "Local Python readiness probe timed out.",
        });
      }, 5_000);

      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        finalize({
          available: false,
          version: null,
          error: `Unable to start Python: ${error.message}`,
        });
      });
      child.on("close", (code) => {
        if (code !== 0) {
          finalize({
            available: false,
            version: null,
            error: stderr.trim() || stdout.trim() || `Python process exited with code ${code}.`,
          });
          return;
        }
        finalize({
          available: true,
          version: stdout.trim() || stderr.trim() || null,
          error: null,
        });
      });
    });
  }

  private async probePythonRuntimeSafe(runtime: GraphEngineRuntimeConfig): Promise<PythonRuntimeProbe> {
    return new Promise<PythonRuntimeProbe>((resolve) => {
      const child = spawn(runtime.pythonExecutable, [...runtime.pythonArgs, "--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: resolveWorkspaceRoot(),
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finalize = (result: PythonRuntimeProbe) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill();
        finalize({
          available: false,
          version: null,
          error: "Local Python readiness probe timed out.",
        });
      }, 5_000);

      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        finalize({
          available: false,
          version: null,
          error: `Unable to start Python: ${error.message}`,
        });
      });
      child.on("close", (code) => {
        if (code !== 0) {
          finalize({
            available: false,
            version: null,
            error: stderr.trim() || stdout.trim() || `Python process exited with code ${code}.`,
          });
          return;
        }
        finalize({
          available: true,
          version: stdout.trim() || stderr.trim() || null,
          error: null,
        });
      });
    });
  }

  private async probeEngineImport(
    runtime: GraphEngineRuntimeConfig,
    pythonProbe: PythonRuntimeProbe,
  ): Promise<PythonImportProbe> {
    if (!runtime.engineDetected || !pythonProbe.available) {
      return {
        available: false,
        error: null,
      };
    }

    const probeScript = [
      "import sys",
      "from pathlib import Path",
      `engine_root = Path(${JSON.stringify(runtime.engineRoot)})`,
      'src_dir = engine_root / "src"',
      "if str(src_dir) not in sys.path:",
      "    sys.path.insert(0, str(src_dir))",
      "import novel_graph_engine.project.workspace",
      'print("ok")',
    ].join("\n");

    return new Promise<PythonImportProbe>((resolve) => {
      const child = spawn(runtime.pythonExecutable, [...runtime.pythonArgs, "-c", probeScript], {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: resolveWorkspaceRoot(),
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finalize = (result: PythonImportProbe) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill();
        finalize({
          available: false,
          error: "graph-every-novel dependency import probe timed out.",
        });
      }, 8_000);

      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        finalize({
          available: false,
          error: `Unable to probe graph-every-novel imports: ${error.message}`,
        });
      });
      child.on("close", (code) => {
        if (code !== 0) {
          const detail = stderr.trim() || stdout.trim() || `Python process exited with code ${code}.`;
          finalize({
            available: false,
            error: `graph-every-novel dependencies could not be imported: ${detail}. Please run "pip install -e ." in the engine root first.`,
          });
          return;
        }

        finalize({
          available: true,
          error: null,
        });
      });
    });
  }

  private async fileExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}

export const novelGraphPreciseAnalysisService = new NovelGraphPreciseAnalysisService();




