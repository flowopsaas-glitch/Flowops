import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpsertSsoConfigDto } from './sso.dto';

/**
 * SSO configuration.
 *
 * The service is the strictest in the codebase — it hand-validates every field,
 * rejects the legacy authUrl / tokenUrl / userInfoUrl endpoints outright,
 * requires a public HTTPS issuer from trusted discovery metadata, and encrypts
 * the secret at rest. None of that is duplicated here.
 *
 * What this adds is rejecting the wrong shape before the service's own
 * branches, so the response names the field rather than surfacing one of six
 * possible BadRequestExceptions. `defaultRole` is mirrored deliberately: a bad
 * role is the most likely client mistake, and it is checked in both places.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

const strip = async (payload: Record<string, unknown>) =>
  (await through(UpsertSsoConfigDto, payload)) as unknown as Record<string, unknown>;

describe('upsertConfig', () => {
  it('accepts a full OIDC configuration', async () => {
    const dto = await through(UpsertSsoConfigDto, {
      enabled: true,
      issuer: 'https://accounts.google.com',
      clientId: 'abc-123',
      clientSecret: 'shhh',
      scopes: 'openid email profile',
      allowedDomain: 'acme.co.za',
      autoProvision: true,
      defaultRole: 'DISPATCH',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts a partial update', async () => {
    const dto = await through(UpsertSsoConfigDto, { enabled: false });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('accepts an empty body', async () => {
    // The controller passes `dto ?? {}` and the service merges against the
    // existing row, so an empty body has to be legal.
    const dto = await through(UpsertSsoConfigDto, {});
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a defaultRole that the service would also reject', async () => {
    const dto = await through(UpsertSsoConfigDto, { defaultRole: 'ADMIN' });
    expect(await errorsFor(dto)).toContain('defaultRole');
  });

  it('accepts every role the service allows', async () => {
    for (const role of ['MANAGER', 'DISPATCH', 'WAREHOUSE', 'AGENT', 'USER', 'VIEWER']) {
      const dto = await through(UpsertSsoConfigDto, { defaultRole: role });
      expect(await errorsFor(dto)).toEqual([]);
    }
  });

  it('rejects a non-boolean enabled', async () => {
    const dto = await through(UpsertSsoConfigDto, { enabled: 'true' });
    expect(await errorsFor(dto)).toContain('enabled');
  });

  it('strips server-owned fields', async () => {
    const dto = await strip({
      enabled: true,
      id: 'attacker-id',
      companyId: 'other-tenant',
      provider: 'saml',
      createdAt: '1999-01-01T00:00:00Z',
    });
    expect(dto.enabled).toEqual(true);
    // provider is pinned to 'oidc' by the service, so it is not client input.
    for (const k of ['id', 'companyId', 'provider', 'createdAt']) {
      expect(dto[k]).toBeUndefined();
    }
  });
});
