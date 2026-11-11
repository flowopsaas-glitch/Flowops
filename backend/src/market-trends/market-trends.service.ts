import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GROQ_MODEL } from '../ai/groq-model';

export interface MarketTrendData {
  overview: {
    marketSize: string;
    growthRate: string;
    projectedGrowth: string;
    keyDrivers: string[];
  };
  segments: Array<{
    name: string;
    share: number;
    growth: string;
    outlook: string;
  }>;
  competitors: Array<{
    name: string;
    strength: string;
    recentMove: string;
    threat: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  opportunities: Array<{
    title: string;
    description: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    timeframe: string;
  }>;
  predictions: Array<{
    title: string;
    confidence: number;
    description: string;
    timeHorizon: string;
  }>;
  generatedAt: string;
  model: string;
}

@Injectable()
export class MarketTrendsService {
  private readonly logger = new Logger(MarketTrendsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getMarketTrends(companyId: string, query?: { region?: string; segment?: string; timeframe?: string }): Promise<MarketTrendData> {
    const groqApiKey = this.config.get<string>('GROQ_API_KEY');

    // Gather company context for personalized insights
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, plan: true, city: true, country: true },
    });

    const waybillCount = await this.prisma.waybill.count({ where: { companyId } });
    const driverCount = await this.prisma.driver.count({ where: { companyId } });

    if (groqApiKey) {
      return this.fetchAITrends(groqApiKey, company, { waybillCount, driverCount }, query);
    }

