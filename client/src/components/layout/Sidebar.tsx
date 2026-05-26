import { useQuery } from "@tanstack/react-query";
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Database,
  Globe2,
  House,
  LayoutDashboard,
  ListTodo,
  Route,
  ScanSearch,
  Settings2,
  SquarePen,
  Tags,
  UsersRound,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { getAutoDirectorFollowUpOverview } from "@/api/autoDirectorFollowUps";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";
import { getTaskOverview } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "创作",
    items: [
      { to: "/", label: "首页", icon: House },
      { to: "/novels", label: "小说列表", icon: BookOpenText },
      { to: "/creative-hub", label: "创作中枢", icon: LayoutDashboard },
      { to: "/book-analysis", label: "拆书", icon: ScanSearch },
      { to: "/tasks", label: "任务中心", icon: ListTodo },
      { to: "/auto-director/follow-ups", label: "导演跟进", icon: Workflow },
    ],
  },
  {
    title: "资产",
    items: [
      { to: "/genres", label: "题材库", icon: Tags },
      { to: "/story-modes", label: "推进模式库", icon: Workflow },
      { to: "/titles", label: "标题工坊", icon: SquarePen },
      { to: "/knowledge", label: "知识库", icon: Database },
      { to: "/worlds", label: "世界观", icon: Globe2 },
      { to: "/style-engine", label: "写法引擎", icon: WandSparkles },
      { to: "/base-characters", label: "基础角色库", icon: UsersRound },
    ],
  },
  {
    title: "系统",
    items: [
      { to: "/account", label: "账户中心", icon: CircleUserRound },
      { to: "/settings/model-routes", label: "模型路由", icon: Route },
      { to: "/billing", label: "套餐中心", icon: CreditCard },
      { to: "/settings", label: "系统设置", icon: Settings2 },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.overview,
    queryFn: getTaskOverview,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const overview = query.state.data?.data;
      return (overview?.queuedCount ?? 0) > 0 || (overview?.runningCount ?? 0) > 0 ? 4000 : false;
    },
  });

  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledge.documents("sidebar"),
    queryFn: () => listKnowledgeDocuments(),
    staleTime: 30_000,
  });

  const autoDirectorFollowUpQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.overview,
    queryFn: getAutoDirectorFollowUpOverview,
    refetchInterval: (query) => {
      const totalCount = query.state.data?.data?.totalCount ?? 0;
      return totalCount > 0 ? 4000 : false;
    },
  });

  const runningTaskCount = taskQuery.data?.data?.runningCount ?? 0;
  const failedTaskCount = taskQuery.data?.data?.failedCount ?? 0;
  const autoDirectorFollowUpCount = autoDirectorFollowUpQuery.data?.data?.totalCount ?? 0;
  const knowledgeDocuments = knowledgeQuery.data?.data ?? [];
  const failedIndexCount = knowledgeDocuments.filter((item) => item.latestIndexStatus === "failed").length;

  const renderBadge = (to: string) => {
    if (to === "/tasks") {
      if (runningTaskCount <= 0 && failedTaskCount <= 0) {
        return null;
      }

      return (
        <div className={cn("flex items-center gap-1", collapsed ? "absolute right-1.5 top-1.5" : "ml-auto")}>
          {runningTaskCount > 0 ? (
            <Badge
              variant="secondary"
              className={cn("h-5 px-1.5 text-[10px]", collapsed && "h-4 min-w-4 px-1 text-[9px]")}
            >
              {collapsed ? runningTaskCount : `R${runningTaskCount}`}
            </Badge>
          ) : null}
          {failedTaskCount > 0 ? (
            <Badge
              variant="destructive"
              className={cn("h-5 px-1.5 text-[10px]", collapsed && "h-4 min-w-4 px-1 text-[9px]")}
            >
              {collapsed ? failedTaskCount : `F${failedTaskCount}`}
            </Badge>
          ) : null}
        </div>
      );
    }

    if (to === "/auto-director/follow-ups" && autoDirectorFollowUpCount > 0) {
      return (
        <Badge
          variant="destructive"
          className={cn(
            "h-5 px-1.5 text-[10px]",
            collapsed ? "absolute right-1.5 top-1.5 h-4 min-w-4 px-1 text-[9px]" : "ml-auto",
          )}
        >
          {autoDirectorFollowUpCount}
        </Badge>
      );
    }

    if (to === "/knowledge" && failedIndexCount > 0) {
      return (
        <Badge
          variant="destructive"
          className={cn(
            "h-5 px-1.5 text-[10px]",
            collapsed ? "absolute right-1.5 top-1.5 h-4 min-w-4 px-1 text-[9px]" : "ml-auto",
          )}
        >
          {collapsed ? failedIndexCount : `F${failedIndexCount}`}
        </Badge>
      );
    }

    return null;
  };

  return (
    <aside
      className={cn(
        "app-shell-panel flex h-full flex-col p-3 transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("mb-4 flex items-center", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed ? (
          <div className="px-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Workspace</div>
            <div className="mt-1 text-sm text-muted-foreground">Novel operation center</div>
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 text-muted-foreground"
          onClick={onToggle}
          aria-label={collapsed ? "展开导航栏" : "收起导航栏"}
          title={collapsed ? "展开导航栏" : "收起导航栏"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="app-sidebar-scrollbar flex-1 space-y-4 overflow-y-auto pr-1">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            {!collapsed ? (
              <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/70">
                {group.title}
              </div>
            ) : (
              <div className="mx-auto h-px w-8 bg-white/10" />
            )}

            {group.items.map((item) => {
              const Icon = item.icon;
              const isNovelEntry = item.to === "/novels";

              return (
                <NavLink key={item.to} to={item.to} title={collapsed ? item.label : undefined}>
                  {({ isActive }) => (
                    <div
                      className={cn(
                        "relative flex items-center rounded-[14px] text-sm transition-all duration-200",
                        collapsed ? "justify-center px-2 py-3" : "py-3 pl-4 pr-3",
                        isActive
                          ? "bg-primary/16 font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                          : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
                        isNovelEntry &&
                          !collapsed &&
                          (isActive ? "ring-1 ring-primary/30" : "bg-primary/[0.06] hover:bg-primary/[0.1]"),
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-transparent transition-colors",
                          isActive && "bg-primary",
                          collapsed && "left-1 h-7",
                        )}
                      />

                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0",
                          collapsed ? "mx-auto" : "mr-3",
                          isNovelEntry && "text-primary",
                        )}
                      />

                      {!collapsed ? (
                        <span className={cn("truncate", isNovelEntry && "font-semibold")}>
                          {item.label}
                        </span>
                      ) : null}

                      {renderBadge(item.to)}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
