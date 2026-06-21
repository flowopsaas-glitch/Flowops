import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtPayload, OwnerJwtPayload } from './types/jwt-payload';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  // ── Tenant login ──────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    // Find user by email across all active companies
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), isActive: true },
      include: { company: true },
    });

    if (!user || !user.company.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.issueTokenPair(user);

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      user: this.safeUser(user),
    };
  }

  // ── Driver portal login (phone + 4-digit PIN) ────────────────────────

  async driverLogin(phone: string, pin: string) {
    // Normalize phone: remove spaces, ensure +27 prefix
    const normalised = phone.replace(/\s/g, '');

    const driver = await this.prisma.driver.findFirst({
      where: {
        phone: { in: [normalised, normalised.replace(/^\+/, '')] },
        isActive: true,
      },
      include: { company: true },
    });

    if (!driver) throw new UnauthorizedException('Invalid phone number or PIN');
    if (!(driver as any).driverPin) throw new UnauthorizedException('PIN not set — contact dispatch to set your PIN');

    const pinOk = await bcrypt.compare(pin, (driver as any).driverPin);
    if (!pinOk) throw new UnauthorizedException('Invalid phone number or PIN');

    // Issue a short-lived JWT scoped to this driver
    const payload = {
      sub:       driver.id,
      phone:     driver.phone,
      companyId: driver.companyId,
      type:      'driver',
      name:      driver.name,
    };
    const accessToken = this.jwt.sign(payload, {
      secret:    this.config.get<string>('JWT_SECRET'),
      expiresIn: '12h',
    });

    return {
      access_token: accessToken,
      driver: {
        id:          driver.id,
        driverId:    driver.id,
        name:        driver.name,
        phone:       driver.phone,
        vehicleType: driver.vehicleType,
        vehicleReg:  driver.vehicleReg,
        status:      driver.status,
        companyId:   driver.companyId,
        companyName: driver.company?.name,
      },
    };
  }

  // ── Register (creates ApprovalRequest, awaiting admin approval) ───────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.approvalRequest.findFirst({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException(
        'An account request for this email already exists',
      );
    }

    // Hash password for safe storage even before approval
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const request = await this.prisma.approvalRequest.create({
      data: {
        fullName: dto.fullName,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        company: dto.company,
        // We store the hashed password as a note so the approve endpoint
        // can use it when creating the User record.
        notes: JSON.stringify({ passwordHash }),
      },
    });

    this.logger.log(`New registration request: ${dto.email} — ${dto.company}`);

    // Notify platform owner about the new request
    const ownerEmail = this.config.get<string>('OWNER_SEED_EMAIL');
    if (ownerEmail) {
      await this.email.sendApprovalRequestNotification(ownerEmail, {
        name: dto.fullName,
        email: dto.email,
        company: dto.company,
      });
    }

    return {
      message: 'Registration request submitted. You will be notified by email once approved.',
      requestId: request.id,
    };
  }

  // ── Token refresh ─────────────────────────────────────────────────────

  async refresh(dto: RefreshDto) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { user: { include: { company: true } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    // Rotate: delete old, issue new pair
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    if (!stored.user.isActive || !stored.user.company.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const tokens = await this.issueTokenPair(stored.user);
    return { access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
  }

  // ── Get current user (GET /auth/me) ───────────────────────────────────

  async me(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      include: {
        company: {
          select: {
            id: true, name: true, tradingName: true,
            logoUrl: true, primaryColor: true,
            portalPrimaryColor: true, portalBrandName: true, plan: true,
          },
        },
        notificationPreference: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return this.safeUser(user);
  }

  // ── Logout ────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: { token: refreshToken, userId },
      });
    } else {
      // Revoke all refresh tokens for this user
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
    return { message: 'Logged out successfully' };
  }

  // ── Owner login ───────────────────────────────────────────────────────

  async ownerLogin(dto: LoginDto) {
    const owner = await this.prisma.ownerUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!owner) throw new UnauthorizedException('Invalid credentials');

    const passwordOk = await bcrypt.compare(dto.password, owner.passwordHash);
    if (!passwordOk) throw new UnauthorizedException('Invalid credentials');

    const payload: OwnerJwtPayload = {
      sub: owner.id,
      email: owner.email,
      type: 'owner',
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = await this.issueOwnerRefreshToken(owner.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: owner.id, email: owner.email, name: owner.name, role: 'OWNER' },
    };
  }

  // ── Owner refresh ─────────────────────────────────────────────────────

  async ownerRefresh(dto: RefreshDto) {
    const stored = await this.prisma.ownerRefreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { owner: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    await this.prisma.ownerRefreshToken.delete({ where: { id: stored.id } });

    const payload: OwnerJwtPayload = {
      sub: stored.owner.id,
      email: stored.owner.email,
      type: 'owner',
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = await this.issueOwnerRefreshToken(stored.owner.id);
    return { access_token: accessToken, refresh_token: refreshToken };
  }

  // ── Email verification ────────────────────────────────────────────────

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Verification link is invalid or has expired. Request a new one.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verifyToken: null,
        verifyTokenExpiry: null,
      },
    });

    this.logger.log(`Email verified for user ${user.email}`);
    return { message: 'Email verified successfully. You can now sign in.' };
  }

  async resendVerification(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) {
      return { message: 'Email is already verified.' };
    }
    await this.sendVerificationEmail(user);
    return { message: 'Verification email resent.' };
  }

  // ── Password reset ────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    // Always return 200 — never reveal whether the email exists (user enumeration)
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      const token = uuid();
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 1); // 1 hour

      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpiry: expiry },
      });

      await this.email.sendPasswordResetEmail(user.email, token, user.name);
    }

    return {
      message:
        'If an account exists for that email, a password reset link has been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Reset link is invalid or has expired. Request a new password reset.',
      );
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    // Revoke all existing refresh tokens for security
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    this.logger.log(`Password reset for user ${user.email}`);
    return { message: 'Password reset successfully. You can now sign in.' };
  }

  // ── Seeding: create the initial owner account ─────────────────────────

  async seedOwnerIfNeeded() {
    const email = this.config.get<string>('OWNER_SEED_EMAIL');
    const password = this.config.get<string>('OWNER_SEED_PASSWORD');
    if (!email || !password) return;

    const existing = await this.prisma.ownerUser.findUnique({ where: { email } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.ownerUser.create({
      data: { email, passwordHash, name: 'Platform Owner' },
    });
    this.logger.log(`Owner account seeded: ${email}`);
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private async sendVerificationEmail(user: any) {
    const token = uuid();
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24); // 24 hours

    await this.prisma.user.update({
      where: { id: user.id },
      data: { verifyToken: token, verifyTokenExpiry: expiry },
    });

    await this.email.sendVerificationEmail(user.email, token, user.name);
  }

  private async issueTokenPair(user: any) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
      type: 'tenant',
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private async issueOwnerRefreshToken(ownerId: string): Promise<string> {
    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.prisma.ownerRefreshToken.create({
      data: { token, ownerId, expiresAt },
    });
    return token;
  }

  private safeUser(user: any) {
    const { passwordHash, verifyToken, resetToken, ...safe } = user;
    return safe;
  }
}
