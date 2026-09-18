import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Branches')
@ApiBearerAuth()
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

  @Post()
  create(@CurrentUser() u: any, @Body() body: CreateBranchDto) {
    return this.svc.create(u.companyId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateBranchDto) {
    return this.svc.update(id, u.companyId, body);
  }
}
