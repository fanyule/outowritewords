import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export default function RequireAuth() {
  const location = useLocation();
  const initialized = useAuthStore((state) => state.initialized);
  const status = useAuthStore((state) => state.status);

  if (!initialized || status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm rounded-2xl border bg-card px-6 py-8 text-center shadow-sm">
          <div className="text-lg font-semibold">正在校验本地登录状态</div>
          <div className="mt-2 text-sm text-muted-foreground">
            我们正在恢复本地会话并同步云端授权，请稍候。
          </div>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}`,
        }}
      />
    );
  }

  return <Outlet />;
}
