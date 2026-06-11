import { Module } from '@nestjs/common';
import { FleetMapController } from './fleet-map.controller';
import { FleetMapService } from './fleet-map.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FleetMapController],
  providers: [FleetMapService],
})
export class FleetMapModule {}
