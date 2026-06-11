// src/common/types.d.ts
import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    companyId?: number;
    userId?: number;
    user?: import('../auth/jwt.strategy').JwtPayload;
  }
}