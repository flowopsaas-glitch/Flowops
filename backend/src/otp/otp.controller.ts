import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { OtpService } from './otp.service';
import {
  SendEmailOtpDto,
  SendPhoneOtpDto,
  VerifyEmailOtpDto,
  VerifyPhoneOtpDto,
} from './dto/otp.dto';

@ApiTags('OTP')
@Controller('auth')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send WhatsApp OTP for phone verification' })
  sendOtp(@Body() body: SendPhoneOtpDto) {
    return this.otp.sendOtp(body.phone);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify WhatsApp OTP code' })
  verifyOtp(@Body() body: VerifyPhoneOtpDto) {
    return this.otp.verifyOtp(body.phone, body.code);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('send-email-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send Email OTP for email verification' })
  sendEmailOtp(@Body() body: SendEmailOtpDto) {
    return this.otp.sendEmailOtp(body.email);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Email OTP code' })
  verifyEmailOtp(@Body() body: VerifyEmailOtpDto) {
    return this.otp.verifyEmailOtp(body.email, body.code);
  }
}
