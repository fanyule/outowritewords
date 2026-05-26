import type {
  NovelGraphPreciseAnalysisStatus,
  NovelGraphPreciseRuntimeIssue,
  NovelGraphPreciseRuntimeReadiness,
} from "@ai-novel/shared/types/novelGraph";

const LIKELY_MOJIBAKE_FRAGMENTS = [
  "锛",
  "銆",
  "鏈",
  "鍥捐氨",
  "寮曟搸",
  "璇锋",
  "鐜",
  "妯″",
  "鍒嗘瀽",
];

function containsLikelyMojibake(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return LIKELY_MOJIBAKE_FRAGMENTS.some((fragment) => value.includes(fragment));
}

function normalizeIssueMessage(
  readiness: NovelGraphPreciseRuntimeReadiness,
  issue: NovelGraphPreciseRuntimeIssue,
): string {
  switch (issue.code) {
    case "engine-disabled":
      return "精确图谱引擎已关闭，请前往图谱设置重新启用。";
    case "engine-missing":
      return `未检测到 graph-every-novel 引擎目录：${readiness.engineRoot}`;
    case "python-unavailable":
      return containsLikelyMojibake(issue.message)
        ? "本地 Python 运行时不可用，请检查 Python 路径和环境。"
        : issue.message;
    case "python-version-unsupported":
      return `graph-every-novel 需要 Python ${readiness.requiredPythonVersion}+。`;
    case "engine-import-failed":
      return containsLikelyMojibake(issue.message)
        ? "graph-every-novel 依赖无法导入，请先在引擎目录执行 pip install -e .。"
        : issue.message;
    case "provider-base-url-missing":
      return "尚未配置图谱模型 API 地址，请前往图谱设置填写 Base URL。";
    case "provider-api-key-missing":
      return "尚未配置图谱模型 API Key，请前往图谱设置保存密钥。";
    case "provider-model-missing":
      return "尚未配置图谱模型名称，请前往图谱设置填写模型名。";
    case "auto-analyze-disabled":
      return "已关闭自动精确分析，章节落稿后不会自动刷新精确图谱。";
    default:
      return containsLikelyMojibake(issue.message) ? "图谱运行条件尚未满足，请检查本地引擎和模型配置。" : issue.message;
  }
}

export function normalizeNovelGraphPreciseRuntimeReadiness(
  readiness: NovelGraphPreciseRuntimeReadiness,
): NovelGraphPreciseRuntimeReadiness {
  return {
    ...readiness,
    issues: readiness.issues.map((issue) => ({
      ...issue,
      message: normalizeIssueMessage(readiness, issue),
    })),
  };
}

export function normalizeNovelGraphPreciseAnalysisStatus(
  status: NovelGraphPreciseAnalysisStatus,
): NovelGraphPreciseAnalysisStatus {
  if (!status.error) {
    return status;
  }

  let normalizedError = status.error;
  if (containsLikelyMojibake(normalizedError)) {
    normalizedError = "精确图谱分析失败，请检查 Python、引擎目录和图谱模型配置后重试。";
  }

  if (/pip install -e \./i.test(status.error)) {
    normalizedError = "graph-every-novel 依赖无法导入，请先在引擎目录执行 pip install -e .。";
  }

  return {
    ...status,
    error: normalizedError,
  };
}
