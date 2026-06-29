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

    return user;
  }
}
