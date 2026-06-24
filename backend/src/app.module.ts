import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// Feature modules
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { UsersModule } from './users/users.module';
import { DriversModule } from './drivers/drivers.module';
import { BranchesModule } from './branches/branches.module';
import { WaybillsModule } from './waybills/waybills.module';
import { CollectionsModule } from './collections/collections.module';
import { ClientsModule }     from './clients/clients.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { ManifestsModule } from './manifests/manifests.module';
import { InvoicesModule } from './invoices/invoices.module';
import { RateCardsModule } from './rate-cards/rate-cards.module';
import { QuotesModule } from './quotes/quotes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { PaystackModule } from './paystack/paystack.module';
import { AiModule } from './ai/ai.module';
import { OwnerModule } from './owner/owner.module';
import { StorageModule } from './storage/storage.module';
import { GatewayModule } from './gateway/gateway.module';
import { EmailModule } from './email/email.module';
import { CodModule } from './cod/cod.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { RoutingModule } from './routing/routing.module';
import { EcommerceModule } from './ecommerce/ecommerce.module';
import { RateShoppingModule } from './rate-shopping/rate-shopping.module';
import { TrackingModule } from './tracking/tracking.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ApiModule } from './api/api.module';
import { AuditModule } from './audit/audit.module';
import { DriverPortalModule } from './driver-portal/driver-portal.module';
import { AlertingModule } from './alerting/alerting.module';
import { EmailHubModule } from './email-hub/email-hub.module';

@Module({
  imports: [
    // Config loaded globally — all modules can inject ConfigService
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Cron scheduling
    ScheduleModule.forRoot(),

    // Database (global — exported PrismaService available everywhere)
    PrismaModule,

    // Storage (Cloudflare R2 — global)
    StorageModule,

    // Email (SendGrid — global, gracefully no-ops when key not set)
    EmailModule,

    // Geocoding (address -> coordinates; global, powers routing/map/ETA/tracking)
    GeocodingModule,
    CodModule,
    DriverPortalModule,

    // Route optimization (nearest-neighbour + 2-opt over geocoded stops)
    RoutingModule,

    // Public parcel tracking (no auth) + predictive ETA
    TrackingModule,

    // Tenant integration platform: outbound webhooks + public API (Shopify etc.)
    WebhooksModule,
    ApiModule,
    EcommerceModule,
    RateShoppingModule,

    // Platform audit trail (global)
    AuditModule,

    // Owner alerting engine (global)
    AlertingModule,
    EmailHubModule,

    // Domain modules
    AuthModule,
    CompaniesModule,
    UsersModule,
    DriversModule,
    BranchesModule,
    WaybillsModule,
    CollectionsModule,
    ClientsModule,
    ShipmentsModule,
    ManifestsModule,
    InvoicesModule,
    RateCardsModule,
    QuotesModule,
    NotificationsModule,
    DashboardModule,
    WhatsAppModule,
    PaystackModule,
    AiModule,
    OwnerModule,

    // Real-time Socket.IO gateway
    GatewayModule,
  ],
  controllers: [AppController],
  providers: [
    // Apply JwtAuthGuard globally — all routes need a valid token
    // unless decorated with @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // Apply RolesGuard globally — only enforced when @Roles() is present
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}