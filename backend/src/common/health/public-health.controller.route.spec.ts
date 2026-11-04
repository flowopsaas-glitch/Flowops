import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PublicHealthController } from './public-health.controller';
import { GLOBAL_PREFIX_EXCLUDE } from './health-routes';
import { HealthSentinelService } from '../guards/health-sentinel.service';

/**
 * Routing tests for the two health endpoints — an integration test, not a unit
 * test, because the failure mode lives in the router and not in the controller.
 *
 * Both endpoints have passed every controller-level test while being
 * unreachable in production: `/health` is correct but nginx does not proxy it,
 * and the public one did not exist at all. The unit spec can prove the handler's
 * behaviour; only a booted app can prove the path it is bound to.
 *
 * The harness mirrors `main.ts`: same global prefix, same exclude list (imported,
 * not copied), and the real `PublicHealthController`. The internal probe is a
 * stub with the same route shape as `AppController` — importing the real one
 * would drag the whole auth service in for a routing assertion.
 */
@Controller()
class InternalProbeStub {
  @Get('health')
  internal() {
    return { probe: 'internal' };
  }
}

@Module({
  controllers: [InternalProbeStub, PublicHealthController],
  providers: [
    {
      provide: HealthSentinelService,
      useValue: {
        probe: async () => ({
          status: 'ok',
          db: 'connected',
          uptime: 1,
          issues: [],
          ts: '2026-11-04T00:00:00.000Z',
        }),
      },
    },
  ],
})
class RouteCheckModule {}

describe('health route registration', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(RouteCheckModule, { logger: false });
    app.setGlobalPrefix('api/v1', { exclude: [...GLOBAL_PREFIX_EXCLUDE] });
    // Port 0: the OS picks a free port, so parallel CI jobs cannot collide.
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`);
    const body = await res.text();
    return { status: res.status, body };
  };

  it('serves the internal probe on the API root, un-prefixed', async () => {
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body).toContain('internal');
  });

  it('serves the public probe at /api/v1/health — the path nginx proxies', async () => {
    const { status, body } = await get('/api/v1/health');
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      status: 'ok',
      db: 'connected',
      ts: '2026-11-04T00:00:00.000Z',
    });
  });

  it('never double-prefixes the public probe', async () => {
    // If the path is excluded on the wrong string, or not excluded at all, one
    // of these two is where it lands instead.
    expect((await get('/api/v1/api/v1/health')).status).toBe(404);
    expect((await get('/api/v1/health/health')).status).toBe(404);
  });

  it('does not shadow the public probe with the internal one', async () => {
    // The trap: a controller declared as @Controller('health') produces the
    // route path `health`, which the exclude list matches — so it lands on
    // /health beside the internal probe and /api/v1/health stays 404.
    const { body } = await get('/api/v1/health');
    expect(body).not.toContain('internal');
  });
});
