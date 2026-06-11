// backend/src/lib/metrics.ts
import promClient from 'prom-client';

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics (event loop lag, GC, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics example
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 1, 3, 5, 10],
  registers: [register],
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active database connections',
  registers: [register],
});

// Middleware to track request duration
export function metricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  
  next();
}

// Express route handler for /metrics
export function metricsHandler(req: any, res: any) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}

// Helper to update custom metrics
export const metrics = {
  activeConnections: {
    set: (value: number) => activeConnections.set(value),
    inc: () => activeConnections.inc(),
    dec: () => activeConnections.dec(),
  },
  // Add more helpers as needed
};

export default register;
