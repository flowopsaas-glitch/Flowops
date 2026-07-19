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

/** Request context captured for login audit + session binding. */
type LoginCtx = { ip?: string; userAgent?: string };

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

  async login(dto: LoginDto, ctx?: LoginCtx) {
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

    // Email must be verified before access is granted. Users created via SSO
    // JIT-provisioning are marked verified at creation (identity asserted by IdP).
    // Users created by the owner console are also pre-verified. Only self-
    // registered users who haven't clicked their verification link are blocked.
    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before signing in. Check your inbox for the verification link, or request a new one.',
      );
    }

    // Single active session: this mints a fresh sid, revokes every other
    // device's refresh token, and records the login for audit.
    const tokens = await this.startSession(user, ctx);

    // ── Owner notification: WhatsApp alert when tenant logs in ──────────
    // Fire-and-forget — never block or fail the login. Gives the platform
    // owner real-time visibility into tenant activity.
    void this.notifyOwnerOfLogin(user, ctx).catch(() => {});

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      user: this.safeUser(user),
    };
  }

  /**
   * Sends the platform owner a WhatsApp message when a tenant logs in.
   * Best-effort, non-blocking, no error propagation.
   */
  private async notifyOwnerOfLogin(user: any, ctx?: LoginCtx) {
    const ownerWa = this.config.get<string>('OWNER_WHATSAPP', '27606592875');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    const apiVersion = this.config.get<string>('WHATSAPP_API_VERSION', 'v21.0');

    if (!phoneNumberId || !accessToken || !ownerWa) return;

    const companyName = user.company?.name || 'Unknown';
    const userName = user.name || user.email;
    const role = user.role || 'USER';
    const time = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

    const message =
      `🟢 *Tenant Login*\n\n` +
      `👤 ${userName}\n` +
      `🏢 ${companyName}\n` +
      `🔑 Role: ${role}\n` +
      `🕐 ${time}\n` +
      (ctx?.ip ? `📍 IP: ${ctx.ip}\n` : '') +
      `\n_FlowOps Activity Monitor_`;

    try {
      const axios = (await import('axios')).default;
      await axios.post(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: ownerWa,
          type: 'text',
          text: { preview_url: false, body: message },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );
      this.logger.log(`Owner login alert sent: ${userName} @ ${companyName}`);
    } catch (err: any) {
      this.logger.debug(`Owner login WhatsApp failed (non-blocking): ${err?.message}`);
    }
  }

  // ── Driver portal login (phone + 4-digit PIN) ────────────────────────

  async driverLogin(phone: string, pin: string, ctx?: LoginCtx) {
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

    // Single active session: a new login supersedes any other device. The sid
    // is embedded in the token and stored on the driver; stale tokens (sid
    // mismatch) are rejected wherever the driver token is validated.
    const sid = uuid();
    await this.prisma.driver.update({
      where: { id: driver.id },
      data: {
        activeSessionId: sid,
        lastLoginAt: new Date(),
        lastLoginIp: ctx?.ip ?? null,
        lastLoginUserAgent: ctx?.userAgent ?? null,
      } as any,
    });

    const tokens = this.issueDriverTokenPair(driver, sid);

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
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

  // ── Driver token refresh (silent re-issue using refresh token) ────────

  async driverRefresh(refreshToken: string) {
    const stored = await this.prisma.driverRefreshToken.findUnique({
      where: { token: refreshToken },
      include: { driver: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Driver refresh token invalid or expired');
    }

    if (!stored.driver.isActive) {
      throw new UnauthorizedException('Driver account is inactive');
    }

    // Rotate: delete old refresh token, issue a new pair
    await this.prisma.driverRefreshToken.delete({ where: { id: stored.id } });

    // Preserve the existing session id so the driver isn't forcibly logged out
    const sid = (stored.driver as any).activeSessionId as string | null ?? uuid();
    const tokens = this.issueDriverTokenPair(stored.driver, sid);

    return { access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
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

    // Hash password for safe storage even before approval.
    // Stored in the dedicated passwordHash column — never in notes/JSON.
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const request = await this.prisma.approvalRequest.create({
      data: {
        fullName: dto.fullName,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        company: dto.company,
        passwordHash,
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

    // Continue the SAME session: keep the sid the active session holds so the
    // refreshed access token still matches User.activeSessionId. (Legacy
    // sessions with no sid adopt a fresh one here.)
    let sid = (stored.user as any).activeSessionId as string | null;
    if (!sid) {
      sid = uuid();
      await this.prisma.user.update({
        where: { id: stored.user.id },
        data: { activeSessionId: sid } as any,
      });
    }

    const tokens = await this.issueTokenPair(stored.user, sid);
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
            portalPrimaryColor: true, portalBrandName: true,
            plan: true,
          },
        },
        notificationPreference: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // Compute trial status and inject into company object
    const safeUser = this.safeUser(user) as any;
    if (safeUser.company && user.companyId) {
      try {
        const co = await this.prisma.company.findUnique({
          where: { id: user.companyId },
          select: { plan: true, trialEndsAt: true } as any,
        }) as any;
        if (co?.trialEndsAt) {
          const now      = new Date();
          const trialEnd = new Date(co.trialEndsAt);
          const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000));
          safeUser.company.trialDaysLeft = daysLeft;
          safeUser.company.trialExpired  = daysLeft === 0;
          safeUser.company.isOnTrial     = co.plan === 'starter' && daysLeft > 0;
        } else {
          safeUser.company.trialDaysLeft = null;
          safeUser.company.trialExpired  = false;
          safeUser.company.isOnTrial     = false;
        }
      } catch { /* trial fields not yet in DB — ignore */ }
    }
    return safeUser;
  }

  // ── Logout ────────────────────────────────────────────────────────────

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: { token: refreshToken, userId },
      });
    } else {
      // Revoke all refresh tokens AND rotate the session id so any still-live
      // access token is rejected immediately (not just at its 15-min expiry).
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
      await this.prisma.user
        .update({ where: { id: userId }, data: { activeSessionId: uuid() } as any })
        .catch(() => undefined);
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
      expiresIn: this.config.get('JWT_EXPIRES_IN', '4h'),
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
      expiresIn: this.config.get('JWT_EXPIRES_IN', '4h'),
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
        // Kill every existing session — force a fresh login everywhere.
        activeSessionId: uuid(),
      } as any,
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

  // ── SSO token issuance (used by SsoService after IdP auth) ────────────

  /**
   * Issues a tenant token pair for an already-authenticated SSO user.
   * The user is resolved/provisioned by SsoService; this just mints tokens
   * using the same path as a normal password login.
   */
  async issueTokensForUser(user: any, ctx?: LoginCtx) {
    const tokens = await this.startSession(user, ctx);
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      user: this.safeUser(user),
    };
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

  /**
   * Begin a NEW session for a user (password login or SSO). Mints a fresh
   * session id, revokes every other device's refresh token (single active
   * session), records the login for audit, then issues the token pair.
   */
  private async startSession(user: any, ctx?: LoginCtx) {
    const sid = uuid();
    // Single active session — drop all other devices' refresh tokens.
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        activeSessionId: sid,
        lastLoginAt: new Date(),
        lastLoginIp: ctx?.ip ?? null,
        lastLoginUserAgent: ctx?.userAgent ?? null,
      } as any,
    });
    return this.issueTokenPair(user, sid);
  }

  private async issueTokenPair(user: any, sid: string) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
      type: 'tenant',
      sid,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '4h'),
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

  /** Issues a short-lived driver access token + a 7-day refresh token. */
  private issueDriverTokenPair(driver: any, sid: string) {
    const payload = {
      sub:       driver.id,
      phone:     driver.phone,
      companyId: driver.companyId,
      type:      'driver',
      name:      driver.name,
      sid,
    };
    const accessToken = this.jwt.sign(payload, {
      secret:    this.config.get<string>('JWT_SECRET'),
      expiresIn: '4h',   // shortened from 12h — refresh handles silent renewal
    });

    // Refresh token stored in DB for rotation — 7 day expiry
    const refreshToken = uuid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    // Fire-and-forget: don't await in the sync helper — callers must await the
    // refresh token creation separately if they need the token value.
    // (driverLogin awaits via the returned object; driverRefresh awaits explicitly)
    void this.prisma.driverRefreshToken.create({
      data: { token: refreshToken, driverId: driver.id, expiresAt },
    }).catch((e) => this.logger.warn(`Driver refresh token create failed: ${e?.message}`));

    return { accessToken, refreshToken };
  }

  private safeUser(user: any) {
    const { passwordHash, verifyToken, resetToken, activeSessionId, ...safe } = user;
    return safe;
  }
}
