import type {
  AuthLoginRenewalDetails,
  AuthRegisterCaptcha,
  AuthRegisterSettings,
  AuthRegisterSmsResult,
  AuthUser,
  BillingCreateOrderResult,
  BillingOrderStatusResult,
  BillingPlanCatalog,
} from "@ai-novel/shared/types/auth";
import type {
  AccountPayoutAccount,
  AccountReferralInfo,
  AgentBrandingUpdateResult,
  AgentCenterDashboard,
  CommerceCommissionCollection,
  CommerceCommissionOrder,
  CommerceCommissionSummary,
  CommerceOverview,
  CommerceOverviewMetric,
  CommerceTrendMetric,
  EffectiveBranding,
  ReferralRewardItem,
  ReferralRewardStats,
  UserCenterDashboard,
} from "@ai-novel/shared/types/account";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function toOptionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringValue(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function normalizeAuthUser(raw: unknown): AuthUser {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    id: String(item.id ?? ""),
    username: String(item.username ?? ""),
    nickname: String(item.nickname ?? ""),
    role: String(item.role ?? "user") as AuthUser["role"],
    status: String(item.status ?? "active") as AuthUser["status"],
    phone: String(item.phone ?? ""),
    phone_verified_at: toOptionalString(item.phone_verified_at),
    referral_code: toOptionalString(item.referral_code) ?? undefined,
    referred_by_user_id: toOptionalString(item.referred_by_user_id),
    access_start_at: toOptionalString(item.access_start_at),
    access_end_at: toOptionalString(item.access_end_at),
    register_source: toOptionalString(item.register_source) ?? undefined,
    trial_granted_at: toOptionalString(item.trial_granted_at),
    last_paid_at: toOptionalString(item.last_paid_at),
    last_login_at: toOptionalString(item.last_login_at),
    last_login_ip: toOptionalString(item.last_login_ip) ?? undefined,
    can_customize_brand: item.can_customize_brand === true,
    brand_name: toOptionalString(item.brand_name) ?? undefined,
    brand_logo_url: toOptionalString(item.brand_logo_url) ?? undefined,
  };
}

function normalizeRegisterSettings(raw: unknown): AuthRegisterSettings {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    open_registration: item.open_registration === true,
    trial_days: toNumber(item.trial_days),
    require_verification_code: item.require_verification_code === true,
    require_image_captcha: item.require_image_captcha === true,
    require_phone_verification: item.require_phone_verification === true,
    require_device_fingerprint: item.require_device_fingerprint === true,
    user_login_video_url: toStringValue(item.user_login_video_url),
    user_login_poster_url: toStringValue(item.user_login_poster_url),
    admin_login_video_url: toStringValue(item.admin_login_video_url),
    admin_login_poster_url: toStringValue(item.admin_login_poster_url),
    brand_name: toStringValue(item.brand_name),
    brand_logo_url: toStringValue(item.brand_logo_url),
  };
}

function normalizeRegisterCaptcha(raw: unknown): AuthRegisterCaptcha {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    enabled: item.enabled === true,
    captcha_token: toStringValue(item.captcha_token),
    image_data: toStringValue(item.image_data),
    expires_in_seconds: toNumber(item.expires_in_seconds),
  };
}

function normalizeRegisterSmsResult(raw: unknown): AuthRegisterSmsResult {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    enabled: item.enabled === true,
    expires_in_seconds: item.expires_in_seconds === undefined ? undefined : toNumber(item.expires_in_seconds),
    debug_code: item.debug_code === undefined ? undefined : toStringValue(item.debug_code),
    message: item.message === undefined ? undefined : toStringValue(item.message),
  };
}

