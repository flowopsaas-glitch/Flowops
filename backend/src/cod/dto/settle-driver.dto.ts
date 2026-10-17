import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class SettleDriverDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsUUID()
  idempotencyKey: string;
}
