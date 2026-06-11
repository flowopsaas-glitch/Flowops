import { io, Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';

let socket: Socket;

export default function CollectionsDashboard({ companyId }: { companyId: string }) {
  const [collections, setCollections] = useState([]);

  useEffect(() => {
    / Connect to backend WebSocket server
    socket = io('http:/localhost:3000'); / replace with your backend URL

    / Join this company’s room
    socket.emit('joinCompanyRoom', companyId);

    / Listen for collection updates for this company
    socket.on('collectionUpdated', (updatedCollection: any) => {
      setCollections(prev => {
        const exists = prev.find(c => c.id === updatedCollection.id);
        if (updatedCollection.deleted) return prev.filter(c => c.id !== updatedCollection.id);
        if (exists) return prev.map(c => (c.id === updatedCollection.id ? updatedCollection : c));
        return [updatedCollection, ...prev];
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [companyId]);

  return (
    <div>
      {/* Render collections table */}
    </div>
  );
}
