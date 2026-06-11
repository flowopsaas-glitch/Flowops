import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/ai-audit')
export class AiAuditController {
  constructor(private prisma: PrismaService) {}

  @Get('logs')
  async getLogs(@Query('companyId') companyId: string) {
    return this.prisma.aiAuditLog.findMany({
      where: { companyId: parseInt(companyId) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
