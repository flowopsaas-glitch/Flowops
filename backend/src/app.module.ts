import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ThrottlerProxyGuard } from './common/guards/throttler-proxy.guard';

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
import { CopilotModule } from './copilot/copilot.module';
import { BillingModule } from './billing/billing.module';
import { ForwardingModule } from './forwarding/forwarding.module';
import { CarriersModule } from './carriers/carriers.module';
import { DisbursementsModule } from './disbursements/disbursements.module';
import { AccountingIntegrationsModule } from './accounting-integrations/accounting-integrations.module';
import { AutopilotModule } from './autopilot/autopilot.module';
import { SsoModule } from './sso/sso.module';
import { ObservabilityModule } from './observability/observability.module';
import { ReturnsModule } from './returns/returns.module';
import { AccountingModule } from './accounting/accounting.module';
import { SupportModule } from './support/support.module';
import { CourierManagementModule } from './courier-management/courier-management.module';

@Module({
  imports: [
    // Config loaded globally — all modules can inject ConfigService
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Cron scheduling
    ScheduleModule.forRoot(),

    // ── API rate limiting (anti-scrape / anti-abuse) ─────────────────────
    // Generous global backstop (600 req / 60s per client) that only trips on
    // bulk scraping or floods; sensitive routes set tighter @Throttle limits.
    // ttl is in milliseconds (throttler v5).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),

    // Database (global — exported PrismaService available everywhere)
    PrismaModule,

    // Plan entitlements + limit enforcement (global)
    BillingModule,

    // Freight forwarding (import/export — Enterprise, feature-gated)
    ForwardingModule,
    CarriersModule,
    DisbursementsModule,

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
    CopilotModule,
    AccountingIntegrationsModule,
    AutopilotModule,
    SsoModule,
    ObservabilityModule,
    SupportModule,
    CourierManagementModule,

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
    ReturnsModule,
    ManifestsModule,
    InvoicesModule,
    AccountingModule,
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

    // Rate limiting runs last so authenticated requests are tracked per-user
    // (fair on shared office NATs) while @Public routes fall back to client IP
    // (stops login brute-force and unauthenticated scraping).
    { provide: APP_GUARD, useClass: ThrottlerProxyGuard },
  ],
})
export class AppModule {}