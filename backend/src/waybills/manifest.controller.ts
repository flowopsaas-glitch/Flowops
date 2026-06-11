// @ts-nocheck
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/manifests')
export class ManifestController {
  constructor(private prisma: PrismaService) {}

  @Post('create')
  async createManifest(@Body() data: { 
    waybillIds: number[], 
    destination: string, 
    companyId: number 
  }) {
    const manifestNumber = `MAN-${Date.now()}`; // Unique ID generation

    return await this.prisma.$transaction(async (tx) => {
      // 1. Create the Manifest record
      const manifest = await tx.manifest.create({
        data: {
          manifestNumber,
          destination: data.destination,
          companyId: data.companyId,
          status: 'DISPATCHED'
        }
      });

      // 2. Link all selected waybills to this manifest
      await tx.waybill.updateMany({
        where: { id: { in: data.waybillIds } },
        data: { manifestId: manifest.id as any }
      });

      return manifest;
    });
  }
}
