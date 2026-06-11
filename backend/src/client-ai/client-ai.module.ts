import { Module } from "@nestjs/common";
import { ClientAiController } from "./client-ai.controller";
import { ClientAiService } from "./client-ai.service";

@Module({
  controllers: [ClientAiController],
  providers: [ClientAiService],
})
export class ClientAiModule {}
