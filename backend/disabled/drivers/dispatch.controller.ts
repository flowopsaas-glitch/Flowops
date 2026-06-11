import { Controller, Post, Body } from '@nestjs/common';

@Controller('dispatch')
export class DispatchController {
  @Post('assign')
  async assignDriver(@Body() body: any) {
    // Placeholder logic
    return { status: 'driver assigned', payload: body };
  }

  @Post('schedule')
  async scheduleCollection(@Body() body: any) {
    // Placeholder logic
    return { status: 'collection scheduled', payload: body };
  }
}
