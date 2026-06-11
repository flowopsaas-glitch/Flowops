import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BrandingModule } from '../branding/branding.module';
import { PodPortalController } from './pod-portal.controller';

/**
 * POD PORTAL MODULE - White-Label Proof of Delivery
 *
 * Public-facing waybill tracking portal with company branding
 * Features:
 * - Branded HTML (logo, colors, custom domain)
 * - Real-time delivery status
 * - Driver info & location
 * - JSON API for mobile apps
 * - No authentication required (public)
 *
 * Example URL:
 * https:/acme-logistics.com/pod/waybill/12345
 * https:/flowops.com/pod/waybill/12345
 */
@Module({
  imports: [PrismaModule, BrandingModule],
  controllers: [PodPortalController],
})
export class PodPortalModule {}
