import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit guard that resolves the *real* client identity when FlowOps runs
 * behind Cloudflare + nginx.
 *
 * Without this, every request appears to originate from the Cloudflare tunnel /
 * nginx container IP, so the whole tenant base would share a single bucket and
 * throttle each other. We track by:
 *   1. authenticated user id   (per-user fairness on shared office NATs)
 *   2. Cloudflare's CF-Connecting-IP
 *   3. left-most X-Forwarded-For hop
 *   4. req.ip fallback
 */
@Injectable()
export class ThrottlerProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // If JwtAuthGuard already authenticated the request, give each user their
    // own bucket regardless of shared public IP.
    const userId = req.user?.id || req.user?.sub;
    if (userId) return `user:${userId}`;

    const cf = req.headers?.['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.length) return `ip:${cf}`;

    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) return `ip:${xff.split(',')[0].trim()}`;

    return `ip:${req.ip || req.ips?.[0] || 'unknown'}`;
  }
}
