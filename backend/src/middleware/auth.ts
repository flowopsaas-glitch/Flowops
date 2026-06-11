import { Request } from "express";
import { JwtPayload } from "../auth/jwt-payload.interface";

export interface AuthRequest extends Request {
  user?: JwtPayload;

  // convenience fields added by middleware
  userId?: number;
  companyId?: number;
  role?: string;
}