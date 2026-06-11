// src/notifications/notifications.controller.ts
import { Controller, Get, Post, Param, Body, UseGuards, Req, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);
  constructor(private readonly service: NotificationsService) {}

  @Get()
  async list(@Req() req: any) {
    const userId = req.user?.id;
    const companyId = req.user?.companyId;
    const role = req.user?.role;
    const isSuperAdmin = String(role || '').toUpperCase() === 'SUPER_ADMIN';
    
    return this.service.list({ 
      userId: isSuperAdmin ? null : userId, 
      role, 
      companyId: isSuperAdmin ? null : companyId, 
      take: 50, 
      skip: 0 
    });
  }

  @Post()
  async create(@Req() req: any, @Body() dto: { type: string; title: string; message: string; data?: any }) {
    return this.service.create({
      companyId: req.user?.companyId,
      userId: req.user?.id,
      ...dto
    });
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string, @Req() req: any) {
    return this.service.markRead({
      id: Number(id),
      userId: req.user?.id,
      role: req.user?.role,
      companyId: req.user?.companyId
    });
  }

  @Post('read-all')
  async readAll(@Req() req: any) {
    return this.service.readAll({
      userId: req.user?.id,
      role: req.user?.role,
      companyId: req.user?.companyId
    });
  }

  @Get('pending-count')
  async getPending(@Req() req: any) {
    return this.service.getPendingNotifications(
      req.user?.id,
      req.user?.role,
      req.user?.companyId
    );
  }
}
