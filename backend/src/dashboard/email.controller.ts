import { Controller, Get } from '@nestjs/common';

@Controller('email-hub')
export class EmailController {
  @Get()
  async getEmails() { return []; }

  @Get('stats')
  async getStats() {
    return {
      total: 0,
      unread: 0,
      needsOpsAction: 0, // Matched to the frontend key
      critical: 0
    };
  }
}
