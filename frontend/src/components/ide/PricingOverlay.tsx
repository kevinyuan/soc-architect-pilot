"use client";

import React from 'react';
import { 
  X, 
  Check, 
  Zap, 
  Building2, 
  Rocket,
  FolderOpen,
  HardDrive,
  Sparkles,
  Users,
  Server,
  ShieldCheck,
  Cpu,
  Headphones,
  Plug,
  Code,
  ScrollText,
  Award,
  Monitor
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PricingOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: 'free' | 'professional' | 'startup' | 'enterprise';
}

interface PlanFeature {
  name: string;
  icon: React.ElementType;
  free: string | boolean;
  professional: string | boolean;
  startup: string | boolean;
  enterprise: string | boolean;
}

const features: PlanFeature[] = [
  {
    name: 'Projects',
    icon: FolderOpen,
    free: '3 projects',
    professional: '50 projects',
    startup: 'Unlimited',
    enterprise: 'Unlimited',
  },
  {
    name: 'Storage',
    icon: HardDrive,
    free: '1 GB',
    professional: '50 GB',
    startup: '500 GB',
    enterprise: '5 TB',
  },
  {
    name: 'AI Generation Credits',
    icon: Sparkles,
    free: '100/month',
    professional: '5,000/month',
    startup: '50,000/month',
    enterprise: 'Unlimited',
  },
  {
    name: 'Team Members',
    icon: Users,
    free: '1 user',
    professional: '1 user',
    startup: '10 users',
    enterprise: 'Unlimited',
  },
  {
    name: 'Desktop App',
    icon: Monitor,
    free: false,
    professional: false,
    startup: true,
    enterprise: true,
  },
  {
    name: 'Local Server Deployment',
    icon: Server,
    free: false,
    professional: false,
    startup: false,
    enterprise: true,
  },
  {
    name: 'DRC Validation',
    icon: ShieldCheck,
    free: true,
    professional: true,
    startup: true,
    enterprise: true,
  },
  {
    name: 'Architecture Generation',
    icon: Cpu,
    free: true,
    professional: true,
    startup: true,
    enterprise: true,
  },
  {
    name: 'Priority Support',
    icon: Headphones,
    free: false,
    professional: 'Email',
    startup: 'Email + Chat',
    enterprise: '24/7 Phone + Dedicated',
  },
  {
    name: 'Custom Integrations',
    icon: Plug,
    free: false,
    professional: false,
    startup: 'Limited',
    enterprise: 'Full',
  },
  {
    name: 'API Access',
    icon: Code,
    free: false,
    professional: 'Basic',
    startup: 'Advanced',
    enterprise: 'Enterprise',
  },
  {
    name: 'Audit Logs',
    icon: ScrollText,
    free: false,
    professional: false,
    startup: '90 days',
    enterprise: 'Unlimited',
  },
  {
    name: 'SLA Guarantee',
    icon: Award,
    free: false,
    professional: false,
    startup: '99.5%',
    enterprise: '99.9%',
  },
];

const plans = [
  {
    id: 'free',
    name: 'Free Trial',
    icon: Check,
    description: 'Try all features for 1 week',
    monthlyPrice: 0,
    yearlyPrice: 0,
    popular: false,
    color: 'gray',
  },
  {
    id: 'professional',
    name: 'Professional',
    icon: Zap,
    description: 'For individual professionals',
    monthlyPrice: 29,
    yearlyPrice: 174, // 50% discount: $29 * 12 * 0.5 = $174/year
    popular: false,
    color: 'blue',
  },
  {
    id: 'startup',
    name: 'Startup',
    icon: Rocket,
    description: 'For growing teams',
    monthlyPrice: 99,
    yearlyPrice: 594, // 50% discount: $99 * 12 * 0.5 = $594/year
    popular: true,
    color: 'purple',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    icon: Building2,
    description: 'For large organizations',
    monthlyPrice: null,
    yearlyPrice: null,
    popular: false,
    color: 'orange',
  },
];

