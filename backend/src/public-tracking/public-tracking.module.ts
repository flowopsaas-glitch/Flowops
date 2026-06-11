import { Module } from "@nestjs/common";
import { PublicTrackingService } from "./public-tracking.service";
import { PublicTrackingController } from "./public-tracking.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [PublicTrackingController],
  providers: [PublicTrackingService],
  exports: [PublicTrackingService],
})
export class PublicTrackingModule {}
