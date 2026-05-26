import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AccountCenterKind,
  AccountCenterSnapshot,
  CommerceCommissionOrder,
  CommerceCommissionSummary,
  EffectiveBranding,
} from "@ai-novel/shared/types/account";
import { Copy, CreditCard, Gift, Landmark, Palette, RefreshCw, ShieldCheck, Users } from "lucide-react";
import {
  getAccountCenterSnapshot,
  updateAccountPayoutAccount,
  updateAgentBranding,
} from "@/api/account";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useAuthStore } from "@/store/authStore";

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "未设置";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: string | number | undefined): string {
  const amount = typeof value === "number" ? value.toFixed(2) : value ?? "0.00";
  return `¥${amount}`;
}

function roleLabel(kind: AccountCenterKind): string {
  if (kind === "agent") {
    return "代理账号";
  }
  if (kind === "admin") {
    return "管理员";
  }
  return "普通用户";
}

function AccountStatCard(props: {
  title: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
}) {
  const { title, value, hint, icon: Icon } = props;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 shadow-[0_16px_36px_rgba(4,10,24,0.16)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{hint}</div>
    </div>
  );
}

function CommissionSummaryGrid(props: {
  summary: CommerceCommissionSummary;
  kind: AccountCenterKind;
}) {
  const { summary, kind } = props;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <AccountStatCard
        title="本月分佣"
        value={formatMoney(summary.commission_yuan)}
        hint={`费率 ${summary.commission_rate_label}`}
        icon={Gift}
      />
      <AccountStatCard
        title="本月订单"
        value={String(summary.paid_orders)}
        hint={`成交金额 ${formatMoney(summary.paid_amount_yuan)}`}
        icon={CreditCard}
      />
      <AccountStatCard
        title={kind === "agent" ? "代理邀请用户" : "邀请用户"}
        value={String(summary.total_invited_users)}
        hint={`付费用户 ${summary.paid_users}`}
        icon={Users}
      />
      <AccountStatCard
        title={kind === "agent" ? "待结算分佣" : "累计分佣"}
        value={formatMoney(kind === "agent" ? summary.pending_commission_yuan : summary.commission_yuan)}
        hint={
          kind === "agent"
            ? `已结算 ${formatMoney(summary.settled_commission_yuan)}`
            : `累计订单 ${summary.paid_orders}`
        }
        icon={Landmark}
      />
    </div>
  );
}

