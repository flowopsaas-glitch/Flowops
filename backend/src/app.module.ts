import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ThrottlerProxyGuard } from './common/guards/throttler-proxy.guard';
import { ApiShieldGuard } from './common/guards/api-shield.guard';
import { HealthSentinelService } from './common/guards/health-sentinel.service';
import { ApiHealthMonitorService } from './common/guards/api-health-monitor.service';

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
import { IntegrationsModule } from './integrations/integrations.module';
import { TrackingModule } from './tracking/tracking.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ApiModule } from './api/api.module';
import { AuditModule } from './audit/audit.module';
import { DriverPortalModule } from './driver-portal/driver-portal.module';
import { PushModule } from './push/push.module';
import { AlertingModule } from './alerting/alerting.module';
import { EmailHubModule } from './email-hub/email-hub.module';
import { CopilotModule } from './copilot/copilot.module';
import { BillingModule } from './billing/billing.module';
import { ForwardingModule } from './forwarding/forwarding.module';
import { RailModule } from './rail/rail.module';
import { OkrModule } from './okr/okr.module';
import { CarriersModule } from './carriers/carriers.module';
import { DisbursementsModule } from './disbursements/disbursements.module';
import { AccountingIntegrationsModule } from './accounting-integrations/accounting-integrations.module';
import { AutopilotModule } from './autopilot/autopilot.module';
import { SsoModule } from './sso/sso.module';
import { ObservabilityModule } from './observability/observability.module';
import { ReturnsModule } from './returns/returns.module';
import { AccountingModule } from './accounting/accounting.module';
import { SupportModule } from './support/support.module';
import { SlaModule } from './sla/sla.module';
import { EsgModule } from './esg/esg.module';
import { CourierManagementModule } from './courier-management/courier-management.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { LogisticsAnalyticsModule } from './logistics-analytics/logistics-analytics.module';
import { CommercialAnalyticsModule } from './commercial-analytics/commercial-analytics.module';
import { OtpModule } from './otp/otp.module';
import { WarehouseManagementModule } from './warehouse-management/warehouse-management.module'
import { ProcessControlModule } from './process-control/process-control.module'
import { ProductMasterModule } from './product-master/product-master.module';
import { FleetIntelligenceModule } from './fleet-intelligence/fleet-intelligence.module';
import { FleetMaintenanceModule } from './fleet-maintenance/fleet-maintenance.module';
import { DriverSafetyModule } from './driver-safety/driver-safety.module';
import { LogisticsOpsModule } from './logistics-ops/logistics-ops.module';
import { CarbonModule } from './carbon/carbon.module';
import { RouteOptimizationModule } from './route-optimization/route-optimization.module';
import { DeliveryNotesModule } from './delivery-notes/delivery-notes.module';
import { OrderFlowModule } from './order-flow/order-flow.module';
import { SmartRoutingModule } from './smart-routing/smart-routing.module';
import { MarketTrendsModule } from './market-trends/market-trends.module';
import { EpodModule } from './epod/epod.module';
import { LiveTrackingModule } from './live-tracking/live-tracking.module';
import { DigitalPaymentsModule } from './digital-payments/digital-payments.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { DispatchModule } from './dispatch/dispatch.module';

@Module({
  imports: [
    // Config loaded globally — all modules can inject ConfigService
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Cron scheduling
    ScheduleModule.forRoot(),

    // In-process event bus (enables @OnEvent decorators across modules)
    EventEmitterModule.forRoot(),

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
    // Rail / intermodal coordination (RASA demo)
    RailModule,
    // OKRs — owner strategic cockpit
    OkrModule,
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
    PushModule,

    // Route optimization (nearest-neighbour + 2-opt over geocoded stops)
    RoutingModule,

    // Public parcel tracking (no auth) + predictive ETA
    TrackingModule,

    // Tenant integration platform: outbound webhooks + public API (Shopify etc.)
    WebhooksModule,
    ApiModule,
    EcommerceModule,
    RateShoppingModule,
    // Per-tenant integration credentials (WhatsApp / Shopify / WooCommerce)
    IntegrationsModule,

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
    SlaModule,
    EsgModule,
    CourierManagementModule,
    CustomerPortalModule,
    LogisticsAnalyticsModule,
    CommercialAnalyticsModule,
    WarehouseManagementModule,
    ProcessControlModule,
    ProductMasterModule,
    FleetIntelligenceModule,
    FleetMaintenanceModule,
    DriverSafetyModule,
    LogisticsOpsModule,
    CarbonModule,

    // CLAW Intel — competitive action items (#352–#356 + Detrack/Bringg parity)
    RouteOptimizationModule,
    DeliveryNotesModule,
    OrderFlowModule,
    SmartRoutingModule,
    MarketTrendsModule,
    EpodModule,
    LiveTrackingModule,
    DigitalPaymentsModule,

    // Predictive Delivery Intelligence (AI-powered, self-learning)
    IntelligenceModule,

    // Smart Auto-Dispatch + Customer Live Tracking
    DispatchModule,

    OtpModule,

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
    // API Shield — first line of defence (injection, XSS, bot detection)
    { provide: APP_GUARD, useClass: ApiShieldGuard },

    // Apply JwtAuthGuard globally — all routes need a valid token
    // unless decorated with @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // Apply RolesGuard globally — only enforced when @Roles() is present
    { provide: APP_GUARD, useClass: RolesGuard },

    // Rate limiting runs last so authenticated requests are tracked per-user
    { provide: APP_GUARD, useClass: ThrottlerProxyGuard },

    // Health Sentinel — background health monitoring (not a guard, but a service)
    HealthSentinelService,

    // API Health Monitor — tests all critical cycles every 10 minutes
    ApiHealthMonitorService,
  ],
})
export class AppModule {}