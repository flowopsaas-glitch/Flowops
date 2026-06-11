import { Module } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';

@Module({
  controllers: [DriversController],
  providers: [DriversService], // Prisma is pulled from the global InfraModule
  exports: [DriversService],   // 👈 CRITICAL: This allows LocationController to see it
})
export class DriversModule {}
