import { Controller, Get } from '@nestjs/common';

@Controller('risk-queue')
export class RiskQueueController {
  @Get()
  async getRiskItems() {
    return { items: [], totalHighRisk: 0 };
  }
}
