import { Injectable } from "@nestjs/common";

@Injectable()
export class ClientAiService {
  async processMessage(channel: string, message: string) {
    const text = message.toLowerCase();

    if (text.includes("where") && text.includes("parcel")) {
      return {
        reply:
          "📦 Please share your tracking number and I’ll check your parcel status right away.",
      };
    }

    if (text.includes("cost") || text.includes("price")) {
      return {
        reply:
          "💰 Please provide the shipment ID so I can explain the full cost breakdown.",
      };
    }

    if (text.includes("booking")) {
      return {
        reply:
          "📋 I can help with bookings. Would you like to create a new booking or check an existing one?",
      };
    }

    return {
      reply:
        "🤖 I can help with bookings, tracking, delivery updates, and costing. What do you need help with?",
    };
  }
}
