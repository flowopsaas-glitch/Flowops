import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GeocodingService } from './geocoding.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Geocoding')
@ApiBearerAuth()
@Controller('geocode')
export class GeocodingController {
  constructor(
    private readonly geo: GeocodingService,
    private readonly prisma: PrismaService,
  ) {}

  private async companyCountry(companyId: string): Promise<string | undefined> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { country: true },
    });
    return company?.country ?? undefined;
  }

  /** Validate / resolve a single address to coordinates. */
  @Post()
  @HttpCode(200)
  async geocode(
    @CurrentUser() u: any,
    @Body() body: { address: string; country?: string },
  ) {
    const country = body.country ?? (await this.companyCountry(u.companyId));
    const point = await this.geo.geocode(body.address, country);
    return { point };
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Backfill missing coordinates on existing collections (admin maintenance). */
  @Post('backfill/collections')
  @HttpCode(200)
  async backfillCollections(@CurrentUser() u: any, @Query('limit') limit?: string) {
    const take = Math.min(Number(limit) || 50, 200);
    const country = await this.companyCountry(u.companyId);
    const rows = await this.prisma.collection.findMany({
      where: {
        companyId: u.companyId,
        OR: [{ pickupLat: null }, { pickupLng: null }],
        NOT: { pickupAddress: '' },
      },
      select: { id: true, pickupAddress: true },
      take,
    });

    let updated = 0;
    for (const row of rows) {
      const point = await this.geo.geocode(row.pickupAddress, country);
      if (point) {
        await this.prisma.collection.update({
          where: { id: row.id },
          data: { pickupLat: point.lat, pickupLng: point.lng },
        });
        updated++;
      }
      await this.sleep(1100); // respect free geocoder rate limits
    }
    return { scanned: rows.length, updated };
  }

  /** Backfill missing recipient coordinates on existing waybills. */
  @Post('backfill/waybills')
  @HttpCode(200)
  async backfillWaybills(@CurrentUser() u: any, @Query('limit') limit?: string) {
    const take = Math.min(Number(limit) || 50, 200);
    const country = await this.companyCountry(u.companyId);
    const rows = await this.prisma.waybill.findMany({
      where: {
        companyId: u.companyId,
        OR: [{ recipientLat: null }, { recipientLng: null }],
      },
      select: { id: true, recipientAddress: true },
      take,
    });

    let updated = 0;
    for (const row of rows) {
      const point = await this.geo.geocode(row.recipientAddress, country);
      if (point) {
        await this.prisma.waybill.update({
          where: { id: row.id },
          data: { recipientLat: point.lat, recipientLng: point.lng },
        });
        updated++;
      }
      await this.sleep(1100);
    }
    return { scanned: rows.length, updated };
  }
}
