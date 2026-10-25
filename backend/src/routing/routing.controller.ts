import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoutingService, Stop } from './routing.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Routing')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('routeOptimization')
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
@Controller('routing')
export class RoutingController {
  constructor(private readonly svc: RoutingService) {}

  /** Optimize the visiting order for an arbitrary set of geocoded stops. */
  @Post('optimize')
  @HttpCode(200)
  optimize(
    @Body() body: { stops: Stop[]; start?: { lat: number; lng: number } },
  ) {
    return this.svc.optimize(body.stops ?? [], body.start ?? null);
  }

  /** Optimize a tenant's collection pickups for a driver/route. */
  @Post('optimize/collections')
  @HttpCode(200)
  optimizeCollections(
    @CurrentUser() u: any,
    @Body()
    body: {
      collectionIds?: string[];
      driverId?: string;
      start?: { lat: number; lng: number };
    },
  ) {
    return this.svc.optimizeCollections(u.companyId, {
      collectionIds: body.collectionIds,
      driverId: body.driverId,
      start: body.start,
    });
  }

  /** Optimize a driver's delivery route (shipments) — AI-prioritized. */
  @Post('optimize/deliveries')
  @HttpCode(200)
  optimizeDeliveries(
    @CurrentUser() u: any,
    @Body()
    body: {
      driverId?: string;
      waybillIds?: string[];
      start?: { lat: number; lng: number };
    },
  ) {
    return this.svc.optimizeDeliveries(u.companyId, {
      driverId: body.driverId,
      waybillIds: body.waybillIds,
      start: body.start,
    });
  }
}
