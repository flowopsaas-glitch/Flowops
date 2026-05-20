import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    Play, ShieldCheck, Zap, BarChart3, MessageSquare, 
    Truck, FileCheck, ArrowRight 
} from 'lucide-react';

export default function Demo() {
    const navigate = useNavigate();
    const [activeFeature, setActiveFeature] = useState('supervisor');

    const demoFeatures = {
        supervisor: {
            title: "AI Supervisor God-Mode",
            description: "Experience total platform oversight. The AI monitors every transaction, corrects human errors in real-time, and optimizes logistics flows automatically.",
            icon: ShieldCheck,
            color: "text-blue-600",
            bg: "bg-blue-50",
            highlights: ["Real-time Error Correction", "Automated Workflow Optimization", "Ultimate Owner Oversight"]
        },
        logistics: {
            title: "Hyper-Efficient Logistics",
            description: "From booking to delivery, see how FlowOps automates waybills, route optimization, and driver assignments with zero manual entry.",
            icon: Truck,
            color: "text-green-600",
            bg: "bg-green-50",
            highlights: ["Automated Waybill Generation", "Live Driver Tracking", "Smart Route Optimization"]
        },
        cost: {
            title: "CostTracker PO System",
            description: "Control your liquidity with automated purchase orders and digital approval workflows. Never exceed a budget again.",
            icon: FileCheck,
            color: "text-purple-600",
            bg: "bg-purple-50",
            highlights: ["Digital Approval Workflows", "Real-time Budget Tracking", "Cash Flow Forecasting"]
        },
        whatsapp: {
            title: "WhatsApp Hub Integration",
            description: "Communicate with drivers and customers directly through WhatsApp. Send tracking updates and receive PODs instantly.",
            icon: MessageSquare,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            highlights: ["Instant Tracking Updates", "Direct Driver Chat", "Automated POD Collection"]
        }
    };

    return (
        <div className="min-h-full bg-slate-50 p-8">
            <div className="max-w-6xl mx-auto space-y-12">
                {/* Hero Section */}
                <div className="text-center space-y-4">
                    <Badge variant="outline" className="px-4 py-1 text-blue-600 border-blue-200 bg-blue-50">
                        Interactive Experience
                    </Badge>
                    <h1 className="text-5xl font-extrabold tracking-tight text-slate-900">
                        Experience the Power of <span className="text-blue-600">FlowOps Supreme</span>
                    </h1>
                    <p className="text-xl text-slate-600 max-w-3xl mx-auto">
                        Take a guided tour through the world's most advanced AI-driven logistics and production platform.
                    </p>
                    <div className="flex justify-center gap-4 pt-4">
                        <Button size="lg" className="bg-blue-600 hover:bg-blue-700" onClick={() => navigate('/signup')}>
                            Start Guided Tour <Play className="ml-2 h-4 w-4" />
                        </Button>
                        <Button size="lg" variant="outline" onClick={() => navigate('/login')}>
                            Sign In
                        </Button>
                    </div>
                </div>

                {/* Feature Showcase */}
                <Tabs defaultValue="supervisor" className="w-full" onValueChange={setActiveFeature}>
                    <div className="flex justify-center mb-8">
                        <TabsList className="grid grid-cols-4 w-full max-w-3xl">
                            <TabsTrigger value="supervisor">AI Supervisor</TabsTrigger>
                            <TabsTrigger value="logistics">Logistics</TabsTrigger>
                            <TabsTrigger value="cost">CostTracker</TabsTrigger>
                            <TabsTrigger value="whatsapp">WhatsApp Hub</TabsTrigger>
                        </TabsList>
                    </div>

                    {Object.entries(demoFeatures).map(([key, feature]) => (
                        <TabsContent key={key} value={key}>
                            <Card className="border-none shadow-xl overflow-hidden">
                                <div className="grid md:grid-cols-2">
                                    <div className="p-12 space-y-6">
                                        <div className={`${feature.bg} ${feature.color} p-4 rounded-2xl w-fit`}>
                                            <feature.icon className="h-10 w-10" />
                                        </div>
                                        <h2 className="text-3xl font-bold">{feature.title}</h2>
                                        <p className="text-lg text-slate-600 leading-relaxed">
                                            {feature.description}
                                        </p>
                                        <ul className="space-y-3">
                                            {feature.highlights.map((h, i) => (
                                                <li key={i} className="flex items-center text-slate-700 font-medium">
                                                    <Zap className="h-5 w-5 text-yellow-500 mr-3" />
                                                    {h}
                                                </li>
                                            ))}
                                        </ul>
                                        <Button className="w-full md:w-auto group" onClick={() => navigate('/signup')}>
                                            Try This Feature <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                    </div>
                                    <div className="bg-slate-900 p-8 flex items-center justify-center relative overflow-hidden">
                                        {/* Mock UI Representation */}
                                        <div className="w-full aspect-video bg-slate-800 rounded-lg border border-slate-700 shadow-2xl p-4 space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                                                <div className="flex gap-2">
                                                    <div className="h-3 w-3 rounded-full bg-red-500" />
                                                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                                                    <div className="h-3 w-3 rounded-full bg-green-500" />
                                                </div>
                                                <div className="text-[10px] text-slate-500 font-mono">flowops-supreme-v1.1.3</div>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="h-4 w-3/4 bg-slate-700 rounded animate-pulse" />
                                                <div className="h-20 w-full bg-slate-700/50 rounded border border-slate-600 flex items-center justify-center">
                                                    <BarChart3 className="h-12 w-12 text-blue-500/50" />
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div className="h-12 bg-slate-700 rounded" />
                                                    <div className="h-12 bg-slate-700 rounded" />
                                                    <div className="h-12 bg-slate-700 rounded" />
                                                </div>
                                            </div>
                                        </div>
                                        {/* Decorative Elements */}
                                        <div className="absolute -bottom-12 -right-12 h-64 w-64 bg-blue-600/10 rounded-full blur-3xl" />
                                        <div className="absolute -top-12 -left-12 h-64 w-64 bg-purple-600/10 rounded-full blur-3xl" />
                                    </div>
                                </div>
                            </Card>
                        </TabsContent>
                    ))}
                </Tabs>

                {/* Social Proof / Stats */}
                <div className="grid md:grid-cols-3 gap-8 text-center">
                    <div className="space-y-2">
                        <div className="text-4xl font-bold text-blue-600">45%</div>
                        <p className="text-slate-600 font-medium">Average Efficiency Increase</p>
                    </div>
                    <div className="space-y-2">
                        <div className="text-4xl font-bold text-blue-600">Zero</div>
                        <p className="text-slate-600 font-medium">Manual Data Entry Errors</p>
                    </div>
                    <div className="space-y-2">
                        <div className="text-4xl font-bold text-blue-600">24/7</div>
                        <p className="text-slate-600 font-medium">AI Supervisor Monitoring</p>
                    </div>
                </div>

                {/* Call to Action */}
                <Card className="bg-blue-600 text-white border-none shadow-2xl">
                    <CardHeader className="text-center p-12">
                        <CardTitle className="text-4xl font-bold">Ready to Transform Your Operations?</CardTitle>
                        <CardDescription className="text-blue-100 text-xl mt-4">
                            Join the elite companies using FlowOps Supreme to dominate their industry.
                        </CardDescription>
                        <div className="pt-8 flex justify-center gap-4">
                            <Button size="lg" variant="secondary" className="text-blue-600 font-bold" onClick={() => navigate('/signup')}>
                                Get Started Now
                            </Button>
                            <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white/10">
                                Schedule a 1-on-1
                            </Button>
                        </div>
                    </CardHeader>
                </Card>
            </div>
        </div>
    );
}


