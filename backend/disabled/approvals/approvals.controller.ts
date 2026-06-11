// File: src/approvals/approvals.controller.ts
import { Controller, Patch, Param, Get } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Patch(':id')
  async approve(@Param('id') id: string) {
    return this.approvals.approveCollection(id);
  }

  @Get('pending')
  async getPending() {
    return this.approvals.getAllPending();
  }
}
