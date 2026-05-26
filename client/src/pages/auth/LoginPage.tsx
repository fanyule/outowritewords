import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import type { AuthRegisterCaptcha, AuthRegisterSettings } from "@ai-novel/shared/types/auth";
import type { ApiHttpError } from "@/api/client";
import { getRegisterCaptcha, getRegisterSettings, sendRegisterSmsCode } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBrowserDeviceFingerprint } from "@/lib/deviceFingerprint";
import { useAuthStore } from "@/store/authStore";

type AuthTab = "login" | "register";

interface RegisterFormState {
  username: string;
  nickname: string;
  referralCode: string;
  phone: string;
  smsCode: string;
  password: string;
  confirmPassword: string;
  verificationCode: string;
  captchaAnswer: string;
}

const INITIAL_REGISTER_FORM: RegisterFormState = {
  username: "",
  nickname: "",
  referralCode: "",
  phone: "",
  smsCode: "",
  password: "",
  confirmPassword: "",
  verificationCode: "",
  captchaAnswer: "",
};

const LEFT_COPY_LINES = [
  "这是专为小说家打造的创作空间。精心设计的写作界面，让你专注于文字本身而不是操作。",
  "系统帮助你整理思路、管理章节、跟踪进度，让你的创作效率倍增。",
  "无论是构建庞大世界观，还是写下温暖小故事，这里都能助你实现创作梦想。",
  "让文字成为你最坚实的力量。",
];

function extractRenewalTicket(error: unknown): string | null {
  const details = (error as ApiHttpError | undefined)?.details as
    | { details?: { renewal_ticket?: string } }
    | undefined;
  return details?.details?.renewal_ticket ?? null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "操作失败，请稍后重试。";
}

function buildPosterStyle(settings: AuthRegisterSettings | null): CSSProperties | undefined {
  const posterUrl = settings?.user_login_poster_url?.trim();
  if (!posterUrl) {
    return undefined;
  }

  return {
    backgroundImage: `url("${posterUrl}")`,
    backgroundSize: "cover",
    backgroundPosition: "center center",
  };
}

