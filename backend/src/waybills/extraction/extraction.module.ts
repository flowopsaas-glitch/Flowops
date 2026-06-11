import { Module, forwardRef } from "@nestjs/common";
import { ExtractionService } from "./extraction.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { WaybillInboxModule } from "../inbox/waybill-inbox.module";

// The "Intelligence" folder is where the UnifiedExtractionService lives
import { IntelligenceModule } from "../../intelligence/intelligence.module"; 
import { RulesExtractor } from "./extractors/rules.extractor"; 

@Module({
  imports: [
    PrismaModule,
    // We import the whole module so we get the UnifiedExtractionService
    IntelligenceModule, 
    forwardRef(() => WaybillInboxModule),
  ],
  providers: [
    ExtractionService,
    RulesExtractor,            
  ],
  exports: [ExtractionService],
})
export class ExtractionModule {}
