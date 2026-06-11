import { 
  Controller, Get, Post, Put, Body, Param, UseGuards, Request, 
  BadRequestException 
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppAutomationService } from '../whatsapp/whatsapp-automation.service';

@Controller('manifests')
@UseGuards(JwtAuthGuard)
export class ManifestsController {
  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsAppAutomationService,
  ) {}

  @Get()
  async findAll(@Request() req: any) {
    return this.prisma.manifest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        waybillManifests: {
          include: { waybill: true },
          orderBy: { scannedAt: 'desc' },
        },
      },
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const manifest = await this.prisma.manifest.findUnique({
      where: { id: parseInt(id) },
      include: {
        waybillManifests: {
          include: { waybill: true },
          orderBy: { scannedAt: 'asc' },
        },
      },
    });
    if (!manifest) throw new BadRequestException('Manifest not found');
    return manifest;
  }

  @Post()
  async create(@Body() body: any) {
    const manifestNumber = `MNF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    return this.prisma.manifest.create({
      data: {
        manifestNumber,
        destination: body.destination || 'Unassigned',
        status: body.status || 'OPEN',
        notes: body.notes || '',
      },
    });
  }

  @Post(':id/scan')
  async scanWaybill(@Param('id') id: string, @Body() body: { waybillNumber: string }) {
    if (!body.waybillNumber) throw new BadRequestException('waybillNumber is required');
    
    const manifest = await this.prisma.manifest.findUnique({ 
      where: { id: parseInt(id) } 
    });
    if (!manifest) throw new BadRequestException('Manifest not found');
    if (manifest.status === 'CLOSED') throw new BadRequestException('Manifest is locked');

    const waybill = await this.prisma.waybill.findFirst({
      where: { waybillNumber: body.waybillNumber },
    });
    if (!waybill) throw new BadRequestException('Waybill not found');

    // Check if already linked
    const existingLink = await this.prisma.waybillManifest.findFirst({
      where: { manifestId: parseInt(id), waybillId: waybill.id },
    });
    if (existingLink) {
      return { status: 'DUPLICATE', message: 'Waybill already in manifest' };
    }

    // Create junction record
    await this.prisma.waybillManifest.create({
      data: {
        manifestId: parseInt(id),
        waybillId: waybill.id,
        scannedAt: new Date(),
        status: 'SCANNED_IN',
      },
    });

    // Update waybill status
    await this.prisma.waybill.update({
      where: { id: waybill.id },
      data: { status: 'IN_TRANSIT' },
    });

    // 🚀 AUTO-NOTIFICATION TRIGGER
    try {
      await this.whatsappService.sendEnRouteNotification(waybill.id);
    } catch (e) {
      console.log('WhatsApp notification failed:', e);
    }

    return { status: 'SCANNED_IN', message: 'Waybill added to manifest' };
  }

  @Put(':id/close')
  async closeManifest(@Param('id') id: string) {
    const updatedManifest = await this.prisma.manifest.update({
      where: { id: parseInt(id) },
      data: { 
        status: 'CLOSED', 
        closedAt: new Date() 
      },
    });

    // 🚀 AUTO-INVOICE TRIGGER ON MANIFEST CLOSE
    try {
      // Note: Ensure BatchInvoiceService is imported and injected if you want this active
      // For now, we just log it to prevent build errors if service isn't ready
      console.log(`✅ Manifest ${updatedManifest.id} closed. Invoice generation would trigger here.`);
    } catch (err: any) {
      console.error(`❌ Failed to auto-generate invoice for manifest ${updatedManifest.id}:`, err.message);
    }

    return { ...updatedManifest, message: 'Manifest locked successfully' };
  }

  @Post(':id/demanifest')
  async demanifest(@Param('id') id: string, @Body() body: { scannedWaybills?: string[] }) {
    const manifest = await this.prisma.manifest.findUnique({
      where: { id: parseInt(id) },
      include: { waybillManifests: { include: { waybill: true } } },
    });
    if (!manifest) throw new BadRequestException('Manifest not found');

    const expectedIds = new Set(manifest.waybillManifests.map(wm => wm.waybill.id));
    const scannedIds = new Set(body.scannedWaybills?.map(Number) || []);

    const shortSupply = [...expectedIds].filter(id => !scannedIds.has(id));
    const overSupply = [...scannedIds].filter(id => !expectedIds.has(id));

    // Update statuses
    for (const wm of manifest.waybillManifests) {
      if (scannedIds.has(wm.waybill.id)) {
        await this.prisma.waybill.update({
          where: { id: wm.waybill.id },
          data: { status: 'ARRIVED_AT_HUB' },
        });
        await this.prisma.waybillManifest.update({
          where: { id: wm.id },
          data: { status: 'RECEIVED' },
        });
      } else {
        await this.prisma.waybillManifest.update({
          where: { id: wm.id },
          data: { status: 'SHORT_SUPPLY' },
        });
      }
    }

    return {
      manifestId: manifest.id,
      totalExpected: expectedIds.size,
      totalScanned: scannedIds.size,
      shortSupply,
      overSupply,
      message: 'De-manifesting complete',
    };
  }

  @Get(':id/exceptions')
  async getExceptions(@Param('id') id: string) {
    const exceptions = await this.prisma.waybillManifest.findMany({
      where: {
        manifestId: parseInt(id),
        status: { in: ['SHORT_SUPPLY', 'OVER_SUPPLY'] },
      },
      include: { waybill: true },
    });
    return exceptions;
  }
}
