import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnerJwtPayload } from '../types/jwt-payload';

/** Validates bearer tokens on owner-only routes. */
@Injectable()
export class JwtOwnerStrategy extends PassportStrategy(Strategy, 'jwt-owner') {
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

  async validate(payload: OwnerJwtPayload) {
    if (payload.type !== 'owner') throw new UnauthorizedException();

    const owner = await this.prisma.ownerUser.findUnique({
      where: { id: payload.sub },
    });

    if (!owner) throw new UnauthorizedException('Owner account not found');
    // The owner console's `req.user` must not carry the account's password
    // hash: any handler - or any error reporter that dumps the request - would
    // serve it. Owner login verifies the password against a row it reads from
    // Prisma itself, so nothing downstream needs the hash here.
    const { passwordHash, ...safeOwner } = owner;
    return safeOwner;
  }
}
