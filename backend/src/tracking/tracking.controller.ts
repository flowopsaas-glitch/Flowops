import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { Public } from '../common/decorators/public.decorator';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Tracking')
@RequireFeature('tracking')
@Controller('track')
export class TrackingController {
  constructor(private readonly svc: TrackingService) {}

  /** Public, unauthenticated parcel tracking by tracking number. */
  @Public()
  @Get(':trackingNumber')
  track(@Param('trackingNumber') trackingNumber: string) {
    return this.svc.track(trackingNumber);
  }
}
