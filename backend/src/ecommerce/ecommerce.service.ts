import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { BillingService } from '../billing/billing.service';
import { IntegrationCredentialService } from '../integrations/integration-credential.service';

/**
 * Converts e-commerce orders from Shopify / WooCommerce into FlowOps waybills.
 *
 * Store connections are tenant self-service: each company saves its own store
 * domain + webhook secret (plus an optional Shopify access token for status
 * push-back) in Settings -> Integrations, stored AES-256-GCM encrypted via the
 * integration credential store. Legacy per-install env vars (the SHOPIFY and WC
 * variables keyed by company id) are still honoured as a fallback so existing
 * deployments keep working.
 */
@Injectable()
export class EcommerceService {
  private readonly logger = new Logger(EcommerceService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private billing: BillingService,
    private creds: IntegrationCredentialService,
  ) {}

  // ── Company resolution ────────────────────────────────────────────────────

  async resolveCompanyByShop(shopDomain: string): Promise<string | null> {
    if (!shopDomain) return null;
    // 1) Tenant self-service credential (single indexed lookup).
    const viaDb = await this.creds.resolveCompanyByRef('shopify', shopDomain);
    if (viaDb) return viaDb;
    // 2) Legacy env fallback: compare SHOPIFY_DOMAIN_<id> across companies.
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
    // 1) Tenant self-service credential.
    const viaDb = await this.creds.resolveCompanyByRef('woocommerce', source);
    if (viaDb) return viaDb;
    // 2) Legacy env fallback.
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

  async verifyShopifySignature(rawBody: Buffer, signature: string, companyId: string): Promise<boolean> {
    if (!signature) return false;
    const cred = await this.creds.getDecrypted(companyId, 'shopify');
    const secret =
      cred?.secrets?.webhookSecret || this.config.get<string>(`SHOPIFY_SECRET_${companyId}`);
    if (!secret) {
      // FAIL CLOSED: no configured secret means we cannot trust the payload.
      this.logger.warn(`No Shopify webhook secret for company ${companyId} — rejecting webhook.`);
      return false;
    }
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return this.safeEqual(expected, signature);
  }

  async verifyWooCommerceSignature(rawBody: Buffer, signature: string, companyId: string): Promise<boolean> {
    if (!signature) return false;
    const cred = await this.creds.getDecrypted(companyId, 'woocommerce');
    const secret =
      cred?.secrets?.webhookSecret || this.config.get<string>(`WC_SECRET_${companyId}`);
    if (!secret) {
      this.logger.warn(`No WooCommerce webhook secret for company ${companyId} — rejecting webhook.`);
      return false;
    }
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return this.safeEqual(expected, signature);
  }

  /** Constant-time compare that won't throw on length mismatch. */
  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  /** True only if the company's plan currently includes e-commerce connectors. */
  private async ecommerceEnabled(companyId: string): Promise<boolean> {
    const ok = await this.billing.hasFeature(companyId, 'ecommerce');
    if (!ok) {
      this.logger.warn(`E-commerce order ignored — company ${companyId} has no e-commerce entitlement.`);
    }
    return ok;
  }

  /**
   * Create the waybill for an e-commerce order.
   *
   * `trackingNumber` is unique per company (`@@unique([trackingNumber, companyId])`)
   * but is derived from `count(waybills) + 1`. Two orders landing together
   * therefore compute the same number, and the second insert fails with P2002.
   * Unhandled, that turned an ordinary burst of webhooks into a 500 and a lost
   * order — and the retry that followed hit the same collision again.
   *
   * On collision we re-check the idempotency marker: if the same order won the
   * race this is a duplicate, otherwise we take a fresh number and try again.
   */
  private async createOrderWaybill(
    companyId: string,
    marker: string,
    data: (trackingNumber: string) => any,
  ): Promise<{ status: string; waybillId: string; trackingNumber?: string }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const count = await this.prisma.waybill.count({ where: { companyId } });
      const yr = new Date().getFullYear().toString().slice(-2);
      const trackingNumber = `FO${yr}${String(count + 1).padStart(6, '0')}`;
      try {
        const waybill = await this.prisma.waybill.create({ data: data(trackingNumber) });
        return { status: 'created', waybillId: waybill.id, trackingNumber };
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
        const existing = await this.prisma.waybill.findFirst({
          where: { companyId, description: { contains: marker } },
        });
        if (existing) return { status: 'duplicate', waybillId: existing.id };
      }
    }
    throw new ConflictException('Could not allocate a tracking number for this order.');
  }

  // ── Shopify order → waybill ───────────────────────────────────────────────

  async processShopifyOrder(order: any, companyId: string) {
    if (!(await this.ecommerceEnabled(companyId))) return { status: 'feature_disabled' };

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

    // Idempotency: skip if a waybill for this Shopify order already exists.
    // The marker carries the " #" that always follows the id. Without it a bare
    // `shopify:<id>` prefix match made order 12 collide with order 123, so a
    // retry of 12 arriving after 123 had landed was silently dropped — the
    // duplicate check firing precisely when it should not.
    const marker = `shopify:${order.id} #`;
    const existing = await this.prisma.waybill.findFirst({
      where: { companyId, description: { contains: marker } },
    });
    if (existing) return { status: 'duplicate', waybillId: existing.id };

    const result = await this.createOrderWaybill(companyId, marker, (trackingNumber) => ({
      companyId, trackingNumber, status: 'PENDING',
      senderName, senderPhone: '', senderAddress: 'Store',
      recipientName, recipientPhone, recipientAddress,
      weight: this.totalWeightKg(order.line_items),
      description: `shopify:${order.id} #${order.order_number}`,
      totalAmount,
      ...(codAmount != null && { codAmount }),
    }));

    if (result.status === 'created') {
      this.logger.log(`Shopify order ${order.id} → waybill ${result.trackingNumber}`);
    }
    return result;
  }

  // ── WooCommerce order → waybill ───────────────────────────────────────────

  async processWooCommerceOrder(order: any, companyId: string) {
    if (!(await this.ecommerceEnabled(companyId))) return { status: 'feature_disabled' };

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

    // Anchored the same way as the Shopify marker, for the same reason.
    const marker = `woo:${order.id} #`;
    const existing = await this.prisma.waybill.findFirst({
      where: { companyId, description: { contains: marker } },
    });
    if (existing) return { status: 'duplicate', waybillId: existing.id };

    const result = await this.createOrderWaybill(companyId, marker, (trackingNumber) => ({
      companyId, trackingNumber, status: 'PENDING',
      senderName, senderPhone: '', senderAddress: 'Store',
      recipientName, recipientPhone, recipientAddress,
      weight: this.totalWeightWoo(order.line_items),
      description: `woo:${order.id} #${order.number}`,
      totalAmount,
      ...(codAmount != null && { codAmount }),
    }));

    if (result.status === 'created') {
      this.logger.log(`WooCommerce order ${order.id} → waybill ${result.trackingNumber}`);
    }
    return result;
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

    // The ENTIRE remainder — credential decryption AND the Shopify HTTP calls —
    // is wrapped so this method can NEVER reject. Previously getDecrypted() ran
    // outside the try/catch, so a decryption/DB error rejected the promise; the
    // fire-and-forget callers (waybills.service) then produced an
    // unhandledRejection that could crash the process. Now every failure path
    // is swallowed with a warning; a Shopify hiccup never breaks a waybill update.
    try {
      // Tenant self-service credential first, then legacy env fallback.
      const cred = await this.creds.getDecrypted(waybill.companyId, 'shopify');
      const domain =
        cred?.config?.shopDomain || this.config.get<string>(`SHOPIFY_DOMAIN_${waybill.companyId}`);
      const accessToken =
        cred?.secrets?.accessToken || this.config.get<string>(`SHOPIFY_ACCESS_TOKEN_${waybill.companyId}`);
      if (!domain || !accessToken) return; // not configured — skip silently

      const apiVersion = '2024-01';
      const base       = `https://${domain}/admin/api/${apiVersion}`;
      const headers    = {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      };

      // Bound each Shopify call so a stalled endpoint can't hang the request.
      const withTimeout = async (url: string, init: RequestInit) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          return await fetch(url, { ...init, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      };

      // Map FlowOps status to Shopify fulfillment status
      const shopifyStatus = this.mapToShopifyStatus(waybill.status);

      if (waybill.status === 'DELIVERED') {
        // Create a fulfillment on the Shopify order
        await withTimeout(`${base}/orders/${orderId}/fulfillments.json`, {
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
        await withTimeout(`${base}/orders/${orderId}.json`, {
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
      // Any error — decryption, network, timeout, Shopify API — must NOT break
      // the waybill update flow and must NOT reject this promise.
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
