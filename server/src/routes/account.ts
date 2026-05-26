import { Router } from "express";
import type { Request, Response } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  AccountCenterKind,
  AccountCenterSnapshot,
  AccountPayoutAccount,
  AgentBrandingUpdateResult,
} from "@ai-novel/shared/types/account";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { AuthCenterError, authCenterClient } from "../services/auth/AuthCenterClient";
import {
  extractSessionTokenFromRequest,
  localSessionService,
} from "../services/auth/LocalSessionService";

const router = Router();

const payoutAccountSchema = z.object({
  accountName: z.string().trim().max(80, "收款人姓名不能超过 80 个字符").default(""),
  alipayAccount: z.string().trim().max(160, "支付宝账号不能超过 160 个字符").default(""),
});

const brandingSchema = z.object({
  brandName: z.string().trim().max(80, "品牌名称不能超过 80 个字符").default(""),
  brandLogoUrl: z.string().trim().max(8 * 1024 * 1024, "品牌 Logo 地址过长").default(""),
});

function sendAuthCenterError(res: Response, error: AuthCenterError): void {
  res.status(error.statusCode).json({
    success: false,
    error: error.message,
    message: error.code,
    details: error.details,
  });
}

async function resolveCloudSession(req: Request) {
  const sessionToken = extractSessionTokenFromRequest(req);
  if (!sessionToken) {
    throw new AppError("请先登录后再继续操作。", 401);
  }

  const session = await localSessionService.resolveAuthenticatedSession(sessionToken);
  return {
    session,
    cloudAccessToken: localSessionService.getCloudAccessToken(session),
  };
}

function resolveKind(role: string | undefined): AccountCenterKind {
  if (role === "agent") {
    return "agent";
  }
  if (role === "admin") {
    return "admin";
  }
  return "user";
}

router.use(authMiddleware);

router.get("/center", async (req, res, next) => {
  try {
    const { session, cloudAccessToken } = await resolveCloudSession(req);
    const kind = resolveKind(session.user.role);

    if (kind === "admin") {
      res.status(200).json({
        success: true,
        data: {
          kind,
          current_user: session.user,
          dashboard: null,
          payout_account: null,
        },
        message: "已获取本地账户概览。",
      } satisfies ApiResponse<AccountCenterSnapshot>);
      return;
    }

    try {
      if (kind === "agent") {
        const [dashboard, payoutAccount] = await Promise.all([
          authCenterClient.getAgentDashboard(cloudAccessToken),
          authCenterClient.getAgentPayoutAccount(cloudAccessToken),
        ]);
        await localSessionService.syncUserIfCurrent(dashboard.current_user);
        res.status(200).json({
          success: true,
          data: {
            kind,
            current_user: dashboard.current_user,
            dashboard,
            payout_account: payoutAccount,
          },
          message: "已同步代理中心摘要。",
        } satisfies ApiResponse<AccountCenterSnapshot>);
        return;
      }

      const [dashboard, payoutAccount] = await Promise.all([
        authCenterClient.getUserCenterDashboard(cloudAccessToken),
        authCenterClient.getUserPayoutAccount(cloudAccessToken),
      ]);
      await localSessionService.syncUserIfCurrent(dashboard.current_user);
      res.status(200).json({
        success: true,
        data: {
          kind,
          current_user: dashboard.current_user,
          dashboard,
          payout_account: payoutAccount,
        },
        message: "已同步用户中心摘要。",
      } satisfies ApiResponse<AccountCenterSnapshot>);
    } catch (error) {
      if (error instanceof AuthCenterError && error.retryable) {
        res.status(200).json({
          success: true,
          data: {
            kind,
            current_user: session.user,
            dashboard: null,
            payout_account: null,
          },
          message: "云端暂时不可用，已回退到本地账户状态。",
        } satisfies ApiResponse<AccountCenterSnapshot>);
        return;
      }
      if (error instanceof AuthCenterError) {
        sendAuthCenterError(res, error);
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.put(
  "/payout-account",
  validate({ body: payoutAccountSchema }),
  async (req, res, next) => {
    try {
      const { session, cloudAccessToken } = await resolveCloudSession(req);
      const body = req.body as z.infer<typeof payoutAccountSchema>;

      let account: AccountPayoutAccount;
      if (session.user.role === "agent") {
        account = await authCenterClient.updateAgentPayoutAccount({
          token: cloudAccessToken,
          accountName: body.accountName,
          alipayAccount: body.alipayAccount,
        });
      } else if (session.user.role === "user") {
        account = await authCenterClient.updateUserPayoutAccount({
          token: cloudAccessToken,
          accountName: body.accountName,
          alipayAccount: body.alipayAccount,
        });
      } else {
        throw new AppError("当前角色暂不支持管理收款账号。", 403);
      }

      res.status(200).json({
        success: true,
        data: {
          account,
        },
        message: "收款账号已更新。",
      } satisfies ApiResponse<{ account: AccountPayoutAccount }>);
    } catch (error) {
      if (error instanceof AuthCenterError) {
        sendAuthCenterError(res, error);
        return;
      }
      next(error);
    }
  },
);

router.put(
  "/branding",
  validate({ body: brandingSchema }),
  async (req, res, next) => {
    try {
      const { session, cloudAccessToken } = await resolveCloudSession(req);
      if (session.user.role !== "agent") {
        throw new AppError("只有代理账号可以修改品牌设置。", 403);
      }

      const body = req.body as z.infer<typeof brandingSchema>;
      const result = await authCenterClient.updateAgentBranding({
        token: cloudAccessToken,
        brandName: body.brandName,
        brandLogoUrl: body.brandLogoUrl,
      });
      await localSessionService.syncUserIfCurrent(result.current_user);

      res.status(200).json({
        success: true,
        data: result,
        message: "品牌设置已同步。",
      } satisfies ApiResponse<AgentBrandingUpdateResult>);
    } catch (error) {
      if (error instanceof AuthCenterError) {
        sendAuthCenterError(res, error);
        return;
      }
      next(error);
    }
  },
);

export default router;
