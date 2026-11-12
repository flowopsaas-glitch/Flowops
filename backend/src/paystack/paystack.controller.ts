import {
  Controller, Get, Post, Body, Param, Req, RawBodyRequest,
  HttpCode, HttpStatus, UnauthorizedException, Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { PaystackService } from './paystack.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CreatePlanDto, InitializePaymentDto } from './dto/paystack.dto';

@ApiTags('Paystack')
@ApiBearerAuth()
@Controller('paystack')
export class PaystackController {
  private readonly logger = new Logger(PaystackController.name);

  constructor(private readonly svc: PaystackService) {}

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('initialize')
  @ApiOperation({ summary: 'Initialize a Paystack payment' })
  initializePayment(@CurrentUser() u: any, @Body() body: InitializePaymentDto) {
    return this.svc.initializePayment({
      email: body.email ?? u.email,
      amount: body.amount,
      companyId: u.companyId,
      invoiceId: body.invoiceId,
      description: body.description,
      callbackUrl: body.callbackUrl,
      metadata: body.metadata,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Get('verify/:reference')
  @ApiOperation({ summary: 'Verify a Paystack payment by reference' })
  verifyPayment(@Param('reference') reference: string) {
    return this.svc.verifyPayment(reference);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Get('payments')
  @ApiOperation({ summary: 'List company payment history' })
  getPayments(@CurrentUser() u: any) {
    return this.svc.getCompanyPayments(u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Get('plans')
  @ApiOperation({ summary: 'List Paystack billing plans' })
  listPlans() {
    return this.svc.listPlans();
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('plans')
  @ApiOperation({ summary: 'Create a new Paystack billing plan' })
  createPlan(@Body() body: CreatePlanDto) {
    return this.svc.createPlan(body);
  }

  // ── Subscriptions ─────────────────────────────────────────────────────

  /**
   * POST /api/v1/paystack/checkout
   *
   * The PRIMARY upgrade flow for tenants. Creates a Paystack transaction that
   * also sets up a recurring subscription. Tenant is redirected to Paystack's
   * hosted checkout page. On success → plan is activated via webhook +
   * callback verification.
   *
   * Body:
   *   { planCode: 'PLN_l3kobthzahnkpf3' }   ← Professional
   *   { planCode: 'PLN_9at9kn2ra8jtae0' }   ← Enterprise
   */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start subscription checkout (redirect to Paystack)' })
  checkout(
    @CurrentUser() u: any,
    @Body() body: { planCode: string; callbackUrl?: string },
  ) {
    const appUrl = process.env.APP_URL || 'https://app.flowop.work';
    const callbackUrl = body.callbackUrl || `${appUrl}/billing/callback`;
    return this.svc.initializeSubscriptionCheckout({
      email: u.email,
      companyId: u.companyId,
      planCode: body.planCode,
      callbackUrl,
    });
  }

  /**
   * GET /api/v1/paystack/verify-subscription/:reference
   *
   * Called by the frontend callback page after Paystack redirects back.
   * Verifies the transaction, activates the plan, and returns result for the UI.
   */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Get('verify-subscription/:reference')
  @ApiOperation({ summary: 'Verify subscription payment and activate plan' })
  verifySubscription(@Param('reference') reference: string) {
    return this.svc.verifyAndActivateSubscription(reference);
  }

  /**
   * POST /api/v1/paystack/subscribe
   *
   * Handles all plan activations — both free and paid:
   *
   *   { planId: 'starter' }
   *     → Free. Activates immediately. Cancels any existing paid subscription.
   *       No Paystack transaction created.
   *
   *   { planCode: 'PLN_l3kobthzahnkpf3' }   ← Professional (ZAR 19,999/month)
   *   { planCode: 'PLN_9at9kn2ra8jtae0' }   ← Enterprise   (Custom, ZAR 250,000/month)
   *     → Paid. Creates a Paystack recurring subscription.
   *       Company.plan is updated automatically on success.
   *
   * Optional fields for paid plans:
   *   authorization  — Paystack authorization code to reuse an existing card
   *   email          — override the email used for the subscription
   */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a plan — free (starter) or paid (Professional / Enterprise)' })
  subscribe(
    @CurrentUser() u: any,
    @Body()
    body: {
      planId?: string;
      planCode?: string;
      email?: string;
      authorization?: string;
      activeSubscriptionCode?: string;
    },
  ) {
    // ── Free plan: no Paystack ─────────────────────────────────────────
    if (body.planId === 'starter' || body.planCode === null) {
      return this.svc.activateStarterPlan(u.companyId, body.activeSubscriptionCode);
    }

    // ── Paid plan: Paystack subscription ──────────────────────────────
    if (!body.planCode) {
      throw new Error('Provide planId: "starter" for the free plan, or planCode for a paid plan');
    }

    return this.svc.createSubscription({
      email: body.email ?? u.email,
      planCode: body.planCode,
      companyId: u.companyId,
      authorization: body.authorization,
    });
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Get('subscriptions/:code')
  @ApiOperation({ summary: 'Get a subscription by code' })
  getSubscription(@Param('code') code: string) {
    return this.svc.getSubscription(code);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('subscriptions/:code/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a subscription' })
  cancelSubscription(
    @Param('code') code: string,
    @Body() body: { emailToken: string },
  ) {
    return this.svc.cancelSubscription(code, body.emailToken);
  }

  // ── Webhook ───────────────────────────────────────────────────────────

  /**
   * POST /api/v1/paystack/webhook
   *
   * Paystack signs the request body with HMAC-SHA512 using your secret key.
   * Header: x-paystack-signature
   *
   * Paystack only sends from the IPs listed in PAYSTACK_WEBHOOK_IPS.
   * Configure your webhook URL in Paystack Dashboard:
   *   Settings → API Keys & Webhooks → Webhooks → Add webhook URL
   */
  @Public()
  @SkipThrottle() // external provider callback (IP + signature verified)
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paystack event webhook' })
  async handleWebhook(@Req() req: RawBodyRequest<Request>, @Body() body: any) {
    const signature = req.headers['x-paystack-signature'] as string ?? '';
    const ip = req.ip ?? req.connection?.remoteAddress ?? '';
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));

    // IP allowlist check
    if (!this.svc.verifyWebhookIp(ip)) {
      this.logger.warn(`Paystack webhook rejected: IP ${ip} not whitelisted`);
      throw new UnauthorizedException('Unauthorized webhook source');
    }

    // Signature verification
    if (!this.svc.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('Paystack webhook signature mismatch');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event: string = body.event;
    const data = body.data;

    await this.svc.handleWebhookEvent(event, data, body);

    return { received: true };
  }
}
