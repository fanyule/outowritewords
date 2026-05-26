import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  AccountCenterSnapshot,
  AccountPayoutAccount,
  AgentBrandingUpdateResult,
} from "@ai-novel/shared/types/account";
import { apiClient } from "./client";

export async function getAccountCenterSnapshot(): Promise<AccountCenterSnapshot> {
  const response = await apiClient.get<ApiResponse<AccountCenterSnapshot>>("/account/center");
  return response.data.data as AccountCenterSnapshot;
}

export async function updateAccountPayoutAccount(input: {
  accountName: string;
  alipayAccount: string;
}): Promise<AccountPayoutAccount> {
  const response = await apiClient.put<ApiResponse<{ account: AccountPayoutAccount }>>(
    "/account/payout-account",
    input,
  );
  return response.data.data?.account as AccountPayoutAccount;
}

export async function updateAgentBranding(input: {
  brandName: string;
  brandLogoUrl: string;
}): Promise<AgentBrandingUpdateResult> {
  const response = await apiClient.put<ApiResponse<AgentBrandingUpdateResult>>(
    "/account/branding",
    input,
  );
  return response.data.data as AgentBrandingUpdateResult;
}
