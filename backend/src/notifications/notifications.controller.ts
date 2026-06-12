import { Controller, Get, Patch, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get('notifications')
  findAll(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.findAll(u.id, u.companyId, q);
  }

  @Patch('notifications/:id/read')
  markRead(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.markRead(id, u.companyId);
  }

  @Post('notifications/mark-all-read')
  markAllRead(@CurrentUser() u: any) {
    return this.svc.markAllRead(u.companyId);
  }

  @Get('me/notification-preferences')
  getPreferences(@CurrentUser() u: any) {
    return this.svc.getPreferences(u.id);
  }

  @Patch('me/notification-preferences')
  updatePreferences(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.updatePreferences(u.id, body);
  }
}
