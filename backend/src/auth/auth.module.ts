import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtOwnerStrategy } from './strategies/jwt-owner.strategy';
import { AccountLockoutService } from '../common/guards/account-lockout.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '4h') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtOwnerStrategy, AccountLockoutService],
  exports: [AuthService, JwtModule],
})
export class AuthModule implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}

  /** Seed the initial owner account on first boot (idempotent). */
  async onModuleInit() {
    await this.authService.seedOwnerIfNeeded();
  }
}
