import { useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";
import AITakeoverContainer from "@/components/workflow/AITakeoverContainer";
import ChapterManagementTab from "./ChapterManagementTab";
import NovelCharacterPanel from "./NovelCharacterPanel";
import NovelTaskDrawer from "./NovelTaskDrawer";
import OutlineTab from "./OutlineTab";
import PipelineTab from "./PipelineTab";
import StoryMacroPlanTab from "./StoryMacroPlanTab";
import StructuredOutlineTab from "./StructuredOutlineTab";
import VersionHistoryTab from "./VersionHistoryTab";
import BasicInfoTab from "./BasicInfoTab";
import MobileNovelEditView from "../mobile/MobileNovelEditView";
import type { NovelEditViewProps } from "./NovelEditView.types";
import {
  getNovelWorkspaceFlowStepIndex,
  getNovelWorkspaceTabLabel,
  NOVEL_WORKSPACE_FLOW_STEPS,
  normalizeNovelWorkspaceTab,
} from "../novelWorkspaceNavigation";

const GRAPH_STATUS_LABELS = {
  disabled: "未启用",
  idle: "待运行",
  queued: "排队中",
  running: "分析中",
  succeeded: "已就绪",
  failed: "失败",
} as const;

function formatGraphStatusTime(value: string | null | undefined): string {
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

function formatGenericStatus(value: string | null | undefined): string {
  switch (value) {
    case "queued":
      return "排队中";
    case "running":
      return "进行中";
    case "failed":
      return "失败";
    case "waiting":
    case "waiting_approval":
      return "待审核";
    case "completed":
    case "succeeded":
    case "success":
      return "已完成";
    case "idle":
      return "空闲";
    default:
      return value?.trim() || "暂无";
  }
}

function getGraphReadinessLabel(graphPanel: NonNullable<NovelEditViewProps["graphPanel"]> | undefined): string | null {
  if (!graphPanel) {
    return null;
  }
  if (graphPanel.isReadinessLoading && !graphPanel.readiness) {
    return "检查中";
  }
  if (graphPanel.readinessError) {
    return "诊断失败";
  }
  if (!graphPanel.readiness) {
    return "未知";
  }
  return graphPanel.readiness.ready ? "可分析" : "需配置";
}

function getGraphReadinessMessage(graphPanel: NonNullable<NovelEditViewProps["graphPanel"]> | undefined): string | null {
  if (!graphPanel) {
    return null;
  }
  if (graphPanel.readinessError) {
    return `诊断读取失败：${graphPanel.readinessError}`;
  }
  if (graphPanel.isReadinessLoading && !graphPanel.readiness) {
    return "正在检查本地图谱引擎、Python 和模型配置。";
  }
  if (!graphPanel.readiness) {
    return null;
  }
  if (graphPanel.readiness.ready) {
    return "本地图谱引擎、Python 与模型配置均已就绪，可以直接运行精确图谱分析。";
  }
  return graphPanel.readiness.issues[0]?.message ?? "精确图谱尚未完成运行配置。";
}

export default function NovelEditView(props: NovelEditViewProps) {
  const isMobileViewport = useIsMobileViewport();

  if (isMobileViewport) {
    return <MobileNovelEditView {...props} />;
  }

  return <DesktopNovelEditView {...props} />;
}

function DesktopNovelEditView(props: NovelEditViewProps) {
  const {
    id,
    activeTab,
    workflowCurrentTab,
    exportControls,
    basicTab,
    storyMacroTab,
    outlineTab,
    structuredTab,
    chapterTab,
    pipelineTab,
    characterTab,
    graphPanel,
    takeover,
    taskDrawer,
    activeStepTakeoverEntry,
  } = props;

  const [isProjectToolsOpen, setIsProjectToolsOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  const totalChapters = chapterTab.chapters.length;
  const generatedChapters = chapterTab.chapters.filter((item) => Boolean(item.content?.trim())).length;
  const pendingRepairs = pipelineTab.chapterReports.filter(
    (item) => item.overall < pipelineTab.pipelineForm.qualityThreshold,
  ).length;
  const currentModel = pipelineTab.pipelineJob?.payload
    ? (() => {
        try {
          const parsed = JSON.parse(pipelineTab.pipelineJob.payload) as { model?: string };
          return parsed.model ?? "default";
        } catch {
          return "default";
        }
      })()
    : "default";

  const pendingResourceProposalCount = taskDrawer?.resourceProposals?.length ?? 0;
  const taskAttentionLabel = (() => {
    if (pendingResourceProposalCount > 0) {
      return `${pendingResourceProposalCount} 条资源`;
    }
    if (!taskDrawer?.task) {
      return null;
    }
    if (taskDrawer.task.status === "failed") {
      return "异常";
    }
    if (taskDrawer.task.status === "waiting_approval") {
      return "待审核";
    }
    if (taskDrawer.task.status === "running" || taskDrawer.task.status === "queued") {
      return "进行中";
    }
    return "最近任务";
  })();

  const normalizedActiveTab = normalizeNovelWorkspaceTab(activeTab);
  const normalizedWorkflowTab = normalizeNovelWorkspaceTab(workflowCurrentTab ?? activeTab);
  const guidedFlowTab = normalizedActiveTab === "history"
    ? normalizedWorkflowTab === "history"
      ? "basic"
      : normalizedWorkflowTab
    : normalizedActiveTab;
  const novelTitle = basicTab.basicForm.title.trim() || "未命名小说";
  const currentStepLabel = getNovelWorkspaceTabLabel(normalizedActiveTab);
  const workflowStepLabel = getNovelWorkspaceTabLabel(normalizedWorkflowTab);
  const stepIndex = getNovelWorkspaceFlowStepIndex(guidedFlowTab);
  const progressLabel = stepIndex >= 0
    ? `第 ${stepIndex + 1} 步 / 共 ${NOVEL_WORKSPACE_FLOW_STEPS.length} 步`
    : null;
  const isTakeoverLoading = takeover?.mode === "loading";
  const hideTakeoverEntry = takeover?.mode === "running" || takeover?.mode === "waiting";
  const graphStatus = graphPanel?.status ?? null;
  const graphStatusLabel = graphStatus ? GRAPH_STATUS_LABELS[graphStatus.status] : null;
  const graphReadinessLabel = getGraphReadinessLabel(graphPanel);
  const graphReadinessMessage = getGraphReadinessMessage(graphPanel);
  const needsGraphProviderSetup = Boolean(graphPanel?.readiness && !graphPanel.readiness.providerConfigured);

  const renderActivePanel = () => {
    switch (normalizedActiveTab) {
      case "basic":
        return <BasicInfoTab {...basicTab} />;
      case "outline":
        return <OutlineTab {...outlineTab} />;
      case "story_macro":
        return <StoryMacroPlanTab {...storyMacroTab} />;
      case "structured":
        return <StructuredOutlineTab {...structuredTab} />;
      case "chapter":
        return <ChapterManagementTab {...chapterTab} />;
      case "pipeline":
        return <PipelineTab {...pipelineTab} />;
      case "character":
        return <NovelCharacterPanel {...characterTab} />;
      case "history":
        return <VersionHistoryTab novelId={id} />;
      default:
        return <BasicInfoTab {...basicTab} />;
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-6 lg:space-y-7">
      {id ? (
        <div className="app-page-header space-y-4 p-5 sm:p-6">
          <div className="app-meta-row min-w-0 items-center gap-x-3 gap-y-2 text-[0.8125rem]">
            <span className="truncate font-semibold text-foreground">{novelTitle}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
            <span className="shrink-0 text-muted-foreground">当前步骤：{currentStepLabel}</span>
            {progressLabel ? (
              <>
                <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
                <span className="shrink-0 text-muted-foreground">{progressLabel}</span>
              </>
            ) : null}
            {normalizedWorkflowTab !== normalizedActiveTab ? (
              <>
                <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
                <span className="shrink-0 font-medium text-primary">流程推荐：{workflowStepLabel}</span>
              </>
            ) : null}
            {graphStatusLabel ? (
              <>
                <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
                <span className="shrink-0 text-muted-foreground">图谱状态：{graphStatusLabel}</span>
              </>
            ) : null}
            {graphReadinessLabel ? (
              <>
                <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
                <span className="shrink-0 text-muted-foreground">运行条件：{graphReadinessLabel}</span>
              </>
            ) : null}
          </div>

          <div className="app-action-row justify-end">
            {!hideTakeoverEntry ? (
              isTakeoverLoading ? (
                <Button type="button" size="sm" disabled>
                  <Loader2 className="animate-spin" />
                  AI 自动导演接管
                </Button>
              ) : activeStepTakeoverEntry
            ) : null}

            {graphPanel ? (
                <Button variant="outline" onClick={graphPanel.onOpenGraph} className="gap-2" title={graphReadinessMessage ?? undefined}>
                <GitBranch className="h-4 w-4" />
                <span>人物图谱</span>
                {graphPanel.isLoading || graphPanel.isRefreshing || graphPanel.isReadinessLoading || graphPanel.isTriggeringAnalysis ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : null}
                {graphStatusLabel ? <Badge variant="secondary">{graphStatusLabel}</Badge> : null}
                {graphReadinessLabel ? <Badge variant="outline">{graphReadinessLabel}</Badge> : null}
              </Button>
            ) : null}

            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">导出</Button>
              </DialogTrigger>
              <DialogContent className="app-modal-surface max-w-2xl">
                <DialogHeader>
                  <DialogTitle>导出项目内容</DialogTitle>
                  <DialogDescription>
                    当前步骤会按你正在查看的工作台导出；整本书会把项目设定、故事规划、角色、卷规划、拆章、章节和质量修复资产一起导出。
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="app-shell-panel-soft shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">当前步骤：{currentStepLabel}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => exportControls.onExportCurrent("markdown")}
                        disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentMarkdown}
                      >
                        {exportControls.isExportingCurrentMarkdown ? "导出中..." : "Markdown"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => exportControls.onExportCurrent("json")}
                        disabled={!exportControls.canExportCurrentStep || exportControls.isExportingCurrentJson}
                      >
                        {exportControls.isExportingCurrentJson ? "导出中..." : "JSON"}
                      </Button>
                    </CardContent>
                  </Card>
                  <Card className="app-shell-panel-soft shadow-none">
                    <CardHeader>
                      <CardTitle className="text-base">整本书</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => exportControls.onExportFull("markdown")}
                        disabled={exportControls.isExportingFullMarkdown}
                      >
                        {exportControls.isExportingFullMarkdown ? "导出中..." : "Markdown"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => exportControls.onExportFull("json")}
                        disabled={exportControls.isExportingFullJson}
                      >
                        {exportControls.isExportingFullJson ? "导出中..." : "JSON"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isProjectToolsOpen} onOpenChange={setIsProjectToolsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">项目工具</Button>
              </DialogTrigger>
              <DialogContent className="app-modal-surface max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-auto">
                <DialogHeader>
                  <DialogTitle>项目工具</DialogTitle>
                  <DialogDescription>
                    这里集中展示章节进度、任务信息、图谱状态和知识绑定，避免主工作区被次级信息打断。
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 md:grid-cols-2">
                  <Card className="app-shell-panel-soft shadow-none">
                    <CardHeader>
                      <CardTitle>章节进度</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{generatedChapters} / {Math.max(totalChapters, 1)} 已生成</p>
                    </CardContent>
                  </Card>
                  <Card className="app-shell-panel-soft shadow-none">
                    <CardHeader>
                      <CardTitle>待修复章节</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{pendingRepairs}</p>
                    </CardContent>
                  </Card>
                  <Card className="app-shell-panel-soft shadow-none">
                    <CardHeader>
                      <CardTitle>当前模型</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{currentModel}</p>
                    </CardContent>
                  </Card>
                  <Card className="app-shell-panel-soft shadow-none">
                    <CardHeader>
                      <CardTitle>最近任务</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{formatGenericStatus(pipelineTab.pipelineJob?.status)}</p>
                    </CardContent>
                  </Card>
                  {graphPanel ? (
                    <Card className="app-shell-panel-soft shadow-none md:col-span-2">
                      <CardHeader>
                        <CardTitle>人物图谱</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium">
                            精确图谱状态：{graphStatusLabel ?? "未知"}
                          </p>
                          <p className="app-caption-copy">
                            运行条件：{graphReadinessLabel ?? "未知"}
                          </p>
                          <p className="app-caption-copy">
                            最近成功时间：{formatGraphStatusTime(graphStatus?.lastSuccessfulAt)}
                          </p>
                          {graphReadinessMessage ? (
                            <p className="app-caption-copy">{graphReadinessMessage}</p>
                          ) : null}
                          {graphStatus?.error ? (
                            <p className="text-xs text-red-500">{graphStatus.error}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {needsGraphProviderSetup && graphPanel.onOpenModelSettings ? (
                            <Button variant="outline" onClick={graphPanel.onOpenModelSettings} className="gap-2">
                              前往图谱设置
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            onClick={graphPanel.onRunAnalysis}
                            disabled={!graphPanel.canRunAnalysis}
                            className="gap-2"
                          >
                            {graphPanel.isTriggeringAnalysis ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <GitBranch className="h-4 w-4" />
                            )}
                            立即分析
                          </Button>
                          <Button variant="outline" onClick={graphPanel.onOpenGraph} className="gap-2">
                            <GitBranch className="h-4 w-4" />
                            打开图谱中心
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
                <KnowledgeBindingPanel targetType="novel" targetId={id} title="参考知识" />
              </DialogContent>
            </Dialog>

            <Button
              variant={taskDrawer?.task?.status === "failed" ? "destructive" : "outline"}
              onClick={() => taskDrawer?.onOpenChange(true)}
            >
              任务面板
              {taskAttentionLabel ? <Badge variant="secondary">{taskAttentionLabel}</Badge> : null}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 pt-1">
        {takeover ? (
          <AITakeoverContainer
            mode={takeover.mode}
            title={takeover.title}
            description={takeover.description}
            progress={takeover.progress}
            currentAction={takeover.currentAction}
            checkpointLabel={takeover.checkpointLabel}
            taskId={takeover.taskId}
            actions={takeover.actions}
          >
            {renderActivePanel()}
          </AITakeoverContainer>
        ) : (
          renderActivePanel()
        )}
      </div>

      {taskDrawer ? <NovelTaskDrawer {...taskDrawer} /> : null}
    </div>
  );
}
