import { Controller, Get, Post, Body, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { Public } from '../common/decorators/public.decorator';
import { buildWaybillTrackWhere } from '../common/security/portal-lookup.util';

/**
 * Customer Self-Service Portal — PUBLIC endpoints (no auth).
 * Accessed via a branded link containing the company's portalSubdomain or ID.
 * Clients can: track shipments, view invoices, book pickups.
 */
@ApiTags('Customer Portal')
@Public()
@Controller('portal')
export class CustomerPortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeocodingService,
  ) {}

  /**
   * GET /portal/:companyId/branding
   * Returns public branding info for the portal header.
   */
  @Get(':companyId/branding')
  async getBranding(@Param('companyId') companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true, name: true, tradingName: true, brandName: true,
        logoUrl: true, primaryColor: true, portalPrimaryColor: true,
        portalBrandName: true, portalLogoUrl: true, phone: true, email: true,
        whatsappNumber: true,
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return {
      companyId: company.id,
      name: company.portalBrandName || company.brandName || company.tradingName || company.name,
      logo: company.portalLogoUrl || company.logoUrl,
      color: company.portalPrimaryColor || company.primaryColor || '#3b82f6',
      phone: company.phone,
      email: company.email,
      whatsapp: company.whatsappNumber,
    };
  }

  /**
   * GET /portal/:companyId/track?phone=...&email=...
   * Returns all waybills for a given client (by phone or email match on sender fields).
   */
  @Get(':companyId/track')
  async trackShipments(
    @Param('companyId') companyId: string,
    @Query('phone') phone?: string,
    @Query('email') email?: string,
    @Query('tracking') tracking?: string,
  ) {
    if (!phone && !email && !tracking) {
      return { waybills: [], message: 'Provide phone, email, or tracking number to search.' };
    }

    // Unauthenticated endpoint: the filter is the only thing protecting a
    // tenant's shipment data. buildWaybillTrackWhere returns null when the
    // caller supplied no usable filter (a whitespace-only phone used to
    // normalise to `contains: ''` and match every row in the tenant).
    const where = buildWaybillTrackWhere(companyId, { phone, email, tracking });
    if (!where) {
      return {
        waybills: [],
        count: 0,
        message: 'Provide a tracking number, a full phone number, or the exact client email.',
      };
    }

    const waybills = await this.prisma.waybill.findMany({
      where,
      select: {
        id: true, trackingNumber: true, status: true,
        senderName: true, senderAddress: true,
        recipientName: true, recipientAddress: true,
        weight: true, description: true, codAmount: true,
        podDeliveredAt: true, createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { waybills, count: waybills.length };
  }

  /**
   * GET /portal/:companyId/invoices?phone=...&email=...&clientName=...
   * Returns invoices for a given client.
   */
  @Get(':companyId/invoices')
  async getInvoices(
    @Param('companyId') companyId: string,
    @Query('email') email?: string,
  ) {
    // Security: this is a PUBLIC endpoint. It must require an EXACT client
    // email match — never a free-text `clientName contains` search, which let
    // anyone enumerate a tenant's invoices (e.g. ?clientName=a returned every
    // invoice whose name contains "a", exposing client names/emails/amounts).
    // Matching on the exact email a client already knows is the minimum bar for
    // an unauthenticated lookup.
    const trimmed = (email ?? '').trim();
    if (!trimmed || !trimmed.includes('@')) {
      return { invoices: [], count: 0, message: 'Provide the exact client email to view invoices.' };
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, clientEmail: { equals: trimmed, mode: 'insensitive' } },
      select: {
        id: true, invoiceNumber: true, status: true,
        clientName: true, clientEmail: true,
        subtotal: true, tax: true, total: true,
        dueDate: true, paidAt: true, sentAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return { invoices, count: invoices.length };
  }

  /**
   * POST /portal/:companyId/book-pickup
   * Client books a new collection/pickup request.
   */
  @Post(':companyId/book-pickup')
  async bookPickup(
    @Param('companyId') companyId: string,
    @Body() body: {
      clientName: string;
      clientPhone: string;
      clientEmail?: string;
      pickupAddress: string;
      recipientName: string;
      recipientPhone: string;
      recipientAddress: string;
      notes?: string;
    },
  ) {
    // Verify company exists
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, country: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    // Geocode pickup address
    let pickupLat: number | undefined;
    let pickupLng: number | undefined;
    if (body.pickupAddress) {
      const point = await this.geo.geocode(body.pickupAddress, company.country ?? undefined);
      if (point) { pickupLat = point.lat; pickupLng = point.lng; }
    }

    // Create collection
    const collection = await this.prisma.collection.create({
      data: {
        companyId,
        clientName: body.clientName,
        clientPhone: body.clientPhone,
        clientEmail: body.clientEmail,
        pickupAddress: body.pickupAddress,
        notes: body.notes ? `[Portal] ${body.notes}\nRecipient: ${body.recipientName} (${body.recipientPhone}) at ${body.recipientAddress}` : `[Portal] Recipient: ${body.recipientName} (${body.recipientPhone}) at ${body.recipientAddress}`,
        pickupLat,
        pickupLng,
      },
    });

    return {
      success: true,
      collectionId: collection.id,
      message: 'Pickup request submitted. You will be contacted to confirm a collection time.',
    };
  }
}
