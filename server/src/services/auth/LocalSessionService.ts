import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import type { AuthUser, LocalSessionInfo, SessionVerificationStatus } from "@ai-novel/shared/types/auth";
import { AppError } from "../../middleware/errorHandler";
import { resolveDataRoot } from "../../runtime/appPaths";
import { AuthCenterError, authCenterClient } from "./AuthCenterClient";

const SESSION_VERIFY_INTERVAL_MS = 10 * 60 * 1000;
const SESSION_OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;
const SESSION_HEADER_NAME = "x-ai-novel-session";

interface StoredSession {
  sessionToken: string;
  cloudAccessToken: string;
  user: AuthUser;
  lastVerifiedAt: string;
  verificationStatus: SessionVerificationStatus;
  createdAt: string;
  updatedAt: string;
}

function ensureDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isAuthUserAllowed(user: AuthUser): { ok: true } | { ok: false; message: string } {
  if (user.status !== "active") {
    return { ok: false, message: "账号已被禁用，请联系管理员。" };
  }

  if (user.role !== "user") {
    return { ok: true };
  }

  const now = Date.now();
  const accessStart = toTimestamp(user.access_start_at);
  if (accessStart != null && now < accessStart) {
    return { ok: false, message: "当前账号尚未到生效时间，请稍后再试。" };
  }

  const accessEnd = toTimestamp(user.access_end_at);
  if (accessEnd != null && now >= accessEnd) {
    return { ok: false, message: "当前账号订阅已到期，请先续费后再继续使用。" };
  }

  return { ok: true };
}

function toPublicSession(session: StoredSession): LocalSessionInfo {
  return {
    sessionToken: session.sessionToken,
    user: session.user,
    lastVerifiedAt: session.lastVerifiedAt,
    verificationStatus: session.verificationStatus,
  };
}

export function extractSessionTokenFromRequest(req: Pick<Request, "headers">): string {
  const headerToken = req.headers[SESSION_HEADER_NAME] ?? req.headers[SESSION_HEADER_NAME.toUpperCase()];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }

  const authorization = req.headers.authorization ?? req.headers.Authorization;
  const value = typeof authorization === "string" ? authorization : "";
  if (!/^Bearer\s+/i.test(value)) {
    return "";
  }
  return value.replace(/^Bearer\s+/i, "").trim();
}

export class LocalSessionService {
  private readonly sessionFilePath: string;

  constructor() {
    this.sessionFilePath = path.join(resolveDataRoot(), "storage", "auth", "local-session.json");
  }

  private readSession(): StoredSession | null {
    if (!fs.existsSync(this.sessionFilePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(this.sessionFilePath, "utf8");
      if (!raw.trim()) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      if (!parsed.sessionToken || !parsed.cloudAccessToken || !parsed.user) {
        return null;
      }
      return {
        sessionToken: String(parsed.sessionToken),
        cloudAccessToken: String(parsed.cloudAccessToken),
        user: parsed.user as AuthUser,
        lastVerifiedAt: String(parsed.lastVerifiedAt ?? parsed.createdAt ?? new Date(0).toISOString()),
        verificationStatus: (parsed.verificationStatus as SessionVerificationStatus) ?? "fresh",
        createdAt: String(parsed.createdAt ?? new Date().toISOString()),
        updatedAt: String(parsed.updatedAt ?? new Date().toISOString()),
      };
    } catch {
      return null;
    }
  }

  private writeSession(session: StoredSession): void {
    ensureDirectory(this.sessionFilePath);
    fs.writeFileSync(this.sessionFilePath, JSON.stringify(session, null, 2), "utf8");
  }

  createSession(cloudAccessToken: string, user: AuthUser): LocalSessionInfo {
    const now = new Date().toISOString();
    const stored: StoredSession = {
      sessionToken: crypto.randomBytes(32).toString("hex"),
      cloudAccessToken,
      user,
      lastVerifiedAt: now,
      verificationStatus: "fresh",
      createdAt: now,
      updatedAt: now,
    };
    this.writeSession(stored);
    return toPublicSession(stored);
  }

  clearSession(): void {
    if (fs.existsSync(this.sessionFilePath)) {
      fs.unlinkSync(this.sessionFilePath);
    }
  }

  private shouldReverify(session: StoredSession): boolean {
    const verifiedAt = toTimestamp(session.lastVerifiedAt);
    if (verifiedAt == null) {
      return true;
    }
    return Date.now() - verifiedAt >= SESSION_VERIFY_INTERVAL_MS;
  }

  private canUseOfflineGrace(session: StoredSession): boolean {
    const verifiedAt = toTimestamp(session.lastVerifiedAt);
    if (verifiedAt == null) {
      return false;
    }
    return Date.now() - verifiedAt <= SESSION_OFFLINE_GRACE_MS;
  }

  private updateSessionUser(session: StoredSession, user: AuthUser, verificationStatus: SessionVerificationStatus): StoredSession {
    const now = new Date().toISOString();
    const next: StoredSession = {
      ...session,
      user,
      lastVerifiedAt: verificationStatus === "fresh" ? now : session.lastVerifiedAt,
      verificationStatus,
      updatedAt: now,
    };
    this.writeSession(next);
    return next;
  }

  private validateLocalAccess(session: StoredSession): void {
    const access = isAuthUserAllowed(session.user);
    if (!access.ok) {
      this.clearSession();
      throw new AppError(access.message, 403);
    }
  }

  async resolveAuthenticatedSession(token: string): Promise<StoredSession> {
    const session = this.readSession();
    if (!session || session.sessionToken !== token) {
      throw new AppError("请先登录后再继续操作。", 401);
    }

    this.validateLocalAccess(session);

    if (!this.shouldReverify(session)) {
      return session;
    }

    try {
      const user = await authCenterClient.getMe(session.cloudAccessToken);
      const access = isAuthUserAllowed(user);
      if (!access.ok) {
        this.clearSession();
        throw new AppError(access.message, 403);
      }
      return this.updateSessionUser(session, user, "fresh");
    } catch (error) {
      if (error instanceof AuthCenterError && error.retryable && this.canUseOfflineGrace(session)) {
        return this.updateSessionUser(session, session.user, "offline_grace");
      }

      if (error instanceof AuthCenterError && (error.statusCode === 401 || error.statusCode === 403)) {
        this.clearSession();
        throw new AppError(error.message || "登录状态已失效，请重新登录。", 401);
      }

      if (error instanceof AuthCenterError) {
        throw new AppError(error.message, 503);
      }

      throw error;
    }
  }

  async resolveOptionalSession(token: string): Promise<StoredSession | null> {
    if (!token) {
      return null;
    }

    try {
      return await this.resolveAuthenticatedSession(token);
    } catch {
      return null;
    }
  }

  async getPublicSessionForToken(token: string): Promise<LocalSessionInfo | null> {
    const session = await this.resolveOptionalSession(token);
    return session ? toPublicSession(session) : null;
  }

  async syncUserIfCurrent(user: AuthUser): Promise<void> {
    const session = this.readSession();
    if (!session || session.user.id !== user.id) {
      return;
    }
    this.updateSessionUser(session, user, "fresh");
  }

  getCloudAccessToken(session: StoredSession): string {
    return session.cloudAccessToken;
  }
}

export const localSessionService = new LocalSessionService();
export type { StoredSession };
