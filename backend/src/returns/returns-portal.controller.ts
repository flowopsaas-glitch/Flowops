import { Controller, Get, Post, Body, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

/**
 * Consumer Returns Portal — PUBLIC endpoints (no auth required).
 *
 * End customers can:
 * 1. Initiate a return via a QR code link or direct URL
 * 2. Track their return status
 * 3. Find nearest drop-off locations
 *
 * The QR code contains: https://app.flowop.work/returns/{trackingNumber}
 * When scanned, the customer lands on the returns form pre-filled with their order.
 */
@ApiTags('Returns Portal (Public)')
@Public()
@Controller('returns-portal')
export class ReturnsPortalController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /returns-portal/:trackingNumber — Get waybill info for return initiation
   */
  @Get(':trackingNumber')
  @ApiOperation({ summary: 'Get order info for returns (public — via QR code link)' })
  async getOrderForReturn(@Param('trackingNumber') trackingNumber: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { trackingNumber },
      select: {
        id: true, trackingNumber: true, status: true,
        recipientName: true, recipientPhone: true, recipientAddress: true,
        senderName: true, senderAddress: true,
        description: true, weight: true, podDeliveredAt: true,
        company: { select: { id: true, name: true, brandName: true, logoUrl: true, primaryColor: true, phone: true } },
      },
    });

    if (!waybill) throw new NotFoundException('Order not found. Please check your tracking number.');

    // Only allow returns on delivered orders
    if (waybill.status !== 'DELIVERED') {
      return {
        error: true,
        message: 'Returns can only be initiated for delivered orders.',
        status: waybill.status,
        trackingNumber: waybill.trackingNumber,
      };
    }

    // Check if return already exists
    const existingReturn = await this.prisma.return.findFirst({
      where: { waybillId: waybill.id },
      select: { id: true, status: true, createdAt: true },
    });

    return {
      trackingNumber: waybill.trackingNumber,
      waybillId: waybill.id,
      recipient: { name: waybill.recipientName, phone: waybill.recipientPhone, address: waybill.recipientAddress },
      sender: { name: waybill.senderName, address: waybill.senderAddress },
      item: { description: waybill.description, weight: waybill.weight },
      deliveredAt: waybill.podDeliveredAt,
      company: {
        id: waybill.company.id,
        name: waybill.company.brandName || waybill.company.name,
        logo: waybill.company.logoUrl,
        color: waybill.company.primaryColor || '#3b82f6',
        phone: waybill.company.phone,
      },
      existingReturn: existingReturn ? { id: existingReturn.id, status: existingReturn.status, createdAt: existingReturn.createdAt } : null,
      canReturn: !existingReturn || existingReturn.status === 'CANCELLED',
    };
  }

  /**
   * POST /returns-portal/initiate — Customer submits a return request
   */
  @Post('initiate')
  @ApiOperation({ summary: 'Customer initiates a return (public — from QR code flow)' })
  async initiateReturn(@Body() body: {
    waybillId: string;
    reason: string;
    description?: string;
    customerPhone: string;
    customerEmail?: string;
    preferredMethod?: 'PICKUP' | 'DROPOFF';
  }) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: body.waybillId },
      select: { id: true, trackingNumber: true, companyId: true, status: true, recipientName: true },
    });

    if (!waybill) throw new NotFoundException('Order not found');
    if (waybill.status !== 'DELIVERED') {
      return { error: true, message: 'Returns can only be initiated for delivered orders.' };
    }

    // Check for existing active return
    const existing = await this.prisma.return.findFirst({
      where: { waybillId: waybill.id, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
    });
    if (existing) {
      return { error: true, message: 'A return is already in progress for this order.', returnId: existing.id };
    }

    // Create the return
    const returnRecord = await this.prisma.return.create({
      data: {
        waybillId: waybill.id,
        companyId: waybill.companyId,
        reason: body.reason as any,
        description: body.description || `Customer return: ${body.reason}`,
        customerName: waybill.recipientName,
        customerPhone: body.customerPhone,
        customerEmail: body.customerEmail,
        status: 'REQUESTED',
      },
    });

    return {
      success: true,
      returnId: returnRecord.id,
      trackingNumber: waybill.trackingNumber,
      message: 'Your return request has been submitted. You will receive a confirmation shortly.',
      nextSteps: body.preferredMethod === 'DROPOFF'
        ? 'You will receive drop-off location details via WhatsApp/SMS.'
        : 'A driver will be dispatched to collect your return. You will be notified with a collection time.',
    };
  }

  /**
   * GET /returns-portal/status/:returnId — Track return status
   */
  @Get('status/:returnId')
  @ApiOperation({ summary: 'Track return status (public)' })
  async getReturnStatus(@Param('returnId') returnId: string) {
    const ret = await this.prisma.return.findFirst({
      where: { id: returnId },
      select: {
        id: true, status: true, reason: true, description: true,
        customerName: true, createdAt: true, updatedAt: true,
        waybill: { select: { trackingNumber: true } },
        company: { select: { brandName: true, name: true, logoUrl: true, primaryColor: true } },
      },
    });

    if (!ret) throw new NotFoundException('Return not found');

    const statusSteps = [
      { key: 'REQUESTED', label: 'Return Requested', done: true },
      { key: 'APPROVED', label: 'Approved', done: ['APPROVED', 'SCHEDULED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING', 'COMPLETED'].includes(ret.status) },
      { key: 'SCHEDULED', label: 'Collection Scheduled', done: ['SCHEDULED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING', 'COMPLETED'].includes(ret.status) },
      { key: 'IN_TRANSIT', label: 'In Transit', done: ['IN_TRANSIT', 'RECEIVED', 'INSPECTING', 'COMPLETED'].includes(ret.status) },
      { key: 'RECEIVED', label: 'Received at Warehouse', done: ['RECEIVED', 'INSPECTING', 'COMPLETED'].includes(ret.status) },
      { key: 'COMPLETED', label: 'Resolved', done: ret.status === 'COMPLETED' },
    ];

    return {
      returnId: ret.id,
      trackingNumber: ret.waybill?.trackingNumber,
      status: ret.status,
      reason: ret.reason,
      customerName: ret.customerName,
      createdAt: ret.createdAt,
      statusSteps,
      company: {
        name: ret.company?.brandName || ret.company?.name,
        logo: ret.company?.logoUrl,
        color: ret.company?.primaryColor || '#3b82f6',
      },
    };
  }

  /**
   * GET /returns-portal/dropoff-locations/:companyId — Find drop-off points
   */
  @Get('dropoff-locations/:companyId')
  @ApiOperation({ summary: 'Find nearest drop-off locations (branches)' })
  async getDropoffLocations(
    @Param('companyId') companyId: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const branches = await this.prisma.branch.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, address: true, city: true, lat: true, lng: true, phone: true },
    });

    // Sort by distance if coordinates provided
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      branches.sort((a, b) => {
        const distA = a.lat && a.lng ? Math.hypot(a.lat - userLat, a.lng - userLng) : 999;
        const distB = b.lat && b.lng ? Math.hypot(b.lat - userLat, b.lng - userLng) : 999;
        return distA - distB;
      });
    }

    return {
      locations: branches.map((b) => ({
        id: b.id,
        name: b.name,
        address: [b.address, b.city].filter(Boolean).join(', '),
        lat: b.lat,
        lng: b.lng,
        phone: b.phone,
      })),
      count: branches.length,
    };
  }

  /**
   * GET /returns-portal/qr/:trackingNumber — Generate QR code data for return label
   */
  @Get('qr/:trackingNumber')
  @ApiOperation({ summary: 'Generate return QR code data (for labels/emails)' })
  async getQrData(@Param('trackingNumber') trackingNumber: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { trackingNumber },
      select: { id: true, trackingNumber: true, recipientName: true, companyId: true },
    });

    if (!waybill) throw new NotFoundException('Order not found');

    const returnUrl = `https://app.flowop.work/returns/${trackingNumber}`;

    return {
      trackingNumber: waybill.trackingNumber,
      returnUrl,
      qrContent: returnUrl,
      recipientName: waybill.recipientName,
      instructions: [
        'Scan this QR code with your phone camera',
        'Select your reason for return',
        'Choose pickup or drop-off',
        'You will receive confirmation via WhatsApp',
      ],
    };
  }
}
