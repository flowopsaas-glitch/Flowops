import { Injectable, CanActivate, ExecutionContext, HttpException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { multipartUploadByteLimit } from '../security/multipart-upload-limits';

/**
 * API SHIELD — World-Class Platform Protection
 *
 * Multi-layer defence against:
 * 1. API scraping (pattern detection)
 * 2. Malicious payloads (SQL injection, XSS, path traversal)
 * 3. Suspicious request patterns (automated bots)
 * 4. Oversized payloads (DoS via large bodies)
 * 5. Header anomalies (missing User-Agent, spoofed origins)
 *
 * This guard runs BEFORE rate limiting and auth — it's the first line of defence.
 *
 * Pattern design (2026-09-27 revision): logistics payloads are full of prose
 * that overlaps attack vocabulary — "select reefer from the yard", "and/or",
 * apostrophes in names ("O'Brien"), "R&D", "OR Tambo". The SQLi/XSS patterns
 * below therefore require attack *shape* (quote adjacency, tautologies,
 * statement separators, code sinks), not attack *words*. Both directions are
 * pinned by api-shield.guard.spec.ts: an attack corpus must 400 and a
 * legitimate-logistics corpus must pass. Extend those corpora from real
 * traffic before tightening or loosening anything here.
 */

// SQL injection: require attack shape, not attack words.
const SQL_INJECTION_PATTERNS = [
  // ' UNION [ALL] SELECT / ' SELECT — single-quote- or %27-adjacent verbs.
  // (JSON.stringify puts a double quote before every value, so double-quote
  // adjacency would 400 any note that opens with a SQL verb — e.g. "select
  // reefer from the yard". Bare select…from prose is intentionally NOT
  // matched; union-select/tautology/stacked-DML shapes below still catch it.)
  /(?:'|%27)\s*(?:union\s+(?:all\s+)?select|select\s)/i,
  // tautologies: ' or 1=1 / ' or 'a'='a / " and 2=2 — quote-adjacent only,
  // so prose like "don't or do" or "O'Brien and x=1" cannot trip it.
  /(?:'|%27|")\s*(?:or|and)\s+(?:'[^']{0,80}'|")?\s*(?:\d+|'[^']{0,80}'|")?\s*=/i,
  // statement-chained DDL/DML: '; drop table / "); delete from / --\s*delete
  /(?:;|%3b|\)|\/\*|--|#)\s*(?:drop|delete|update|insert|alter|create|exec|truncate)\b/i,
  // stacked keyword pairs that prose does not produce: union select, into outfile
  /\bunion\s+(?:all\s+)?select\b/i,
  /\binto\s+(?:out|dump)file\b/i,
  /\bload_file\s*\(/i,
  /\bbenchmark\s*\(/i,
  /\bsleep\s*\(\s*\d/i,
];

// XSS: tags always; event handlers and code sinks require attack shape.
const XSS_PATTERNS = [
  /<\s*script[\s>]/i,
  /<\s*iframe[\s>]/i,
  /<\s*object[\s>]/i,
  /<\s*embed[\s>]/i,
  /<\s*svg\b[^>]*\bon\w+/i,
  /<\s*img\b[^>]*\bon\w+/i,
  /\bon(?:error|load|click|mouse\w*|focus|blur|animation\w*|toggle)\s*=\s*['"]?\s*(?:alert|eval|atob|document|window|location|fetch|Function|import|[^\s(<])/i,
  // javascript: / data:text/html must look like a code sink, so prose such as
  // "javascript: the good parts" in a note passes while payloads do not.
  /(?:javascript|vbscript)\s*:\s*(?:alert|confirm|prompt|eval|atob|msgbox|Function|setTimeout|setInterval|document|window|location|import\s*\(|fetch\s*\(|XMLHttpRequest|String\s*\.\s*fromCharCode|['"`(])/i,
  // encoded or protocol-comment form: javascript:%61lert(1), javascript://%0a…
  /(?:javascript|vbscript)\s*:\s*(?:%[0-9a-f]{2}|\/\/)/i,
  /data\s*:\s*text\/html/i,
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/, // covers ../ and ..\ after URL-decoding
  /\.\.%2f/i,
  /\.\.%5c/i,
  /%2e%2e/i,
  /\/etc\/passwd/i,
  /\/proc\/self/i,
  /%00/i, // null-byte truncation attempts
];

// Known bot/scraper User-Agent patterns. Detection is LOG-ONLY (see
// canActivate): legitimate monitoring (curl/wget/axios health checks) shares
// this vocabulary and must never accumulate toward the violation block.
const BOT_PATTERNS = [
  /python-requests/i,
  /scrapy/i,
  /httpclient/i,
  /curl\/[0-9]/i,
  /wget/i,
  /java\/[0-9]/i,
  /go-http-client/i,
  /axios\/[0-9]/i,
];

@Injectable()
export class ApiShieldGuard implements CanActivate {
  private readonly logger = new Logger('API_SHIELD');

  // Track suspicious IPs (in-memory, resets on restart)
  private readonly suspiciousIps = new Map<string, { count: number; lastSeen: number }>();
  private static readonly BLOCK_THRESHOLD = 10; // Block after 10 violations
  private static readonly BLOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.getClientIp(request);
    const path = request.path;
    const method = request.method;

    // 1. Check if IP is temporarily blocked
    if (this.isBlocked(ip)) {
      this.logger.warn(`BLOCKED: ${ip} — exceeded violation threshold`);
      throw new HttpException('Too many suspicious requests. Try again later.', 429);
    }

    // 2. Check request body size (prevent DoS via large payloads)
    const rawContentLength = request.headers['content-length'];
    const isMultipart = (request.headers['content-type'] || '').toLowerCase().includes('multipart/form-data');
    const maxBodySize = isMultipart
      ? multipartUploadByteLimit(method, path) ?? 10 * 1024 * 1024
      : 10 * 1024 * 1024;

    if (rawContentLength !== undefined) {
      if (!/^\d+$/.test(rawContentLength)) {
        this.recordViolation(ip, 'invalid_content_length');
        throw new HttpException('Invalid Content-Length header.', 400);
      }
      const contentLength = Number(rawContentLength);
      if (!Number.isSafeInteger(contentLength) || contentLength > maxBodySize) {
        this.recordViolation(ip, 'oversized_payload');
        throw new HttpException('Request body too large.', 413);
      }
    }
    // The raw multipart middleware independently counts chunked bytes before
    // Multer; Multer still applies per-file, field, file-count and part limits.

    // 3. Validate headers (bot detection) — LOG ONLY, never a violation:
    // curl/wget/axios User-Agents are shared by our own monitoring and by
    // legitimate server-to-server clients. Blocking them was self-inflicted
    // DoS risk (10 hits in 15 min would 429 a health checker).
    const userAgent = request.headers['user-agent'] || '';
    if (this.isKnownBot(userAgent) && !this.isAllowedBotPath(path)) {
      this.logger.warn(`BOT_DETECTED: ${ip} | UA: ${userAgent.slice(0, 50)} | ${method} ${path}`);
    }

    // 4. Check for path traversal in URL
    if (this.hasPathTraversal(path)) {
      this.recordViolation(ip, 'path_traversal');
      this.logger.error(`PATH_TRAVERSAL: ${ip} | ${method} ${path}`);
      throw new HttpException('Invalid request path.', 400);
    }

    // 5. Validate request body for injection patterns
    if (['POST', 'PUT', 'PATCH'].includes(method) && request.body) {
      const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);

      if (this.hasSqlInjection(bodyStr)) {
        this.recordViolation(ip, 'sql_injection');
        this.logger.error(`SQL_INJECTION_ATTEMPT: ${ip} | ${method} ${path} | Body snippet: ${bodyStr.slice(0, 100)}`);
        throw new HttpException('Invalid input detected.', 400);
      }

      if (this.hasXss(bodyStr)) {
        this.recordViolation(ip, 'xss_attempt');
        this.logger.error(`XSS_ATTEMPT: ${ip} | ${method} ${path} | Body snippet: ${bodyStr.slice(0, 100)}`);
        throw new HttpException('Invalid input detected.', 400);
      }
    }

    // 6. Check query parameters for injection
    const queryStr = JSON.stringify(request.query || {});
    if (this.hasSqlInjection(queryStr) || this.hasXss(queryStr)) {
      this.recordViolation(ip, 'query_injection');
      this.logger.error(`QUERY_INJECTION: ${ip} | ${method} ${path}?${request.originalUrl.split('?')[1] || ''}`);
      throw new HttpException('Invalid query parameters.', 400);
    }

    return true;
  }

  private getClientIp(request: Request): string {
    // Trust the LAST x-forwarded-for entry when present: each proxy appends
    // the peer it received from, so the rightmost entry is the one our own
    // edge appended. Taking the FIRST entry let clients spoof a fresh
    // identity per request and evade (or frame) the violation block.
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private isBlocked(ip: string): boolean {
    const entry = this.suspiciousIps.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.lastSeen > ApiShieldGuard.BLOCK_WINDOW_MS) {
      this.suspiciousIps.delete(ip);
      return false;
    }
    return entry.count >= ApiShieldGuard.BLOCK_THRESHOLD;
  }

  private recordViolation(ip: string, type: string): void {
    const entry = this.suspiciousIps.get(ip) || { count: 0, lastSeen: 0 };
    entry.count++;
    entry.lastSeen = Date.now();
    this.suspiciousIps.set(ip, entry);
    this.logger.warn(`VIOLATION[${type}]: ${ip} — count: ${entry.count}/${ApiShieldGuard.BLOCK_THRESHOLD}`);
  }

  private isKnownBot(ua: string): boolean {
    return BOT_PATTERNS.some((p) => p.test(ua));
  }

  private isAllowedBotPath(path: string): boolean {
    // Allow bots on public paths (health, tracking, status). Segment-aware:
    // '/health' must not accidentally allow '/healthz-private'.
    const allowed = ['/health', '/api/v1/track', '/api/v1/status'];
    return allowed.some((p) => path === p || path.startsWith(p + '/'));
  }

  private hasPathTraversal(path: string): boolean {
    return PATH_TRAVERSAL_PATTERNS.some((p) => p.test(path));
  }

  private hasSqlInjection(input: string): boolean {
    return SQL_INJECTION_PATTERNS.some((p) => p.test(input));
  }

  private hasXss(input: string): boolean {
    return XSS_PATTERNS.some((p) => p.test(input));
  }
}
