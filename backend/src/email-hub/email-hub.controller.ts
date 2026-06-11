import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  Logger
} from '@nestjs/common';
import { EmailHubService } from './email-hub.service';
import { CreateEmailHubItemDto } from './dto/create-email-hub-item.dto';
import { UpdateEmailHubItemDto } from './dto/update-email-hub-item.dto';
import { EmailHubQueryDto } from './dto/email-hub-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('communications')
@UseGuards(JwtAuthGuard)
export class EmailHubController {
  private readonly logger = new Logger(EmailHubController.name);

  constructor(private readonly emailHubService: EmailHubService) {}

  // ==========================================
  // 📥 CORE COMMUNICATION ROUTES
  // ==========================================

  @Get()
  async list(@Query() query: EmailHubQueryDto, @Req() req: any) {
    return this.emailHubService.list(req.user.companyId, query);
  }

  @Get('stats')
  async stats(@Req() req: any) {
    return this.emailHubService.stats(req.user.companyId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.emailHubService.findOne(id, req.user.companyId);
  }

  @Post()
  async create(@Body() dto: CreateEmailHubItemDto, @Req() req: any) {
    return this.emailHubService.create(dto, req.user.companyId);
  }

  // ==========================================
  // 🤖 AI CLAW OPERATIONS (SELF-HEALING)
  // ==========================================

  /**
   * CLAW 1: POD/POC COMPLIANCE SCAN
   * Scans communications for missing signatures using MOONDREAM.
   */
  @Post('claw/verify-compliance')
  async verifyCompliance(@Req() req: any) {
    this.logger.log(`AI Claw: Initiating Compliance Scan for Company ${req.user.companyId}`);
    return this.emailHubService.syncExistingToAIEvents(req.user.companyId);
  }

  /**
   * CLAW 2: REPAIR BILLING
   * Aggressively repairs logistics data and extraction gaps.
   */
  @Post('claw/repair-billing')
  async repairBilling(@Req() req: any) {
    this.logger.log(`AI Claw: Running High-Aggression Billing Repair`);
    return this.emailHubService.processPendingEmails(req.user.companyId);
  }

  /**
   * TRIGGER: SEED DEMO DATA
   * Seeds logistics items for extraction testing.
   */
  @Post('seed-demo')
  async seedDemo(@Req() req: any) {
    return this.emailHubService.seedDemo(req.user.companyId);
  }

  // ==========================================
  // 📝 STATUS & RESOLUTION
  // ==========================================

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmailHubItemDto,
    @Req() req: any
  ) {
    return this.emailHubService.update(id, dto, req.user.companyId);
  }

  @Patch(':id/read')
  async markRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.emailHubService.markRead(id, req.user.companyId);
  }

  @Patch(':id/resolve')
  async resolve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.emailHubService.resolve(id, req.user.companyId);
  }
}
