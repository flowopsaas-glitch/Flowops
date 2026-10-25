import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/user.decorator';
import { ClientsService, CreateClientDto } from './clients.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const CLIENT_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.AGENT, UserRole.USER,
];


@Roles(...CLIENT_READ_ROLES)
@Controller('clients')
export class ClientsController {
  constructor(private readonly svc: ClientsService) {}

  @Get()
  findAll(@CurrentUser() u: any, @Query('billingType') bt?: string) {
    return this.svc.findAll(u.companyId, bt);
  }

  @Get('overview')
  overview(@CurrentUser() u: any) {
    return this.svc.overview(u.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.AGENT,
  )
  @Post()
  create(@CurrentUser() u: any, @Body() dto: CreateClientDto) {
    return this.svc.create(u.companyId, dto);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.AGENT,
  )
  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: Partial<CreateClientDto>) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }
}
