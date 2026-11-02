import {
  Body, Controller, Get, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BorderDwellService } from './border-dwell.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * WP3: Cross-border dwell measurement endpoints.
 *
 * All routes are tenant-scoped: companyId comes from the current user,
 * never from the body or query params.
 *
 * Driver-facing position updates go through DriverSafetyController which
 * calls BorderDwellService.checkBorderGeofences() on every GPS ping.
 */
@ApiTags('Border Dwell (WP3)')
@ApiBearerAuth()
@Controller('border-dwell')
export class BorderDwellController {
  constructor(private readonly svc: BorderDwellService) {}

  /** GET /border-dwell/posts — all border posts for the tenant */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Get('posts')
  getPosts(@CurrentUser() u: any) {
    return this.svc.getBorderPosts(u.companyId);
  }

  /** GET /border-dwell/posts/:postId — a specific border post with geofences and recent sessions */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Get('posts/:postId')
  getPost(@CurrentUser() u: any, @Param('postId') postId: string) {
    return this.svc.getBorderPost(u.companyId, postId);
  }

  /** GET /border-dwell/posts/:postId/aggregates — dwell aggregates (median/P90/n + completeness split) */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Get('posts/:postId/aggregates')
  getAggregates(
    @CurrentUser() u: any,
    @Param('postId') postId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('threshold') threshold?: string,
  ) {
    return this.svc.getDwellAggregates(
      u.companyId,
      postId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      threshold ? Number(threshold) : 5,
    );
  }

  /** GET /border-dwell/sessions — dwell sessions for the tenant */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Get('sessions')
  getSessions(
    @CurrentUser() u: any,
    @Query('postId') postId?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getDwellSessions(
      u.companyId,
      postId,
      state,
      limit ? Number(limit) : 50,
    );
  }

  /** POST /border-dwell/check — evaluate a driver position against border geofences (used by GPS ping) */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH, UserRole.DRIVER)
  @Post('check')
  checkPosition(
    @CurrentUser() u: any,
    @Body() body: {
      driverId: string;
      lat: number;
      lng: number;
      speed?: number;
    },
  ) {
    return this.svc.checkBorderGeofences(u.companyId, body.driverId, body.lat, body.lng, body.speed);
  }
}
