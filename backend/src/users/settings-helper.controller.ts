import { Controller, Get } from '@nestjs/common';

@Controller('settings-helper')
export class SettingsHelperController {
  @Get()
  async getSettingsStatus() {
    return { setupComplete: true, pendingActions: [] };
  }
}
