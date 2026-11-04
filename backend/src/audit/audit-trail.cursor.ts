import { BadRequestException } from '@nestjs/common';
import type { TrailCursor } from './audit-trail.types';

/**
 * Encode/decode the keyset pagination cursor.
 *
 * Base64url JSON rather than a bare string: the sort key is a pair, and a
 * delimiter-joined cursor breaks the moment an id contains the delimiter. The
 * decoded value is validated rather than trusted — a hand-edited cursor must be
 * a clean 400, not a malformed `where` clause reaching the database.
 */
export function encodeCursor(cursor: TrailCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): TrailCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Malformed cursor.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new BadRequestException('Malformed cursor.');
  }

  const { occurredAt, id } = parsed as Record<string, unknown>;

  if (typeof occurredAt !== 'string' || typeof id !== 'string' || !id) {
    throw new BadRequestException('Malformed cursor.');
  }

  // A cursor is only meaningful as a date; `new Date('nonsense')` is Invalid and
  // would produce an empty page that looks like "no more history".
  const when = new Date(occurredAt);
  if (Number.isNaN(when.getTime())) {
    throw new BadRequestException('Malformed cursor.');
  }

  return { occurredAt: when.toISOString(), id };
}
