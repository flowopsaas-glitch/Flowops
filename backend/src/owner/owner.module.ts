import { Module } from '@nestjs/common';
import { OwnerController, AdminController } from './owner.controller';
import { OwnerService } from './owner.service';

@Module({
  controllers: [OwnerController, AdminController],
  providers: [OwnerService],
  exports: [OwnerService],
})
export class OwnerModule {}
