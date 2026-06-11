import { Controller, Get, Post, Param, Body, HttpCode } from "@nestjs/common";
import { PublicTrackingService } from "./public-tracking.service";

@Controller("public-tracking")
export class PublicTrackingController {
  constructor(private readonly service: PublicTrackingService) {}

  /**
   * PUBLIC: No auth - customers access tracking via token
   */
  @Get(":token")
  async getTracking(@Param("token") token: string) {
    return this.service.getTrackingInfo(token);
  }

  /**
   * INTERNAL: Generate token (requires auth - added in guards)
   */
  @Post("generate")
  @HttpCode(200)
  async generate(@Body() body: { waybillId: number }) {
    return this.service.generateToken(body.waybillId);
  }

  /**
   * INTERNAL: Record tracking event
   */
  @Post("event")
  @HttpCode(201)
  async addEvent(
    @Body()
    body: {
      waybillId: number;
      status: string;
      location?: string;
      description?: string;
      metadata?: any;
    },
  ) {
    return this.service.addEvent(
      body.waybillId,
      body.status,
      body.location,
      body.description,
      body.metadata,
    );
  }
}
