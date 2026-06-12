// frontend/src/pages/admin/CollectionsDashboard.tsx
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { Button, Table } from '@/components/ui';
import { FLOWOPS_WS_ORIGIN } from '../../lib/env';

interface Parcel { refNumber: string; description: string; weight?: number }
interface Collection { 
  id: string; userId: string; driverId?: string;
  companyName: string; address: string; contactPerson: string;
  parcels: Parcel[]; closingTime: string;
  status: 'pending' | 'scheduled' | 'collected' | 'cancelled';
  driver?: any; user?: any; deleted?: boolean;
}

let socket: Socket;

export default function CollectionsDashboard() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCollections = async () => {
    const res = await axios.get('/api/collections');
    setCollections(res.data);
  };

  useEffect(() => {
    fetchCollections();
    // Connect WebSocket
    socket = io(FLOWOPS_WS_ORIGIN); // NestJS Socket.IO origin (configurable via VITE_API_URL / VITE_WS_ORIGIN)
    socket.on('collectionUpdated', (updated: Collection) => {
      setCollections((prev) => {
        if (updated.deleted) return prev.filter(c => c.id !== updated.id);
        const exists = prev.find(c => c.id === updated.id);
        if (exists) return prev.map(c => c.id === updated.id ? updated : c);
        return [updated, ...prev];
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const updateStatus = async (id: string, status: Collection['status'], driverId?: string) => {
    await axios.patch(`/collections/${id}`, { status, driverId });
    // no need to refresh, WebSocket will update
  };

  const assignDriver = async (id: string) => {
    const driverId = prompt('Enter Driver ID to assign:');
    if (!driverId) return;
    updateStatus(id, 'scheduled', driverId);
  };

  if (loading) return <div className="p-4">Loading collections...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Collections Dashboard (Real-Time)</h1>
      <Table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Contact</th>
            <th>Address</th>
            <th>Parcels</th>
            <th>Closing Time</th>
            <th>Status</th>
            <th>Driver</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {collections.map(c => (
            <tr key={c.id} className="border-b">
              <td>{c.companyName}</td>
              <td>{c.contactPerson}</td>
              <td>{c.address}</td>
              <td>{c.parcels.map(p => <div key={p.refNumber}>{p.refNumber}</div>)}</td>
              <td>{new Date(c.closingTime).toLocaleString()}</td>
              <td className={`font-semibold ${c.status === 'pending' ? 'text-yellow-500' : c.status === 'scheduled' ? 'text-blue-500' : c.status === 'collected' ? 'text-green-500' : 'text-red-500'}`}>
                {c.status}
              </td>
              <td>{c.driver?.name || 'Unassigned'}</td>
              <td className="space-x-2">
                {c.status === 'pending' && <Button onClick={() => assignDriver(c.id)}>Assign Driver</Button>}
                {c.status !== 'cancelled' && <Button onClick={() => updateStatus(c.id, 'cancelled')} variant="destructive">Cancel</Button>}
                {c.status === 'scheduled' && <Button onClick={() => updateStatus(c.id, 'collected')} variant="success">Mark Collected</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
