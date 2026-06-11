import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppEventsService } from '../whatsapp/whatsapp-events.service';
import { BillingBatchesService } from '../billing-batches/billing-batches.service';
import { AiFraudDetectionService } from '../ai/ai-fraud-detection.service';

@Injectable()
export class DispatchInboxService {
  private readonly logger = new Logger(DispatchInboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappEvents: WhatsAppEventsService,
    private readonly billingBatches: BillingBatchesService,
    private readonly fraudDetection: AiFraudDetectionService,
  ) {}

  async getDispatcherInbox(companyId: number, dispatcherId: number) {
    this.logger.log(`📥 Fetching inbox for dispatcher ${dispatcherId}`);
    
    return this.prisma.waybillInboxItem.findMany({
      where: {
        companyId,
        OR: [
          { assignedTo: dispatcherId },
          { assignedTo: null, reviewStatus: 'PENDING_REVIEW' },
        ],
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
        waybillDrafts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAdminInbox(companyId: number) {
    return this.prisma.waybillInboxItem.findMany({
      where: { companyId },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
        waybillDrafts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async claimItem(companyId: number, inboxId: string, dispatcherId: number) {
    const item = await this.prisma.waybillInboxItem.findFirst({
      where: { id: inboxId, companyId },
    });

    if (!item) throw new NotFoundException('Inbox item not found');
    if (item.assignedTo && item.assignedTo !== dispatcherId) {
      throw new ForbiddenException('Item already assigned to another dispatcher');
    }

    return this.prisma.waybillInboxItem.update({
      where: { id: inboxId },
      data: { assignedTo: dispatcherId, reviewStatus: 'IN_REVIEW' },
    });
  }

  async approveItem(companyId: number, inboxId: string, dispatcherId: number, notes?: string) {
    this.logger.log(`✅ Dispatcher ${dispatcherId} approving inbox item ${inboxId}`);
    
    const item = await this.prisma.waybillInboxItem.findFirst({
      where: { id: inboxId, companyId },
      include: { waybillDrafts: true },
    });

    if (!item) throw new NotFoundException('Inbox item not found');
    if (item.assignedTo !== dispatcherId) {
      throw new ForbiddenException('You can only approve items assigned to you');
    }

    const updated = await this.prisma.waybillInboxItem.update({
      where: { id: inboxId },
      data: {
        reviewStatus: 'APPROVED',
        reviewedBy: dispatcherId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });

    for (const draft of item.waybillDrafts || []) {
      if (draft.waybillNo) {
        const waybill = await this.prisma.waybill.findFirst({
          where: { waybillNumber: draft.waybillNo, companyId },
        });
        
        if (waybill) {
          await this.prisma.waybill.update({
            where: { id: waybill.id },
            data: { 
              status: 'DELIVERED',
              deliveredAt: new Date(),
            },
          });

          this.whatsappEvents.onWaybillStatusUpdate(waybill.id, waybill.status, 'DELIVERED')
            .catch(err => this.logger.error(`WhatsApp failed: ${err.message}`));

          this.logger.log(`💰 Waybill ${waybill.waybillNumber} marked DELIVERED`);
        }
      }
    }

    return updated;
  }

  async rejectItem(companyId: number, inboxId: string, dispatcherId: number, reason: string) {
    const item = await this.prisma.waybillInboxItem.findFirst({
      where: { id: inboxId, companyId },
    });

    if (!item) throw new NotFoundException('Inbox item not found');
    if (item.assignedTo !== dispatcherId) {
      throw new ForbiddenException('You can only reject items assigned to you');
    }

    return this.prisma.waybillInboxItem.update({
      where: { id: inboxId },
      data: {
        reviewStatus: 'REJECTED',
        reviewedBy: dispatcherId,
        reviewedAt: new Date(),
        reviewNotes: reason,
      },
    });
  }

  async getDispatcherStats(companyId: number, dispatcherId: number) {
    const [pending, inReview, approved, rejected] = await Promise.all([
      this.prisma.waybillInboxItem.count({
        where: { companyId, assignedTo: dispatcherId, reviewStatus: 'PENDING_REVIEW' },
      }),
      this.prisma.waybillInboxItem.count({
        where: { companyId, assignedTo: dispatcherId, reviewStatus: 'IN_REVIEW' },
      }),
      this.prisma.waybillInboxItem.count({
        where: { companyId, assignedTo: dispatcherId, reviewStatus: 'APPROVED' },
      }),
      this.prisma.waybillInboxItem.count({
        where: { companyId, assignedTo: dispatcherId, reviewStatus: 'REJECTED' },
      }),
    ]);

    return { pending, inReview, approved, rejected, total: pending + inReview + approved + rejected };
  }

  /**
   * 🚨 NEW: Analyze POD for fraud before approval
   */
  async analyzeFraud(companyId: number, inboxId: string) {
    this.logger.log(`🔍 Analyzing fraud for inbox item ${inboxId}`);
    
    const item = await this.prisma.waybillInboxItem.findFirst({
      where: { id: inboxId, companyId },
    });

    if (!item) {
      throw new NotFoundException('Inbox item not found');
    }

    const extractedData = item.extractedData as any;
    const podUrl = extractedData?.podUrl || item.podUrl;
    
    if (!podUrl) {
      return { 
        error: 'No POD image found',
        fraudScore: 0,
        isFraudulent: false,
        risks: [],
        recommendations: ['⚠️ No POD image available for analysis'],
      };
    }

    const waybillId = extractedData?.waybillId || 0;

    const fraudAnalysis = await this.fraudDetection.analyzePodFraud(podUrl, waybillId, companyId);

    await this.prisma.waybillInboxItem.update({
      where: { id: inboxId },
      data: {
        aiAnalysis: {
          ...(item.aiAnalysis as any || {}),
          fraudDetection: fraudAnalysis,
          analyzedAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log(`🔍 Fraud analysis complete: Score ${fraudAnalysis.fraudScore}/100`);

    return fraudAnalysis;
  }
}
