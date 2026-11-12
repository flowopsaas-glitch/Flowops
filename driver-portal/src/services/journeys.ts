// Journeys — the driver's side.
//
// A journey is the ordered set of planned stages a driver is running: border,
// clearing, bond, linehaul, empty return. The driver's job is to keep dispatch
// informed as they move through it, and the one thing that must never happen is
// losing what they said.
//
// The design here is built around one observation: the moment a driver needs to
// report against a journey is disproportionately the moment they have no signal.
// A delay is reported from a queue at a border post; an incident is reported
// from the hard shoulder. So every read is cached for offline use, and every
// write is durable before it is attempted.
//
// IDEMPOTENCY, AND WHY THE KEY LIVES IN THE BODY
//
// The outbox (syncEngine) sends `X-Idempotency-Key` as a header, and that is
// honoured by some endpoints -- but NOT by the journey update endpoint. It
// dedupes on `clientMessageId` in the request body. So a journey update queued
// the naive way would, on a replay after a lost response, create a SECOND
// update reporting the same delay. We therefore generate the key ourselves and
// freeze it into the body, so the queued copy and the replayed copy are
// byte-identical and the database's unique index collapses them into one.
//
// PROVENANCE
//
// `deviceOccurredAt` is stamped when the driver taps send, not when the write
// finally reaches the server. An update queued at 14:00 in a dead zone and
// flushed at 16:00 must still say 14:00 -- that gap is the whole point of
// recording both clocks, and collapsing it would quietly rewrite the timeline.
// It is frozen into the body for the same reason as the key: a value recomputed
// at flush time would be a lie.

import api from './api';
import {
  cacheJourneys, getCachedJourneys, getPendingMutations, newId, queueMutation,
  type PendingMutation,
} from './offlineDB';

export type JourneyStageStatus = 'PLANNED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
export type JourneyStageType = 'BORDER' | 'CLEARING' | 'BOND' | 'EMPTY_RETURN' | 'LINEHAUL';
export type JourneyStatus = 'PLANNED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
export type JourneyUpdateType =
  | 'ETA_CHANGE' | 'DELAY_REPORT' | 'INCIDENT_REPORT' | 'PROOF_OF_DELIVERY' | 'GENERAL_NOTE';

export type JourneyStage = {
  id: string;
  stageNumber: number;
  type: JourneyStageType;
  locationName: string | null;
  plannedAt: string | null;
  status: JourneyStageStatus;
};

export type DriverJourney = {
  id: string;
  reference: string;
  origin: string | null;
  destination: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  status: JourneyStatus;
  createdAt: string;
  stages: JourneyStage[];
  _count?: { updates: number };
};

/**
 * True when a failed request never got an answer from the server.
 *
 * Only this is safe to retry later. A 4xx is the server saying "no", and
 * queuing it would be storing a write we already know will be refused.
 */
export function isNetworkError(err: any): boolean {
  if (!navigator.onLine) return true;
  const status = err?.status ?? err?.response?.status;
  return status == null;
}

/**
 * The driver's journeys, newest first.
 *
 * Network first; if that fails for any reason we serve the cached copy rather
 * than an empty screen, because "no journeys" and "no signal" look identical
 * to a driver unless we say which one it is.
 */
export async function loadJourneys(): Promise<{ journeys: DriverJourney[]; fromCache: boolean }> {
  try {
    const data = await api.get<DriverJourney[]>('/driver-portal/journeys');
    const journeys = Array.isArray(data) ? data : [];
    void cacheJourneys(journeys);
    return { journeys, fromCache: false };
  } catch {
    return { journeys: (await getCachedJourneys()) as DriverJourney[], fromCache: true };
  }
}

export type SendResult =
  /** The server accepted it and the driver can be shown a plain confirmation. */
  | { state: 'sent'; clientMessageId: string }
  /** Stored on the device; it will upload by itself when signal returns. */
  | { state: 'queued'; clientMessageId: string };

/**
 * Report against a journey, durably.
 *
 * The update is written to the outbox BEFORE we try the network when offline,
 * and immediately after a failed attempt when the attempt was a connectivity
 * problem. Either way the driver gets told it is saved, not that it failed.
 *
 * Throws only when the server gave a definite refusal (bad stage, not assigned
 * to this journey) -- a case retrying cannot fix, and which the driver needs to
 * see rather than have silently stored.
 */
