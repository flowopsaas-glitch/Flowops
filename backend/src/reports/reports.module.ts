import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { PdfService } from './pdf.service';
import { EmailService } from './email.service';
import { SlaReportCron } from './sla-report.cron';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [PdfService, EmailService, SlaReportCron],
  exports: [PdfService, EmailService],
})
export class ReportsModule {}
