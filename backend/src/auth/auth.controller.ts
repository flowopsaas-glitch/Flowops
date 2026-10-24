import {
  Controller, Post, Get, Body, Req, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AnyAuthenticated } from '../common/decorators/any-authenticated.decorator';

/**
 * Resolve the real client IP behind our proxy chain (Cloudflare -> nginx ->
 * Docker). Cloudflare's CF-Connecting-IP is the most reliable; then the first
 * entry of X-Forwarded-For; then Express's req.ip (trust-proxy resolved).
 */
function clientIp(req: any): string | undefined {
  const cf = req?.headers?.['cf-connecting-ip'];
  if (cf) return String(Array.isArray(cf) ? cf[0] : cf).trim();
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return String(Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
  return req?.ip;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /api/v1/auth/login  — tenant user login */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tenant login' })
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto, {
      ip: clientIp(req),
      userAgent: req?.headers?.['user-agent'],
    });
  }

  /** POST /api/v1/auth/register  — request a new tenant workspace */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Request tenant workspace (creates ApprovalRequest)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** GET /api/v1/auth/me  — get current user profile */
  @ApiBearerAuth()
  @AnyAuthenticated()
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: any) {
    return this.authService.me(user.id, user.companyId);
  }

  /** POST /api/v1/auth/refresh  — rotate access + refresh tokens */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate token pair using refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  /** POST /api/v1/auth/logout */
  @ApiBearerAuth()
  @AnyAuthenticated()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (revoke refresh tokens)' })
  logout(@CurrentUser() user: any, @Body() body: { refreshToken?: string }) {
    return this.authService.logout(user.id, body?.refreshToken);
  }

  /**
   * POST /api/v1/auth/driver-portal/login
   * Alias used by the compiled driver portal JS (was built against api.flowop.work).
   * After patching the bundle's base URL to localhost:3000 this path is called.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('driver-portal/login')
  driverPortalLogin(@Body() body: { phone: string; pin: string }, @Req() req: any) {
    return this.authService.driverLogin(body.phone, body.pin, {
      ip: clientIp(req),
      userAgent: req?.headers?.['user-agent'],
    });
  }

  /**
   * POST /api/v1/auth/driver-login  — driver portal login (phone + PIN).
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('driver-login')
  driverLogin(@Body() dto: { phone: string; pin: string }, @Req() req: any) {
    return this.authService.driverLogin(dto.phone, dto.pin, {
      ip: clientIp(req),
      userAgent: req?.headers?.['user-agent'],
    });
  }

  /**
   * POST /api/v1/auth/owner-login  — platform owner login.
   * Response shape (same as tenant login):
   *   { access_token, refresh_token, user }
   * The TransformInterceptor wraps this in { data: ..., statusCode, message }
   * so the frontend reads: apiResponse.data.access_token
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('owner-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform owner login' })
  ownerLogin(@Body() dto: LoginDto) {
    return this.authService.ownerLogin(dto);
  }

  /** POST /api/v1/auth/owner-refresh */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('owner-refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate owner token pair' })
  ownerRefresh(@Body() dto: RefreshDto) {
    return this.authService.ownerRefresh(dto);
  }

  // ── Email verification ────────────────────────────────────────────────

  /**
   * GET /api/v1/auth/verify-email?token=xxx
   * Called by the link in the verification email.
   */
  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address via token link' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  /**
   * POST /api/v1/auth/resend-verification
   * Resends the verification email to the authenticated user.
   */
  @ApiBearerAuth()
  @AnyAuthenticated()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link' })
  resendVerification(@CurrentUser() user: any) {
    return this.authService.resendVerification(user.id, user.companyId);
  }

  // ── Password reset ────────────────────────────────────────────────────

  /**
   * POST /api/v1/auth/forgot-password
   * Sends a password-reset email. Always returns 200 (no user enumeration).
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  /**
   * POST /api/v1/auth/reset-password
   * Resets the password using the token from the email.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from email' })
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body?.token, body?.password);
  }
}
