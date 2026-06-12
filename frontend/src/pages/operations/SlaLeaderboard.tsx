import { useEffect, useState } from 'react';
import { api } from '../../api/client';

type Entry = {
  driverId: string;
  driverName: string;
  total: number;
  warning: number;
  breached: number;
  escalated: number;
  score: number;
};

export default function SlaLeaderboard({
  companyId,
}: {
  companyId: string;
}) {
  const [data, setData] = useState<Entry[]>([]);

  useEffect(() => {
    api.get<any, any>(`/leaderboard/sla`, { params: { companyId } })
      .then(res => setData(res));
  }, [companyId]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">
        SLA Driver Leaderboard
      </h1>

      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th>Rank</th>
            <th>Driver</th>
            <th>Total</th>
            <th>⚠️</th>
            <th>❌</th>
            <th>🚨</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.driverId} className="border-t">
              <td>{i + 1}</td>
              <td>{d.driverName}</td>
              <td>{d.total}</td>
              <td>{d.warning}</td>
              <td>{d.breached}</td>
              <td>{d.escalated}</td>
              <td className="font-bold">{d.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
