import { api } from "./client";

/**
 * Notification preferences live on the current user (resolved from the bearer
 * token by the backend), not on the tenant — distinct from `companiesApi.ts`.
 *
 * The shape is intentionally flat-ish: a small set of channels (email/sms/push)
 * crossed with a small set of categories. Backend storage is expected to be a
 * single JSONB column on the user, so partial PATCHes overwrite their
 * top-level field.
 */

export type NotificationChannel = "email" | "sms" | "push";

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  "email",
  "sms",
  "push",
] as const;

export const NOTIFICATION_CATEGORIES = [
  "operations",
  "billing",
  "security",
  "system",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type EmailDigestFrequency = "off" | "daily" | "weekly";

export type CategoryPreferences = {
  /** Master switch for the whole category. Disables every channel cell when false. */
  enabled: boolean;
  /** Per-channel opt-in. Final delivery requires both this AND the top-level `channels[X]`. */
  channels: Record<NotificationChannel, boolean>;
};

export type QuietHours = {
  enabled: boolean;
  /** "HH:MM" 24-hour. Inclusive. */
  startsAt: string;
  /** "HH:MM" 24-hour. Exclusive. May be earlier than startsAt to mean "overnight". */
  endsAt: string;
  /** IANA timezone, e.g. "Africa/Johannesburg". */
  timezone: string;
};

export type NotificationPreferences = {
  /** Master per-channel switches. If `email` is false, no email is delivered regardless of category. */
  channels: Record<NotificationChannel, boolean>;
  categories: Record<NotificationCategory, CategoryPreferences>;
  emailDigest: EmailDigestFrequency;
  quietHours: QuietHours;
};

export type UpdateMyNotificationPreferencesPayload =
  Partial<NotificationPreferences>;

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Defaults applied when the backend returns nothing or partial data. Picked to
 * be useful out of the box for a logistics tenant: email + push on, SMS only
 * for security events.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: { email: true, sms: false, push: true },
  categories: {
    operations: {
      enabled: true,
      channels: { email: true, sms: false, push: true },
    },
    billing: {
      enabled: true,
      channels: { email: true, sms: false, push: false },
    },
    security: {
      enabled: true,
      channels: { email: true, sms: true, push: true },
    },
    system: {
      enabled: true,
      channels: { email: true, sms: false, push: false },
    },
  },
  emailDigest: "off",
  quietHours: {
    enabled: false,
    startsAt: "21:00",
    endsAt: "07:00",
    timezone: detectTimezone(),
  },
};

function mergeChannels(
  partial: Partial<Record<NotificationChannel, boolean>> | undefined,
  defaults: Record<NotificationChannel, boolean>,
): Record<NotificationChannel, boolean> {
  return {
    email: partial?.email ?? defaults.email,
    sms: partial?.sms ?? defaults.sms,
    push: partial?.push ?? defaults.push,
  };
}

function mergeCategories(
  partial:
    | Partial<Record<NotificationCategory, Partial<CategoryPreferences>>>
    | undefined,
): Record<NotificationCategory, CategoryPreferences> {
  const result = {} as Record<NotificationCategory, CategoryPreferences>;
  for (const cat of NOTIFICATION_CATEGORIES) {
    const incoming = partial?.[cat];
    const def = DEFAULT_NOTIFICATION_PREFERENCES.categories[cat];
    result[cat] = {
      enabled: incoming?.enabled ?? def.enabled,
      channels: mergeChannels(incoming?.channels, def.channels),
    };
  }
  return result;
}

function mergeWithDefaults(
  partial: Partial<NotificationPreferences> | null | undefined,
): NotificationPreferences {
  if (!partial) return DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    channels: mergeChannels(
      partial.channels,
      DEFAULT_NOTIFICATION_PREFERENCES.channels,
    ),
    categories: mergeCategories(partial.categories),
    emailDigest:
      partial.emailDigest ?? DEFAULT_NOTIFICATION_PREFERENCES.emailDigest,
    quietHours: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.quietHours,
      ...(partial.quietHours ?? {}),
    },
  };
}

/** Load the current user's notification preferences. Falls back to defaults if the backend returns nothing. */
export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await api.get<Partial<NotificationPreferences> | null>(
    "/me/notification-preferences",
  );
  return mergeWithDefaults(res.data);
}

/**
 * Updates the current user's notification preferences. Accepts a partial — only
 * top-level fields included in `payload` are touched. Returns the resolved
 * (defaults-merged) preferences after save.
 */
export async function updateMyNotificationPreferences(
  payload: UpdateMyNotificationPreferencesPayload,
): Promise<NotificationPreferences> {
  const res = await api.patch<Partial<NotificationPreferences>>(
    "/me/notification-preferences",
    payload,
  );
  return mergeWithDefaults(res.data);
}
