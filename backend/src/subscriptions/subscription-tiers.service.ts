import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PlanFeatures {
  name: string;
  monthlyPrice: number;
  setupFee: number;
  maxUsers: number;
  maxWaybillsPerMonth: number;
  features: {
    // Core features
    waybills: boolean;
    dispatch: boolean;
    billing: boolean;
    whatsapp: boolean;
    email: boolean;
    // AI features
    aiFraudDetection: boolean;
    aiPredictiveDelivery: boolean;
    aiSmartRouting: boolean;
    aiDynamicPricing: boolean;
    aiSentimentAnalysis: boolean;
    // Support
    prioritySupport: boolean;
    dedicatedAccountManager: boolean;
  };
}

@Injectable()
export class SubscriptionTiersService {
  private readonly logger = new Logger(SubscriptionTiersService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 💰 Get plan features by tier
   */
  getPlanFeatures(tier: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'): PlanFeatures {
    const plans: Record<string, PlanFeatures> = {
      STARTER: {
        name: 'Starter',
        monthlyPrice: 999, // ZAR
        setupFee: 0,
        maxUsers: 5,
        maxWaybillsPerMonth: 500,
        features: {
          waybills: true,
          dispatch: true,
          billing: true,
          whatsapp: true,
          email: true,
          // No AI features in Starter
          aiFraudDetection: false,
          aiPredictiveDelivery: false,
          aiSmartRouting: false,
          aiDynamicPricing: false,
          aiSentimentAnalysis: false,
          prioritySupport: false,
          dedicatedAccountManager: false,
        },
      },
      PROFESSIONAL: {
        name: 'Professional',
        monthlyPrice: 2499, // ZAR
        setupFee: 1000,
        maxUsers: 20,
        maxWaybillsPerMonth: 5000,
        features: {
          waybills: true,
          dispatch: true,
          billing: true,
          whatsapp: true,
          email: true,
          // AI features included
          aiFraudDetection: true,
          aiPredictiveDelivery: true,
          aiSmartRouting: true,
          aiDynamicPricing: true,
          aiSentimentAnalysis: false,
          prioritySupport: true,
          dedicatedAccountManager: false,
        },
      },
      ENTERPRISE: {
        name: 'Enterprise',
        monthlyPrice: 4999, // ZAR
        setupFee: 2500,
        maxUsers: -1, // Unlimited
        maxWaybillsPerMonth: -1, // Unlimited
        features: {
          waybills: true,
          dispatch: true,
          billing: true,
          whatsapp: true,
          email: true,
          // ALL AI features
          aiFraudDetection: true,
          aiPredictiveDelivery: true,
          aiSmartRouting: true,
          aiDynamicPricing: true,
          aiSentimentAnalysis: true,
          prioritySupport: true,
          dedicatedAccountManager: true,
        },
      },
    };

    return plans[tier] || plans.STARTER;
  }

  /**
   * 🎯 Check if company has access to AI feature
   */
  async hasAIFeature(companyId: number, feature: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) return false;

    const featureMap: Record<string, keyof typeof company> = {
      fraud: 'aiFraudDetectionEnabled',
      predictive: 'aiPredictiveDeliveryEnabled',
      routing: 'aiSmartRoutingEnabled',
      pricing: 'aiDynamicPricingEnabled',
      sentiment: 'aiSentimentAnalysisEnabled',
    };

    const field = featureMap[feature];
    if (!field) return false;

    return Boolean(company[field]);
  }

  /**
   * 🚀 Upgrade company to new tier
   */
  async upgradeTier(companyId: number, newTier: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE') {
    const features = this.getPlanFeatures(newTier);

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        plan: newTier,
        monthlyPrice: features.monthlyPrice,
        // Enable AI features based on tier
        aiFraudDetectionEnabled: features.features.aiFraudDetection,
        aiPredictiveDeliveryEnabled: features.features.aiPredictiveDelivery,
        aiSmartRoutingEnabled: features.features.aiSmartRouting,
        aiDynamicPricingEnabled: features.features.aiDynamicPricing,
        aiSentimentAnalysisEnabled: features.features.aiSentimentAnalysis,
      },
    });

    this.logger.log(`✅ Company ${companyId} upgraded to ${features.name}`);

    return {
      success: true,
      tier: newTier,
      features,
    };
  }

  /**
   * 📊 Get all available plans
   */
  getAllPlans() {
    return {
      plans: [
        this.getPlanFeatures('STARTER'),
        this.getPlanFeatures('PROFESSIONAL'),
        this.getPlanFeatures('ENTERPRISE'),
      ],
    };
  }
}
