import { Module } from '@nestjs/common';
import { CustomerPortalController } from './customer-portal.controller';
import { GeocodingModule } from '../geocoding/geocoding.module';

@Module({
  imports: [GeocodingModule],
  controllers: [CustomerPortalController],
})
export class CustomerPortalModule {}
