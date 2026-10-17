import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable, finalize } from 'rxjs';

/**
 * Bound the number of simultaneously buffered multipart requests per API
 * process. The VPS API container is memory-limited; route-level Multer caps
 * bound each request, while this shared gate bounds their aggregate footprint.
 */
@Injectable()
export class UploadConcurrencyInterceptor implements NestInterceptor {
  private static activeUploads = 0;
  static readonly MAX_ACTIVE_UPLOADS = 2;

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (UploadConcurrencyInterceptor.activeUploads >= UploadConcurrencyInterceptor.MAX_ACTIVE_UPLOADS) {
      throw new ServiceUnavailableException('Upload capacity is busy. Please retry shortly.');
    }

    UploadConcurrencyInterceptor.activeUploads += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      UploadConcurrencyInterceptor.activeUploads = Math.max(0, UploadConcurrencyInterceptor.activeUploads - 1);
    };

    try {
      return next.handle().pipe(finalize(release));
    } catch (error) {
      release();
      throw error;
    }
  }
}

/** Shared across all multipart endpoints and feature modules in this process. */
export const uploadConcurrency = new UploadConcurrencyInterceptor();
