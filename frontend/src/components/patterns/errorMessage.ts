/** Errors arrive as Error objects, strings, fetch responses and plain objects. */
export function errorMessageOf(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    // Axios-style: error.response.data.message is the useful part.
    const data = e.response as Record<string, unknown> | undefined;
    const payload = (data?.data ?? e.data) as Record<string, unknown> | undefined;
    for (const candidate of [payload?.message, e.message, e.error, e.detail]) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
