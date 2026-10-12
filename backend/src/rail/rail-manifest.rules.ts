import type { RailTrainManifestStatus } from '@prisma/client';
import { evaluateDangerousGoods, type DgCarrier } from './rail-dangerous-goods';

/**
 * Digital Train Manifest — pure rules.
 *
 * Two laws, both taken from how rail documents actually work:
 *
 *  1. An ISSUED manifest is an attestation. It is immutable. Corrections happen
 *     by amending it into a NEW revision (revision+1) that supersedes the old —
 *     history is never rewritten. Same philosophy as an approved Process Book
 *     version and a never-re-issued SKU.
 *
 *  2. A manifest may not be issued unless it can honestly describe the train:
 *     at least one wagon, each wagon identified, weights that are not nonsense,
 *     and — when anything on the consist is dangerous goods — complete DG
 *     particulars (delegated to the shared DG evaluator, so the dispatch gate
 *     and the manifest can never disagree).
 */

export const MANIFEST_TRANSITIONS: Record<RailTrainManifestStatus, RailTrainManifestStatus[]> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['DEPARTED', 'SUPERSEDED', 'CANCELLED'],
  DEPARTED: ['ARRIVED'],
  ARRIVED: ['CLOSED'],
  CLOSED: [],
  SUPERSEDED: [],
  CANCELLED: [],
};

export const TERMINAL_MANIFEST_STATUSES: RailTrainManifestStatus[] = ['CLOSED', 'SUPERSEDED', 'CANCELLED'];

export function canTransitionManifest(from: RailTrainManifestStatus, to: RailTrainManifestStatus): boolean {
  return (MANIFEST_TRANSITIONS[from] ?? []).includes(to);
}

/** Once issued, the document body may not be edited — only amended to a new revision. */
export function isManifestEditable(status: RailTrainManifestStatus): boolean {
  return status === 'DRAFT';
}

export interface ManifestLine extends DgCarrier {
  position: number;
  wagonNumber: string;
  tareTonnes?: number | null;
  loadedTonnes?: number | null;
}

export interface ManifestIssueCheck {
  ok: boolean;
  blockers: string[];
  dgSummary: string;
}

export function evaluateManifestForIssue(
  lines: ReadonlyArray<ManifestLine>,
  consignment: DgCarrier & { consignmentNumber?: string },
): ManifestIssueCheck {
  const blockers: string[] = [];

  if (lines.length === 0) {
    blockers.push('A train manifest needs at least one wagon.');
  }
  for (const [i, line] of lines.entries()) {
    if (!line.wagonNumber?.trim()) blockers.push(`Wagon ${i + 1} has no wagon number.`);
    if (line.tareTonnes !== null && line.tareTonnes !== undefined && (!Number.isFinite(line.tareTonnes) || line.tareTonnes < 0)) {
      blockers.push(`Wagon ${line.wagonNumber || i + 1}: tare tonnes cannot be negative.`);
    }
    if (line.loadedTonnes !== null && line.loadedTonnes !== undefined && (!Number.isFinite(line.loadedTonnes) || line.loadedTonnes < 0)) {
      blockers.push(`Wagon ${line.wagonNumber || i + 1}: loaded tonnes cannot be negative.`);
    }
  }

  // Dangerous goods: the SAME evaluator the dispatch gate uses, so a manifest can
  // never be issued for a consist the gate would stop.
  const dg = evaluateDangerousGoods(consignment, lines.map((l) => ({ ...l, wagonNumber: l.wagonNumber || `line ${l.position}` })));
  if (dg.required && !dg.ready) {
    blockers.push(`Dangerous goods incomplete: ${dg.summary}`);
  }

  return { ok: blockers.length === 0, blockers, dgSummary: dg.summary };
}
