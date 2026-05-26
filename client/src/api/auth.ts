import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  AuthRegisterCaptcha,
  AuthRegisterSettings,
  AuthRegisterSmsResult,
  LocalSessionInfo,
} from "@ai-novel/shared/types/auth";
import { apiClient } from "./client";

interface SessionEnvelope {
  session: LocalSessionInfo;
}

export interface RegisterWithPasswordInput {
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
}

export async function getRegisterSettings(inviteCode?: string): Promise<AuthRegisterSettings> {
  const response = await apiClient.get<ApiResponse<AuthRegisterSettings>>("/auth/register-settings", {
    params: inviteCode ? { invite_code: inviteCode } : undefined,
    silentErrorStatuses: [400, 403],
  });
  return response.data.data as AuthRegisterSettings;
}

export async function getRegisterCaptcha(): Promise<AuthRegisterCaptcha> {
  const response = await apiClient.get<ApiResponse<AuthRegisterCaptcha>>("/auth/register-captcha", {
    silentErrorStatuses: [400, 403],
  });
  return response.data.data as AuthRegisterCaptcha;
}

export async function sendRegisterSmsCode(phone: string): Promise<AuthRegisterSmsResult> {
  const response = await apiClient.post<ApiResponse<AuthRegisterSmsResult>>(
    "/auth/register-sms-code",
    { phone },
    {
      silentErrorStatuses: [400, 403, 409, 429],
    },
  );
  return response.data.data as AuthRegisterSmsResult;
}

export async function loginWithPassword(username: string, password: string): Promise<SessionEnvelope> {
  const response = await apiClient.post<ApiResponse<SessionEnvelope>>(
    "/auth/login",
    {
      username,
      password,
    },
    {
      silentErrorStatuses: [401, 403],
    },
  );

  return response.data.data as SessionEnvelope;
}

export async function registerWithPassword(input: RegisterWithPasswordInput): Promise<SessionEnvelope> {
  const response = await apiClient.post<ApiResponse<SessionEnvelope>>(
    "/auth/register",
    input,
    {
      silentErrorStatuses: [400, 403, 409, 429],
    },
  );

  return response.data.data as SessionEnvelope;
}

export async function getCurrentSession(): Promise<SessionEnvelope | null> {
  const response = await apiClient.get<ApiResponse<SessionEnvelope | null>>("/auth/session", {
    silentErrorStatuses: [401],
  });
  return response.data.data ?? null;
}

export async function logoutCurrentSession(): Promise<void> {
  await apiClient.post<ApiResponse<null>>(
    "/auth/logout",
    undefined,
    {
      silentErrorStatuses: [401],
    },
  );
}
