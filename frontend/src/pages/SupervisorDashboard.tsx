import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Users, Clock, CreditCard, ShieldCheck, Activity } from 'lucide-react';

export default function SupervisorDashboard() {
    const [onlineUsers, setOnlineUsers] = useState<any>({ count: 0, users: [] });
    const [contractData, setContractData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // In a real app, these would be API calls
        const fetchData = async () => {
            try {
                // Mocking API response for demonstration
                setOnlineUsers({
                    count: 3,
                    users: [
                        { id: '1', name: 'John Logistics', companyName: 'FastTrack Inc', lastSeen: new Date() },
                        { id: '2', name: 'Sarah Admin', companyName: 'Global Shippers', lastSeen: new Date() },
                        { id: '3', name: 'Mike Driver', companyName: 'FastTrack Inc', lastSeen: new Date() },
                    ]
                });

                setContractData({
                    plan: 'Enterprise',
                    progress: 65,
                    daysRemaining: 124,
                    value: 15000,
                    start: '2025-01-01',
                    end: '2026-01-01'
                });
            } catch (error) {
                console.error('Failed to fetch supervisor data', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">AI Supervisor Oversight</h1>
                    <p className="text-muted-foreground">Real-time platform monitoring and contract tracking.</p>
                </div>
                <Badge variant="outline" className="px-4 py-1 text-blue-600 border-blue-200 bg-blue-50">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Ultimate Mode Active
                </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Online Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{onlineUsers.count}</div>
                        <p className="text-xs text-muted-foreground">Active in the last 5 minutes</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">System Health</CardTitle>
                        <Activity className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">99.9%</div>
                        <p className="text-xs text-muted-foreground">All services operational</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Contract Value</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${contractData?.value.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Annual recurring revenue</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Days to Renewal</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{contractData?.daysRemaining}</div>
                        <p className="text-xs text-muted-foreground">Next renewal: Jan 2026</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Active Sessions</CardTitle>
                        <CardDescription>Currently connected users across all companies.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {onlineUsers.users.map((u: any) => (
                                <div key={u.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                            {u.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{u.name}</p>
                                            <p className="text-xs text-slate-500">{u.companyName}</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                                        Online
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Contract Progress</CardTitle>
                        <CardDescription>Tracking the {contractData?.plan} agreement lifecycle.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>Contract Completion</span>
                                <span className="font-bold">{contractData?.progress}%</span>
                            </div>
                            <Progress value={contractData?.progress} className="h-2" />
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <div className="p-3 bg-slate-50 rounded-lg border text-center">
                                <p className="text-xs text-slate-500 uppercase font-bold">Start Date</p>
                                <p className="text-sm font-medium">{contractData?.start}</p>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg border text-center">
                                <p className="text-xs text-slate-500 uppercase font-bold">End Date</p>
                                <p className="text-sm font-medium">{contractData?.end}</p>
                            </div>
                        </div>
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                            <h4 className="text-sm font-bold text-blue-800 mb-1">AI Insight:</h4>
                            <p className="text-xs text-blue-700">
                                Contract is healthy. Usage patterns suggest a 15% increase in efficiency since the last quarter. 
                                Recommendation: Prepare renewal proposal 60 days before expiration.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
