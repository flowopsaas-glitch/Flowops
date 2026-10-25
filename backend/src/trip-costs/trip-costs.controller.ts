import {
  Body, Controller, Delete, Get, Param, Post, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TripCostType, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateTripCostDto } from './dto/create-trip-cost.dto';
import { TripCostsService } from './trip-costs.service';

const TRIP_COST_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.VIEWER,
];
const TRIP_COST_WRITE_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH,
];

interface AuthenticatedUser {
  id?: string;
  companyId: string;
  role?: string;
}

/**
 * Measured trip costs (fuel / tolls / other). Deliberately NOT plan-gated:
 * cost capture is core operational data — the same tier as waybills and
 * drivers — because per-trip margins are only real if every fleet, on
 * every plan, can record what a trip actually cost.
 */
@ApiTags('Trip Costs')
@ApiBearerAuth()
@Controller('trip-costs')
export class TripCostsController {
  constructor(private readonly svc: TripCostsService) {}

  @Roles(...TRIP_COST_READ_ROLES)
  @Get()
  list(@CurrentUser() u: AuthenticatedUser, @Query() q: any) {
    return this.svc.list(u.companyId, {
      driverId: q?.driverId,
      type: q?.type as TripCostType | undefined,
      waybillId: q?.waybillId,
      from: q?.from,
      to: q?.to,
      page: q?.page ? Number(q.page) : undefined,
      limit: q?.limit ? Number(q.limit) : undefined,
    });
  }

  @Roles(...TRIP_COST_READ_ROLES)
  @Get('summary')
  summary(
    @CurrentUser() u: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.summary(u.companyId, from, to);
  }

  @Roles(...TRIP_COST_WRITE_ROLES)
  @Post()
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateTripCostDto) {
    return this.svc.create(u.companyId, dto, undefined, { id: u.id, role: u.role });
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Delete(':id')
  remove(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(u.companyId, id);
  }
}
