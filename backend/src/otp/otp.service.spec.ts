import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';
import axios from 'axios';
import { OtpService } from './otp.service';

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

function makeRedis() {
  const values = new Map<string, any>();
  const redis: any = {
    values,
    set: jest.fn(async (key: string, value: string, ...options: any[]) => {
      if (options.includes('NX') && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    }),
    multi: jest.fn(() => {
      const commands: Array<() => void> = [];
      const transaction: any = {
        hset: jest.fn((key: string, record: Record<string, string>) => {
          commands.push(() => values.set(key, { ...record }));
          return transaction;
        }),
        pexpire: jest.fn(() => {
          commands.push(() => undefined);
          return transaction;
        }),
        exec: jest.fn(async () => {
          for (const command of commands) command();
          return commands.map(() => [null, 1]);
        }),
      };
      return transaction;
    }),
    eval: jest.fn(async (script: string, _numKeys: number, key1: string, key2: string, arg1: string, arg2?: number) => {
      if (script.includes("local stored = redis.call('HGET', KEYS[1], 'codeHash')")) {
        const record = values.get(key1);
        if (!record?.codeHash) return [-1, 0];
        if (record.codeHash === arg1) {
          values.delete(key1);
          values.delete(key2);
          return [1, 0];
        }
        const attempts = Number(record.attempts ?? 0) + 1;
        if (attempts >= Number(arg2)) {
          values.delete(key1);
          return [-2, attempts];
        }
        record.attempts = String(attempts);
        return [0, attempts];
      }

      // Send-failure cleanup is reservation-checked so an old request cannot
      // remove a newer OTP/cooldown that reused the subject.
      const reservation = String(arg1 ?? '');
      if (values.get(key2) !== reservation) return 0;
      if (values.get(key1)?.reservation === reservation) values.delete(key1);
      values.delete(key2);
      return 1;
    }),
  };
  return redis;
}

function makeHarness() {
  const config = {
    get: jest.fn((key: string) => ({
      OTP_HMAC_SECRET: 'otp-test-secret-0123456789abcdef0123',
      JWT_SECRET: 'jwt-test-secret-0123456789abcdef0123',
      WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
      WHATSAPP_ACCESS_TOKEN: 'access-token',
      WHATSAPP_API_VERSION: 'v19.0',
    } as Record<string, string>)[key]),
  };
  const email = { send: jest.fn().mockResolvedValue(true) };
  const redis = makeRedis();
  const service = new OtpService(config as any, email as any, redis as any);
  return { service, config, email, redis };
}

function sentCode(email: { send: jest.Mock }): string {
  const text = email.send.mock.calls[email.send.mock.calls.length - 1][0].text as string;
  return text.match(/\b\d{6}\b/)![0];
}

describe('OtpService shared, one-time OTP state', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores a keyed digest in shared Redis and consumes a successful email code exactly once', async () => {
    const { service, email, redis } = makeHarness();

    await service.sendEmailOtp(' User@Example.com ');
    const code = sentCode(email);
    const otpEntry = [...redis.values.entries()].find(([key]) => key.startsWith('flowops:otp:v1:email:'))!;

    expect(otpEntry[1].codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(otpEntry[1].codeHash).toBe(
      createHmac(
        'sha256',
        createHmac('sha256', 'otp-test-secret-0123456789abcdef0123')
          .update('flowops:otp-code-hmac:v1')
          .digest(),
      ).update(`email\0user@example.com\0${code}`).digest('hex'),
    );
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining('flowops:otp-cooldown:v1:email:'), expect.any(String), 'PX', 60_000, 'NX');

    await expect(service.verifyEmailOtp('user@example.com', code)).resolves.toEqual({ verified: true });
    await expect(service.verifyEmailOtp('user@example.com', code)).rejects.toThrow(BadRequestException);
    expect(redis.values.has(otpEntry[0])).toBe(false);
  });

  it('derives an OTP-specific key from the JWT secret when no OTP key is configured', async () => {
    const { service, email, redis, config } = makeHarness();
    const jwtSecret = 'jwt-fallback-secret-0123456789abcdef0123456789';
    config.get.mockImplementation((key: string) => key === 'JWT_SECRET' ? jwtSecret : undefined);

    await service.sendEmailOtp('user@example.com');
    const code = sentCode(email);
    const otpEntry = [...redis.values.entries()].find(([key]) => key.startsWith('flowops:otp:v1:email:'))!;
    const derivedKey = createHmac('sha256', jwtSecret).update('flowops:otp-code-hmac:v1').digest();
    expect(otpEntry[1].codeHash).toBe(
      createHmac('sha256', derivedKey).update(`email\0user@example.com\0${code}`).digest('hex'),
    );
    await expect(service.verifyEmailOtp('user@example.com', code)).resolves.toEqual({ verified: true });
  });

  it('enforces the resend cooldown and deletes an OTP after five failed attempts', async () => {
    const { service, email } = makeHarness();
    await service.sendEmailOtp('user@example.com');
    const code = sentCode(email);
    const wrongCode = code === '000000' ? '000001' : '000000';

    await expect(service.sendEmailOtp('USER@example.com')).rejects.toThrow(BadRequestException);
    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(service.verifyEmailOtp('user@example.com', wrongCode)).rejects.toThrow(BadRequestException);
    }
    await expect(service.verifyEmailOtp('user@example.com', wrongCode)).rejects.toThrow('Too many attempts');
    await expect(service.verifyEmailOtp('user@example.com', code)).rejects.toThrow('No verification code found');
  });

  it('releases the reserved code/cooldown when email delivery fails', async () => {
    const { service, email, redis } = makeHarness();
    email.send.mockResolvedValueOnce(false);

    await expect(service.sendEmailOtp('user@example.com')).rejects.toThrow(BadRequestException);
    expect(redis.values.size).toBe(0);
    expect(redis.eval).toHaveBeenCalled();
  });

  it('fails closed if Redis cannot reserve OTP state', async () => {
    const { service, redis } = makeHarness();
    redis.set.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(service.sendEmailOtp('user@example.com')).rejects.toThrow(ServiceUnavailableException);
  });

  it('normalizes South African phone numbers before sending and verification', async () => {
    const { service } = makeHarness();
    (axios.post as jest.Mock).mockResolvedValue({ status: 200 });

    await service.sendOtp('021 123 4567');
    const [, body] = (axios.post as jest.Mock).mock.calls[0];
    expect(body.to).toBe('27211234567');
    const code = body.text.body.match(/\b\d{6}\b/)![0];
    await expect(service.verifyOtp('+27 (21) 123-4567', code)).resolves.toEqual({ verified: true });
  });
});
