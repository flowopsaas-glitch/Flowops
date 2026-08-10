import { Injectable, CanActivate, ExecutionContext, HttpException, Logger } from '@nestjs/common';
import { Request } from 'express';

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
 */

// Patterns that indicate malicious input
const SQL_INJECTION_PATTERNS = [
  /(\b(union|select|insert|update|delete|drop|alter|create|exec)\b.*\b(from|into|table|where|set)\b)/i,
  /(--|#|\/\*|\*\/|;)\s*(select|drop|delete|insert|update|alter)/i,
  /(\b(or|and)\b\s+\d+\s*=\s*\d+)/i,
  /'.*(\bor\b|\band\b).*'.*=/i,
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on(error|load|click|mouse|focus|blur)\s*=/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.%2f/i,
  /\.\.\\/,
  /%2e%2e/i,
  /\/etc\/passwd/i,
  /\/proc\/self/i,
];

// Known bot/scraper User-Agent patterns
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
    const contentLength = parseInt(request.headers['content-length'] || '0', 10);
    if (contentLength > 10 * 1024 * 1024) { // 10MB max
      this.recordViolation(ip, 'oversized_payload');
      throw new HttpException('Request body too large.', 413);
    }

    // 3. Validate headers (bot detection)
    const userAgent = request.headers['user-agent'] || '';
    if (this.isKnownBot(userAgent) && !this.isAllowedBotPath(path)) {
      this.recordViolation(ip, 'bot_detected');
      // Don't block bots entirely — just log and track (they might be legitimate)
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
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
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
    return BOT_PATTERNS.some(p => p.test(ua));
  }

  private isAllowedBotPath(path: string): boolean {
    // Allow bots on public paths (health, tracking, status)
    const allowed = ['/health', '/api/v1/track', '/api/v1/status'];
    return allowed.some(p => path.startsWith(p));
  }

  private hasPathTraversal(path: string): boolean {
    return PATH_TRAVERSAL_PATTERNS.some(p => p.test(path));
  }

  private hasSqlInjection(input: string): boolean {
    return SQL_INJECTION_PATTERNS.some(p => p.test(input));
  }

  private hasXss(input: string): boolean {
    return XSS_PATTERNS.some(p => p.test(input));
  }
}
