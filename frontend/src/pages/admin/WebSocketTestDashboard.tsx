import React, { useState, useCallback } from 'react';
import { usePremiumWebSocket, PremiumBroadcastEvent } from '../../hooks/usePremiumWebSocket';

/**
 * 🧪 WEBSOCKET TESTING DASHBOARD
 * Verify all premium v3.0 broadcast events are working
 */

export function WebSocketTestDashboard() {
  const [events, setEvents] = useState<PremiumBroadcastEvent[]>([]);
  const [companyId, setCompanyId] = useState(1);
  const [driverId, setDriverId] = useState<number | undefined>();
  const [enabled, setEnabled] = useState(true);

  const handleEvent = useCallback((event: PremiumBroadcastEvent) => {
    setEvents(prev => [event, ...prev].slice(0, 50)); // Keep last 50 events
  }, []);

  const { isConnected, emit } = usePremiumWebSocket({
    companyId,
    driverId,
    enabled,
    onEvent: handleEvent,
  });

  const testMockEvent = (eventType: string) => {
    const mockData: Record<string, any> = {
      risk: {
        shipmentId: 123,
        newScore: 85,
        oldScore: 45,
        trend: 'up',
        confidence: 0.98,
        reasons: ['high_weight', 'rural_area'],
        timestamp: new Date().toISOString(),
      },
      shipment: {
        shipmentId: 123,
        oldStatus: 'PENDING',
        newStatus: 'IN_TRANSIT',
        reason: 'driver_assigned',
        timestamp: new Date().toISOString(),
      },
      dispatch: {
        dispatchId: 456,
        driverId: 789,
        shipmentIds: [123, 124, 125],
        zone: 'Zone 5',
        eta: new Date(Date.now() + 3600000).toISOString(),
      },
      location: {
        driverId: 789,
        lat: 28.7041,
        lng: 77.1025,
        accuracy: 5,
        heading: 45,
        speed: 25.5,
        timestamp: new Date().toISOString(),
      },
      geofence: {
        collectionId: 999,
        driverId: 789,
        status: 'entered',
        distance: 15,
        verified: true,
        timestamp: new Date().toISOString(),
      },
      search: {
        query: 'Zone 5 over 50kg',
        results: [
          { waybillNumber: 'WB001', recipient: 'John Doe', status: 'DELIVERED' },
          { waybillNumber: 'WB002', recipient: 'Jane Smith', status: 'IN_TRANSIT' },
        ],
        total: 2,
        timestamp: new Date().toISOString(),
      },
      billing: {
        invoicesCreated: 42,
        totalAmount: 15750.50,
        chargesAttempted: 40,
        chargesSuccessful: 38,
        chargesFailed: 2,
        timestamp: new Date().toISOString(),
      },
    };

    emit(
      `${eventType}-updated`,
      mockData[eventType] || { eventType, timestamp: new Date().toISOString() }
    );
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">🧪 WebSocket Premium v3.0 Test</h1>

        {/* Connection Status */}
        <div className="mb-8 p-4 bg-white rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Connection Status</p>
              <p className="text-2xl font-bold">
                {isConnected() ? (
                  <span className="text-green-600">✅ Connected</span>
                ) : (
                  <span className="text-red-600">❌ Disconnected</span>
                )}
              </p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`px-4 py-2 rounded font-semibold text-white ${
                enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {enabled ? 'Disconnect' : 'Reconnect'}
            </button>
          </div>
        </div>

        {/* Configuration */}
        <div className="mb-8 p-4 bg-white rounded-lg shadow grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Company ID</label>
            <input
              type="number"
              value={companyId}
              onChange={e => setCompanyId(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Driver ID (Optional)</label>
            <input
              type="number"
              value={driverId || ''}
              onChange={e => setDriverId(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="Leave empty to skip"
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
        </div>

        {/* Event Triggers */}
        <div className="mb-8 p-4 bg-white rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">Test Events</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button
              onClick={() => testMockEvent('risk')}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold"
            >
              📊 Risk Score
            </button>
            <button
              onClick={() => testMockEvent('shipment')}
              className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm font-semibold"
            >
              📦 Shipment Status
            </button>
            <button
              onClick={() => testMockEvent('dispatch')}
              className="px-3 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 text-sm font-semibold"
            >
              🚚 Dispatch
            </button>
            <button
              onClick={() => testMockEvent('location')}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-semibold"
            >
              📍 Location
            </button>
            <button
              onClick={() => testMockEvent('geofence')}
              className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-semibold"
            >
              🛡️ Geofence
            </button>
            <button
              onClick={() => testMockEvent('search')}
              className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-semibold"
            >
              🔍 Search
            </button>
            <button
              onClick={() => testMockEvent('billing')}
              className="px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm font-semibold"
            >
              💳 Billing
            </button>
          </div>
        </div>

        {/* Event Stream */}
        <div className="p-4 bg-white rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">
            📨 Event Stream ({events.length})
          </h2>
          <div className="space-y-2 max-h-96 overflow-y-auto bg-gray-900 text-green-400 p-4 rounded font-mono text-sm">
            {events.length === 0 ? (
              <p className="text-gray-500">No events received yet. Send a test event above.</p>
            ) : (
              events.map((event, idx) => (
                <div key={idx} className="border-l-2 border-green-400 pl-2">
                  <span className="text-yellow-400">[{event.timestamp.toLocaleTimeString()}]</span>
                  {' '}
                  <span className="text-blue-400">{event.type}</span>
                  {' '}
                  <span className="text-green-300">
                    {JSON.stringify(event.data).substring(0, 100)}...
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
