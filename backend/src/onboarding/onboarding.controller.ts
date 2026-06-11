// src/onboarding/onboarding.controller.ts
import { Controller, Get, Post, Param, Body, Query, ParseIntPipe, UseGuards, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { OnboardingService, SignupRequestDto, InviteLinkDto } from './onboarding.service';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  private readonly logger = new Logger('OnboardingController');

  constructor(private readonly onboardingService: OnboardingService) {}

  // ════════════════════════════════════════════════════════════════════════════
  // 🌐 PUBLIC ENDPOINTS (No auth required)
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/onboarding/request
   * Submit a new signup request (public — from signup page)
   */
  @Public()
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async submitRequest(@Body() dto: SignupRequestDto) {
    this.logger.log(`Public signup request from: ${dto.contactEmail}`);
    return this.onboardingService.submitSignupRequest(dto);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 🔒 SUPER ADMIN ENDPOINTS
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/onboarding/requests
   * List all signup requests (optional ?status=PENDING|APPROVED|REJECTED)
   */
  @Get('requests')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async listRequests(@Query('status') status?: string) {
    return this.onboardingService.listRequests(status);
  }

  /**
   * GET /api/v1/onboarding/stats
   * Get signup request statistics
   */
  @Get('stats')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async getStats() {
    return this.onboardingService.getStats();
  }

  /**
   * POST /api/v1/onboarding/approve/:id
   * Approve a signup request → auto-creates company + user + sends credentials
   */
  @Post('approve/:id')
  @Roles('SUPER_ADMIN')
  async approveRequest(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Approving signup request #${id}`);
    return this.onboardingService.approveRequest(id);
  }

  /**
   * POST /api/v1/onboarding/reject/:id
   * Reject a signup request
   */
  @Post('reject/:id')
  @Roles('SUPER_ADMIN')
  async rejectRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
  ) {
    this.logger.log(`Rejecting signup request #${id}`);
    return this.onboardingService.rejectRequest(id, body?.reason);
  }

  /**
   * POST /api/v1/onboarding/invite-link
   * Generate an invite signup link for a specific plan
   */
  @Post('invite-link')
  @Roles('SUPER_ADMIN')
  async generateInviteLink(@Body() dto: InviteLinkDto) {
    this.logger.log(`Generating invite link for: ${dto.email} (${dto.plan})`);
    return this.onboardingService.generateInviteLink(dto);
  }
}
