import { Body, Controller, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { GeocodingService } from './geocoding.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SmartResolveDto } from './dto/smart-resolve.dto';

@ApiTags('Geocoding')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
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

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /geocode — basic address → coordinates (backwards compatible)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Resolve a single address to coordinates. */
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Geocode an address to lat/lng' })
  async geocode(
    @CurrentUser() u: any,
    @Body() body: { address: string; country?: string },
  ) {
    const country = body.country ?? (await this.companyCountry(u.companyId));
    const point = await this.geo.geocode(body.address, country);
    return { point };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /geocode/smart — WORLD-CLASS Smart Address Resolution
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Smart address resolution — the flagship endpoint.
   *
   * Combines:
   * - AddressBook fuzzy matching (Levenshtein + Jaccard token overlap)
   * - SA-specific normalization (JHB → Johannesburg, st → street, etc.)
   * - Multi-provider geocoding (Nominatim/Google/Mapbox) with TTL cache
   * - Confidence scoring (0-100)
   * - Top-5 address book suggestions for autocomplete
   * - Automatic usage tracking (address book entries get smarter over time)
   *
   * Returns: { point, canonical, suggestions[], confidence, source, companyId, resolvedInMs }
   */
  @Post('smart')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Smart address resolution with fuzzy matching + geocoding',
    description:
      'Resolves an address using the company address book (fuzzy match) with geocode fallback. ' +
      'Returns coordinates, canonical form, suggestions, and confidence score.',
  })
  async smartResolve(@CurrentUser() u: any, @Body() body: SmartResolveDto) {
    const country = body.country ?? (await this.companyCountry(u.companyId));
    return this.geo.smartResolve(body.address, u.companyId, country);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /geocode/normalize — address normalization utility
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalize an address without resolving/geocoding.
   * Useful for deduplication, display, and search indexing.
   */
  @Post('normalize')
  @HttpCode(200)
  @ApiOperation({ summary: 'Normalize an address (SA-specific intelligence)' })
  async normalize(@Body() body: { address: string }) {
    return {
      original: body.address,
      normalized: this.geo.normalizeAddress(body.address),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN: Backfill endpoints (role-protected)
  // ═══════════════════════════════════════════════════════════════════════════

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Backfill missing coordinates on existing collections (admin maintenance). */
  @Post('backfill/collections')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Backfill missing geocodes on collections (admin)' })
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Backfill missing geocodes on waybills (admin)' })
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
