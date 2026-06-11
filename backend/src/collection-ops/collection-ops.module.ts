import { Module } from "@nestjs/common";
import { CollectionOpsController } from "./collection-ops.controller";
import { CollectionOpsService } from "./collection-ops.service";

@Module({
  controllers: [CollectionOpsController],
  providers: [CollectionOpsService],
  exports: [CollectionOpsService],
})
export class CollectionOpsModule {}
