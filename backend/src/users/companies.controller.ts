import { Controller, Get } from '@nestjs/common';

@Controller('companies')
export class CompaniesController {
  @Get('my-company')
  async getMyCompany() {
    return { id: 1, name: 'FlowOps Demo Corp' };
  }
  @Get()
  async getCompanies() { return []; }
}
