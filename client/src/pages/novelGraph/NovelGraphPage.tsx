import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  GitBranch,
  Loader2,
  Orbit,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import type {
  NovelGraphDirectedEdge,
  NovelGraphNode,
  NovelGraphPairEdge,
  NovelGraphPreciseAnalysisStatus,
  NovelGraphPreciseRuntimeIssue,
  NovelGraphPreciseRuntimeReadiness,
  NovelGraphSnapshot,
  NovelGraphTier,
} from "@ai-novel/shared/types/novelGraph";
import { useNavigate, useParams } from "react-router-dom";
import {
  getNovelInstantGraph,
  getNovelPreciseGraph,
  getNovelPreciseGraphReadiness,
  getNovelPreciseGraphStatus,
  requestNovelPreciseGraphAnalysis,
} from "@/api/novel/graph";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ForceGraph3DCanvas from "./ForceGraph3DCanvas";
import { toGraphCanvasData } from "./forceGraphAdapter";
import {
  ALL_NOVEL_GRAPH_TIERS,
  NOVEL_GRAPH_TIER_COLORS,
  defaultNovelGraphFilters,
  type NovelGraphFilters,
  type NovelGraphSelection,
  type NovelGraphSource,
} from "./novelGraph.types";

const TIER_LABELS: Record<NovelGraphTier, string> = {
  core: "核心角色",
  active: "活跃角色",
  background: "背景角色",
  transient: "临时角色",
};

const PRECISE_STATUS_LABELS: Record<NovelGraphPreciseAnalysisStatus["status"], string> = {
  disabled: "未启用",
  idle: "待运行",
  queued: "排队中",
  running: "分析中",
  succeeded: "已就绪",
  failed: "失败",
};

const PRECISE_STATUS_STYLES: Record<NovelGraphPreciseAnalysisStatus["status"], string> = {
  disabled: "border-border/70 bg-card/75 text-muted-foreground",
  idle: "border-border/70 bg-card/75 text-foreground",
  queued: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  running: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  succeeded: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  failed: "border-red-400/25 bg-red-400/10 text-red-200",
};

const PAIR_EDGE_COLOR = "text-sky-300";
const DIRECTED_EDGE_COLOR = "text-orange-300";

type SelectedEntity = {
  node: NovelGraphNode | null;
  pairEdge: NovelGraphPairEdge | null;
  directedEdge: NovelGraphDirectedEdge | null;
};

function normalizePercentish(value: number | undefined, fallback = 0.5): number {
  const next = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return next <= 1.5 ? Math.max(0, Math.min(1, next)) : Math.max(0, Math.min(1, next / 100));
}

