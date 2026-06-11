import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { aiClient } from '@/api/aiClient';
import { 
  Shield, 
  Clock, 
  MapPin, 
  DollarSign, 
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Zap
} from 'lucide-react';

export const AIFeaturesDashboard: React.FC = () => {
  const [predictionAccuracy, setPredictionAccuracy] = useState<any>(null);
  const [routingAnalytics, setRoutingAnalytics] = useState<any>(null);
  const [pricingAnalytics, setPricingAnalytics] = useState<any>(null);
  const [sentimentAnalytics, setSentimentAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const [pred, route, price, sentiment] = await Promise.all([
        aiClient.getPredictionAccuracy(30).catch(() => null),
        aiClient.getRoutingAnalytics(30).catch(() => null),
        aiClient.getPricingAnalytics(30).catch(() => null),
        aiClient.getSentimentAnalytics(30).catch(() => null),
      ]);

      setPredictionAccuracy(pred);
      setRoutingAnalytics(route);
      setPricingAnalytics(price);
      setSentimentAnalytics(sentiment);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-gray-200 rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="h-20 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Zap className="text-yellow-500" />
          AI-Powered Features
        </h1>
        <Badge variant="outline" className="text-sm">
          5 Active AI Systems
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Fraud Detection */}
        <Card className="border-l-4 border-l-red-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="text-red-500" />
              Fraud Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Detects fake PODs, reused photos, and manipulated signatures
              </p>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green-500 w-4 h-4" />
                <span className="text-sm font-medium">Active & Monitoring</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-2"
                onClick={() => alert('Use dispatch inbox to analyze PODs')}
              >
                Analyze POD
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Predictive Delivery */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="text-blue-500" />
              Predictive Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {predictionAccuracy ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Accuracy</span>
                    <span className="font-bold">{predictionAccuracy.averageAccuracy}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">On-Time Rate</span>
                    <span className="font-bold">{predictionAccuracy.onTimeRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Predictions</span>
                    <span className="font-bold">{predictionAccuracy.totalPredictions}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No data yet</p>
              )}
              <Button variant="outline" size="sm" className="w-full mt-2">
                View Details
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Smart Routing */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="text-green-500" />
              Smart Routing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {routingAnalytics ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Distance</span>
                    <span className="font-bold">{routingAnalytics.totalDistance} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Fuel Cost</span>
                    <span className="font-bold">R{routingAnalytics.estimatedFuelCost}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Deliveries</span>
                    <span className="font-bold">{routingAnalytics.totalDeliveries}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No data yet</p>
              )}
              <Button variant="outline" size="sm" className="w-full mt-2">
                Optimize Route
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic Pricing */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="text-purple-500" />
              Dynamic Pricing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pricingAnalytics ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Avg Price</span>
                    <span className="font-bold">R{pricingAnalytics.averagePrice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Revenue</span>
                    <span className="font-bold">R{pricingAnalytics.revenue}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Price/km</span>
                    <span className="font-bold">R{pricingAnalytics.pricePerKm}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No data yet</p>
              )}
              <Button variant="outline" size="sm" className="w-full mt-2">
                Calculate Price
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sentiment Analysis */}
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="text-orange-500" />
              Sentiment Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sentimentAnalytics ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Messages</span>
                    <span className="font-bold">{sentimentAnalytics.totalMessages}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Positive</span>
                    <Badge variant="outline" className="text-green-600">
                      {sentimentAnalytics.sentimentDistribution?.positive || 0}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Complaints</span>
                    <Badge variant="outline" className="text-red-600">
                      {sentimentAnalytics.complaintRate}%
                    </Badge>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No data yet</p>
              )}
              <Button variant="outline" size="sm" className="w-full mt-2">
                Analyze
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AI Status */}
        <Card className="border-l-4 border-l-yellow-500 bg-gradient-to-br from-yellow-50 to-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="text-yellow-600" />
              AI Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green-500 w-5 h-5" />
                <span className="font-medium">All 5 Systems Active</span>
              </div>
              <div className="text-sm text-gray-600">
                <p>🇿🇦 Most Advanced Logistics AI in South Africa</p>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-500">
                  Competitive advantage: Fraud prevention, accurate ETAs, fuel savings, dynamic pricing, customer insights
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
