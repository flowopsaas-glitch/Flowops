import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../auth/roles.enum';

export class CreateCompanyAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;

  @IsOptional()
  @IsString()
  role?: Role.ADMIN | Role.COMPANY_ADMIN;
}