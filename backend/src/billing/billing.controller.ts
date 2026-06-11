import { Controller, Get, Post, Param, Req, UseGuards, ParseIntPipe, Res, Body, Headers } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // 💳 PAYSTACK PORTAL: Initiates the ZAR checkout
  @UseGuards(JwtAuthGuard)
  @Post('initialize-payment')
  async initPayment(@Req() req: any, @Body() body: { planId: string }) {
    return this.billingService.initializePaystackTransaction(req.user.id, body.planId);
  }

  // 🛡️ WEBHOOK: Paystack calls this to confirm money is received
  // Ensure this route is excluded from your global AuthGuard if you have one
  @Post('webhook')
  async handleWebhook(@Body() payload: any, @Headers('x-paystack-signature') signature: string) {
    return this.billingService.handlePaystackWebhook(payload, signature);
  }

  @UseGuards(JwtAuthGuard)
  @Get('metrics')
  async getMetrics(@Req() req: any) {
    return this.billingService.getRevenueMetrics(req.user.companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscription/generate')
  async generateSubscriptionInvoice(@Req() req: any) {
    return this.billingService.processSubscriptionBilling(req.user.companyId);
  }

  // ... (Your existing batch/draft routes)
  @UseGuards(JwtAuthGuard)
  @Get('batches')
  async getBatches(@Req() req: any) {
    return this.billingService.findAllBatches(req.user.companyId);
  }
}
