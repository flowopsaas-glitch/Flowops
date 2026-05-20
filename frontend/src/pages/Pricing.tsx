import { Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

const plans = [
  {
    name: 'Starter',
    price: 'R 5,499',
    description: 'Perfect for small teams starting out.',
    features: ['5 users', 'Book & track shipments'],
  },
  {
    name: 'Growth',
    price: 'R 7,499',
    description: 'Scale your logistics operations.',
    features: ['10 users', 'Multi-warehouse', 'Capacity planning + analytics', 'Waybills & carrier management'],
    popular: true,
  },
  {
    name: 'Pro',
    price: 'R 11,499',
    description: 'Advanced tools for professionals.',
    features: ['Full platform access', 'Driver app + MRP system', 'Location analysis', 'Workflow automations', 'Custom alerts'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'Tailored solutions for large enterprises.',
    features: ['All Pro features', 'Unlimited users', 'SLA white-labeling', 'Dedicated account manager', 'Onboarding + training'],
  },
];

export default function Pricing() {
  const navigate = useNavigate();

  const handleGetStarted = (planName: string) => {
    navigate('/signup', { state: { selectedPlan: planName } });
  };

  const handleContactSales = () => {
    window.location.href = 'mailto:FlowOps2@proton.me?subject=Enterprise Plan Inquiry';
  };

  const handleGetDemo = () => {
    navigate('/demo');
  };

  return (
    <div className="container mx-auto py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Powerful Logistics Management for South Africa</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Built for South African logistics teams who need powerful tools â€” without SAP-level costs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {plans.map((plan) => (
          <Card key={plan.name} className={`flex flex-col ${plan.popular ? 'border-primary shadow-lg scale-105' : ''}`}>
            <CardHeader>
              {plan.popular && (
                <div className="px-3 py-1 text-xs font-semibold text-primary bg-primary/10 rounded-full w-fit mb-2">
                  Most Popular
                </div>
              )}
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="text-3xl font-bold mb-6">{plan.price}</div>
              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                variant={plan.popular ? 'default' : 'outline'}
                onClick={() => plan.name === 'Enterprise' ? handleContactSales() : handleGetStarted(plan.name)}
              >
                {plan.name === 'Enterprise' ? 'Contact Sales' : 'Get Started'}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-16 text-center">
        <p className="text-muted-foreground">
          Flexible pricing available for NGOs, government, and courier startups.
        </p>
        <div className="mt-4 p-6 bg-accent/50 rounded-lg max-w-md mx-auto">
          <h3 className="font-semibold mb-2">Need Support or Sales?</h3>
          <p className="text-sm mb-4">Contact our team for custom enterprise solutions or technical assistance.</p>
          <a href="mailto:FlowOps2@proton.me" className="text-primary font-medium hover:underline">
            FlowOps2@proton.me
          </a>
        </div>
        <Button variant="link" className="mt-4" onClick={handleGetDemo}>Get a Demo</Button>
      </div>
    </div>
  );
}

