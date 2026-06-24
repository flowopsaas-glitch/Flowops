import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Converts e-commerce orders from Shopify / WooCommerce into FlowOps waybills.
 *
 * Store connection is configured via environment variables per company:
 *
 *   SHOPIFY_SECRET_<COMPANY_ID>   = the webhook secret set in Shopify admin
 *   SHOPIFY_DOMAIN_<COMPANY_ID>   = e.g. mystore.myshopify.com
 *   WC_SECRET_<COMPANY_ID>        = the webhook secret from WooCommerce settings
 *   WC_SOURCE_<COMPANY_ID>        = the source URL of the WooCommerce store
 *
 * These can also be stored in the Company record's metadata column once a
 * proper store-settings UI is wired up.
 */
@Injectable()
export class EcommerceService {
  private readonly logger = new Logger(EcommerceService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ── Company resolution ────────────────────────────────────────────────────

  async resolveCompanyByShop(shopDomain: string): Promise<string | null> {
    if (!shopDomain) return null;
    // Env-based lookup: iterate active companies, compare SHOPIFY_DOMAIN_<id>
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const { id } of companies) {
      const configured = this.config.get<string>(`SHOPIFY_DOMAIN_${id}`);
      if (configured && configured.toLowerCase() === shopDomain.toLowerCase()) return id;
    }
    return null;
  }

