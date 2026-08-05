import { Global, Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { GeocodingController } from './geocoding.controller';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * World-class Geocoding + Smart Address Resolution module.
 *
 * @Global so any feature module (collections, waybills, routing, logistics-ops, …)
 * can inject GeocodingService without re-importing.
 *
 * Imports PrismaModule explicitly (even though it's global) so the dependency
 * graph is clear and testable — no implicit coupling.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [GeocodingController],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
