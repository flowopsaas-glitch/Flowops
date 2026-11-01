import { BadRequestException, ConflictException } from '@nestjs/common';
import { chatMessageKey, verifyChatRetry } from './chat-idempotency';

describe('driver chat retry contract', () => {
  const key = '0c8575cb-5f06-43e7-8a32-78124ccab528';
  const message = { message: 'Delayed', senderType: 'driver', attachmentUrl: null, attachmentType: null };

  it('accepts optional UUID v4 keys and canonicalises case', () => {
    expect(chatMessageKey(undefined)).toBeUndefined();
    expect(chatMessageKey(key.toUpperCase())).toBe(key);
  });

  it.each([null, '', 'not-a-uuid', '0c8575cb-5f06-13e7-8a32-78124ccab528', 12])('rejects malformed key %s', (value) => {
    expect(() => chatMessageKey(value)).toThrow(BadRequestException);
  });

  it('returns the existing row only for the same message and attachments', () => {
    expect(verifyChatRetry(message, { message: 'Delayed', senderType: 'driver' })).toBe(message);
    expect(() => verifyChatRetry(message, { ...message, message: 'Changed' })).toThrow(ConflictException);
    expect(() => verifyChatRetry(message, { ...message, senderType: 'dispatch' })).toThrow(ConflictException);
    expect(() => verifyChatRetry(message, { ...message, attachmentUrl: 'another' })).toThrow(ConflictException);
    expect(() => verifyChatRetry(message, { ...message, attachmentType: 'image' })).toThrow(ConflictException);
  });
});
