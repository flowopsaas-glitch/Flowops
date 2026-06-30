import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationCredentialService } from '../integrations/integration-credential.service';

/** Resolved per-company WhatsApp Business API configuration. */
interface WaConfig {
  gateway: 'meta' | 'telesign';
  apiBase: string;
  phoneNumberId: string;
  accessToken: string;
  webhookVerifyToken: string;
  appSecret: string;
  businessAccountId: string;
  // Telesign gateway
  telesignCustomerId: string;
  telesignApiKey: string;
  telesignSenderId: string;
  telesignTemplate: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private creds: IntegrationCredentialService,
  ) {}

  /**
   * Resolves the WhatsApp Business API config for a company. Tenant self-service
   * credentials (Settings → Integrations) take precedence; the per-install env
   * vars (WHATSAPP_*) are used as a fallback so single-tenant deployments that
   * configured WhatsApp the old way keep working.
   */
  private async getConfig(companyId?: string): Promise<WaConfig> {
    const cred = companyId ? await this.creds.getDecrypted(companyId, 'whatsapp') : null;
    const version =
      cred?.config?.apiVersion || this.config.get<string>('WHATSAPP_API_VERSION', 'v19.0');
    const gateway = (cred?.config?.gateway as 'meta' | 'telesign') || 'meta';
    return {
      gateway,
      apiBase: `https://graph.facebook.com/${version}`,
      phoneNumberId: cred?.config?.phoneNumberId || this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID', ''),
      accessToken: cred?.secrets?.accessToken || this.config.get<string>('WHATSAPP_ACCESS_TOKEN', ''),
      webhookVerifyToken:
        cred?.secrets?.webhookVerifyToken || this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN', ''),
      appSecret: cred?.secrets?.appSecret || this.config.get<string>('WHATSAPP_APP_SECRET', ''),
      businessAccountId:
        cred?.config?.businessAccountId || this.config.get<string>('WHATSAPP_BUSINESS_ACCOUNT_ID', ''),
      telesignCustomerId: cred?.config?.telesignCustomerId || this.config.get<string>('TELESIGN_CUSTOMER_ID', ''),
      telesignApiKey: cred?.secrets?.telesignApiKey || this.config.get<string>('TELESIGN_API_KEY', ''),
      telesignSenderId: cred?.config?.telesignSenderId || '',
      telesignTemplate: cred?.config?.telesignTemplate || '',
    };
  }

  /** True when the resolved gateway has enough config to actually send. */
  private isSendable(cfg: WaConfig): boolean {
    return cfg.gateway === 'telesign'
      ? Boolean(cfg.telesignCustomerId && cfg.telesignApiKey)
      : Boolean(cfg.phoneNumberId && cfg.accessToken);
  }

  /**
   * Send a free-form WhatsApp message via Telesign's omnichannel API.
   * Endpoint + Basic auth per Telesign docs (rest-ww.telesign.com/v1/omnichannel).
   * The omnichannel channel/message shape can be account-specific (approved
   * template names etc.), so the full Telesign response is returned to the
   * caller/logs to make live validation straightforward.
   * @see https://developer.telesign.com/enterprise/reference/sendadvancedmessage
   */
  private async sendViaTelesign(cfg: WaConfig, phone: string, message: string): Promise<string | undefined> {
    const auth = Buffer.from(`${cfg.telesignCustomerId}:${cfg.telesignApiKey}`).toString('base64');
    const body: any = {
      recipient: { phone_number: phone },
      channels: [{ channel: 'whatsapp' }],
      message: { whatsapp: { text: message } },
      message_type: 'ARN', // alerts / reminders / notifications
    };
    if (cfg.telesignSenderId) body.sender_id = cfg.telesignSenderId;
    if (cfg.telesignTemplate) body.template_name = cfg.telesignTemplate;

    try {
      const res = await axios.post('https://rest-ww.telesign.com/v1/omnichannel', body, {
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      });
      const refId = res.data?.reference_id ?? res.data?.referenceId;
      this.logger.log(`Telesign WhatsApp sent to ${phone}, reference_id: ${refId ?? 'n/a'}`);
      return refId;
    } catch (err: any) {
      const detail = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
      this.logger.error(`Telesign WhatsApp send failed: ${detail}`);
      throw new BadRequestException(`Telesign could not send this WhatsApp message: ${detail}`);
    }
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
   * send messages from WhatsApp Web/app via generated wa.me links. When the
   * tenant has connected the Business API, `apiConfigured` is true and the
   * connected number is surfaced.
   */
  async getSettings(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { whatsappNumber: true },
    });
    const cfg = await this.getConfig(companyId);
    return {
      mode: this.isSendable(cfg) ? ('business_api' as const) : ('click_to_chat' as const),
      gateway: cfg.gateway,
      whatsappNumber: company?.whatsappNumber ?? null,
      apiConfigured: this.isSendable(cfg),
      phoneNumberId: cfg.phoneNumberId || null,
      businessAccountId: cfg.businessAccountId || null,
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
    const cfg = await this.getConfig(companyId);
    if (!this.isSendable(cfg)) {
      this.logger.warn('WhatsApp not configured — message not sent');
      return {
        sent: false,
        configured: false,
        message:
          'WhatsApp is not connected. Connect your WhatsApp Business number in ' +
          'Settings → Integrations to enable sending.',
      };
    }

    // Normalize phone number (remove + prefix, keep digits)
    const phone = to.replace(/^\+/, '').replace(/\s/g, '');

    let wabaMessageId: string | undefined;

    if (cfg.gateway === 'telesign') {
      wabaMessageId = await this.sendViaTelesign(cfg, phone, message);
    } else {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { preview_url: false, body: message },
      };
      try {
        const response = await axios.post(
          `${cfg.apiBase}/${cfg.phoneNumberId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${cfg.accessToken}`,
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

  async verifyWebhook(mode: string, token: string, challenge: string): Promise<string> {
    if (mode === 'subscribe' && token) {
      const globalToken = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN', '');
      if (globalToken && token === globalToken) {
        this.logger.log('WhatsApp webhook verified (global token)');
        return challenge;
      }
      // Per-tenant verify token (each tenant's own Business API connection).
      const companyId = await this.creds.findWhatsAppByVerifyToken(token);
      if (companyId) {
        this.logger.log(`WhatsApp webhook verified (tenant ${companyId})`);
        return challenge;
      }
    }
    throw new UnauthorizedException('Webhook verification failed — token does not match any connection');
  }

  // ── Templates (proactive / first-contact messaging) ──────────────────

  /**
   * List approved message templates from the WhatsApp Business Account.
   * Requires a connected business account id. Sending a template by name works
   * without it; this is only for populating the picker.
   */
  async listTemplates(companyId?: string) {
    const cfg = await this.getConfig(companyId);
    if (!cfg.businessAccountId || !cfg.accessToken) {
      return {
        configured: false,
        templates: [] as any[],
        message:
          'Connect your WhatsApp Business account in Settings → Integrations to list templates. ' +
          'You can still send a template by typing its exact name.',
      };
    }
    try {
      const res = await axios.get(
        `${cfg.apiBase}/${cfg.businessAccountId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${cfg.accessToken}` },
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
    const cfg = await this.getConfig(companyId);
    if (!this.isSendable(cfg)) {
      return {
        sent: false,
        configured: false,
        message: 'WhatsApp is not connected. Connect it in Settings → Integrations.',
      };
    }
    if (!name && cfg.gateway !== 'telesign') throw new BadRequestException('Template name is required');

    const phone = to.replace(/^\+/, '').replace(/\s/g, '');

    if (cfg.gateway === 'telesign') {
      // Telesign omnichannel template send (account-approved template names).
      const auth = Buffer.from(`${cfg.telesignCustomerId}:${cfg.telesignApiKey}`).toString('base64');
      const body: any = {
        recipient: { phone_number: phone },
        channels: [{ channel: 'whatsapp' }],
        message: { whatsapp: { template_name: name || cfg.telesignTemplate, parameters: variables } },
        message_type: 'ARN',
      };
      if (cfg.telesignSenderId) body.sender_id = cfg.telesignSenderId;
      let refId: string | undefined;
      try {
        const res = await axios.post('https://rest-ww.telesign.com/v1/omnichannel', body, {
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        });
        refId = res.data?.reference_id ?? res.data?.referenceId;
      } catch (err: any) {
        const detail = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
        throw new BadRequestException(`Telesign could not send template: ${detail}`);
      }
      const summary = `[Template: ${name}]${variables.length ? ` ${variables.join(' · ')}` : ''}`;
      const thread = await this.upsertThread(companyId, phone);
      const msg = await this.prisma.whatsAppMessage.create({
        data: { content: summary, direction: 'OUTBOUND', status: 'sent', wabaMessageId: refId, threadId: thread.id },
      });
      await this.prisma.whatsAppThread.update({
        where: { id: thread.id },
        data: { lastMessage: summary, lastMessageAt: new Date() },
      });
      return msg;
    }

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
        `${cfg.apiBase}/${cfg.phoneNumberId}/messages`,
        payload,
        { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } },
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
    // Resolve the app secret to verify Meta's HMAC. Prefer the per-install env
    // secret (single-app deployments); otherwise use the secret of the tenant
    // that owns the phone_number_id this event is for.
    const phoneId = this.extractPhoneId(payload);
    let appSecret = this.config.get<string>('WHATSAPP_APP_SECRET', '');
    let routedCompanyId: string | null = null;
    if (phoneId) {
      routedCompanyId = await this.creds.resolveCompanyByRef('whatsapp', phoneId);
      if (!appSecret && routedCompanyId) {
        const cred = await this.creds.getDecrypted(routedCompanyId, 'whatsapp');
        appSecret = cred?.secrets?.appSecret || '';
      }
    }

    if (appSecret) {
      const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
      const ok = this.safeEqual(expected, signature ?? '');
      if (!ok) throw new UnauthorizedException('Invalid webhook signature');
    } else {
      this.logger.warn('WhatsApp webhook: no app secret available — signature not verified');
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

        // Incoming messages — route by the receiving phone_number_id
        for (const msg of value.messages ?? []) {
          await this.handleInboundMessage(msg, value.metadata?.phone_number_id);
        }
      }
    }

    return { received: true };
  }

  // ── Phone number registration (for multi-tenant SaaS) ────────────────

  async registerNumber(companyId: string, phoneNumber: string) {
    // Self-service connection now happens in Settings → Integrations (which
    // stores the phone number id + access token encrypted). This endpoint is
    // kept for backward compatibility and only records the desired number.
    return {
      companyId,
      phoneNumber,
      status: 'use_settings',
      message:
        'Connect your WhatsApp Business number under Settings → Integrations ' +
        '(phone number id + access token). That replaces the old environment-variable setup.',
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private extractPhoneId(payload: any): string | undefined {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const id = change?.value?.metadata?.phone_number_id;
        if (id) return String(id);
      }
    }
    return undefined;
  }

  /** Constant-time compare that won't throw on length mismatch. */
  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }

  private async upsertThread(companyId: string, phone: string, name?: string) {
    return this.prisma.whatsAppThread.upsert({
      where: { phone_companyId: { phone, companyId } },
      update: name ? { name } : {},
      create: { phone, companyId, name },
    });
  }

  private async handleInboundMessage(msg: any, phoneId?: string) {
    const phone = msg.from;
    const body = msg.text?.body ?? msg.caption ?? '[media]';

    // Route to the company that owns the receiving phone_number_id.
    let companyId: string | null = phoneId
      ? await this.creds.resolveCompanyByRef('whatsapp', phoneId)
      : null;

    // Legacy single-tenant fallback: only when NO tenant has connected WhatsApp
    // via the credential store (i.e. an env-configured single-tenant install).
    if (!companyId && !(await this.creds.anyConfigured('whatsapp'))) {
      const company = await this.prisma.company.findFirst({ where: { isActive: true } });
      companyId = company?.id ?? null;
    }

    if (!companyId) {
      this.logger.warn(
        `Inbound WhatsApp from ${phone} for phone_number_id ${phoneId ?? '?'} — no matching tenant; dropped`,
      );
      return;
    }

    const thread = await this.upsertThread(companyId, phone, msg.profile?.name);

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

    this.logger.log(`Inbound WhatsApp → company ${companyId} from ${phone}: ${body.slice(0, 50)}`);
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
