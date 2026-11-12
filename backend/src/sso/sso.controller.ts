import {
  Body, Controller, Get, Param, Post, Put, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { SsoService } from './sso.service';
import { SsoExchangeDto } from './dto/sso-exchange.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { UpsertSsoConfigDto } from './dto/sso.dto';

const BINDING_COOKIE = 'flowops_sso_binding';

@ApiTags('SSO')
@Controller('sso')
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @RequireFeature('sso')
  @Get('config')
  @ApiOperation({ summary: 'Get SSO (OIDC) config for the workspace' })
  getConfig(@CurrentUser() u: any) {
    return this.sso.getConfig(u.companyId);
  }

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @RequireFeature('sso')
  @Put('config')
  @ApiOperation({ summary: 'Create/update SSO config (Enterprise)' })
  setConfig(@CurrentUser() u: any, @Body() dto: UpsertSsoConfigDto) {
    return this.sso.upsertConfig(u.companyId, dto ?? {});
  }

  @Public()
  @Get('lookup')
  @ApiOperation({ summary: 'Discover SSO for an email domain' })
  lookup(@Query('email') email: string) {
    return this.sso.lookupByEmail(email);
  }

  @Public()
  @Get(':companyId/start')
  @ApiOperation({ summary: 'Start SSO — redirect to the identity provider' })
  async start(@Param('companyId') companyId: string, @Res() res: Response) {
    const flow = await this.sso.buildAuthorizeUrl(companyId);
    res.cookie(BINDING_COOKIE, flow.browserBinding, this.sso.bindingCookieOptions());
    return res.redirect(flow.url);
  }

  @Public()
  @Get('callback')
  @ApiOperation({ summary: 'OIDC callback — validate response and redirect with a one-time code' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const browserBinding = (req as any).cookies?.[BINDING_COOKIE];
    const redirect = await this.sso.handleCallback(code, state, browserBinding);
    return res.redirect(redirect);
  }

  @Public()
  @Post('exchange')
  @ApiOperation({ summary: 'Exchange a browser-bound one-time SSO code for a FlowOps session' })
  async exchange(
    @Body() body: SsoExchangeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const browserBinding = (req as any).cookies?.[BINDING_COOKIE];
    try {
      return await this.sso.exchangeCode(body.code, browserBinding);
    } finally {
      const { path, secure, sameSite } = this.sso.bindingCookieOptions();
      res.clearCookie(BINDING_COOKIE, { path, secure, sameSite });
    }
  }
}
