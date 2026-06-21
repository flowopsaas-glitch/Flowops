import { 
  Controller, 
  Get, 
  Patch, 
  Body, 
  NotFoundException, 
  UseGuards, 
  BadRequestException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WaybillStatus } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

// 💡 Patched: Changed from 'api/ai-diagnostics' to 'ai-diagnostics' 
// This avoids the /api/api/ path mirroring since the global prefix is already 'api'
@Controller('ai-diagnostics')
 
export class AiDiagnosticsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 📜 Fetch operational intelligence audit trail metrics
   */
  @Get('logs')
  
  async getSystemHealth() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * 📊 Compile real-time system performance data
   */
  @Get('system-check')
  
  async systemCheck() {
    const counts = await this.prisma.waybill.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return { 
      waybillStats: counts, 
      timestamp: new Date().toISOString() 
    };
  }

  /**
   * ⚡ Chaos Injection Routine
   */
  @Patch('simulate-chaos')
  
  async simulateChaos(@Body('companyId') companyId: number) {
    const targetCompanyId = Number(companyId);
    if (isNaN(targetCompanyId) || targetCompanyId <= 0) {
      throw new BadRequestException('A valid, non-zero company identifier parameter must be supplied.');
    }

    const targetWaybill = await this.prisma.waybill.findFirst({
      where: { companyId: String(targetCompanyId) },
    });

    if (!targetWaybill) {
      throw new NotFoundException(`No waybills located matching corporate entity space tracking identifier: ${targetCompanyId}`);
    }

    await this.prisma.waybill.update({
      where: { id: targetWaybill.id },
      data: { 
        status: WaybillStatus.FAILED_DELIVERY, 
        totalAmount: 0 
      }
    });

    return { 
      status: 'CHAOS_INJECTED',
      targetWaybillId: targetWaybill.id,
      timestamp: new Date().toISOString()
    };
  }
}

