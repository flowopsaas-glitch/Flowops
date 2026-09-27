import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'jane@yourcompany.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+27821234567' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'Acme Couriers (Pty) Ltd' })
  @IsString()
  company: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsString()
  @MinLength(8)
  password: string;
}
