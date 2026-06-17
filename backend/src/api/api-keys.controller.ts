import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('API Keys')
@ApiBearerAuth()
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
