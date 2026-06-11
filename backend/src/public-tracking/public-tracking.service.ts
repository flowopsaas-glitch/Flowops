import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

@Injectable()
export class PublicTrackingService {
  private readonly logger = new Logger(PublicTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateToken(waybillId: number): Promise<{ token: string; url: string }> {
    const existing = await this.prisma.trackingToken.findFirst({
      where: { waybillId, isActive: true },
    });

    if (existing) {
      return { token: existing.token, url: this.buildUrl(existing.token) };
    }

    const token = crypto.randomBytes(16).toString("hex");

    await this.prisma.trackingToken.create({
      data: {
        waybillId,
        token,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    await this.addEvent(waybillId, "CREATED", null, "Tracking link generated");

    return { token, url: this.buildUrl(token) };
  }

  async getTrackingInfo(token: string) {
    const trackingToken = await this.prisma.trackingToken.findUnique({
      where: { token },
    });

    if (!trackingToken || !trackingToken.isActive) {
      throw new NotFoundException("Tracking link not found or has been deactivated");
    }

    if (trackingToken.expiresAt && trackingToken.expiresAt < new Date()) {
      throw new NotFoundException("Tracking link has expired");
    }

    await this.prisma.trackingToken.update({
      where: { id: trackingToken.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    // Fetch waybill separately to avoid nested include type issues
    const wb = await this.prisma.waybill.findUnique({
      where: { id: trackingToken.waybillId },
      include: {
        company: { select: { name: true } },
        driver: { select: { name: true, phone: true } },
        proofsOfDelivery: { take: 1, orderBy: { createdAt: "desc" } },
      },
    });

    if (!wb) {
      throw new NotFoundException("Waybill not found");
    }

    const events = await this.prisma.trackingEvent.findMany({
      where: { waybillId: trackingToken.waybillId },
      orderBy: { createdAt: "asc" },
    });

    return {
      waybillNumber: wb.waybillNumber,
      status: this.calculateStatus(wb, events),
      estimatedDelivery: (wb as any).plannedArrival || (wb as any).estimatedDelivery || null,
      origin: wb.origin,
      destination: wb.destination,
      company: wb.company,
      driver: wb.driver ? { name: wb.driver.name, phone: wb.driver.phone } : null,
      timeline: this.buildTimeline(wb, events),
      proofOfDelivery: wb.proofsOfDelivery?.[0] || null,
      lastUpdated: new Date(),
    };
  }

  async addEvent(
    waybillId: number,
    status: string,
    location?: string | null,
    description?: string,
    metadata?: any,
  ) {
    return this.prisma.trackingEvent.create({
      data: {
        waybillId,
        status,
        location,
        description: description || this.defaultDescription(status),
        metadata: metadata || {},
      },
    });
  }

  private buildUrl(token: string): string {
    const base = this.config.get("FRONTEND_URL") || "https://app.flowops.co.za";
    return `${base}/track/${token}`;
  }

  private calculateStatus(wb: any, events: any[]): string {
    if (wb.deliveredAt || wb.status === "DELIVERED") return "DELIVERED";
    if (wb.status === "FAILED") return "FAILED";
    if (events.length > 0) return events[events.length - 1].status;
    return wb.status || "CREATED";
  }

  private buildTimeline(wb: any, events: any[]) {
    const timeline: any[] = [
      {
        status: "CREATED",
        timestamp: wb.createdAt,
        description: "Shipment created",
        location: wb.origin,
      },
    ];

    events.forEach((e) => {
      if (e.status !== "CREATED") {
        timeline.push({
          status: e.status,
          timestamp: e.createdAt,
          description: e.description,
          location: e.location,
        });
      }
    });

    if (wb.deliveredAt) {
      timeline.push({
        status: "DELIVERED",
        timestamp: wb.deliveredAt,
        description: "Successfully delivered",
        location: wb.destination,
      });
    }

    return timeline.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  private defaultDescription(status: string): string {
    const map: Record<string, string> = {
      CREATED: "Shipment created",
      PICKED_UP: "Picked up from sender",
      IN_TRANSIT: "In transit to destination",
      AT_HUB: "Arrived at sorting facility",
      OUT_FOR_DELIVERY: "Out for delivery",
      DELIVERED: "Successfully delivered",
      FAILED: "Delivery attempt failed",
      RETURNED: "Returned to sender",
    };
    return map[status] || status;
  }
}
