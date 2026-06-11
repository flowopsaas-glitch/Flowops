import { Controller, Post, Body } from '@nestjs/common';
import { ScenariosService } from './scenarios.service';

interface RunScenarioDto {
  scenarioName: string;
}

@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  @Post('run')
  runScenario(@Body() input: RunScenarioDto) {
    return this.scenariosService.runScenario(input);
  }
}
