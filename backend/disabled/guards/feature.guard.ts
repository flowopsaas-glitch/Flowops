import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const feature = request?.feature;
    if (!feature) {
      return true;
    }

    const enabled = await this.prisma.featureFlags.findFirst({
      where: {
        key: feature,
        enabled: true,
      },
    });

    if (!enabled) {
      throw new ForbiddenException('Feature disabled');
    }

    return true;
  }
}
