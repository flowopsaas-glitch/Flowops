import { IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Role } from '../../auth/roles.enum';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  role?: Role;

  @IsOptional()
  @IsInt()
  @Min(1)
  companyId?: number;
}