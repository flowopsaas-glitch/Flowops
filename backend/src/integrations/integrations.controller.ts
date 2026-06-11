import { Controller, Post, Body, Get } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Post('connect')
  connect(@Body() body: { type: string; config: any }) {
    return this.service.connect(body.type, body.config);
  }

  @Get()
  list() {
    return this.service.list();
  }
}
