import { Module } from '@nestjs/common';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { JwtModule } from '@nestjs/jwt';
import { OwnerController, AdminController } from './owner.controller';
import { OwnerService } from './owner.service';
import { AiModule } from '../ai/ai.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  // JwtModule (no global secret) so OwnerService can mint short-lived,
  // tenant-scoped "view-as" tokens for impersonation, signing each with an
  // explicit secret from ConfigService.
  // AiModule provides CompetitiveIntelligenceService for the owner Intel tab.
  imports: [JwtModule.register({}), AiModule, InvoicesModule, OnboardingModule],
  controllers: [OwnerController, AdminController],
  providers: [OwnerService],
  exports: [OwnerService],
})
export class OwnerModule {}
