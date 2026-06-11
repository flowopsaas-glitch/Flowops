import { Controller, Get, Req, Query } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { LiveTrackingQueryDto } from './dto/live-tracking.dto';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('live')
  async getLiveTracking(@Req() req: any, @Query() query: LiveTrackingQueryDto) {
    const companyId = Number(req.user?.companyId ?? 1);
    return this.trackingService.live(companyId, query);
  }
}
