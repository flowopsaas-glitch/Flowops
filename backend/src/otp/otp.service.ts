import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EmailService } from '../email/email.service';

/**
 * OTP Service — generates, stores (in-memory TTL map), sends via WhatsApp OR Email,
 * and verifies one-time PINs for phone/email verification during signup.
 *
 * Supports DUAL verification:
 *   - WhatsApp (primary) — via Meta Cloud API
 *   - Email (fallback) — via Resend/SendGrid
 *
 * Storage: simple in-memory Map with TTL. For a single-instance VPS deployment
 * this is sufficient. If FlowOps scales horizontally, move to Redis.
 */

interface OtpEntry {
  code: string;
  phone: string;
  expiresAt: number;
  attempts: number;
}

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_MS = 60 * 1000; // 1 OTP per phone per 60s

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly store = new Map<string, OtpEntry>();
  private readonly lastSent = new Map<string, number>();

  constructor(
    private config: ConfigService,
    private email: EmailService,
  ) {}

  /** Generate a random numeric OTP code. */
  private generateCode(): string {
    return Array.from({ length: OTP_LENGTH }, () => Math.floor(Math.random() * 10)).join('');
  }

  /** Normalize phone: remove spaces, ensure starts with country code (27). */
  private normalizePhone(phone: string): string {
    let p = phone.replace(/[\s\-()]/g, '');
    // Remove leading +
    if (p.startsWith('+')) p = p.slice(1);
    // South African: 0XX → 27XX
    if (p.startsWith('0') && p.length === 10) {
      p = '27' + p.slice(1);
    }
    // If still no country code (just 9 digits like 606592875), prepend 27
    if (p.length === 9 && !p.startsWith('27')) {
      p = '27' + p;
    }
    return p;
  }

  /**
   * Send an OTP to a phone number via WhatsApp Cloud API.
   * Returns the OTP code (for dev logging only — never expose to client).
   */
  async sendOtp(rawPhone: string): Promise<{ success: boolean; message: string }> {
    const phone = this.normalizePhone(rawPhone);

    // Rate limit: max 1 OTP per phone per 60 seconds
    const lastTime = this.lastSent.get(phone);
    if (lastTime && Date.now() - lastTime < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastTime)) / 1000);
      throw new BadRequestException(`Please wait ${wait}s before requesting another code.`);
    }

    const code = this.generateCode();

    // Store in memory with TTL
    this.store.set(phone, {
      code,
      phone,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    });
    this.lastSent.set(phone, Date.now());

    // Send via WhatsApp Cloud API (platform-level credentials)
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    const apiVersion = this.config.get<string>('WHATSAPP_API_VERSION', 'v19.0');

    if (!phoneNumberId || !accessToken) {
      this.logger.error('WhatsApp credentials not configured — cannot send OTP');
      throw new BadRequestException('WhatsApp verification is not available. Please contact support.');
    }

    try {
      await axios.post(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: {
            body: `Your FlowOps verification code is: *${code}*\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`OTP sent to ${phone.slice(0, 4)}****${phone.slice(-3)}`);
      return { success: true, message: 'Verification code sent via WhatsApp.' };
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message ?? err.message;
      this.logger.error(`Failed to send OTP via WhatsApp: ${detail}`);
      throw new BadRequestException('Could not send verification code. Please check your phone number and try again.');
    }
  }

  /**
   * Verify an OTP code for a phone number.
   * Returns true if valid, throws if invalid/expired.
   */
  verifyOtp(rawPhone: string, code: string): { verified: boolean } {
    const phone = this.normalizePhone(rawPhone);
    const entry = this.store.get(phone);

    if (!entry) {
      throw new BadRequestException('No verification code found. Please request a new one.');
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(phone);
      throw new BadRequestException('Verification code expired. Please request a new one.');
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      this.store.delete(phone);
      throw new BadRequestException('Too many attempts. Please request a new code.');
    }

    if (entry.code !== code.trim()) {
      entry.attempts++;
      throw new BadRequestException(`Incorrect code. ${MAX_ATTEMPTS - entry.attempts} attempts remaining.`);
    }

    // Success — clean up
    this.store.delete(phone);
    this.lastSent.delete(phone);
    return { verified: true };
  }

  /** Cleanup expired entries (called periodically). */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  // ── Email OTP ─────────────────────────────────────────────────────────────

  /**
   * Send an OTP to an email address via Resend/SendGrid.
   * Uses the same in-memory store as WhatsApp OTP.
   */
  async sendEmailOtp(rawEmail: string): Promise<{ success: boolean; message: string }> {
    const email = rawEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new BadRequestException('A valid email address is required.');
    }

    // Rate limit: max 1 OTP per email per 60 seconds
    const key = `email:${email}`;
    const lastTime = this.lastSent.get(key);
    if (lastTime && Date.now() - lastTime < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastTime)) / 1000);
      throw new BadRequestException(`Please wait ${wait}s before requesting another code.`);
    }

    const code = this.generateCode();

    // Store in memory with TTL
    this.store.set(key, {
      code,
      phone: email, // reusing the phone field for email identifier
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    });
    this.lastSent.set(key, Date.now());

    // Send via email
    const sent = await this.email.send({
      to: email,
      subject: `Your FlowOps verification code: ${code}`,
      text: `Your FlowOps verification code is: ${code}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
          <div style="text-align:center;margin-bottom:32px;">
            <h1 style="margin:0;font-size:24px;font-weight:800;color:#0f172a;">FlowOps</h1>
            <p style="margin:8px 0 0;font-size:14px;color:#64748b;">Logistics, Evolved</p>
          </div>
          <div style="background:#f8fafc;border-radius:16px;padding:32px;text-align:center;border:1px solid #e2e8f0;">
            <p style="margin:0 0 8px;font-size:14px;color:#475569;">Your verification code is:</p>
            <div style="font-size:36px;font-weight:900;letter-spacing:8px;color:#0f172a;margin:16px 0;">${code}</div>
            <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">Expires in 5 minutes. Do not share this code.</p>
          </div>
          <p style="margin:24px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
            If you didn't request this code, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    if (!sent) {
      throw new BadRequestException('Could not send verification email. Please try again or use WhatsApp verification.');
    }

    this.logger.log(`Email OTP sent to ${email.slice(0, 3)}***@${email.split('@')[1]}`);
    return { success: true, message: 'Verification code sent to your email.' };
  }

  /**
   * Verify an OTP code for an email address.
   */
  verifyEmailOtp(rawEmail: string, code: string): { verified: boolean } {
    const email = rawEmail.trim().toLowerCase();
    const key = `email:${email}`;
    const entry = this.store.get(key);

    if (!entry) {
      throw new BadRequestException('No verification code found. Please request a new one.');
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      throw new BadRequestException('Verification code expired. Please request a new one.');
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      this.store.delete(key);
      throw new BadRequestException('Too many attempts. Please request a new code.');
    }

    if (entry.code !== code.trim()) {
      entry.attempts++;
      throw new BadRequestException(`Incorrect code. ${MAX_ATTEMPTS - entry.attempts} attempts remaining.`);
    }

    // Success — clean up
    this.store.delete(key);
    this.lastSent.delete(key);
    return { verified: true };
  }
}
