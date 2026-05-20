import { useState, useEffect } from 'react';
import api from '../lib/api';

export function useCounters() {
  const [counters, setCounters] = useState({ inbox: 0, risks: 0 });

  const fetchCounts = async () => {
    try {
      const { data } = await api.get('/waybills/inbox/counts'); 
      setCounters({
        inbox: data.pendingCount || 0,
        risks: data.riskCount || 0
      });
    } catch (err) {
      console.error("Failed to fetch sidebar counts", err);
    }
  };

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return counters;
}