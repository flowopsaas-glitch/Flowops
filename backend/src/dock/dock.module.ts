import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DockController } from './dock.controller';
import { DockService } from './dock.service';

@Module({
  imports: [PrismaModule],
  controllers: [DockController],
  providers: [DockService],
  exports: [DockService],
})
export class DockModule {}
