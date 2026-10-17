const MIB = 1024 * 1024;

/**
 * Aggregate request-body ceilings for every multipart upload endpoint. These
 * include file bytes, text fields, part headers, and multipart framing; Multer's
 * per-part ceilings remain in place as a second, format-aware boundary.
 */
const MULTIPART_UPLOAD_LIMITS: ReadonlyArray<{ method: string; path: RegExp; bytes: number }> = [
  { method: 'POST', path: /(?:^|\/)rail\/schedules\/import$/, bytes: 26 * MIB },
  { method: 'POST', path: /(?:^|\/)owner\/rail\/schedules\/import$/, bytes: 26 * MIB },
  { method: 'POST', path: /(?:^|\/)email-hub\/(?:send|ingest)$/, bytes: 26 * MIB },
  { method: 'POST', path: /(?:^|\/)waybills\/[^/]+\/deliver$/, bytes: 15 * MIB },
  { method: 'POST', path: /(?:^|\/)waybills\/inbox\/upload$/, bytes: 11 * MIB },
  { method: 'POST', path: /(?:^|\/)companies\/[^/]+\/logo$/, bytes: 3 * MIB },
  { method: 'POST', path: /(?:^|\/)waybills\/bulk-import$/, bytes: 6 * MIB },
];

/** Return the hard aggregate byte cap for a supported multipart upload route. */
export function multipartUploadByteLimit(method: string, path: string): number | null {
  const normalizedMethod = String(method ?? '').toUpperCase();
  const normalizedPath = String(path ?? '').split('?', 1)[0];
  return MULTIPART_UPLOAD_LIMITS.find(
    (entry) => entry.method === normalizedMethod && entry.path.test(normalizedPath),
  )?.bytes ?? null;
}
