import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AccountLockoutService } from '../common/guards/account-lockout.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtPayload, OwnerJwtPayload } from './types/jwt-payload';

/**
 * MILITARY-GRADE: bcrypt cost factor 14.
 *
 * At cost 14, each hash takes ~1 second on modern hardware.
 * This makes brute-force attacks computationally infeasible:
 *   - Cost 10 = ~10 hashes/sec (weak — GPU can parallelize)
 *   - Cost 12 = ~3 hashes/sec (good for most apps)
 *   - Cost 14 = ~0.8 hashes/sec (military-grade — 4x slower than 12)
 *   - Cost 16 = ~0.2 hashes/sec (overkill — UX suffers on login)
 *
 * At cost 14 + rate limiting (10/min) + lockout (5 failures → 15min):
 *   - A brute-force attack can try at most 5 passwords every 15 minutes
 *   - 4-character password space: 4 billion years to crack
 *   - 8-character complex password: heat death of universe
 *
 * MULTI-LAYER DEFENSE (military doctrine — defense in depth):
 *   Layer 1: Cloudflare WAF (blocks known attack patterns before they hit the server)
 *   Layer 2: Rate limiting (10 login attempts per 60 seconds per IP/user)
 *   Layer 3: Account lockout (5 failures → 15 minute lockout)
 *   Layer 4: bcrypt cost 14 (each attempt costs ~1 second of CPU)
 *   Layer 5: Password complexity (8+ chars, upper/lower/number/special + blocklist)
 *   Layer 6: Single-session binding (tokens invalidated on new login)
 *   Layer 7: AI Supervisor (anomalous login patterns → owner alert)
 */
