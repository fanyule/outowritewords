import { CircleAlert, CircleUserRound, CreditCard, GitBranch, Loader2, LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  getNovelPreciseGraphReadiness,
  getNovelPreciseGraphStatus,
} from "@/api/novel/graph";
import { queryKeys } from "@/api/queryKeys";
import LLMSelector from "@/components/common/LLMSelector";
import DesktopBrandMark from "@/components/layout/DesktopBrandMark";
import ThemeModeSwitcher from "@/components/layout/ThemeModeSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AUTO_DIRECTOR_MOBILE_CLASSES,
  shouldUseAutoDirectorMobileFullWidthContent,
} from "@/mobile/autoDirector";
import { useAuthStore } from "@/store/authStore";

interface NavbarProps {
  workspaceNavMode?: "workspace" | "project";
  onWorkspaceNavModeChange?: (mode: "workspace" | "project") => void;
}

const GRAPH_STATUS_LABELS = {
  disabled: "未启用",
  idle: "待运行",
  queued: "排队中",
  running: "分析中",
  succeeded: "已就绪",
  failed: "失败",
} as const;

const GRAPH_STATUS_STYLES = {
  disabled: "border-slate-700/80 bg-slate-900/60 text-slate-300",
  idle: "border-slate-700/80 bg-slate-900/60 text-slate-300",
  queued: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  running: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  succeeded: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  failed: "border-red-400/30 bg-red-400/10 text-red-200",
} as const;

