// src/auth/dto/change-password.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsEmail()
  email!: string; // Added '!'

  @IsString()
  @MinLength(8)
  currentPassword!: string; // Added '!'

  @IsString()
  @MinLength(8)
  newPassword!: string; // Added '!'
}