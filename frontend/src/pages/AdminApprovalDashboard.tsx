import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, XCircle, Clock, Shield } from 'lucide-react';
import { FLOWOPS_HTTP_ORIGIN } from '@/lib/env';
import { getAccessToken } from '@/lib/session';

interface ApprovalRequest {
  id: string;
  fullName: string;
  email: string;
  companyName: string;
  plan: string;
  generatedUsername: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  approvedAt?: string;
}

export default function AdminApprovalDashboard() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');

  useEffect(() => {
    fetchApprovalRequests();
  }, []);

  const fetchApprovalRequests = async () => {
    try {
      setLoading(true);
      const token = getAccessToken();
      const response = await fetch(`${FLOWOPS_HTTP_ORIGIN}/admin/approval-requests`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch approval requests');
      }

      const data = await response.json();
      setRequests(data);
    } catch (err) {
      setError('Failed to load approval requests');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      setActionLoading(true);
      const token = getAccessToken();
      const response = await fetch(`${FLOWOPS_HTTP_ORIGIN}/admin/approval-requests/${requestId}/approve`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to approve request');
      }

      // Update local state
      setRequests(requests.map(req =>
        req.id === requestId
          ? { ...req, status: 'APPROVED', approvedAt: new Date().toISOString() }
          : req
      ));
      setSelectedRequest(null);
    } catch (err) {
      setError('Failed to approve request');
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!rejectionReason.trim()) {
      setError('Please provide a rejection reason');
      return;
    }

    try {
      setActionLoading(true);
      const token = getAccessToken();
      const response = await fetch(`${FLOWOPS_HTTP_ORIGIN}/admin/approval-requests/${requestId}/reject`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: rejectionReason })
      });

      if (!response.ok) {
        throw new Error('Failed to reject request');
      }

      // Update local state
      setRequests(requests.map(req =>
        req.id === requestId
          ? { ...req, status: 'REJECTED' }
          : req
      ));
      setSelectedRequest(null);
      setRejectionReason('');
    } catch (err) {
      setError('Failed to reject request');
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredRequests = requests.filter(req =>
    filter === 'ALL' ? true : req.status === filter
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-300"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'APPROVED':
        return <Badge variant="outline" className="bg-green-50 text-green-800 border-green-300"><CheckCircle className="w-3 h-3 mr-1" /> Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="outline" className="bg-red-50 text-red-800 border-red-300"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center mb-2">
            <Shield className="h-8 w-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold">Admin Approval Dashboard</h1>
          </div>
          <p className="text-gray-600">Review and approve user subscription requests</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{requests.filter(r => r.status === 'PENDING').length}</div>
                <p className="text-sm text-gray-600">Pending Approvals</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{requests.filter(r => r.status === 'APPROVED').length}</div>
                <p className="text-sm text-gray-600">Approved</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{requests.filter(r => r.status === 'REJECTED').length}</div>
                <p className="text-sm text-gray-600">Rejected</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{requests.length}</div>
                <p className="text-sm text-gray-600">Total Requests</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filter Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(f => (
                <Button
                  key={f}
                  variant={filter === f ? 'default' : 'outline'}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {filteredRequests.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-gray-500">
                  No {filter !== 'ALL' ? filter.toLowerCase() : ''} requests found
                </CardContent>
              </Card>
            ) : (
              filteredRequests.map(request => (
                <Card
                  key={request.id}
                  className={`cursor-pointer transition-all ${
                    selectedRequest?.id === request.id
                      ? 'ring-2 ring-blue-500'
                      : 'hover:shadow-md'
                  }`}
                  onClick={() => setSelectedRequest(request)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{request.fullName}</h3>
                        <p className="text-sm text-gray-600">{request.email}</p>
                        <p className="text-sm text-gray-600">{request.companyName}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="secondary">{request.plan}</Badge>
                          {getStatusBadge(request.status)}
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <p>{new Date(request.requestedAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {selectedRequest && (
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Request Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Full Name</Label>
                    <p className="text-sm text-gray-600">{selectedRequest.fullName}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Email</Label>
                    <p className="text-sm text-gray-600">{selectedRequest.email}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Company</Label>
                    <p className="text-sm text-gray-600">{selectedRequest.companyName}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Plan</Label>
                    <p className="text-sm text-gray-600">{selectedRequest.plan}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Generated Username</Label>
                    <p className="text-sm font-mono text-gray-600">{selectedRequest.generatedUsername}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Requested Date</Label>
                    <p className="text-sm text-gray-600">
                      {new Date(selectedRequest.requestedAt).toLocaleString()}
                    </p>
                  </div>

                  {selectedRequest.status === 'PENDING' && (
                    <div className="space-y-3 pt-4 border-t">
                      <div>
                        <Label htmlFor="reason">Rejection Reason (if rejecting)</Label>
                        <Textarea
                          id="reason"
                          placeholder="Provide a reason for rejection..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApprove(selectedRequest.id)}
                          disabled={actionLoading}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          {actionLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Approve
                        </Button>
                        <Button
                          onClick={() => handleReject(selectedRequest.id)}
                          disabled={actionLoading}
                          variant="destructive"
                          className="flex-1"
                        >
                          {actionLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
