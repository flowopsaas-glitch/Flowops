import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../prisma/prisma.module";
import { BroadcastModule } from "../broadcast/broadcast.module";
import { ShipmentsRiskService } from "./shipments-risk.service";
import { ShipmentsRiskController } from "./shipments-risk.controller";

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot(), BroadcastModule],
  providers: [ShipmentsRiskService],
  controllers: [ShipmentsRiskController],
  exports: [ShipmentsRiskService],
})
export class ShipmentsRiskModule {}