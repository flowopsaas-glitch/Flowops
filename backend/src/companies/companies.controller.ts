import { UpdateCompanyDto, UpdateSlaDto, AddAdminDto } from './dto/update-company.dto';
import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseInterceptors, UploadedFile, HttpCode, HttpStatus, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { uploadConcurrency } from '../common/interceptors/upload-concurrency.interceptor';
import { Roles } from '../common/decorators/roles.decorator';

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
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadConcurrency, FileInterceptor('logo', {
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 2, fieldSize: 64 * 1024, parts: 3 },
  }))
  uploadLogo(
    @Param('id') id: string,
    @CurrentUser() user: { companyId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!user?.companyId || id !== user.companyId) {
      throw new ForbiddenException('You may only update your own company logo');
    }
    return this.svc.uploadLogo(user.companyId, file);
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
