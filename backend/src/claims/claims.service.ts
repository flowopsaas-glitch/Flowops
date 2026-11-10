import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Claim, ClaimEvent, ClaimStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  canTransition,
  checkApprovalAmount,
  liabilityIsAssessed,
  nextClaimNumber,
  roundMoney,
  transitionRefusal,
} from './claims.rules';
import type {
  AddEvidenceDto,
  AddNoteDto,
  AssessClaimDto,
  ApproveClaimDto,
  CreateClaimDto,
  ListClaimsQuery,
  RejectClaimDto,
  WithdrawClaimDto,
} from './dto/claims.dto';

/** The authenticated tenant user, as the guards leave it on the request. */
export interface ClaimActor {
  id?: string;
  name?: string | null;
}

export type ClaimWithEvents = Claim & { events: ClaimEvent[] };

const MAX_NUMBER_ATTEMPTS = 5;

/**
 * A Json column takes `Prisma.InputJsonValue`, which does not admit `unknown` at
 * any depth — and a DTO's evidence map is exactly `Record<string, unknown>`. The
 * round-trip gives a plain JSON value *and* the defensive copy worth having here:
 * the caller's object cannot be mutated back through the row we stored.
 * `undefined` members drop out, which is what "not supplied" should mean.
 */
function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Claims & liability.
 *
 * Three rules this service enforces, because each is a way a claim stops being
 * a record and becomes a liability of its own:
 *
 *  1. **Tenancy.** Every read and write is scoped by `companyId` from the JWT.
 *     A claim id from another tenant is a 404, never an empty result.
 *  2. **The state machine.** Illegal transitions are refused with an
 *     explanation; nothing writes a status the UI does not model.
 *  3. **Money.** An approval cannot exceed the claim or the stated cap, a
 *     settlement cannot happen without an approval, and settlement creates a
 *     DRAFT credit note — never an issued one — so a second pair of eyes posts
 *     it to a client's account.
 */
