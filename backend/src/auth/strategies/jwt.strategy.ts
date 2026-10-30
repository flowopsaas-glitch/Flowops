import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../types/jwt-payload';

/** Validates bearer tokens on tenant routes. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== 'tenant') throw new UnauthorizedException();

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, companyId: payload.companyId, isActive: true },
      include: { company: { select: { id: true, name: true, isActive: true } } },
    });

    if (!user || !user.company.isActive) {
      throw new UnauthorizedException('Account is inactive or company suspended');
    }

    // Single active session: a token is only valid for the most recent login.
    // (Tokens minted before this feature shipped carry no sid — allow them to
    // ride out their short lifetime; the next login/refresh attaches a sid.)
    if (payload.sid && user.activeSessionId && payload.sid !== user.activeSessionId) {
      throw new UnauthorizedException('Your account was signed in on another device');
    }

    // ── Presence heartbeat (throttled) ──────────────────────────────────────
    // Stamp lastActiveAt so the owner console can show live online status.
    // Only write if it's been >2 min since the last stamp — this runs on every
    // authenticated request, so the throttle keeps it to ~one cheap write per
    // active user per 2 min. Fire-and-forget: never block or fail the request.
    const HEARTBEAT_MS = 2 * 60 * 1000;
    const last = (user as any).lastActiveAt as Date | null;
    if (!last || Date.now() - new Date(last).getTime() > HEARTBEAT_MS) {
      void this.prisma.user
        .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
        .catch(() => undefined);
    }

    // Strip the credentials before the row becomes `req.user`. Every guard,
    // interceptor and handler downstream can read it, and any of them can
    // serialise it into a response, an audit record or a log line. AuthService
    // and the strategies read what they need straight from Prisma, so nothing
    // downstream needs these four fields to be there.
    const { passwordHash, verifyToken, resetToken, activeSessionId, ...safeUser } = user;
    return safeUser;
  }
}
