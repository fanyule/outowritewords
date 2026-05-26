import { Router } from "express";
import type { Request, Response } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  BillingCreateOrderResult,
  BillingOrderStatusResult,
  BillingPlanCatalog,
} from "@ai-novel/shared/types/auth";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { AuthCenterError, authCenterClient } from "../services/auth/AuthCenterClient";
import {
  extractSessionTokenFromRequest,
  localSessionService,
} from "../services/auth/LocalSessionService";

const router = Router();

const createOrderSchema = z.object({
  planCode: z.string().trim().min(1, "请选择一个可用套餐。"),
  channel: z.string().trim().optional(),
  renewalTicket: z.string().trim().optional(),
});

const orderParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const orderStatusQuerySchema = z.object({
  renewalTicket: z.string().trim().optional(),
});

const completeOrderSchema = z.object({
  renewalTicket: z.string().trim().optional(),
  providerTradeNo: z.string().trim().optional(),
});

function sendAuthCenterError(res: Response, error: AuthCenterError): void {
  res.status(error.statusCode).json({
    success: false,
    error: error.message,
    message: error.code,
    details: error.details,
  });
}

async function resolveOptionalCloudToken(req: Request): Promise<string | undefined> {
  const sessionToken = extractSessionTokenFromRequest(req);
  if (!sessionToken) {
    return undefined;
  }
  const session = await localSessionService.resolveOptionalSession(sessionToken);
  return session ? localSessionService.getCloudAccessToken(session) : undefined;
}

router.get("/plans", async (_req, res, next) => {
  try {
    const data = await authCenterClient.listPlans();
    res.status(200).json({
      success: true,
      data,
      message: "套餐信息加载成功。",
    } satisfies ApiResponse<BillingPlanCatalog>);
  } catch (error) {
    if (error instanceof AuthCenterError) {
      sendAuthCenterError(res, error);
      return;
    }
    next(error);
  }
});

router.post(
  "/orders",
  validate({ body: createOrderSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createOrderSchema>;
      const data = await authCenterClient.createOrder({
        token: await resolveOptionalCloudToken(req),
        renewalTicket: body.renewalTicket,
        planCode: body.planCode,
        channel: body.channel,
      });
      await localSessionService.syncUserIfCurrent(data.user);
      res.status(201).json({
        success: true,
        data,
        message: "订单创建成功。",
      } satisfies ApiResponse<BillingCreateOrderResult>);
    } catch (error) {
      if (error instanceof AuthCenterError) {
        sendAuthCenterError(res, error);
        return;
      }
      next(error);
    }
  },
);

router.get(
  "/orders/:id/status",
  validate({ params: orderParamsSchema, query: orderStatusQuerySchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof orderParamsSchema>;
      const query = req.query as z.infer<typeof orderStatusQuerySchema>;
      const data = await authCenterClient.getOrderStatus({
        token: await resolveOptionalCloudToken(req),
        renewalTicket: query.renewalTicket,
        orderId: id,
      });
      await localSessionService.syncUserIfCurrent(data.user);
      res.status(200).json({
        success: true,
        data,
        message: "订单状态已同步。",
      } satisfies ApiResponse<BillingOrderStatusResult>);
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
  "/orders/:id/complete",
  validate({ params: orderParamsSchema, body: completeOrderSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof orderParamsSchema>;
      const body = req.body as z.infer<typeof completeOrderSchema>;
      const data = await authCenterClient.completeOrder({
        token: await resolveOptionalCloudToken(req),
        renewalTicket: body.renewalTicket,
        orderId: id,
        providerTradeNo: body.providerTradeNo,
      });
      await localSessionService.syncUserIfCurrent(data.user);
      res.status(200).json({
        success: true,
        data,
        message: "订单支付状态已更新。",
      } satisfies ApiResponse<BillingOrderStatusResult>);
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
