import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OwnerController } from "./owner.controller";
import { OwnerService } from "./owner.service";

@Module({
  imports: [PrismaModule],
  controllers: [OwnerController],
  providers: [OwnerService],
  exports: [OwnerService],
})
export class OwnerModule {}
