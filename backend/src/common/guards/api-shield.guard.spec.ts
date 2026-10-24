import { ExecutionContext, HttpException } from '@nestjs/common';
import { ApiShieldGuard } from './api-shield.guard';

/**
 * Pins ApiShieldGuard detection behaviour in BOTH directions.
 *
 * - Attack corpus: each payload must be rejected (400/413).
 * - Legitimate-logistics corpus: real FlowOps-shaped payload prose — waybill
 *   notes, addresses, commodity lines, operator shorthand — must pass.
 *
 * The legitimate corpus is drawn from actual product vocabulary ("select
 * reefer from the yard", "and/or", "O'Brien", "OR Tambo", "R&D"). Extend it
 * with samples from real traffic before changing any pattern: the standing
 * decision is that tightening must never 400 legitimate logistics text and
 * loosening must not drop a pinned attack case.
 */
describe('ApiShieldGuard', () => {
  let guard: ApiShieldGuard;

  beforeEach(() => {
    guard = new ApiShieldGuard();
  });

  function run(opts: {
    method?: string;
    path?: string;
    body?: unknown;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
  }): () => boolean {
    const request = {
      method: opts.method ?? 'POST',
      path: opts.path ?? '/api/v1/waybills',
      originalUrl: opts.path ?? '/api/v1/waybills',
      body: opts.body,
      query: opts.query ?? {},
      headers: Object.assign(
        { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'content-length': '128' },
        opts.headers ?? {},
      ),
      ip: '10.0.0.9',
      socket: { remoteAddress: '10.0.0.9' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return () => guard.canActivate(context);
  }

  describe('attack corpus — must be rejected', () => {
    const attacks: Array<{ label: string; call: () => boolean }> = [
      { label: "classic tautology ' or 1=1--", call: run({ body: { note: "' or 1=1--" } }) },
      { label: "tautology ' or 'a'='a", call: run({ body: { note: "' or 'a'='a" } }) },
      { label: 'union select payload', call: run({ body: { q: "1' UNION SELECT password FROM users" } }) },
      { label: 'stacked DDL ; drop table', call: run({ body: { note: "x'; drop table users; --" } }) },
      { label: 'comment-then-DML', call: run({ body: { note: 'x -- delete from waybills' } }) },
      { label: 'sleep() time probe', call: run({ body: { id: '1 AND sleep(5)' } }) },
      { label: 'benchmark() probe', call: run({ body: { id: 'benchmark(10000000,sha1(x))' } }) },
      { label: 'load_file() probe', call: run({ body: { id: "load_file('/etc/passwd')" } }) },
      { label: 'into outfile', call: run({ body: { id: "1' into outfile '/tmp/x" } }) },
      { label: 'script tag', call: run({ body: { note: '<script>alert(1)</script>' } }) },
      { label: 'img onerror sink', call: run({ body: { note: "<img src=x onerror='alert(1)'>" } }) },
      { label: 'svg onload sink', call: run({ body: { note: '<svg onload=alert(document.cookie)>' } }) },
      { label: 'javascript: code sink', call: run({ body: { link: 'javascript:alert(document.cookie)' } }) },
      { label: 'javascript: percent-encoded', call: run({ body: { link: 'javascript:%61lert(1)' } }) },
      { label: 'vbscript sink', call: run({ body: { link: 'vbscript:msgbox(1)' } }) },
      { label: 'data:text/html', call: run({ body: { link: 'data:text/html,<script>x</script>' } }) },
      { label: 'iframe tag', call: run({ body: { note: '<iframe src=evil>' } }) },
      { label: 'path traversal in path', call: run({ path: '/api/v1/files/../../etc/passwd' }) },
      { label: 'encoded traversal %2e%2e', call: run({ path: '/api/v1/files/%2e%2e/secret' }) },
      { label: 'null byte in path', call: run({ path: '/api/v1/files/a%00.png' }) },
      { label: 'query injection', call: run({ method: 'GET', query: { q: "' or 1=1--" } }) },
      { label: 'query XSS', call: run({ method: 'GET', query: { cb: '<script>steal()</script>' } }) },
    ];

    it.each(attacks)('$label', ({ call }) => {
      let thrown: unknown;
      try {
        call();
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect((thrown as HttpException).getStatus()).toBe(400);
    });

    it('rejects oversized payloads with 413', () => {
      const call = run({ body: { note: 'ok' }, headers: { 'content-length': String(11 * 1024 * 1024) } });
      expect(call).toThrow(HttpException);
      try {
        call();
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(413);
      }
    });
  });

  describe('legitimate logistics corpus — must pass', () => {
    const legit: Array<{ label: string; call: () => boolean }> = [
      {
        label: 'yard prose with SQL verbs: "select reefer from the yard"',
        call: run({ body: { note: 'select reefer from the yard before 16:00' } }),
      },
      {
        label: 'SQL-verb prose without quote adjacency: "update the table of contents"',
        call: run({ body: { note: 'update the table of contents and delete rows from the sheet' } }),
      },
      {
        label: "apostrophe names: O'Brien, don't",
        call: run({ body: { consignee: "O'Brien's Traders", note: "don't load before 12:00; it's urgent" } }),
      },
      {
        label: 'and/or cargo line with = in a formula',
        call: run({ body: { note: 'R&D samples and/or prototypes; count = pieces + 1' } }),
      },
      {
        label: 'OR Tambo airport route',
        call: run({ body: { route: 'OR Tambo -> Sandton, return leg via Midrand' } }),
      },
      {
        label: 'quoted operator note with or',
        call: run({ body: { note: "client said 'collect at 12' or rebook for Monday" } }),
      },
      {
        label: 'comparison-like text in instructions',
        call: run({ body: { note: 'set x to 1 and y = 2; if pallets = bins use pallet pricing' } }),
      },
      {
        label: 'book title in a personal-effects note',
        call: run({ body: { note: 'javascript: the good parts (paperback) in box 3' } }),
      },
      {
        label: 'HTML-ish text without tags or sinks',
        call: run({ body: { note: 'angle brackets < > not allowed on labels; onload the truck at bay 4' } }),
      },
      {
        label: 'window handle wording without event assignment',
        call: run({ body: { note: 'on error call the depot; onclick of the scanner retry' } }),
      },
      {
        label: 'GET query with ordinary search text',
        call: run({ method: 'GET', query: { q: 'reefer select for client from Midrand' } }),
      },
    ];

    it.each(legit)('$label', ({ call }) => {
      expect(call()).toBe(true);
    });

    it('accepts curl-based health-check monitoring without blocking over time', () => {
      for (let i = 0; i < 25; i++) {
        const ok = run({
          method: 'GET',
          path: '/health',
          headers: { 'user-agent': 'curl/8.4.0' },
        })();
        expect(ok).toBe(true);
      }
    });
  });

  describe('ip handling', () => {
    it('uses the LAST x-forwarded-for entry so clients cannot spoof a fresh identity', () => {
      const request = {
        method: 'POST',
        path: '/api/v1/waybills',
        originalUrl: '/api/v1/waybills',
        body: { note: '<script>x</script>' },
        query: {},
        headers: {
          'user-agent': 'Mozilla/5.0',
          'content-length': '10',
          'x-forwarded-for': '6.6.6.6, 203.0.113.9',
        },
        ip: '10.0.0.9',
        socket: { remoteAddress: '10.0.0.9' },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      for (let i = 0; i < 10; i++) {
        try {
          guard.canActivate(context);
        } catch {
          /* expected 400s */
        }
      }
      // 10 violations from the spoofed identity 6.6.6.6 must now 429 regardless
      // of what XFF claims next — the recorded ip is the edge-observed 203.0.113.9.
      request.headers['x-forwarded-for'] = '7.7.7.7, 203.0.113.9';
      expect(() => guard.canActivate(context)).toThrow(HttpException);
      try {
        guard.canActivate(context);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(429);
      }
    });
  });

  describe('timetable upload size limit', () => {
    it('allows imports up to the route-specific 26 MB limit', () => {
      const call = run({
        method: 'POST',
        path: '/api/v1/rail/schedules/import',
        headers: {
          'content-length': String(25 * 1024 * 1024),
          'content-type': 'multipart/form-data; boundary=upload',
        },
      });
      expect(call()).toBe(true);
    });

    it('applies the same limit to owner timetable imports', () => {
      const call = run({
        method: 'POST',
        path: '/api/v1/owner/rail/schedules/import',
        headers: {
          'content-length': String(25 * 1024 * 1024),
          'content-type': 'multipart/form-data; boundary=upload',
        },
      });
      expect(call()).toBe(true);
    });

    it('keeps the 10 MB limit for non-import rail routes', () => {
      const call = run({
        method: 'POST',
        path: '/api/v1/rail/consignments',
        headers: { 'content-length': String(11 * 1024 * 1024) },
      });
      expect(call).toThrow(HttpException);
    });

    it('rejects timetable imports over 26 MB', () => {
      const call = run({
        method: 'POST',
        path: '/api/v1/rail/schedules/import',
        headers: {
          'content-length': String(27 * 1024 * 1024),
          'content-type': 'multipart/form-data; boundary=upload',
        },
      });
      expect(call).toThrow(HttpException);
    });
  });

  describe('tracked-IP memory bound', () => {
    it('never tracks more than the cap, however many source IPs attack', () => {
      for (let i = 0; i < 10_050; i++) {
        (guard as any).recordViolation(`198.51.100.${i % 250}.${Math.floor(i / 250)}`, 'xss_attempt');
      }
      expect(guard.trackedIpCount()).toBeLessThanOrEqual(10_000);
    });
  });

  describe('multipart aggregate header ceilings', () => {
    const routes = [
      ['/api/v1/waybills/bulk-import', 6],
      ['/api/v1/waybills/example/deliver', 15],
      ['/api/v1/waybills/inbox/upload', 11],
      ['/api/v1/companies/company-1/logo', 3],
      ['/api/v1/email-hub/send', 26],
      ['/api/v1/email-hub/ingest', 26],
    ] as const;

    it.each(routes)('%s allows its declared aggregate ceiling and rejects the next byte', (path, maxMiB) => {
      const contentType = 'multipart/form-data; boundary=upload';
      expect(run({ method: 'POST', path, headers: {
        'content-type': contentType,
        'content-length': String(maxMiB * 1024 * 1024),
      } })()).toBe(true);
      expect(run({ method: 'POST', path, headers: {
        'content-type': contentType,
        'content-length': String(maxMiB * 1024 * 1024 + 1),
      } })).toThrow(HttpException);
    });

    it('leaves missing Content-Length enforcement to the route Multer byte/part limits', () => {
      expect(run({
        method: 'POST',
        path: '/api/v1/waybills/example/deliver',
        headers: {
          'content-length': undefined as any,
          'content-type': 'multipart/form-data; boundary=upload',
        },
      })()).toBe(true);
    });
  });
});
