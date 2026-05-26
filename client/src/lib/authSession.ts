import type { LocalSessionInfo } from "@ai-novel/shared/types/auth";
import { APP_RUNTIME } from "./constants";

const AUTH_SESSION_STORAGE_KEY = "ai-novel.auth.session";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readStoredAuthSession(): LocalSessionInfo | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as LocalSessionInfo;
  } catch {
    return null;
  }
}

export function writeStoredAuthSession(session: LocalSessionInfo): void {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuthSession(): void {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function getStoredSessionToken(): string {
  return readStoredAuthSession()?.sessionToken ?? "";
}

export function redirectToLogin(): void {
  if (typeof window === "undefined") {
    return;
  }

  const isAlreadyOnLoginPage = window.location.pathname === "/login" || window.location.hash === "#/login";
  if (isAlreadyOnLoginPage) {
    return;
  }

  if (APP_RUNTIME === "desktop") {
    window.location.hash = "/login";
    return;
  }

  window.location.assign("/login");
}
