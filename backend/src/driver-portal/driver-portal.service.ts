import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class DriverPortalService {
  private readonly logger = new Logger('DriverPortalService');

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async generatePin(driverId: number): Promise<string> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { pin, whatsappOptIn: true },
    });
    return pin;
  }

  async login(phone: string, pin: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { phone, pin },
      include: { company: true },
    });
    if (!driver) throw new UnauthorizedException('Invalid phone number or PIN');
    return {
      driverId: driver.id,
      name: driver.name,
      companyId: driver.companyId,
      vehicleReg: driver.vehicleReg,
    };
  }

  async getDeliveries(driverId: number) {
    return this.prisma.waybill.findMany({
      where: { OR: [{ driverId }, { status: 'PENDING' }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async updateGps(driverId: number, lat: number, lng: number, speed?: number) {
    await this.prisma.driver.update({ where: { id: driverId }, data: { lat, lng } });
    await this.prisma.driverLocation.create({
      data: { driverId, latitude: lat, longitude: lng, speed: speed || 0, timestamp: new Date() },
    });
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📸 UPLOAD POD — Proof of Delivery
  // 1. Saves POD record + marks waybill DELIVERED
  // 2. 🤖 GROQ VISION: reads the POD photo → extracts waybill data → pushes to
  //    WaybillInboxItem for dispatcher review
  // 3. 💰 BILLING TRIGGER: creates InvoiceDraft based on client billing type
  // ═══════════════════════════════════════════════════════════════════════════
  async uploadPod(
    driverId: number,
    waybillId: number,
    signatureData?: string,
    photoData?: string,
    recipientName?: string,
    notes?: string,
    source: string = 'PWA',
  ) {
    const waybill = await this.prisma.waybill.findUnique({
      where: { id: waybillId },
    });
    if (!waybill) throw new BadRequestException('Waybill not found');

    // Note: Waybill doesn't have a direct clientId in this schema version.
    // Billing type is determined from the waybill's own paymentType or defaults to PREPAID.
    // (waybill as any).client = null;

    // ── 1. Save POD ──────────────────────────────────────────────────────────
    const pod = await this.prisma.proofOfDelivery.create({
      data: { driverId, waybillId, signatureData, photoData, recipientName, notes, source },
    });

    await this.prisma.waybill.update({
      where: { id: waybillId },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        signatureUrl: signatureData ? `pod_sig_${pod.id}` : null,
        podUrl: photoData ? `pod_photo_${pod.id}` : null,
      },
    });

    this.logger.log(`✅ POD saved for waybill ${waybill.waybillNumber} (driver ${driverId})`);

    // ── 2. 🤖 GROQ VISION: Extract data from POD photo ─────────────────────
    let aiExtraction: any = null;
    if (photoData) {
      try {
        aiExtraction = await this.extractWaybillFromPhoto(photoData, waybill);
        if (aiExtraction) {
          // Push to Waybill Inbox for dispatcher to review
          await this.pushToWaybillInbox(waybill, aiExtraction, photoData);
          this.logger.log(`🤖 Groq Vision extracted data for ${waybill.waybillNumber} → pushed to inbox`);
        }
      } catch (e) {
        this.logger.warn(`⚠️ Groq Vision extraction failed for waybill ${waybillId}: ${e.message}`);
      }
    }

    // ── 3. 💰 BILLING TRIGGER ────────────────────────────────────────────────
    let billingResult: any = null;
    try {
      billingResult = await this.triggerBilling(waybill);
      this.logger.log(`💰 Billing triggered for ${waybill.waybillNumber}: ${billingResult.action}`);
    } catch (e) {
      this.logger.warn(`⚠️ Billing trigger failed for waybill ${waybillId}: ${e.message}`);
    }

    return {
      success: true,
      podId: pod.id,
      waybillNumber: waybill.waybillNumber,
      newStatus: 'DELIVERED',
      aiExtraction: aiExtraction ? { success: true, data: aiExtraction } : null,
      billing: billingResult,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🤖 GROQ VISION: Read POD photo and extract waybill data
  // ─────────────────────────────────────────────────────────────────────────
  private async extractWaybillFromPhoto(photoData: string, waybill: any): Promise<any> {
    const groqKey = this.config.get<string>('GROQ_API_KEY');
    if (!groqKey) {
      this.logger.warn('GROQ_API_KEY not set — skipping AI extraction');
      return null;
    }

    const prompt = `You are a logistics document scanner. Analyze this delivery proof image.

Current waybill context:
- Waybill Number: ${waybill.waybillNumber}
- Recipient: ${waybill.receiverName || 'Unknown'}
- Amount: R${waybill.totalAmount || 0}

Extract from this image:
1. Recipient name (who signed/received)
2. Delivery address if visible
3. Any waybill/reference number visible
4. Delivery time if visible
5. Any discrepancies (damaged goods, short supply, etc.)
6. COD amount collected if visible (for cash on delivery)

Respond in JSON format:
{
  "recipientName": "...",
  "deliveryAddress": "...",
  "waybillNumber": "...",
  "deliveryTime": "...",
  "hasDiscrepancy": false,
  "discrepancyDetails": "",
  "codAmountCollected": 0,
  "confidence": 0.9,
  "rawText": "..."
}`;

    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.2-11b-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: photoData } },
              ],
            },
          ],
          max_tokens: 500,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
      return parsed;
    } catch (e: any) {
      this.logger.error(`Groq Vision failed: ${e.response?.data?.error?.message || e.message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Push extracted waybill data to WaybillInboxItem for dispatcher review
  // ─────────────────────────────────────────────────────────────────────────
  private async pushToWaybillInbox(waybill: any, extraction: any, photoData: string) {
    await this.prisma.waybillInboxItem.create({
      data: {
        fileUrl: photoData.startsWith('data:') ? `pod_photo_${waybill.id}` : photoData,
        originalName: `POD_${waybill.waybillNumber}_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        storagePath: `pod_auto/${waybill.waybillNumber}`,
        fileSize: Math.round(photoData.length * 0.75 / 1024),
        status: 'EXTRACTED' as any,
        companyId: waybill.companyId,
        podUrl: `pod_photo_${waybill.id}`,
        extractedData: {
          waybillNumber: extraction.waybillNumber || waybill.waybillNumber,
          recipientName: extraction.recipientName || waybill.receiverName,
          deliveryAddress: extraction.deliveryAddress,
          deliveryTime: extraction.deliveryTime,
          hasDiscrepancy: extraction.hasDiscrepancy,
          discrepancyDetails: extraction.discrepancyDetails,
          codAmountCollected: extraction.codAmountCollected,
          aiConfidence: extraction.confidence,
          rawText: extraction.rawText,
          source: 'DRIVER_POD',
        },
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 💰 BILLING TRIGGER: Create invoice draft based on client billing type
  // ─────────────────────────────────────────────────────────────────────────
  private async triggerBilling(waybill: any): Promise<{ action: string; invoiceDraftId?: string; message: string }> {
    // Only bill once (skip if already billed)
    const existingDraftLine = await this.prisma.invoiceDraftLine.findFirst({
      where: { description: { contains: waybill.waybillNumber } },
    });
    if (existingDraftLine) {
      return { action: 'SKIPPED', message: 'Already billed' };
    }

    // Derive billing type from waybill paymentType (CASH=COD, CREDIT=CONTRACT, else PREPAID)
    const paymentType = (waybill as any).paymentType?.toString().toUpperCase() || '';
    const billingType = paymentType === 'CASH' ? 'COD' : paymentType === 'CREDIT' ? 'CONTRACT' : 'PREPAID';
    const amount = waybill.totalAmount || 0;

    // PREPAID — already paid, just log it
    if (billingType === 'PREPAID') {
      this.logger.log(`💰 PREPAID waybill ${waybill.waybillNumber} — no invoice draft needed`);
      return {
        action: 'PREPAID_LOGGED',
        message: `Prepaid — R${amount} already collected at booking`,
      };
    }

    // COD — cash collected on delivery, create a receipt record
    if (billingType === 'COD') {
      const draft = await this.prisma.invoiceDraft.create({
        data: {
          companyId: waybill.companyId,
          status: 'DRAFT',
          total: amount,
          notes: `COD — Cash collected on delivery for ${waybill.waybillNumber}. Amount: R${amount}`,
        },
      });

      await this.prisma.invoiceDraftLine.create({
        data: {
          invoiceDraftId: draft.id,
          description: `COD Delivery: ${waybill.waybillNumber} — ${waybill.receiverName || 'Unknown'}`,
          quantity: 1,
          unitPrice: amount,
          amount,
        },
      });

      return {
        action: 'COD_DRAFT_CREATED',
        invoiceDraftId: draft.id,
        message: `COD draft created — R${amount} to reconcile`,
      };
    }

    // CONTRACT — add to pending invoice draft (batch billing)
    if (billingType === 'CONTRACT') {
      // Find or create an open draft for this company
      let draft = await this.prisma.invoiceDraft.findFirst({
        where: { companyId: waybill.companyId, status: 'DRAFT' },
        orderBy: { createdAt: 'desc' },
      });

      if (!draft) {
        draft = await this.prisma.invoiceDraft.create({
          data: {
            companyId: waybill.companyId,
            status: 'DRAFT',
            total: 0,
            notes: `Contract batch invoice — ${new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`,
          },
        });
      }

      // Add this waybill as a line item
      await this.prisma.invoiceDraftLine.create({
        data: {
          invoiceDraftId: draft.id,
          description: `Delivery: ${waybill.waybillNumber} — ${waybill.receiverName || 'Unknown'} (${(waybill as any).deliveryAddress || 'No address'})`,
          quantity: 1,
          unitPrice: amount,
          amount,
        },
      });

      // Update draft total
      const lines = await this.prisma.invoiceDraftLine.findMany({ where: { invoiceDraftId: draft.id } });
      const newTotal = lines.reduce((sum, l) => sum + (l.unitPrice * l.quantity), 0);
      await this.prisma.invoiceDraft.update({
        where: { id: draft.id },
        data: { total: newTotal },
      });

      return {
        action: 'CONTRACT_LINE_ADDED',
        invoiceDraftId: draft.id,
        message: `Added R${amount} to contract draft ${draft.id} (${lines.length} lines, total R${newTotal.toFixed(2)})`,
      };
    }

    return { action: 'UNKNOWN_BILLING_TYPE', message: `Billing type "${billingType}" not recognized` };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Get the driver's assigned collections (pickups)
  // ═══════════════════════════════════════════════════════════════════════════
  async getCollections(driverId: number) {
    const dispatches = await this.prisma.dispatch.findMany({
      where: {
        driverId,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] as any },
      },
      include: { collection: { include: { client: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return dispatches
      .filter((d: any) => d.collection)
      .map((d: any) => ({
        id: d.collection.id,
        dispatchId: d.id,
        name: d.collection.name,
        referenceNo: d.collection.referenceNo,
        status: d.collection.status,
        collectionAddress: d.collection.collectionAddress,
        scheduledDate: d.collection.scheduledDate,
        clientName: d.collection.client?.name || null,
        collectorName: d.collection.collectorName,
        collectedAt: d.collection.collectedAt,
      }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Upload POC — Proof of Collection
  // ═══════════════════════════════════════════════════════════════════════════
  async uploadPoc(driverId: number, collectionId: number, signatureData?: string, photoData?: string, collectorName?: string, notes?: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id: collectionId } });
    if (!collection) throw new BadRequestException('Collection not found');

    await this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        status: 'COLLECTED',
        collectedAt: new Date(),
        completedAt: new Date(),
        collectorName: collectorName || null,
        pocSignature: signatureData || null,
        pocPhoto: photoData || null,
        pocNotes: notes || null,
      },
    });

    await this.prisma.dispatch.updateMany({
      where: { collectionId, driverId },
      data: { status: 'COMPLETED' as any },
    });

    // If photo provided, also push to waybill inbox for dispatcher visibility
    if (photoData) {
      try {
        await this.prisma.waybillInboxItem.create({
          data: {
            fileUrl: `poc_photo_${collectionId}`,
            originalName: `POC_${collection.referenceNo || collectionId}_${Date.now()}.jpg`,
            mimeType: 'image/jpeg',
            storagePath: `poc_auto/${collectionId}`,
            fileSize: Math.round(photoData.length * 0.75 / 1024),
            status: 'NEW',
            companyId: collection.companyId,
            collectionId,
            pocUrl: `poc_photo_${collectionId}`,
            extractedData: {
              source: 'DRIVER_POC',
              referenceNo: collection.referenceNo || `COL-${collectionId}`,
              collectorName,
              notes,
            },
          },
        });
      } catch (e) {
        this.logger.warn(`POC inbox push failed: ${e.message}`);
      }
    }

    return { success: true, collectionId, newStatus: 'COLLECTED' };
  }
}
