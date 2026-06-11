import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CollectionsStateSyncService } from './collections-state-sync.service';

@Controller('collections-state-sync')
export class CollectionsStateSyncController {
  constructor(private readonly service: CollectionsStateSyncService) {}

  @Get('records')
  getRecords() {
    return this.service.getRecords();
  }

  @Get('dashboard')
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('workflow/:id')
  getWorkflow(@Param('id') id: string) {
    return this.service.getWorkflow(id);
  }

  @Post('repair')
  repair() {
    return this.service.repair();
  }

  @Post('sync-bridge')
  syncBridge() {
    return this.service.syncBridge();
  }

  @Post('bulk-sync')
  bulkSync() {
    return this.service.bulkSync();
  }

  @Post('sync/:id')
  syncOne(@Param('id') id: string) {
    return this.service.syncOne(id);
  }

  @Post('auto-assign/:id')
  autoAssign(@Param('id') id: string, @Body() _body: Record<string, any>) {
    return this.service.autoAssign(id);
  }

  @Post('release/:id')
  release(@Param('id') id: string) {
    return this.service.release(id);
  }
}
