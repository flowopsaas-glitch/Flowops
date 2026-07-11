import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Request body size limiter — prevents DoS via oversized payloads.
 *
 * Limits:
 *   - JSON bodies: 1MB (more than enough for any API call)
 *   - Multipart/file uploads: 15MB (handled by multer separately)
 *   - URL-encoded: 1MB
 *
 * Returns 413 Payload Too Large if exceeded.
 */
@Injectable()
export class BodySizeLimitMiddleware implements NestMiddleware {
  private static readonly MAX_JSON_SIZE = 1 * 1024 * 1024; // 1MB
  private static readonly MAX_URLENCODED_SIZE = 1 * 1024 * 1024; // 1MB

  use(req: Request, res: Response, next: NextFunction): void {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const contentType = req.headers['content-type'] || '';

    // Skip multipart (file uploads handled by multer with its own limits)
    if (contentType.includes('multipart/form-data')) {
      return next();
    }

    const limit = contentType.includes('application/json')
      ? BodySizeLimitMiddleware.MAX_JSON_SIZE
      : BodySizeLimitMiddleware.MAX_URLENCODED_SIZE;

    if (contentLength > limit) {
      res.status(413).json({
        statusCode: 413,
        message: `Request body too large. Maximum: ${Math.round(limit / 1024)}KB`,
        error: 'Payload Too Large',
      });
      return;
    }

    next();
  }
}
