import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('dashboards')
@UseGuards(JwtAuthGuard)
export class DashboardMetricsController {
  constructor(private prisma: PrismaService) {}

  @Get('metrics')
  async getMetrics(@Request() req: any) {
    const companyId = req.user.companyId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalWaybills,
      deliveredToday,
      inTransit,
      pending,
      exceptions,
      revenue,
      totalDelivered,
      onTimeDelivered,
      activeManifests,
    ] = await Promise.all([
      this.prisma.waybill.count({ where: { companyId } }),
      this.prisma.waybill.count({
        where: { companyId, status: 'DELIVERED', deliveredAt: { gte: today } },
      }),
      this.prisma.waybill.count({
        where: { companyId, status: 'IN_TRANSIT' },
      }),
      this.prisma.waybill.count({
        where: { companyId, status: 'PENDING' },
      }),
      this.prisma.waybillManifest.count({
        where: { status: { in: ['SHORT_SUPPLY', 'OVER_SUPPLY'] } },
      }),
      this.prisma.waybill.aggregate({
        where: { companyId, status: 'DELIVERED' },
        _sum: { totalAmount: true },
      }),
      this.prisma.waybill.count({
        where: { companyId, status: 'DELIVERED' },
      }),
      this.prisma.waybill.count({
        where: { companyId, status: 'DELIVERED', deliveredAt: { not: null } },
      }),
      this.prisma.manifest.count({
        where: { status: 'OPEN' },
      }),
    ]);

    const otdPercent = totalDelivered > 0 
      ? Math.round((onTimeDelivered / totalDelivered) * 100) 
      : 0;

    return {
      totalWaybills,
      deliveredToday,
      inTransit,
      pending,
      exceptions,
      revenue: revenue._sum.totalAmount || 0,
      otdPercent,
      activeManifests,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('volume')
  async getVolume(@Request() req: any) {
    const companyId = req.user.companyId;
    const last7Days = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await this.prisma.waybill.count({
        where: {
          companyId,
          createdAt: { gte: date, lt: nextDate },
        },
      });

      last7Days.push({
        date: date.toISOString().split('T')[0],
        count,
      });
    }

    return last7Days;
  }
}
