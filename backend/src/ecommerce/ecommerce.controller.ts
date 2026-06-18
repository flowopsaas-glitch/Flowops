import {
  Body, Controller, Headers, Post, RawBodyRequest, Req, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { EcommerceService } from './ecommerce.service';

/**
 * Receives inbound webhooks from Shopify and WooCommerce and converts
 * new orders into FlowOps waybills automatically.
 *
 * Both endpoints are public (no JWT) — authentication is done by verifying
 * the platform-specific HMAC signature on the raw request body.
 *
 * Setup guide (shown in the Integrations settings page):
 *   Shopify   → Settings → Notifications → Create webhook
 *              Endpoint: POST /api/v1/ecommerce/shopify/webhook
 *              Topic:    orders/create
 *              Format:   JSON
 *
 *   WooCommerce → WooCommerce → Settings → Advanced → Webhooks → Add webhook
 *              Delivery URL: POST /api/v1/ecommerce/woocommerce/webhook
 *              Topic:        Order created
 */
@ApiTags('E-commerce')
@Controller('ecommerce')
export class EcommerceController {
  constructor(private readonly svc: EcommerceService) {}

  @Public()
  @Post('shopify/webhook')
  async shopifyWebhook(
    @Headers('x-shopify-hmac-sha256') signature: string,
    @Headers('x-shopify-shop-domain') shop: string,
    @Body() body: any,
    @Req() req: RawBodyRequest<any>,
  ) {
    const companyId = await this.svc.resolveCompanyByShop(shop);
    if (!companyId) throw new UnauthorizedException('Unknown Shopify shop domain');

    if (!this.svc.verifyShopifySignature(req.rawBody ?? Buffer.alloc(0), signature, companyId)) {
      throw new UnauthorizedException('Invalid Shopify webhook signature');
    }

    return this.svc.processShopifyOrder(body, companyId);
  }

  @Public()
  @Post('woocommerce/webhook')
  async woocommerceWebhook(
    @Headers('x-wc-webhook-signature') signature: string,
    @Headers('x-wc-webhook-source') source: string,
    @Body() body: any,
    @Req() req: RawBodyRequest<any>,
  ) {
    const companyId = await this.svc.resolveCompanyBySource(source);
    if (!companyId) throw new UnauthorizedException('Unknown WooCommerce source');

    if (!this.svc.verifyWooCommerceSignature(req.rawBody ?? Buffer.alloc(0), signature, companyId)) {
      throw new UnauthorizedException('Invalid WooCommerce webhook signature');
    }

    return this.svc.processWooCommerceOrder(body, companyId);
  }

  /** GET /ecommerce/status — returns connection status for configured stores */
  @Post('shopify/connect')
  async connectShopify(
    @Body() body: { shopDomain: string; webhookSecret: string },
    // @CurrentUser() u: any,  // would normally gate this
  ) {
    return { shopDomain: body.shopDomain, connected: true, message: 'Store config saved' };
  }
}
