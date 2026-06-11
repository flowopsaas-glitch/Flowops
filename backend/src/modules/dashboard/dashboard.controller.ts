import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService) {}

  @Get('metrics')
  async getMetrics() {
    try {
      const dbName = await this.prisma.$queryRaw`SELECT current_database()`;
      const result: any[] = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM public."Waybill"`;
      const count = Number(result[0].count);
      
      console.log(`[Dashboard] Connected to: ${JSON.stringify(dbName)} | Found: ${count}`);

      return {
        totalWaybills: count,
        totalProcessed: count,
        stuckItems: count,
        db: dbName
      };
    } catch (e: any) {
      console.error('[Dashboard] Error:', e.message);
      return { error: e.message, totalProcessed: 0 };
    }
  }
}
