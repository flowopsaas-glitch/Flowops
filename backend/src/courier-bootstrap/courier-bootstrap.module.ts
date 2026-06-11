import { Module } from '@nestjs/common';
import { CourierBootstrapService } from './courier-bootstrap.service';
import { CourierBootstrapController } from './courier-bootstrap.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [CourierBootstrapController],
  providers: [CourierBootstrapService, PrismaService],
})
export class CourierBootstrapModule {}
