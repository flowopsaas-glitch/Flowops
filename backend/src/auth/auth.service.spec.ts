import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('password-hash'),
  compare: jest.fn(),
}));

function makeHarness() {
  const tx = {
    user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
  };
  const email = { sendPasswordResetEmail: jest.fn().mockResolvedValue(true) };
  const service = new AuthService(prisma as any, {} as any, {} as any, email as any, {} as any);
  return { service, prisma, tx, email };
}

describe('AuthService password reset security', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([undefined, null, '', '   '])('rejects an omitted or empty token (%s) before Prisma is queried', async (token) => {
    const { service, prisma } = makeHarness();
    await expect(service.resetPassword(token as any, 'StrongPassword123!')).rejects.toThrow(BadRequestException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('hashes reset tokens at rest and sends the raw token only to the email service', async () => {
    const { service, prisma, email } = makeHarness();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1', email: 'user@example.com', name: 'Test User',
    });

    await service.forgotPassword(' USER@example.com ');

    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
    const persisted = (prisma.user.update as jest.Mock).mock.calls[0][0].data;
    const rawToken = (email.sendPasswordResetEmail as jest.Mock).mock.calls[0][1];
    expect(rawToken).toHaveLength(43);
    expect(persisted.resetToken).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(persisted.resetToken).not.toBe(rawToken);
    expect(persisted.resetTokenExpiry.getTime()).toBeGreaterThan(Date.now());
  });

  it('consumes a valid token once while changing the password and revoking refresh tokens atomically', async () => {
    const { service, prisma, tx } = makeHarness();
    const token = 'one-time-reset-token';
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'user@example.com' });

    await service.resetPassword(token, 'StrongPassword123!');

    expect(bcrypt.hash).toHaveBeenCalledWith('StrongPassword123!', expect.any(Number));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const claim = tx.user.updateMany.mock.calls[0][0];
    expect(claim.where.id).toBe('user-1');
    expect(claim.where.resetToken.in).toContain(createHash('sha256').update(token).digest('hex'));
    expect(claim.data).toMatchObject({
      passwordHash: 'password-hash',
      resetToken: null,
      resetTokenExpiry: null,
    });
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('rejects expired or already-used tokens without starting a transaction', async () => {
    const { service, prisma } = makeHarness();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.resetPassword('expired-or-used-token', 'StrongPassword123!')).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a token that loses the atomic one-time-consumption race', async () => {
    const { service, prisma, tx } = makeHarness();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.resetPassword('racing-token', 'StrongPassword123!')).rejects.toThrow(BadRequestException);
    expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});
