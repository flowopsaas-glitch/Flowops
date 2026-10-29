/**
 * Interpreting the answer to a gate-window confirmation.
 *
 * A driver's confirmation can end four ways, and three of them are NOT a
 * confirmation. This module turns whatever the sync path produced into one of
 * those outcomes with the words the driver should see, so the UI cannot
 * accidentally render a refusal as a success — the failure mode that matters
 * here is a driver who confirmed a window offline, arrived at a terminal that
 * had since moved it, and believes the old time is still agreed.
 *
 * Deliberately free of React, storage and network so it can be tested directly:
 * the offline conflict case (acked v1 offline → v2 published → sync returns 409
 * SUPERSEDED) is the one that has to be provably correct.
 */

export type WindowAckOutcomeKind =
  /** The server recorded the confirmation. */
  | 'CONFIRMED'
  /** The version confirmed no longer exists; a newer window is in force. */
  | 'SUPERSEDED'
  /** The server refused for another permanent reason (not this driver, bad request). */
  | 'REFUSED'
  /** No answer yet: offline, timeout, 5xx, dead session. Still pending. */
  | 'PENDING_SYNC';

export interface WindowAckOutcome {
  kind: WindowAckOutcomeKind;
  /** True only for CONFIRMED. Nothing else may be shown as a success. */
  confirmed: boolean;
  /** Headline for the driver. */
  title: string;
  /** The server's own words where there are any — never a paraphrase of a refusal. */
  detail: string | null;
  /** For SUPERSEDED: the version that is actually current, when the server told us. */
  activeVersion: number | null;
  /** Whether the write is still queued and will be retried. */
  retryable: boolean;
  httpStatus: number | null;
  code: string | null;
}

/** Anything the sync path can hand us: an axios-shaped error, a rejection row, or null. */
export interface AckFailureLike {
  status?: number | null;
  code?: string | null;
  message?: string | null;
  activeVersion?: number | null;
  /** A stored outbox refusal can be passed through as-is, `at` included. */
  rejection?: {
    status?: number | null;
    code?: string | null;
    message?: string;
    activeVersion?: number | null;
    at?: number | null;
  } | null;
}

const PENDING: WindowAckOutcome = {
  kind: 'PENDING_SYNC',
  confirmed: false,
  title: 'PENDING SYNC',
  detail: 'Your confirmation is queued on this device and will be sent when you are back online. '
    + 'It is NOT confirmed yet — the terminal has not received it.',
  activeVersion: null,
  retryable: true,
  httpStatus: null,
  code: null,
};

export function confirmedOutcome(opts: {
  ackedAt?: string | null;
  ackDeviceAt?: string | null;
  version?: number | null;
  idempotentReplay?: boolean;
} = {}): WindowAckOutcome {
  return {
    kind: 'CONFIRMED',
    confirmed: true,
    title: opts.idempotentReplay ? 'Already confirmed' : 'Confirmed',
    detail: null,
    activeVersion: opts.version ?? null,
    retryable: false,
    httpStatus: null,
    code: null,
  };
}

/** No answer at all (offline, or a queued write that has not been sent yet). */
export function pendingSyncOutcome(): WindowAckOutcome {
  return PENDING;
}

/**
 * Classify a permanent or transient failure.
 *
 * `SUPERSEDED` is detected from the server's code when it is present, and from
 * the 409 status otherwise — a client that has to guess from prose will
 * eventually guess wrong, so the backend sends `code: 'SUPERSEDED'` in the body.
 */
export function interpretAckFailure(err: AckFailureLike | null | undefined): WindowAckOutcome {
  const rejection = err?.rejection ?? null;
  const status = rejection?.status ?? err?.status ?? null;
  const code = rejection?.code ?? err?.code ?? null;
  const message = rejection?.message ?? err?.message ?? null;
  const activeVersion = rejection?.activeVersion ?? err?.activeVersion ?? null;

  // No status means the request never got an answer: still pending, still honest.
  if (status == null) {
    return { ...PENDING, detail: message ? `${PENDING.detail} (${message})` : PENDING.detail };
  }

  const superseded = code === 'SUPERSEDED'
    || (status === 409 && !!message && /superseded/i.test(message));

  if (superseded) {
    return {
      kind: 'SUPERSEDED',
      confirmed: false,
      title: 'NOT CONFIRMED — that window changed again',
      detail: message ?? 'The version you confirmed was superseded by a newer window change.',
      activeVersion,
      retryable: false,
      httpStatus: status,
      code: code ?? 'SUPERSEDED',
    };
  }

  if (status === 404) {
    return {
      kind: 'REFUSED',
      confirmed: false,
      title: 'NOT CONFIRMED — this change is not yours',
      detail: message ?? 'The server does not have this window change for your driver record.',
      activeVersion: null,
      retryable: false,
      httpStatus: status,
      code,
    };
  }

  if (status === 400 || status === 409 || status === 422) {
    return {
      kind: 'REFUSED',
      confirmed: false,
      title: 'NOT CONFIRMED',
      detail: message ?? 'The server refused this confirmation.',
      activeVersion,
      retryable: false,
      httpStatus: status,
      code,
    };
  }

  // 401 (session dead) and 5xx: the write is kept and retried, so it is pending.
  return {
    ...PENDING,
    detail: `${PENDING.detail} Last attempt: ${message ?? `HTTP ${status}`}.`,
    httpStatus: status,
    code,
  };
}

/**
 * The two timestamps of a confirmation, kept apart and labelled.
 *
 * `ackedAt` is what the SERVER observed and is the only value any measurement
 * uses. `ackDeviceAt` is what the device claimed when the driver tapped, which
 * for an offline flush can be hours earlier. Showing one as the other is how a
 * driver ends up credited with confirming before they could have known.
 */
export function ackTimestamps(input: {
  ackedAt?: string | null;
  ackDeviceAt?: string | null;
}): { server: string; device: string | null; offlineFlush: boolean } {
  const fmt = (iso: string) => new Date(iso).toLocaleString();
  const server = input.ackedAt ? fmt(input.ackedAt) : 'not recorded';
  const device = input.ackDeviceAt ? fmt(input.ackDeviceAt) : null;
  return { server, device, offlineFlush: !!input.ackDeviceAt };
}
