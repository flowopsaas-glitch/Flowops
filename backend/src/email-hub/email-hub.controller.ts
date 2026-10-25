import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { EmailHubService, UploadedFile } from './email-hub.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { uploadConcurrency } from '../common/interceptors/upload-concurrency.interceptor';
import { EMAIL_ATTACHMENT_MAX_BYTES, EMAIL_ATTACHMENT_MAX_FILES } from './attachment-policy';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const EMAIL_HUB_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH,
];



@UseGuards(FeatureGuard)
@RequireFeature('emailHub')
@Roles(...EMAIL_HUB_ROLES)
@Controller('email-hub')
export class EmailHubController {
  constructor(private readonly svc: EmailHubService) {}

  @Get()
  list(
    @CurrentUser() user: { companyId: string },
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
  ) {
    return this.svc.findAll(user.companyId, { search, type, status, priority });
  }

  @Get('stats')
  stats(@CurrentUser() user: { companyId: string }) {
    return this.svc.stats(user.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('seed-demo')
  seedDemo(@CurrentUser() user: { companyId: string }) {
    return this.svc.seedDemo(user.companyId);
  }

  /** Compose & send an email with optional attachments (multipart/form-data). */
  @Post('send')
  @UseInterceptors(
    uploadConcurrency,
    FilesInterceptor('attachments', EMAIL_ATTACHMENT_MAX_FILES, {
      limits: { fileSize: EMAIL_ATTACHMENT_MAX_BYTES, files: EMAIL_ATTACHMENT_MAX_FILES, fields: 10, fieldSize: 64 * 1024, parts: EMAIL_ATTACHMENT_MAX_FILES + 10 },
    }),
  )
  send(
    @CurrentUser() user: { companyId: string },
    @Body() dto: { to: string; subject: string; body?: string; type?: string; priority?: string },
    @UploadedFiles() files: UploadedFile[] = [],
  ) {
    return this.svc.send(user.companyId, dto, files ?? []);
  }

  /** Ingest an incoming email/document — every attachment is threat-scanned. */
  @Post('ingest')
  @UseInterceptors(
    uploadConcurrency,
    FilesInterceptor('attachments', EMAIL_ATTACHMENT_MAX_FILES, {
      limits: { fileSize: EMAIL_ATTACHMENT_MAX_BYTES, files: EMAIL_ATTACHMENT_MAX_FILES, fields: 10, fieldSize: 64 * 1024, parts: EMAIL_ATTACHMENT_MAX_FILES + 10 },
    }),
  )
  ingest(
    @CurrentUser() user: { companyId: string },
    @Body()
    dto: {
      subject: string;
      senderEmail: string;
      senderName?: string;
      body?: string;
      type?: string;
      waybillNumber?: string;
      podNumber?: string;
    },
    @UploadedFiles() files: UploadedFile[] = [],
  ) {
    return this.svc.ingest(user.companyId, dto, files ?? []);
  }

  @Post()
  create(
    @CurrentUser() user: { companyId: string },
    @Body()
    dto: {
      subject: string;
      from?: string;
      to?: string;
      senderName?: string;
      senderEmail?: string;
      body?: string;
      type?: string;
      status?: string;
      priority?: string;
      category?: string;
      waybillNumber?: string;
      podNumber?: string;
    },
  ) {
    return this.svc.create(user.companyId, dto);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: { companyId: string }) {
    return this.svc.getOne(user.companyId, id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: { companyId: string }) {
    return this.svc.markRead(id, user.companyId);
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @CurrentUser() user: { companyId: string }) {
    return this.svc.resolve(id, user.companyId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: { companyId: string },
    @Body()
    dto: Partial<{
      status: string;
      priority: string;
      type: string;
      opsNote: string;
      isRead: boolean;
      needsOpsAction: boolean;
      aiCategory: string;
      aiSuggestedAction: string;
    }>,
  ) {
    return this.svc.update(user.companyId, id, dto);
  }
}
