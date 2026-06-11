import { Controller, Get } from '@nestjs/common';

@Controller('jobs')
export class JobsController {
  @Get()
  async getJobs() { return []; }
}
