import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { OtpService } from './otp.service';

@ApiTags('OTP')
@Controller('auth')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  /**
   * POST /api/v1/auth/send-otp
   * Sends a 6-digit verification code to the given phone number via WhatsApp.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send WhatsApp OTP for phone verification' })
  sendOtp(@Body() body: { phone: string }) {
    if (!body.phone?.trim()) {
      throw new Error('Phone number is required');
    }
    return this.otp.sendOtp(body.phone);
  }

  /**
   * POST /api/v1/auth/verify-otp
   * Verifies the 6-digit code. Returns { verified: true } on success.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify WhatsApp OTP code' })
  verifyOtp(@Body() body: { phone: string; code: string }) {
    if (!body.phone?.trim() || !body.code?.trim()) {
      throw new Error('Phone and code are required');
    }
    return this.otp.verifyOtp(body.phone, body.code);
  }
}
