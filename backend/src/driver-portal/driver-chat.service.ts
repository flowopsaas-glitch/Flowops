import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

// Simple in-memory store for typing indicators
const typingStatus = new Map<number, { isTyping: boolean; timestamp: number }>();

@Injectable()
export class DriverChatService {
  private readonly logger = new Logger('DriverChatService');

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async getMessages(driverId: number, limit: number = 50, skip: number = 0) {
    return this.prisma.dispatchMessage.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: skip,
    });
  }

  async sendMessage(
    driverId: number,
    senderId: number,
    senderType: string,
    message: string,
    type: string = 'text',
    attachmentUrl?: string,
    attachmentType?: string,
  ) {
    const msg = await this.prisma.dispatchMessage.create({
      data: { driverId, senderId, senderType, message, type, attachmentUrl, attachmentType },
    });

    // ─── 🤖 GROQ VISION: If driver sends an IMAGE, auto-extract waybill data ──
    if (senderType === 'driver' && attachmentType === 'image' && attachmentUrl) {
      // Don't await — fire-and-forget so we don't block the response
      this.processDriverImageWithGroq(driverId, attachmentUrl, senderId)
        .catch(e => this.logger.warn(`Auto-AI processing failed: ${e.message}`));
    }

    return msg;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🤖 GROQ VISION: Read waybill image → push to WaybillInboxItem
  // Called automatically when driver sends an image in dispatch chat
  // ─────────────────────────────────────────────────────────────────────────
  async processDriverImageWithGroq(driverId: number, imageUrl: string, senderId: number): Promise<void> {
    const groqKey = this.config.get<string>('GROQ_API_KEY');
    if (!groqKey) {
      this.logger.warn('GROQ_API_KEY not set — skipping AI waybill extraction');
      return;
    }

    // Get driver's companyId
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { companyId: true, name: true },
    });
    if (!driver) return;

    this.logger.log(`🤖 Groq Vision: Processing image from driver ${driver.name}...`);

    // Build full URL if relative
    const fullUrl = imageUrl.startsWith('http')
      ? imageUrl
      : `${this.config.get('BACKEND_URL') || 'http://localhost:3000'}${imageUrl}`;

    const prompt = `You are a South African logistics document scanner. Analyze this image.

Determine if this is a waybill/delivery note/collection note.

If it IS a logistics document, extract:
1. Waybill/reference number (look for barcode numbers, ref numbers, job numbers)
2. Sender name and address
3. Receiver/consignee name and address
4. Number of parcels/pieces
5. Weight
6. Description of goods
7. Any amounts/charges shown (for COD)
8. Collection or delivery type

Respond ONLY in JSON:
{
  "isWaybill": true/false,
  "documentType": "WAYBILL|COLLECTION_NOTE|DELIVERY_NOTE|INVOICE|OTHER",
  "waybillNumber": "",
  "senderName": "",
  "senderAddress": "",
  "receiverName": "",
  "receiverAddress": "",
  "pieces": 0,
  "weight": 0,
  "description": "",
  "codAmount": 0,
  "confidence": 0.0,
  "rawText": "brief summary of visible text"
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
                { type: 'image_url', image_url: { url: fullUrl } },
              ],
            },
          ],
          max_tokens: 600,
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
      if (!content) return;

      const extracted = JSON.parse(content);
      this.logger.log(`🤖 Groq Vision result: isWaybill=${extracted.isWaybill}, confidence=${extracted.confidence}`);

      if (!extracted.isWaybill) {
        this.logger.log(`📷 Image from driver ${driver.name} is not a waybill (${extracted.documentType})`);
        return;
      }

      // ── Push to WaybillInboxItem for dispatcher to review & confirm ──────
      await this.prisma.waybillInboxItem.create({
        data: {
          fileUrl: imageUrl,
          originalName: `DRIVER_${driver.name.replace(/ /g, '_')}_${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          storagePath: `driver_chat/${driverId}`,
          fileSize: 0,
          status: 'EXTRACTED' as any,
          companyId: driver.companyId,
          extractedData: {
            source: 'DRIVER_CHAT',
            driverId,
            driverName: driver.name,
            waybillNumber: extracted.waybillNumber,
            senderName: extracted.senderName,
            senderAddress: extracted.senderAddress,
            receiverName: extracted.receiverName,
            receiverAddress: extracted.receiverAddress,
            pieces: extracted.pieces,
            weight: extracted.weight,
            description: extracted.description,
            codAmount: extracted.codAmount,
            documentType: extracted.documentType,
            aiConfidence: extracted.confidence,
            rawText: extracted.rawText,
          },
        },
      });

      // ── Send confirmation message back in chat ────────────────────────────
      const confirmMsg = extracted.waybillNumber
        ? `✅ AI scanned waybill: **${extracted.waybillNumber}**\n📦 ${extracted.receiverName || 'Receiver TBD'}\n📍 ${extracted.receiverAddress || ''}\nPushed to Waybill Inbox for confirmation.`
        : `✅ ${extracted.documentType} scanned and pushed to Waybill Inbox for dispatcher review. Confidence: ${Math.round(extracted.confidence * 100)}%`;

      await this.prisma.dispatchMessage.create({
        data: {
          driverId,
          senderType: 'dispatch',
          senderId: null,
          message: confirmMsg,
          type: 'text',
        },
      });

      this.logger.log(`✅ Waybill from driver ${driver.name} pushed to inbox: ${extracted.waybillNumber}`);
    } catch (e: any) {
      this.logger.error(`Groq Vision chat processing failed: ${e.response?.data?.error?.message || e.message}`);
    }
  }

  // ─── Manual trigger: dispatcher clicks "Process Image" button ─────────────
  async manuallyProcessMessage(messageId: number): Promise<any> {
    const msg = await this.prisma.dispatchMessage.findUnique({ where: { id: messageId } });
    if (!msg || !msg.attachmentUrl) {
      return { success: false, message: 'Message not found or has no attachment' };
    }
    await this.processDriverImageWithGroq(msg.driverId, msg.attachmentUrl, msg.senderId || 0);
    return { success: true, message: 'AI processing triggered — check Waybill Inbox' };
  }

  async markAsRead(driverId: number, readerType: 'driver' | 'dispatch') {
    const senderToMark = readerType === 'driver' ? 'dispatch' : 'driver';
    return this.prisma.dispatchMessage.updateMany({
      where: { driverId, senderType: senderToMark, readAt: null },
      data: { readAt: new Date() },
    });
  }

  setTyping(driverId: number, isTyping: boolean) {
    typingStatus.set(driverId, { isTyping, timestamp: Date.now() });
  }

  getTypingStatus(driverId: number) {
    const status = typingStatus.get(driverId);
    if (!status) return false;
    if (Date.now() - status.timestamp > 3000) {
      typingStatus.delete(driverId);
      return false;
    }
    return status.isTyping;
  }
}
