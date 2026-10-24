export type StatusTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'critical';

/**
 * Maps a status string to a tone using the caller's lookup, falling back to
 * `neutral` rather than throwing — an unrecognised status should still render
 * its text, not blank the cell out.
 */
export function statusToneFor(map: Record<string, StatusTone>, status: string): StatusTone {
  return map[status] ?? map[status?.toLowerCase?.()] ?? 'neutral';
}
