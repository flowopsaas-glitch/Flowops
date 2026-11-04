import { HttpException } from '@nestjs/common';

// The controller only needs the sentinel's type for DI metadata; the real class
// drags in PrismaClient (and therefore a generated client + engine) into a unit
// test that never touches a database.
jest.mock('../guards/health-sentinel.service', () => ({
  HealthSentinelService: class HealthSentinelService {},
}));

import { PublicHealthController } from './public-health.controller';
import { HealthSentinelService, type HealthProbe } from '../guards/health-sentinel.service';

/**
 * The public health route is the only health URL reachable through the tunnel
 * (nginx proxies `/api/` only), so two things must hold and neither is visible
 * from the route's shape:
 *
 *  1. A degraded API must answer 503, not 200. A monitor reads the status code;
 *     a 200 with `status: "degraded"` in the body is indistinguishable from
 *     healthy to everything that isn't parsing JSON.
 *  2. The body must not carry internal diagnostics. The internal probe reports
 *     heap pressure, disk percentages and failure strings; none of that belongs
 *     on an unauthenticated endpoint.
 */
describe('PublicHealthController', () => {
  const build = (probe: HealthProbe) => {
    const sentinel = { probe: jest.fn().mockResolvedValue(probe) } as unknown as HealthSentinelService;
    return new PublicHealthController(sentinel);
  };

  /** Unwrap the thrown HttpException; the controller returns a body on success. */
  const rejection = async (c: PublicHealthController): Promise<HttpException> => {
    try {
      await c.check();
    } catch (e) {
      return e as HttpException;
    }
    throw new Error('expected the controller to throw');
  };

  const healthy: HealthProbe = {
    status: 'ok',
    db: 'connected',
    uptime: 101447,
    issues: [],
    ts: '2026-11-04T03:29:45.574Z',
  };

  it('answers 200 with status/db/ts when healthy', async () => {
    const body = await build(healthy).check();
    expect(body).toEqual({ status: 'ok', db: 'connected', ts: healthy.ts });
  });

  it('answers 503 when degraded, and still says why in the body', async () => {
    const degraded: HealthProbe = {
      ...healthy,
      status: 'degraded',
      db: 'unreachable',
      issues: ['database unreachable'],
    };
    const call = build(degraded).check();
    await expect(call).rejects.toBeInstanceOf(HttpException);
    await expect(build(degraded).check()).rejects.toMatchObject({ status: 503 });

    // The body survives the exception — a monitor may want the reason.
    const err = await rejection(build(degraded));
    expect(err.getResponse()).toEqual({ status: 'degraded', db: 'unreachable', ts: healthy.ts });
  });

  it('never exposes internal diagnostics', async () => {
    const degraded: HealthProbe = {
      status: 'degraded',
      db: 'unreachable',
      uptime: 101447,
      issues: ['heap 92%', 'disk 85% at /var/lib/docker', 'redis timeout'],
      ts: '2026-11-04T03:29:45.574Z',
    };
    const err = await rejection(build(degraded));
    const serialised = JSON.stringify(err.getResponse());

    expect(serialised).not.toMatch(/heap/i);
    expect(serialised).not.toMatch(/disk/i);
    expect(serialised).not.toMatch(/redis/i);
    expect(serialised).not.toContain('101447');
    expect(Object.keys(err.getResponse() as object).sort()).toEqual(['db', 'status', 'ts']);
  });

  it('never exposes uptime, which reveals when the process last restarted', async () => {
    const body = await build(healthy).check();
    expect(Object.keys(body).sort()).toEqual(['db', 'status', 'ts']);
  });
});