function normalizeCommerceOverviewMetric(raw: unknown): CommerceOverviewMetric {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    start_at: toStringValue(item.start_at),
    end_at: toStringValue(item.end_at),
    paid_orders: toNumber(item.paid_orders),
    paid_users: toNumber(item.paid_users),
    paid_amount_fen: toNumber(item.paid_amount_fen),
    paid_amount_yuan: toStringValue(item.paid_amount_yuan, "0.00"),
    commission_rate: toNumber(item.commission_rate),
    commission_percent: toNumber(item.commission_percent),
    commission_rate_label: toStringValue(item.commission_rate_label),
    commission_fen: toNumber(item.commission_fen),
    commission_yuan: toStringValue(item.commission_yuan, "0.00"),
    settled_orders: item.settled_orders === undefined ? undefined : toNumber(item.settled_orders),
    pending_orders: item.pending_orders === undefined ? undefined : toNumber(item.pending_orders),
    settled_amount_fen: item.settled_amount_fen === undefined ? undefined : toNumber(item.settled_amount_fen),
    settled_amount_yuan: item.settled_amount_yuan === undefined ? undefined : toStringValue(item.settled_amount_yuan, "0.00"),
    pending_amount_fen: item.pending_amount_fen === undefined ? undefined : toNumber(item.pending_amount_fen),
    pending_amount_yuan: item.pending_amount_yuan === undefined ? undefined : toStringValue(item.pending_amount_yuan, "0.00"),
    settled_commission_fen: item.settled_commission_fen === undefined ? undefined : toNumber(item.settled_commission_fen),
    settled_commission_yuan: item.settled_commission_yuan === undefined ? undefined : toStringValue(item.settled_commission_yuan, "0.00"),
    pending_commission_fen: item.pending_commission_fen === undefined ? undefined : toNumber(item.pending_commission_fen),
    pending_commission_yuan: item.pending_commission_yuan === undefined ? undefined : toStringValue(item.pending_commission_yuan, "0.00"),
  };
}

function normalizeCommerceTrendMetric(raw: unknown): CommerceTrendMetric {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    key: toStringValue(item.key),
    label: toStringValue(item.label),
    ...normalizeCommerceOverviewMetric(item),
  };
}

function normalizeCommerceOverview(raw: unknown): CommerceOverview {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const dailyTrend = Array.isArray(item.daily_trend) ? item.daily_trend : [];
  const monthlyTrend = Array.isArray(item.monthly_trend) ? item.monthly_trend : [];
  return {
    today: normalizeCommerceOverviewMetric(item.today),
    current_month: normalizeCommerceOverviewMetric(item.current_month),
    daily_trend: dailyTrend.map((trend) => normalizeCommerceTrendMetric(trend)),
    monthly_trend: monthlyTrend.map((trend) => normalizeCommerceTrendMetric(trend)),
  };
}

function normalizeCommerceCommissionOrder(raw: unknown): CommerceCommissionOrder {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    id: toStringValue(item.id),
    order_id: toStringValue(item.order_id),
    buyer_user_id: toStringValue(item.buyer_user_id),
    buyer_username: toStringValue(item.buyer_username),
    buyer_nickname: toStringValue(item.buyer_nickname),
    buyer_phone: toStringValue(item.buyer_phone),
    plan_code: toStringValue(item.plan_code),
    plan_name: toStringValue(item.plan_name),
    plan_months: toNumber(item.plan_months),
    channel: toStringValue(item.channel),
    amount_fen: toNumber(item.amount_fen),
    amount_yuan: toStringValue(item.amount_yuan, "0.00"),
    commission_rate: toNumber(item.commission_rate),
    commission_percent: toNumber(item.commission_percent),
    commission_rate_label: toStringValue(item.commission_rate_label),
    commission_fen: toNumber(item.commission_fen),
    commission_yuan: toStringValue(item.commission_yuan, "0.00"),
    out_trade_no: toStringValue(item.out_trade_no),
    provider_trade_no: toStringValue(item.provider_trade_no),
    paid_at: toStringValue(item.paid_at),
    created_at: toStringValue(item.created_at),
    inviter_user_id: item.inviter_user_id === undefined ? undefined : toStringValue(item.inviter_user_id),
    inviter_username: item.inviter_username === undefined ? undefined : toStringValue(item.inviter_username),
    inviter_nickname: item.inviter_nickname === undefined ? undefined : toStringValue(item.inviter_nickname),
    agent_user_id: item.agent_user_id === undefined ? undefined : toStringValue(item.agent_user_id),
    agent_username: item.agent_username === undefined ? undefined : toStringValue(item.agent_username),
    agent_nickname: item.agent_nickname === undefined ? undefined : toStringValue(item.agent_nickname),
    settlement_status: item.settlement_status === undefined ? undefined : toStringValue(item.settlement_status),
    settlement_status_label: item.settlement_status_label === undefined ? undefined : toStringValue(item.settlement_status_label),
    settlement_note: item.settlement_note === undefined ? undefined : toStringValue(item.settlement_note),
    settled_at: item.settled_at === undefined ? undefined : toStringValue(item.settled_at),
    settled_by: item.settled_by === undefined ? undefined : toStringValue(item.settled_by),
  };
}

