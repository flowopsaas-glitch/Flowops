import { Body, Controller, Post } from "@nestjs/common";
import { ClientAiService } from "./client-ai.service";

@Controller("client-ai")
export class ClientAiController {
  constructor(private readonly clientAiService: ClientAiService) {}

  @Post("message")
  async handleMessage(
    @Body()
    body: {
      channel: "whatsapp" | "email";
      message: string;
    }
  ) {
    return this.clientAiService.processMessage(
      body.channel,
      body.message
    );
  }
}
