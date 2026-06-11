import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { aiClient } from '@/api/aiClient';
import { DollarSign, Calculator, TrendingUp } from 'lucide-react';

export const AIDynamicPricing: React.FC = () => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [weight, setWeight] = useState('1');
  const [urgency, setUrgency] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [pricing, setPricing] = useState<any>(null);
  const [calculating, setCalculating] = useState(false);

  const calculatePrice = async () => {
    if (!origin || !destination) {
      alert('Please enter origin and destination');
      return;
    }

    try {
      setCalculating(true);
      const result = await aiClient.calculateDynamicPrice({
        origin,
        destination,
        weight: parseFloat(weight) || 1,
        urgency,
      });
      setPricing(result);
    } catch (error) {
      console.error('Pricing calculation failed:', error);
      alert('Failed to calculate price');
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <DollarSign className="text-purple-500" />
          AI Dynamic Pricing
        </h1>
        <Badge variant="outline">Smart Pricing Engine</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calculator Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Calculate Delivery Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Origin</Label>
                <Input
                  placeholder="e.g., Johannesburg"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                />
              </div>

              <div>
                <Label>Destination</Label>
                <Input
                  placeholder="e.g., Cape Town"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>

              <div>
                <Label>Weight (kg)</Label>
                <Input
                  type="number"
                  placeholder="1"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>

              <div>
                <Label>Urgency Level</Label>
                <Select value={urgency} onValueChange={(value: any) => setUrgency(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low - Standard delivery</SelectItem>
                    <SelectItem value="MEDIUM">Medium - Priority</SelectItem>
                    <SelectItem value="HIGH">High - Express</SelectItem>
                    <SelectItem value="URGENT">Urgent - Same day</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={calculatePrice}
                disabled={calculating}
              >
                {calculating ? 'Calculating...' : 'Calculate Price'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              AI-Optimized Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!pricing ? (
              <p className="text-gray-500">Enter delivery details to get AI-calculated price</p>
            ) : (
              <div className="space-y-4">
                {/* Final Price */}
                <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg text-center">
                  <p className="text-sm text-gray-600 mb-2">Recommended Price</p>
                  <p className="text-4xl font-bold text-purple-600">
                    R{pricing.finalPrice.toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Confidence: {pricing.confidence}%
                  </p>
                </div>

                {/* Price Breakdown */}
                <div>
                  <h3 className="font-semibold mb-3">Price Breakdown:</h3>
                  <div className="space-y-2">
                    {pricing.explanation?.map((item: string, idx: number) => (
                      <div key={idx} className="text-sm flex items-start gap-2 p-2 bg-gray-50 rounded">
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Route Info */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-gray-600">Distance</p>
                    <p className="font-semibold">{pricing.distanceKm} km</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Valid Until</p>
                    <p className="font-semibold text-sm">
                      {new Date(pricing.validUntil).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