function formatPercent(value: number | undefined, fallback = 0.5): string {
  return `${Math.round(normalizePercentish(value, fallback) * 100)}%`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTrigger(value: NovelGraphPreciseAnalysisStatus["trigger"]): string {
  switch (value) {
    case "chapter_drafted":
      return "章节落稿";
    case "pipeline_completed":
      return "流水线完成";
    case "manual":
      return "手动触发";
    default:
      return "暂无";
  }
}

function formatPreciseProgress(status: NovelGraphPreciseAnalysisStatus | null): string | null {
  if (!status?.analyzableChapterCount || status.analyzableChapterCount < 1) {
    return null;
  }

  const total = status.analyzableChapterCount;
  const current = status.status === "queued"
    ? 0
    : status.status === "succeeded"
      ? total
      : status.currentChapterIndex;

  if (current == null) {
    return `共 ${total} 章（仅统计有内容章节）`;
  }

  const normalized = Math.max(0, Math.min(current, total));
  const base = `第 ${normalized} / ${total} 章（仅统计有内容章节）`;
  if (status.status === "running" && status.currentChapterTitle) {
    return `${base} · ${status.currentChapterTitle}`;
  }
  return base;
}

function buildNodeLookup(snapshot: NovelGraphSnapshot | null) {
  return new Map(snapshot?.nodes.map((node) => [node.id, node]) ?? []);
}

function buildSelection(snapshot: NovelGraphSnapshot | null, selection: NovelGraphSelection): SelectedEntity {
  if (!snapshot || !selection) {
    return {
      node: null,
      pairEdge: null,
      directedEdge: null,
    };
  }

  if (selection.kind === "node") {
    return {
      node: snapshot.nodes.find((node) => node.id === selection.id) ?? null,
      pairEdge: null,
      directedEdge: null,
    };
  }

  if (selection.kind === "pair-edge") {
    return {
      node: null,
      pairEdge: snapshot.pair_edges.find((edge) => edge.id === selection.id) ?? null,
      directedEdge: null,
    };
  }

  return {
    node: null,
    pairEdge: null,
    directedEdge: snapshot.directed_edges.find((edge) => edge.id === selection.id) ?? null,
  };
}

function buildDegreeMap(snapshot: NovelGraphSnapshot | null) {
  const degreeMap = new Map<string, number>();
  if (!snapshot) {
    return degreeMap;
  }

  for (const node of snapshot.nodes) {
    degreeMap.set(node.id, 0);
  }

  for (const edge of snapshot.pair_edges) {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
  }

  for (const edge of snapshot.directed_edges) {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
  }

  return degreeMap;
}

function issueToneClass(severity: NovelGraphPreciseRuntimeIssue["severity"]): string {
  switch (severity) {
    case "error":
      return "border-red-400/25 bg-red-400/10 text-red-100";
    case "warning":
      return "border-amber-400/25 bg-amber-400/10 text-amber-100";
    case "info":
    default:
      return "border-sky-400/25 bg-sky-400/10 text-sky-100";
  }
}

function buildPreciseNotice(
  readiness: NovelGraphPreciseRuntimeReadiness | null,
  status: NovelGraphPreciseAnalysisStatus | null,
  preciseSnapshotAvailable: boolean,
) {
  if (!status) {
    return {
      title: "正在读取精确图谱状态",
      description: "系统正在同步本地图谱状态和最近一次分析结果。",
      tone: "default" as const,
    };
  }

  const progress = formatPreciseProgress(status);

  if (readiness && !readiness.ready) {
    return {
      title: "精确图谱运行条件未满足",
      description: readiness.issues[0]?.message || "请先完成本地图谱引擎和模型配置。",
      tone: "danger" as const,
    };
  }

  switch (status.status) {
    case "disabled":
      return {
        title: "精确图谱未启用",
        description: "请先在图谱设置中启用本地图谱引擎。",
        tone: "danger" as const,
      };
    case "queued":
      return {
        title: "精确图谱已进入队列",
        description: `${progress ? `${progress} · ` : ""}触发方式：${formatTrigger(status.trigger)}。`,
        tone: "default" as const,
      };
    case "running":
      return {
        title: "精确图谱正在分析",
        description: `${progress ? `${progress} · ` : ""}系统正在导出正文并调用本地 Python 图谱引擎。`,
        tone: "default" as const,
      };
    case "failed":
      return {
        title: "上一次精确分析失败",
        description: status.error || "请检查本地图谱引擎、Python 运行时和模型配置后重试。",
        tone: "danger" as const,
      };
    case "succeeded":
      return preciseSnapshotAvailable
        ? {
            title: "精确图谱已就绪",
            description: `${progress ? `${progress} · ` : ""}最近成功时间：${formatTime(status.lastSuccessfulAt)}。`,
            tone: "success" as const,
          }
        : {
            title: "精确图谱暂无可视化结果",
            description: "分析已完成，但当前没有可展示的图谱数据。",
            tone: "default" as const,
          };
    case "idle":
    default:
      return {
        title: "还没有精确图谱结果",
        description: "点击“运行精确分析”后，系统会基于正文生成更完整的人物关系图。",
        tone: "default" as const,
      };
  }
}

function FilterChip(props: {
  active: boolean;
  label: string;
  color?: string;
  onClick: () => void;
}) {
  const { active, label, color, onClick } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary/55 bg-primary/12 text-foreground"
          : "border-border/70 bg-card/65 text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
      style={active && color ? { borderColor: color, boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
    >
      {label}
    </button>
  );
}

function SourceToggle(props: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  const { active, label, onClick } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm transition-colors",
        active
          ? "border-primary/55 bg-primary/12 text-foreground"
          : "border-border/70 bg-card/65 text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function StatCard(props: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  const { icon: Icon, label, value } = props;

  return (
    <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function StatusNotice(props: {
  title: string;
  description: string;
  tone?: "default" | "success" | "danger";
}) {
  const { title, description, tone = "default" } = props;

  const className = tone === "success"
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
    : tone === "danger"
      ? "border-red-400/20 bg-red-400/10 text-red-100"
      : "border-border/70 bg-card/72 text-foreground";

  return (
    <div className={cn("rounded-2xl border px-4 py-3", className)}>
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm leading-6 opacity-90">{description}</div>
    </div>
  );
}

function ReadinessChip(props: {
  label: string;
  value: string;
  ready: boolean;
}) {
  const { label, value, ready } = props;

  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3",
        ready
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
          : "border-red-400/20 bg-red-400/10 text-red-100",
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.2em] opacity-75">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function PathCard(props: {
  label: string;
  value: string;
}) {
  const { label, value } = props;

  return (
    <div className="app-shell-panel-soft rounded-2xl p-3 shadow-none">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-2 break-all font-mono text-xs leading-6 text-muted-foreground">{value}</div>
    </div>
  );
}

function ReadinessPanel(props: {
  readiness: NovelGraphPreciseRuntimeReadiness | null;
  isLoading: boolean;
  errorMessage: string | null;
}) {
  const { readiness, isLoading, errorMessage } = props;

  if (isLoading) {
    return (
      <div className="app-shell-panel-soft rounded-2xl px-4 py-3 text-sm text-muted-foreground shadow-none">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
          正在检查本地图谱引擎运行条件…
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return <StatusNotice title="精确图谱诊断读取失败" description={errorMessage} tone="danger" />;
  }

  if (!readiness) {
    return null;
  }

  const pythonLabel = !readiness.pythonAvailable
    ? "不可用"
    : readiness.pythonVersionSupported
      ? "可用"
      : "版本过低";
  const engineImportLabel = readiness.engineImportAvailable
    ? "可导入"
    : readiness.engineImportError
      ? "导入失败"
      : "待检查";

  return (
    <div className="app-shell-panel-soft space-y-4 rounded-2xl p-4 shadow-none">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ShieldAlert className="h-4 w-4 text-sky-300" />
        精确图谱运行诊断
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ReadinessChip label="引擎目录" value={readiness.engineDetected ? "已检测" : "未检测"} ready={readiness.engineDetected} />
        <ReadinessChip
          label="Python 运行时"
          value={pythonLabel}
          ready={readiness.pythonAvailable && readiness.pythonVersionSupported}
        />
        <ReadinessChip label="引擎依赖" value={engineImportLabel} ready={readiness.engineImportAvailable} />
        <ReadinessChip label="模型配置" value={readiness.providerConfigured ? "已完成" : "缺失"} ready={readiness.providerConfigured} />
        <ReadinessChip label="自动刷新" value={readiness.autoAnalyze ? "已开启" : "已关闭"} ready={readiness.autoAnalyze} />
      </div>

      {readiness.issues.length > 0 ? (
        <div className="space-y-2">
          {readiness.issues.map((issue) => (
            <div key={issue.code} className={cn("rounded-2xl border px-3 py-2 text-sm", issueToneClass(issue.severity))}>
              {issue.message}
            </div>
          ))}
        </div>
      ) : (
        <StatusNotice
          title="精确图谱运行条件已满足"
          description="本地 Python、图谱引擎依赖和模型配置都已准备好，可以直接运行精确分析。"
          tone="success"
        />
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        <PathCard label="引擎目录" value={readiness.engineRoot} />
        <PathCard label="图谱工作区根目录" value={readiness.projectsRoot} />
        <PathCard label="小说工作区" value={readiness.workspacePath} />
        <PathCard label="Python 运行命令" value={[readiness.pythonExecutable, ...readiness.pythonArgs].join(" ").trim()} />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <PathCard label="导出正文路径" value={readiness.sourceTxtPath} />
        <PathCard label="精确图谱导出路径" value={readiness.exportPath} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Provider: {readiness.provider}</span>
        <span>Model: {readiness.model || "未配置"}</span>
        <span>Python: {readiness.pythonVersion || "未检测到版本信息"}</span>
        <span>要求版本：Python {readiness.requiredPythonVersion}+</span>
      </div>
    </div>
  );
}

function PairEdgeDetail(props: {
  edge: NovelGraphPairEdge;
  nodeLookup: Map<string, NovelGraphNode>;
}) {
  const { edge, nodeLookup } = props;

  return (
    <div className="space-y-4">
      <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
        <div className="mb-2 text-sm font-medium text-foreground">关系双方</div>
        <div className="text-sm text-foreground">
          {nodeLookup.get(edge.source)?.name ?? edge.source}
          <span className="mx-2 text-muted-foreground">↔</span>
          {nodeLookup.get(edge.target)?.name ?? edge.target}
        </div>
      </div>

      <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">关系类型</dt>
            <dd className="mt-1 text-foreground">{edge.type}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">置信度</dt>
            <dd className="mt-1 text-foreground">{formatPercent(edge.confidence, 0.58)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">共现次数</dt>
            <dd className="mt-1 text-foreground">{edge.co_appearance_count ?? edge.co_event_count ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">强度估计</dt>
            <dd className="mt-1 text-foreground">{formatPercent(edge.shared_intensity_score, 0.5)}</dd>
          </div>
        </dl>
      </div>

      <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
        <div className="mb-2 text-sm font-medium text-foreground">关系摘要</div>
        <p className="text-sm leading-7 text-muted-foreground">{edge.summary || "暂无关系摘要。"}</p>
      </div>
    </div>
  );
}

function DirectedEdgeDetail(props: {
  edge: NovelGraphDirectedEdge;
  nodeLookup: Map<string, NovelGraphNode>;
}) {
  const { edge, nodeLookup } = props;

  return (
    <div className="space-y-4">
      <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
        <div className="mb-2 text-sm font-medium text-foreground">关系方向</div>
        <div className="text-sm text-foreground">
          {nodeLookup.get(edge.source)?.name ?? edge.source}
          <span className="mx-2 text-muted-foreground">→</span>
          {nodeLookup.get(edge.target)?.name ?? edge.target}
        </div>
      </div>

      <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">结构基底</dt>
            <dd className="mt-1 text-foreground">{edge.structural_label}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">关系态势</dt>
            <dd className="mt-1 text-foreground">{edge.stance_label}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">强度</dt>
            <dd className="mt-1 text-foreground">{formatPercent(edge.strength, 0.55)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">提及次数</dt>
            <dd className="mt-1 text-foreground">{edge.mention_count ?? 0}</dd>
          </div>
        </dl>
      </div>

      <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
        <div className="mb-2 text-sm font-medium text-foreground">关系摘要</div>
        <p className="text-sm leading-7 text-muted-foreground">{edge.summary || "暂无关系摘要。"}</p>
      </div>
    </div>
  );
}

function NodeDetail(props: {
  node: NovelGraphNode;
}) {
  const { node } = props;

  return (
    <div className="space-y-4">
      <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: NOVEL_GRAPH_TIER_COLORS[node.tier] }}
          />
          {TIER_LABELS[node.tier]}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">出现次数</dt>
            <dd className="mt-1 text-foreground">{node.appearance_count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">重要度</dt>
            <dd className="mt-1 text-foreground">{Math.round(node.importance * 100) / 100}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">首次章节</dt>
            <dd className="mt-1 break-all text-foreground">{node.first_seen_chapter_id ?? "未标注"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">最近章节</dt>
            <dd className="mt-1 break-all text-foreground">{node.last_seen_chapter_id ?? "未标注"}</dd>
          </div>
        </dl>
      </div>

      {node.aliases.length > 0 ? (
        <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
          <div className="mb-2 text-sm font-medium text-foreground">别名</div>
          <div className="flex flex-wrap gap-2">
            {node.aliases.map((alias) => (
              <span key={alias} className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                {alias}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="app-shell-panel-soft rounded-2xl p-4 shadow-none">
        <div className="mb-2 text-sm font-medium text-foreground">角色摘要</div>
        <p className="text-sm leading-7 text-muted-foreground">{node.summary || "暂无角色摘要。"}</p>
      </div>
    </div>
  );
}

export default function NovelGraphPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [graphSource, setGraphSource] = useState<NovelGraphSource>("instant");
  const [graphSourceManuallySelected, setGraphSourceManuallySelected] = useState(false);
  const [filters, setFilters] = useState<NovelGraphFilters>(() => defaultNovelGraphFilters());
  const [selection, setSelection] = useState<NovelGraphSelection>(null);
  const [focusRequest, setFocusRequest] = useState<{ nodeId: string; nonce: number } | null>(null);

  const instantGraphQuery = useQuery({
    queryKey: queryKeys.novels.instantGraph(id),
    queryFn: () => getNovelInstantGraph(id),
    enabled: Boolean(id),
    staleTime: 20_000,
  });

  const preciseReadinessQuery = useQuery({
    queryKey: queryKeys.novels.preciseGraphReadiness(id),
    queryFn: () => getNovelPreciseGraphReadiness(id),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
  });

  const preciseStatusQuery = useQuery({
    queryKey: queryKeys.novels.preciseGraphStatus(id),
    queryFn: () => getNovelPreciseGraphStatus(id),
    enabled: Boolean(id),
    staleTime: 2_000,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" ? 3_000 : false;
    },
  });

  const preciseGraphQuery = useQuery({
    queryKey: queryKeys.novels.preciseGraph(id),
    queryFn: () => getNovelPreciseGraph(id),
    enabled: Boolean(id) && graphSource === "precise" && Boolean(preciseStatusQuery.data?.data?.graphAvailable),
    staleTime: 15_000,
    retry: false,
    refetchInterval:
      preciseStatusQuery.data?.data?.status === "queued" || preciseStatusQuery.data?.data?.status === "running"
        ? 3_000
        : false,
  });

  const preciseAnalysisMutation = useMutation({
    mutationFn: () => requestNovelPreciseGraphAnalysis(id, { trigger: "manual", force: true }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.preciseGraphStatus(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.preciseGraph(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.preciseGraphReadiness(id) }),
      ]);
    },
  });

  const instantSnapshot = instantGraphQuery.data?.data ?? null;
  const preciseReadiness = preciseReadinessQuery.data?.data ?? null;
  const preciseStatus = preciseStatusQuery.data?.data ?? null;
  const preciseSnapshot = preciseGraphQuery.data?.data ?? null;

  useEffect(() => {
    setGraphSource("instant");
    setGraphSourceManuallySelected(false);
    setSelection(null);
    setFocusRequest(null);
  }, [id]);

  useEffect(() => {
    if (!graphSourceManuallySelected && preciseStatus?.graphAvailable) {
      setGraphSource("precise");
    }
  }, [graphSourceManuallySelected, preciseStatus?.graphAvailable]);

  const activeSnapshot = graphSource === "precise" ? preciseSnapshot : instantSnapshot;

  useEffect(() => {
    if (!selection || !activeSnapshot) {
      return;
    }

    const selectedEntity = buildSelection(activeSnapshot, selection);
    const stillExists = Boolean(selectedEntity.node || selectedEntity.pairEdge || selectedEntity.directedEdge);
    if (!stillExists) {
      setSelection(null);
    }
  }, [activeSnapshot, selection]);

  const nodeLookup = useMemo(() => buildNodeLookup(activeSnapshot), [activeSnapshot]);
  const graphData = useMemo(
    () => (activeSnapshot ? toGraphCanvasData(activeSnapshot, filters, graphSource) : null),
    [activeSnapshot, filters, graphSource],
  );
  const selected = useMemo(() => buildSelection(activeSnapshot, selection), [activeSnapshot, selection]);
  const degreeMap = useMemo(() => buildDegreeMap(activeSnapshot), [activeSnapshot]);

  const visibleNodes = graphData?.nodes ?? [];
  const visibleLinks = graphData?.links ?? [];
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleNodeCount = visibleNodes.length;
  const visibleEdgeCount = visibleLinks.length;

  const sortedNodes = useMemo(() => {
    if (!activeSnapshot) {
      return [];
    }
    return activeSnapshot.nodes
      .filter((node) => visibleNodeIds.has(node.id))
      .sort((left, right) => {
        const degreeDiff = (degreeMap.get(right.id) ?? 0) - (degreeMap.get(left.id) ?? 0);
        if (degreeDiff !== 0) {
          return degreeDiff;
        }
        const importanceDiff = right.importance - left.importance;
        if (importanceDiff !== 0) {
          return importanceDiff;
        }
        return left.name.localeCompare(right.name, "zh-CN");
      });
  }, [activeSnapshot, degreeMap, visibleNodeIds]);

  const pairTypes = useMemo(
    () => [...new Set(activeSnapshot?.pair_edges.map((edge) => edge.type).filter(Boolean) ?? [])].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [activeSnapshot],
  );
  const directedStances = useMemo(
    () => [...new Set(activeSnapshot?.directed_edges.map((edge) => edge.stance).filter(Boolean) ?? [])].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [activeSnapshot],
  );
  const directedStructuralBases = useMemo(
    () => [...new Set(activeSnapshot?.directed_edges.map((edge) => edge.structural_base).filter(Boolean) ?? [])].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [activeSnapshot],
  );

  const selectedNodeName = selected.pairEdge
    ? `${nodeLookup.get(selected.pairEdge.source)?.name ?? selected.pairEdge.source} / ${nodeLookup.get(selected.pairEdge.target)?.name ?? selected.pairEdge.target}`
    : selected.directedEdge
      ? `${nodeLookup.get(selected.directedEdge.source)?.name ?? selected.directedEdge.source} → ${nodeLookup.get(selected.directedEdge.target)?.name ?? selected.directedEdge.target}`
      : null;

  const preciseNotice = useMemo(
    () => buildPreciseNotice(preciseReadiness, preciseStatus, Boolean(preciseSnapshot)),
    [preciseReadiness, preciseStatus, preciseSnapshot],
  );

  const preciseProgressText = formatPreciseProgress(preciseStatus);
  const showReadinessPanel = graphSource === "precise" && (
    preciseReadinessQuery.isLoading ||
    preciseReadinessQuery.isError ||
    !preciseStatus?.graphAvailable ||
    preciseStatus?.status === "queued" ||
    preciseStatus?.status === "running" ||
    preciseStatus?.status === "failed" ||
    (preciseReadiness?.issues.length ?? 0) > 0
  );

  const canRunPreciseAnalysis = Boolean(id) && Boolean(preciseReadiness?.ready) && !preciseAnalysisMutation.isPending;
  const displayProject = preciseSnapshot?.project ?? instantSnapshot?.project ?? null;

  const handleRefresh = () => {
    void instantGraphQuery.refetch();
    void preciseReadinessQuery.refetch();
    void preciseStatusQuery.refetch();
    if (graphSource === "precise" && preciseStatus?.graphAvailable) {
      void preciseGraphQuery.refetch();
    }
  };

  const handleNodeSelect = (nodeId: string) => {
    setSelection({ kind: "node", id: nodeId });
    setFocusRequest({ nodeId, nonce: Date.now() });
  };

  const toggleTier = (tier: NovelGraphTier) => {
    setFilters((current) => ({
      ...current,
      tiers: current.tiers.includes(tier) ? current.tiers.filter((item) => item !== tier) : [...current.tiers, tier],
    }));
  };

  const toggleValue = (
    key: "pairTypes" | "directedStances" | "directedStructuralBases",
    value: string,
  ) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  };

  const handleSourceChange = (source: NovelGraphSource) => {
    setGraphSource(source);
    setGraphSourceManuallySelected(true);
    setSelection(null);
  };

  if (instantGraphQuery.isLoading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center text-foreground">
        <div className="app-shell-panel flex items-center gap-3 px-6 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-sky-300" />
          <div>
            <div className="font-medium">正在加载小说图谱</div>
            <div className="text-sm text-muted-foreground">读取本地快照并准备 3D 人物关系视图</div>
          </div>
        </div>
      </div>
    );
  }

  if (instantGraphQuery.isError || !instantSnapshot) {
    const message = instantGraphQuery.error instanceof Error ? instantGraphQuery.error.message : "图谱加载失败。";
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-6 text-foreground">
        <div className="app-modal-surface max-w-xl rounded-3xl border border-red-500/20 p-8 shadow-[0_24px_80px_-32px_rgba(127,29,29,0.45)]">
          <div className="mb-4 flex items-center gap-3 text-red-300">
            <AlertCircle className="h-6 w-6" />
            <h1 className="text-xl font-semibold">图谱加载失败</h1>
          </div>
          <p className="mb-6 text-sm leading-7 text-muted-foreground">{message}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => instantGraphQuery.refetch()}>
              重新加载
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/novels/${id}/edit`)}>
              返回工作台
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex h-screen flex-col overflow-x-hidden text-foreground">
      <div className="app-graph-backdrop absolute inset-0" />

      <header className="app-navbar-surface sticky top-0 z-20 border-b border-border/70">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-sky-300/70">
              <Orbit className="h-4 w-4" />
              Novel Graph
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/novels/${id}/edit`)}>
                <ArrowLeft className="h-4 w-4" />
                返回工作台
              </Button>
              <div>
                <h1 className="text-2xl font-semibold">{displayProject?.title || "未命名小说"}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {graphSource === "instant"
                    ? "即时图谱来自当前本地角色与关系数据，适合快速浏览人物结构。"
                    : "精确图谱来自 graph-every-novel 分析引擎，适合查看更完整的人物关系判断。"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatCard icon={Users} label="可见节点" value={`${visibleNodeCount}`} />
            <StatCard icon={GitBranch} label="可见关系" value={`${visibleEdgeCount}`} />
            <Button type="button" variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
              刷新图谱
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => preciseAnalysisMutation.mutate()}
              disabled={!canRunPreciseAnalysis}
            >
              <Wand2 className="h-4 w-4" />
              运行精确分析
            </Button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col gap-4 overflow-hidden p-4 xl:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <SourceToggle active={graphSource === "instant"} label="即时图谱" onClick={() => handleSourceChange("instant")} />
          <SourceToggle active={graphSource === "precise"} label="精确图谱" onClick={() => handleSourceChange("precise")} />
          <span className={cn("rounded-full border px-3 py-2 text-xs", PRECISE_STATUS_STYLES[preciseStatus?.status ?? "idle"])}>
            精确分析状态：{PRECISE_STATUS_LABELS[preciseStatus?.status ?? "idle"]}
          </span>
          {preciseProgressText ? (
            <span className="rounded-full border border-border/70 bg-card/65 px-3 py-2 text-xs text-foreground">
              {preciseProgressText}
            </span>
          ) : null}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <aside className="app-shell-panel flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-border/70 p-4">
              <div className="mb-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">筛选器</div>
              <label className="app-shell-panel-soft flex items-center gap-3 rounded-2xl px-3 py-2 shadow-none">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="搜索角色、别名、摘要"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 pb-6">
              <section>
                <div className="mb-2 text-sm font-medium text-foreground">角色层级</div>
                <div className="flex flex-wrap gap-2">
                  {ALL_NOVEL_GRAPH_TIERS.map((tier) => (
                    <FilterChip
                      key={tier}
                      active={filters.tiers.includes(tier)}
                      label={TIER_LABELS[tier]}
                      color={NOVEL_GRAPH_TIER_COLORS[tier]}
                      onClick={() => toggleTier(tier)}
                    />
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  type="button"
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/65 px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-accent/55"
                  onClick={() => setFilters((current) => ({ ...current, showPairEdges: !current.showPairEdges }))}
                >
                  <span className="flex items-center gap-2">
                    {filters.showPairEdges ? <Eye className={cn("h-4 w-4", PAIR_EDGE_COLOR)} /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                    对等关系
                  </span>
                  <span className="text-xs text-muted-foreground">{activeSnapshot?.pair_edges.length ?? 0}</span>
                </button>

                <button
                  type="button"
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/65 px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-accent/55"
                  onClick={() => setFilters((current) => ({ ...current, showDirectedEdges: !current.showDirectedEdges }))}
                >
                  <span className="flex items-center gap-2">
                    {filters.showDirectedEdges ? <Eye className={cn("h-4 w-4", DIRECTED_EDGE_COLOR)} /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                    单向关系
                  </span>
                  <span className="text-xs text-muted-foreground">{activeSnapshot?.directed_edges.length ?? 0}</span>
                </button>
              </section>

              {pairTypes.length > 0 ? (
                <section>
                  <div className="mb-2 text-sm font-medium text-foreground">对等关系类型</div>
                  <div className="flex flex-wrap gap-2">
                    {pairTypes.map((type) => (
                      <FilterChip
                        key={type}
                        active={filters.pairTypes.includes(type)}
                        label={type}
                        onClick={() => toggleValue("pairTypes", type)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {directedStances.length > 0 ? (
                <section>
                  <div className="mb-2 text-sm font-medium text-foreground">单向关系态势</div>
                  <div className="flex flex-wrap gap-2">
                    {directedStances.map((stance) => (
                      <FilterChip
                        key={stance}
                        active={filters.directedStances.includes(stance)}
                        label={stance}
                        onClick={() => toggleValue("directedStances", stance)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {directedStructuralBases.length > 0 ? (
                <section>
                  <div className="mb-2 text-sm font-medium text-foreground">结构关系基底</div>
                  <div className="flex flex-wrap gap-2">
                    {directedStructuralBases.map((base) => (
                      <FilterChip
                        key={base}
                        active={filters.directedStructuralBases.includes(base)}
                        label={base}
                        onClick={() => toggleValue("directedStructuralBases", base)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
                  <span>单向关系强度阈值</span>
                  <span className="text-xs text-muted-foreground">{Math.round(filters.minDirectedStrength * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(filters.minDirectedStrength * 100)}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      minDirectedStrength: Number(event.target.value) / 100,
                    }))
                  }
                  className="w-full accent-orange-300"
                />
              </section>

              <section>
                <div className="mb-2 text-sm font-medium text-foreground">角色总览</div>
                <div className="space-y-2">
                  {sortedNodes.map((node) => {
                    const degree = degreeMap.get(node.id) ?? 0;
                    const isSelected = selection?.kind === "node" && selection.id === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => handleNodeSelect(node.id)}
                        className={cn(
                          "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                          isSelected
                            ? "border-primary/60 bg-primary/10"
                            : "border-border/70 bg-card/65 hover:border-primary/30 hover:bg-accent/55",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <span className="truncate font-medium text-foreground">{node.name}</span>
                          <span className="text-[11px] text-muted-foreground">{degree} 条关系</span>
                        </div>
                        <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NOVEL_GRAPH_TIER_COLORS[node.tier] }} />
                          {TIER_LABELS[node.tier]}
                        </div>
                        <p className="line-clamp-2 text-xs leading-6 text-muted-foreground">
                          {node.summary || "暂无角色摘要。"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </aside>

          <section className="app-shell-panel min-h-0 overflow-hidden">
            <div className="flex h-full flex-col">
              <div className="border-b border-border/70 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {graphSource === "instant" ? "即时图谱视图" : "精确图谱视图"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      鼠标左键旋转，滚轮缩放，点击角色或关系查看详情。
                    </div>
                  </div>
                  <div className="rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs text-muted-foreground">
                    {visibleNodeCount} 节点 / {visibleEdgeCount} 关系
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <StatusNotice title={preciseNotice.title} description={preciseNotice.description} tone={preciseNotice.tone} />

                {showReadinessPanel ? (
                  <ReadinessPanel
                    readiness={preciseReadiness}
                    isLoading={preciseReadinessQuery.isLoading}
                    errorMessage={preciseReadinessQuery.error instanceof Error ? preciseReadinessQuery.error.message : null}
                  />
                ) : null}

                <div className="app-shell-panel-soft h-[min(70vh,760px)] min-h-[520px] rounded-2xl shadow-none">
                  {graphData && graphData.nodes.length > 0 ? (
                    <ForceGraph3DCanvas
                      graphData={graphData}
                      focusRequest={focusRequest}
                      onNodeClick={(nodeId) => handleNodeSelect(nodeId)}
                      onLinkClick={(edgeId, kind) => setSelection({ kind, id: edgeId })}
                      onStageClick={() => setSelection(null)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                      <div>
                        <Sparkles className="mx-auto mb-3 h-5 w-5 text-sky-300" />
                        当前筛选条件下没有可展示的图谱节点。
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="app-shell-panel flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-border/70 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">详情面板</div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {selected.node
                  ? selected.node.name
                  : selected.pairEdge
                    ? selected.pairEdge.label || selected.pairEdge.type
                    : selected.directedEdge
                      ? selected.directedEdge.display_relation
                      : "选择一个角色或关系"}
              </div>
              {selectedNodeName ? (
                <div className="mt-1 text-xs text-muted-foreground">{selectedNodeName}</div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">点击左侧角色列表或中间图谱节点查看细节。</div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-6">
              {selected.node ? (
                <NodeDetail node={selected.node} />
              ) : selected.pairEdge ? (
                <PairEdgeDetail edge={selected.pairEdge} nodeLookup={nodeLookup} />
              ) : selected.directedEdge ? (
                <DirectedEdgeDetail edge={selected.directedEdge} nodeLookup={nodeLookup} />
              ) : (
                <div className="app-state-panel-muted rounded-2xl p-5">
                  <div className="text-sm font-medium text-foreground">还没有选中对象</div>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    你可以点击左侧角色卡片，或者直接点击图谱中的节点与关系，在这里查看更完整的解释信息。
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
