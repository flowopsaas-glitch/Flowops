import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdatePreferencesDto } from './notification.dto';

/**
 * Notification preferences — the last raw spread in the module:
 *
 *     upsert({
 *       update: { ...dto, updatedAt: new Date() },
 *       create: { userId, ...dto },
 *     })
 *
 * `updatedAt` is overwritten on the update branch, but nothing stopped a caller
 * setting it on the create branch, and `id` was writable on both. The row is
 * keyed by userId and upserted, so a client-chosen id on create collides with
 * an existing row: one user's preferences silently fail to save, or another
 * user's row is the one that comes back.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

const strip = async (payload: Record<string, unknown>) =>
  (await through(UpdatePreferencesDto, payload)) as unknown as Record<string, unknown>;

describe('updatePreferences', () => {
  it('accepts a single toggle', async () => {
    const dto = await through(UpdatePreferencesDto, { emailEnabled: false });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts a full preferences object', async () => {
    const dto = await through(UpdatePreferencesDto, {
      emailEnabled: true,
      smsEnabled: true,
      pushEnabled: false,
      operationsEmail: true,
      operationsSms: true,
      operationsPush: false,
      billingEmail: true,
      billingPush: false,
      securityEmail: true,
      securityPush: true,
      systemEmail: false,
      systemPush: false,
      digestFrequency: 'DAILY',
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      timezone: 'Africa/Johannesburg',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('refuses to let a caller set id, userId or timestamps', async () => {
    const dto = await strip({
      emailEnabled: true,
      id: 'attacker-id',
      userId: 'someone-elses-user',
      createdAt: '1999-01-01T00:00:00Z',
      updatedAt: '1999-01-01T00:00:00Z',
    });
    expect(dto.emailEnabled).toEqual(true);
    for (const k of ['id', 'userId', 'createdAt', 'updatedAt']) {
      expect(dto[k]).toBeUndefined();
    }
  });

  it('rejects a digest frequency outside the enum', async () => {
    const dto = await through(UpdatePreferencesDto, { digestFrequency: 'HOURLY' });
    expect(await errorsFor(dto)).toContain('digestFrequency');
  });

  it('rejects a quiet-hours start that is not HH:MM', async () => {
    // Stored as text and compared as text, so a malformed value silently stops
    // quiet hours from ever matching.
    const dto = await through(UpdatePreferencesDto, { quietHoursStart: '10pm' });
    expect(await errorsFor(dto)).toContain('quietHoursStart');
  });

  it('rejects an impossible time', async () => {
    const dto = await through(UpdatePreferencesDto, { quietHoursEnd: '27:00' });
    expect(await errorsFor(dto)).toContain('quietHoursEnd');
  });

  it('rejects a non-boolean toggle', async () => {
    const dto = await through(UpdatePreferencesDto, { emailEnabled: 'yes' });
    expect(await errorsFor(dto)).toContain('emailEnabled');
  });
});
