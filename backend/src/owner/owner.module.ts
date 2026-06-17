import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OwnerController, AdminController } from './owner.controller';
import { OwnerService } from './owner.service';

@Module({
  // JwtModule (no global secret) so OwnerService can mint short-lived,
  // tenant-scoped "view-as" tokens for impersonation, signing each with an
  // explicit secret from ConfigService.
  imports: [JwtModule.register({})],
  controllers: [OwnerController, AdminController],
  providers: [OwnerService],
  exports: [OwnerService],
})
export class OwnerModule {}