  async resolveCompanyBySource(source: string): Promise<string | null> {
    if (!source) return null;
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const { id } of companies) {
      const configured = this.config.get<string>(`WC_SOURCE_${id}`);
      if (configured && source.startsWith(configured)) return id;
    }
    return null;
  }

  // ── Signature verification ────────────────────────────────────────────────

  verifyShopifySignature(rawBody: Buffer, signature: string, companyId: string): boolean {
    if (!signature) return false;
    const secret = this.config.get<string>(`SHOPIFY_SECRET_${companyId}`);
    if (!secret) {
      this.logger.warn(`SHOPIFY_SECRET_${companyId} not configured — skipping sig check`);
      return true; // Allow through; ops team must configure secret
    }
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  verifyWooCommerceSignature(rawBody: Buffer, signature: string, companyId: string): boolean {
    if (!signature) return false;
    const secret = this.config.get<string>(`WC_SECRET_${companyId}`);
    if (!secret) {
      this.logger.warn(`WC_SECRET_${companyId} not configured — skipping sig check`);
      return true;
    }
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  // ── Shopify order → waybill ───────────────────────────────────────────────

  async processShopifyOrder(order: any, companyId: string) {
    const shipping = order.shipping_address ?? order.billing_address ?? {};
    const customer = order.customer ?? {};

    const senderName    = order.shop_name ?? 'Shopify Store';
    const recipientName = (`${shipping.first_name ?? ''} ${shipping.last_name ?? ''}`.trim())
      || (customer.first_name ?? 'Customer');
    const recipientPhone = shipping.phone || customer.phone || '';
    const recipientAddress = [
      shipping.address1, shipping.address2, shipping.city, shipping.province,
    ].filter(Boolean).join(', ') || 'See order';

    const totalAmount = parseFloat(order.total_price ?? '0') || 0;
    const codAmount   = order.payment_gateway === 'cod' ? totalAmount : null;

    // Idempotency: skip if a waybill for this Shopify order already exists
    const existing = await this.prisma.waybill.findFirst({
      where: { companyId, description: { contains: `shopify:${order.id}` } },
    });
    if (existing) return { status: 'duplicate', waybillId: existing.id };

    const count = await this.prisma.waybill.count({ where: { companyId } });
    const yr = new Date().getFullYear().toString().slice(-2);
    const trackingNumber = `FO${yr}${String(count + 1).padStart(6, '0')}`;

    const waybill = await this.prisma.waybill.create({
      data: {
        companyId, trackingNumber, status: 'PENDING',
        senderName, senderPhone: '', senderAddress: 'Store',
        recipientName, recipientPhone, recipientAddress,
        weight: this.totalWeightKg(order.line_items),
        description: `shopify:${order.id} #${order.order_number}`,
        totalAmount,
        ...(codAmount != null && { codAmount }),
      },
    });

    this.logger.log(`Shopify order ${order.id} → waybill ${trackingNumber}`);
    return { status: 'created', waybillId: waybill.id, trackingNumber };
  }

  // ── WooCommerce order → waybill ───────────────────────────────────────────

  async processWooCommerceOrder(order: any, companyId: string) {
    const shipping = order.shipping ?? {};
    const billing  = order.billing  ?? {};

    const senderName    = 'WooCommerce Store';
    const recipientName = `${shipping.first_name ?? billing.first_name ?? ''} ${shipping.last_name ?? billing.last_name ?? ''}`.trim() || 'Customer';
    const recipientPhone    = billing.phone || shipping.phone || '';
    const recipientAddress  = [
      shipping.address_1, shipping.address_2, shipping.city, shipping.state,
    ].filter(Boolean).join(', ') || 'See order';

    const totalAmount = parseFloat(order.total ?? '0') || 0;
    const codAmount   = order.payment_method === 'cod' ? totalAmount : null;

    const existing = await this.prisma.waybill.findFirst({
      where: { companyId, description: { contains: `woo:${order.id}` } },
    });
    if (existing) return { status: 'duplicate', waybillId: existing.id };

    const count = await this.prisma.waybill.count({ where: { companyId } });
    const yr    = new Date().getFullYear().toString().slice(-2);
    const trackingNumber = `FO${yr}${String(count + 1).padStart(6, '0')}`;

    const waybill = await this.prisma.waybill.create({
      data: {
        companyId, trackingNumber, status: 'PENDING',
        senderName, senderPhone: '', senderAddress: 'Store',
        recipientName, recipientPhone, recipientAddress,
        weight: this.totalWeightWoo(order.line_items),
        description: `woo:${order.id} #${order.number}`,
        totalAmount,
        ...(codAmount != null && { codAmount }),
      },
    });

    this.logger.log(`WooCommerce order ${order.id} → waybill ${trackingNumber}`);
    return { status: 'created', waybillId: waybill.id, trackingNumber };
  }

  // ── Status push-back to Shopify ───────────────────────────────────────────

  /**
   * Called by WaybillsService whenever a waybill status changes.
   * If the waybill was created from a Shopify order (description contains
   * "shopify:<ORDER_ID>"), this pushes a fulfillment or note update back to
   * the merchant's Shopify store so they see live delivery progress.
   *
   * Credentials read from env per company:
   *   SHOPIFY_DOMAIN_<COMPANY_ID>         = mystore.myshopify.com
   *   SHOPIFY_ACCESS_TOKEN_<COMPANY_ID>   = shpat_xxxxx
   *
   * Shopify API is called only when both are configured — degrades silently
   * when not set so tenants without Shopify are unaffected.
   */
  async pushStatusToShopify(waybill: {
    id: string;
    description?: string | null;
    status: string;
    trackingNumber: string;
    companyId: string;
    recipientName?: string | null;
    podDeliveredAt?: Date | null;
  }): Promise<void> {
    if (!waybill.description?.includes('shopify:')) return;

    const match = waybill.description.match(/shopify:(\d+)/);
    if (!match) return;
    const orderId = match[1];

    const domain       = this.config.get<string>(`SHOPIFY_DOMAIN_${waybill.companyId}`);
    const accessToken  = this.config.get<string>(`SHOPIFY_ACCESS_TOKEN_${waybill.companyId}`);
    if (!domain || !accessToken) return; // not configured — skip silently

    const apiVersion = '2024-01';
    const base       = `https://${domain}/admin/api/${apiVersion}`;
    const headers    = {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    };

    try {
      // Map FlowOps status to Shopify fulfillment status
      const shopifyStatus = this.mapToShopifyStatus(waybill.status);

      if (waybill.status === 'DELIVERED') {
        // Create a fulfillment on the Shopify order
        await fetch(`${base}/orders/${orderId}/fulfillments.json`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fulfillment: {
              status: 'success',
              tracking_number: waybill.trackingNumber,
              tracking_company: 'FlowOps',
              notify_customer: true,
            },
          }),
        });
        this.logger.log(`Shopify fulfillment created for order ${orderId}`);
      } else if (['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURNED'].includes(waybill.status)) {
        // Add an order note so the merchant can see progress
        await fetch(`${base}/orders/${orderId}.json`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            order: {
              id: orderId,
              note: `FlowOps: ${shopifyStatus} (${waybill.trackingNumber}) — ${new Date().toISOString()}`,
            },
          }),
        });
        this.logger.log(`Shopify order ${orderId} note updated: ${shopifyStatus}`);
      }
    } catch (err) {
      // Network or Shopify API errors must NOT break the waybill update flow
      this.logger.warn(`Shopify push-back failed for order ${orderId}: ${(err as Error).message}`);
    }
  }

  private mapToShopifyStatus(flowopsStatus: string): string {
    const map: Record<string, string> = {
      PENDING:          'Pending pickup',
      COLLECTED:        'Collected from sender',
      IN_TRANSIT:       'In transit',
      OUT_FOR_DELIVERY: 'Out for delivery',
      DELIVERED:        'Delivered',
      FAILED_DELIVERY:  'Delivery attempt failed',
      RETURNED:         'Returned to sender',
      CANCELLED:        'Cancelled',
    };
    return map[flowopsStatus] ?? flowopsStatus;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private totalWeightKg(lineItems: any[] = []): number {
    return lineItems.reduce((s: number, item: any) => {
      const g = parseFloat(item.grams ?? 0) || 0;
      return s + (g / 1000) * (parseInt(item.quantity) || 1);
    }, 0) || 1;
  }

  private totalWeightWoo(lineItems: any[] = []): number {
    return lineItems.reduce((s: number, item: any) => {
      const w = parseFloat(item.weight ?? 0) || 0;
      return s + w * (parseInt(item.quantity) || 1);
    }, 0) || 1;
  }
}
