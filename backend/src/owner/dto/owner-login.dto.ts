import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class OwnerLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  accessKey!: string;
}
