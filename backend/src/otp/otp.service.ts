import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * OTP Service — generates, stores (in-memory TTL map), sends via WhatsApp,
 * and verifies one-time PINs for phone-number verification during signup.
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

  constructor(private config: ConfigService) {}

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
}
