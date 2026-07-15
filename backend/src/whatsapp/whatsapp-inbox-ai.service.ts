import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

/**
 * WhatsApp Inbox AI — detects collection/delivery requests from inbound
 * WhatsApp messages, extracts logistics data, auto-creates Collections,
 * and sends confirmation replies.
 *
 * Pattern: Same as the Email Hub's AI extraction — but for WhatsApp.
 *
 * Flow:
 *   Inbound WhatsApp message → isCollectionRequest() → extractLogistics()
 *   → createCollection() → sendConfirmationReply()
 */

export interface ExtractedCollectionData {
  isCollectionRequest: boolean;
  confidence: number; // 0-100
  clientName?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  parcelCount?: number;
  weight?: string;
  urgency?: 'SAME_DAY' | 'NEXT_DAY' | 'ECONOMY';
  specialInstructions?: string;
}

@Injectable()
export class WhatsAppInboxAiService {
  private readonly logger = new Logger('WhatsApp-Inbox-AI');
  private readonly GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Analyze an inbound WhatsApp message to detect if it's a collection/delivery request.
   * Returns extracted logistics data if it is, or { isCollectionRequest: false } if not.
   */
  async analyzeMessage(messageBody: string, senderPhone: string, senderName?: string): Promise<ExtractedCollectionData> {
    const groqKey = this.config.get<string>('GROQ_API_KEY');

    if (!groqKey) {
      // No AI key — fall back to keyword detection
      return this.keywordDetection(messageBody);
    }

    try {
      const response = await axios.post(
        this.GROQ_ENDPOINT,
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: `You are a logistics AI assistant for a South African courier company. Your job is to analyze incoming WhatsApp messages and determine if they are collection/delivery requests.

A collection request typically contains:
- A request to pick up / collect parcels or goods
- A pickup address or location
- Number of items / parcels / boxes
- Sometimes a delivery destination
- Sometimes urgency (today, tomorrow, urgent)

Examples of collection requests:
- "Hi, I need 3 boxes collected from 28 Wrench Rd Isando, deliver to Pretoria"
- "Can you pick up a parcel from our warehouse today?"
- "Please collect 2 pallets from JHB to CPT"
- "I need a same-day delivery from Sandton to Midrand"

Examples of NON-collection requests:
- "Where is my parcel?"
- "What are your rates?"
- "Thanks for the delivery"
- "Can I get a quote?"
- "Hello"

Respond ONLY with a JSON object. No other text.`,
            },
            {
              role: 'user',
              content: `Analyze this WhatsApp message from ${senderName ?? senderPhone}:

"${messageBody}"

Return JSON:
{
  "isCollectionRequest": boolean,
  "confidence": number (0-100),
  "clientName": string or null,
  "pickupAddress": string or null,
  "deliveryAddress": string or null,
  "parcelCount": number or null,
  "weight": string or null,
  "urgency": "SAME_DAY" | "NEXT_DAY" | "ECONOMY" | null,
  "specialInstructions": string or null
}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data?.choices?.[0]?.message?.content ?? '';
      const parsed = this.parseJson(content);

      if (parsed && typeof parsed.isCollectionRequest === 'boolean') {
        this.logger.log(`AI analysis: isCollection=${parsed.isCollectionRequest} confidence=${parsed.confidence}%`);
        return parsed;
      }

      return { isCollectionRequest: false, confidence: 0 };
    } catch (err: any) {
      this.logger.warn(`AI extraction failed: ${err.message} — falling back to keyword detection`);
      return this.keywordDetection(messageBody);
    }
  }

  /**
   * Auto-create a Collection from extracted WhatsApp message data.
   * Returns the created collection with a reference number.
   */
  async autoCreateCollection(
    companyId: string,
    data: ExtractedCollectionData,
    senderPhone: string,
    senderName?: string,
  ) {
    const collection = await this.prisma.collection.create({
      data: {
        companyId,
        clientName: data.clientName ?? senderName ?? `WhatsApp ${senderPhone}`,
        clientPhone: senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`,
        pickupAddress: data.pickupAddress ?? 'To be confirmed',
        status: 'PENDING',
        notes: [
          `Source: WhatsApp message`,
          data.parcelCount ? `Parcels: ${data.parcelCount}` : null,
          data.weight ? `Weight: ${data.weight}` : null,
          data.urgency ? `Service: ${data.urgency}` : null,
          data.deliveryAddress ? `Deliver to: ${data.deliveryAddress}` : null,
          data.specialInstructions ? `Instructions: ${data.specialInstructions}` : null,
        ].filter(Boolean).join(' | '),
      },
    });

    this.logger.log(`Auto-created collection ${collection.id} from WhatsApp (${senderPhone})`);
    return collection;
  }

  /**
   * Build the auto-reply message confirming the collection was created.
   */
  buildConfirmationReply(collectionId: string, data: ExtractedCollectionData): string {
    const ref = `COL-${collectionId.slice(-6).toUpperCase()}`;
    const parcels = data.parcelCount ? `${data.parcelCount} parcel${data.parcelCount > 1 ? 's' : ''}` : 'your items';

    return [
      `Got it! Your collection request has been received.`,
      ``,
      `Reference: *${ref}*`,
      data.pickupAddress ? `Pickup: ${data.pickupAddress}` : null,
      `Items: ${parcels}`,
      data.urgency === 'SAME_DAY' ? `Service: Same-day` : data.urgency === 'NEXT_DAY' ? `Service: Next-day` : null,
      ``,
      `A driver will be assigned shortly. You'll receive a notification when they're en route.`,
      ``,
      `_Powered by FlowOps_`,
    ].filter(v => v !== null).join('\n');
  }

  // ── Fallback: keyword-based detection (when Groq is not configured) ──

  private keywordDetection(text: string): ExtractedCollectionData {
    const lower = text.toLowerCase();
    const collectKeywords = ['collect', 'pick up', 'pickup', 'fetch', 'come get', 'need collected'];
    const deliverKeywords = ['deliver', 'delivery', 'send to', 'drop off', 'dropoff'];
    const addressPatterns = /\d+\s+[\w\s]+(?:road|rd|street|st|avenue|ave|drive|dr|crescent|cres|boulevard|blvd)/i;

    const hasCollect = collectKeywords.some(k => lower.includes(k));
    const hasDeliver = deliverKeywords.some(k => lower.includes(k));
    const hasAddress = addressPatterns.test(text);
    const hasNumbers = /\b\d+\s*(?:box|parcel|item|pallet|pkg)/i.test(text);

    const isRequest = (hasCollect || hasDeliver) && (hasAddress || hasNumbers);
    const confidence = isRequest
      ? Math.min(90, (hasCollect ? 30 : 0) + (hasDeliver ? 20 : 0) + (hasAddress ? 30 : 0) + (hasNumbers ? 20 : 0))
      : 0;

    // Try to extract parcel count
    const parcelMatch = text.match(/(\d+)\s*(?:box|parcel|item|pallet|pkg|piece)/i);
    const parcelCount = parcelMatch ? parseInt(parcelMatch[1], 10) : undefined;

    return {
      isCollectionRequest: isRequest,
      confidence,
      parcelCount,
      pickupAddress: hasAddress ? text.match(addressPatterns)?.[0] : undefined,
    };
  }

  // ── JSON parser (handles markdown code blocks) ──

  private parseJson(raw: string): ExtractedCollectionData | null {
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      // Try to find JSON object in the response
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch { /* fall through */ }
      }
      return null;
    }
  }
}
