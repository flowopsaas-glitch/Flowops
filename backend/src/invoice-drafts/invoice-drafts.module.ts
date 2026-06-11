// src/invoice-drafts/invoice-drafts.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoiceDraftsController } from './invoice-drafts.controller';
import { InvoiceDraftsService } from './invoice-drafts.service';

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceDraftsController],
  providers: [InvoiceDraftsService],
  exports: [InvoiceDraftsService]
})
export class InvoiceDraftsModule {}
