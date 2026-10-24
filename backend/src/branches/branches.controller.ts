import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Branches')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
@Controller('branches')
export class BranchesController {
  constructor(private readonly svc: BranchesService) {}

  @Get()
  findAll(@CurrentUser() u: any) {
    return this.svc.findAll(u.companyId);
  }

  @Get('snapshot')
  snapshot(@CurrentUser() u: any) {
    return this.svc.snapshot(u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post()
  create(@CurrentUser() u: any, @Body() body: CreateBranchDto) {
    return this.svc.create(u.companyId, body);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateBranchDto) {
    return this.svc.update(id, u.companyId, body);
  }
}
