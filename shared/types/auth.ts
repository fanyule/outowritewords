export type AuthUserRole = "admin" | "agent" | "user";
export type AuthUserStatus = "active" | "disabled";
export type SessionVerificationStatus = "fresh" | "offline_grace";

export interface AuthUser {
  id: string;
  username: string;
  nickname: string;
  role: AuthUserRole;
  status: AuthUserStatus;
  phone: string;
  phone_verified_at: string | null;
  referral_code?: string;
  referred_by_user_id?: string | null;
  access_start_at: string | null;
  access_end_at: string | null;
  register_source?: string;
  trial_granted_at?: string | null;
  last_paid_at?: string | null;
  last_login_at?: string | null;
  last_login_ip?: string;
  can_customize_brand?: boolean;
  brand_name?: string;
  brand_logo_url?: string;
}

export interface LocalSessionInfo {
  sessionToken: string;
  user: AuthUser;
  lastVerifiedAt: string;
  verificationStatus: SessionVerificationStatus;
}

export interface AuthLoginRenewalDetails {
  user?: AuthUser | null;
  renewal_ticket?: string;
}

export interface AuthRegisterSettings {
  open_registration: boolean;
  trial_days: number;
  require_verification_code: boolean;
  require_image_captcha: boolean;
  require_phone_verification: boolean;
  require_device_fingerprint: boolean;
  user_login_video_url: string;
  user_login_poster_url: string;
  admin_login_video_url: string;
  admin_login_poster_url: string;
  brand_name: string;
  brand_logo_url: string;
}

export interface AuthRegisterCaptcha {
  enabled: boolean;
  captcha_token: string;
  image_data: string;
  expires_in_seconds: number;
}

export interface AuthRegisterSmsResult {
  enabled: boolean;
  expires_in_seconds?: number;
  debug_code?: string;
  message?: string;
}

export interface BillingPlan {
  id: number | string;
  code: string;
  name: string;
  months: number;
  amount_fen: number;
  amount_yuan: string;
}

export interface BillingChannelAvailability {
  code: string;
  label: string;
  enabled: boolean;
  ready: boolean;
  mode: string;
}

export interface BillingPlanCatalog {
  items: BillingPlan[];
  available_channels: BillingChannelAvailability[];
  default_channel: string;
}

export interface BillingOrderSummary {
  id: number | string;
  user_id: number | string;
  plan_code: string;
  plan_name: string;
  plan_months: number;
  channel: string;
  amount_fen: number;
  amount_yuan: string;
  status: string;
  out_trade_no: string;
  provider_trade_no: string;
  created_at: string;
  paid_at: string | null;
  expired_at: string | null;
  updated_at: string;
  payment_mode: string;
  supports_manual_complete: boolean;
}

export interface BillingPaymentInfo {
  mode: string;
  channel?: string;
  qr_text?: string;
  qr_display_text?: string;
  instructions?: string;
  expires_at?: string;
  supports_manual_complete?: boolean;
  payment_url?: string;
  payment_link?: string;
  [key: string]: unknown;
}

export interface BillingCreateOrderResult {
  order: BillingOrderSummary;
  payment: BillingPaymentInfo;
  user: AuthUser;
}

export interface BillingOrderStatusResult {
  order: BillingOrderSummary;
  user: AuthUser;
}