function normalizeCommerceCommissionSummary(raw: unknown): CommerceCommissionSummary {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    paid_orders: toNumber(item.paid_orders),
    paid_users: toNumber(item.paid_users),
    total_invited_users: toNumber(item.total_invited_users),
    paid_amount_fen: toNumber(item.paid_amount_fen),
    paid_amount_yuan: toStringValue(item.paid_amount_yuan, "0.00"),
    commission_rate: toNumber(item.commission_rate),
    commission_percent: toNumber(item.commission_percent),
    commission_rate_label: toStringValue(item.commission_rate_label),
    commission_fen: toNumber(item.commission_fen),
    commission_yuan: toStringValue(item.commission_yuan, "0.00"),
    agents: item.agents === undefined ? undefined : toNumber(item.agents),
    settled_orders: item.settled_orders === undefined ? undefined : toNumber(item.settled_orders),
    pending_orders: item.pending_orders === undefined ? undefined : toNumber(item.pending_orders),
    settled_amount_fen: item.settled_amount_fen === undefined ? undefined : toNumber(item.settled_amount_fen),
    settled_amount_yuan: item.settled_amount_yuan === undefined ? undefined : toStringValue(item.settled_amount_yuan, "0.00"),
    pending_amount_fen: item.pending_amount_fen === undefined ? undefined : toNumber(item.pending_amount_fen),
    pending_amount_yuan: item.pending_amount_yuan === undefined ? undefined : toStringValue(item.pending_amount_yuan, "0.00"),
    settled_commission_fen: item.settled_commission_fen === undefined ? undefined : toNumber(item.settled_commission_fen),
    settled_commission_yuan: item.settled_commission_yuan === undefined ? undefined : toStringValue(item.settled_commission_yuan, "0.00"),
    pending_commission_fen: item.pending_commission_fen === undefined ? undefined : toNumber(item.pending_commission_fen),
    pending_commission_yuan: item.pending_commission_yuan === undefined ? undefined : toStringValue(item.pending_commission_yuan, "0.00"),
  };
}

function normalizeCommerceCommissionCollection(raw: unknown): CommerceCommissionCollection {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const list = Array.isArray(item.items) ? item.items : [];
  const pagination = item.pagination && typeof item.pagination === "object"
    ? item.pagination as Record<string, unknown>
    : {};
  return {
    items: list.map((entry) => normalizeCommerceCommissionOrder(entry)),
    pagination: {
      page: toNumber(pagination.page, 1),
      page_size: toNumber(pagination.page_size, 10),
      total: toNumber(pagination.total),
      total_pages: toNumber(pagination.total_pages),
    },
    summary: normalizeCommerceCommissionSummary(item.summary),
  };
}

function normalizeReferralRewardStats(raw: unknown): ReferralRewardStats {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    rewarded_count: toNumber(item.rewarded_count),
    total_reward_days: toNumber(item.total_reward_days),
  };
}

function normalizeReferralRewardItem(raw: unknown): ReferralRewardItem {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    id: toStringValue(item.id),
    reward_days: toNumber(item.reward_days),
    invitee_username: toStringValue(item.invitee_username),
    invitee_nickname: toStringValue(item.invitee_nickname),
    status: toStringValue(item.status),
    created_at: toStringValue(item.created_at),
    rewarded_at: toStringValue(item.rewarded_at),
  };
}

