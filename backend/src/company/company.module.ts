import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [CompanyService, PrismaService],
  exports: [CompanyService],
})
export class CompanyModule {}