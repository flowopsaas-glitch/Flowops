import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUserDto, UpdateUserDto } from './user.dto';

/**
 * User bodies.
 *
 * `create` and `update` build their Prisma writes field by field, so this was
 * not mass-assignable. The gaps were `permissions` accepted as any JSON at all
 * (stored on the user row, unbounded), `password` with no length bound — it is
 * bcrypt-hashed at cost 12, so an unbounded string is a CPU-cost lever — and
 * `role` validated three layers down rather than at the edge.
 */

/** Mirrors the global pipe: whitelist on, forbidNonWhitelisted off. */
const through = async <T extends object>(cls: new () => T, payload: Record<string, unknown>) => {
  const dto = plainToInstance(cls, payload) as T;
  await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return dto;
};

const errorsFor = async (obj: object) => (await validate(obj)).map((e) => e.property);

const strip = async (cls: new () => object, payload: Record<string, unknown>) =>
  (await through(cls, payload)) as unknown as Record<string, unknown>;

describe('create', () => {
  it('accepts an email-only user (the service derives a name and password)', async () => {
    const dto = await through(CreateUserDto, { email: 'jane@acme.co.za' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('rejects a malformed email', async () => {
    const dto = await through(CreateUserDto, { email: 'not-an-email' });
    expect(await errorsFor(dto)).toContain('email');
  });

  it('rejects a short password', async () => {
    const dto = await through(CreateUserDto, { email: 'jane@acme.co.za', password: 'abc' });
    expect(await errorsFor(dto)).toContain('password');
  });

  it('rejects a password past what bcrypt can use', async () => {
    // bcrypt silently ignores everything past 72 bytes, so a longer password
    // buys nothing and costs hashing time on every login.
    const dto = await through(CreateUserDto, {
      email: 'jane@acme.co.za',
      password: 'x'.repeat(500),
    });
    expect(await errorsFor(dto)).toContain('password');
  });

  it('rejects a role outside the enum', async () => {
    const dto = await through(CreateUserDto, { email: 'jane@acme.co.za', role: 'SUPERUSER' });
    expect(await errorsFor(dto)).toContain('role');
  });

  it('rejects permissions that are not an array of strings', async () => {
    // An object here is a Prisma error; a huge array is an unbounded blob on
    // the user row.
    const dto = await through(CreateUserDto, {
      email: 'jane@acme.co.za',
      permissions: { everything: true },
    });
    expect(await errorsFor(dto)).toContain('permissions');
  });
});

describe('update', () => {
  it('accepts a deactivation', async () => {
    const dto = await through(UpdateUserDto, { isActive: false });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('refuses to let a caller set email, passwordHash or companyId', async () => {
    // The service's update builds `data` from an explicit key list that has no
    // email or passwordHash in it — this asserts the edge agrees.
    const dto = await strip(UpdateUserDto, {
      name: 'Jane',
      email: 'attacker@evil.test',
      passwordHash: 'already-hashed',
      companyId: 'other-tenant',
      id: 'attacker-id',
    });
    expect(dto.name).toEqual('Jane');
    for (const k of ['email', 'passwordHash', 'companyId', 'id']) {
      expect(dto[k]).toBeUndefined();
    }
  });

  it('rejects a role outside the enum', async () => {
    const dto = await through(UpdateUserDto, { role: 'GODMODE' });
    expect(await errorsFor(dto)).toContain('role');
  });
});
