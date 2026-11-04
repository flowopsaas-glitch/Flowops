import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthSentinelService } from '../guards/health-sentinel.service';
import { Public } from '../decorators/public.decorator';

/**
 * Public health endpoint — the only one reachable through the ingress.
 *
 * Why this exists separately from `GET /health`:
 *
 * `/health` is excluded from the `api/v1` global prefix (see main.ts) so it
 * answers on the API's own root. nginx only proxies `/api/` and `/socket.io/`,
 * so `/health` is reachable inside the compose network and nowhere else. Every
 * existing consumer — the Dockerfile HEALTHCHECK, the compose healthcheck, the
 * deploy script, CI — talks to it over `localhost:3000`, which is why nobody
 * noticed it was invisible from outside.
 *
 * The trap that made it urgent: nginx's SPA fallback is `try_files $uri $uri/
 * /index.html`, so `https://<domain>/health` returns **index.html with a 200**.
 * A monitor pointed at the "obvious" URL would report the site up forever, even
 * with the API dead. This route fixes that by existing where the proxy already
 * sends traffic.
 *
 * The response is deliberately narrower than the internal one: `status`, `db`
 * and a timestamp. The internal probe's `issues` array carries operational
 * detail (heap pressure, disk percentages, sentinel failure strings) that has no
 * business on the public internet, and `uptime` is omitted for the same reason —
 * it tells an attacker when the process last restarted.
 */
@ApiTags('Health')
@Controller('api/v1/health') // full path + an exclude entry — see health-routes.ts for why
@SkipThrottle() // monitoring must never be rate-limited out
export class PublicHealthController {
  constructor(private readonly healthSentinel: HealthSentinelService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public liveness probe (200 ok / 503 degraded)' })
  async check() {
    const probe = await this.healthSentinel.probe();

    const body = {
      status: probe.status,
      db: probe.db,
      ts: probe.ts,
    };

    // The status code is the whole point of a probe. Returning 200 with
    // `status: "degraded"` in the body — which the internal route does — forces
    // every monitor to parse JSON to notice an outage. A monitor that only reads
    // the status code is the normal case, so answer in the status code.
    if (probe.status !== 'ok') {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return body;
  }
}
