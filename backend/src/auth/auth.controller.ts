import {
  Controller, Post, Get, Body, Req, UseGuards, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /api/v1/auth/login  — tenant user login */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tenant login' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** POST /api/v1/auth/register  — request a new tenant workspace */
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Request tenant workspace (creates ApprovalRequest)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** GET /api/v1/auth/me  — get current user profile */
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: any) {
    return this.authService.me(user.id, user.companyId);
  }

  /** POST /api/v1/auth/refresh  — rotate access + refresh tokens */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate token pair using refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  /** POST /api/v1/auth/logout */
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (revoke refresh tokens)' })
  logout(@CurrentUser() user: any, @Body() body: { refreshToken?: string }) {
    return this.authService.logout(user.id, body?.refreshToken);
  }

  /**
   * POST /api/v1/auth/driver-login  — driver portal login (phone + PIN).
   */
  @Public()
  @Post('driver-login')
  driverLogin(@Body() dto: { phone: string; pin: string }) {
    return this.authService.driverLogin(dto.phone, dto.pin);
  }

  /**
   * POST /api/v1/auth/owner-login  — platform owner login.
   * Response shape (same as tenant login):
   *   { access_token, refresh_token, user }
   * The TransformInterceptor wraps this in { data: ..., statusCode, message }
   * so the frontend reads: apiResponse.data.access_token
   */
  @Public()
  @Post('owner-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform owner login' })
  ownerLogin(@Body() dto: LoginDto) {
    return this.authService.ownerLogin(dto);
  }

  /** POST /api/v1/auth/owner-refresh */
  @Public()
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
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from email' })
  resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPassword(body.token, body.password);
  }
}
