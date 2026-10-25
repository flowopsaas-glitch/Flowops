import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('api')
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
@Controller('integrations/api-keys')
export class ApiKeysController {
  constructor(private readonly svc: ApiKeysService) {}

  @Get()
  list(@CurrentUser() u: any) {
    return this.svc.list(u.companyId);
  }

  @Post()
  create(@CurrentUser() u: any, @Body() body: { name: string }) {
    return this.svc.create(u.companyId, body?.name);
  }

  @Delete(':id')
  revoke(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.revoke(id, u.companyId);
  }
}
