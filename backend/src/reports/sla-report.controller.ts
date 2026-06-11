// File: src/reports/sla-report.controller.ts
import { Controller, Get } from '@nestjs/common';
import { SlaReportService } from './sla-report.service';

@Controller('reports')
export class SlaReportController {
  constructor(private readonly service: SlaReportService) {}

  @Get('collections')
  async getCollections() {
    return this.service.getAllCollections();
  }
}
