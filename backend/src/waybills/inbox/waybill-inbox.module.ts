import { Module, forwardRef } from "@nestjs/common";
import { WaybillsInboxService } from "./waybills-inbox.service";
import { WaybillsInboxController } from "./waybills-inbox.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { PricingModule } from "../../pricing/pricing.module";
import { WaybillsModule } from "../waybills.module";
import { ExtractionModule } from "../extraction/extraction.module"; // 👈 Add this
import { MailModule } from "../../mail/mail.module"; // 👈 Add this

@Module({
  imports: [
    PrismaModule,
    PricingModule,
    MailModule, // 👈 Required for the new email notification logic
    forwardRef(() => WaybillsModule),
    forwardRef(() => ExtractionModule), // 👈 Required for the extractionService in your service
  ],
  controllers: [WaybillsInboxController],
  providers: [WaybillsInboxService],
  exports: [WaybillsInboxService],
})
export class WaybillInboxModule {}
