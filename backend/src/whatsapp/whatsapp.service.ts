// src/whatsapp/whatsapp.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly graphApiUrl: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly extractionService?: any,
  ) {
    this.graphApiUrl = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v21.0'}`;
    this.phoneNumberId = process.env.WHATSAPP_BUSINESS_PHONE_ID || '';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_GRAPH_TOKEN || '';
  }

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'flowops_secret';
    if (mode === 'subscribe' && token === verifyToken) return challenge;
    return null;
  }

  async handleWebhook(body: any) {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    if (!message) return null;
    return {
      sender: message.from,
      text: message.text?.body || '',
      type: message.type,
      mediaId: message.image?.id || message.document?.id || null,
    };
  }

  /**
   * Send text message via Meta WhatsApp Cloud API
   */
  async sendMessage(to: string, message: string, companyId: number): Promise<any> {
    try {
      // Clean phone number (remove +, spaces, ensure 27 prefix for SA)
      const cleanNumber = to.replace(/[^\d]/g, '').replace(/^0/, '27');
      
      // Check if Meta API is configured
      if (!this.accessToken || !this.phoneNumberId || this.accessToken === 'your_access_token') {
        this.logger.warn('⚠️ Meta WhatsApp API not configured - logging only');
        return await this.logMessage(cleanNumber, message, companyId, 'SENT');
      }

      // Send via Meta API
      const response = await axios.post(
        `${this.graphApiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanNumber,
          type: 'text',
          text: {
            body: message,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const messageId = response.data?.messages?.[0]?.id;
      
      // Log to database
      const log = await this.logMessage(cleanNumber, message, companyId, 'SENT', messageId);
      
      this.logger.log(`✅ WhatsApp sent to ${cleanNumber}: ${message.substring(0, 50)}...`);
      
      return { 
        success: true, 
        messageId: log.id,
        metaMessageId: messageId,
        status: 'SENT' 
      };
    } catch (error: any) {
      this.logger.error(`❌ WhatsApp send failed: ${error.message}`);
      
      // Still log the attempt
      await this.logMessage(to, message, companyId, 'FAILED');
      
      throw error;
    }
  }

  /**
   * Send media message (image/document) via Meta API
   */
  async sendMediaMessage(
    to: string, 
    mediaUrl: string, 
    mediaType: 'image' | 'document' | 'video',
    caption: string,
    companyId: number
  ): Promise<any> {
    try {
      const cleanNumber = to.replace(/[^\d]/g, '').replace(/^0/, '27');
      
      if (!this.accessToken || !this.phoneNumberId || this.accessToken === 'your_access_token') {
        this.logger.warn('⚠️ Meta API not configured - cannot send media');
        return { success: false, error: 'API not configured' };
      }

      const response = await axios.post(
        `${this.graphApiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: cleanNumber,
          type: mediaType,
          [mediaType]: {
            link: mediaUrl,
            caption: caption,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const messageId = response.data?.messages?.[0]?.id;
      
      this.logger.log(`✅ Media sent to ${cleanNumber}: ${mediaType}`);
      
      return { 
        success: true, 
        messageId,
        status: 'SENT' 
      };
    } catch (error: any) {
      this.logger.error(`❌ Media send failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send template message (for delivery notifications)
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    language: string,
    parameters: any[],
    companyId: number
  ): Promise<any> {
    try {
      const cleanNumber = to.replace(/[^\d]/g, '').replace(/^0/, '27');
      
      if (!this.accessToken || !this.phoneNumberId || this.accessToken === 'your_access_token') {
        this.logger.warn('⚠️ Meta API not configured - cannot send template');
        return { success: false, error: 'API not configured' };
      }

      const response = await axios.post(
        `${this.graphApiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: cleanNumber,
          type: 'template',
          template: {
            name: templateName,
            language: { code: language },
            components: [
              {
                type: 'body',
                parameters: parameters,
              },
            ],
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const messageId = response.data?.messages?.[0]?.id;
      
      this.logger.log(`✅ Template sent to ${cleanNumber}: ${templateName}`);
      
      return { 
        success: true, 
        messageId,
        status: 'SENT' 
      };
    } catch (error: any) {
      this.logger.error(`❌ Template send failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log message to database
   */
  private async logMessage(
    phoneNumber: string,
    message: string,
    companyId: number,
    status: 'SENT' | 'FAILED' | 'RECEIVED',
    metaMessageId?: string
  ) {
    return await this.prisma.whatsAppLog.create({
      data: {
        phoneNumber,
        message,
        status,
        companyId,
      },
    });
  }

  async getActiveThreads(companyId: number): Promise<any[]> {
    try {
      const logs = await this.prisma.whatsAppLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const threadsMap = new Map();
      for (const log of logs) {
        const phone = log.phoneNumber;
        if (!threadsMap.has(phone)) {
          threadsMap.set(phone, {
            phone,
            lastMessage: log.message || '',
            updatedAt: log.sentAt || log.createdAt,
            messageCount: 1,
          });
        }
      }
      return Array.from(threadsMap.values());
    } catch {
      return [];
    }
  }

  async getMessagesByPhone(phone: string, companyId?: number): Promise<any[]> {
    const where: any = { phoneNumber: phone };
    if (companyId) where.companyId = companyId;
    return this.prisma.whatsAppLog.findMany({ where, orderBy: { createdAt: 'asc' } });
  }

  async processAutonomousIntent(phone: string, text: string, companyId: number) {
    try {
      await this.prisma.whatsAppLog.create({
        data: { phoneNumber: phone, message: text, status: 'RECEIVED', companyId },
      });
      if (this.extractionService && text.toLowerCase().includes('sender')) {
        // Optional: implement extraction logic here
      }
      return { success: true, action: 'PROCESSED' };
    } catch (error: any) {
      this.logger.error(`Intent processing failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendArrivalTemplateNotification(
    recipientMobile: string, 
    consigneeName: string, 
    waybillNumber: string, 
    companyId: number
  ): Promise<any> {
    const cleanNumber = recipientMobile.replace(/^0/, '27').replace(/\+/g, '');
    
    try {
      // Try to send template message first
      if (this.accessToken && this.phoneNumberId && this.accessToken !== 'your_access_token') {
        return await this.sendTemplateMessage(
          cleanNumber,
          'delivery_arrival',
          'en',
          [
            { type: 'text', text: consigneeName },
            { type: 'text', text: waybillNumber },
          ],
          companyId
        );
      }
      
      // Fallback to text message
      const fallbackMessage = `Hello ${consigneeName}, your parcel ${waybillNumber} has arrived.`;
      return await this.sendMessage(cleanNumber, fallbackMessage, companyId);
    } catch (error: any) {
      this.logger.error(`Template send failed: ${error.message}`);
      throw error;
    }
  }
}
