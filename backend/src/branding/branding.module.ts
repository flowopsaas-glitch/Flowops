import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BrandingService } from './branding.service';

/**
 * BRANDING MODULE - White-Label customization
 *
 * Provides:
 * - Custom logo, colors, domain
 * - CSS injection for frontend
 * - Domain → company resolution
 * - POD portal branding
 *
 * Feature Gate: ENTERPRISE tier only
 * if (company.enabledFeatures?.includes('white-label')) { ... }
 */
@Module({
  imports: [PrismaModule],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
