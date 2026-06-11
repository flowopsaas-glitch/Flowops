// src/companies/companies.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Delete,
  Param,
  ParseIntPipe,
  Body, 
  UseGuards, 
  UseInterceptors,
  UploadedFile,
  Request, 
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { CompaniesService, CreateTenantDto, UpdateTenantSettingsDto, UpdateSubscriptionDto, UpdateCompanyDto } from './companies.service';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

// Multer configuration for logo uploads
const logoStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = join(process.cwd(), 'uploads', 'logos');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = extname(file.originalname);
    cb(null, `company-${req.params.id}-logo-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req: any, file: any, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    return cb(new BadRequestException('Only image files are allowed'), false);
  }
  cb(null, true);
};

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  private readonly logger = new Logger('CompaniesController');

  constructor(private readonly companiesService: CompaniesService) {}

  /**
   * POST /api/v1/companies
   * Create a new tenant company (SUPER_ADMIN only)
   */
  @Post()
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createTenant(@Body() dto: CreateTenantDto) {
    this.logger.log(`Creating new tenant: ${dto.name} (plan: ${dto.plan || 'STARTER'})`);
    if (!dto.name?.trim()) throw new BadRequestException('Company name is required');
    return this.companiesService.createTenant(dto);
  }

  /**
   * PATCH /api/v1/companies/:id
   * Update a company (SUPER_ADMIN only) - name, plan, status, isActive
   */
  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async updateCompany(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto
  ) {
    this.logger.log(`Updating company ${id}: ${JSON.stringify(dto)}`);
    return this.companiesService.updateCompany(id, dto);
  }

  /**
   * GET /api/v1/companies/platform/overview
   * Get platform-wide statistics (SUPER_ADMIN only)
   */
  @Get('platform/overview')
  @Roles('SUPER_ADMIN')
  async getPlatformOverview() {
    return this.companiesService.getPlatformOverview();
  }

  /**
   * GET /api/v1/companies
   * List all companies (requires SUPER_ADMIN or ADMIN role)
   */
  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  async findAll() {
    this.logger.debug('Fetching all companies');
    return this.companiesService.findAll();
  }

  /**
   * GET /api/v1/companies/all-with-subscriptions
   * Get all companies with full subscription details (Owner Dashboard)
   * Requires SUPER_ADMIN or ADMIN role
   */
  @Get('all-with-subscriptions')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async getAllWithSubscriptionDetails() {
    this.logger.log('Fetching all companies with subscription details');
    return this.companiesService.getAllWithSubscriptionDetails();
  }

  /**
   * PATCH /api/v1/companies/:id/subscription
   * Update company subscription/plan (SUPER_ADMIN or ADMIN only)
   */
  @Patch(':id/subscription')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async updateSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubscriptionDto
  ) {
    this.logger.log(`Updating subscription for company ${id}`);
    if (!dto.plan || !dto.status || dto.monthlyPrice === undefined) {
      throw new BadRequestException('plan, status, and monthlyPrice are required');
    }
    return this.companiesService.updateSubscription(id, dto);
  }

  /**
   * GET /api/v1/companies/settings
   * Get current tenant's settings (authenticated tenant users)
   */
  @Get('settings')
  async getSettings(@Request() req: any) {
    const companyId = req.user?.companyId;
    if (!companyId) throw new BadRequestException('User not associated with a company');
    return this.companiesService.getTenantSettings(companyId);
  }

  /**
   * PATCH /api/v1/companies/settings
   * Update current tenant's settings (authenticated tenant users)
   */
  @Patch('settings')
  async updateSettings(@Request() req: any, @Body() dto: UpdateTenantSettingsDto) {
    const companyId = req.user?.companyId;
    if (!companyId) throw new BadRequestException('User not associated with a company');
    return this.companiesService.updateTenantSettings(companyId, dto);
  }

  /**
   * ✅ NEW: GET /api/v1/companies/my-company
   * Get current tenant's company details with user count
   */
  @Get('my-company')
  async getMyCompany(@Request() req: any) {
    const companyId = req.user?.companyId;
    if (!companyId) throw new BadRequestException('User not associated with a company');
    
    const company = await this.companiesService.getTenantSettings(companyId);
    
    // ✅ Use public getter to access prisma:
    const prisma = this.companiesService.getPrisma();
    const userCount = await prisma.user.count({ where: { companyId } });
    
    return { ...company, _count: { users: userCount } };
  }

  /**
   * ✅ NEW: PATCH /api/v1/companies/:id/logo
   * Upload company logo (authenticated users who belong to the company)
   */
  @Patch(':id/logo')
  @UseInterceptors(FileInterceptor('logo', {
    storage: logoStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
  }))
  async uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any
  ) {
    this.logger.log(`Uploading logo for company ${id}`);
    
    // Verify user belongs to this company
    const userId = req.user?.id;
    const userCompanyId = req.user?.companyId;
    
    if (userCompanyId !== id) {
      throw new ForbiddenException('You can only upload logos for your own company');
    }
    
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    
    // Delete old logo if exists
    const prisma = this.companiesService.getPrisma();
    const company = await prisma.company.findUnique({ where: { id } });
    
    if (company?.logoUrl) {
      const oldLogoPath = join(process.cwd(), company.logoUrl);
      if (existsSync(oldLogoPath)) {
        try {
          unlinkSync(oldLogoPath);
          this.logger.log(`Deleted old logo: ${oldLogoPath}`);
        } catch (error) {
          this.logger.warn(`Failed to delete old logo: ${error.message}`);
        }
      }
    }
    
    // Save new logo URL
    const logoUrl = `/uploads/logos/${file.filename}`;
    
    const updatedCompany = await prisma.company.update({
      where: { id },
      data: { logoUrl },
    });
    
    this.logger.log(`Logo uploaded successfully for company ${id}: ${logoUrl}`);
    
    return {
      success: true,
      logoUrl,
      company: updatedCompany,
    };
  }

  /**
   * ✅ NEW: DELETE /api/v1/companies/:id/logo
   * Remove company logo (authenticated users who belong to the company)
   */
  @Delete(':id/logo')
  async removeLogo(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any
  ) {
    this.logger.log(`Removing logo for company ${id}`);
    
    // Verify user belongs to this company
    const userCompanyId = req.user?.companyId;
    
    if (userCompanyId !== id) {
      throw new ForbiddenException('You can only remove logos for your own company');
    }
    
    const prisma = this.companiesService.getPrisma();
    const company = await prisma.company.findUnique({ where: { id } });
    
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    
    // Delete logo file if exists
    if (company.logoUrl) {
      const logoPath = join(process.cwd(), company.logoUrl);
      if (existsSync(logoPath)) {
        try {
          unlinkSync(logoPath);
          this.logger.log(`Deleted logo file: ${logoPath}`);
        } catch (error) {
          this.logger.warn(`Failed to delete logo file: ${error.message}`);
        }
      }
    }
    
    // Update database
    const updatedCompany = await prisma.company.update({
      where: { id },
      data: { logoUrl: null },
    });
    
    this.logger.log(`Logo removed successfully for company ${id}`);
    
    return {
      success: true,
      message: 'Logo removed successfully',
      company: updatedCompany,
    };
  }

  /**
   * GET /api/v1/companies/ping
   * Health check endpoint (PUBLIC - no auth required)
   */
  @Get('ping')
  @Public()
  async ping() {
    return { 
      ok: true, 
      ts: new Date().toISOString(), 
      service: 'companies',
      status: 'healthy'
    };
  }
}
