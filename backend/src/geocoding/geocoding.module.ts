import { Global, Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { GeocodingController } from './geocoding.controller';

/**
 * Global so any feature module (collections, waybills, routing, …) can inject
 * GeocodingService without re-importing.
 */
@Global()
@Module({
  controllers: [GeocodingController],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
