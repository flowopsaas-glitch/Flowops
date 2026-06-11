import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(companyId: number) {
    this.logger.log(`📊 Sweeping data layout metrics for company space: ${companyId}`);
    try {
      const waybills = await this.prisma.waybill.findMany({ where: { companyId } });
      const drivers = await this.prisma.driver.findMany({ where: { companyId } });

      return {
        collections: waybills.filter(w => w.status === 'PENDING_COLLECTION').length,
        activeDrivers: drivers.filter(d => d.availabilityStatus === 'AVAILABLE').length,
        transit: waybills.filter(w => w.status === 'IN_TRANSIT').length,
        stock: waybills.filter(w => w.status === 'ARRIVED_AT_HUB').length,
        risks: waybills.filter(w => w.status === 'EXCEPTION').length,
        drivers: drivers.map(d => ({
          id: d.id,
          name: d.name,
          vehicleReg: d.vehicleReg,
          lat: d.lat || -26.2041,
          lng: d.lng || 28.0473
        }))
      };
    } catch (error: any) {
      this.logger.error(`❌ Metrics build error: ${error.message}`);
      return { collections: 0, activeDrivers: 0, transit: 0, stock: 0, risks: 0, drivers: [] };
    }
  }
}

