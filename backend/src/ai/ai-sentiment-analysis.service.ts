import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface SentimentResult {
  messageId: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  score: number; // -1 to 1
  confidence: number; // 0-100
  emotions: string[];
  topics: string[];
  isComplaint: boolean;
  escalationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedAction?: string;
}

interface ConversationAnalysis {
  conversationId: string;
  customerPhone: string;
  totalMessages: number;
  overallSentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  sentimentTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  averageScore: number;
  complaints: number;
  escalationRisks: number;
  insights: string[];
  recommendations: string[];
  analyzedAt: Date;
}

@Injectable()
export class AiSentimentAnalysisService {
  private readonly logger = new Logger(AiSentimentAnalysisService.name);
  private readonly groqApiKey: string;
  private readonly analysisModel: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.groqApiKey = this.config.get<string>('GROQ_API_KEY') || '';
    this.analysisModel = this.config.get<string>('AI_ANALYSIS_MODEL') || 'llama-3.3-70b-versatile';
  }

  /**
   * 💬 Analyze sentiment of a single message
   */
  async analyzeMessage(message: string, context?: any): Promise<SentimentResult> {
    this.logger.log(`💬 Analyzing message sentiment`);

    if (!this.groqApiKey) {
      return {
        messageId: `msg-${Date.now()}`,
        sentiment: 'NEUTRAL',
        score: 0,
        confidence: 50,
        emotions: [],
        topics: [],
        isComplaint: false,
        escalationRisk: 'LOW',
      };
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.analysisModel,
          messages: [
            {
              role: 'system',
              content: `You are FlowOps Customer Sentiment AI. Analyze customer messages and respond with JSON:
              {
                "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
                "score": -1.0 to 1.0,
                "confidence": 0-100,
                "emotions": ["happy", "frustrated", "angry", "grateful", etc],
                "topics": ["delivery", "pricing", "service", etc],
                "isComplaint": boolean,
                "escalationRisk": "LOW" | "MEDIUM" | "HIGH",
                "suggestedAction": "string or null"
              }`
            },
            {
              role: 'user',
              content: message
            }
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: 'json_object' }
        }),
      });

      const data = await response.json();
      const content = (data as any).choices?.[0]?.message?.content || '{}';
      
      let analysis;
      try {
        analysis = JSON.parse(content);
      } catch {
        analysis = {
          sentiment: 'NEUTRAL',
          score: 0,
          confidence: 50,
          emotions: [],
          topics: [],
          isComplaint: false,
          escalationRisk: 'LOW',
        };
      }

      return {
        messageId: `msg-${Date.now()}`,
        sentiment: analysis.sentiment || 'NEUTRAL',
        score: analysis.score || 0,
        confidence: analysis.confidence || 70,
        emotions: analysis.emotions || [],
        topics: analysis.topics || [],
        isComplaint: analysis.isComplaint || false,
        escalationRisk: analysis.escalationRisk || 'LOW',
        suggestedAction: analysis.suggestedAction,
      };
    } catch (error: any) {
      this.logger.error(`Sentiment analysis failed: ${error.message}`);
      return {
        messageId: `msg-${Date.now()}`,
        sentiment: 'NEUTRAL',
        score: 0,
        confidence: 50,
        emotions: [],
        topics: [],
        isComplaint: false,
        escalationRisk: 'LOW',
      };
    }
  }

  /**
   * 📊 Analyze entire conversation
   */
  async analyzeConversation(customerPhone: string, companyId: number): Promise<ConversationAnalysis> {
    this.logger.log(`📊 Analyzing conversation for ${customerPhone}`);

    // Get WhatsApp messages for this customer
    const messages = await this.prisma.whatsAppLog.findMany({
      where: {
        companyId,
        OR: [
          { phoneNumber: customerPhone },
          { phoneNumber: customerPhone },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    if (messages.length === 0) {
      return {
        conversationId: `conv-${Date.now()}`,
        customerPhone,
        totalMessages: 0,
        overallSentiment: 'NEUTRAL',
        sentimentTrend: 'STABLE',
        averageScore: 0,
        complaints: 0,
        escalationRisks: 0,
        insights: ['No messages found for this customer'],
        recommendations: [],
        analyzedAt: new Date(),
      };
    }

    // Analyze each message
    const analyses: SentimentResult[] = [];
    for (const msg of messages) {
      if (msg.message) {
        const analysis = await this.analyzeMessage(msg.message);
        analyses.push(analysis);
      }
    }

    // Calculate overall metrics
    const totalMessages = analyses.length;
    const averageScore = analyses.reduce((sum, a) => sum + a.score, 0) / totalMessages;
    const complaints = analyses.filter(a => a.isComplaint).length;
    const escalationRisks = analyses.filter(a => a.escalationRisk === 'HIGH').length;

    // Determine overall sentiment
    let overallSentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    if (averageScore > 0.3) overallSentiment = 'POSITIVE';
    else if (averageScore < -0.3) overallSentiment = 'NEGATIVE';
    else overallSentiment = 'NEUTRAL';

    // Calculate sentiment trend
    const sentimentTrend = this.calculateSentimentTrend(analyses);

    // Generate insights
    const insights = this.generateInsights(analyses, overallSentiment, sentimentTrend);

    // Generate recommendations
    const recommendations = this.generateRecommendations(analyses, complaints, escalationRisks);

    return {
      conversationId: `conv-${customerPhone}-${Date.now()}`,
      customerPhone,
      totalMessages,
      overallSentiment,
      sentimentTrend,
      averageScore: Math.round(averageScore * 100) / 100,
      complaints,
      escalationRisks,
      insights,
      recommendations,
      analyzedAt: new Date(),
    };
  }

  /**
   * 📈 Get sentiment analytics for company
   */
  async getSentimentAnalytics(companyId: number, days: number = 30): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const messages = await this.prisma.whatsAppLog.findMany({
      where: {
        companyId,
        createdAt: { gte: since },
        message: { not: null },
      },
      select: {
        message: true,
        createdAt: true,
        phoneNumber: true,
        direction: true,
      },
      take: 500,
    });

    if (messages.length === 0) {
      return {
        totalMessages: 0,
        sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
        averageSentiment: 0,
        topTopics: [],
        topEmotions: [],
        complaintRate: 0,
      };
    }

    // Sample messages for analysis (to avoid too many API calls)
    const sampleSize = Math.min(50, messages.length);
    const sample = messages.slice(0, sampleSize);

    const analyses: SentimentResult[] = [];
    for (const msg of sample) {
      if (msg.message) {
        const analysis = await this.analyzeMessage(msg.message);
        analyses.push(analysis);
      }
    }

    // Calculate distribution
    const positive = analyses.filter(a => a.sentiment === 'POSITIVE').length;
    const neutral = analyses.filter(a => a.sentiment === 'NEUTRAL').length;
    const negative = analyses.filter(a => a.sentiment === 'NEGATIVE').length;

    const averageSentiment = analyses.reduce((sum, a) => sum + a.score, 0) / analyses.length;

    // Get top topics
    const topicCounts: Record<string, number> = {};
    analyses.forEach(a => {
      a.topics.forEach(t => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
    });
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));

    // Get top emotions
    const emotionCounts: Record<string, number> = {};
    analyses.forEach(a => {
      a.emotions.forEach(e => {
        emotionCounts[e] = (emotionCounts[e] || 0) + 1;
      });
    });
    const topEmotions = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([emotion, count]) => ({ emotion, count }));

    const complaints = analyses.filter(a => a.isComplaint).length;
    const complaintRate = (complaints / analyses.length) * 100;

    return {
      totalMessages: messages.length,
      analyzedMessages: analyses.length,
      sentimentDistribution: { positive, neutral, negative },
      averageSentiment: Math.round(averageSentiment * 100) / 100,
      topTopics,
      topEmotions,
      complaintRate: Math.round(complaintRate * 10) / 10,
      period: { days, since: since.toISOString() },
    };
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private calculateSentimentTrend(analyses: SentimentResult[]): 'IMPROVING' | 'STABLE' | 'DECLINING' {
    if (analyses.length < 5) return 'STABLE';

    // Split into first half and second half
    const mid = Math.floor(analyses.length / 2);
    const firstHalf = analyses.slice(0, mid);
    const secondHalf = analyses.slice(mid);

    const firstAvg = firstHalf.reduce((sum, a) => sum + a.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, a) => sum + a.score, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;

    if (diff > 0.2) return 'IMPROVING';
    if (diff < -0.2) return 'DECLINING';
    return 'STABLE';
  }

  private generateInsights(analyses: SentimentResult[], overallSentiment: string, trend: string): string[] {
    const insights: string[] = [];

    insights.push(`📊 Overall sentiment: ${overallSentiment} (${analyses.length} messages analyzed)`);
    insights.push(`📈 Sentiment trend: ${trend}`);

    const complaints = analyses.filter(a => a.isComplaint).length;
    if (complaints > 0) {
      insights.push(`⚠️ ${complaints} complaint(s) detected`);
    }

    const highRisk = analyses.filter(a => a.escalationRisk === 'HIGH').length;
    if (highRisk > 0) {
      insights.push(`🚨 ${highRisk} high escalation risk message(s)`);
    }

    // Top topics
    const topicCounts: Record<string, number> = {};
    analyses.forEach(a => {
      a.topics.forEach(t => {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      });
    });
    const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0];
    if (topTopic) {
      insights.push(`💬 Most discussed topic: ${topTopic[0]} (${topTopic[1]} mentions)`);
    }

    return insights;
  }

  private generateRecommendations(analyses: SentimentResult[], complaints: number, escalationRisks: number): string[] {
    const recommendations: string[] = [];

    if (escalationRisks > 0) {
      recommendations.push('🚨 URGENT: Address high-risk escalations immediately');
      recommendations.push('📞 Call customer within 1 hour to resolve issues');
    }

    if (complaints > 2) {
      recommendations.push('⚠️ Multiple complaints detected - review service quality');
      recommendations.push('🎁 Consider offering compensation or discount');
    }

    const negativeCount = analyses.filter(a => a.sentiment === 'NEGATIVE').length;
    if (negativeCount > analyses.length * 0.3) {
      recommendations.push('📉 High negative sentiment - investigate root causes');
      recommendations.push('🔍 Review recent delivery issues');
    }

    if (analyses.length > 0 && complaints === 0 && escalationRisks === 0) {
      recommendations.push('✅ Customer satisfaction is good - maintain current service levels');
    }

    return recommendations;
  }
}