function normalizeEffectiveBranding(raw: unknown): EffectiveBranding {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    brand_name: toStringValue(item.brand_name),
    brand_logo_url: toStringValue(item.brand_logo_url),
    source: toStringValue(item.source, "global"),
    owner_user_id: item.owner_user_id === undefined || item.owner_user_id === null
      ? null
      : toNumber(item.owner_user_id),
    can_customize_brand: item.can_customize_brand === true,
  };
}

function normalizeAccountReferralInfo(raw: unknown): AccountReferralInfo {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rewardItems = Array.isArray(item.items) ? item.items : [];
  return {
    referral_code: toStringValue(item.referral_code),
    share_url: toStringValue(item.share_url),
    installer_url: toStringValue(item.installer_url),
    reward_days: item.reward_days === undefined ? undefined : toNumber(item.reward_days),
    stats: item.stats === undefined ? undefined : normalizeReferralRewardStats(item.stats),
    items: rewardItems.map((entry) => normalizeReferralRewardItem(entry)),
    effective_branding: item.effective_branding === undefined || item.effective_branding === null
      ? null
      : normalizeEffectiveBranding(item.effective_branding),
  };
}

function normalizeAccountPayoutAccount(raw: unknown): AccountPayoutAccount {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    id: toNumber(item.id),
    user_id: toNumber(item.user_id),
    role: toStringValue(item.role) as AccountPayoutAccount["role"],
    channel: toStringValue(item.channel),
    account_name: toStringValue(item.account_name),
    alipay_account: toStringValue(item.alipay_account),
    masked_alipay_account: toStringValue(item.masked_alipay_account),
    account_status: toStringValue(item.account_status),
    account_status_label: toStringValue(item.account_status_label),
    authorized_at: toStringValue(item.authorized_at),
    verified_at: toStringValue(item.verified_at),
    last_error: toStringValue(item.last_error),
    ready_for_payout: item.ready_for_payout === true,
    created_at: toStringValue(item.created_at),
    updated_at: toStringValue(item.updated_at),
  };
}

function normalizeUserCenterDashboard(raw: unknown): UserCenterDashboard {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    current_user: normalizeAuthUser(item.current_user),
    referral: normalizeAccountReferralInfo(item.referral),
    overview: normalizeCommerceOverview(item.overview),
    commissions: normalizeCommerceCommissionCollection(item.commissions),
  };
}

function normalizeAgentCenterDashboard(raw: unknown): AgentCenterDashboard {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    current_user: normalizeAuthUser(item.current_user),
    referral: normalizeAccountReferralInfo(item.referral),
    overview: normalizeCommerceOverview(item.overview),
    commissions: normalizeCommerceCommissionCollection(item.commissions),
  };
}

export class AuthCenterError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      details?: unknown;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AuthCenterError";
    this.statusCode = options?.statusCode ?? 500;
    this.code = options?.code ?? "AUTH_CENTER_ERROR";
    this.details = options?.details;
    this.retryable = options?.retryable ?? false;
  }
}

interface AuthCenterEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string | { code?: string; message?: string; details?: unknown };
  message?: string;
  details?: unknown;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  token?: string;
  query?: Record<string, string | undefined>;
}

class AuthCenterClient {
  private readonly baseUrl: string;

  constructor() {
    const configured = process.env.AI_NOVEL_AUTH_CENTER_BASE_URL?.trim()
      || process.env.AUTH_CENTER_BASE_URL?.trim()
      || "http://127.0.0.1:5681/api/v1";
    this.baseUrl = trimTrailingSlash(configured);
  }

  private buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (!value) {
        continue;
      }
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const headers = new Headers({
      Accept: "application/json",
    });

