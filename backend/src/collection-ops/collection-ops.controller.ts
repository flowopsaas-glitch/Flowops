import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CollectionOpsService } from "./collection-ops.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("collection-ops")
@UseGuards(JwtAuthGuard)
export class CollectionOpsController {
  constructor(private readonly service: CollectionOpsService) {}

  @Get("dashboard")
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get("driver-availability")
  getDriverAvailability() {
    return this.service.getDriverAvailability();
  }

  @Get("whatsapp-intake")
  getWhatsAppIntake() {
    return this.service.getWhatsAppIntake();
  }

  @Post("manual")
  createManual(@Body() body: any) {
    return this.service.createManualCollection(body || {});
  }

  @Post("proof/:requestId")
  addProof(@Param("requestId") requestId: string, @Body() body: any) {
    return this.service.addProofImage(requestId, body || {});
  }

  @Post("ops-confirm/:requestId")
  confirmOps(@Param("requestId") requestId: string) {
    return this.service.confirmOps(requestId);
  }

  @Post("assign-driver/:requestId")
  assignDriver(@Param("requestId") requestId: string, @Body() body: { driverId?: string }) {
    return this.service.assignDriver(requestId, String(body?.driverId || ""));
  }

  @Post("release-driver/:requestId")
  releaseDriver(@Param("requestId") requestId: string) {
    return this.service.releaseDriver(requestId);
  }

  @Post("driver-status/:driverId")
  setDriverStatus(
    @Param("driverId") driverId: string,
    @Body() body: { status?: "AVAILABLE" | "ON_ROUTE" | "OFFLINE" | "ON_LEAVE" },
  ) {
    return this.service.setDriverStatus(driverId, (body?.status || "AVAILABLE") as any);
  }

  @Post("driver-status-cycle/:driverId")
  cycleDriverStatus(@Param("driverId") driverId: string) {
    return this.service.cycleDriverStatus(driverId);
  }
}
