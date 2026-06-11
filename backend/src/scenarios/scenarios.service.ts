import { Injectable } from '@nestjs/common';

@Injectable()
export class ScenariosService {
  runScenario(input: { scenarioName: string }) {
    return {
      message: `Scenario '${input.scenarioName}' executed successfully`,
      timestamp: new Date()
    };
  }
}
