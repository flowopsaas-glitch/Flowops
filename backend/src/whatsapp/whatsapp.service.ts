import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiBase: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly webhookVerifyToken: string;
  private readonly appSecret: string;
  private readonly businessAccountId: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const version = config.get<string>('WHATSAPP_API_VERSION', 'v19.0');
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '');
    this.accessToken = config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    this.webhookVerifyToken = config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN', '');
    this.appSecret = config.get<string>('WHATSAPP_APP_SECRET', '');
    this.businessAccountId = config.get<string>('WHATSAPP_BUSINESS_ACCOUNT_ID', '');
    this.apiBase = `https://graph.facebook.com/${version}`;
  }

  // ── Threads & messages ───────────────────────────────────────────────

  async getThreads(companyId: string) {
    return this.prisma.whatsAppThread.findMany({
      where: { companyId },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
  }

  async getMessages(phone: string, companyId: string) {
    const thread = await this.prisma.whatsAppThread.findFirst({
      where: { phone, companyId },
      include: {
        messages: { orderBy: { sentAt: 'asc' }, take: 100 },
      },
    });
    return thread?.messages ?? [];
  }

  // ── Click-to-chat (no Business API — uses the tenant's mobile number) ──

  /**
   * Returns the tenant's WhatsApp configuration. In click-to-chat mode the
   * tenant uses their own mobile number (no Meta token required) — agents
   * send messages from WhatsApp Web/app via generated wa.me links.
   */
  async getSettings(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { whatsappNumber: true },
    });
    return {
      mode: 'click_to_chat' as const,
      whatsappNumber: company?.whatsappNumber ?? null,
      apiConfigured: Boolean(this.phoneNumberId && this.accessToken),
    };
  }

  /** Normalises a phone number to digits-only international form for wa.me. */
  private normalizePhone(input: string) {
    return (input || '').replace(/[^\d]/g, '');
  }

  /**
   * Builds a WhatsApp click-to-chat link and logs the outbound message to the
   * thread so history is preserved. The agent's browser opens this URL and
   * sends from the tenant's own WhatsApp — no Business API call is made.
   * Format: https://wa.me/<international-number>?text=<url-encoded-message>
   */
  async compose(companyId: string, to: string, message: string) {
    const phone = this.normalizePhone(to);
    if (!phone) {
      throw new Error('A valid recipient phone number is required.');
    }

    const url = `https://wa.me/${phone}${
      message ? `?text=${encodeURIComponent(message)}` : ''
    }`;

    // Preserve conversation history even though sending happens client-side.
    const thread = await this.upsertThread(companyId, phone);
    if (message) {
      await this.prisma.whatsAppMessage.create({
        data: {
          content: message,
          direction: 'OUTBOUND',
          status: 'click_to_chat',
          threadId: thread.id,
        },
      });
      await this.prisma.whatsAppThread.update({
        where: { id: thread.id },
        data: { lastMessage: message, lastMessageAt: new Date() },
      });
    }

    return { url, to: phone, message };
  }

  // ── Send message ─────────────────────────────────────────────────────

  async sendMessage(companyId: string, to: string, message: string) {
    if (!this.phoneNumberId || !this.accessToken) {
      this.logger.warn('WhatsApp not configured — message not sent');
      return {
        sent: false,
        configured: false,
        message:
          'WhatsApp is not configured. Add WHATSAPP_PHONE_NUMBER_ID and ' +
          'WHATSAPP_ACCESS_TOKEN to your .env to enable sending.',
      };
    }

    // Normalize phone number (remove + prefix, keep digits)
    const phone = to.replace(/^\+/, '').replace(/\s/g, '');

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: message },
    };

    let wabaMessageId: string | undefined;

    try {
      const response = await axios.post(
        `${this.apiBase}/${this.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      wabaMessageId = response.data?.messages?.[0]?.id;
      this.logger.log(`WhatsApp sent to ${phone}, waba_id: ${wabaMessageId}`);
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message ?? err.message;
      const code = err?.response?.data?.error?.code;
      this.logger.error(`WhatsApp send failed: ${detail}`);
      // Surface Meta's actual reason to the client as a 400 (not a generic 500),
      // so the UI can show e.g. "Recipient phone number not in allowed list" or
      // the 24-hour re-engagement window message.
      throw new BadRequestException(
        `WhatsApp could not send this message: ${detail}${code ? ` (Meta error ${code})` : ''}`,
      );
    }

    // Persist outbound message
    const thread = await this.upsertThread(companyId, phone);
    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        content: message,
        direction: 'OUTBOUND',
        status: 'sent',
        wabaMessageId,
        threadId: thread.id,
      },
    });

    // Update thread last message
    await this.prisma.whatsAppThread.update({
      where: { id: thread.id },
      data: { lastMessage: message, lastMessageAt: new Date() },
    });

    return msg;
  }

  // ── Webhook: Meta verification challenge ─────────────────────────────

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === this.webhookVerifyToken) {
      this.logger.log('WhatsApp webhook verified');
      return challenge;
    }
    throw new UnauthorizedException('Webhook verification failed — check WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  }

  // ── Templates (proactive / first-contact messaging) ──────────────────

  /**
   * List approved message templates from the WhatsApp Business Account.
   * Requires WHATSAPP_BUSINESS_ACCOUNT_ID. Sending a template by name works
   * without it; this is only for populating the picker.
   */
  async listTemplates() {
    if (!this.businessAccountId || !this.accessToken) {
      return {
        configured: false,
        templates: [] as any[],
        message:
          'Add WHATSAPP_BUSINESS_ACCOUNT_ID to your .env to list templates. ' +
          'You can still send a template by typing its exact name.',
      };
    }
    try {
      const res = await axios.get(
        `${this.apiBase}/${this.businessAccountId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
          params: { fields: 'name,status,language,category,components', limit: 100 },
        },
      );
      const templates = (res.data?.data ?? []).map((t: any) => {
        const body = (t.components ?? []).find((c: any) => c.type === 'BODY');
        const bodyText: string = body?.text ?? '';
        const variableCount = (bodyText.match(/\{\{\d+\}\}/g) ?? []).length;
        return {
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          bodyText,
          variableCount,
        };
      });
      return { configured: true, templates };
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message ?? err.message;
      throw new BadRequestException(`Could not load templates: ${detail}`);
    }
  }

  /**
   * Send an approved template message — the only way to message a customer
   * outside the 24-hour customer-service window (e.g. "out for delivery").
   */
  async sendTemplate(
    companyId: string,
    to: string,
    name: string,
    language: string,
    variables: string[] = [],
  ) {
    if (!this.phoneNumberId || !this.accessToken) {
      return {
        sent: false,
        configured: false,
        message: 'WhatsApp is not configured. Add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.',
      };
    }
    if (!name) throw new BadRequestException('Template name is required');

    const phone = to.replace(/^\+/, '').replace(/\s/g, '');
    const components = variables.length
      ? [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: String(v) })) }]
      : [];

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: { name, language: { code: language || 'en_US' }, components },
    };

    let wabaMessageId: string | undefined;
    try {
      const response = await axios.post(
        `${this.apiBase}/${this.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' } },
      );
      wabaMessageId = response.data?.messages?.[0]?.id;
      this.logger.log(`WhatsApp template '${name}' sent to ${phone}, waba_id: ${wabaMessageId}`);
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message ?? err.message;
      const code = err?.response?.data?.error?.code;
      this.logger.error(`WhatsApp template send failed: ${detail}`);
      throw new BadRequestException(
        `WhatsApp could not send template: ${detail}${code ? ` (Meta error ${code})` : ''}`,
      );
    }

    const summary = variables.length
      ? `[Template: ${name}] ${variables.join(' · ')}`
      : `[Template: ${name}]`;
    const thread = await this.upsertThread(companyId, phone);
    const msg = await this.prisma.whatsAppMessage.create({
      data: { content: summary, direction: 'OUTBOUND', status: 'sent', wabaMessageId, threadId: thread.id },
    });
    await this.prisma.whatsAppThread.update({
      where: { id: thread.id },
      data: { lastMessage: summary, lastMessageAt: new Date() },
    });
    return msg;
  }

  // ── Webhook: incoming message events ─────────────────────────────────

  async handleWebhookEvent(payload: any, rawBody: Buffer, signature: string) {
    // Verify Meta's HMAC-SHA256 signature
    if (this.appSecret) {
      const expected = `sha256=${createHmac('sha256', this.appSecret)
        .update(rawBody)
        .digest('hex')}`;
      try {
        if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature ?? ''))) {
          throw new UnauthorizedException('Invalid webhook signature');
        }
      } catch {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const entries = payload?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        // Delivery/read status updates
        for (const status of value.statuses ?? []) {
          await this.handleStatusUpdate(status);
        }

        // Incoming messages
        for (const msg of value.messages ?? []) {
          await this.handleInboundMessage(msg, value.metadata?.phone_number_id);
        }
      }
    }

    return { received: true };
  }

  // ── Phone number registration (for multi-tenant SaaS) ────────────────

  async registerNumber(companyId: string, phoneNumber: string) {
    // In production: use Meta's phone number registration API to register
    // a phone number on behalf of a tenant's WABA (Embedded Signup flow).
    // For now, store the phone association and return instructions.
    return {
      companyId,
      phoneNumber,
      status: 'pending_registration',
      message:
        'Register this number in Meta Business Manager → WhatsApp → Phone Numbers. ' +
        'Then update WHATSAPP_PHONE_NUMBER_ID in your environment.',
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async upsertThread(companyId: string, phone: string, name?: string) {
    return this.prisma.whatsAppThread.upsert({
      where: { phone_companyId: { phone, companyId } },
      update: name ? { name } : {},
      create: { phone, companyId, name },
    });
  }

  private async handleInboundMessage(msg: any, _phoneId?: string) {
    // Find which company this phone number belongs to
    // (simplified: find first company — multi-WABA would need phone→company mapping)
    const phone = msg.from;
    const body = msg.text?.body ?? msg.caption ?? '[media]';

    // For now, associate with first active company (in production, use phone_number_id → company mapping)
    const company = await this.prisma.company.findFirst({ where: { isActive: true } });
    if (!company) return;

    const thread = await this.upsertThread(company.id, phone, msg.profile?.name);

    await this.prisma.whatsAppMessage.create({
      data: {
        content: body,
        direction: 'INBOUND',
        wabaMessageId: msg.id,
        status: 'delivered',
        mediaType: msg.type !== 'text' ? msg.type : undefined,
        threadId: thread.id,
      },
    });

    await this.prisma.whatsAppThread.update({
      where: { id: thread.id },
      data: {
        lastMessage: body,
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });

    this.logger.log(`Inbound WhatsApp from ${phone}: ${body.slice(0, 50)}`);
  }

  private async handleStatusUpdate(status: any) {
    if (status.id && status.status) {
      await this.prisma.whatsAppMessage.updateMany({
        where: { wabaMessageId: status.id },
        data: { status: status.status },
      });
    }
  }
}
