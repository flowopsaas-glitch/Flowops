// src/scenarios/dto/run-scenario.dto.ts
import { IsString, IsObject } from 'class-validator';

export class RunScenarioDto {
  @IsString()
  scenarioId!: string;

  @IsObject()
  payload!: Record<string, any>;
}
