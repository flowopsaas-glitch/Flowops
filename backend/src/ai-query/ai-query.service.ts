import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class AiQueryService {
  private readonly logger = new Logger(AiQueryService.name);
  private readonly groqApiKey: string;
  private readonly groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';

  private readonly supportedLanguages = [
    { code: 'en', name: 'English' },
    { code: 'af', name: 'Afrikaans' },
    { code: 'zu', name: 'isiZulu' },
    { code: 'xh', name: 'isiXhosa' },
    { code: 'st', name: 'Sesotho' },
    { code: 'tn', name: 'Setswana' },
    { code: 'nso', name: 'Sepedi' },
    { code: 'ts', name: 'Xitsonga' },
    { code: 'ss', name: 'siSwati' },
    { code: 've', name: 'Tshivenda' },
    { code: 'nr', name: 'isiNdebele' },
  ];

  constructor(private readonly prisma: PrismaService) {
    this.groqApiKey = process.env.GROQ_API_KEY || '';
  }

  private detectLanguage(query: string): string {
    const lower = query.toLowerCase();
    
    // Afrikaans indicators
    if (/\b(wat|sal|die|volgende|maand|hoe|kan|ons|verbeter|wanneer|moet|meer|bestuurders|huur)\b/.test(lower)) {
      return 'af';
    }
    
    // isiZulu indicators
    if (/\b(kungani|izoba|ymalini|imali|engenayo|ngenyanga|ezayo|kufanele|siqase|nini|abaningi|abashayeli)\b/.test(lower)) {
      return 'zu';
    }
    
    // isiXhosa indicators
    if (/\b(kutheni|uza|kuba|yimalini|ingeniso|kwinyanga|ezayo|kufuneka|siqeshe|nini|abaqhubi|abaninzi)\b/.test(lower)) {
      return 'xh';
    }
    
    return 'en';
  }

  async analyzeQuery(query: string, companyId: number, language: string = 'en'): Promise<any> {
    // Auto-detect language from query if not explicitly set
    const detectedLang = this.detectLanguage(query);
    const finalLang = language === 'en' && detectedLang !== 'en' ? detectedLang : language;
    
    this.logger.log(`🤖 Analyzing query: "${query}" in ${finalLang} for company ${companyId}`);

    try {
      const context = await this.gatherContext(companyId);
      const predictiveInsights = await this.generatePredictiveInsights(context);
      const prompt = this.buildPrompt(query, context, predictiveInsights, finalLang);
      const aiResponse = await this.callGroqAI(prompt);

      return {
        success: true,
        query,
        answer: aiResponse,
        language: finalLang,
        context: {
          totalWaybills: context.waybills.length,
          totalRevenue: context.revenue,
          activeDrivers: context.drivers.length,
          successRate: context.metrics.successRate,
        },
        predictions: predictiveInsights,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`❌ AI query failed: ${error.message}`);
      return {
        success: false,
        query,
        answer: this.getFallbackResponse(query, finalLang),
        error: error.message,
      };
    }
  }

  private async generatePredictiveInsights(context: any): Promise<any> {
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [waybills30, waybills60, waybills90] = await Promise.all([
      this.prisma.waybill.count({ where: { createdAt: { gte: last30Days } } }),
      this.prisma.waybill.count({ where: { createdAt: { gte: last60Days, lt: last30Days } } }),
      this.prisma.waybill.count({ where: { createdAt: { gte: last90Days, lt: last60Days } } }),
    ]);

    const growthRate = waybills60 > 0 ? ((waybills30 - waybills60) / waybills60) * 100 : 0;
    const predictedNextMonth = Math.round(waybills30 * (1 + (growthRate / 100)));
    const avgRevenuePerWaybill = context.revenue / (context.metrics.total || 1);
    const predictedRevenue = predictedNextMonth * avgRevenuePerWaybill;
    const deliveriesPerDriver = context.metrics.delivered / (context.drivers.length || 1);
    const recommendedDrivers = Math.ceil(predictedNextMonth / 30 / (deliveriesPerDriver || 1));

    const dayOfWeekCounts: Record<string, number> = {};
    context.waybills.forEach(w => {
      const day = new Date(w.createdAt).toLocaleDateString('en-US', { weekday: 'long' });
      dayOfWeekCounts[day] = (dayOfWeekCounts[day] || 0) + 1;
    });
    const peakDays = Object.entries(dayOfWeekCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([day, count]) => ({ day, count }));

    const routeGrowth: Record<string, { current: number; previous: number }> = {};
    context.waybills.forEach(w => {
      if (w.destination) {
        const route = `${w.origin || 'Unknown'} → ${w.destination}`;
        if (!routeGrowth[route]) routeGrowth[route] = { current: 0, previous: 0 };
        const isRecent = new Date(w.createdAt) >= last30Days;
        if (isRecent) routeGrowth[route].current++;
        else routeGrowth[route].previous++;
      }
    });

    const growingRoutes = Object.entries(routeGrowth)
      .filter(([_, data]) => data.current > data.previous)
      .sort((a, b) => (b[1].current - b[1].previous) - (a[1].current - a[1].previous))
      .slice(0, 5)
      .map(([route, data]) => ({
        route,
        growth: data.current - data.previous,
        currentVolume: data.current,
      }));

    return {
      volume: {
        last30Days: waybills30,
        previous30Days: waybills60,
        growthRate: Math.round(growthRate * 10) / 10,
        predictedNextMonth,
        trend: growthRate > 0 ? 'GROWING' : growthRate < 0 ? 'DECLINING' : 'STABLE',
      },
      revenue: {
        current: context.revenue,
        avgPerWaybill: Math.round(avgRevenuePerWaybill * 100) / 100,
        predictedNextMonth: Math.round(predictedRevenue * 100) / 100,
      },
      capacity: {
        currentDrivers: context.drivers.length,
        deliveriesPerDriver: Math.round(deliveriesPerDriver * 10) / 10,
        recommendedDrivers,
        needToHire: recommendedDrivers > context.drivers.length,
        hireBy: this.getHireByDate(predictedNextMonth, context.drivers.length, deliveriesPerDriver),
      },
      peakDays,
      growingRoutes,
    };
  }

  private getHireByDate(predictedVolume: number, currentDrivers: number, perDriver: number): string {
    if (!this.needToHireNow(predictedVolume, currentDrivers, perDriver)) {
      return 'Not immediately needed';
    }
    const hireDate = new Date();
    hireDate.setDate(hireDate.getDate() + 14);
    return hireDate.toLocaleDateString('en-ZA');
  }

  private needToHireNow(predicted: number, drivers: number, perDriver: number): boolean {
    if (drivers === 0) return true;
    const capacity = drivers * perDriver * 30;
    return predicted > capacity * 0.8;
  }

  private async gatherContext(companyId: number) {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const waybills = await this.prisma.waybill.findMany({
      where: { companyId, createdAt: { gte: last30Days } },
      include: { driver: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const drivers = await this.prisma.driver.findMany({ where: { companyId } });
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, createdAt: { gte: last30Days } },
    });

    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const deliveredWaybills = waybills.filter(w => w.status === 'DELIVERED');
    const failedWaybills = waybills.filter(w => w.status === 'FAILED' || w.status === 'EXCEPTION');
    const successRate = waybills.length > 0 ? (deliveredWaybills.length / waybills.length) * 100 : 0;

    const destinations = {};
    waybills.forEach(w => {
      if (w.destination) destinations[w.destination] = (destinations[w.destination] || 0) + 1;
    });

    const topDestinations = Object.entries(destinations)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return {
      waybills,
      drivers,
      invoices,
      revenue: totalRevenue,
      metrics: {
        total: waybills.length,
        delivered: deliveredWaybills.length,
        failed: failedWaybills.length,
        inTransit: waybills.filter(w => w.status === 'IN_TRANSIT').length,
        successRate: Math.round(successRate * 10) / 10,
      },
      topDestinations,
      recentFailures: failedWaybills.slice(0, 5),
    };
  }

  private buildPrompt(query: string, context: any, predictions: any, language: string): string {
    const langName = this.supportedLanguages.find(l => l.code === language)?.name || 'English';

    return `You are an intelligent logistics analytics assistant for FlowOps, a South African courier company.

**CRITICAL INSTRUCTION: You MUST respond ENTIRELY in ${langName}. Every word, sentence, and recommendation must be in ${langName}. Do not use English at all.**

User Query (in ${langName}): "${query}"

📊 **Current Business Data (Last 30 Days):**
- Total Waybills: ${context.metrics.total}
- Delivered: ${context.metrics.delivered}
- Failed/Exceptions: ${context.metrics.failed}
- Success Rate: ${context.metrics.successRate}%
- Total Revenue: R${context.revenue.toFixed(2)}
- Active Drivers: ${context.drivers.length}
- Top Destinations: ${context.topDestinations.map(d => `${d.name} (${d.count})`).join(', ')}

🔮 **Predictive Analytics:**
- Volume Trend: ${predictions.volume.trend} (${predictions.volume.growthRate}% growth)
- Predicted Next Month: ${predictions.volume.predictedNextMonth} waybills
- Predicted Revenue: R${predictions.revenue.predictedNextMonth.toFixed(2)}
- Average Revenue per Waybill: R${predictions.revenue.avgPerWaybill}
- Peak Days: ${predictions.peakDays.map(d => `${d.day} (${d.count})`).join(', ')}
- Growing Routes: ${predictions.growingRoutes.map(r => `${r.route} (+${r.growth})`).join(', ') || 'None'}

👥 **Capacity Analysis:**
- Current Drivers: ${predictions.capacity.currentDrivers}
- Deliveries per Driver: ${predictions.capacity.deliveriesPerDriver}
- Recommended Drivers: ${predictions.capacity.recommendedDrivers}
- Need to Hire: ${predictions.capacity.needToHire ? 'YES' : 'NO'}
- Hire By: ${predictions.capacity.hireBy}

**Instructions:**
1. **RESPOND 100% IN ${langName.toUpperCase()} - NO ENGLISH**
2. Analyze the user's question using the data provided
3. For predictive questions, use the Predictive Analytics section
4. Provide specific numbers and percentages
5. Give actionable recommendations
6. Use bullet points and clear structure
7. Be concise but thorough

Provide your complete response in ${langName}:`;
  }

  private async callGroqAI(prompt: string): Promise<string> {
    if (!this.groqApiKey) {
      return this.getFallbackResponse(prompt, 'en');
    }

    try {
      const response = await axios.post(
        this.groqApiUrl,
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are a helpful logistics analytics assistant. You MUST respond in the language specified in the user prompt. Never use English unless explicitly told to.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 800,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.groqApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
      return response.data.choices[0]?.message?.content || 'No response generated.';
    } catch (error) {
      this.logger.error(`Groq API error: ${error.message}`);
      return this.getFallbackResponse(prompt, 'en');
    }
  }

  private getFallbackResponse(query: string, language: string): string {
    const responses: Record<string, string> = {
      en: "I apologize, but I'm having trouble connecting to the AI service. Please try again.",
      af: "Jammer, ek sukkel om met die AI-diens te koppel. Probeer asseblief weer.",
      zu: "Ngiyaxolisa, nginenkinga yokuxhumana nesevisi ye-AI. Sicela uzame futhi.",
      xh: "Ndiyacela uxolo, ndinengxaki yokudibanisa nenkonzo ye-AI. Nceda uzame kwakhona.",
    };
    return responses[language] || responses.en;
  }

  getSupportedLanguages() {
    return this.supportedLanguages;
  }
}
