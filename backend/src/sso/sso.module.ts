import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';

/**
 * Enterprise SSO (OIDC) — Okta / Azure AD / Google Workspace / Auth0.
 * AuthModule provides AuthService (token issuance) + JwtService (state signing).
 * BillingService is @Global (entitlement gate).
 */
@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  controllers: [SsoController],
  providers: [SsoService],
})
export class SsoModule {}
