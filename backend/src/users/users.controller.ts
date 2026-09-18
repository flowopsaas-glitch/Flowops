import {
  Controller, Get, Post, Patch, Delete, Body, Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

// Only company administrators may manage other users. Without these guards ANY
// authenticated user (even VIEWER/DRIVER) could create, edit, delete, or
// self-promote to ADMIN via these endpoints.
const USER_ADMIN_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN] as const;

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get('my-company')
  findByCompany(@CurrentUser() u: any) {
    return this.svc.findByCompany(u.companyId);
  }

  @Post()
  @Roles(...USER_ADMIN_ROLES)
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body, u);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id')
  @Roles(...USER_ADMIN_ROLES)
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.update(id, u.companyId, body, u);
  }

  @Delete(':id')
  @Roles(...USER_ADMIN_ROLES)
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId, u);
  }
}
