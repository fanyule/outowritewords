import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  BillingChannelAvailability,
  BillingCreateOrderResult,
  BillingOrderStatusResult,
  BillingPlan,
} from "@ai-novel/shared/types/auth";
import { Link, useSearchParams } from "react-router-dom";
import {
  completeBillingOrder,
  createBillingOrder,
  getBillingOrderStatus,
  listBillingPlans,
} from "@/api/billing";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

function formatPlanAmount(plan: BillingPlan): string {
  return `¥${plan.amount_yuan}`;
}

function resolveChannelLabel(channel: BillingChannelAvailability | null): string {
  return channel?.label ?? "支付渠道";
}

export default function BillingPage() {
  const [searchParams] = useSearchParams();
  const renewalTicket = searchParams.get("renewalTicket") ?? undefined;
  const session = useAuthStore((state) => state.session);
  const authStatus = useAuthStore((state) => state.status);
  const refreshSession = useAuthStore((state) => state.refreshSession);
  const isAuthenticated = authStatus === "authenticated" && Boolean(session?.sessionToken);
  const [selectedPlanCode, setSelectedPlanCode] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [orderState, setOrderState] = useState<BillingCreateOrderResult | BillingOrderStatusResult | null>(null);
  const [paymentState, setPaymentState] = useState<BillingCreateOrderResult["payment"] | null>(null);

  const plansQuery = useQuery({
    queryKey: queryKeys.billing.plans,
    queryFn: listBillingPlans,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!plansQuery.data) {
      return;
    }

    if (!selectedPlanCode && plansQuery.data.items.length > 0) {
      setSelectedPlanCode(plansQuery.data.items[0].code);
    }

    if (!selectedChannel) {
      setSelectedChannel(plansQuery.data.default_channel || plansQuery.data.available_channels[0]?.code || "");
    }
  }, [plansQuery.data, selectedChannel, selectedPlanCode]);

  const selectedPlan = useMemo(
    () => plansQuery.data?.items.find((item) => item.code === selectedPlanCode) ?? null,
    [plansQuery.data?.items, selectedPlanCode],
  );

  const selectedChannelMeta = useMemo(
    () => plansQuery.data?.available_channels.find((item) => item.code === selectedChannel) ?? null,
    [plansQuery.data?.available_channels, selectedChannel],
  );

  const createOrderMutation = useMutation({
    mutationFn: () => createBillingOrder({
      planCode: selectedPlanCode,
      channel: selectedChannel || undefined,
      renewalTicket,
    }),
    onSuccess: (data) => {
      setOrderState(data);
      setPaymentState(data.payment);
      toast.success("订单已创建，请按页面指引完成支付。");
    },
  });

  const completeOrderMutation = useMutation({
    mutationFn: () => {
      const currentOrderId = orderState?.order.id;
      if (!currentOrderId) {
        throw new Error("当前没有可完成的订单。");
      }
      return completeBillingOrder({
        orderId: String(currentOrderId),
        renewalTicket,
      });
    },
    onSuccess: async (data) => {
      setOrderState(data);
      if (isAuthenticated) {
        await refreshSession();
      }
      toast.success("支付状态已更新。");
    },
  });

  const orderStatusQuery = useQuery({
    queryKey: queryKeys.billing.orderStatus(
      orderState?.order.id ? String(orderState.order.id) : "idle",
      renewalTicket ?? "session",
    ),
    queryFn: () => getBillingOrderStatus({
      orderId: String(orderState?.order.id),
      renewalTicket,
    }),
    enabled: Boolean(orderState?.order.id),
    refetchInterval: (query) => {
      const status = query.state.data?.order.status ?? orderState?.order.status;
      return status === "pending" ? 5000 : false;
    },
  });

  useEffect(() => {
    if (!orderStatusQuery.data) {
      return;
    }
    setOrderState(orderStatusQuery.data);
    if (orderStatusQuery.data.order.status === "paid") {
      void refreshSession();
    }
  }, [orderStatusQuery.data, refreshSession]);

  const currentOrder = orderStatusQuery.data?.order ?? orderState?.order ?? null;
  const payment = paymentState;

  return (
    <div className="min-h-screen bg-muted/20 px-6 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold">套餐中心</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {renewalTicket
                ? "当前处于续费模式，支付完成后回到登录页重新进入本地创作端。"
                : isAuthenticated
                  ? "当前账号已登录，可以直接购买或续费。"
                  : "你可以先查看套餐，也可以在登录后再回来购买。"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline">
              <Link to={isAuthenticated ? "/" : "/login"}>{isAuthenticated ? "返回创作端" : "返回登录页"}</Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>当前商业状态</CardTitle>
            <CardDescription>第一阶段先把支付、续费、账号授权这条链路跑通，后续再继续扩分销和代理详情。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-background px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">登录状态</div>
              <div className="mt-2 text-lg font-semibold">
                {isAuthenticated ? `已登录：${session?.user.nickname || session?.user.username}` : "未登录 / 续费模式"}
              </div>
            </div>
            <div className="rounded-xl border bg-background px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">授权到期</div>
              <div className="mt-2 text-lg font-semibold">
                {session?.user.access_end_at ? new Date(session.user.access_end_at).toLocaleString("zh-CN") : "以云端校验为准"}
              </div>
            </div>
            <div className="rounded-xl border bg-background px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">本地会话</div>
              <div className="mt-2 text-lg font-semibold">
                {session?.verificationStatus === "offline_grace" ? "离线宽限中" : session ? "正常" : "未建立"}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>选择套餐</CardTitle>
              <CardDescription>套餐数据来自云端认证中心，后续接真实微信或支付宝时只需要改云端支付配置。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                {(plansQuery.data?.items ?? []).map((plan) => (
                  <button
                    key={plan.code}
                    type="button"
                    className={cn(
                      "rounded-2xl border px-4 py-5 text-left transition-colors",
                      selectedPlanCode === plan.code
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-primary/40",
                    )}
                    onClick={() => setSelectedPlanCode(plan.code)}
                  >
                    <div className="text-sm text-muted-foreground">{plan.months} 个月</div>
                    <div className="mt-2 text-xl font-semibold">{plan.name}</div>
                    <div className="mt-3 text-2xl font-semibold">{formatPlanAmount(plan)}</div>
                    <div className="mt-2 text-xs text-muted-foreground">代码：{plan.code}</div>
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">支付方式</div>
                <div className="flex flex-wrap gap-3">
                  {(plansQuery.data?.available_channels ?? []).map((channel) => (
                    <button
                      key={channel.code}
                      type="button"
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left",
                        selectedChannel === channel.code
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background",
                      )}
                      onClick={() => setSelectedChannel(channel.code)}
                    >
                      <div className="font-medium">{channel.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {channel.ready ? channel.mode : `${channel.mode}（当前为降级模式）`}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={!selectedPlan || !selectedChannel || createOrderMutation.isPending}
                  onClick={() => void createOrderMutation.mutateAsync()}
                >
                  {createOrderMutation.isPending ? "正在创建订单..." : `购买 ${selectedPlan?.name ?? "当前套餐"}`}
                </Button>
                <div className="text-sm text-muted-foreground">
                  当前支付渠道：{resolveChannelLabel(selectedChannelMeta)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>支付状态</CardTitle>
              <CardDescription>这里会显示订单、二维码文案和支付结果。如果云端仍处于 mock 模式，可直接模拟完成支付。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentOrder ? (
                <>
                  <div className="rounded-xl border bg-background px-4 py-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">订单号</div>
                    <div className="mt-2 break-all font-mono text-sm">{currentOrder.out_trade_no}</div>
                    <div className="mt-3 text-sm text-muted-foreground">状态：{currentOrder.status}</div>
                    <div className="mt-1 text-sm text-muted-foreground">金额：¥{currentOrder.amount_yuan}</div>
                  </div>

                  {payment ? (
                    <div className="rounded-xl border bg-background px-4 py-4">
                      <div className="font-medium">{payment.qr_display_text || "支付指引"}</div>
                      {payment.instructions ? (
                        <div className="mt-2 text-sm text-muted-foreground">{payment.instructions}</div>
                      ) : null}
                      {payment.qr_text ? (
                        <pre className="mt-3 overflow-x-auto rounded-lg bg-muted px-3 py-3 text-xs">
                          {payment.qr_text}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={orderStatusQuery.isFetching || !currentOrder}
                      onClick={() => void orderStatusQuery.refetch()}
                    >
                      {orderStatusQuery.isFetching ? "正在查询..." : "刷新订单状态"}
                    </Button>
                    {payment?.supports_manual_complete && currentOrder.status === "pending" ? (
                      <Button
                        type="button"
                        disabled={completeOrderMutation.isPending}
                        onClick={() => void completeOrderMutation.mutateAsync()}
                      >
                        {completeOrderMutation.isPending ? "正在确认..." : "我已完成支付"}
                      </Button>
                    ) : null}
                  </div>

                  {currentOrder.status === "paid" ? (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4 text-sm">
                      {isAuthenticated
                        ? "支付成功，当前本地会话已经尝试刷新云端授权。"
                        : "支付成功，请返回登录页重新进入本地创作端。"}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-xl border border-dashed bg-background px-4 py-8 text-sm text-muted-foreground">
                  订单创建后，这里会显示支付信息和实时状态。
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