@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async create(companyId: string, actor: ClaimActor, dto: CreateClaimDto): Promise<ClaimWithEvents> {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: dto.waybillId, companyId },
      select: { id: true, trackingNumber: true, recipientName: true },
    });
    if (!waybill) {
      // Same answer for "does not exist" and "belongs to another tenant": the
      // second must not be discoverable by trying ids.
      throw new NotFoundException('No waybill with that id in this account.');
    }

    const claimedAmount = roundMoney(dto.claimedAmount);
    if (!(claimedAmount > 0)) {
      throw new BadRequestException('Claimed amount must be greater than zero.');
    }
    if (dto.liabilityCap != null && roundMoney(dto.liabilityCap) < 0) {
      throw new BadRequestException('Liability cap cannot be negative.');
    }

    for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt += 1) {
      const number = await this.nextNumber(companyId);
      try {
        const claim = await this.prisma.$transaction(async (tx) => {
          const created = await tx.claim.create({
            data: {
              number,
              companyId,
              waybillId: waybill.id,
              waybillNumber: waybill.trackingNumber,
              clientName: dto.clientName ?? waybill.recipientName ?? null,
              clientEmail: dto.clientEmail ?? null,
              invoiceId: dto.invoiceId ?? null,
              type: dto.type,
              liability: dto.liability ?? 'UNASSESSED',
              liabilityBasis: dto.liabilityBasis ?? null,
              liabilityCap: dto.liabilityCap != null ? roundMoney(dto.liabilityCap) : null,
              claimedAmount,
              currency: dto.currency ?? 'ZAR',
              summary: dto.summary,
              description: dto.description ?? null,
              incidentAt: dto.incidentAt ? new Date(dto.incidentAt) : null,
              evidence: dto.evidence ? asJson(dto.evidence) : undefined,
              respondBy: dto.respondBy ? new Date(dto.respondBy) : null,
              raisedById: actor?.id ?? null,
              raisedByName: actor?.name ?? null,
            },
          });

          await tx.claimEvent.create({
            data: {
              claimId: created.id,
              companyId,
              type: 'CREATED',
              toStatus: 'OPEN',
              actorId: actor?.id ?? null,
              actorName: actor?.name ?? null,
              description: `${dto.type} claim raised for waybill ${waybill.trackingNumber}${
                claimedAmount ? ` — ${dto.currency ?? 'ZAR'} ${claimedAmount.toFixed(2)} claimed` : ''
              }.`,
              metadata: { claimedAmount, waybillNumber: waybill.trackingNumber },
            },
          });

          return created;
        });

        return { ...claim, events: await this.eventsFor(companyId, claim.id) };
      } catch (error: any) {
        // Unique violation on (number, companyId) — two claims raised at once.
        // Recompute and retry; anything else is a real failure.
        if (error?.code === 'P2002' && attempt < MAX_NUMBER_ATTEMPTS) continue;
        if (error?.code === 'P2002') {
          throw new ConflictException('Could not allocate a claim number. Please retry.');
        }
        throw error;
      }
    }

    throw new ConflictException('Could not allocate a claim number. Please retry.');
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async list(companyId: string, query: ListClaimsQuery = {}): Promise<Claim[]> {
    const where: Record<string, unknown> = { companyId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.waybillId) where.waybillId = query.waybillId;
    if (query.openOnly) where.status = { notIn: ['SETTLED', 'REJECTED', 'WITHDRAWN'] };
    if (query.q) {
      where.OR = [
        { number: { contains: query.q, mode: 'insensitive' } },
        { waybillNumber: { contains: query.q, mode: 'insensitive' } },
        { clientName: { contains: query.q, mode: 'insensitive' } },
        { summary: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.claim.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(Math.max(query.limit ?? 100, 1), 200),
    });
  }

  async get(companyId: string, id: string): Promise<ClaimWithEvents> {
    const claim = await this.prisma.claim.findFirst({ where: { id, companyId } });
    if (!claim) throw new NotFoundException('Claim not found');
    return { ...claim, events: await this.eventsFor(companyId, id) };
  }

  /** Portfolio view: what is open, what it is worth, what is near its SLA. */
  async summary(companyId: string) {
    const claims = await this.prisma.claim.findMany({
      where: { companyId },
      select: { status: true, type: true, claimedAmount: true, approvedAmount: true, respondBy: true },
    });

    const now = Date.now();
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let claimedOpen = 0;
    let approvedPayable = 0;
    let overdue = 0;

    for (const claim of claims) {
      byStatus[claim.status] = (byStatus[claim.status] ?? 0) + 1;
      byType[claim.type] = (byType[claim.type] ?? 0) + 1;
      const terminal = ['SETTLED', 'REJECTED', 'WITHDRAWN'].includes(claim.status);
      if (!terminal) claimedOpen += claim.claimedAmount ?? 0;
      if (claim.status === 'APPROVED') approvedPayable += claim.approvedAmount ?? 0;
      if (!terminal && claim.respondBy && claim.respondBy.getTime() < now) overdue += 1;
    }

    return {
      total: claims.length,
      open: claims.filter((c) => !['SETTLED', 'REJECTED', 'WITHDRAWN'].includes(c.status)).length,
      byStatus,
      byType,
      claimedOpen: roundMoney(claimedOpen),
      approvedPayable: roundMoney(approvedPayable),
      overdue,
    };
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  async assess(companyId: string, actor: ClaimActor, id: string, dto: AssessClaimDto): Promise<ClaimWithEvents> {
    const claim = await this.requireClaim(companyId, id);

    if (!liabilityIsAssessed(dto.liability, dto.liabilityBasis)) {
      throw new BadRequestException(
        'State who carries the loss and on what basis before assessing. "Unassessed" is not an assessment.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: this is the row the decision is made
      // on, not the one read before the request was validated. Assessing an
      // already-reviewed claim records the assessment without moving it, so
      // UNDER_REVIEW is a legal predecessor here even though the state machine
      // has no UNDER_REVIEW → UNDER_REVIEW edge — which is why this one
      // transition is written out rather than using claimStatus().
      const current = await tx.claim.findFirst({ where: { id, companyId } });
      if (!current) throw new NotFoundException('Claim not found');
      if (current.status !== 'OPEN' && current.status !== 'UNDER_REVIEW') {
        throw new ConflictException(transitionRefusal(current.status, 'UNDER_REVIEW'));
      }
      const nextStatus: ClaimStatus = current.status === 'OPEN' ? 'UNDER_REVIEW' : current.status;
      const moved = await tx.claim.updateMany({
        where: { id, companyId, status: current.status },
        data: {
          liability: dto.liability,
          liabilityBasis: dto.liabilityBasis.trim(),
          liabilityCap: dto.liabilityCap != null ? roundMoney(dto.liabilityCap) : current.liabilityCap,
          status: nextStatus,
          assessedById: actor?.id ?? null,
        },
      });
      if (moved.count === 0) {
        throw new ConflictException(
          'This claim was just changed by someone else — reload it before acting on it again.',
        );
      }
      await tx.claimEvent.create({
        data: {
          claimId: id,
          companyId,
          type: nextStatus === current.status ? 'NOTE_ADDED' : 'STATUS_CHANGED',
          fromStatus: current.status,
          toStatus: nextStatus,
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          description: `Liability assessed as ${dto.liability} — ${dto.liabilityBasis.trim()}.`,
          metadata: { liability: dto.liability, liabilityCap: dto.liabilityCap ?? null },
        },
      });
    });

    return this.get(companyId, claim.id);
  }

  async approve(companyId: string, actor: ClaimActor, id: string, dto: ApproveClaimDto): Promise<ClaimWithEvents> {
    const claim = await this.requireTransition(companyId, id, 'APPROVED');

    if (claim.liability === 'UNASSESSED') {
      throw new BadRequestException('Assess liability before approving: the platform will not decide who carries the loss.');
    }

    const approvedAmount = roundMoney(dto.approvedAmount);
    const check = checkApprovalAmount(approvedAmount, claim.claimedAmount, claim.liabilityCap);
    if (!check.ok) throw new BadRequestException(check.reason);
    await this.prisma.$transaction(async (tx) => {
      const fromStatus = await this.claimStatus(
        tx, companyId, claim.id, 'APPROVED',
        { approvedAmount, approvedById: actor?.id ?? null },
      );
      await tx.claimEvent.create({
        data: {
          claimId: claim.id,
          companyId,
          type: 'STATUS_CHANGED',
          fromStatus,
          toStatus: 'APPROVED',
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          description: `Approved ${claim.currency} ${approvedAmount.toFixed(2)} against ${claim.currency} ${claim.claimedAmount.toFixed(2)} claimed.`,
          metadata: { approvedAmount, liability: claim.liability, note: dto.note ?? null },
        },
      });
    });

    return this.get(companyId, claim.id);
  }

  async reject(companyId: string, actor: ClaimActor, id: string, dto: RejectClaimDto): Promise<ClaimWithEvents> {
    const claim = await this.requireTransition(companyId, id, 'REJECTED');
    const reason = (dto.reason ?? '').trim();
    if (reason.length < 5) {
      throw new BadRequestException('Give a reason for the rejection — the client sees this.');
    }

    await this.prisma.$transaction(async (tx) => {
      const fromStatus = await this.claimStatus(
        tx, companyId, claim.id, 'REJECTED',
        { rejectionReason: reason, closedAt: new Date() },
      );
      await tx.claimEvent.create({
        data: {
          claimId: claim.id,
          companyId,
          type: 'STATUS_CHANGED',
          fromStatus,
          toStatus: 'REJECTED',
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          description: `Rejected: ${reason}`,
        },
      });
    });

    return this.get(companyId, claim.id);
  }

  async withdraw(companyId: string, actor: ClaimActor, id: string, dto: WithdrawClaimDto = {}): Promise<ClaimWithEvents> {
    const claim = await this.requireTransition(companyId, id, 'WITHDRAWN');

    await this.prisma.$transaction(async (tx) => {
      const fromStatus = await this.claimStatus(
        tx, companyId, claim.id, 'WITHDRAWN',
        { closedAt: new Date() },
      );
      await tx.claimEvent.create({
        data: {
          claimId: claim.id,
          companyId,
          type: 'STATUS_CHANGED',
          fromStatus,
          toStatus: 'WITHDRAWN',
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          description: dto.reason?.trim() ? `Withdrawn: ${dto.reason.trim()}` : 'Withdrawn by the operator.',
        },
      });
    });

    return this.get(companyId, claim.id);
  }

  /**
   * Settle an approved claim: record the money as owed, and raise a DRAFT credit
   * note for finance to issue.
   *
   * DRAFT, not ISSUED — settlement is an operational decision; posting to a
   * client's account is a financial one, and this platform keeps them apart.
   */
  async settle(companyId: string, actor: ClaimActor, id: string, note?: string): Promise<ClaimWithEvents> {
    const claim = await this.requireTransition(companyId, id, 'SETTLED');

    const amount = roundMoney(claim.approvedAmount ?? 0);
    if (!(amount > 0)) {
      throw new BadRequestException('A claim must be approved for a positive amount before it can be settled.');
    }

    const creditNoteNumber = await this.nextCreditNoteNumber(companyId);

    await this.prisma.$transaction(async (tx) => {
      // Claim the transition BEFORE raising the credit note. The order is the
      // point of this method: a caller that loses the race must leave nothing
      // behind, and a credit note is a financial instrument rather than an
      // audit line that can be tidied up later. Claiming first means the
      // loser throws having created no money at all.
      const fromStatus = await this.claimStatus(
        tx, companyId, claim.id, 'SETTLED',
        { settledAt: new Date(), closedAt: new Date() },
      );

      const creditNote = await tx.creditNote.create({
        data: {
          number: creditNoteNumber,
          // Stated, not inherited from the column default: this line is the
          // guarantee that settling a claim never posts to a client's ledger.
          status: 'DRAFT',
          companyId,
          clientName: claim.clientName ?? 'Client',
          clientEmail: claim.clientEmail ?? null,
          invoiceId: claim.invoiceId ?? null,
          reason: `Claim ${claim.number} — ${claim.summary}`.slice(0, 240),
          subtotal: amount,
          tax: 0,
          total: amount,
          items: {
            create: [
              {
                description: `Claim ${claim.number} settlement`.slice(0, 240),
                quantity: 1,
                unitPrice: amount,
                total: amount,
              },
            ],
          },
        },
      });

      // Safe as a plain update: this caller owns the transition, so no one
      // else can be moving the row underneath it.
      await tx.claim.update({
        where: { id: claim.id },
        data: {
          creditNoteId: creditNote.id,
          creditNoteNumber: creditNote.number,
        },
      });

      await tx.claimEvent.create({
        data: {
          claimId: claim.id,
          companyId,
          type: 'SETTLED',
          fromStatus,
          toStatus: 'SETTLED',
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          description: `Settled ${claim.currency} ${amount.toFixed(2)}; draft credit note ${creditNote.number} raised for finance to issue.`,
          metadata: { creditNoteId: creditNote.id, creditNoteNumber: creditNote.number, amount, note: note ?? null },
        },
      });
    });

    this.logger.log(`Claim ${claim.number} settled; draft credit note ${creditNoteNumber} raised.`);
    return this.get(companyId, claim.id);
  }

  // ── Append-only additions ─────────────────────────────────────────────────

  async addNote(companyId: string, actor: ClaimActor, id: string, dto: AddNoteDto): Promise<ClaimWithEvents> {
    const claim = await this.requireClaim(companyId, id);
    const description = (dto.description ?? '').trim();
    if (description.length < 2) throw new BadRequestException('A note needs some text.');

    await this.prisma.claimEvent.create({
      data: {
        claimId: claim.id,
        companyId,
        type: 'NOTE_ADDED',
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        description,
      },
    });

    return this.get(companyId, claim.id);
  }

  async addEvidence(companyId: string, actor: ClaimActor, id: string, dto: AddEvidenceDto): Promise<ClaimWithEvents> {
    const claim = await this.requireClaim(companyId, id);
    const refs = (dto.refs ?? []).map((r) => String(r).trim()).filter(Boolean);
    if (!refs.length) throw new BadRequestException('Add at least one evidence reference.');

    // Merge rather than replace: evidence accumulates, and a later upload must
    // not erase what an earlier one recorded.
    const existing = (claim.evidence as Record<string, unknown> | null) ?? {};
    const priorRefs = Array.isArray(existing.refs) ? (existing.refs as string[]) : [];
    const merged = Array.from(new Set([...priorRefs, ...refs]));

    await this.prisma.$transaction(async (tx) => {
      await tx.claim.update({
        where: { id: claim.id },
        data: { evidence: asJson({ ...existing, refs: merged }) },
      });
      await tx.claimEvent.create({
        data: {
          claimId: claim.id,
          companyId,
          type: 'EVIDENCE_ADDED',
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? null,
          description: `${refs.length} evidence reference${refs.length === 1 ? '' : 's'} added.`,
          metadata: { added: refs, total: merged.length },
        },
      });
    });

    return this.get(companyId, claim.id);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async requireClaim(companyId: string, id: string): Promise<Claim> {
    const claim = await this.prisma.claim.findFirst({ where: { id, companyId } });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  /** Terminal-state and transition checks, before any write. */
  private async requireTransition(companyId: string, id: string, to: ClaimStatus): Promise<Claim> {
    const claim = await this.requireClaim(companyId, id);
    if (!canTransition(claim.status, to)) {
      throw new ConflictException(transitionRefusal(claim.status, to));
    }
    return claim;
  }

  /**
   * Move a claim to `to` atomically, inside an open transaction.
   *
   * A claim is money. The read-then-write this replaces is the bug that
   * shipped three times elsewhere in this codebase — a credit note applied
   * twice, a payment confirmed twice, a signup approved twice — and settling a
   * claim raises a real credit note, so the fourth occurrence would not be a
   * duplicated audit line but a duplicated payout.
   *
   * Two operators acting at once both read the same committed row, both pass
   * every application check, and both write. Nothing throws. The fix is to
   * make the expectation part of the write: the WHERE names the status this
   * caller believes the claim holds, and Postgres evaluates it against the
   * committed row at lock time, so the second caller matches nothing.
   *
   * Reading INSIDE the transaction matters as much as the CAS itself. It is
   * what makes `fromStatus` on the audit event truthful: a caller that read
   * OPEN a second ago, was meanwhile moved to UNDER_REVIEW by someone else,
   * and then matched a permissive WHERE would otherwise record a transition
   * from a state the claim was never in.
   *
   * Returns the status the claim actually held, for the audit event.
   */
  private async claimStatus(
    tx: Prisma.TransactionClient,
    companyId: string,
    id: string,
    to: ClaimStatus,
    data: Prisma.ClaimUpdateManyMutationInput = {},
  ): Promise<ClaimStatus> {
    const current = await tx.claim.findFirst({ where: { id, companyId } });
    if (!current) throw new NotFoundException('Claim not found');
    if (!canTransition(current.status, to)) {
      throw new ConflictException(transitionRefusal(current.status, to));
    }
    const moved = await tx.claim.updateMany({
      where: { id, companyId, status: current.status },
      data: { ...data, status: to },
    });
    if (moved.count === 0) {
      // The row changed between the read and the write. Someone else won, and
      // this caller's work has not happened — say so plainly rather than
      // guessing at a reason it might have been refused.
      throw new ConflictException(
        'This claim was just changed by someone else — reload it before acting on it again.',
      );
    }
    return current.status;
  }

  private async eventsFor(companyId: string, claimId: string): Promise<ClaimEvent[]> {
    return this.prisma.claimEvent.findMany({
      where: { claimId, companyId },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  private async nextNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const last = await this.prisma.claim.findFirst({
      where: { companyId, number: { startsWith: `CLM-${year}-` } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return nextClaimNumber(last?.number, year);
  }

  private async nextCreditNoteNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const last = await this.prisma.creditNote.findFirst({
      where: { companyId, number: { startsWith: `CN-${year}-` } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const prefix = `CN-${year}-`;
    const sequence = last?.number?.startsWith(prefix)
      ? Number.parseInt(last.number.slice(prefix.length), 10) + 1
      : 1;
    return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(4, '0')}`;
  }
}
