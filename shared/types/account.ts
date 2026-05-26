import type { AuthUser } from "./auth";

export type AccountCenterKind = "user" | "agent" | "admin";

export interface CommerceOverviewMetric {
  start_at: string;
  end_at: string;
  paid_orders: number;
  paid_users: number;
  paid_amount_fen: number;
  paid_amount_yuan: string;
  commission_rate: number;
  commission_percent: number;
  commission_rate_label: string;
  commission_fen: number;
  commission_yuan: string;
  settled_orders?: number;
  pending_orders?: number;
  settled_amount_fen?: number;
  settled_amount_yuan?: string;
  pending_amount_fen?: number;
  pending_amount_yuan?: string;
  settled_commission_fen?: number;
  settled_commission_yuan?: string;
  pending_commission_fen?: number;
  pending_commission_yuan?: string;
}

export interface CommerceTrendMetric extends CommerceOverviewMetric {
  key: string;
  label: string;
}

export interface CommerceOverview {
  today: CommerceOverviewMetric;
  current_month: CommerceOverviewMetric;
  daily_trend: CommerceTrendMetric[];
  monthly_trend: CommerceTrendMetric[];
}

export interface CommercePagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface CommerceCommissionOrder {
  id: number | string;
  order_id: number | string;
  buyer_user_id: number | string;
  buyer_username: string;
  buyer_nickname: string;
  buyer_phone: string;
  plan_code: string;
  plan_name: string;
  plan_months: number;
  channel: string;
  amount_fen: number;
  amount_yuan: string;
  commission_rate: number;
  commission_percent: number;
  commission_rate_label: string;
  commission_fen: number;
  commission_yuan: string;
  out_trade_no: string;
  provider_trade_no: string;
  paid_at: string;
  created_at: string;
  inviter_user_id?: number | string;
  inviter_username?: string;
  inviter_nickname?: string;
  agent_user_id?: number | string;
  agent_username?: string;
  agent_nickname?: string;
  settlement_status?: string;
  settlement_status_label?: string;
  settlement_note?: string;
  settled_at?: string;
  settled_by?: string;
}

export interface CommerceCommissionSummary {
  paid_orders: number;
  paid_users: number;
  total_invited_users: number;
  paid_amount_fen: number;
  paid_amount_yuan: string;
  commission_rate: number;
  commission_percent: number;
  commission_rate_label: string;
  commission_fen: number;
  commission_yuan: string;
  agents?: number;
  settled_orders?: number;
  pending_orders?: number;
  settled_amount_fen?: number;
  settled_amount_yuan?: string;
  pending_amount_fen?: number;
  pending_amount_yuan?: string;
  settled_commission_fen?: number;
  settled_commission_yuan?: string;
  pending_commission_fen?: number;
  pending_commission_yuan?: string;
}

export interface CommerceCommissionCollection {
  items: CommerceCommissionOrder[];
  pagination: CommercePagination;
  summary: CommerceCommissionSummary;
}

export interface ReferralRewardStats {
  rewarded_count: number;
  total_reward_days: number;
}

export interface ReferralRewardItem {
  id: number | string;
  reward_days: number;
  invitee_username: string;
  invitee_nickname: string;
  status: string;
  created_at: string;
  rewarded_at: string;
}

export interface EffectiveBranding {
  brand_name: string;
  brand_logo_url: string;
  source: string;
  owner_user_id: number | null;
  can_customize_brand: boolean;
}

export interface AccountReferralInfo {
  referral_code: string;
  share_url: string;
  installer_url: string;
  reward_days?: number;
  stats?: ReferralRewardStats;
  items?: ReferralRewardItem[];
  effective_branding?: EffectiveBranding | null;
}

export interface AccountPayoutAccount {
  id: number;
  user_id: number;
  role: "agent" | "user" | "";
  channel: string;
  account_name: string;
  alipay_account: string;
  masked_alipay_account: string;
  account_status: string;
  account_status_label: string;
  authorized_at: string;
  verified_at: string;
  last_error: string;
  ready_for_payout: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCenterDashboard {
  current_user: AuthUser;
  referral: AccountReferralInfo;
  overview: CommerceOverview;
  commissions: CommerceCommissionCollection;
}

export interface AgentCenterDashboard {
  current_user: AuthUser;
  referral: AccountReferralInfo;
  overview: CommerceOverview;
  commissions: CommerceCommissionCollection;
}

export interface AccountCenterSnapshot {
  kind: AccountCenterKind;
  current_user: AuthUser;
  dashboard: UserCenterDashboard | AgentCenterDashboard | null;
  payout_account: AccountPayoutAccount | null;
}

export interface AgentBrandingUpdateResult {
  current_user: AuthUser;
  effective_branding: EffectiveBranding;
}
