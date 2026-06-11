import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DispatchService } from './dispatch.service';

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly service: DispatchService) {}

  @Get('jobs')
  getJobs() {
    return this.service.getJobs();
  }

  @Post('jobs/:id/assign')
  assignJob(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.service.assignJob(id, body);
  }

  @Post('jobs/:id/unassign')
  unassignJob(@Param('id') id: string) {
    return this.service.unassignJob(id);
  }
}
