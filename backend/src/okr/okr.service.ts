import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * OKR service — Objectives & Key Results for FlowOps itself (owner strategic
 * cockpit, not tenant-scoped). Progress is computed from key-result values, so
 * an objective's % is always derived from real numbers, never hand-entered.
 */
@Injectable()
export class OkrService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Progress maths ──────────────────────────────────────────────────────────

  /** A key result's progress 0–100, clamped, direction-aware (start→target). */
  private krProgress(kr: { startValue: number; targetValue: number; currentValue: number }): number {
    const span = kr.targetValue - kr.startValue;
    if (span === 0) return kr.currentValue >= kr.targetValue ? 100 : 0;
    const pct = ((kr.currentValue - kr.startValue) / span) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  /** Suggest a status from progress + time elapsed in the quarter. */
  private suggestStatus(progress: number): 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'ACHIEVED' {
    if (progress >= 100) return 'ACHIEVED';
    if (progress >= 70) return 'ON_TRACK';
    if (progress >= 40) return 'AT_RISK';
    return 'BEHIND';
  }

  private decorate(obj: any) {
    const krs = (obj.keyResults ?? []).map((kr: any) => ({
      ...kr,
      progress: this.krProgress(kr),
    }));
    const progress = krs.length
      ? Math.round(krs.reduce((s: number, k: any) => s + k.progress, 0) / krs.length)
      : 0;
    return {
      ...obj,
      keyResults: krs,
      progress,
      suggestedStatus: this.suggestStatus(progress),
    };
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async list(quarter?: string) {
    const objectives = await this.prisma.objective.findMany({
      where: quarter ? { quarter } : {},
      include: { keyResults: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ quarter: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const decorated = objectives.map((o) => this.decorate(o));

    // Distinct quarters for the filter, plus a portfolio roll-up.
    const quarters = Array.from(new Set(objectives.map((o) => o.quarter))).sort().reverse();
    const overall = decorated.length
      ? Math.round(decorated.reduce((s, o) => s + o.progress, 0) / decorated.length)
      : 0;

    return { objectives: decorated, quarters, summary: { count: decorated.length, overallProgress: overall } };
  }

  async get(id: string) {
    const obj = await this.prisma.objective.findUnique({
      where: { id },
      include: { keyResults: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!obj) throw new NotFoundException('Objective not found');
    return this.decorate(obj);
  }

  // ── Objectives ──────────────────────────────────────────────────────────────

  async createObjective(body: {
    title: string;
    description?: string;
    quarter: string;
    owner?: string;
    status?: string;
    sortOrder?: number;
  }) {
    const obj = await this.prisma.objective.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        quarter: body.quarter,
        owner: body.owner ?? null,
        ...(body.status ? { status: body.status as any } : {}),
        sortOrder: body.sortOrder ?? 0,
      },
      include: { keyResults: true },
    });
    return this.decorate(obj);
  }

  async updateObjective(id: string, body: any) {
    await this.get(id);
    const data: any = {};
    for (const k of ['title', 'description', 'quarter', 'owner', 'sortOrder']) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.status !== undefined) data.status = body.status;
    await this.prisma.objective.update({ where: { id }, data });
    return this.get(id);
  }

  async deleteObjective(id: string) {
    await this.get(id);
    await this.prisma.objective.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Key results ─────────────────────────────────────────────────────────────

  async addKeyResult(objectiveId: string, body: {
    title: string;
    unit?: string;
    startValue?: number;
    targetValue: number;
    currentValue?: number;
    sortOrder?: number;
  }) {
    await this.get(objectiveId);
    await this.prisma.keyResult.create({
      data: {
        objectiveId,
        title: body.title,
        ...(body.unit ? { unit: body.unit as any } : {}),
        startValue: body.startValue ?? 0,
        targetValue: body.targetValue,
        currentValue: body.currentValue ?? body.startValue ?? 0,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return this.get(objectiveId);
  }

  async updateKeyResult(krId: string, body: any) {
    const kr = await this.prisma.keyResult.findUnique({ where: { id: krId } });
    if (!kr) throw new NotFoundException('Key result not found');
    const data: any = {};
    for (const k of ['title', 'startValue', 'targetValue', 'currentValue', 'sortOrder']) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.unit !== undefined) data.unit = body.unit;
    if (body.status !== undefined) data.status = body.status;
    await this.prisma.keyResult.update({ where: { id: krId }, data });
    return this.get(kr.objectiveId);
  }

  async deleteKeyResult(krId: string) {
    const kr = await this.prisma.keyResult.findUnique({ where: { id: krId } });
    if (!kr) throw new NotFoundException('Key result not found');
    await this.prisma.keyResult.delete({ where: { id: krId } });
    return this.get(kr.objectiveId);
  }
}
