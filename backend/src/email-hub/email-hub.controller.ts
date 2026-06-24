import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { EmailHubService } from './email-hub.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('email-hub')
export class EmailHubController {
  constructor(private readonly svc: EmailHubService) {}

  @Get()
  list(
    @CurrentUser() user: { companyId: string },
    @Query('resolved') resolved?: string,
  ) {
    const filter = resolved === 'true' ? true : resolved === 'false' ? false : undefined;
    return this.svc.findAll(user.companyId, filter);
  }

  @Get('stats')
  stats(@CurrentUser() user: { companyId: string }) {
    return this.svc.stats(user.companyId);
  }

  @Post()
  create(
    @CurrentUser() user: { companyId: string },
    @Body() dto: { subject: string; from: string; to: string; body?: string; category?: string },
  ) {
    return this.svc.create(user.companyId, dto);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: { companyId: string }) {
    return this.svc.markRead(id, user.companyId);
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @CurrentUser() user: { companyId: string }) {
    return this.svc.resolve(id, user.companyId);
  }
}
