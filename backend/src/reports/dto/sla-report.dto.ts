// src/reports/dto/sla-report.dto.ts
import { IsOptional, IsDateString } from 'class-validator';

export class SlaReportDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
