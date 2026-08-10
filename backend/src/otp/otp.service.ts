import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { EmailService } from '../email/email.service';

/**
 * OTP Service — generates, stores (in-memory TTL map with automatic cleanup),
 * sends via WhatsApp OR Email, and verifies one-time PINs.
 *
 * Storage: in-memory Map with TTL + automatic cleanup cron (every 5 min).
 * For horizontal scaling, replace the Map with Redis SETEX.
 *
 * Hardened:
 * - Automatic expired entry cleanup every 5 minutes
 * - Bounded store size (max 10,000 entries — rejects new OTPs if exceeded)
 * - Rate limiting per phone/email (60s cooldown)
 * - Max 5 verification attempts before lockout
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
const MAX_STORE_SIZE = 10_000; // Prevent unbounded memory growth

@Injectable()
export class OtpService implements OnModuleInit {
  private readonly logger = new Logger(OtpService.name);
  private readonly store = new Map<string, OtpEntry>();
  private readonly lastSent = new Map<string, number>();

  constructor(
    private config: ConfigService,
    private email: EmailService,
  ) {}

  onModuleInit() {
    this.logger.log(`OTP service initialized (max store: ${MAX_STORE_SIZE}, TTL: ${OTP_TTL_MS / 1000}s)`);
  }

  /** Automatic cleanup of expired OTP entries — runs every 5 minutes. */
  @Cron('*/5 * * * *')
  handleCleanup() {
    const before = this.store.size;
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }

    // Also clean stale rate-limit entries (older than 2 minutes)
    for (const [key, ts] of this.lastSent.entries()) {
      if (now - ts > RATE_LIMIT_MS * 2) this.lastSent.delete(key);
    }

    const cleaned = before - this.store.size;
    if (cleaned > 0) {
      this.logger.log(`OTP cleanup: removed ${cleaned} expired entries (${this.store.size} active)`);
    }
  }

  /** Generate a random numeric OTP code. */
  private generateCode(): string {
    return Array.from({ length: OTP_LENGTH }, () => Math.floor(Math.random() * 10)).join('');
  }

  /** Normalize phone: remove spaces, ensure starts with country code (27). */
  private normalizePhone(phone: string): string {
    let p = phone.replace(/[\s\-()]/g, '');
    if (p.startsWith('+')) p = p.slice(1);
    if (p.startsWith('0') && p.length === 10) p = '27' + p.slice(1);
    if (p.length === 9 && !p.startsWith('27')) p = '27' + p;
    return p;
  }

  /** Check store capacity before inserting. */
  private ensureCapacity(): void {
    if (this.store.size >= MAX_STORE_SIZE) {
      // Force cleanup before rejecting
      this.handleCleanup();
      if (this.store.size >= MAX_STORE_SIZE) {
        throw new BadRequestException('Service temporarily unavailable. Please try again in a few minutes.');
      }
    }
  }

  /**
   * Send an OTP to a phone number via WhatsApp Cloud API.
   */
  async sendOtp(rawPhone: string): Promise<{ success: boolean; message: string }> {
    const phone = this.normalizePhone(rawPhone);

    // Rate limit
    const lastTime = this.lastSent.get(phone);
    if (lastTime && Date.now() - lastTime < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastTime)) / 1000);
      throw new BadRequestException(`Please wait ${wait}s before requesting another code.`);
    }

    this.ensureCapacity();
    const code = this.generateCode();

    this.store.set(phone, { code, phone, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
    this.lastSent.set(phone, Date.now());

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
          text: { body: `Your FlowOps verification code is: *${code}*\n\nThis code expires in 5 minutes. Do not share it with anyone.` },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
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
   */
  verifyOtp(rawPhone: string, code: string): { verified: boolean } {
    const phone = this.normalizePhone(rawPhone);
    const entry = this.store.get(phone);

    if (!entry) throw new BadRequestException('No verification code found. Please request a new one.');
    if (Date.now() > entry.expiresAt) { this.store.delete(phone); throw new BadRequestException('Verification code expired. Please request a new one.'); }
    if (entry.attempts >= MAX_ATTEMPTS) { this.store.delete(phone); throw new BadRequestException('Too many attempts. Please request a new code.'); }
    if (entry.code !== code.trim()) { entry.attempts++; throw new BadRequestException(`Incorrect code. ${MAX_ATTEMPTS - entry.attempts} attempts remaining.`); }

    this.store.delete(phone);
    this.lastSent.delete(phone);
    return { verified: true };
  }

  // ── Email OTP ─────────────────────────────────────────────────────────────

  async sendEmailOtp(rawEmail: string): Promise<{ success: boolean; message: string }> {
    const emailAddr = rawEmail.trim().toLowerCase();
    if (!emailAddr || !emailAddr.includes('@')) throw new BadRequestException('A valid email address is required.');

    const key = `email:${emailAddr}`;
    const lastTime = this.lastSent.get(key);
    if (lastTime && Date.now() - lastTime < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastTime)) / 1000);
      throw new BadRequestException(`Please wait ${wait}s before requesting another code.`);
    }

    this.ensureCapacity();
    const code = this.generateCode();

    this.store.set(key, { code, phone: emailAddr, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
    this.lastSent.set(key, Date.now());

    const sent = await this.email.send({
      to: emailAddr,
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
          <p style="margin:24px 0 0;text-align:center;font-size:12px;color:#94a3b8;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (!sent) throw new BadRequestException('Could not send verification email. Please try again or use WhatsApp verification.');
    this.logger.log(`Email OTP sent to ${emailAddr.slice(0, 3)}***@${emailAddr.split('@')[1]}`);
    return { success: true, message: 'Verification code sent to your email.' };
  }

  verifyEmailOtp(rawEmail: string, code: string): { verified: boolean } {
    const emailAddr = rawEmail.trim().toLowerCase();
    const key = `email:${emailAddr}`;
    const entry = this.store.get(key);

    if (!entry) throw new BadRequestException('No verification code found. Please request a new one.');
    if (Date.now() > entry.expiresAt) { this.store.delete(key); throw new BadRequestException('Verification code expired. Please request a new one.'); }
    if (entry.attempts >= MAX_ATTEMPTS) { this.store.delete(key); throw new BadRequestException('Too many attempts. Please request a new code.'); }
    if (entry.code !== code.trim()) { entry.attempts++; throw new BadRequestException(`Incorrect code. ${MAX_ATTEMPTS - entry.attempts} attempts remaining.`); }

    this.store.delete(key);
    this.lastSent.delete(key);
    return { verified: true };
  }
}
