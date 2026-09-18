import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

/**
 * Driver web-push — dependency-free.
 *
 * We deliberately do NOT use the `web-push` npm package: adding it (and its
 * transitive tree) risked breaking `npm ci` in the Docker build. Instead we
 * implement the minimal Web Push we actually need using Node's built-in crypto:
 *
 *   - VAPID (RFC 8292): an ES256 JWT signed with the server's private key,
 *     proving to the push service (FCM/Mozilla/Apple) who we are.
 *   - PAYLOAD-LESS pushes: we send an empty push ("tickle"). The service worker
 *     shows a generic "new job" notification and the app fetches details when
 *     opened. This avoids implementing the complex aes128gcm payload encryption
 *     (RFC 8291) entirely — robust and good enough for "wake the driver".
 *
 * Enabled only when VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY are set in env. If
 * unset, the service is a silent no-op — the in-app job list still works, so a
 * driver is never stranded by push being off.
 *
 * HONEST PLATFORM NOTE: web push is reliable on Android/Chrome and on installed
 * PWAs; on iOS it only works if the driver "Add to Home Screen"-installs the app
 * and Apple throttles delivery. It is a best-effort wake-up, not a guarantee.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  private publicKey?: string;
  private privateKey?: string;
  private subject: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.publicKey = this.config.get('VAPID_PUBLIC_KEY') || process.env.VAPID_PUBLIC_KEY;
    this.privateKey = this.config.get('VAPID_PRIVATE_KEY') || process.env.VAPID_PRIVATE_KEY;
    this.subject = this.config.get('VAPID_SUBJECT') || process.env.VAPID_SUBJECT || 'mailto:ops@flowop.work';
    if (!this.enabled) {
      this.logger.warn('VAPID keys not set — driver push disabled (in-app job list still works).');
    }
  }

  get enabled(): boolean {
    return Boolean(this.publicKey && this.privateKey);
  }

  /** The public key the browser needs to subscribe. */
  getPublicKey(): string | null {
    return this.publicKey ?? null;
  }

  /** Store (or refresh) a driver's push subscription. */
  async saveSubscription(
    driverId: string,
    companyId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      throw new Error('Invalid push subscription');
    }
    await this.prisma.driverPushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { driverId, companyId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
      create: {
        driverId, companyId, endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent,
      },
    });
    return { ok: true };
  }

  /** Remove a subscription (driver disabled notifications / logged out). */
  async removeSubscription(endpoint: string) {
    await this.prisma.driverPushSubscription.deleteMany({ where: { endpoint } });
    return { ok: true };
  }

  /**
   * Wake a driver's device(s). Best-effort, never throws — a push failure must
   * never break the job-assignment flow that calls it.
   */
  async notifyDriver(driverId: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const subs = await this.prisma.driverPushSubscription.findMany({ where: { driverId } });
      for (const sub of subs) {
        try {
          await this.sendTickle(sub.endpoint);
        } catch (err: any) {
          // 404/410 mean the subscription is dead — prune it.
          const code = err?.statusCode;
          if (code === 404 || code === 410) {
            await this.prisma.driverPushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
            this.logger.log(`Pruned expired push subscription (${code}).`);
          } else {
            this.logger.warn(`Push send failed: ${err?.message ?? err}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`notifyDriver failed (non-blocking): ${err?.message ?? err}`);
    }
  }

  // ── VAPID / Web Push protocol (payload-less) ───────────────────────────────

  /** POST an empty push to the endpoint with a VAPID Authorization header. */
  private async sendTickle(endpoint: string): Promise<void> {
    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const jwt = this.buildVapidJwt(audience);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        TTL: '600',
        // aes128gcm is the standard content-encoding; with no body it's an
        // empty-payload push the SW still receives as a 'push' event.
        'Content-Length': '0',
        Authorization: `vapid t=${jwt}, k=${this.publicKey}`,
      },
    });

    if (!res.ok) {
      const e: any = new Error(`push endpoint responded ${res.status}`);
      e.statusCode = res.status;
      throw e;
    }
  }

  /** Build the ES256 VAPID JWT (RFC 8292) using the raw EC private key. */
  private buildVapidJwt(audience: string): string {
    const header = { typ: 'JWT', alg: 'ES256' };
    const payload = {
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12h
      sub: this.subject,
    };

    const b64 = (obj: any) => this.b64url(Buffer.from(JSON.stringify(obj)));
    const signingInput = `${b64(header)}.${b64(payload)}`;

    // The private key is a base64url raw 32-byte EC scalar (P-256), as produced
    // by `web-push generate-vapid-keys`. Wrap it into a KeyObject via JWK.
    const keyObject = this.privateKeyFromRaw(this.privateKey!, this.publicKey!);
    const derSig = crypto.sign('sha256', Buffer.from(signingInput), { key: keyObject, dsaEncoding: 'ieee-p1363' });
    // ieee-p1363 already gives the 64-byte r||s form Web Push expects.
    return `${signingInput}.${this.b64url(derSig)}`;
  }

  /** Build a P-256 private KeyObject from raw base64url d (+ public for JWK). */
  private privateKeyFromRaw(privateB64: string, publicB64: string): crypto.KeyObject {
    const d = this.b64urlDecode(privateB64);
    const pub = this.b64urlDecode(publicB64); // 65 bytes: 0x04 || X(32) || Y(32)
    const x = pub.subarray(1, 33);
    const y = pub.subarray(33, 65);
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      d: this.b64url(d),
      x: this.b64url(x),
      y: this.b64url(y),
    };
    return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  }

  private b64url(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private b64urlDecode(s: string): Buffer {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  }
}
