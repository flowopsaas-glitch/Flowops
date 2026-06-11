import { Module } from "@nestjs/common";
import { CollectionStateSyncController } from "./collection-state-sync.controller";
import { CollectionStateSyncService } from "./collection-state-sync.service";

@Module({
  controllers: [CollectionStateSyncController],
  providers: [CollectionStateSyncService],
  exports: [CollectionStateSyncService],
})
export class CollectionStateSyncModule {}
