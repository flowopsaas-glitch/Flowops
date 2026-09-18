import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { DriverAuthGuard } from '../common/guards/driver-auth.guard';

/**
 * Driver web-push module. Exports PushService so other modules (e.g. collections
 * assignment) can call notifyDriver() when a job is assigned.
 *
 * The subscribe/unsubscribe endpoints are driver-scoped via DriverAuthGuard,
 * which needs JwtService + ConfigService — registered here the same way the
 * driver-portal module does (JWT_SECRET, driver token).
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('DRIVER_JWT_EXPIRES_IN', '12h') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [PushController],
  providers: [PushService, DriverAuthGuard],
  exports: [PushService],
})
export class PushModule {}
