import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { CompanyService } from './company.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  create(@Body('name') name: string) {
    return this.companyService.createCompany(name);
  }

  @Get()
  getAll() {
    return this.companyService.getAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.companyService.findById(id);
  }
}
