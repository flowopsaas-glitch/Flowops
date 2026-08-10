import { UpdateCompanyDto, UpdateSlaDto, AddAdminDto } from './dto/update-company.dto';
import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseInterceptors, UploadedFile, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly svc: CompaniesService) {}

  @Get('my-company')
  getMyCompany(@CurrentUser() u: any) {
    return this.svc.getMyCompany(u.companyId);
  }

  @Patch('my-company')
  updateMyCompany(@CurrentUser() u: any, @Body() body: UpdateCompanyDto) {
    return this.svc.updateMyCompany(u.companyId, body);
  }

  @Post(':id/logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo'))
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.svc.uploadLogo(id, file);
  }

  @Patch(':id/sla')
  updateSla(@Param('id') id: string, @Body() body: UpdateSlaDto) {
    return this.svc.updateSla(id, body);
  }

  @Post(':id/admins')
  addAdmin(@Param('id') id: string, @Body() body: AddAdminDto) {
    return this.svc.addAdmin(id, body);
  }

  // ── Onboarding ──────────────────────────────────────────────────────────

  /**
   * GET /companies/onboarding-status
   * Returns the onboarding checklist progress for the current company.
   * Used by the frontend to decide whether to show the onboarding wizard.
   */
  @Get('onboarding-status')
  getOnboardingStatus(@CurrentUser() u: any) {
    return this.svc.getOnboardingStatus(u.companyId);
  }

  /**
   * POST /companies/onboarding-complete
   * Marks the company's onboarding as complete. Called by the wizard on the
   * final step. Once complete, the tenant is never redirected to onboarding again.
   */
  @Post('onboarding-complete')
  @HttpCode(HttpStatus.OK)
  markOnboardingComplete(@CurrentUser() u: any) {
    return this.svc.markOnboardingComplete(u.companyId);
  }

  @Get('platform/overview')
  platformOverview() {
    return this.svc.platformOverview();
  }

  @Get()
  findAll(@Query() query: any) {
    return this.svc.findAll(query);
  }

  @Post()
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }
}
