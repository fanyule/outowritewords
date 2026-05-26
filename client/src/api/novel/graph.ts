import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  NovelGraphPreciseAnalysisRequest,
  NovelGraphPreciseAnalysisStatus,
  NovelGraphPreciseRuntimeReadiness,
  NovelGraphSnapshot,
} from "@ai-novel/shared/types/novelGraph";
import { apiClient } from "../client";
import {
  normalizeNovelGraphPreciseAnalysisStatus,
  normalizeNovelGraphPreciseRuntimeReadiness,
} from "@/lib/novelGraphRuntime";

export async function getNovelInstantGraph(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelGraphSnapshot>>(`/novels/${id}/graph/instant`);
  return data;
}

export async function getNovelPreciseGraph(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelGraphSnapshot>>(`/novels/${id}/graph/precise`, {
    silentErrorStatuses: [404],
  });
  return data;
}

export async function getNovelPreciseGraphStatus(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelGraphPreciseAnalysisStatus>>(
    `/novels/${id}/graph/precise/status`,
  );
  if (data.data) {
    data.data = normalizeNovelGraphPreciseAnalysisStatus(data.data);
  }
  return data;
}

export async function getNovelPreciseGraphReadiness(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelGraphPreciseRuntimeReadiness>>(
    `/novels/${id}/graph/precise/readiness`,
  );
  if (data.data) {
    data.data = normalizeNovelGraphPreciseRuntimeReadiness(data.data);
  }
  return data;
}

export async function requestNovelPreciseGraphAnalysis(
  id: string,
  input: NovelGraphPreciseAnalysisRequest = {},
) {
  const { data } = await apiClient.post<ApiResponse<NovelGraphPreciseAnalysisStatus>>(
    `/novels/${id}/graph/precise/analyze`,
    input,
  );
  if (data.data) {
    data.data = normalizeNovelGraphPreciseAnalysisStatus(data.data);
  }
  return data;
}
