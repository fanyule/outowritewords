import { Router } from "express";
import type { Response } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  AuthRegisterCaptcha,
  AuthRegisterSettings,
  AuthRegisterSmsResult,
  LocalSessionInfo,
} from "@ai-novel/shared/types/auth";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { AuthCenterError, authCenterClient } from "../services/auth/AuthCenterClient";
import {
  extractSessionTokenFromRequest,
  localSessionService,
} from "../services/auth/LocalSessionService";

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名。"),
  password: z.string().min(1, "请输入密码。"),
});

const registerSmsSchema = z.object({
  phone: z.string().trim().min(1, "请输入手机号。"),
});

const registerSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名。"),
  nickname: z.string().trim().max(50, "昵称不能超过 50 个字符。").optional().default(""),
  password: z.string().min(6, "密码至少 6 位。"),
  phone: z.string().trim().optional().default(""),
  smsCode: z.string().trim().optional().default(""),
  referralCode: z.string().trim().optional().default(""),
  verificationCode: z.string().trim().optional().default(""),
  captchaToken: z.string().trim().optional().default(""),
  captchaAnswer: z.string().trim().optional().default(""),
  deviceFingerprint: z.string().trim().optional().default(""),
});

function sendAuthCenterError(res: Response, error: AuthCenterError): void {
  res.status(error.statusCode).json({
    success: false,
    error: error.message,
    message: error.code,
    details: error.details,
  });
}

router.get("/register-settings", async (req, res, next) => {
  try {
    const inviteCode = typeof req.query.invite_code === "string"
      ? req.query.invite_code
      : typeof req.query.invite === "string"
        ? req.query.invite
        : "";
    const settings = await authCenterClient.getRegisterSettings(inviteCode);
    res.status(200).json({
      success: true,
      data: settings,
      message: "已获取注册配置。",
    } satisfies ApiResponse<AuthRegisterSettings>);
  } catch (error) {
    if (error instanceof AuthCenterError) {
      sendAuthCenterError(res, error);
      return;
    }
    next(error);
  }
});

router.get("/register-captcha", async (_req, res, next) => {
  try {
    const captcha = await authCenterClient.getRegisterCaptcha();
    res.status(200).json({
      success: true,
      data: captcha,
      message: "已获取图形验证码。",
    } satisfies ApiResponse<AuthRegisterCaptcha>);
  } catch (error) {
    if (error instanceof AuthCenterError) {
      sendAuthCenterError(res, error);
      return;
    }
    next(error);
  }
});

router.post(
  "/register-sms-code",
  validate({ body: registerSmsSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof registerSmsSchema>;
      const result = await authCenterClient.sendRegisterSmsCode(body.phone);
      res.status(200).json({
        success: true,
        data: result,
        message: "验证码已发送。",
      } satisfies ApiResponse<AuthRegisterSmsResult>);
    } catch (error) {
      if (error instanceof AuthCenterError) {
        sendAuthCenterError(res, error);
        return;
      }
      next(error);
    }
  },
);

router.post(
  "/register",
  validate({ body: registerSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof registerSchema>;
      const registerResult = await authCenterClient.register({
        username: body.username,
        nickname: body.nickname,
        password: body.password,
        phone: body.phone,
        smsCode: body.smsCode,
        referralCode: body.referralCode,
        verificationCode: body.verificationCode,
        captchaToken: body.captchaToken,
        captchaAnswer: body.captchaAnswer,
        deviceFingerprint: body.deviceFingerprint,
      });
      const session = localSessionService.createSession(registerResult.token, registerResult.user);
      res.status(201).json({
        success: true,
        data: { session },
        message: "注册成功。",
      } satisfies ApiResponse<{ session: LocalSessionInfo }>);
    } catch (error) {
      if (error instanceof AuthCenterError) {
        sendAuthCenterError(res, error);
        return;
      }
      next(error);
    }
  },
);

router.post(
  "/login",
  validate({ body: loginSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof loginSchema>;
      const loginResult = await authCenterClient.login(body.username, body.password);
      const session = localSessionService.createSession(loginResult.token, loginResult.user);
      res.status(200).json({
        success: true,
        data: { session },
        message: "登录成功。",
      } satisfies ApiResponse<{ session: LocalSessionInfo }>);
    } catch (error) {
      if (error instanceof AuthCenterError) {
        sendAuthCenterError(res, error);
        return;
      }
      next(error);
    }
  },
);

router.get("/session", async (req, res, next) => {
  try {
    const token = extractSessionTokenFromRequest(req);
    const session = token
      ? await localSessionService.getPublicSessionForToken(token)
      : null;
    res.status(200).json({
      success: true,
      data: session ? { session } : null,
      message: session ? "已恢复本地登录状态。" : "当前没有可用的本地会话。",
    } satisfies ApiResponse<{ session: LocalSessionInfo } | null>);
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (_req, res) => {
  localSessionService.clearSession();
  res.status(200).json({
    success: true,
    data: null,
    message: "已退出当前本地会话。",
  } satisfies ApiResponse<null>);
});

export default router;
