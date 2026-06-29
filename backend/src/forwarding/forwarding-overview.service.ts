import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

const DAY_MS = 86_400_000;

/** Statuses that mean a file is no longer "live" in the desk's working set. */
const CLOSED_STATUSES = ['DELIVERED', 'CANCELLED'];

/** Declaration statuses that still need the desk's attention. */
const CUSTOMS_OPEN = ['DRAFT', 'SUBMITTED', 'QUERY', 'REJECTED'];

export type ForwardingExceptionKind =
  | 'RISK'
  | 'DEMURRAGE'
  | 'CUSTOMS_QUERY'
  | 'CUSTOMS_REJECTED'
  | 'DOCS';

export interface ForwardingException {
  fileId: string;
  fileNumber: string;
  kind: ForwardingExceptionKind;
  label: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  score: number; // for ordering (higher = more urgent)
}

/**
 * Clearing & Forwarding command-centre aggregation.
 *
 * Read-only, tenant-scoped roll-up across all shipment files — the import/export
 * desk's control tower: live exposure KPIs, an arrivals board, the customs-queue
 * status spread, and an exceptions ("needs attention") list assembled entirely
 * from data the platform already holds. No external calls, no fabricated state.
 */
@Injectable()
export class ForwardingOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'freightForwarding'))) {
      throw new ForbiddenException(
        'Freight Forwarding is an Enterprise feature. Upgrade your plan to manage import/export shipments.',
      );
    }
  }

  async overview(companyId: string) {
    await this.assertEntitled(companyId);
    const now = Date.now();

    // Pull the working set once: files (with cheap counts), containers (demurrage
    // inputs), declarations (customs queue) and open disbursements (exposure).
    const [files, containers, declarations, openDisb] = await Promise.all([
      this.prisma.shipmentFile.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true, fileNumber: true, mode: true, direction: true, loadType: true,
          status: true, shipperName: true, consigneeName: true, pol: true, pod: true,
          vesselVoyage: true, eta: true, etd: true, aiRiskScore: true, aiRiskNote: true,
          _count: { select: { documents: true, cargo: true, containers: true } },
        },
      }),
      this.prisma.shipmentContainer.findMany({
        where: { file: { companyId } },
        select: {
          id: true, containerNo: true, fileId: true,
          freeDays: true, perDiemRate: true, availableFrom: true, returnedAt: true,
          file: { select: { fileNumber: true, status: true } },
        },
      }),
      this.prisma.customsDeclaration.findMany({
        where: { companyId },
        select: { id: true, fileId: true, status: true, lrn: true, mrn: true },
      }),
      this.prisma.disbursement.findMany({
        where: { companyId, status: { in: ['OUTSTANDING', 'INVOICED'] } },
        select: { amount: true },
      }),
    ]);

    const fileById = new Map(files.map((f) => [f.id, f]));
    const open = files.filter((f) => !CLOSED_STATUSES.includes(f.status));

    // ── Arrivals board: open files with an ETA, soonest first ────────────────
    const arrivals = open
      .filter((f) => f.eta)
      .sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime())
      .slice(0, 12)
      .map((f) => ({
        id: f.id, fileNumber: f.fileNumber, direction: f.direction, mode: f.mode,
        status: f.status, eta: f.eta, consigneeName: f.consigneeName,
        pol: f.pol, pod: f.pod, vesselVoyage: f.vesselVoyage,
        aiRiskScore: f.aiRiskScore ?? 0,
        overdue: new Date(f.eta!).getTime() < now,
      }));

    const arriving7d = open.filter(
      (f) => f.eta && new Date(f.eta).getTime() < now + 7 * DAY_MS,
    ).length;

    // ── Demurrage exposure: replicate the per-container accrual model ─────────
    const exceptions: ForwardingException[] = [];
    let demurrageExposure = 0;
    let demurrageAccruingCount = 0;
    const demurrageByFile = new Map<string, number>();

    for (const c of containers) {
      const rate = c.perDiemRate ?? 0;
      const freeDays = c.freeDays ?? 0;
      if (!c.availableFrom || rate <= 0) continue;
      if (c.file && CLOSED_STATUSES.includes(c.file.status)) continue;
      const end = c.returnedAt ? new Date(c.returnedAt).getTime() : now;
      const daysUsed = Math.max(0, Math.ceil((end - new Date(c.availableFrom).getTime()) / DAY_MS));
      const chargeableDays = Math.max(0, daysUsed - freeDays);
      const charge = +(chargeableDays * rate).toFixed(2);
      const accruing = !c.returnedAt && chargeableDays > 0;
      if (accruing) {
        demurrageExposure += charge;
        demurrageAccruingCount += 1;
        demurrageByFile.set(c.fileId, (demurrageByFile.get(c.fileId) ?? 0) + charge);
      }
    }
    demurrageExposure = +demurrageExposure.toFixed(2);

    // ── Customs queue: status spread + per-file lookup for exceptions ────────
    const customsQueue = { DRAFT: 0, SUBMITTED: 0, QUERY: 0, RELEASED: 0, REJECTED: 0 };
    for (const d of declarations) {
      if (d.status in customsQueue) (customsQueue as any)[d.status] += 1;
    }
    const customsPending = declarations.filter((d) => CUSTOMS_OPEN.includes(d.status)).length;

    // ── Exceptions ("needs attention") ───────────────────────────────────────
    // Customs queries / rejections — highest urgency (a held shipment costs money).
    for (const d of declarations) {
      const f = fileById.get(d.fileId);
      if (!f || CLOSED_STATUSES.includes(f.status)) continue;
      if (d.status === 'QUERY') {
        exceptions.push({
          fileId: f.id, fileNumber: f.fileNumber, kind: 'CUSTOMS_QUERY',
          label: 'Customs query', detail: `SARS raised a query${d.mrn ? ` (MRN ${d.mrn})` : ''} — respond to release.`,
          severity: 'high', score: 100,
        });
      } else if (d.status === 'REJECTED') {
        exceptions.push({
          fileId: f.id, fileNumber: f.fileNumber, kind: 'CUSTOMS_REJECTED',
          label: 'Declaration rejected', detail: 'Customs rejected the declaration — correct and re-submit.',
          severity: 'high', score: 95,
        });
      }
    }

    // Demurrage accruing — money bleeding right now.
    for (const [fileId, charge] of demurrageByFile) {
      const f = fileById.get(fileId);
      if (!f) continue;
      exceptions.push({
        fileId: f.id, fileNumber: f.fileNumber, kind: 'DEMURRAGE',
        label: 'Demurrage accruing', detail: `~${charge.toFixed(0)} accrued and still running — return empties / clear cargo.`,
        severity: charge > 0 ? 'high' : 'medium', score: 80 + Math.min(15, charge / 1000),
      });
    }

    // AI demurrage/delay risk on open files.
    for (const f of open) {
      if ((f.aiRiskScore ?? 0) >= 50) {
        exceptions.push({
          fileId: f.id, fileNumber: f.fileNumber, kind: 'RISK',
          label: `Delay risk ${f.aiRiskScore}`, detail: f.aiRiskNote || 'High AI-assessed demurrage/delay risk.',
          severity: (f.aiRiskScore ?? 0) >= 75 ? 'high' : 'medium', score: 50 + (f.aiRiskScore ?? 0) / 10,
        });
      }
    }

    // Arrived but no documents captured — a clearance blocker.
    for (const f of open) {
      if (['ARRIVED', 'CUSTOMS_CLEARED'].includes(f.status) && (f._count?.documents ?? 0) === 0) {
        exceptions.push({
          fileId: f.id, fileNumber: f.fileNumber, kind: 'DOCS',
          label: 'Documents missing', detail: 'File has arrived but no documents are attached for clearance.',
          severity: 'medium', score: 40,
        });
      }
    }

    exceptions.sort((a, b) => b.score - a.score);

    const disbursementOutstanding = Math.round(
      openDisb.reduce((s, d) => s + (d.amount || 0), 0),
    );

    return {
      kpis: {
        openFiles: open.length,
        totalFiles: files.length,
        arriving7d,
        atRisk: open.filter((f) => (f.aiRiskScore ?? 0) >= 50).length,
        customsPending,
        demurrageExposure,
        demurrageAccruingCount,
        disbursementOutstanding,
        exceptions: exceptions.length,
      },
      arrivals,
      customsQueue,
      exceptions: exceptions.slice(0, 10),
      // Honest caveat surfaced to the UI so nothing reads as a live gov't feed.
      note:
        'Roll-up of your own shipment files. Demurrage and disbursement figures are estimates from the terms you captured; customs status reflects manually recorded SARS/agent responses.',
    };
  }
}
