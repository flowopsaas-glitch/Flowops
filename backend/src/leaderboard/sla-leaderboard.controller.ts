import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { SlaLeaderboardService } from './sla-leaderboard.service';

@Controller('sla-leaderboard')
export class SlaLeaderboardController {
  constructor(private readonly service: SlaLeaderboardService) {}

  /**
   * GET /sla-leaderboard?companyId=1
   */
  @Get()
  async leaderboard(@Query('companyId') companyId?: string) {
    if (!companyId) {
      throw new BadRequestException('companyId query parameter is required');
    }

    return this.service.getLeaderboard(Number(companyId));
  }
}