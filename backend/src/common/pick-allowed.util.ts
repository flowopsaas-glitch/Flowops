/**
 * Mass-assignment guard — FlowOps™
 *
 * Several create/update endpoints historically accepted `@Body() body: any` and
 * spread it straight into Prisma (`data: { ...dto }`). Because `companyId` was
 * set last it could not be overridden (no tenant leak), but a client could
 * still set columns it should never control (e.g. `id`, `createdAt`, internal
 * status/score fields). `pickAllowed` whitelists exactly the fields a client is
 * permitted to write, dropping everything else.
 *
 * Usage:
 *   const data = pickAllowed(dto, ['recipientName', 'recipientAddress', ...]);
 *   prisma.model.create({ data: { ...data, companyId } });
 */
export function pickAllowed<T extends Record<string, any>>(
  input: T | null | undefined,
  allowed: readonly string[],
): Partial<T> {
  const out: Partial<T> = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
      (out as any)[key] = input[key];
    }
  }
  return out;
}