    if (options.token) {
      headers.set("Authorization", `Bearer ${options.token}`);
    }
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
      response = await fetch(this.buildUrl(path, options.query), {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      throw new AuthCenterError("云端认证中心当前不可用，请稍后重试。", {
        statusCode: 503,
        code: "AUTH_CENTER_UNAVAILABLE",
        retryable: true,
        cause: error,
      });
    }

    let payload: AuthCenterEnvelope<T> | null = null;
    try {
      payload = await response.json() as AuthCenterEnvelope<T>;
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.success === false) {
      const errorPayload = payload?.error;
      const message = typeof errorPayload === "string"
        ? errorPayload
        : errorPayload?.message
          || payload?.message
          || `云端认证中心请求失败（${response.status}）`;
      const code = typeof errorPayload === "string"
        ? payload?.message || "AUTH_CENTER_REQUEST_FAILED"
        : errorPayload?.code || payload?.message || "AUTH_CENTER_REQUEST_FAILED";
      const details = typeof errorPayload === "object" && errorPayload
        ? errorPayload.details
        : payload?.details;

      throw new AuthCenterError(message, {
        statusCode: response.status,
        code,
        details,
        retryable: response.status >= 500,
      });
    }

    if (!payload || payload.success !== true || payload.data === undefined) {
      throw new AuthCenterError("云端认证中心返回了无效响应。", {
        statusCode: 502,
        code: "AUTH_CENTER_INVALID_RESPONSE",
        retryable: true,
      });
    }

    return payload.data;
  }

  async login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const data = await this.request<{ token: string; user: unknown }>("/auth/login", {
      method: "POST",
      body: {
        username,
        password,
      },
    });

