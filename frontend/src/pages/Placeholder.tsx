import { useLocation } from 'react-router-dom';
import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../lib/tenantAdminFullAccess';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Zap, Database, Users } from 'lucide-react';

interface PlaceholderProps {
  title?: string;
}

export default function Placeholder({ title }: PlaceholderProps) {
    const location = useLocation();
    const pageName = title || location.pathname.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Page';
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const isUltimateOwner = user?.isUltimateOwner || user?.role === 'ULTIMATE_OWNER';

    return (
        <div className="p-8 flex items-center justify-center min-h-[80vh]">
            <Card className="w-full max-w-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-slate-100 p-4 rounded-full w-fit mb-4">
                        <CheckCircle className="h-12 w-12 text-slate-700" />
                    </div>
                    <CardTitle className="text-3xl font-bold text-slate-900">{pageName}</CardTitle>
                    <CardDescription className="text-lg text-slate-600">
                        This module is under active enhancement and will be fully enabled in the next release.
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                    <p className="text-slate-700 font-medium">
                        The <strong>{pageName}</strong> module is currently in refinement as part of the FlowOps commercial rollout.
                        Please continue using the core production modules while this feature is completed.
                    </p>
                    <div className="bg-white p-4 rounded-lg text-sm text-slate-600 border border-slate-200 text-left space-y-3">
                        <h4 className="font-bold text-slate-800 flex items-center gap-2">
                            <Zap className="h-4 w-4 text-slate-700" />
                            Status Summary:
                        </h4>
                        <ul className="space-y-2 ml-6">
                            <li className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                                <span>Backend Module: <span className="text-slate-700 font-semibold">Planned</span></span>
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                                <span>Database Schema: <span className="text-slate-700 font-semibold">Pending synchronization</span></span>
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                                <span>AI Supervisor: <span className="text-slate-700 font-semibold">Preview integration</span></span>
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                                <span>Package Gating: <span className="text-slate-700 font-semibold">Verification in progress</span></span>
                            </li>
                            <li className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                                <span>User Access: <span className="text-slate-700 font-semibold">Available for preview</span></span>
                            </li>
                        </ul>
                    </div>

                    {isUltimateOwner && (
                        <div className="bg-blue-50 p-4 rounded-lg text-sm border border-blue-200 text-left">
                            <h4 className="font-bold text-blue-900 flex items-center gap-2 mb-2">
                                <Users className="h-4 w-4" />
                                Ultimate Owner Preview
                            </h4>
                            <p className="text-blue-800">
                                Ultimate owners can review this module before its official launch. Feature rollout will be coordinated with production deployment schedules.
                            </p>
                        </div>
                    )}

                    <div className="bg-slate-50 p-4 rounded-lg text-sm border text-left">
                        <h4 className="font-bold text-slate-700 flex items-center gap-2 mb-2">
                            <Database className="h-4 w-4" />
                            Release Note:
                        </h4>
                        <p className="text-slate-600">
                            This page is a placeholder for upcoming functionality. The core FlowOps platform remains fully operational while this module is finalized.
                        </p>
                    </div>

                    <div className="pt-4 text-xs text-slate-500">
                        <p>Status: <span className="font-semibold text-slate-700">Preview</span></p>
                        <p>Last Reviewed: {new Date().toLocaleString()}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

