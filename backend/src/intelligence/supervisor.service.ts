import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupervisorService {
  private readonly logger = new Logger(SupervisorService.name);
  constructor(private prisma: PrismaService) {}

  async getOverview(companyId: number) {
    const [waybills, batches, drafts, invoices] = await Promise.all([
      this.prisma.waybill.findMany({ where: { companyId } }),
      this.prisma.billingBatch.findMany({ where: { companyId } }),
      (this.prisma as any).invoiceDraft.findMany({ where: { companyId } }),
      this.prisma.invoice.findMany({ where: { companyId } }),
    ]);

    // 🚩 AI Logic: Find Gaps
    const podGaps = waybills.filter(w => w.status === 'DELIVERED' && !w.podUrl).length;
    const dispatchLoad = waybills.filter(w => w.status === 'PENDING').length;
    const unbilledWaybills = waybills.filter(w => w.status === 'DELIVERED' && !w.billingBatchId).length;

    return {
      metrics: {
        criticalAlerts: podGaps > 5 ? 1 : 0,
        collectionsActive: batches.filter(b => b.status === 'OPEN').length,
        podGaps,
        dispatchLoad,
        highAiEvents: unbilledWaybills > 10 ? 1 : 0
      },
      status: "Healthy",
      lastSync: new Date()
    };
  }

  async getRiskAnalysis(companyId: number) {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: { 
        companyId, 
        status: 'UNPAID',
        dueDate: { lt: new Date() }
      }
    });

    return {
      exceptionQueue: overdueInvoices.length,
      operationalRisks: "Low",
      aiPrioritization: overdueInvoices.map(inv => ({
        id: inv.id,
        reason: "Overdue payment",
        impact: inv.total
      }))
    };
  }
}