    return {
      token: String(data.token ?? ""),
      user: normalizeAuthUser(data.user),
    };
  }

  async getRegisterSettings(inviteCode?: string): Promise<AuthRegisterSettings> {
    const data = await this.request<unknown>("/auth/register-settings", {
      query: inviteCode ? { invite_code: inviteCode } : undefined,
    });
    return normalizeRegisterSettings(data);
  }

  async getRegisterCaptcha(): Promise<AuthRegisterCaptcha> {
    const data = await this.request<unknown>("/auth/register-captcha");
    return normalizeRegisterCaptcha(data);
  }

  async sendRegisterSmsCode(phone: string): Promise<AuthRegisterSmsResult> {
    const data = await this.request<unknown>("/auth/register-sms-code", {
      method: "POST",
      body: { phone },
    });
    return normalizeRegisterSmsResult(data);
  }

  async register(input: {
    username: string;
    nickname?: string;
    password: string;
    phone?: string;
    smsCode?: string;
    referralCode?: string;
    verificationCode?: string;
    captchaToken?: string;
    captchaAnswer?: string;
    deviceFingerprint?: string;
  }): Promise<{ token: string; user: AuthUser }> {
    const data = await this.request<{ token: string; user: unknown }>("/auth/register", {
      method: "POST",
      body: {
        username: input.username,
        nickname: input.nickname,
        password: input.password,
        phone: input.phone,
        sms_code: input.smsCode,
        referral_code: input.referralCode,
        verification_code: input.verificationCode,
        captcha_token: input.captchaToken,
        captcha_answer: input.captchaAnswer,
        device_fingerprint: input.deviceFingerprint,
      },
    });

    return {
      token: String(data.token ?? ""),
      user: normalizeAuthUser(data.user),
    };
  }

  async getMe(token: string): Promise<AuthUser> {
    const data = await this.request<{ user: unknown }>("/auth/me", {
      token,
    });
    return normalizeAuthUser(data.user);
  }

  async listPlans(): Promise<BillingPlanCatalog> {
    return this.request<BillingPlanCatalog>("/billing/plans");
  }

  async createOrder(input: {
    token?: string;
    renewalTicket?: string;
    planCode: string;
    channel?: string;
  }): Promise<BillingCreateOrderResult> {
    const data = await this.request<{
      order: BillingCreateOrderResult["order"];
      payment: BillingCreateOrderResult["payment"];
      user: unknown;
    }>("/billing/orders", {
      method: "POST",
      token: input.token,
      body: {
        renewal_ticket: input.renewalTicket,
        plan_code: input.planCode,
        channel: input.channel,
      },
    });

    return {
      order: data.order,
      payment: data.payment,
      user: normalizeAuthUser(data.user),
    };
  }

  async getOrderStatus(input: {
    token?: string;
    renewalTicket?: string;
    orderId: string;
  }): Promise<BillingOrderStatusResult> {
    const data = await this.request<{
      order: BillingOrderStatusResult["order"];
      user: unknown;
    }>(`/billing/orders/${encodeURIComponent(input.orderId)}/status`, {
      token: input.token,
      query: {
        renewal_ticket: input.renewalTicket,
      },
    });

    return {
      order: data.order,
      user: normalizeAuthUser(data.user),
    };
  }

  async completeOrder(input: {
    token?: string;
    renewalTicket?: string;
    orderId: string;
    providerTradeNo?: string;
  }): Promise<BillingOrderStatusResult> {
    const data = await this.request<{
      order: BillingOrderStatusResult["order"];
      user: unknown;
    }>(`/billing/orders/${encodeURIComponent(input.orderId)}/complete`, {
      method: "POST",
      token: input.token,
      body: {
        renewal_ticket: input.renewalTicket,
        provider_trade_no: input.providerTradeNo,
      },
    });

    return {
      order: data.order,
      user: normalizeAuthUser(data.user),
    };
  }

  async getUserCenterDashboard(token: string): Promise<UserCenterDashboard> {
    const data = await this.request<unknown>("/user-center/me", {
      token,
    });
    return normalizeUserCenterDashboard(data);
  }

  async getAgentDashboard(token: string): Promise<AgentCenterDashboard> {
    const data = await this.request<unknown>("/agent/me", {
      token,
    });
    return normalizeAgentCenterDashboard(data);
  }

  async getUserPayoutAccount(token: string): Promise<AccountPayoutAccount> {
    const data = await this.request<{ account: unknown }>("/user-center/payout-account", {
      token,
    });
    return normalizeAccountPayoutAccount(data.account);
  }

  async updateUserPayoutAccount(input: {
    token: string;
    accountName: string;
    alipayAccount: string;
  }): Promise<AccountPayoutAccount> {
    const data = await this.request<{ account: unknown }>("/user-center/payout-account", {
      method: "PUT",
      token: input.token,
      body: {
        account_name: input.accountName,
        alipay_account: input.alipayAccount,
      },
    });
    return normalizeAccountPayoutAccount(data.account);
  }

  async getAgentPayoutAccount(token: string): Promise<AccountPayoutAccount> {
    const data = await this.request<{ account: unknown }>("/agent/payout-account", {
      token,
    });
    return normalizeAccountPayoutAccount(data.account);
  }

  async updateAgentPayoutAccount(input: {
    token: string;
    accountName: string;
    alipayAccount: string;
  }): Promise<AccountPayoutAccount> {
    const data = await this.request<{ account: unknown }>("/agent/payout-account", {
      method: "PUT",
      token: input.token,
      body: {
        account_name: input.accountName,
        alipay_account: input.alipayAccount,
      },
    });
    return normalizeAccountPayoutAccount(data.account);
  }

  async updateAgentBranding(input: {
    token: string;
    brandName: string;
    brandLogoUrl: string;
  }): Promise<AgentBrandingUpdateResult> {
    const data = await this.request<{
      current_user: unknown;
      effective_branding: unknown;
    }>("/agent/branding", {
      method: "PUT",
      token: input.token,
      body: {
        brand_name: input.brandName,
        brand_logo_url: input.brandLogoUrl,
      },
    });

    return {
      current_user: normalizeAuthUser(data.current_user),
      effective_branding: normalizeEffectiveBranding(data.effective_branding),
    };
  }

  isRenewalDetails(value: unknown): value is AuthLoginRenewalDetails {
    if (!value || typeof value !== "object") {
      return false;
    }
    return "renewal_ticket" in value || "user" in value;
  }
}

export const authCenterClient = new AuthCenterClient();
export { normalizeAuthUser };
