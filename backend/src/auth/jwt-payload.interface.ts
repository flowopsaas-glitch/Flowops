// src/auth/jwt-payload.interface.ts
import { Role } from "./roles.enum";

export interface JwtPayload {
  sub: number; // ✅ user id
  email: string;
  role: Role;
  companyId: number;
}