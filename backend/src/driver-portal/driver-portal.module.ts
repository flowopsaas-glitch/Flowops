import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DriverPortalController } from './driver-portal.controller';
import { DriverPortalService } from './driver-portal.service';
import { DriverAuthGuard } from '../common/guards/driver-auth.guard';
import { AuthService } from '../auth/auth.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { GatewayModule } from '../gateway/gateway.module';
import { DriverSafetyModule } from '../driver-safety/driver-safety.module';

@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    GatewayModule,
    DriverSafetyModule,
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
  providers: [DriverPortalService, AuthService, DriverAuthGuard],
})
export class DriverPortalModule {}
