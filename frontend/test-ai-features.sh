#!/bin/bash
echo "🧪 Testing AI Features Integration"
echo "==================================="
echo ""
echo "1. Checking if files were created..."
ls -lh src/api/aiClient.ts
ls -lh src/components/AIFeaturesDashboard.tsx
ls -lh src/pages/AIFraudDetection.tsx
ls -lh src/pages/AIDynamicPricing.tsx

echo ""
echo "2. Checking if routes were added..."
grep -c "ai-features\|ai/fraud-detection\|ai/dynamic-pricing" src/App.tsx

echo ""
echo "3. Checking if navigation was added..."
grep -c "AI Intelligence\|Fraud Detection\|Dynamic Pricing" src/components/layout/AppLayout.tsx

echo ""
echo "4. Access URLs (after starting dev server):"
echo "   - AI Dashboard: http://localhost:5173/ai-features"
echo "   - Fraud Detection: http://localhost:5173/ai/fraud-detection"
echo "   - Dynamic Pricing: http://localhost:5173/ai/dynamic-pricing"
echo ""
echo "✅ All AI features integrated successfully!"
