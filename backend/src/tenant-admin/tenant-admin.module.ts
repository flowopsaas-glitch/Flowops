// backend/src/tenant-admin/tenant-admin.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TenantAdminService } from './tenant-admin.service';
import { TenantAdminController } from './tenant-admin.controller';
import { BillingModule } from '../billing/billing.module';
import { CompaniesModule } from '../companies/companies.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    forwardRef(() => BillingModule),
    forwardRef(() => CompaniesModule),
    forwardRef(() => UsersModule),
  ],
  providers: [TenantAdminService],
  controllers: [TenantAdminController],
  exports: [TenantAdminService],
})
export class TenantAdminModule {}