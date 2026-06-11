import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('FlowOps Core')
@Controller() // Path: /api/...
export class CompanyCoreController {

  @Get('waybills') // Fixes Shipments.tsx:30 404 error
  getWaybills() {
    return [
      { id: 1, number: 'WB-1004', status: 'In-Transit', value: 'R12,000.00' },
      { id: 2, number: 'WB-1005', status: 'Draft', value: 'R0.00' }
    ];
  }

  @Get('notifications') // Fixes tenantAdminCoreOps.ts:15 404 error
  getNotifications() {
    return {
      count: 2,
      alerts: [
        { id: 1, title: 'Audit Ready', message: 'Invoice R12,000.00 is ready for Z-Audit.' },
        { id: 2, title: 'System', message: 'Connected to FlowOps Core successfully.' }
      ]
    };
  }
}
