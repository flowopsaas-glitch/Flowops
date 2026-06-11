import {
  Controller, Post, Get, Param, Body, UseGuards, Request,
  BadRequestException, UploadedFile, UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RatingService } from '../rating/rating.service';
import { WhatsAppAutomationService } from '../whatsapp/whatsapp-automation.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('proof-of-delivery')
@UseGuards(JwtAuthGuard)
export class ProofOfDeliveryController {
  constructor(
    private prisma: PrismaService,
    private ratingService: RatingService,
    private whatsappService: WhatsAppAutomationService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('signature'))
  async submitPOD(
    @Request() req: any,
    @UploadedFile() signatureFile: Express.Multer.File,
    @Body() body: { waybillId: number; recipientName?: string; notes?: string; photoBase64?: string },
  ) {
    if (!body.waybillId) throw new BadRequestException('waybillId is required');

    const waybill = await this.prisma.waybill.findUnique({ where: { id: Number(body.waybillId) } });
    if (!waybill) throw new BadRequestException('Waybill not found');
    if (waybill.status === 'DELIVERED') throw new BadRequestException('Waybill already delivered');

    let signatureUrl: string | null = null;
    if (signatureFile) {
      const uploadDir = path.join(process.cwd(), 'uploads', 'pods');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const fileName = `SIG_${body.waybillId}_${Date.now()}.png`;
      fs.writeFileSync(path.join(uploadDir, fileName), signatureFile.buffer);
      signatureUrl = `/uploads/pods/${fileName}`;
    }

    let photoUrl: string | null = null;
    if (body.photoBase64) {
      const uploadDir = path.join(process.cwd(), 'uploads', 'pods');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const fileName = `PHOTO_${body.waybillId}_${Date.now()}.jpg`;
      const base64Data = body.photoBase64.replace(/^data:image\/jpeg;base64,/, '');
      fs.writeFileSync(path.join(uploadDir, fileName), Buffer.from(base64Data, 'base64'));
      photoUrl = `/uploads/pods/${fileName}`;
    }

    // Update Waybill Status
    await this.prisma.waybill.update({
      where: { id: Number(body.waybillId) },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        signatureUrl: signatureUrl,
        podUrl: photoUrl,
      },
    });

    // 🚀 AUTO-RATING TRIGGER
    try {
      await this.ratingService.calculateAndSaveRate(Number(body.waybillId));
    } catch (e) {
      console.log('Rating failed:', e);
    }

    // 🚀 AUTO-NOTIFICATION TRIGGER
    try {
      await this.whatsappService.sendDeliveredNotification(Number(body.waybillId));
    } catch (e) {
      console.log('WhatsApp notification failed:', e);
    }

    return { message: 'POD submitted successfully', waybillId: body.waybillId };
  }

  @Get(':id')
  async getPOD(@Param('id') id: string) {
    const pod = await this.prisma.proofOfDelivery.findFirst({
      where: { waybillId: parseInt(id) },
    });
    if (!pod) throw new BadRequestException('POD not found for this waybill');
    return pod;
  }
}
