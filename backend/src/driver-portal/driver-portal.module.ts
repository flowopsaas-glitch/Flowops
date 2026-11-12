import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DriverPortalController } from './driver-portal.controller';
import { DriverPortalService } from './driver-portal.service';
import { DriverAuthGuard } from '../common/guards/driver-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GatewayModule } from '../gateway/gateway.module';
import { DriverSafetyModule } from '../driver-safety/driver-safety.module';
import { EpodModule } from '../epod/epod.module';
import { ComplianceModule } from '../common/compliance/compliance.module';
import { RailModule } from '../rail/rail.module';
import { JourneysModule } from '../journeys/journeys.module';

@Module({
  imports: [ComplianceModule,
    // RailModule exports RailTruckWindowChangesService: the driver side of the
    // terminal gate-window closed loop (read the current window, confirm it).
    RailModule,
    // JourneysModule exports JourneyService: the driver side of the journey
    // slice (read assigned journeys, send stage updates). The dispatch side
    // lives in JourneysController on the same service, so there is one
    // implementation rather than two that drift.
    JourneysModule,
    ConfigModule,
    AuthModule,
    NotificationsModule,
    GatewayModule,
    DriverSafetyModule,
    EpodModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('DRIVER_JWT_EXPIRES_IN', '12h') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [DriverPortalController],
  providers: [DriverPortalService, DriverAuthGuard],
})
export class DriverPortalModule {}
