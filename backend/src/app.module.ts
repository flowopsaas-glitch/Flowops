// src/app.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { BullModule } from "@nestjs/bullmq";

// Your existing imports
import { LocationController } from "./location.controller";
import { LocationGateway } from "./location.gateway";
import { QuotesController } from "./quotes/quotes.controller";
import { AiOpsController } from "./ai/ai-ops.controller";
import { AiDiagnosticsController } from "./ai/ai-diagnostics.controller";
import { PricingModule } from "./pricing/pricing.module";
import { BillingBatchesModule } from "./billing-batches/billing-batches.module";
import { BillingModule } from "./billing/billing.module";
import { InfraModule } from "./infra/infra.module";
import { AuthModule } from "./auth/auth.module";
import { WaybillInboxModule } from "./waybills/inbox/waybill-inbox.module";
import { WhatsAppModule } from "./whatsapp/whatsapp.module";
import { DispatchInboxModule } from './dispatch-inbox/dispatch-inbox.module';
import { CompaniesModule } from "./companies/companies.module";
import { UsersModule } from "./users/users.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DriversModule } from "./drivers/drivers.module";
import { AiModule } from "./ai/ai.module";
import { EmailHubModule } from "./email-hub/email-hub.module";
import { AIEventsModule } from "./ai/ai-events/ai-events.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicTrackingModule } from "./public-tracking/public-tracking.module";
import { AdvancedAnalyticsModule } from "./advanced-analytics/advanced-analytics.module";
import { AiQueryModule } from "./ai-query/ai-query.module";
import { LeadsModule } from "./leads/leads.module";
import { ClientPortalModule } from "./client-portal/client-portal.module";
import { HardwareModule } from "./hardware/hardware.module";
import { CommunicationModule } from "./modules/communication/communication.module";
import { InvoiceDraftsModule } from "./invoice-drafts/invoice-drafts.module";
import { InvoicesModule } from "./invoice/invoices.module";
import { WaybillsModule } from './waybills/waybills.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InventoryModule } from './inventory/inventory.module';
import { GpsTrackingModule } from './gps-tracking/gps-tracking.module';
import { AISecurityModule } from './ai-security/ai-security.module';
import { AiOpsModule } from './ai-ops/ai-ops.module';
import { AiClawModule } from './ai-claw/ai-claw.module';
import { UploadModule } from './upload/upload.module';
import { DriverPortalModule } from './driver-portal/driver-portal.module';

// NEW: Import Redis module
import { RedisModule } from './redis/redis.module';

// Subscription Expiry Monitor
import { SubscriptionMonitorModule } from './subscription-monitor/subscription-monitor.module';

// AI Platform Health Monitor
import { PlatformHealthModule } from './platform-health/platform-health.module';

// Tenant Onboarding (signup requests, auto-provisioning)
import { OnboardingModule } from './onboarding/onboarding.module';

// Demo Data Seeder
import { SeederModule } from './seeder/seeder.module';

// Audit Log + CSV Export
import { AuditLogModule } from './audit-log/audit-log.module';
import { ExportModule } from './export/export.module';

// ✅ FIXED: Import ClientsModule (was missing!)
import { ClientsModule } from './_clients/clients.module';
import { FleetMapModule } from './fleet-map/fleet-map.module';
import { DriverAnalyticsModule } from './driver-analytics/driver-analytics.module';
import { DispatchChatModule } from './dispatch-chat/dispatch-chat.module';
import { ReportsModule } from './reports/reports.module';
import { WarehouseClerkModule } from './warehouse-clerk/warehouse-clerk.module';
import { ManifestsController } from './manifests/manifests.controller';
import { ProofOfDeliveryController } from './proof-of-delivery/proof-of-delivery.controller';
import {  } from './rating/rating.service';
import { DashboardsController } from './dashboards/dashboards.controller';
import { DashboardMetricsController } from './dashboards/dashboard-metrics.controller';
import { RatingService } from './rating/rating.service';

@Module({
  imports: [
    WarehouseClerkModule,
    ReportsModule,
    AiQueryModule,
    AdvancedAnalyticsModule,
    PublicTrackingModule,
    // ✅ FIXED: ClientsModule in main imports array (NOT inside BullModule)
    ClientsModule,
    
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: false }),
    
    BullModule.forRootAsync({
      imports: [
    ReportsModule,
    AiQueryModule,
    AdvancedAnalyticsModule,
    PublicTrackingModule,ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>("REDIS_HOST") || "localhost",
          port: configService.get<number>("REDIS_PORT") || 6379,
          maxRetriesPerRequest: null,
        },
      }),
    }),
    
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 120 },
      { name: 'ai', ttl: 60000, limit: 30 },
      { name: 'auth', ttl: 60000, limit: 10 },
    ]),
    PrismaModule,
    InfraModule,
    AuthModule,
    AiModule,
    AIEventsModule,
    EmailHubModule,
    DashboardModule,
    PricingModule,
    BillingModule,
    BillingBatchesModule,
    DriversModule,
    FleetMapModule,
    DriverAnalyticsModule,
    DispatchChatModule,
    WaybillInboxModule,
    WhatsAppModule,
    DispatchInboxModule,
    CompaniesModule,
    UsersModule,
    LeadsModule,
    ClientPortalModule,
    HardwareModule,
    CommunicationModule,
    InvoiceDraftsModule,
    InvoicesModule,
    WaybillsModule,
    NotificationsModule,
    InventoryModule,
    GpsTrackingModule,
    AISecurityModule,
    AiOpsModule,
    AiClawModule,
    UploadModule,
    DriverPortalModule,
    
    // NEW: Add Redis module
    RedisModule,

    // Subscription Expiry Monitor (hourly cron checks trial/demo expiry)
    SubscriptionMonitorModule,

    // AI Platform Health Monitor (5-min cron checks system metrics)
    PlatformHealthModule,

    // Tenant Onboarding (public signup + admin approval)
    OnboardingModule,

    // Demo Data Seeder
    SeederModule,

    // Audit Log + CSV Export
    AuditLogModule,
    ExportModule,
  ],
  controllers: [
    LocationController,
    QuotesController,
    AiOpsController,
    AiDiagnosticsController,
    ManifestsController,
    ProofOfDeliveryController,
    DashboardsController,
    DashboardMetricsController,
  ],
  providers: [
    RatingService,LocationGateway],
})
export class AppModule {}
