import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler";
import {
  extractSessionTokenFromRequest,
  localSessionService,
} from "../services/auth/LocalSessionService";

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionToken = extractSessionTokenFromRequest(req);
    if (!sessionToken) {
      throw new AppError("请先登录后再继续操作。", 401);
    }

    const session = await localSessionService.resolveAuthenticatedSession(sessionToken);
    req.user = {
      id: session.user.id,
      role: session.user.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}
