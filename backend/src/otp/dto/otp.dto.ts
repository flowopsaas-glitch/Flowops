import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class SendPhoneOtpDto {
  @IsString()
  @MaxLength(32)
  @Matches(/^\+?[0-9 ()-]{9,20}$/)
  phone: string;
}

export class VerifyPhoneOtpDto extends SendPhoneOtpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

export class SendEmailOtpDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class VerifyEmailOtpDto extends SendEmailOtpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
