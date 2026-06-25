import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OwnerController, AdminController } from './owner.controller';
import { OwnerService } from './owner.service';
import { AiModule } from '../ai/ai.module';

@Module({
  // JwtModule (no global secret) so OwnerService can mint short-lived,
  // tenant-scoped "view-as" tokens for impersonation, signing each with an
  // explicit secret from ConfigService.
  // AiModule provides CompetitiveIntelligenceService for the owner Intel tab.
  imports: [JwtModule.register({}), AiModule],
  controllers: [OwnerController, AdminController],
  providers: [OwnerService],
  exports: [OwnerService],
})
export class OwnerModule {}
