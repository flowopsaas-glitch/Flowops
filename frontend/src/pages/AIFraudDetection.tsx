import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { aiClient } from '@/api/aiClient';
import { Shield, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export const AIFraudDetection: React.FC = () => {
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [fraudAnalysis, setFraudAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    loadInbox();
  }, []);

  const loadInbox = async () => {
    try {
      setLoading(true);
      const items = await aiClient.getInboxWithFraudAnalysis();
      setInboxItems(items);
    } catch (error) {
      console.error('Failed to load inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeForFraud = async (itemId: string) => {
    try {
      setAnalyzing(true);
      const analysis = await aiClient.analyzeFraud(itemId);
      setFraudAnalysis(analysis);
      setSelectedItem(inboxItems.find(item => item.id === itemId));
    } catch (error) {
      console.error('Fraud analysis failed:', error);
      alert('Failed to analyze for fraud');
    } finally {
      setAnalyzing(false);
    }
  };

  const getFraudScoreColor = (score: number) => {
    if (score >= 70) return 'text-red-600 bg-red-50';
    if (score >= 40) return 'text-orange-600 bg-orange-50';
    return 'text-green-600 bg-green-50';
  };

  const getRiskBadge = (risk: string) => {
    const variants: any = {
      'CRITICAL': 'destructive',
      'HIGH': 'destructive',
      'MEDIUM': 'secondary',
      'LOW': 'outline',
    };
    return variants[risk] || 'outline';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Shield className="text-red-500" />
          AI Fraud Detection
        </h1>
        <Badge variant="outline">🇿🇦 Only Platform in SA</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inbox List */}
        <Card>
          <CardHeader>
            <CardTitle>POD Inbox ({inboxItems.length} items)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-gray-500">Loading...</p>
            ) : inboxItems.length === 0 ? (
              <p className="text-gray-500">No items in inbox</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {inboxItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium">{item.waybillNumber || `Item ${item.id}`}</p>
                      <p className="text-sm text-gray-500">{item.source}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => analyzeForFraud(item.id)}
                      disabled={analyzing}
                    >
                      {analyzing ? 'Analyzing...' : 'Analyze'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analysis Results */}
        <Card>
          <CardHeader>
            <CardTitle>Fraud Analysis Results</CardTitle>
          </CardHeader>
          <CardContent>
            {!fraudAnalysis ? (
              <p className="text-gray-500">Select an item to analyze</p>
            ) : (
              <div className="space-y-4">
                {/* Fraud Score */}
                <div className={`p-4 rounded-lg ${getFraudScoreColor(fraudAnalysis.fraudScore)}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">Fraud Score: {fraudAnalysis.fraudScore}/100</span>
                    {fraudAnalysis.isFraudulent ? (
                      <XCircle className="text-red-600 w-6 h-6" />
                    ) : (
                      <CheckCircle2 className="text-green-600 w-6 h-6" />
                    )}
                  </div>
                  <p className="text-sm mt-2">
                    {fraudAnalysis.fraudScore >= 70
                      ? '🚨 High risk - Reject this POD'
                      : fraudAnalysis.fraudScore >= 40
                      ? '⚠️ Medium risk - Review carefully'
                      : '✅ Low risk - Safe to approve'}
                  </p>
                </div>

                {/* Detected Risks */}
                {fraudAnalysis.risks && fraudAnalysis.risks.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Detected Risks:</h3>
                    <div className="space-y-2">
                      {fraudAnalysis.risks.map((risk: any, idx: number) => (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{risk.type}</span>
                            <Badge variant={getRiskBadge(risk.severity)}>
                              {risk.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">{risk.description}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Confidence: {risk.confidence}%
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {fraudAnalysis.recommendations && fraudAnalysis.recommendations.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Recommendations:</h3>
                    <ul className="space-y-1">
                      {fraudAnalysis.recommendations.map((rec: string, idx: number) => (
                        <li key={idx} className="text-sm flex items-start gap-2">
                          <span className="text-blue-500">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
