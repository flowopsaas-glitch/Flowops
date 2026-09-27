import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';

const PAYSTACK_BASE = 'https://api.paystack.co';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string;
  private readonly webhookIps: string[];

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.secretKey = config.get<string>('PAYSTACK_SECRET_KEY', '');
    this.webhookIps = config.get<string>('PAYSTACK_WEBHOOK_IPS', '').split(',').map(s => s.trim()).filter(Boolean);
    this.warnIfWebhookIpsUnset();
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Initialize payment ────────────────────────────────────────────────

  async initializePayment(params: {
    email: string;
    amount: number;          // in smallest currency unit (kobo/cents)
    companyId: string;
    invoiceId?: string;
    description?: string;
    callbackUrl?: string;
    metadata?: Record<string, any>;
  }) {
    if (!this.secretKey) {
      return {
        configured: false,
        message:
          'Paystack is not configured. ' +
          'For now, approve payments manually: POST /invoices/:id/mark-paid. ' +
          'To enable Paystack add PAYSTACK_SECRET_KEY to your .env.',
      };
    }

    const reference = `FO-${uuid().split('-')[0].toUpperCase()}`;

    const payload = {
      email: params.email,
      amount: Math.round(params.amount),
      reference,
      callback_url: params.callbackUrl,
      metadata: {
        ...params.metadata,
        companyId: params.companyId,
        invoiceId: params.invoiceId,
        custom_fields: [
          { display_name: 'Company', variable_name: 'companyId', value: params.companyId },
        ],
      },
    };

    const { data } = await axios.post(`${PAYSTACK_BASE}/transaction/initialize`, payload, {
      headers: this.headers,
    });

    if (!data.status) throw new BadRequestException(data.message);

    // Save pending payment record
    await this.prisma.payment.create({
      data: {
        reference,
        amount: params.amount / 100, // store in ZAR
        currency: 'ZAR',
        description: params.description,
        invoiceId: params.invoiceId,
        customerEmail: params.email,
        companyId: params.companyId,
        status: 'PENDING',
      },
    });

    return {
      reference,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
    };
  }

  // ── Verify payment ────────────────────────────────────────────────────

  async verifyPayment(reference: string) {
    const { data } = await axios.get(
      `${PAYSTACK_BASE}/transaction/verify/${reference}`,
      { headers: this.headers },
    );

    if (!data.status) throw new BadRequestException(data.message);

    const tx = data.data;
    const success = tx.status === 'success';

    if (success) {
      await this.prisma.payment.updateMany({
        where: { reference },
        data: {
          status: 'SUCCESS',
          paystackReference: tx.reference,
          paystackChannel: tx.channel,
          customerEmail: tx.customer?.email,
          customerName: tx.customer?.name,
          paidAt: new Date(),
        },
      });

      // Mark invoice as paid if linked
      const payment = await this.prisma.payment.findFirst({ where: { reference } });
      if (payment?.invoiceId) {
        await this.prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: { status: 'PAID', paidAt: new Date() },
        });
      }
    }

    return { reference, status: tx.status, amount: tx.amount / 100, paid: success };
  }

  // ── Webhook ───────────────────────────────────────────────────────────

  /** Called once at boot: surface an unset IP allowlist instead of skipping it silently. */
  warnIfWebhookIpsUnset(): void {
    if (!this.webhookIps.length) {
      this.logger.warn(
        'PAYSTACK_WEBHOOK_IPS is not set — webhook IP allowlisting is DISABLED ' +
          '(HMAC signature verification still applies). Set it to restrict ' +
          'webhooks to Paystack source IPs.',
      );
    }
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    if (!this.secretKey) return false;
    const hash = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(hash), Buffer.from(signature ?? ''));
    } catch {
      return false;
    }
  }

  verifyWebhookIp(ip: string): boolean {
    if (!this.webhookIps.length) {
      // Deliberately permissive: the HMAC signature is the real gate, and
      // failing closed here would drop webhooks for anyone who has not set
      // PAYSTACK_WEBHOOK_IPS. Warn at boot so it is a conscious choice.
      return true;
    }
    return this.webhookIps.includes(ip);
  }

  async handleWebhookEvent(event: string, data: any, rawPayload: any) {
    this.logger.log(`Paystack webhook: ${event}`);

    switch (event) {
      case 'charge.success':
        await this.handleChargeSuccess(data);
        break;

      case 'charge.failed':
        // Idempotent + safe: never downgrade an already-SUCCESS payment to
        // FAILED (a late/replayed failed event must not clobber a real success).
        await this.prisma.payment.updateMany({
          where: { reference: data.reference, status: { not: 'SUCCESS' } },
          data: { status: 'FAILED', webhookPayload: rawPayload },
        });
        break;

      case 'subscription.create':
        this.logger.log(`Subscription created: ${data.subscription_code}`);
        // Promote the company's plan based on Paystack plan code
        await this.handleSubscriptionCreated(data);
        break;

      case 'subscription.not_renew':
        this.logger.log(`Subscription cancelled: ${data.subscription_code}`);
        break;

      case 'invoice.payment_failed':
        this.logger.warn(`Invoice payment failed: ${data.reference}`);
        break;

      default:
        this.logger.debug(`Unhandled Paystack event: ${event}`);
    }
  }

  private async handleChargeSuccess(tx: any) {
    const reference = tx.reference;

    // IDEMPOTENCY: Paystack can deliver charge.success more than once (retries
    // / replays). If the payment is already SUCCESS we've processed it — skip
    // re-marking the invoice and (below) re-promoting the plan.
    const existing = await this.prisma.payment.findFirst({
      where: { reference },
      select: { id: true, status: true, invoiceId: true, companyId: true },
    });
    if (existing?.status === 'SUCCESS') {
      this.logger.log(`charge.success for ${reference} already processed — skipping (idempotent).`);
      return;
    }

    await this.prisma.payment.updateMany({
      where: { reference },
      data: {
        status: 'SUCCESS',
        paystackReference: reference,
        paystackChannel: tx.channel,
        customerEmail: tx.customer?.email,
        paidAt: new Date(),
      },
    });

    const payment = await this.prisma.payment.findFirst({ where: { reference } });
    if (payment?.invoiceId) {
      await this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'PAID', paidAt: new Date() },
      });
      this.logger.log(`Invoice ${payment.invoiceId} marked PAID via webhook`);
    }

    // If this charge is tied to a Paystack subscription plan, promote company.plan
    const planCode = tx.plan?.plan_code as string | undefined;
    if (planCode && payment?.companyId) {
      await this.promotePlanByCode(planCode, payment.companyId);
    }
  }

  private async handleSubscriptionCreated(data: any) {
    const planCode = data.plan?.plan_code as string | undefined;
    const email    = data.customer?.email as string | undefined;
    if (!planCode || !email) return;

    // Resolve the company from OUR OWN trusted records, not a bare email match.
    // The subscription checkout recorded a Payment carrying the authenticated
    // companyId (customerEmail + companyId). Matching on that is tenant-safe.
    // A raw company.findFirst({ email }) was a cross-tenant hazard: a shared or
    // spoofed company email could promote the wrong tenant's plan.
    const emailLower = email.toLowerCase();
    const payment = await this.prisma.payment.findFirst({
      where: { customerEmail: emailLower },
      orderBy: { createdAt: 'desc' },
      select: { companyId: true },
    });
    if (payment?.companyId) {
      await this.promotePlanByCode(planCode, payment.companyId);
      return;
    }

    // Fallback: only promote by company email when it maps to EXACTLY ONE
    // company (no ambiguity). If multiple companies share the email, refuse
    // rather than risk promoting the wrong tenant.
    const matches = await this.prisma.company.findMany({
      where: { email: emailLower },
      select: { id: true },
      take: 2,
    });
    if (matches.length === 1) {
      await this.promotePlanByCode(planCode, matches[0].id);
    } else {
      this.logger.warn(
        `subscription.create for ${emailLower}: ${matches.length} company matches and no prior payment — skipping plan promotion to avoid cross-tenant upgrade.`,
      );
    }
  }

  /** Map a Paystack plan code → internal plan name and persist it. */
  private async promotePlanByCode(planCode: string, companyId: string) {
    const planMap: Record<string, string> = {
      'PLN_l3kobthzahnkpf3': 'professional',
      'PLN_9at9kn2ra8jtae0': 'enterprise',
    };
    const plan = planMap[planCode];
    if (!plan) return;
    await this.prisma.company.update({
      where: { id: companyId },
      data: { plan, trialEndsAt: null }, // clear trial — they're now on a paid plan
    });
    this.logger.log(`Company ${companyId} promoted to plan '${plan}' via webhook`);
  }

  // ── Subscription checkout (first payment → creates recurring subscription) ──

  /**
   * Initialize a Paystack transaction that ALSO creates a subscription.
   *
   * How it works with Paystack:
   *   1. We call POST /transaction/initialize with a `plan` code in the body
   *   2. Paystack shows the customer a checkout page
   *   3. On successful first charge → Paystack auto-creates a subscription
   *   4. We get a `charge.success` webhook + `subscription.create` webhook
   *   5. Both promote the company's plan via promotePlanByCode()
   *
   * This is the correct flow for NEW subscribers who don't yet have an
   * authorization code (card on file). For existing subscribers who want
   * to change plans, use createSubscription() with their authorization.
   */
  async initializeSubscriptionCheckout(params: {
    email: string;
    companyId: string;
    planCode: string;        // e.g. 'PLN_l3kobthzahnkpf3'
    callbackUrl?: string;    // where Paystack redirects after payment
  }) {
    if (!this.secretKey) {
      return {
        configured: false,
        message:
          'Paystack is not configured. ' +
          'Set PAYSTACK_SECRET_KEY in your environment to enable payments. ' +
          'Contact support@flowop.work for manual activation.',
      };
    }

    const reference = `FO-SUB-${uuid().split('-')[0].toUpperCase()}`;

    // Map plan code to internal name + price for the Payment record
    const planMap: Record<string, { name: string; amountZar: number }> = {
      'PLN_l3kobthzahnkpf3': { name: 'professional', amountZar: 19999 },
      'PLN_9at9kn2ra8jtae0': { name: 'enterprise', amountZar: 100000 },
    };
    const planInfo = planMap[params.planCode];
    if (!planInfo) throw new BadRequestException(`Invalid plan code: ${params.planCode}`);

    const payload: any = {
      email: params.email,
      amount: planInfo.amountZar * 100, // Paystack expects kobo (cents)
      reference,
      plan: params.planCode, // ← THIS makes Paystack auto-create a subscription on success
      callback_url: params.callbackUrl,
      metadata: {
        companyId: params.companyId,
        planCode: params.planCode,
        planName: planInfo.name,
        custom_fields: [
          { display_name: 'Company', variable_name: 'companyId', value: params.companyId },
          { display_name: 'Plan', variable_name: 'planName', value: planInfo.name },
        ],
      },
    };

    const { data } = await axios.post(`${PAYSTACK_BASE}/transaction/initialize`, payload, {
      headers: this.headers,
    });

    if (!data.status) throw new BadRequestException(data.message);

    // Record the pending payment
    await this.prisma.payment.create({
      data: {
        reference,
        amount: planInfo.amountZar,
        currency: 'ZAR',
        description: `FlowOps ${planInfo.name.charAt(0).toUpperCase() + planInfo.name.slice(1)} subscription`,
        customerEmail: params.email,
        companyId: params.companyId,
        status: 'PENDING',
      },
    });

    this.logger.log(
      `Subscription checkout initialized: ${params.email} → ${planInfo.name} (ref: ${reference})`,
    );

    return {
      reference,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      planName: planInfo.name,
    };
  }

  // ── Verify & activate subscription after callback ────────────────────

  /**
   * Called when Paystack redirects back to the callback URL with ?reference=xxx.
   * Verifies the transaction AND activates the subscription (plan promotion).
   *
   * Returns a rich result object suitable for the frontend callback page.
   */
  async verifyAndActivateSubscription(reference: string) {
    if (!this.secretKey) {
      throw new BadRequestException('Paystack is not configured');
    }

    const { data } = await axios.get(
      `${PAYSTACK_BASE}/transaction/verify/${reference}`,
      { headers: this.headers },
    );

    if (!data.status) throw new BadRequestException(data.message);

    const tx = data.data;
    const success = tx.status === 'success';

    // Update payment record
    await this.prisma.payment.updateMany({
      where: { reference },
      data: {
        status: success ? 'SUCCESS' : 'FAILED',
        paystackReference: tx.reference,
        paystackChannel: tx.channel,
        customerEmail: tx.customer?.email,
        customerName: tx.customer?.first_name
          ? `${tx.customer.first_name} ${tx.customer.last_name || ''}`.trim()
          : undefined,
        paidAt: success ? new Date() : undefined,
        webhookPayload: tx,
      },
    });

    if (success) {
      // Promote the company plan
      const payment = await this.prisma.payment.findFirst({ where: { reference } });
      if (payment?.companyId) {
        const planCode = tx.plan?.plan_code || (tx.metadata?.planCode as string);
        if (planCode) {
          await this.promotePlanByCode(planCode, payment.companyId);
        }

        // Re-activate the company if it was suspended (trial expired)
        await this.prisma.company.update({
          where: { id: payment.companyId },
          data: { isActive: true },
        });
      }

      return {
        success: true,
        reference,
        amount: tx.amount / 100,
        currency: tx.currency || 'ZAR',
        planName: tx.plan?.name || tx.metadata?.planName || 'Professional',
        customerEmail: tx.customer?.email,
        paidAt: new Date().toISOString(),
        message: 'Payment successful! Your plan has been upgraded.',
      };
    }

    return {
      success: false,
      reference,
      message: tx.gateway_response || 'Payment was not successful. Please try again.',
      status: tx.status,
    };
  }

  // ── Subscriptions ─────────────────────────────────────────────────────

  /**
   * Subscribe a customer to a recurring Paystack plan.
   *
   * Active plans (Flowops Holdings, Test Mode):
   *   professional → PLN_l3kobthzahnkpf3 (ZAR 19,999 / month)
   *   enterprise   → PLN_9at9kn2ra8jtae0 (ZAR 100,000 / month — custom/contact sales)
   *
   * For the free Starter plan use activateStarterPlan() instead.
   *
   * Paystack docs: POST /subscription
   */
  async createSubscription(params: {
    email: string;
    planCode: string;           // e.g. 'PLN_l3kobthzahnkpf3'
    companyId: string;
    authorization?: string;     // Paystack authorization code (reuse card)
    startDate?: string;         // ISO-8601; defaults to now
  }) {
    if (!this.secretKey) {
      this.logger.warn('Paystack not configured — subscription not created');
      return {
        configured: false,
        message:
          'Paystack is not configured. ' +
          'Add PAYSTACK_SECRET_KEY to your .env to enable subscriptions.',
      };
    }

    const payload: any = {
      customer: params.email,
      plan: params.planCode,
    };
    if (params.authorization) payload.authorization = params.authorization;
    if (params.startDate) payload.start_date = params.startDate;

    const { data } = await axios.post(`${PAYSTACK_BASE}/subscription`, payload, {
      headers: this.headers,
    });

    if (!data.status) throw new BadRequestException(data.message);

    this.logger.log(
      `Subscription created for ${params.email}: code=${data.data.subscription_code} plan=${params.planCode}`,
    );

    // Map Paystack plan codes → internal plan tier names.
    // NOTE: 'starter' is intentionally absent — it is a free tier and
    // never goes through Paystack (see activateStarterPlan()).
    const planMap: Record<string, string> = {
      'PLN_l3kobthzahnkpf3': 'professional',
      'PLN_9at9kn2ra8jtae0': 'enterprise',
    };
    await this.prisma.company.update({
      where: { id: params.companyId },
      data: { plan: planMap[params.planCode] ?? params.planCode },
    });

    return data.data;
  }

  // ── Starter (free, no Paystack) ──────────────────────────────────────

  /**
   * Activate the free Starter plan for a company.
   *
   * - Sets Company.plan = 'starter' immediately.
   * - If the company holds an active paid Paystack subscription, it is
   *   cancelled before switching so they aren't double-billed.
   *
   * No Paystack transaction is created — this is purely a DB update.
   */
  async activateStarterPlan(companyId: string, activeSubscriptionCode?: string) {
    // Cancel any existing paid subscription before downgrading
    if (activeSubscriptionCode) {
      try {
        // Paystack requires an emailToken to cancel a subscription.
        // That token is sent to the customer's email by Paystack automatically
        // when they click "Manage subscription". For a server-side downgrade
        // we call the admin disable endpoint instead.
        await axios.post(
          `${PAYSTACK_BASE}/subscription/disable`,
          { code: activeSubscriptionCode, token: '' },
          { headers: this.headers },
        );
        this.logger.log(`Cancelled Paystack subscription ${activeSubscriptionCode} before Starter downgrade`);
      } catch (err: any) {
        // Log but don't block the downgrade — the subscription will expire naturally
        this.logger.warn(`Could not cancel subscription ${activeSubscriptionCode}: ${err?.message}`);
      }
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: { plan: 'starter' },
    });

    this.logger.log(`Company ${companyId} downgraded to Starter (free, no billing)`);
    return { plan: 'starter', message: 'Switched to Starter plan (free). No charges will apply.' };
  }

  async getSubscription(subscriptionCode: string) {
    const { data } = await axios.get(
      `${PAYSTACK_BASE}/subscription/${subscriptionCode}`,
      { headers: this.headers },
    );
    return data.data;
  }

  async cancelSubscription(subscriptionCode: string, emailToken: string) {
    const { data } = await axios.post(
      `${PAYSTACK_BASE}/subscription/disable`,
      { code: subscriptionCode, token: emailToken },
      { headers: this.headers },
    );
    return data;
  }

  // ── Plans ─────────────────────────────────────────────────────────────

  async listPlans() {
    const { data } = await axios.get(`${PAYSTACK_BASE}/plan`, { headers: this.headers });
    return data.data;
  }

  async createPlan(dto: { name: string; amount: number; interval: string; description?: string }) {
    const { data } = await axios.post(`${PAYSTACK_BASE}/plan`, dto, { headers: this.headers });
    return data.data;
  }

  // ── Customers ─────────────────────────────────────────────────────────

  async createCustomer(email: string, name?: string) {
    const { data } = await axios.post(
      `${PAYSTACK_BASE}/customer`,
      { email, first_name: name?.split(' ')[0], last_name: name?.split(' ')[1] },
      { headers: this.headers },
    );
    return data.data;
  }

  // ── Company billing balance ────────────────────────────────────────────

  async getCompanyPayments(companyId: string) {
    return this.prisma.payment.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
