import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  BillingCreateOrderResult,
  BillingOrderStatusResult,
  BillingPlanCatalog,
} from "@ai-novel/shared/types/auth";
import { apiClient } from "./client";

export async function listBillingPlans(): Promise<BillingPlanCatalog> {
  const response = await apiClient.get<ApiResponse<BillingPlanCatalog>>("/billing/plans");
  return response.data.data as BillingPlanCatalog;
}

export async function createBillingOrder(input: {
  planCode: string;
  channel?: string;
  renewalTicket?: string;
}): Promise<BillingCreateOrderResult> {
  const response = await apiClient.post<ApiResponse<BillingCreateOrderResult>>("/billing/orders", input);
  return response.data.data as BillingCreateOrderResult;
}

export async function getBillingOrderStatus(input: {
  orderId: string;
  renewalTicket?: string;
}): Promise<BillingOrderStatusResult> {
  const response = await apiClient.get<ApiResponse<BillingOrderStatusResult>>(
    `/billing/orders/${encodeURIComponent(input.orderId)}/status`,
    {
      params: input.renewalTicket ? { renewalTicket: input.renewalTicket } : undefined,
    },
  );
  return response.data.data as BillingOrderStatusResult;
}

export async function completeBillingOrder(input: {
  orderId: string;
  renewalTicket?: string;
  providerTradeNo?: string;
}): Promise<BillingOrderStatusResult> {
  const response = await apiClient.post<ApiResponse<BillingOrderStatusResult>>(
    `/billing/orders/${encodeURIComponent(input.orderId)}/complete`,
    {
      renewalTicket: input.renewalTicket,
      providerTradeNo: input.providerTradeNo,
    },
  );
  return response.data.data as BillingOrderStatusResult;
}
