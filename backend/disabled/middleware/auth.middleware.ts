import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// ✅ Augment Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: string };
    }
  }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Example: attach a fake user (replace with real JWT logic)
    req.user = { id: 1, role: 'ADMIN' };
    next();
  }
}
