import {
  Body, Controller, Get, Param, Put, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { SsoService } from './sso.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('SSO')
@Controller('sso')
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  // ── Admin configuration (Enterprise-gated, admins only) ─────────────────────

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Get('config')
  @ApiOperation({ summary: 'Get SSO (OIDC) config for the workspace' })
  getConfig(@CurrentUser() u: any) {
    return this.sso.getConfig(u.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Put('config')
  @ApiOperation({ summary: 'Create/update SSO config (Enterprise)' })
  setConfig(@CurrentUser() u: any, @Body() dto: any) {
    return this.sso.upsertConfig(u.companyId, dto ?? {});
  }

  // ── Public login flow ────────────────────────────────────────────────────────

  /** Login page calls this to decide whether to offer "Sign in with SSO". */
  @Public()
  @Get('lookup')
  @ApiOperation({ summary: 'Discover SSO for an email domain' })
  lookup(@Query('email') email: string) {
    return this.sso.lookupByEmail(email);
  }

  /** Kick off the OIDC redirect to the tenant's identity provider. */
  @Public()
  @Get(':companyId/start')
  @ApiOperation({ summary: 'Start SSO — redirect to the identity provider' })
  async start(@Param('companyId') companyId: string, @Res() res: Response) {
    const url = await this.sso.buildAuthorizeUrl(companyId);
    return res.redirect(url);
  }

  /** IdP redirect target — exchanges the code and returns the user to the app. */
  @Public()
  @Get('callback')
  @ApiOperation({ summary: 'OIDC callback — exchange code, mint tokens, redirect' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const redirect = await this.sso.handleCallback(code, state);
    return res.redirect(redirect);
  }
}
