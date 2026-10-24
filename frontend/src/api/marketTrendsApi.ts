import { api } from './client';

const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

// ── Types ────────────────────────────────────────────────────────────────

export type MarketSegment = {
  name: string;
  share: number;
  growth: string;
  outlook: string;
};

export type Competitor = {
  name: string;
  strength: string;
  recentMove: string;
  threat: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type MarketOpportunity = {
  title: string;
  description: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  timeframe: string;
};

export type MarketPrediction = {
  title: string;
  confidence: number;
  description: string;
  timeHorizon: string;
};

export type MarketTrendData = {
  overview: {
    marketSize: string;
    growthRate: string;
    projectedGrowth: string;
    keyDrivers: string[];
  };
  segments: MarketSegment[];
  competitors: Competitor[];
  opportunities: MarketOpportunity[];
  predictions: MarketPrediction[];
  generatedAt: string;
  model: string;
};

export type MarketInsight = {
  answer: string;
  confidence: number;
  keyPoints?: string[];
  recommendations?: string[];
  sources?: string[];
};

// ── API Functions ────────────────────────────────────────────────────────

export const getMarketTrends = async (params?: { region?: string; segment?: string; timeframe?: string }) =>
  unwrap<MarketTrendData>(await api.get('/market-trends', { params }));

export const askMarketInsight = async (question?: string, context?: string) =>
  unwrap<MarketInsight>(await api.post('/market-trends/insight', { question, context }));
