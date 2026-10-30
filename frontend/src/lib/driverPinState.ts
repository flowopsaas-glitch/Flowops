/**
 * The drivers screen shows a "PIN SET" / "NO PIN" badge and a Clear button.
 * They used to be driven by `!!driver.driverPin` - i.e. by the presence, in the
 * API response, of the bcrypt hash of the driver's 4-6 digit portal PIN.
 *
 * The API no longer returns that hash (backend `drivers.service.ts` →
 * `withoutDriverSecrets`); it returns a derived `hasPinSet` boolean, the same
 * pattern the rest of the codebase uses for credentials (`clientSecretSet` for
 * SSO, `hasSecret` for customs EDI, `secretsSet` for integrations). This module
 * is the single place that decides the badge, so the hash is never needed - and
 * never kept - in component state.
 */

/** Raw driver shape as `GET /drivers` returns it. */
export type RawDriverPinRow = {
  id: string | number;
  name?: string | null;
  phone?: string | null;
  vehicleReg?: string | null;
  /** Derived flag the API sends instead of the credential itself. */
  hasPinSet?: boolean | null;
  /**
   * Legacy: the hashed portal PIN. Only read as a fallback for an older API
   * during a rolling deploy, and never stored or displayed.
   */
  driverPin?: string | null;
};

/** The row the drivers screen holds in state. No credential material. */
export type DriverPinRow = {
  id: string;
  name: string;
  phone?: string;
  vehicleReg?: string;
  hasPinSet: boolean;
};

/**
 * Does this driver have a portal PIN?
 *
 * An explicit `hasPinSet` from the API always wins - it is the only source that
 * knows the current stored state. The `driverPin` fallback covers the window
 * where an older API is still serving the hash and no flag.
 */
export function driverHasPinSet(raw: RawDriverPinRow | null | undefined): boolean {
  if (typeof raw?.hasPinSet === 'boolean') return raw.hasPinSet;
  return Boolean(raw?.driverPin);
}

export function toDriverPinRow(raw: RawDriverPinRow): DriverPinRow {
  return {
    id: String(raw?.id ?? ''),
    name: raw?.name || 'Driver',
    phone: raw?.phone ?? undefined,
    vehicleReg: raw?.vehicleReg ?? undefined,
    hasPinSet: driverHasPinSet(raw),
  };
}
