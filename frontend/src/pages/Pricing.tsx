import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Zap, Crown, Rocket } from 'lucide-react';
import axios from 'axios';
import { getToken } from '@/api/api';
import { FLOWOPS_API_URL } from '@/lib/env';

interface PlanFeatures {
  name: string;
  monthlyPrice: number;
  setupFee: number;
  maxUsers: number;
  maxWaybillsPerMonth: number;
  features: {
    waybills: boolean;
    dispatch: boolean;
    billing: boolean;
    whatsapp: boolean;
    email: boolean;
    aiFraudDetection: boolean;
    aiPredictiveDelivery: boolean;
    aiSmartRouting: boolean;
    aiDynamicPricing: boolean;
    aiSentimentAnalysis: boolean;
    prioritySupport: boolean;
    dedicatedAccountManager: boolean;
  };
}

export const Pricing: React.FC = () => {
  const [plans, setPlans] = useState<PlanFeatures[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string>('STARTER');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [plansRes, currentRes] = await Promise.all([
        axios.get(`${FLOWOPS_API_URL}/api/v1/subscriptions/tiers`, { headers }),
        axios.get(`${FLOWOPS_API_URL}/api/v1/subscriptions/tiers/current`, { headers }),
      ]);

      setPlans(plansRes.data.plans);
      setCurrentPlan(currentRes.data.currentPlan);
    } catch (error) {
      console.error('Failed to load plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const upgradePlan = async (tier: string) => {
    try {
      const token = getToken();
      await axios.post(
        `${FLOWOPS_API_URL}/api/v1/subscriptions/tiers/upgrade`,
        { tier },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(`✅ Successfully upgraded to ${tier}!`);
      loadPlans();
    } catch (error) {
      console.error('Upgrade failed:', error);
      alert('Failed to upgrade plan');
    }
  };

  const getIcon = (planName: string) => {
    if (planName === 'Starter') return <Zap className="w-8 h-8 text-blue-500" />;
    if (planName === 'Professional') return <Crown className="w-8 h-8 text-purple-500" />;
    return <Rocket className="w-8 h-8 text-orange-500" />;
  };

  const getBorderColor = (planName: string) => {
    if (planName === 'Starter') return 'border-blue-500';
    if (planName === 'Professional') return 'border-purple-500';
    return 'border-orange-500';
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Loading pricing plans...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2">Choose Your Plan</h1>
        <p className="text-gray-600 text-lg">
          Unlock AI-powered features to dominate the logistics market
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {plans.map((plan) => {
          const isCurrentPlan = plan.name.toUpperCase() === currentPlan;
          const isUpgrade = 
            (currentPlan === 'STARTER' && plan.name !== 'Starter') ||
            (currentPlan === 'PROFESSIONAL' && plan.name === 'Enterprise');

          return (
            <Card 
              key={plan.name} 
              className={`relative border-2 ${getBorderColor(plan.name)} ${
                isCurrentPlan ? 'ring-2 ring-offset-2 ring-green-500' : ''
              }`}
            >
              {isCurrentPlan && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500">
                  Current Plan
                </Badge>
              )}
              
              <CardHeader>
                <div className="text-center">
                  <div className="flex justify-center mb-3">
                    {getIcon(plan.name)}
                  </div>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">R{plan.monthlyPrice}</span>
                    <span className="text-gray-500">/month</span>
                  </div>
                  {plan.setupFee > 0 && (
                    <p className="text-sm text-gray-500 mt-2">
                      + R{plan.setupFee} setup fee
                    </p>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  {/* Limits */}
                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-2">Limits:</p>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        {plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers} Users
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        {plan.maxWaybillsPerMonth === -1 
                          ? 'Unlimited' 
                          : plan.maxWaybillsPerMonth.toLocaleString()} Waybills/month
                      </li>
                    </ul>
                  </div>

                  {/* Core Features */}
                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-2">Core Features:</p>
                    <ul className="space-y-2 text-sm">
                      {Object.entries(plan.features)
                        .filter(([key]) => !key.startsWith('ai') && !key.includes('Support') && !key.includes('Account'))
                        .map(([feature, enabled]) => (
                          <li key={feature} className="flex items-center gap-2">
                            {enabled ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <X className="w-4 h-4 text-red-500" />
                            )}
                            <span className={enabled ? '' : 'text-gray-400'}>
                              {feature.charAt(0).toUpperCase() + feature.slice(1)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>

                  {/* AI Features */}
                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      AI Features:
                    </p>
                    <ul className="space-y-2 text-sm">
                      {Object.entries(plan.features)
                        .filter(([key]) => key.startsWith('ai'))
                        .map(([feature, enabled]) => (
                          <li key={feature} className="flex items-center gap-2">
                            {enabled ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <X className="w-4 h-4 text-red-500" />
                            )}
                            <span className={enabled ? '' : 'text-gray-400'}>
                              {feature.replace('ai', '').replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>

                  {/* Support */}
                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-2">Support:</p>
                    <ul className="space-y-2 text-sm">
                      {plan.features.prioritySupport && (
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-500" />
                          Priority Support
                        </li>
                      )}
                      {plan.features.dedicatedAccountManager && (
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-500" />
                          Dedicated Account Manager
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* CTA Button */}
                  <Button
                    className="w-full mt-4"
                    variant={isCurrentPlan ? 'outline' : 'default'}
                    disabled={isCurrentPlan}
                    onClick={() => upgradePlan(plan.name.toUpperCase())}
                  >
                    {isCurrentPlan ? 'Current Plan' : isUpgrade ? 'Upgrade Now' : 'Select Plan'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* AI Features Showcase */}
      <div className="max-w-7xl mx-auto mt-12">
        <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              🇿🇦 Why FlowOps AI is Unmatched in South Africa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-white rounded-lg">
                <h3 className="font-bold mb-2">🛡️ Fraud Detection</h3>
                <p className="text-sm text-gray-600">
                  AI detects fake PODs, reused photos, and manipulated signatures. 
                  <span className="font-semibold text-red-600"> No other SA platform has this.</span>
                </p>
              </div>
              <div className="p-4 bg-white rounded-lg">
                <h3 className="font-bold mb-2">⏱️ Predictive Delivery</h3>
                <p className="text-sm text-gray-600">
                  Accurate ETAs with 85%+ confidence. Customers know exactly when to expect deliveries.
                </p>
              </div>
              <div className="p-4 bg-white rounded-lg">
                <h3 className="font-bold mb-2">🗺️ Smart Routing</h3>
                <p className="text-sm text-gray-600">
                  Save 20-30% on fuel costs. Increase deliveries per day by 15-25%.
                </p>
              </div>
              <div className="p-4 bg-white rounded-lg">
                <h3 className="font-bold mb-2">💰 Dynamic Pricing</h3>
                <p className="text-sm text-gray-600">
                  AI-optimized pricing based on 8+ factors. Maximize revenue automatically.
                </p>
              </div>
              <div className="p-4 bg-white rounded-lg">
                <h3 className="font-bold mb-2">💬 Sentiment Analysis</h3>
                <p className="text-sm text-gray-600">
                  Analyze customer conversations. Catch issues before they escalate.
                </p>
              </div>
              <div className="p-4 bg-white rounded-lg">
                <h3 className="font-bold mb-2">🚀 Competitive Edge</h3>
                <p className="text-sm text-gray-600">
                  All 5 AI features working together. <span className="font-semibold">Unmatched in SA market.</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