export async function sendJourneyUpdate(input: {
  journeyId: string;
  type: JourneyUpdateType;
  message: string;
  stageId?: string | null;
}): Promise<SendResult> {
  const message = input.message.trim();
  if (!message) throw new Error('Enter a message to send to dispatch.');

  // Frozen at the moment of the tap. See the provenance note at the top.
  const clientMessageId = newId();
  const deviceOccurredAt = new Date().toISOString();

  const body = {
    type: input.type,
    message,
    clientMessageId,
    deviceOccurredAt,
    ...(input.stageId ? { stageId: input.stageId } : {}),
  };

  if (!navigator.onLine) {
    await queueMutation('journey-update', `/driver-portal/journeys/${input.journeyId}/updates`, body);
    return { state: 'queued', clientMessageId };
  }

  try {
    await api.post(`/driver-portal/journeys/${input.journeyId}/updates`, body);
    return { state: 'sent', clientMessageId };
  } catch (err: any) {
    if (!isNetworkError(err)) throw err; // a real refusal — surface it
    // The request may or may not have reached the server. Queueing it is safe
    // precisely because clientMessageId is fixed: if it did land, the replay
    // finds the existing row and returns it instead of duplicating.
    await queueMutation('journey-update', `/driver-portal/journeys/${input.journeyId}/updates`, body);
    return { state: 'queued', clientMessageId };
  }
}

export type PendingJourneyUpdate = {
  clientMessageId: string;
  journeyId: string;
  type: JourneyUpdateType;
  message: string;
  deviceOccurredAt: string | null;
  stageId: string | null;
  /** 'sending' once a flush has this row in flight is unknowable; see below. */
  attempts: number;
};

/**
 * Updates for one journey that have not been confirmed by the server yet.
 *
 * These are shown inline in the timeline so a driver who reports a delay and
 * then loses signal can still see that they reported it. Without this, the
 * update vanishes from their screen the moment they hit send and only
 * reappears minutes later -- which reads exactly like a bug that lost it.
 */
export async function pendingUpdatesFor(journeyId: string): Promise<PendingJourneyUpdate[]> {
  const all = await getPendingMutations();
  return all
    .filter((m) => m.kind === 'journey-update')
    .filter((m) => m.url.endsWith(`/journeys/${journeyId}/updates`))
    .map((m) => ({
      clientMessageId: m.body?.clientMessageId ?? m.id,
      journeyId,
      type: (m.body?.type ?? 'GENERAL_NOTE') as JourneyUpdateType,
      message: String(m.body?.message ?? ''),
      deviceOccurredAt: (m.body?.deviceOccurredAt as string) ?? null,
      stageId: (m.body?.stageId as string) ?? null,
      attempts: m.attempts ?? 0,
    }));
}

/** How many journey updates are still waiting, across all journeys. */
export async function countPendingUpdates(): Promise<number> {
  return (await getPendingMutations()).filter((m) => m.kind === 'journey-update').length;
}

/**
 * Human-readable stage progress, e.g. "2 of 5 stages done".
 *
 * Cancelled stages are excluded from the denominator: a journey where one leg
 * was scrubbed should not read as permanently 4/5.
 */
export function stageProgress(journey: DriverJourney): { done: number; total: number } {
  const live = (journey.stages ?? []).filter((s) => s.status !== 'CANCELLED');
  return { done: live.filter((s) => s.status === 'COMPLETED').length, total: live.length };
}

/**
 * The next stage the driver is actually working towards.
 *
 * Deliberately not "the first incomplete one": if a stage is IN_TRANSIT that is
 * what they are doing now, even if an earlier stage was skipped and left
 * PLANNED. Returning the skipped one would point the driver backwards.
 */
export function currentStage(journey: DriverJourney): JourneyStage | null {
  const stages = [...(journey.stages ?? [])].sort((a, b) => a.stageNumber - b.stageNumber);
  return (
    stages.find((s) => s.status === 'IN_TRANSIT') ??
    stages.find((s) => s.status === 'PLANNED') ??
    null
  );
}

/**
 * What each stage type is called on screen.
 *
 * Lives with the types rather than in a page so that no screen has to import
 * another screen to learn the domain's vocabulary.
 */
export const STAGE_LABEL: Record<string, string> = {
  BORDER: 'Border',
  CLEARING: 'Clearing',
  BOND: 'Bond',
  EMPTY_RETURN: 'Empty return',
  LINEHAUL: 'Linehaul',
};

/** Re-exported so the UI can reason about a row without importing offlineDB. */
export type { PendingMutation };
