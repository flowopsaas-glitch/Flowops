import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CollectionStateSyncService } from "./collection-state-sync.service";

@Controller("collections-state-sync")
export class CollectionStateSyncController {
  constructor(
    private readonly collectionStateSyncService: CollectionStateSyncService,
  ) {}

  @Get("health")
  health() {
    return {
      ok: true,
      module: "collections-state-sync",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("dashboard")
  getDashboard(@Query("tenantId") tenantId?: string) {
    return this.collectionStateSyncService.getDashboard(tenantId);
  }

  @Get("records")
  getRecords(@Query("tenantId") tenantId?: string) {
    return {
      ok: true,
      records: this.collectionStateSyncService.getRecords(tenantId),
    };
  }

  @Get("workflow/:collectionId")
  getWorkflow(@Param("collectionId") collectionId: string, @Query("tenantId") tenantId?: string) {
    return this.collectionStateSyncService.getWorkflow(collectionId, tenantId);
  }

  @Get("suggest-driver/:collectionId")
  suggestDriver(
    @Param("collectionId") collectionId: string,
    @Query("tenantId") tenantId?: string,
  ) {
    return this.collectionStateSyncService.suggestDriver(collectionId, tenantId);
  }

  @Post("auto-assign/:collectionId")
  autoAssign(
    @Param("collectionId") collectionId: string,
    @Body() body?: { actor?: string; tenantId?: string },
  ) {
    return this.collectionStateSyncService.autoAssignDriver(
      collectionId,
      body?.actor || "system",
      body?.tenantId,
    );
  }

  @Post("sync/:collectionId")
  syncOne(
    @Param("collectionId") collectionId: string,
    @Body() body?: { actor?: string; tenantId?: string },
  ) {
    return this.collectionStateSyncService.syncCollection(
      collectionId,
      body?.actor || "system",
      body?.tenantId,
    );
  }

  @Post("bulk-sync")
  bulkSync(@Body() body?: { actor?: string; tenantId?: string }) {
    return this.collectionStateSyncService.bulkSync(
      body?.actor || "system",
      body?.tenantId,
    );
  }
}
