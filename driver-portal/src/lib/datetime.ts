// Reading times the way a driver reads them.
//
// Two rules drive everything here. First, a null or unparseable time is shown
// as an em dash, never as "Invalid Date" and never as 1970 — a driver glancing
// at a screen in a cab has to be able to trust that what is printed is real.
// Second, dates are only shown when they are not today: "14:00" is what a
// driver wants for a stage due in an hour, and the year is noise.

const EM_DASH = '—';

function parse(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "14:05" — no date, no seconds, no timezone. */
export function formatTime(value: string | null | undefined): string {
  const d = parse(value);
  if (!d) return EM_DASH;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "14:05" for today, else "20 Nov 14:05". */
export function formatWhen(value: string | null | undefined, now: Date = new Date()): string {
  const d = parse(value);
  if (!d) return EM_DASH;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return formatTime(value);
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${formatTime(value)}`;
}

/**
 * How long ago, in the words a driver would use.
 *
 * Used for unsynced updates: "waiting 4 min" tells them the app has not
 * forgotten, which is the difference between trusting it and resending.
 */
export function formatAgo(value: string | null | undefined, now: Date = new Date()): string {
  const d = parse(value);
  if (!d) return '';
  const seconds = Math.round((now.getTime() - d.getTime()) / 1000);
  if (seconds < 0) return 'just now'; // clock skew — never show a negative wait
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  return `${Math.round(hours / 24)} d`;
}

/** "08:00 – 16:30", or just the start if there is no end. */
export function formatWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  now: Date = new Date(),
): string {
  const s = parse(start) ? formatWhen(start, now) : null;
  const e = parse(end) ? formatWhen(end, now) : null;
  if (s && e) return `${s} – ${e}`;
  return s ?? e ?? EM_DASH;
}
