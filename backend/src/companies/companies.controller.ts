import { UpdateCompanyDto, UpdateSlaDto, AddAdminDto } from './dto/update-company.dto';
import {
  Controller, Get, Post, Patch, Body, Param,
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

  // TENANT SAFETY: the :id routes below act on the company identified by the
  // URL, so they must never trust it. Platform-wide company management lives
  // in the owner console (owner/tenants, @OwnerOnly); tenant callers may only
  // touch their OWN company — the same rule the logo endpoint already used.
  @Patch(':id/sla')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  updateSla(
    @Param('id') id: string,
    @CurrentUser() user: { companyId: string },
    @Body() body: UpdateSlaDto,
  ) {
    if (!user?.companyId || id !== user.companyId) {
      throw new ForbiddenException('You may only update your own company');
    }
    return this.svc.updateSla(user.companyId, body);
  }

  @Post(':id/admins')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  addAdmin(
    @Param('id') id: string,
    @CurrentUser() user: { companyId: string },
    @Body() body: AddAdminDto,
  ) {
    if (!user?.companyId || id !== user.companyId) {
      throw new ForbiddenException('You may only add admins to your own company');
    }
    return this.svc.addAdmin(user.companyId, body);
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

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { companyId: string }) {
    if (!user?.companyId || id !== user.companyId) {
      throw new ForbiddenException('You may only view your own company');
    }
    return this.svc.findOne(user.companyId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  update(
    @Param('id') id: string,
    @CurrentUser() user: { companyId: string },
    @Body() body: any,
  ) {
    if (!user?.companyId || id !== user.companyId) {
      throw new ForbiddenException('You may only update your own company');
    }
    return this.svc.update(user.companyId, body);
  }
}
