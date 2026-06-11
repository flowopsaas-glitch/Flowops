// src/scenarios/dto/payloads/capacity-payload.dto.ts
import { IsInt, Min } from 'class-validator';

export class CapacityPayloadDto {
  @IsInt()
  @Min(1)
  maxDrivers!: number;

  @IsInt()
  @Min(0)
  expectedParcels!: number;
}
