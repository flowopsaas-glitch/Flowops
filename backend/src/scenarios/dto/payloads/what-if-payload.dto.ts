// src/scenarios/dto/payloads/what-if-payload.dto.ts
import { IsString } from 'class-validator';

export class WhatIfPayloadDto {
  @IsString()
  scenarioName!: string;
}
