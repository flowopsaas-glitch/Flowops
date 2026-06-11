// Environment configuration - Complete exports for all components

// API Configuration
export const FLOWOPS_API_URL = import.meta.env.VITE_FLOWOPS_API_URL || 'http://localhost:3000/api/v1';
export const FLOWOPS_HTTP_ORIGIN = import.meta.env.VITE_FLOWOPS_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';
export const FLOWOPS_WS_ORIGIN = import.meta.env.VITE_WS_ORIGIN || 'http://localhost:3000';

// WebSocket Configuration
export const WS_ORIGIN = import.meta.env.VITE_WS_ORIGIN || 'http://localhost:3000';

// Dev Credentials
export const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL || '';
export const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD || '';

// Feature Flags
export const ENABLE_PASSWORD_STRENGTH = import.meta.env.VITE_ENABLE_PASSWORD_STRENGTH === 'true';
export const ENABLE_RATE_LIMITING = import.meta.env.VITE_ENABLE_RATE_LIMITING === 'true';
export const ENABLE_DEV_CREDENTIALS = import.meta.env.VITE_ENABLE_DEV_CREDENTIALS === 'true';

// Sentry (optional)
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

// OpenTelemetry
export const OTEL_EXPORTER_OTLP_ENDPOINT = import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
