import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface AnalyticsProps {
  deliveries: any[];
  collections: any[];
  darkMode: boolean;
}

export default function Analytics({ deliveries, collections, darkMode }: AnalyticsProps) {
  
  // Status distribution
  const statusData = [
    { name: 'Pending', value: collections.length, color: '#f59e0b' },
    { name: 'In Transit', value: deliveries.filter(d => d.status === 'IN_TRANSIT').length, color: '#3b82f6' },
    { name: 'Delivered', value: deliveries.filter(d => d.status === 'DELIVERED').length, color: '#10b981' },
    { name: 'Exception', value: deliveries.filter(d => d.status === 'EXCEPTION').length, color: '#ef4444' },
  ].filter(item => item.value > 0);

  // Daily stats (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const dailyData = last7Days.map(date => {
    const delivered = deliveries.filter(d => {
      const deliveredAt = new Date(d.deliveredAt || d.updatedAt).toISOString().split('T')[0];
      return deliveredAt === date && d.status === 'DELIVERED';
    }).length;
    
    return {
      date: new Date(date).toLocaleDateString('en-ZA', { weekday: 'short' }),
      delivered,
      earnings: delivered * 75,
    };
  });

  const textColor = darkMode ? '#9ca3af' : '#4b5563';
  const gridColor = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  return (
    <div className="space-y-6">
      {/* Status Distribution */}
      <div className={`${darkMode ? 'bg-white/5' : 'bg-white/80'} backdrop-blur-xl border ${darkMode ? 'border-white/10' : 'border-gray-200'} rounded-2xl p-4`}>
        <h3 className={`font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Status Distribution</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={statusData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {statusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: darkMode ? '#1f2937' : '#fff',
                border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                borderRadius: '8px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          {statusData.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
              <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{item.name}: {item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Performance */}
      <div className={`${darkMode ? 'bg-white/5' : 'bg-white/80'} backdrop-blur-xl border ${darkMode ? 'border-white/10' : 'border-gray-200'} rounded-2xl p-4`}>
        <h3 className={`font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Weekly Performance</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" stroke={textColor} fontSize={12} />
            <YAxis stroke={textColor} fontSize={12} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: darkMode ? '#1f2937' : '#fff',
                border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                borderRadius: '8px',
              }}
            />
            <Bar dataKey="delivered" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
