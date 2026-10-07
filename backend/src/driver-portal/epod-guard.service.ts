import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ePOD Guard — Production-Grade Delivery Completion Integrity
 *
 * CRITICAL FIX (2026-10-07):
 * Prevents duplicate ePOD capture, double delivery marking, and inconsistent state.
 * Every driver portal ePOD path must use this guard to ensure atomicity.
 */

@Injectable()
export class EpodGuardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Atomic ePOD capture: record POD evidence and advance waybill status in one transaction.
   * Returns success if captured; false if already captured by concurrent request.
   */
  async captureAndComplete(
    waybillId: string,
    companyId: string,
    podData: {
      recipientSignatureBase64?: string;
      recipientName?: string;
      photoBase64?: string;
      location?: string;
      lat?: number;
      lng?: number;
    },
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Check if already delivered
        const wb = await tx.waybill.findUnique({
          where: { id: waybillId },
          select: { id: true, status: true, companyId: true, podDeliveredAt: true },
        });

        if (!wb) {
          return { success: false, reason: 'Waybill not found' };
        }

        if (wb.companyId !== companyId) {
          return { success: false, reason: 'Company mismatch (security)' };
        }

        if (wb.podDeliveredAt) {
          return { success: false, reason: 'Already delivered (ePOD already captured)' };
        }

        // 2. Record POD evidence
        const podData_safe = {
          recipientSignatureUrl: podData.recipientSignatureBase64 || null,
          podRecipient: podData.recipientName || null,
          podPhotoUrl: podData.photoBase64 || null,
          podDeliveredAt: new Date(),
          podLocation: podData.location || null,
          podLat: podData.lat || null,
          podLng: podData.lng || null,
        };

        // 3. Advance waybill to DELIVERED
        await tx.waybill.update({
          where: { id: waybillId },
          data: {
            status: 'DELIVERED',
            ...podData_safe,
          },
        });

        // 4. Create tracking event
        await tx.trackingEvent.create({
          data: {
            waybillId,
            event: 'DELIVERED',
            status: 'DELIVERED',
            description: `Parcel delivered to ${podData.recipientName || 'recipient'}. ePOD captured.`,
            location: podData.location || null,
            actorType: 'DRIVER',
          },
        });

        return { success: true };
      });

      return result;
    } catch (err: any) {
      console.error(`[EpodGuard] Error capturing ePOD for ${waybillId}: ${err?.message}`);
      return { success: false, reason: err?.message };
    }
  }
}
