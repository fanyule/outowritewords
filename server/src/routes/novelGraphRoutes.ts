import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  NovelGraphPreciseAnalysisRequest,
  NovelGraphPreciseAnalysisStatus,
  NovelGraphPreciseRuntimeReadiness,
  NovelGraphSnapshot,
} from "@ai-novel/shared/types/novelGraph";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { AppError } from "../middleware/errorHandler";
import { novelGraphPreciseAnalysisService } from "../services/novel/NovelGraphPreciseAnalysisService";
import { novelGraphSnapshotService } from "../services/novel/NovelGraphSnapshotService";

interface RegisterNovelGraphRoutesInput {
  router: Router;
  idParamsSchema: z.ZodType<{ id: string }>;
}

const preciseAnalyzeBodySchema = z.object({
  trigger: z.enum(["manual", "chapter_drafted", "pipeline_completed"]).optional(),
  force: z.boolean().optional(),
  chapterId: z.string().trim().min(1).nullable().optional(),
  chapterOrder: z.number().int().min(1).nullable().optional(),
});

export function registerNovelGraphRoutes(input: RegisterNovelGraphRoutesInput): void {
  const { router, idParamsSchema } = input;

  router.get("/:id/graph/instant", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelGraphSnapshotService.buildInstantSnapshot(id);
      res.status(200).json({
        success: true,
        data,
        message: "即时图谱快照已生成。",
      } satisfies ApiResponse<NovelGraphSnapshot>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/graph/precise/readiness", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelGraphPreciseAnalysisService.getRuntimeReadiness(id);
      res.status(200).json({
        success: true,
        data,
        message: "精确图谱运行诊断已加载。",
      } satisfies ApiResponse<NovelGraphPreciseRuntimeReadiness>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/graph/precise/status", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelGraphPreciseAnalysisService.getStatus(id);
      res.status(200).json({
        success: true,
        data,
        message: "精确图谱分析状态已加载。",
      } satisfies ApiResponse<NovelGraphPreciseAnalysisStatus>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/graph/precise/analyze",
    validate({ params: idParamsSchema, body: preciseAnalyzeBodySchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof preciseAnalyzeBodySchema>;
        const data = await novelGraphPreciseAnalysisService.requestAnalysis(id, {
          trigger: body.trigger ?? "manual",
          force: body.force,
          chapterId: body.chapterId,
          chapterOrder: body.chapterOrder,
        } satisfies NovelGraphPreciseAnalysisRequest);

        res.status(202).json({
          success: true,
          data,
          message: "精确图谱分析任务已进入队列。",
        } satisfies ApiResponse<NovelGraphPreciseAnalysisStatus>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/:id/graph/precise", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const status = await novelGraphPreciseAnalysisService.getStatus(id);
      if (!status.graphAvailable) {
        throw new AppError("精确图谱结果尚未生成。", 404);
      }
      const data = await novelGraphPreciseAnalysisService.readPreciseSnapshotSafe(id);
      res.status(200).json({
        success: true,
        data,
        message: "精确图谱已加载。",
      } satisfies ApiResponse<NovelGraphSnapshot>);
    } catch (error) {
      next(error);
    }
  });
}
