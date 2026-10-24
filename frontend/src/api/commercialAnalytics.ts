import api from './client';

export const getCommercialConfig = () => api.get('/commercial-analytics/config');
export const updateCommercialConfig = (data: Record<string, unknown>) => api.patch('/commercial-analytics/config', data);
export const getProfitability = (period?: string) =>
  api.get('/commercial-analytics/profitability', { params: { period } });
export const getClientMatrix = (period?: string) =>
  api.get('/commercial-analytics/clients', { params: { period } });
export const getLaneProfitability = (period?: string) =>
  api.get('/commercial-analytics/lanes', { params: { period } });
export const getQuoteFunnel = (period?: string) =>
  api.get('/commercial-analytics/quotes', { params: { period } });
export const getRateCardPerformance = () =>
  api.get('/commercial-analytics/rate-cards');
export const getRevenueForecast = () =>
  api.get('/commercial-analytics/forecast');
export const getClientIntelligence = () =>
  api.get('/commercial-analytics/intelligence');
export const getCommercialAiInsights = () =>
  api.get('/commercial-analytics/ai-insights');
export const getCommercialReport = (period?: string) =>
  api.get('/commercial-analytics/report', { params: { period } });
