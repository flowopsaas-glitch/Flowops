// src/middleware/auth.middleware.ts
import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

type ReqUser = {
  id: number;
  email: string;
  role: string;
  companyId: number;
};

export interface AuthRequest extends Request {
  user?: ReqUser;
  companyId?: number;
  userId?: number;
  role?: string;
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: AuthRequest, _res: Response, next: NextFunction) {
    if (req.user) {
      // ✅ normalize convenience fields
      req.userId = req.user.id;
      req.companyId = req.user.companyId;
      req.role = req.user.role;
    }
    next();
  }
}