export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialized = useAuthStore((state) => state.initialized);
  const status = useAuthStore((state) => state.status);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);

  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(INITIAL_REGISTER_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renewalTicket, setRenewalTicket] = useState<string | null>(null);
  const [registerSettings, setRegisterSettings] = useState<AuthRegisterSettings | null>(null);
  const [registerSettingsError, setRegisterSettingsError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<AuthRegisterCaptcha | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [smsDebugCode, setSmsDebugCode] = useState<string | null>(null);

  const redirectTarget = useMemo(() => {
    const state = location.state as { from?: string } | null;
    return state?.from && state.from !== "/login" ? state.from : "/";
  }, [location.state]);

  const inviteCodeFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("invite") || params.get("invite_code") || params.get("referral_code") || "";
  }, [location.search]);

  const brandName = registerSettings?.brand_name?.trim() || "AI 小说创作工作台";
  const brandLogo = registerSettings?.brand_logo_url?.trim() || "";
  const videoUrl = registerSettings?.user_login_video_url?.trim() || "";
  const posterUrl = registerSettings?.user_login_poster_url?.trim() || "";
  const posterStyle = useMemo(() => buildPosterStyle(registerSettings), [registerSettings]);

  useEffect(() => {
    if (inviteCodeFromQuery) {
      setRegisterForm((current) => ({
        ...current,
        referralCode: current.referralCode || inviteCodeFromQuery,
      }));
    }
  }, [inviteCodeFromQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const settings = await getRegisterSettings(inviteCodeFromQuery || undefined);
        if (cancelled) {
          return;
        }
        setRegisterSettings(settings);
        setRegisterSettingsError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRegisterSettingsError(extractErrorMessage(error));
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [inviteCodeFromQuery]);

  useEffect(() => {
    if (!registerSettings?.require_image_captcha) {
      setCaptcha(null);
      setCaptchaError(null);
      return;
    }

    let cancelled = false;

    async function loadCaptcha() {
      try {
        const nextCaptcha = await getRegisterCaptcha();
        if (cancelled) {
          return;
        }
        setCaptcha(nextCaptcha);
        setCaptchaError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setCaptchaError(extractErrorMessage(error));
      }
    }

    void loadCaptcha();
    return () => {
      cancelled = true;
    };
  }, [registerSettings?.require_image_captcha]);

  if (initialized && status === "authenticated") {
    return <Navigate to={redirectTarget} replace />;
  }

  const updateRegisterField = <K extends keyof RegisterFormState>(field: K, value: RegisterFormState[K]) => {
    setRegisterForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setRenewalTicket(null);

    try {
      await login(username.trim(), password);
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
      setRenewalTicket(extractRenewalTicket(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendSmsCode = async () => {
    if (!registerForm.phone.trim()) {
      setErrorMessage("请先输入手机号。");
      return;
    }

    setIsSendingSms(true);
    setErrorMessage(null);
    setSmsDebugCode(null);

    try {
      const result = await sendRegisterSmsCode(registerForm.phone.trim());
      setSmsDebugCode(result.debug_code ?? null);
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleRefreshCaptcha = async () => {
    if (!registerSettings?.require_image_captcha) {
      return;
    }

    setCaptchaError(null);
    try {
      const nextCaptcha = await getRegisterCaptcha();
      setCaptcha(nextCaptcha);
    } catch (error) {
      setCaptchaError(extractErrorMessage(error));
    }
  };

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setRenewalTicket(null);

    if (registerForm.password !== registerForm.confirmPassword) {
      setErrorMessage("两次输入的密码不一致。");
      setIsSubmitting(false);
      return;
    }

    try {
      await register({
        username: registerForm.username.trim(),
        nickname: registerForm.nickname.trim(),
        password: registerForm.password,
        phone: registerForm.phone.trim(),
        smsCode: registerForm.smsCode.trim(),
        referralCode: registerForm.referralCode.trim(),
        verificationCode: registerForm.verificationCode.trim(),
        captchaToken: captcha?.captcha_token ?? "",
        captchaAnswer: registerForm.captchaAnswer.trim(),
        deviceFingerprint: getBrowserDeviceFingerprint(),
      });
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      setErrorMessage(extractErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const registerClosedPanel = (
    <div className="rounded-2xl bg-white/8 px-4 py-4 text-sm leading-7 text-white/72 backdrop-blur-xl">
      当前已关闭新用户注册，请联系管理员开通账号。
    </div>
  );

  const authPanelError = errorMessage ? (
    <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
      {errorMessage}
    </div>
  ) : null;

  const renderCopyLines = (suffix: string) =>
    LEFT_COPY_LINES.map((line, index) => (
      <p
        key={`${suffix}-${line}`}
        className={[
          "text-balance text-white/94",
          "[text-shadow:0_22px_48px_rgba(8,12,22,0.58)]",
          "transition-opacity duration-700",
          index === 0
            ? "text-[30px] font-semibold leading-[1.92] tracking-[0.036em] lg:text-[34px]"
            : "",
          index === 1 || index === 2
            ? "text-[24px] font-medium leading-[2.08] tracking-[0.06em] text-white/88 lg:text-[26px]"
            : "",
          index === 3
            ? "text-[32px] font-semibold leading-[2] tracking-[0.14em] text-white lg:text-[36px]"
            : "",
        ].join(" ")}
      >
        {line}
      </p>
    ));

  const leftCopyBlock = (
    <div className="relative max-w-[700px] overflow-hidden py-10">
      <div
        className="pointer-events-none absolute left-0 top-0 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_72%)] blur-2xl"
        aria-hidden
      />
      <div
        className="relative will-change-transform"
        data-auth-copy-motion="true"
        style={{
          animation: "auth-copy-marquee 20s linear infinite",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.95) 12%, rgba(0,0,0,0.95) 88%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.95) 12%, rgba(0,0,0,0.95) 88%, transparent 100%)",
        }}
      >
        <div className="space-y-12">{renderCopyLines("primary")}</div>
        <div className="space-y-12 pt-12 opacity-95">{renderCopyLines("loop")}</div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060913] text-white">
      <style>
        {`
          @keyframes auth-copy-marquee {
            0% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(0, -52%, 0); }
            100% { transform: translate3d(0, 0, 0); }
          }

          @media (prefers-reduced-motion: reduce) {
            [data-auth-copy-motion="true"] {
              animation: none !important;
            }
          }
        `}
      </style>

      <div className="absolute inset-0" style={posterStyle} />
      {videoUrl ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={posterUrl || undefined}
        >
          <source src={videoUrl} />
        </video>
      ) : null}
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(8,12,22,0.80)_0%,rgba(8,12,22,0.56)_38%,rgba(8,12,22,0.76)_100%)]" />
      <div className="absolute inset-0 backdrop-blur-[2px]" />

      <div className="relative min-h-screen px-7 py-10 lg:px-10">
        <div className="flex min-h-[calc(100vh-80px)] flex-col">
          <div className="mb-8 flex items-start">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] bg-white/8 shadow-[0_20px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                {brandLogo ? (
                  <img src={brandLogo} alt={brandName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-semibold text-white">AI</span>
                )}
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.36em] text-white/70">Company</div>
                <div className="mt-1 text-[18px] font-semibold tracking-[0.02em] text-white">{brandName}</div>
              </div>
            </div>
          </div>

          <div className="grid flex-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
            <section className="flex min-h-[420px] items-center pl-6 lg:pl-20">
              <div data-auth-copy-motion="true">{leftCopyBlock}</div>
            </section>

            <section className="flex items-center justify-end">
              <Card className="w-full max-w-[420px] rounded-[28px] border border-white/12 bg-[rgba(9,13,24,0.72)] shadow-[0_30px_90px_rgba(0,0,0,0.36)] backdrop-blur-[18px]">
                <CardContent className="p-0">
                  <div className="border-b border-white/10 px-7 py-7">
                    <div className="text-[20px] font-semibold tracking-[0.02em] text-white">账号入口</div>
                  </div>

                  <div className="px-7 py-7">
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AuthTab)} className="space-y-5">
                      <TabsList className="grid h-12 w-full grid-cols-2 rounded-[16px] border border-white/10 bg-white/4 p-1">
                        <TabsTrigger
                          value="login"
                          className="rounded-[12px] text-sm font-semibold text-white/72 data-[state=active]:bg-white/8 data-[state=active]:text-white"
                        >
                          登录
                        </TabsTrigger>
                        <TabsTrigger
                          value="register"
                          disabled={registerSettings?.open_registration === false}
                          className="rounded-[12px] text-sm font-semibold text-white/72 data-[state=active]:bg-white/8 data-[state=active]:text-white"
                        >
                          注册
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="login" className="mt-0">
                        <form className="space-y-4" onSubmit={handleLoginSubmit}>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-white/86" htmlFor="login-username">
                              用户名
                            </label>
                            <Input
                              id="login-username"
                              autoComplete="username"
                              placeholder="请输入用户名"
                              value={username}
                              onChange={(event) => setUsername(event.target.value)}
                              className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-white/86" htmlFor="login-password">
                              密码
                            </label>
                            <Input
                              id="login-password"
                              type="password"
                              autoComplete="current-password"
                              placeholder="请输入密码"
                              value={password}
                              onChange={(event) => setPassword(event.target.value)}
                              className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                            />
                          </div>

                          {authPanelError}

                          <div className="flex flex-wrap items-center gap-3 pt-1">
                            <Button className="h-11 min-w-36 rounded-[14px] px-6" type="submit" disabled={isSubmitting}>
                              {isSubmitting ? "正在登录..." : "立即登录"}
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              className="h-11 rounded-[14px] border-white/12 bg-white/4 px-5 text-white hover:bg-white/8"
                            >
                              <a href="/billing">查看套餐</a>
                            </Button>
                          </div>
                        </form>

                        {renewalTicket ? (
                          <div className="mt-5 rounded-[18px] border border-primary/20 bg-primary/10 p-4">
                            <div className="text-sm font-semibold text-white">检测到账号已过期</div>
                            <div className="mt-2 text-sm leading-6 text-white/70">
                              你可以直接前往套餐中心续费，支付完成后再回到这里继续登录。
                            </div>
                            <div className="mt-4">
                              <Button asChild className="h-10 rounded-[14px] px-5">
                                <a href={`/billing?renewalTicket=${encodeURIComponent(renewalTicket)}`}>去套餐中心续费</a>
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </TabsContent>

                      <TabsContent value="register" className="mt-0">
                        {registerSettings?.open_registration === false ? (
                          registerClosedPanel
                        ) : (
                          <form className="space-y-4" onSubmit={handleRegisterSubmit}>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-white/86" htmlFor="register-username">
                                  用户名
                                </label>
                                <Input
                                  id="register-username"
                                  autoComplete="username"
                                  placeholder="3-32 位字母、数字或下划线"
                                  value={registerForm.username}
                                  onChange={(event) => updateRegisterField("username", event.target.value)}
                                  className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium text-white/86" htmlFor="register-nickname">
                                  昵称
                                </label>
                                <Input
                                  id="register-nickname"
                                  placeholder="可选，最多 50 个字符"
                                  value={registerForm.nickname}
                                  onChange={(event) => updateRegisterField("nickname", event.target.value)}
                                  className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium text-white/86" htmlFor="register-referral-code">
                                邀请码（选填）
                              </label>
                              <Input
                                id="register-referral-code"
                                placeholder="有好友邀请时可填写邀请码"
                                value={registerForm.referralCode}
                                onChange={(event) => updateRegisterField("referralCode", event.target.value)}
                                className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                              />
                            </div>

                            {registerSettings?.require_phone_verification ? (
                              <>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium text-white/86" htmlFor="register-phone">
                                    手机号
                                  </label>
                                  <Input
                                    id="register-phone"
                                    autoComplete="tel"
                                    placeholder="请输入手机号"
                                    value={registerForm.phone}
                                    onChange={(event) => updateRegisterField("phone", event.target.value)}
                                    className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <label className="text-sm font-medium text-white/86" htmlFor="register-sms-code">
                                    短信验证码
                                  </label>
                                  <div className="flex flex-col gap-3 sm:flex-row">
                                    <Input
                                      id="register-sms-code"
                                      className="h-12 flex-1 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                                      placeholder="请输入短信验证码"
                                      value={registerForm.smsCode}
                                      onChange={(event) => updateRegisterField("smsCode", event.target.value)}
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-12 rounded-[14px] border-white/12 bg-white/4 px-5 text-white hover:bg-white/8 sm:w-auto"
                                      onClick={handleSendSmsCode}
                                      disabled={isSendingSms}
                                    >
                                      {isSendingSms ? "发送中..." : "获取验证码"}
                                    </Button>
                                  </div>
                                  {smsDebugCode ? (
                                    <div className="text-xs text-white/56">当前环境验证码：{smsDebugCode}</div>
                                  ) : null}
                                </div>
                              </>
                            ) : null}

                            {registerSettings?.require_verification_code ? (
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-white/86" htmlFor="register-verification-code">
                                  注册码
                                </label>
                                <Input
                                  id="register-verification-code"
                                  placeholder="请输入注册码"
                                  value={registerForm.verificationCode}
                                  onChange={(event) => updateRegisterField("verificationCode", event.target.value)}
                                  className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                                />
                              </div>
                            ) : null}

                            {registerSettings?.require_image_captcha ? (
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-white/86" htmlFor="register-captcha-answer">
                                  图形验证码
                                </label>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                  <div className="flex min-h-16 items-center justify-center rounded-[16px] border border-white/10 bg-white/6 px-3 py-2">
                                    {captcha?.image_data ? (
                                      <img src={captcha.image_data} alt="图形验证码" className="h-14 w-auto" />
                                    ) : (
                                      <span className="text-xs text-white/48">加载中...</span>
                                    )}
                                  </div>
                                  <div className="flex-1 space-y-3">
                                    <Input
                                      id="register-captcha-answer"
                                      placeholder="请输入图中字符"
                                      value={registerForm.captchaAnswer}
                                      onChange={(event) => updateRegisterField("captchaAnswer", event.target.value)}
                                      className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="h-10 rounded-[14px] border-white/12 bg-white/4 px-4 text-white hover:bg-white/8"
                                      onClick={handleRefreshCaptcha}
                                    >
                                      换一张
                                    </Button>
                                  </div>
                                </div>
                                {captchaError ? <div className="text-xs text-red-200">{captchaError}</div> : null}
                              </div>
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-white/86" htmlFor="register-password">
                                  密码
                                </label>
                                <Input
                                  id="register-password"
                                  type="password"
                                  autoComplete="new-password"
                                  placeholder="至少 6 位"
                                  value={registerForm.password}
                                  onChange={(event) => updateRegisterField("password", event.target.value)}
                                  className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium text-white/86" htmlFor="register-confirm-password">
                                  确认密码
                                </label>
                                <Input
                                  id="register-confirm-password"
                                  type="password"
                                  autoComplete="new-password"
                                  placeholder="请再次输入密码"
                                  value={registerForm.confirmPassword}
                                  onChange={(event) => updateRegisterField("confirmPassword", event.target.value)}
                                  className="h-12 rounded-[16px] border-white/10 bg-white/8 text-white placeholder:text-white/42"
                                />
                              </div>
                            </div>

                            {authPanelError}

                            <Button className="h-11 w-full rounded-[14px]" type="submit" disabled={isSubmitting}>
                              {isSubmitting
                                ? "正在注册..."
                                : registerSettings?.trial_days
                                  ? `注册并开始 ${registerSettings.trial_days} 天试用`
                                  : "注册并开始使用"}
                            </Button>
                          </form>
                        )}
                      </TabsContent>
                    </Tabs>

                    {registerSettingsError ? (
                      <div className="mt-5 rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {registerSettingsError}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
