import { IsString, Length } from 'class-validator';

export class SsoExchangeDto {
  @IsString()
  @Length(32, 256)
  code: string;
}
