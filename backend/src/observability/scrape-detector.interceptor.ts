import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ObservabilityService } from './observability.service';

interface Bucket {
  count: number;
  paths: Set<string>;
  resetAt: number;
  alerted: boolean;
}

/**
 * CLAW scrape-detector.
 *
 * Complements the hard rate-limit (ThrottlerProxyGuard) with *pattern* awareness:
 * it watches how many authenticated reads a single principal makes in a sliding
 * window and raises ONE CLAW Observatory alert (source: 'integrity') when the
 * volume looks like bulk data exfiltration rather than human browsing.
 *
 * It never blocks a request — it only surfaces an early-warning signal to the
 * owner (the throttler does the actual blocking at a higher ceiling). Threshold
 * is deliberately well above an active multi-tab power user.
 */
@Injectable()
export class ScrapeDetectorInterceptor implements NestInterceptor {
  private readonly buckets = new Map<string, Bucket>();
  private readonly WINDOW_MS = 5 * 60_000;
  private readonly THRESHOLD = 700; // authenticated reads / 5 min before we flag
  private lastSweep = 0;

  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    try {
      if (context.getType() === 'http') {
        const req: any = context.switchToHttp().getRequest();
        if (req?.method === 'GET' && req?.user?.id) {
          this.track(req);
        }
      }
    } catch {
      /* detection must never break the request */
    }
    return next.handle();
  }

  private track(req: any): void {
    const now = Date.now();
    if (now - this.lastSweep > this.WINDOW_MS) {
      this.sweep(now);
      this.lastSweep = now;
    }

    const key = String(req.user.id);
    let b = this.buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, paths: new Set(), resetAt: now + this.WINDOW_MS, alerted: false };
      this.buckets.set(key, b);
    }

    b.count += 1;
    if (b.paths.size < 200) {
      b.paths.add(String(req.route?.path || req.url || '').split('?')[0]);
    }

    if (!b.alerted && b.count > this.THRESHOLD) {
      b.alerted = true;
      void this.observability
        .capture({
          source: 'integrity',
          level: 'warning',
          message:
            `Possible scraping: ${b.count} authenticated reads across ` +
            `${b.paths.size} endpoints in ~${Math.round(this.WINDOW_MS / 60_000)} min`,
          path: req.url,
          method: 'GET',
          userId: key,
          companyId: req.user.companyId,
          context: {
            reads: b.count,
            distinctPaths: b.paths.size,
            sample: Array.from(b.paths).slice(0, 15),
          },
        })
        .catch(() => undefined);
    }
  }

  private sweep(now: number): void {
    for (const [k, b] of this.buckets) {
      if (now > b.resetAt) this.buckets.delete(k);
    }
  }
}
