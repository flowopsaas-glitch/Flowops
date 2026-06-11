// src/scenarios/dto/payloads/sla-risk-payload.dto.ts
import { IsInt, IsDateString, Min } from 'class-validator';

export class SlaRiskPayloadDto {
  @IsDateString()
  date!: string;

  @IsInt()
  @Min(0)
  riskScore!: number;
}
