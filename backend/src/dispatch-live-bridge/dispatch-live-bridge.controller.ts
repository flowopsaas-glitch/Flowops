import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DispatchLiveBridgeService } from './dispatch-live-bridge.service';

@Controller('dispatch') // 🚀 THE FIX: Adding 'dispatch' here aligns with your frontend!
export class DispatchLiveBridgeController {
  constructor(private readonly service: DispatchLiveBridgeService) {}

  // GET /api/dispatch/available
  @Get('available')
  async getAvailable() {
    return {
      count: 20,
      drivers: [
        {
          id: 'DRV-001',
          name: 'Demo Driver 1',
          status: 'AVAILABLE',
          vehicle: 'Toyota Hilux',
          zone: 'Johannesburg',
        },
        {
          id: 'DRV-002',
          name: 'Demo Driver 2',
          status: 'AVAILABLE',
          vehicle: 'Ford Ranger',
          zone: 'Pretoria',
        },
      ],
    };
  }

  // GET /api/dispatch/jobs
  @Get('jobs')
  async getJobs() {
    // This now correctly blends your JSON and Prisma database waybills!
    return await this.service.getJobs();
  }

  // POST /api/dispatch/jobs/:id/assign
  @Post('jobs/:id/assign')
  async assignJob(@Param('id') id: string, @Body() body: { driverId: string }) {
    return await this.service.assignJob(id, body);
  }

  // POST /api/dispatch/jobs/:id/unassign
  @Post('jobs/:id/unassign')
  async unassignJob(@Param('id') id: string) {
    return await this.service.unassignJob(id);
  }

  // 🛡️ Keeping your mock session for stability
  @Get('auth/me')
  async getMockSession() {
    return {
      id: 'owner-demo',
      name: 'FlowOps Owner',
      email: 'flowopsaas@gmail.com',
      role: 'SUPER_ADMIN',
      tenantId: 'flowops-owner',
      companyName: 'FlowOps',
      permissions: ['*'],
    };
  }
}