export function PricingOverlay({ isOpen, onClose, currentPlan = 'free' }: PricingOverlayProps) {
  const [selectedPlan, setSelectedPlan] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<'compare' | 'confirm' | 'payment'>('compare');
  const [billingPeriod, setBillingPeriod] = React.useState<'monthly' | 'yearly'>('monthly');

  if (!isOpen) return null;

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId);
    setStep('confirm');
  };

  const handleConfirm = () => {
    setStep('payment');
  };

  const handleBack = () => {
    if (step === 'payment') {
      setStep('confirm');
    } else if (step === 'confirm') {
      setStep('compare');
      setSelectedPlan(null);
    }
  };

  const handleClose = () => {
    setStep('compare');
    setSelectedPlan(null);
    onClose();
  };

  const renderFeatureValue = (value: string | boolean) => {
    if (value === true) {
      return <Check className="h-4 w-4 text-green-500 inline-block" />;
    }
    if (value === false) {
      return <X className="h-4 w-4 text-muted-foreground/30 inline-block" />;
    }
    return <span className="text-xs">{value}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative w-full max-w-7xl h-[90vh] bg-background border rounded-lg shadow-lg flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-6 flex-1">
                <h2 className="text-2xl font-bold">
                  {step === 'compare' && 'Choose Your Plan'}
                  {step === 'confirm' && 'Confirm Your Selection'}
                  {step === 'payment' && 'Complete Payment'}
                </h2>
                
                {/* Billing Period Toggle - Moved to header */}
                {step === 'compare' && (
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "text-sm font-medium",
                      billingPeriod === 'monthly' ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      Monthly
                    </span>
                    <button
                      onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        billingPeriod === 'yearly' ? 'bg-primary' : 'bg-muted'
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                          billingPeriod === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    </button>
                    <span className={cn(
                      "text-sm font-medium",
                      billingPeriod === 'yearly' ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      Yearly
                    </span>
                    <Badge variant="secondary" className="ml-1">Save 50%</Badge>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={handleClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {step === 'compare' && (
                <>
                  {/* Plan Cards - Fixed at top */}
                  <div className="p-6 pb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {plans.map((plan) => {
                        const Icon = plan.icon;
                        return (
                          <Card
                            key={plan.id}
                            className={cn(
                              'relative',
                              plan.popular && 'border-primary shadow-lg'
                            )}
                          >
                            {plan.popular && (
                              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                                Most Popular
                              </Badge>
                            )}
                            <CardHeader>
                              <div className="flex items-center gap-2">
                                <Icon className={cn('h-5 w-5', `text-${plan.color}-500`)} />
                                <CardTitle>{plan.name}</CardTitle>
                              </div>
                              <CardDescription>{plan.description}</CardDescription>
                            </CardHeader>
                            <CardContent>
                              <div className="mb-4">
                                {plan.id === 'free' ? (
                                  <div>
                                    <div className="text-4xl font-bold">Free</div>
                                    <div className="text-sm text-muted-foreground mt-1">1 week trial</div>
                                  </div>
                                ) : plan.monthlyPrice !== null ? (
                                  <div>
                                    <div className="flex items-baseline">
                                      <span className="text-4xl font-bold">
                                        ${billingPeriod === 'monthly' ? plan.monthlyPrice : Math.round(plan.yearlyPrice / 12)}
                                      </span>
                                      <span className="text-muted-foreground ml-2">/month</span>
                                    </div>
                                    {billingPeriod === 'yearly' && (
                                      <div className="text-sm text-muted-foreground mt-1">
                                        ${plan.yearlyPrice}/year (billed annually)
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-2xl font-bold">Contact Sales</div>
                                )}
                              </div>
                            </CardContent>
                            <CardFooter>
                              <Button
                                className="w-full"
                                variant={plan.popular ? 'default' : 'outline'}
                                onClick={() => handleSelectPlan(plan.id)}
                                disabled={currentPlan === plan.id || plan.id === 'free'}
                              >
                                {currentPlan === plan.id ? 'Current Plan' : plan.id === 'free' ? 'Current Plan' : 'Select Plan'}
                              </Button>
                            </CardFooter>
                          </Card>
                        );
                      })}
                    </div>
                  </div>

                  {/* Feature Comparison Table - Scrollable */}
                  <div className="flex-1 overflow-hidden px-6 pb-6">
                    <div className="border rounded-lg overflow-hidden h-full flex flex-col">
                      {/* Fixed Table Header */}
                      <div className="bg-muted">
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="text-left p-4 font-semibold sticky top-0 bg-muted">Features</th>
                              <th className="text-center p-4 font-semibold sticky top-0 bg-muted">Free</th>
                              <th className="text-center p-4 font-semibold sticky top-0 bg-muted">Professional</th>
                              <th className="text-center p-4 font-semibold sticky top-0 bg-muted">Startup</th>
                              <th className="text-center p-4 font-semibold sticky top-0 bg-muted">Enterprise</th>
                            </tr>
                          </thead>
                        </table>
                      </div>
                      {/* Scrollable Table Body */}
                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full">
                          <tbody>
                            {features.map((feature, idx) => {
                              const Icon = feature.icon;
                              return (
                                <tr key={idx} className="border-t">
                                  <td className="p-4 font-medium">
                                    <div className="flex items-center gap-2">
                                      <Icon className="h-4 w-4 text-muted-foreground" />
                                      <span>{feature.name}</span>
                                    </div>
                                  </td>
                                  <td className="p-4 text-center">{renderFeatureValue(feature.free)}</td>
                                  <td className="p-4 text-center">{renderFeatureValue(feature.professional)}</td>
                                  <td className="p-4 text-center">{renderFeatureValue(feature.startup)}</td>
                                  <td className="p-4 text-center">{renderFeatureValue(feature.enterprise)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {step === 'confirm' && selectedPlan && (
                <div className="max-w-2xl mx-auto p-6 overflow-y-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle>Plan Summary</CardTitle>
                      <CardDescription>Review your selected plan</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {(() => {
                        const plan = plans.find((p) => p.id === selectedPlan);
                        if (!plan) return null;
                        const Icon = plan.icon;
                        return (
                          <>
                            <div className="flex items-center gap-4 p-4 border rounded-lg">
                              <Icon className="h-8 w-8 text-primary" />
                              <div className="flex-1">
                                <h3 className="font-semibold text-lg">{plan.name}</h3>
                                <p className="text-sm text-muted-foreground">{plan.description}</p>
                              </div>
                              <div className="text-right">
                                {plan.id === 'free' ? (
                                  <>
                                    <div className="text-2xl font-bold">Free</div>
                                    <div className="text-sm text-muted-foreground">1 week trial</div>
                                  </>
                                ) : plan.monthlyPrice !== null ? (
                                  <>
                                    <div className="text-2xl font-bold">
                                      ${billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {billingPeriod === 'monthly' ? 'per month' : 'per year'}
                                    </div>
                                    {billingPeriod === 'yearly' && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        (${Math.round((plan.yearlyPrice || 0) / 12)}/month)
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-lg font-semibold">Custom Pricing</div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h4 className="font-semibold">What's included:</h4>
                              <ul className="space-y-2">
                                {features.map((feature, idx) => {
                                  const planKey = selectedPlan as 'free' | 'professional' | 'startup' | 'enterprise';
                                  const value = feature[planKey];
                                  if (value === false) return null;
                                  const Icon = feature.icon;
                                  return (
                                    <li key={idx} className="flex items-center gap-2">
                                      <Icon className="h-4 w-4 text-primary shrink-0" />
                                      <span className="text-sm">
                                        {feature.name}: {value === true ? 'Included' : value}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </>
                        );
                      })()}
                    </CardContent>
                    <CardFooter className="flex gap-2">
                      <Button variant="outline" onClick={handleBack} className="flex-1">
                        Back
                      </Button>
                      <Button onClick={handleConfirm} className="flex-1">
                        {selectedPlan === 'enterprise' ? 'Contact Sales' : 'Proceed to Payment'}
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              )}

              {step === 'payment' && selectedPlan && (
                <div className="max-w-2xl mx-auto p-6 overflow-y-auto">
                  <Card>
                    <CardHeader>
                      <CardTitle>Payment Information</CardTitle>
                      <CardDescription>Enter your payment details to complete the upgrade</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-center text-muted-foreground">
                          🚧 Payment integration coming soon
                        </p>
                        <p className="text-xs text-center text-muted-foreground mt-2">
                          This will integrate with Stripe/PayPal for secure payment processing
                        </p>
                      </div>
                    </CardContent>
                    <CardFooter className="flex gap-2">
                      <Button variant="outline" onClick={handleBack} className="flex-1">
                        Back
                      </Button>
                      <Button onClick={handleClose} className="flex-1">
                        Complete Upgrade (Demo)
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