    // Fallback: return static market data for South Africa courier market
    return this.getStaticMarketData(query);
  }

  async getInsight(companyId: string, question?: string, context?: string) {
    const groqApiKey = this.config.get<string>('GROQ_API_KEY');
    if (!groqApiKey) {
      return {
        answer: 'AI insights require a GROQ_API_KEY configuration. Please contact your administrator.',
        confidence: 0,
        sources: [],
      };
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, plan: true, city: true },
    });

    const prompt = `You are a South African logistics market analyst for ${company?.name || 'a courier company'}.
${context ? `Additional context: ${context}` : ''}

Question: ${question || 'What are the key market trends and strategic recommendations for a courier/logistics company in South Africa?'}

Provide a concise, actionable answer with specific data points where possible. Focus on the South African courier, express, and parcel (CEP) market. Include confidence level (0-100) and cite any sources.

Respond in JSON format: { "answer": string, "confidence": number, "keyPoints": string[], "recommendations": string[], "sources": string[] }`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
      const data = await response.json();
      return JSON.parse(data.choices[0].message.content);
    } catch (error) {
      this.logger.error(`Market insight failed: ${error.message}`);
      return {
        answer: 'Unable to generate insight at this time. Please try again later.',
        confidence: 0,
        keyPoints: [],
        recommendations: [],
        sources: [],
      };
    }
  }

  /**
   * Narrow an untrusted AI payload to the declared contract, or return null.
   *
   * Deliberately strict and deliberately verbose: this is the boundary between a
   * language model and a screen a customer is looking at. Every field the UI
   * reads is checked, and unknown top-level keys are dropped rather than
   * forwarded — a model-supplied `generatedAt` must not shadow the real one.
   */
  private toMarketTrendData(raw: any): Omit<MarketTrendData, 'generatedAt' | 'model'> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const level = (v: unknown): v is 'LOW' | 'MEDIUM' | 'HIGH' =>
      v === 'LOW' || v === 'MEDIUM' || v === 'HIGH';

    const ov = raw.overview;
    if (!ov || typeof ov !== 'object') return null;
    if (!str(ov.marketSize) || !str(ov.growthRate) || !str(ov.projectedGrowth)) return null;
    if (!Array.isArray(ov.keyDrivers) || !ov.keyDrivers.every(str)) return null;

    if (!Array.isArray(raw.segments)) return null;
    const segments = raw.segments.filter(
      (x: any) => x && str(x.name) && num(x.share) && str(x.growth) && str(x.outlook),
    );
    if (!segments.length) return null;

    if (!Array.isArray(raw.competitors)) return null;
    const competitors = raw.competitors.filter(
      (x: any) => x && str(x.name) && str(x.strength) && str(x.recentMove) && level(x.threat),
    );
    if (!competitors.length) return null;

    if (!Array.isArray(raw.opportunities)) return null;
    const opportunities = raw.opportunities.filter(
      (x: any) => x && str(x.title) && str(x.description) && level(x.impact) && str(x.timeframe),
    );
    if (!opportunities.length) return null;

    if (!Array.isArray(raw.predictions)) return null;
    const predictions = raw.predictions.filter(
      (x: any) => x && str(x.title) && num(x.confidence) && str(x.description) && str(x.timeHorizon),
    );
    if (!predictions.length) return null;

    // Rebuild field by field. No spread, so nothing the model invented can ride
    // along or shadow a field the contract owns.
    return {
      overview: {
        marketSize: ov.marketSize,
        growthRate: ov.growthRate,
        projectedGrowth: ov.projectedGrowth,
        keyDrivers: ov.keyDrivers,
      },
      segments: segments.map((x: any) => ({
        name: x.name,
        share: x.share,
        growth: x.growth,
        outlook: x.outlook,
      })),
      competitors: competitors.map((x: any) => ({
        name: x.name,
        strength: x.strength,
        recentMove: x.recentMove,
        threat: x.threat,
      })),
      opportunities: opportunities.map((x: any) => ({
        title: x.title,
        description: x.description,
        impact: x.impact,
        timeframe: x.timeframe,
      })),
      predictions: predictions.map((x: any) => ({
        title: x.title,
        confidence: x.confidence,
        description: x.description,
        timeHorizon: x.timeHorizon,
      })),
    };
  }

  private async fetchAITrends(
    apiKey: string,
    company: any,
    stats: { waybillCount: number; driverCount: number },
    query?: { region?: string; segment?: string; timeframe?: string },
  ): Promise<MarketTrendData> {
    const region = query?.region || company?.country || 'South Africa';
    const segment = query?.segment || 'courier, express, and parcel (CEP)';

    const prompt = `You are a logistics market intelligence analyst. Provide comprehensive market trend data for the ${segment} market in ${region}.

Company context: ${company?.name || 'FlowOps client'}, ${stats.waybillCount} shipments, ${stats.driverCount} drivers.

Provide the response in JSON format with this structure:
{
  "overview": { "marketSize": "R XX billion", "growthRate": "X.X% CAGR", "projectedGrowth": "R XX billion by 2030", "keyDrivers": ["driver1", "driver2"] },
  "segments": [{ "name": "Last-mile delivery", "share": 45, "growth": "12%", "outlook": "Strong growth driven by e-commerce" }],
  "competitors": [{ "name": "CompetitorName", "strength": "Market share leader", "recentMove": "Recent activity", "threat": "HIGH" }],
  "opportunities": [{ "title": "Opportunity", "description": "Detail", "impact": "HIGH", "timeframe": "6-12 months" }],
  "predictions": [{ "title": "Prediction", "confidence": 85, "description": "Detail", "timeHorizon": "2026-2027" }]
}

Focus on real South African market dynamics: Aramex, The Courier Guy, Fastway, DSV, DPD Laser, Pargo, Picup, Bob Go, etc.`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);

      // AI output is INPUT. It was previously spread straight into the return
      // value, so the declared MarketTrendData type was a claim nothing enforced:
      // `segments` could arrive as an object, `share` as "about forty", and the
      // caller could not tell a bad model day from a broken product. Anything
      // that does not match the contract falls back to the static dataset, which
      // exists for exactly this.
      const validated = this.toMarketTrendData(content);
      if (!validated) {
        this.logger.warn('AI trends response did not match the contract; using static data');
        return this.getStaticMarketData(query);
      }

      return {
        ...validated,
        generatedAt: new Date().toISOString(),
        model: GROQ_MODEL,
      };
    } catch (error) {
      this.logger.warn(`AI trends fetch failed: ${error.message}`);
      return this.getStaticMarketData(query);
    }
  }

  private getStaticMarketData(_query?: any): MarketTrendData {
    return {
      overview: {
        marketSize: 'R 25.4 billion',
        growthRate: '7.8% CAGR (2024-2030)',
        projectedGrowth: 'R 42 billion by 2030',
        keyDrivers: [
          'E-commerce growth (35% YoY)',
          'Urbanization & last-mile demand',
          'Technology adoption in logistics',
          'Cross-border trade increase',
          'Same-day delivery expectations',
        ],
      },
      segments: [
        { name: 'Last-mile delivery', share: 42, growth: '12.3%', outlook: 'Dominant growth segment driven by e-commerce' },
        { name: 'Express parcels', share: 28, growth: '8.1%', outlook: 'Stable growth, premium pricing' },
        { name: 'B2B logistics', share: 20, growth: '5.4%', outlook: 'Steady enterprise demand' },
        { name: 'Freight forwarding', share: 10, growth: '6.2%', outlook: 'Cross-border trade expansion' },
      ],
      competitors: [
        { name: 'The Courier Guy', strength: 'Largest ZA network', recentMove: 'Expanded same-day coverage', threat: 'HIGH' },
        { name: 'Aramex', strength: 'International backing', recentMove: 'AI route optimization rollout', threat: 'HIGH' },
        { name: 'DPD Laser', strength: 'Retail partnerships', recentMove: 'Pargo locker expansion', threat: 'MEDIUM' },
        { name: 'Fastway', strength: 'Franchise model scale', recentMove: 'Technology platform upgrade', threat: 'MEDIUM' },
        { name: 'Picup', strength: 'Tech-first approach', recentMove: 'Multi-carrier aggregation', threat: 'MEDIUM' },
      ],
      opportunities: [
        { title: 'Same-day delivery premium', description: 'Growing demand for same-day in Gauteng metro', impact: 'HIGH', timeframe: '3-6 months' },
        { title: 'E-commerce integration', description: 'Direct Shopify/WooCommerce integration for auto-dispatch', impact: 'HIGH', timeframe: '1-3 months' },
        { title: 'Rural last-mile', description: 'Underserved rural areas with growing online shopping', impact: 'MEDIUM', timeframe: '6-12 months' },
        { title: 'Cold-chain logistics', description: 'Grocery/pharma delivery growing 18% YoY', impact: 'MEDIUM', timeframe: '6-12 months' },
      ],
      predictions: [
        { title: 'Market consolidation', confidence: 78, description: 'Expect 2-3 major acquisitions in SA CEP market', timeHorizon: '2026-2027' },
        { title: 'EV fleet adoption', confidence: 65, description: 'Electric delivery vehicles reaching cost parity for urban routes', timeHorizon: '2027-2028' },
        { title: 'Drone delivery pilots', confidence: 45, description: 'Regulatory framework enabling commercial drone delivery in SA', timeHorizon: '2028-2030' },
        { title: 'AI-first operations', confidence: 88, description: 'AI dispatch and route optimization becoming table-stakes', timeHorizon: '2025-2026' },
      ],
      generatedAt: new Date().toISOString(),
      model: 'static-data',
    };
  }
}
