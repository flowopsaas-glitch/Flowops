import { BadRequestException, ConflictException } from '@nestjs/common';

/** Canonicalise a client-generated UUID; never accept unbounded or malformed keys. */
export function chatMessageKey(value: unknown): string | undefined {
  if (value === undefined) return undefined; // Legacy clients may omit the key.
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException('clientMessageId must be a UUID v4');
  }
  return value.toLowerCase();
}

type ChatPayload = { message: string; senderType: string; attachmentUrl?: string | null; attachmentType?: string | null };

/** Only return the original row for a genuinely identical retry. */
export function verifyChatRetry<T extends ChatPayload>(existing: T, incoming: ChatPayload): T {
  if (existing.message !== incoming.message || existing.senderType !== incoming.senderType ||
      (existing.attachmentUrl ?? null) !== (incoming.attachmentUrl ?? null) ||
      (existing.attachmentType ?? null) !== (incoming.attachmentType ?? null)) {
    throw new ConflictException('clientMessageId was already used for a different message');
  }
  return existing;
}
