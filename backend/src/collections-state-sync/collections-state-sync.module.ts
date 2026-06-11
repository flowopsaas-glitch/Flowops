import { Module } from '@nestjs/common';
import { CollectionsStateSyncController } from './collections-state-sync.controller';
import { CollectionsStateSyncService } from './collections-state-sync.service';

@Module({
  controllers: [CollectionsStateSyncController],
  providers: [CollectionsStateSyncService],
  exports: [CollectionsStateSyncService],
})
export class CollectionsStateSyncModule {}
