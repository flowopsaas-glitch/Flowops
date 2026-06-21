import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/user.decorator';
import { ClientsService, CreateClientDto } from './clients.service';

@Controller('clients')
export class ClientsController {
  constructor(private readonly svc: ClientsService) {}

  @Get()
  findAll(@CurrentUser() u: any, @Query('billingType') bt?: string) {
    return this.svc.findAll(u.companyId, bt);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Post()
  create(@CurrentUser() u: any, @Body() dto: CreateClientDto) {
    return this.svc.create(u.companyId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: Partial<CreateClientDto>) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }
}
