import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DispatchStatus } from "@prisma/client";
import { LiveTrackingQueryDto, LiveTrackingResponse, TrackingRow, StuckBand } from "./dto/live-tracking.dto";

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  private band(score: number): StuckBand {
    if (score >= 85) return "CRITICAL";
    if (score >= 65) return "HIGH";
    if (score >= 40) return "MEDIUM";
    return "LOW";
  }

  private clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  private minutesSince(d: Date | string | undefined): number {
    if (!d) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  }

  private scoreStuck(input: any) {
    let score = 8;
    const reasons: string[] = [];
    const actions: string[] = [];

    if (input.stuckMinutes >= 240) {
      score += 55;
      reasons.push(`No updates for ${input.stuckMinutes} mins`);
      actions.push("Escalate: Call driver");
    }

    if (input.dispatchStatus === DispatchStatus.ASSIGNED) score += 15;
    
    score = this.clamp(score, 0, 100);
    const band = this.band(score);

    return { score, band, summary: band === "CRITICAL" ? "Intervene" : "Normal", reasons, actions };
  }

  async live(companyId: number, query: LiveTrackingQueryDto): Promise<LiveTrackingResponse> {
    const onlyOpen = String(query.onlyOpen ?? "true") === "true";
    
    const statuses: DispatchStatus[] = onlyOpen
      ? [DispatchStatus.ASSIGNED, DispatchStatus.EN_ROUTE]
      : [DispatchStatus.ASSIGNED, DispatchStatus.EN_ROUTE, DispatchStatus.COMPLETED, DispatchStatus.FAILED];

    const items = await this.prisma.dispatch.findMany({
      where: {
        companyId,
        status: { in: statuses },
      },
      include: { driver: true, collection: true },
      orderBy: { id: "desc" }, // fallback orderBy if updatedAt missing
    });

    const rows: TrackingRow[] = items.map((d: any) => {
      const stuckMinutes = this.minutesSince(d.updatedAt || new Date());
      const ai = this.scoreStuck({ dispatchStatus: d.status, stuckMinutes });

      return {
        dispatchId: d.id,
        status: String(d.status),
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
        collection: d.collection ? { id: d.collection.id, name: d.collection.name } : null,
        driver: d.driver ? { id: d.driver.id, name: d.driver.name, phone: d.driver.phone } : null,
        ai: { stuckScore: ai.score, band: ai.band, summary: ai.summary, reasons: ai.reasons, actions: ai.actions },
        signals: { stuckMinutes, isStuck: stuckMinutes >= 60, driverAssigned: !!d.driverId }
      } as any;
    });

    return { summary: { total: rows.length, open: items.length, stuck: rows.filter(r => r.signals.isStuck).length }, items: rows } as any;
  }
}
