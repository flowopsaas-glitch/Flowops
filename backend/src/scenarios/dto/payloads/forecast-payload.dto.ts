// src/scenarios/dto/payloads/forecast-payload.dto.ts
import { IsInt, IsDateString, Min } from 'class-validator';

export class ForecastPayloadDto {
  @IsInt()
  @Min(0)
  forecastedParcels!: number;

  @IsDateString()
  date!: string;
}