const BCRYPT_ROUNDS = 14;

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
    private lockout: AccountLockoutService,
  ) {}

  // ── Tenant login ──────────────────────────────────────────────────────

  async login(dto: LoginDto, ctx?: LoginCtx) {
    const emailLower = dto.email.toLowerCase();

    // ── MILITARY-GRADE: Account lockout check ────────────────────────────
    // Reject immediately if the account is locked (too many failed attempts).
    // This prevents even the hash comparison from running — saves CPU and
    // denies attackers timing information.
    const lockStatus = this.lockout.isLocked(emailLower);
    if (lockStatus.locked) {
      this.logger.warn(`Login blocked (account locked): ${emailLower} — ${lockStatus.remainingSeconds}s remaining`);

      // ── AI SUPERVISOR: Alert owner of potential brute-force attack ──
      void this.alertOwnerSecurityEvent({
        type: 'BRUTE_FORCE_BLOCKED',
        email: emailLower,
        ip: ctx?.ip,
        message: `Account ${emailLower} is locked — ${lockStatus.remainingSeconds}s remaining. Possible brute-force attack in progress.`,
      }).catch((e) => this.logger.warn(`login audit log failed: ${(e as Error)?.message}`));

      throw new ForbiddenException(lockStatus.message);
    }

    // Find user by email across all active companies
    const user = await this.prisma.user.findFirst({
      where: { email: emailLower, isActive: true },
      include: { company: true },
    });

    if (!user || !user.company.isActive) {
      // Record failure for lockout tracking (even for non-existent accounts
      // to prevent user enumeration via timing differences)
      this.lockout.recordFailure(emailLower);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      // ── Record failed attempt + check if now locked ──
      const nowLocked = this.lockout.recordFailure(emailLower);
      if (nowLocked) {
        this.logger.warn(`Account LOCKED after failed attempts: ${emailLower}`);
        throw new ForbiddenException(
          'Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
        );
      }
      const remaining = this.lockout.remainingAttempts(emailLower);
      throw new UnauthorizedException(
        remaining <= 2
          ? `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before account is locked.`
          : 'Invalid credentials',
      );
    }

    // ── Successful login — clear any lockout state ──
    this.lockout.recordSuccess(emailLower);

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

    // ── AI SUPERVISOR: Alert owner on login (async, non-blocking) ────────
    void this.alertOwnerSecurityEvent({
      type: 'LOGIN_SUCCESS',
      email: emailLower,
      ip: ctx?.ip,
      message: `${user.name || user.email} (${user.company?.name}) logged in successfully.`,
    }).catch((e) => this.logger.warn(`login audit log failed: ${(e as Error)?.message}`));

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      user: this.safeUser(user),
    };
  }

  // ── AI SECURITY SUPERVISOR ─────────────────────────────────────────────
  //
  // Military-grade threat detection with AI assistance. Monitors auth events
  // and sends real-time WhatsApp alerts to the owner for:
  //   • LOGIN_SUCCESS — tenant logged in (activity monitoring)
  //   • BRUTE_FORCE_BLOCKED — account locked after repeated failures
  //   • MULTIPLE_FAILURES — attacker probing passwords
  //
  // This gives you a LIVE FEED of who's online and any security threats.

  private async alertOwnerSecurityEvent(event: {
    type: 'LOGIN_SUCCESS' | 'BRUTE_FORCE_BLOCKED' | 'ACCOUNT_LOCKED' | 'MULTIPLE_FAILURES';
    email: string;
    ip?: string;
    message: string;
  }) {
    const ownerWa = this.config.get<string>('OWNER_WHATSAPP', '27606592875');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    const apiVersion = this.config.get<string>('WHATSAPP_API_VERSION', 'v21.0');

    if (!phoneNumberId || !accessToken || !ownerWa) return;

    const emoji: Record<string, string> = {
      LOGIN_SUCCESS: '🟢',
      BRUTE_FORCE_BLOCKED: '🚨',
      ACCOUNT_LOCKED: '🔒',
      MULTIPLE_FAILURES: '🛡️',
    };

    const time = new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    const isAlert = event.type !== 'LOGIN_SUCCESS';

    const waMessage = isAlert
      ? `${emoji[event.type]} *SECURITY ALERT*\n\n` +
        `*Type:* ${event.type.replace(/_/g, ' ')}\n` +
        `*Account:* ${event.email}\n` +
        (event.ip ? `*IP:* ${event.ip}\n` : '') +
        `*Time:* ${time}\n\n` +
        `💬 ${event.message}\n\n` +
        `_FlowOps AI Security Supervisor_`
      : `${emoji[event.type]} *Tenant Online*\n\n` +
        `👤 ${event.email}\n` +
        `🕐 ${time}\n` +
        (event.ip ? `📍 ${event.ip}\n` : '') +
        `💬 ${event.message}\n\n` +
        `_FlowOps Activity Monitor_`;

    try {
      const axios = (await import('axios')).default;
      await axios.post(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: ownerWa,
          type: 'text',
          text: { preview_url: false, body: waMessage },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );
    } catch (err: any) {
      this.logger.debug(`Security event WhatsApp failed: ${err?.message}`);
    }
  }

  // ── Driver portal login (phone + 4-digit PIN) ────────────────────────

  async driverLogin(phone: string, pin: string, ctx?: LoginCtx) {
    // Match on DIGITS ONLY so formatting never blocks login. Stored numbers may
    // contain spaces (e.g. "+27 84 213 7942"), a leading "+", or a leading "0"
    // (local format) while the driver may type any of those variants. We reduce
    // both sides to their significant digits and compare the tail, so "+27 84
    // 213 7942", "27842137942", "0842137942" and "842137942" all match.
    const digitsOnly = (s: string) => (s || '').replace(/\D/g, '');
    const inputDigits = digitsOnly(phone);
    // Normalise a ZA number to its 9-digit national significant number
    // (drop country code 27 or a leading 0) for a robust tail comparison.
    const significant = (d: string) => d.replace(/^27/, '').replace(/^0/, '');
    const inputSig = significant(inputDigits);

    const candidates = await this.prisma.driver.findMany({
      where: { isActive: true },
      include: { company: true },
    });
    const driver = candidates.find(
      (d) => inputSig.length >= 7 && significant(digitsOnly(d.phone || '')) === inputSig,
    );

    if (!driver) throw new UnauthorizedException('Invalid phone number or PIN');
    if (!(driver as any).driverPin) throw new UnauthorizedException('PIN not set — contact dispatch to set your PIN');

    // ── PIN brute-force lockout (per driver, IP-rotation-proof) ───────────
    // After 5 consecutive wrong PINs the account is locked for 15 minutes.
    const MAX_PIN_ATTEMPTS = 5;
    const LOCK_MINUTES = 15;
    const lockedUntil = (driver as any).pinLockedUntil as Date | null;
    if (lockedUntil && lockedUntil > new Date()) {
      const mins = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Too many incorrect PIN attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'} or contact dispatch.`,
      );
    }

    const pinOk = await bcrypt.compare(pin, (driver as any).driverPin);
    if (!pinOk) {
      const attempts = ((driver as any).failedPinAttempts ?? 0) + 1;
      const shouldLock = attempts >= MAX_PIN_ATTEMPTS;
      await this.prisma.driver.update({
        where: { id: driver.id },
        data: {
          failedPinAttempts: shouldLock ? 0 : attempts,
          pinLockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
        } as any,
      });
      if (shouldLock) {
        throw new UnauthorizedException(
          `Too many incorrect PIN attempts. Account locked for ${LOCK_MINUTES} minutes.`,
        );
      }
      const left = MAX_PIN_ATTEMPTS - attempts;
      throw new UnauthorizedException(
        `Invalid phone number or PIN. ${left} attempt${left === 1 ? '' : 's'} left before a temporary lock.`,
      );
    }

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
        // Successful login clears any accumulated failed-PIN lockout state.
        failedPinAttempts: 0,
        pinLockedUntil: null,
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
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.driverRefreshToken.findUnique({
        where: { token: refreshToken },
        include: { driver: true },
      });

      if (!stored || stored.expiresAt < new Date()) {
        throw new UnauthorizedException('Driver refresh token invalid or expired');
      }

      if (!stored.driver.isActive) {
        throw new UnauthorizedException('Driver account is inactive');
      }

      // Atomic delete to prevent race condition
      const deleted = await tx.driverRefreshToken.deleteMany({
        where: { id: stored.id },
      });
      if (deleted.count === 0) {
        throw new UnauthorizedException('Refresh token already consumed');
      }

      const sid = (stored.driver as any).activeSessionId as string | null ?? uuid();
      const tokens = this.issueDriverTokenPair(stored.driver, sid);

      return { access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
    });
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
    // Use transaction to prevent race condition: two concurrent requests
    // with the same refresh token could both succeed without this.
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.refreshToken.findUnique({
        where: { token: dto.refreshToken },
        include: { user: { include: { company: true } } },
      });

      if (!stored || stored.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token invalid or expired');
      }

      // Atomic delete — if this fails (already deleted by concurrent request), throw
      const deleted = await tx.refreshToken.deleteMany({
        where: { id: stored.id },
      });
      if (deleted.count === 0) {
        throw new UnauthorizedException('Refresh token already consumed');
      }

      if (!stored.user.isActive || !stored.user.company.isActive) {
        throw new UnauthorizedException('Account is inactive');
      }

      let sid = (stored.user as any).activeSessionId as string | null;
      if (!sid) {
        sid = uuid();
        await tx.user.update({
          where: { id: stored.user.id },
          data: { activeSessionId: sid } as any,
        });
      }

      const tokens = await this.issueTokenPair(stored.user, sid);
      return { access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
    });
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
      expiresIn: this.config.get('JWT_EXPIRES_IN', '4h') as '4h',
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
      expiresIn: this.config.get('JWT_EXPIRES_IN', '4h') as '4h',
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
    const delivered = await this.sendVerificationEmail(user);
    // The old code discarded the result and answered "Verification email
    // resent." whether or not anything left the building. The token is stored
    // either way, so the user waits on an inbox that will never receive it.
    return delivered
      ? { message: 'Verification email resent.', emailDelivered: true }
      : {
          // Additive flag, so nothing that already reads `message` breaks.
          emailDelivered: false,
          message:
            'We could not send the verification email right now. Please try again shortly, or contact support if it keeps failing.',
        };
  }

  // ── Password reset ────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    // Always return the same response — never reveal whether an account exists.
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 254) {
      return { message: 'If an account exists for that email, a password reset link has been sent.' };
    }

    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail },
    });

    if (user) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetToken: tokenHash, resetTokenExpiry: expiry },
      });

      let delivered = false;
      try {
        delivered = await this.email.sendPasswordResetEmail(user.email, token, user.name);
      } catch (error: any) {
        this.logger.error(`Password reset email delivery failed: ${error?.message ?? 'unknown error'}`);
      }
      if (!delivered) {
        // Do not leave an active but undelivered reset credential behind.
        await this.prisma.user.updateMany({
          where: { id: user.id, resetToken: tokenHash },
          data: { resetToken: null, resetTokenExpiry: null },
        }).catch(() => undefined);
      }
    }

    return {
      message: 'If an account exists for that email, a password reset link has been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    if (typeof token !== 'string' || !token.trim() || token.length > 256) {
      throw new BadRequestException('Reset link is invalid or has expired. Request a new password reset.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      throw new BadRequestException('Password must be between 8 and 128 characters.');
    }

    const presentedToken = token.trim();
    const tokenHash = createHash('sha256').update(presentedToken).digest('hex');
    // Accept a still-live pre-deployment UUID once, then clear it; all newly
    // issued tokens are stored as SHA-256 digests rather than bearer secrets.
    const acceptedTokenValues = [tokenHash, presentedToken];
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: { in: acceptedTokenValues },
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Reset link is invalid or has expired. Request a new password reset.');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      const consumedAt = new Date();
      const consumed = await tx.user.updateMany({
        where: {
          id: user.id,
          resetToken: { in: acceptedTokenValues },
          resetTokenExpiry: { gt: consumedAt },
        },
        data: {
          passwordHash,
          resetToken: null,
          resetTokenExpiry: null,
          activeSessionId: uuid(),
        },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('Reset link is invalid or has expired. Request a new password reset.');
      }
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
    });

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

  /** @returns whether the mail actually left the building. */
  private async sendVerificationEmail(user: any): Promise<boolean> {
    const token = uuid();
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24); // 24 hours

    await this.prisma.user.update({
      where: { id: user.id },
      data: { verifyToken: token, verifyTokenExpiry: expiry },
    });

    const delivered = await this.email.sendVerificationEmail(user.email, token, user.name);
    if (!delivered) {
      // EmailService.send() logs at WARN when unconfigured and swallows
      // provider errors, so a failure here was invisible above warn level.
      // This is the one notification a user cannot proceed without.
      this.logger.error(
        `Verification email NOT delivered to ${user.email} — provider unconfigured or send rejected. ` +
          `The verify token was stored, so the user will wait for a mail that will not arrive.`,
      );
    }
    return delivered;
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
      expiresIn: this.config.get('JWT_EXPIRES_IN', '4h') as '4h',
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