export default function Navbar(props: NavbarProps) {
  const { workspaceNavMode, onWorkspaceNavModeChange } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const logout = useAuthStore((state) => state.logout);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isHome = location.pathname === "/";
  const showWorkspaceToggle = Boolean(workspaceNavMode && onWorkspaceNavModeChange);
  const useMobileAutoDirectorShell = shouldUseAutoDirectorMobileFullWidthContent(location.pathname);
  const novelEditMatch =
    matchPath("/novels/:id/edit", location.pathname) ??
    matchPath("/novels/:id/chapters/:chapterId", location.pathname);
  const novelGraphMatch = matchPath("/novels/:id/graph", location.pathname);
  const graphNovelId = novelGraphMatch?.params.id ?? novelEditMatch?.params.id ?? "";

  const graphStatusQuery = useQuery({
    queryKey: queryKeys.novels.preciseGraphStatus(graphNovelId || "unknown"),
    queryFn: () => getNovelPreciseGraphStatus(graphNovelId),
    enabled: Boolean(graphNovelId),
    staleTime: 3_000,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" ? 3_000 : false;
    },
  });

  const graphReadinessQuery = useQuery({
    queryKey: queryKeys.novels.preciseGraphReadiness(graphNovelId || "unknown"),
    queryFn: () => getNovelPreciseGraphReadiness(graphNovelId),
    enabled: Boolean(graphNovelId),
    staleTime: 20_000,
    retry: false,
  });

  const displayName = useMemo(() => {
    if (!session?.user) {
      return "";
    }
    return session.user.nickname || session.user.username;
  }, [session]);

  const accessStatusText = useMemo(() => {
    if (!session?.user.access_end_at) {
      return "长期有效";
    }

    const accessEndTime = new Date(session.user.access_end_at);
    if (Number.isNaN(accessEndTime.getTime())) {
      return "授权有效";
    }

    return `有效期至 ${accessEndTime.toLocaleDateString("zh-CN")}`;
  }, [session]);

  const graphStatusBadge = useMemo(() => {
    const status = graphStatusQuery.data?.data?.status;
    if (!graphNovelId || !status) {
      return null;
    }
    return (
      <span
        className={cn(
          "hidden rounded-full border px-2 py-0.5 text-[10px] leading-4 md:inline-flex",
          GRAPH_STATUS_STYLES[status],
        )}
      >
        {GRAPH_STATUS_LABELS[status]}
      </span>
    );
  }, [graphNovelId, graphStatusQuery.data?.data?.status]);

  const graphReadinessBadge = useMemo(() => {
    const readiness = graphReadinessQuery.data?.data;
    if (!graphNovelId || !readiness) {
      return null;
    }

    if (readiness.ready) {
      return (
        <span className="hidden rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] leading-4 text-emerald-200 md:inline-flex">
          可分析
        </span>
      );
    }

    return (
      <span className="hidden rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] leading-4 text-amber-200 md:inline-flex">
        需配置
      </span>
    );
  }, [graphNovelId, graphReadinessQuery.data?.data]);

  const graphButtonTitle = useMemo(() => {
    if (!graphNovelId) {
      return "";
    }
    const readiness = graphReadinessQuery.data?.data;
    if (!readiness) {
      return novelGraphMatch ? "返回小说工作台" : "打开人物图谱";
    }
    if (readiness.ready) {
      return novelGraphMatch ? "返回小说工作台" : "打开人物图谱";
    }
    return readiness.issues[0]?.message || "精确图谱尚未就绪";
  }, [graphNovelId, graphReadinessQuery.data?.data, novelGraphMatch]);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      navigate("/login", { replace: true });
    }
  };

  return (
    <header className="app-navbar-surface sticky top-0 z-40 border-b px-4 backdrop-blur-2xl sm:px-6">
      <div className="mx-auto flex h-16 min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="app-shell-panel-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px]">
          <DesktopBrandMark className="h-7 w-7 shrink-0 drop-shadow-none" />
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">AI 小说创作工作台</span>
          <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
            AI Novel Production Engine
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {!isHome && showWorkspaceToggle ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarWorkspaceToggle : undefined}
            onClick={() => onWorkspaceNavModeChange?.(workspaceNavMode === "workspace" ? "project" : "workspace")}
          >
            {workspaceNavMode === "workspace" ? "项目导航" : "创作导航"}
          </Button>
        ) : null}

        {graphNovelId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            title={graphButtonTitle}
            className={cn(
              "max-w-[280px] gap-1.5",
              useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarWorkspaceToggle : undefined,
            )}
            onClick={() =>
              navigate(
                novelGraphMatch ? `/novels/${graphNovelId}/edit` : `/novels/${graphNovelId}/graph`,
              )
            }
          >
            {graphReadinessQuery.data?.data && !graphReadinessQuery.data.data.ready ? (
              <CircleAlert className="h-4 w-4 text-amber-300" />
            ) : (
              <GitBranch className="h-4 w-4" />
            )}
            <span>{novelGraphMatch ? "返回工作台" : "人物图谱"}</span>
            {graphStatusQuery.isFetching && !graphStatusQuery.data ? (
              <Loader2 className="hidden h-3.5 w-3.5 animate-spin text-muted-foreground md:inline-flex" />
            ) : null}
            {graphStatusBadge}
            {graphReadinessBadge}
          </Button>
        ) : null}

        {session ? (
          <button
            type="button"
            className="hidden min-w-0 items-end gap-1 rounded-[12px] px-3 py-2 text-right transition-colors hover:bg-white/[0.05] sm:flex sm:flex-col"
            onClick={() => navigate("/account")}
            title="打开账户中心"
          >
            <span className="max-w-[180px] truncate text-sm font-medium">{displayName}</span>
            <span className="max-w-[220px] truncate text-[11px] text-muted-foreground">{accessStatusText}</span>
          </button>
        ) : null}

        <ThemeModeSwitcher className="hidden md:flex" compact />

        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarWorkspaceToggle : undefined)}
          onClick={() => navigate("/account")}
        >
          <CircleUserRound className="mr-1.5 h-4 w-4" />
          账户中心
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarWorkspaceToggle : undefined)}
          onClick={() => navigate("/billing")}
        >
          <CreditCard className="mr-1.5 h-4 w-4" />
          套餐中心
        </Button>

        <div className={useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarModelSelector : undefined}>
          <LLMSelector compact showBadge={false} showHelperText={false} />
        </div>

        <Button type="button" size="sm" variant="ghost" onClick={handleLogout} disabled={isLoggingOut}>
          <LogOut className="mr-1.5 h-4 w-4" />
          {isLoggingOut ? "退出中..." : "退出登录"}
        </Button>
      </div>
      </div>
    </header>
  );
}
