import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Authenticates the standalone driver PWA (phone + PIN session).
 *
 * The driver token is a JWT minted by AuthService.driverLogin with
 * `{ type: 'driver', sub: driverId, companyId, sid }`. This guard:
 *   1. requires a Bearer token,
 *   2. verifies the signature + type,
 *   3. loads the (active) driver,
 *   4. enforces SINGLE ACTIVE SESSION — the token's `sid` must match the
 *      driver's current `activeSessionId`; a newer login elsewhere rotates it,
 *      so the older device is rejected,
 * then attaches the driver to `req.driver`.
 *
 * Routes using this guard must also be `@Public()` so the global tenant
 * JwtAuthGuard (which only accepts `type: 'tenant'`) is skipped first.
 */
@Injectable()
export class DriverAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) throw new UnauthorizedException('Driver authentication required');

    let payload: any;
    try {
      payload = this.jwt.verify(token, { secret: this.config.get('JWT_SECRET') });
    } catch {
      throw new UnauthorizedException('Invalid or expired driver token');
    }

    if (payload?.type !== 'driver' || !payload?.sub) {
      throw new UnauthorizedException('Not a driver session');
    }

    const driver = await this.prisma.driver.findFirst({
      where: { id: payload.sub, isActive: true },
    });
    if (!driver) throw new UnauthorizedException('Driver account not found or inactive');

    // Single active session: reject tokens from a superseded login.
    const activeSid = (driver as any).activeSessionId as string | null;
    if (payload.sid && activeSid && payload.sid !== activeSid) {
      throw new UnauthorizedException('Your account was signed in on another device');
    }

    // `driverPin` is the bcrypt hash of the driver's 4-6 digit portal PIN and
    // `ratingToken` a bearer capability. Portal handlers read only
    // id/companyId/name off `req.driver`, and PIN login reads Prisma directly,
    // so the credential has no reason to ride along on every authenticated
    // request - where a single careless `return req.driver` would serve it.
    const { driverPin, ratingToken, ...safeDriver } = driver;
    req.driver = safeDriver;
    return true;
  }
}
