import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchService } from './dispatch.service';
import { DispatchController } from './dispatch.controller';

@Module({
  providers: [PrismaService, DispatchService],
  controllers: [DispatchController],
})
export class DispatchModule {}
