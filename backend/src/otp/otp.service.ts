import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomInt } from 'crypto';
import axios from 'axios';
import Redis from 'ioredis';
import { EmailService } from '../email/email.service';
import { REDIS_CLIENT } from '../redis/redis.module';

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_MS = 60 * 1000;

const VERIFY_OTP_SCRIPT = `
local stored = redis.call('HGET', KEYS[1], 'codeHash')
if not stored then return {-1, 0} end
if stored == ARGV[1] then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
  return {1, 0}
end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return {-2, attempts}
end
return {0, attempts}
`;

const RELEASE_OTP_SCRIPT = `
local reservation = redis.call('GET', KEYS[2])
if reservation ~= ARGV[1] then return 0 end
local stored = redis.call('HGET', KEYS[1], 'reservation')
if stored == ARGV[1] then redis.call('DEL', KEYS[1]) end
redis.call('DEL', KEYS[2])
return 1
`;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly email: EmailService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Generate a uniformly distributed, cryptographically secure six-digit PIN. */
  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, '0');
  }

  private normalizePhone(rawPhone: string): string {
    let phone = String(rawPhone ?? '').replace(/[\s\-()]/g, '');
    if (phone.startsWith('+')) phone = phone.slice(1);
    if (phone.startsWith('0') && phone.length === 10) phone = `27${phone.slice(1)}`;
    if (phone.length === 9 && !phone.startsWith('27')) phone = `27${phone}`;
    if (!/^\d{9,15}$/.test(phone)) {
      throw new BadRequestException('Enter a valid phone number.');
    }
    return phone;
  }

  private normalizeEmail(rawEmail: string): string {
    const email = String(rawEmail ?? '').trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email address is required.');
    }
    return email;
  }

  private subjectHash(scope: 'phone' | 'email', subject: string): string {
    return createHash('sha256').update(`${scope}\0${subject}`).digest('hex');
  }

  private codeHash(scope: 'phone' | 'email', subject: string, code: string): string {
    const secret = this.config.get<string>('OTP_HMAC_SECRET') || this.config.get<string>('JWT_SECRET');
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new ServiceUnavailableException('OTP service is not configured.');
    }
    // Domain-separate the OTP key even when the backward-compatible fallback
    // derives it from JWT_SECRET; do not use the signing key directly for OTPs.
    const otpKey = createHmac('sha256', secret).update('flowops:otp-code-hmac:v1').digest();
    return createHmac('sha256', otpKey).update(`${scope}\0${subject}\0${code}`).digest('hex');
  }

  private keys(scope: 'phone' | 'email', subject: string) {
    const hash = this.subjectHash(scope, subject);
    return {
      otp: `flowops:otp:v1:${scope}:${hash}`,
      cooldown: `flowops:otp-cooldown:v1:${scope}:${hash}`,
    };
  }

  private async reserveOtp(
    scope: 'phone' | 'email',
    subject: string,
    code: string,
  ): Promise<{ reservation: string; otpKey: string; cooldownKey: string }> {
    const { otp: otpKey, cooldown: cooldownKey } = this.keys(scope, subject);
    const reservation = randomBytes(16).toString('hex');
    try {
      const reserved = await this.redis.set(cooldownKey, reservation, 'PX', RATE_LIMIT_MS, 'NX');
      if (reserved !== 'OK') {
        throw new BadRequestException('Please wait before requesting another code.');
      }

      const results = await this.redis
        .multi()
        .hset(otpKey, {
          codeHash: this.codeHash(scope, subject, code),
          attempts: '0',
          reservation,
        })
        .pexpire(otpKey, OTP_TTL_MS)
        .exec();
      if (!results || results.some(([error]) => error !== null)) {
        throw new Error('Redis did not persist the OTP record');
      }
      return { reservation, otpKey, cooldownKey };
    } catch (error: any) {
      await this.releaseOtp(otpKey, cooldownKey, reservation);
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`OTP store unavailable: ${error?.message ?? 'unknown error'}`);
      throw new ServiceUnavailableException('Verification is temporarily unavailable. Please try again.');
    }
  }

  private async releaseOtp(otpKey: string, cooldownKey: string, reservation: string): Promise<void> {
    try {
      await this.redis.eval(RELEASE_OTP_SCRIPT, 2, otpKey, cooldownKey, reservation);
    } catch (error: any) {
      this.logger.warn(`Could not release an unsent OTP reservation: ${error?.message ?? 'unknown error'}`);
    }
  }

  private async consumeOtp(scope: 'phone' | 'email', subject: string, rawCode: string): Promise<void> {
    const code = String(rawCode ?? '').trim();
    if (!/^\d{6}$/.test(code)) throw new BadRequestException('Enter the six-digit verification code.');

    const { otp, cooldown } = this.keys(scope, subject);
    let result: unknown;
    try {
      result = await this.redis.eval(
        VERIFY_OTP_SCRIPT,
        2,
        otp,
        cooldown,
        this.codeHash(scope, subject, code),
        MAX_ATTEMPTS,
      );
    } catch (error: any) {
      this.logger.error(`OTP verification store unavailable: ${error?.message ?? 'unknown error'}`);
      throw new ServiceUnavailableException('Verification is temporarily unavailable. Please try again.');
    }

    const outcome = Array.isArray(result) ? Number(result[0]) : Number(result);
    const attempts = Array.isArray(result) ? Number(result[1]) : 0;
    if (outcome === 1) return;
    if (outcome === -1) {
      throw new BadRequestException('No verification code found or it has expired. Please request a new one.');
    }
    if (outcome === -2) {
      throw new BadRequestException('Too many attempts. Please request a new code.');
    }
    if (outcome === 0) {
      throw new BadRequestException(`Incorrect code. ${Math.max(0, MAX_ATTEMPTS - attempts)} attempts remaining.`);
    }
    throw new ServiceUnavailableException('Verification is temporarily unavailable. Please try again.');
  }

  async sendOtp(rawPhone: string): Promise<{ success: boolean; message: string }> {
    const phone = this.normalizePhone(rawPhone);
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    const apiVersion = this.config.get<string>('WHATSAPP_API_VERSION', 'v19.0');
    if (!phoneNumberId || !accessToken) {
      throw new ServiceUnavailableException('WhatsApp verification is not available. Please contact support.');
    }

    const code = this.generateCode();
    const reservation = await this.reserveOtp('phone', phone, code);
    try {
      await axios.post(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: `Your FlowOps verification code is: *${code}*\n\nThis code expires in 5 minutes. Do not share it with anyone.` },
        },
        {
          timeout: 8_000,
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        },
      );
      this.logger.log(`OTP sent to ${phone.slice(0, 4)}****${phone.slice(-3)}`);
      return { success: true, message: 'Verification code sent via WhatsApp.' };
    } catch (error: any) {
      await this.releaseOtp(reservation.otpKey, reservation.cooldownKey, reservation.reservation);
      this.logger.error(`Failed to send OTP via WhatsApp: ${error?.message ?? 'unknown error'}`);
      throw new BadRequestException('Could not send verification code. Please check your phone number and try again.');
    }
  }

  async verifyOtp(rawPhone: string, code: string): Promise<{ verified: true }> {
    const phone = this.normalizePhone(rawPhone);
    await this.consumeOtp('phone', phone, code);
    return { verified: true };
  }

  async sendEmailOtp(rawEmail: string): Promise<{ success: boolean; message: string }> {
    const emailAddr = this.normalizeEmail(rawEmail);
    const code = this.generateCode();
    const reservation = await this.reserveOtp('email', emailAddr, code);

    try {
      const sent = await this.email.send({
        to: emailAddr,
        subject: 'Your FlowOps verification code',
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
      if (!sent) throw new Error('Email provider did not accept the message');
      this.logger.log(`Email OTP sent to ${emailAddr.slice(0, 3)}***@${emailAddr.split('@')[1]}`);
      return { success: true, message: 'Verification code sent to your email.' };
    } catch (error: any) {
      await this.releaseOtp(reservation.otpKey, reservation.cooldownKey, reservation.reservation);
      this.logger.error(`Failed to send email OTP: ${error?.message ?? 'unknown error'}`);
      throw new BadRequestException('Could not send verification email. Please try again or use WhatsApp verification.');
    }
  }

  async verifyEmailOtp(rawEmail: string, code: string): Promise<{ verified: true }> {
    const emailAddr = this.normalizeEmail(rawEmail);
    await this.consumeOtp('email', emailAddr, code);
    return { verified: true };
  }
}
