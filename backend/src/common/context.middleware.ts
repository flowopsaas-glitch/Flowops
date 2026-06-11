import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Example: attach request start time
    (req as any).requestTime = new Date();

    // You can attach more global context here if needed
    next();
  }
}