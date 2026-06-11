import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WaybillStatus, PaymentType } from '@prisma/client';
import * as fs from 'fs';
import axios from 'axios';
import { BillingAutomationService } from '../billing-automation/billing-automation.service';

@Injectable()
export class WaybillAiService {
  private readonly logger = new Logger(WaybillAiService.name);
  private readonly groqApiKey = process.env.GROQ_API_KEY;
  private readonly groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    private prisma: PrismaService,
    private billingService: BillingAutomationService
  ) {}

  async processAndSave(filePath: string, companyId: number = 1) {
    try {
      this.logger.log(`🤖 Processing waybill with Groq AI: ${filePath}`);
      
      const imageBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
      const base64WithPrefix = `data:image/jpeg;base64,${imageBase64}`;

      const response = await axios.post(
        this.groqApiUrl,
        {
          model: 'llama-3.2-90b-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract waybill information from this image. Return ONLY valid JSON with these fields: "waybillNumber" (string), "senderName" (string), "recipientName" (string), "destination" (string), "weight" (string), "pieces" (number), "paymentType" (string: CASH/CREDIT/BANK_TRANSFER/INVOICE/CONTRACT). If a field is not visible, use null.'
                },
                {
                  type: 'image_url',
                  image_url: { url: base64WithPrefix }
                }
              ]
            }
          ],
          max_tokens: 1000,
          temperature: 0.1
        },
        {
          headers: {
            'Authorization': `Bearer ${this.groqApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiResponse = response.data.choices[0]?.message?.content || '{}';
      this.logger.log(`📝 AI Response: ${aiResponse}`);
      
      let jsonStr = aiResponse;
      if (aiResponse.includes('```json')) {
        jsonStr = aiResponse.split('```json')[1].split('```')[0].trim();
      } else if (aiResponse.includes('```')) {
        jsonStr = aiResponse.split('```')[1].split('```')[0].trim();
      }

      const data = JSON.parse(jsonStr);

      // Map payment type to enum
      let paymentType: PaymentType = PaymentType.CONTRACT;
      if (data.paymentType) {
        const pt = data.paymentType.toUpperCase();
        if (pt.includes('CASH') || pt.includes('COD')) paymentType = PaymentType.CASH;
        else if (pt.includes('CREDIT') || pt.includes('PREPAID')) paymentType = PaymentType.CREDIT;
        else if (pt.includes('BANK') || pt.includes('TRANSFER')) paymentType = PaymentType.BANK_TRANSFER;
        else if (pt.includes('INVOICE')) paymentType = PaymentType.INVOICE;
        else if (pt.includes('CONTRACT')) paymentType = PaymentType.CONTRACT;
      }

      const waybill = await this.prisma.waybill.create({
        data: {
          waybillNumber: data.waybillNumber || `AI-WB-${Date.now()}`,
          senderName: data.senderName || 'Unknown Sender',
          recipient: data.recipientName || 'Awaiting Extraction',
          destination: data.destination || 'Unknown',
          weight: data.weight ? parseFloat(data.weight) : null,
          imageUrl: filePath.split('/').pop(),
          status: WaybillStatus.PENDING,
          companyId: Number(companyId),
          paymentType: paymentType
        }
      });

      this.logger.log(`✅ Waybill created: ${waybill.waybillNumber} (${paymentType})`);
      
      // Trigger billing automation
      setTimeout(() => {
        this.billingService.processNewWaybills().catch(err => {
          this.logger.error(`Billing automation failed: ${err.message}`);
        });
      }, 2000);

      return waybill;
    } catch (e: any) {
      this.logger.error(`🚨 AI Processing Failed: ${e.message}`);
      
      try {
        const fallbackWaybill = await this.prisma.waybill.create({
          data: {
            waybillNumber: `AI-WB-${Date.now()}`,
            senderName: 'Unknown Sender',
            recipient: 'Awaiting Manual Review',
            imageUrl: filePath.split('/').pop(),
            status: WaybillStatus.PENDING,
            companyId: Number(companyId),
            paymentType: PaymentType.CONTRACT
          }
        });
        this.logger.log(`⚠️ Created fallback waybill: ${fallbackWaybill.waybillNumber}`);
        
        setTimeout(() => {
          this.billingService.processNewWaybills().catch(err => {
            this.logger.error(`Billing automation failed: ${err.message}`);
          });
        }, 2000);
        
        return fallbackWaybill;
      } catch (fallbackError) {
        this.logger.error(`🚨 Fallback also failed: ${fallbackError.message}`);
        return null;
      }
    }
  }
}
