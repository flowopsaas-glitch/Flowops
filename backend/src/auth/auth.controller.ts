import { Controller, Post, Body, Get, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body.email, body.password);
    
    res.cookie('flowops_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { 
      accessToken: result.accessToken, 
      user: result.user 
    };
  }

  // 🚀 NEW: OWNER LOGIN ROUTE
  @Public()
  @Post('owner-login')
  async ownerLogin(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    // Calls the secure ownerLogin service which checks the role
    const result = await this.authService.ownerLogin(body.email, body.password);
    
    // Sets the same cookie structure
    res.cookie('flowops_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { 
      accessToken: result.accessToken, 
      user: result.user 
    };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['flowops_refresh_token'];
    if (!token) throw new UnauthorizedException('No session cookie found');

    const result = await this.authService.refreshSession(token);
    
    res.cookie('flowops_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { accessToken: result.accessToken };
  }

  // ── DRIVER LOGIN (phone + PIN) ──
  @Public()
  @Post('driver-login')
  async driverLogin(@Body() body: { phone: string; pin: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.driverLogin(body.phone, body.pin);
    res.cookie('flowops_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: result.accessToken, driver: result.driver };
  }

  // ── PASSWORD RESET FLOW ──
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Public()
  @Post('verify-reset-token')
  async verifyResetToken(@Body() body: { token: string }) {
    return this.authService.verifyResetToken(body.token);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  @Get('me')
  async me(@Req() req: any) {
    // This now works because JwtAuthGuard populated req.user
    return this.authService.me(req.user);
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('flowops_refresh_token');
    return { message: 'Logged out successfully' };
  }
}