function RecentCommissionList(props: {
  items: CommerceCommissionOrder[];
  kind: AccountCenterKind;
}) {
  const { items, kind } = props;
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-sm text-muted-foreground">
        还没有可展示的分佣记录。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={String(item.order_id)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-medium">
                {item.buyer_nickname || item.buyer_username || "匿名用户"} 购买了 {item.plan_name}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {kind === "agent"
                  ? `分佣 ${formatMoney(item.commission_yuan)}，状态 ${item.settlement_status_label || "待结算"}`
                  : `分佣 ${formatMoney(item.commission_yuan)}，支付渠道 ${item.channel || "未记录"}`}
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <div>{formatDateTime(item.paid_at || item.created_at)}</div>
              <div className="mt-1 font-mono text-xs">{item.out_trade_no}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AccountCenterPage() {
  const queryClient = useQueryClient();
  const session = useAuthStore((state) => state.session);
  const refreshSession = useAuthStore((state) => state.refreshSession);
  const [accountName, setAccountName] = useState("");
  const [alipayAccount, setAlipayAccount] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");

  const centerQuery = useQuery({
    queryKey: queryKeys.account.center,
    queryFn: getAccountCenterSnapshot,
    staleTime: 30_000,
  });

  const snapshot = centerQuery.data ?? null;
  const payoutAccount = snapshot?.payout_account ?? null;
  const dashboard = snapshot?.dashboard;
  const referral = dashboard?.referral;
  const summary = dashboard?.commissions.summary;
  const commissionItems = dashboard?.commissions.items.slice(0, 5) ?? [];
  const effectiveBranding = useMemo<EffectiveBranding | null>(() => {
    if (snapshot?.kind !== "agent") {
      return null;
    }
    return dashboard?.referral.effective_branding ?? null;
  }, [dashboard, snapshot?.kind]);

  useEffect(() => {
    if (!payoutAccount) {
      return;
    }
    setAccountName(payoutAccount.account_name ?? "");
    setAlipayAccount(payoutAccount.alipay_account ?? "");
  }, [payoutAccount]);

  useEffect(() => {
    if (snapshot?.kind !== "agent") {
      setBrandName("");
      setBrandLogoUrl("");
      return;
    }
    setBrandName(snapshot.current_user.brand_name ?? "");
    setBrandLogoUrl(snapshot.current_user.brand_logo_url ?? "");
  }, [snapshot]);

  const payoutMutation = useMutation({
    mutationFn: () => updateAccountPayoutAccount({
      accountName,
      alipayAccount,
    }),
    onSuccess: async (account) => {
      queryClient.setQueryData<AccountCenterSnapshot | undefined>(queryKeys.account.center, (current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          payout_account: account,
        };
      });
      toast.success("收款账号已保存，等待云端审核或确认。");
    },
  });

  const brandingMutation = useMutation({
    mutationFn: () => updateAgentBranding({
      brandName,
      brandLogoUrl,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.account.center }),
        refreshSession(),
      ]);
      toast.success("代理品牌信息已同步。");
    },
  });

  const handleCopy = async (label: string, value: string | undefined) => {
    if (!value) {
      toast.error(`${label} 为空，暂时没有可复制的内容。`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} 已复制。`);
    } catch {
      toast.error(`复制 ${label} 失败，请手动复制。`);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="app-page-header p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">账户中心</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            这里汇总本地创作端和云端认证中心的账号、授权、邀请、分佣和代理品牌信息。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void centerQuery.refetch()}
          disabled={centerQuery.isFetching}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {centerQuery.isFetching ? "同步中..." : "刷新同步"}
        </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>账户状态</CardTitle>
          <CardDescription>本地会话负责拦截权限，云端认证中心负责账号、授权和商业身份。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AccountStatCard
            title="账号角色"
            value={roleLabel(snapshot?.kind ?? "user")}
            hint={snapshot?.current_user.nickname || snapshot?.current_user.username || "未登录"}
            icon={ShieldCheck}
          />
          <AccountStatCard
            title="授权到期"
            value={snapshot?.current_user.access_end_at ? formatDateTime(snapshot.current_user.access_end_at) : "长期有效"}
            hint="云端校验结果"
            icon={CreditCard}
          />
          <AccountStatCard
            title="本地会话"
            value={
              session?.verificationStatus === "offline_grace"
                ? "离线宽限"
                : session?.sessionToken
                  ? "正常"
                  : "未建立"
            }
            hint={`最近校验 ${formatDateTime(session?.lastVerifiedAt)}`}
            icon={RefreshCw}
          />
          <AccountStatCard
            title="手机号"
            value={snapshot?.current_user.phone || "未绑定"}
            hint={`最后登录 ${formatDateTime(snapshot?.current_user.last_login_at)}`}
            icon={Users}
          />
        </CardContent>
      </Card>

      {snapshot?.kind === "admin" ? (
        <Card>
          <CardHeader>
            <CardTitle>管理员说明</CardTitle>
            <CardDescription>管理员后台能力还没有本地化，当前桌面端先聚焦创作、付费和代理用户的常用操作。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            当前登录的是管理员账号。本地端已经识别到管理员身份，但详细的用户管理、结算审核、支付配置和后台统计建议继续保留在云端中台处理。
          </CardContent>
        </Card>
      ) : null}

      {!dashboard && snapshot?.kind !== "admin" ? (
        <Card>
          <CardHeader>
            <CardTitle>云端摘要暂不可用</CardTitle>
            <CardDescription>云端认证中心当前没有返回商业摘要，页面仍保留本地账户状态。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            这通常发生在云端暂时不可用但本地会话仍处于离线宽限期的时候。写作功能仍能按本地授权继续运行，但分佣、邀请、提现和代理品牌等信息需要云端恢复后再同步。
          </CardContent>
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>商业摘要</CardTitle>
            <CardDescription>
              {snapshot?.kind === "agent"
                ? "这里展示代理邀请、订单和结算摘要。"
                : "这里展示用户邀请奖励和分佣摘要。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CommissionSummaryGrid summary={summary} kind={snapshot?.kind ?? "user"} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>邀请与分销</CardTitle>
            <CardDescription>邀请码、分享链接和安装包下载入口都来自云端认证中心。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">邀请码</div>
                <div className="mt-2 text-xl font-semibold">{referral?.referral_code || "未生成"}</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void handleCopy("邀请码", referral?.referral_code)}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  复制邀请码
                </Button>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">邀请奖励</div>
                <div className="mt-2 text-xl font-semibold">
                  {referral?.stats ? `${referral.stats.rewarded_count} 人 / ${referral.stats.total_reward_days} 天` : "暂无数据"}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {snapshot?.kind === "agent"
                    ? "代理侧重点是邀请归属和品牌传播。"
                    : `当前邀请奖励 ${referral?.reward_days ?? 0} 天使用时长。`}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4">
              <div className="text-sm font-medium">分享链接</div>
              <div className="mt-2 break-all text-sm text-muted-foreground">{referral?.share_url || "暂无分享链接"}</div>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopy("分享链接", referral?.share_url)}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  复制分享链接
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopy("安装包链接", referral?.installer_url)}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  复制安装包链接
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>收款账号</CardTitle>
            <CardDescription>提现和结算仍由云端审核，本地这里先处理资料提交和状态查看。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={payoutAccount?.ready_for_payout ? "secondary" : "outline"}>
                {payoutAccount?.account_status_label || "待配置"}
              </Badge>
              {payoutAccount?.masked_alipay_account ? (
                <span className="text-sm text-muted-foreground">{payoutAccount.masked_alipay_account}</span>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="account-name">
                收款人姓名
              </label>
              <Input
                id="account-name"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="请输入真实姓名"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="alipay-account">
                支付宝账号
              </label>
              <Input
                id="alipay-account"
                value={alipayAccount}
                onChange={(event) => setAlipayAccount(event.target.value)}
                placeholder="请输入用于收款的支付宝账号"
              />
            </div>

            <div className="text-xs text-muted-foreground">
              最近授权 {formatDateTime(payoutAccount?.authorized_at)}，最近审核 {formatDateTime(payoutAccount?.verified_at)}
            </div>
            {payoutAccount?.last_error ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                {payoutAccount.last_error}
              </div>
            ) : null}

            <Button
              type="button"
              disabled={payoutMutation.isPending}
              onClick={() => void payoutMutation.mutateAsync()}
            >
              {payoutMutation.isPending ? "保存中..." : "保存收款账号"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {snapshot?.kind === "agent" ? (
        <Card>
          <CardHeader>
            <CardTitle>代理品牌</CardTitle>
            <CardDescription>当前代理可把品牌名称和 Logo 配到云端授权体系里，后面桌面端、下载页和邀请页都能复用。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={effectiveBranding?.can_customize_brand ? "secondary" : "outline"}>
                  {effectiveBranding?.source === "agent" ? "代理品牌" : "全局品牌"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  当前展示：{effectiveBranding?.brand_name || "未命名品牌"}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="brand-name">
                  品牌名称
                </label>
                <Input
                  id="brand-name"
                  value={brandName}
                  onChange={(event) => setBrandName(event.target.value)}
                  placeholder="请输入代理品牌名称"
                  disabled={!snapshot.current_user.can_customize_brand}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="brand-logo-url">
                  Logo 地址或数据
                </label>
                <Input
                  id="brand-logo-url"
                  value={brandLogoUrl}
                  onChange={(event) => setBrandLogoUrl(event.target.value)}
                  placeholder="可填图片 URL 或 data URL"
                  disabled={!snapshot.current_user.can_customize_brand}
                />
              </div>

              <Button
                type="button"
                disabled={!snapshot.current_user.can_customize_brand || brandingMutation.isPending}
                onClick={() => void brandingMutation.mutateAsync()}
              >
                <Palette className="mr-1.5 h-4 w-4" />
                {brandingMutation.isPending ? "同步中..." : "同步品牌设置"}
              </Button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-5 shadow-[0_18px_36px_rgba(4,10,24,0.16)]">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">品牌预览摘要</div>
              <div className="mt-3 text-2xl font-semibold">{effectiveBranding?.brand_name || "未命名品牌"}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                来源：{effectiveBranding?.source === "agent" ? "代理自定义" : "平台默认"}
              </div>
              <div className="mt-4 break-all text-sm text-muted-foreground">
                Logo：{effectiveBranding?.brand_logo_url || "暂未设置"}
              </div>
              {!snapshot.current_user.can_customize_brand ? (
                <div className="mt-4 rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
                  当前代理账号还没有开放品牌自定义权限，需要在云端后台开启。
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>最近分佣记录</CardTitle>
            <CardDescription>
              {snapshot?.kind === "agent"
                ? "这里优先展示代理近期的结算记录。"
                : "这里优先展示你最近带来的付费订单。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentCommissionList items={commissionItems} kind={snapshot?.kind ?? "user"} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
