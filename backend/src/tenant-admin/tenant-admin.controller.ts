// backend/src/tenant-admin/tenant-admin.controller.ts
import { Controller, Get } from '@nestjs/common';
import { TenantAdminService } from './tenant-admin.service';

@Controller('tenant-admin')
export class TenantAdminController {
  constructor(private readonly service: TenantAdminService) {}

  @Get('status')
  status() {
    return this.service.getStatus();
  }
}