import type { KeyboardEvent, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LandingProfileItem } from "../writingFormulaLandingItems";

interface WritingFormulaLandingProps {
  onOpenCreate: () => void;
  onSelectProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onOpenWorkbench: (profileId: string) => void;
  onUseProfileForClean: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  deletePending: boolean;
  profileItems: LandingProfileItem[];
  selectedProfileId: string;
}

function truncateText(value: string | null | undefined, maxLength: number): string {
  const text = value?.trim() ?? "";
  if (!text) {
    return "";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function handleSelectableKeyDown(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect();
}

function DetailPanel(props: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="app-shell-panel-soft space-y-3 p-4">
      <div className="space-y-1">
        <div className="app-section-kicker">{props.title}</div>
        {props.description ? (
          <div className="app-caption-copy">{props.description}</div>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function DetailStatRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm leading-6">
      <div className="text-muted-foreground">{props.label}</div>
      <div className="text-right text-foreground">{props.value}</div>
    </div>
  );
}

function SummaryCard(props: { title: string; summary: string }) {
  return (
    <div className="rounded-[calc(var(--radius)+2px)] border border-border/60 bg-background/20 p-3">
      <div className="text-sm font-semibold text-foreground">{props.title}</div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{props.summary}</div>
    </div>
  );
}

export default function WritingFormulaLanding(props: WritingFormulaLandingProps) {
  const {
    onOpenCreate,
    onSelectProfile,
    onEditProfile,
    onOpenWorkbench,
    onUseProfileForClean,
    onDeleteProfile,
    deletePending,
    profileItems,
    selectedProfileId,
  } = props;

  const customProfiles = profileItems.filter((item) => !item.isStarter);
  const starterProfiles = profileItems.filter((item) => item.isStarter);

  const renderProfileCard = (profile: LandingProfileItem) => {
    const isSelected = profile.id === selectedProfileId;
    const selectedStyle = profile.isStarter
      ? "border-primary/22 bg-background/36 shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
      : "border-primary/18 bg-background/42 shadow-[0_12px_28px_rgba(15,23,42,0.1)] ring-1 ring-primary/6";
    const idleStyle = "border-border/65 bg-background/22 hover:border-primary/16 hover:bg-background/30";
    const originBadgeClassName = profile.isStarter
      ? "h-6 border-primary/15 bg-primary/[0.06] text-primary"
      : "h-6 border-border/70 bg-background/35 text-muted-foreground";

    return (
      <div
        key={profile.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelectProfile(profile.id)}
        onKeyDown={(event) => handleSelectableKeyDown(event, () => onSelectProfile(profile.id))}
        className={`rounded-[calc(var(--radius)+8px)] border px-4 py-4 text-left transition-all duration-200 ${isSelected ? selectedStyle : idleStyle}`}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-base font-semibold text-foreground">{profile.name}</div>
              <Badge variant="outline" className={originBadgeClassName}>
                {profile.originLabel}
              </Badge>
              {profile.category ? (
                <Badge variant="outline" className="h-6 border-border/70 bg-transparent text-muted-foreground">
                  {profile.category}
                </Badge>
              ) : null}
              <Badge variant="outline" className="h-6 border-border/70 bg-transparent text-muted-foreground">
                {profile.sourceTypeLabel}
              </Badge>
            </div>

            <div className="text-sm leading-7 text-muted-foreground">
              {truncateText(profile.summaryLine, 120) || "暂无写法摘要。"}
            </div>

            <div className="flex flex-wrap gap-2">
              {profile.tags.slice(0, 4).map((tag) => (
                <Badge key={`${profile.id}-${tag}`} variant="outline" className="h-6 border-border/65 bg-background/24 text-muted-foreground">
                  {tag}
                </Badge>
              ))}
              {profile.recentNovelTitle ? (
                <Badge variant="outline" className="h-6 border-primary/16 bg-primary/[0.05] text-primary">
                  最近绑定：{profile.recentNovelTitle}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="app-action-row xl:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-w-[92px]"
              onClick={(event) => {
                event.stopPropagation();
                onEditProfile(profile.id);
              }}
            >
              编辑设定
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-w-[92px]"
              onClick={(event) => {
                event.stopPropagation();
                onOpenWorkbench(profile.id);
              }}
            >
              应用与测试
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-w-[88px]"
              onClick={(event) => {
                event.stopPropagation();
                onUseProfileForClean(profile.id);
              }}
            >
              去 AI 味
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="min-w-[80px] shadow-none"
              disabled={deletePending}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteProfile(profile.id);
              }}
            >
              {deletePending ? "删除中..." : "删除"}
            </Button>
          </div>
        </div>

        {isSelected ? (
          <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_300px]">
              <DetailPanel
                title="阅读体验"
                description="先判断这套写法要把正文带去什么方向，再决定要不要继续编辑或直接绑定到项目。"
              >
                <div className="rounded-[calc(var(--radius)+4px)] border border-border/65 bg-muted/20 p-4 text-sm leading-7 text-foreground/88">
                  {profile.description}
                </div>

                {profile.detailLines.length > 0 ? (
                  <div className="grid gap-2">
                    {profile.detailLines.map((line) => (
                      <div
                        key={`${profile.id}-${line}`}
                        className="rounded-[calc(var(--radius)+2px)] border border-border/65 bg-background/30 px-3 py-3 text-sm leading-6 text-muted-foreground"
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                ) : null}

                {profile.sourceContentPreview ? (
                  <div className="app-shell-panel-soft space-y-2 p-4">
                    <div className="app-section-kicker">原文样本片段</div>
                    <div className="text-sm leading-7 text-foreground/92">{profile.sourceContentPreview}</div>
                  </div>
                ) : null}
              </DetailPanel>

              <div className="space-y-4">
                <DetailPanel
                  title="规则摘要"
                  description="这里概括这套写法在剧情推进、人物表达、语言质感和节奏控制上的实际倾向。"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <SummaryCard title="剧情推进" summary={profile.narrativeSummary} />
                    <SummaryCard title="人物表达" summary={profile.characterSummary} />
                    <SummaryCard title="语言质感" summary={profile.languageSummary} />
                    <SummaryCard title="节奏控制" summary={profile.rhythmSummary} />
                  </div>
                </DetailPanel>

                <DetailPanel
                  title="去 AI 约束"
                  description="这里决定正文检测和修订时，系统优先盯哪些高风险表达和痕迹。"
                >
                  {profile.antiAiFocus.length > 0 || profile.antiAiRuleNames.length > 0 || profile.extractionAntiAiRecommendationCount > 0 ? (
                    <div className="space-y-3">
                      {profile.antiAiFocus.length > 0 ? (
                        <div className="grid gap-2">
                          {profile.antiAiFocus.map((line) => (
                            <div key={`${profile.id}-${line}`} className="app-warning-panel rounded-[calc(var(--radius)+2px)] px-3 py-3 text-sm leading-6">
                              {line}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {profile.antiAiRuleNames.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {profile.antiAiRuleNames.map((ruleName) => (
                            <Badge key={`${profile.id}-${ruleName}`} variant="outline" className="h-6 border-border/65 bg-background/24 text-muted-foreground">
                              {ruleName}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      {profile.extractionAntiAiRecommendationCount > 0 ? (
                        <div className="rounded-[calc(var(--radius)+2px)] border border-border/65 bg-muted/20 px-3 py-3 text-sm leading-6 text-muted-foreground">
                          这套写法在提取阶段额外建议了 {profile.extractionAntiAiRecommendationCount} 条反 AI 规则，适合后续继续精配。
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="app-state-panel-muted px-3 py-3 text-sm leading-6 text-muted-foreground">
                      这套写法还没有明确绑定反 AI 约束，所以在“去 AI 味”阶段的可控性会偏弱。
                    </div>
                  )}
                </DetailPanel>
              </div>

              <div className="space-y-4">
                <DetailPanel
                  title="资产概览"
                  description="这一列主要用来判断它现在成熟到什么程度、是否能直接拿去绑定项目。"
                >
                  <div className="space-y-2">
                    <DetailStatRow label="来源" value={profile.sourceTypeLabel} />
                    <DetailStatRow label="最近更新" value={profile.updatedAtLabel} />
                    <DetailStatRow label="启用特征" value={`${profile.extractedFeatureCount} 项`} />
                    <DetailStatRow label="高风险指纹" value={`${profile.highRiskFeatureCount} 项`} />
                    <DetailStatRow label="当前预设" value={profile.selectedPresetLabel || "未锁定"} />
                    <DetailStatRow label="可选预设" value={profile.presetLabels.length > 0 ? profile.presetLabels.join(" / ") : "暂无"} />
                    <DetailStatRow label="已绑定目标" value={`${profile.bindingCount} 个`} />
                    <DetailStatRow label="最近小说" value={profile.recentNovelTitle || "还没有绑定到小说"} />
                    <DetailStatRow
                      label="适用题材"
                      value={profile.applicableGenres.length > 0 ? profile.applicableGenres.join(" / ") : "未填写"}
                    />
                  </div>
                </DetailPanel>

                <DetailPanel
                  title="下一步"
                  description="三个动作现在职责分离：编辑写法本身、进入应用与测试、或只做去 AI 修订。"
                >
                  <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                    <div>编辑设定：维护这套写法的说明、规则和反 AI 约束。</div>
                    <div>应用与测试：绑定到小说或章节，并做试写验证。</div>
                    <div>去 AI 味：只处理正文检测和修正，不改写法字段。</div>
                  </div>
                </DetailPanel>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="app-shell-panel overflow-hidden">
        <div className="space-y-6 p-5 md:p-6 lg:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <Badge variant="outline" className="border-border/65 bg-background/45 text-muted-foreground">
                我的写法资产
              </Badge>
              <div className="space-y-3">
                <h1 className="app-heading-display max-w-4xl text-foreground">
                  先选一套写法，再决定要编辑、应用，还是专门去 AI 味。
                </h1>
                <p className="app-reading-copy max-w-3xl text-muted-foreground">
                  首页先帮你看清已有写法资产。展开后会直接展示这套写法的阅读定位、规则摘要、反 AI 约束和当前成熟度。
                </p>
              </div>
            </div>

            <Button type="button" className="min-w-[120px]" onClick={onOpenCreate}>
              新建一套写法
            </Button>
          </div>

          <div className="app-shell-panel-soft px-4 py-3 text-sm leading-7 text-muted-foreground">
            书级默认写法请从小说基础信息进入，由小说来选择要使用的写法资产，再带入后续导演和正文流程。
          </div>

          {profileItems.length === 0 ? (
            <div className="app-state-panel-muted space-y-4 px-6 py-6">
              <div className="app-heading-section text-foreground">当前还没有写法资产</div>
              <div className="app-reading-copy max-w-2xl">
                先创建第一套写法，后面再回来慢慢补规则、做试写和绑定目标。
              </div>
              <div className="app-action-row">
                <Button type="button" onClick={onOpenCreate}>
                  去创建第一套写法
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {customProfiles.length > 0 ? (
                <section className="app-shell-panel space-y-4 p-4 md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="app-heading-section text-foreground">你自己沉淀的写法</div>
                      <div className="app-caption-copy">
                        这些是已经成形、适合优先绑定到项目里的可复用写法资产。
                      </div>
                    </div>
                    <Badge variant="outline" className="border-border/65 bg-background/24 text-muted-foreground">
                      {customProfiles.length} 套
                    </Badge>
                  </div>

                  <div className="grid gap-3">
                    {customProfiles.map(renderProfileCard)}
                  </div>
                </section>
              ) : null}

              {starterProfiles.length > 0 ? (
                <section className="app-shell-panel space-y-4 p-4 md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="app-heading-section text-foreground">可直接改造的起步写法</div>
                      <div className="app-caption-copy">
                        这些预置资产适合先借一套骨架，再按当前项目改成自己的写法。
                      </div>
                    </div>
                    <Badge variant="outline" className="border-border/65 bg-background/24 text-muted-foreground">
                      {starterProfiles.length} 套
                    </Badge>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {starterProfiles.map(renderProfileCard)}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
