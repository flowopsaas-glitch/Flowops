const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dispatches = [12,19,8,24,17,31,22,28,35,19,41,38];
const maxD = Math.max(...dispatches);

export default function PerformanceCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Bar chart */}
      <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="text-sm font-bold text-white mb-4">Dispatches per Month</div>
        <div className="flex items-end gap-1.5 h-32">
          {dispatches.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-sm transition-all"
                style={{ height: `${(v / maxD) * 100}%`, background: 'linear-gradient(180deg,#6C9EFF,#A78BFA)', minHeight: 4 }} />
              <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{months[i].slice(0,1)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Health indicators */}
      <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="text-sm font-bold text-white mb-4">System Health</div>
        <div className="space-y-3">
          {[
            { label: 'API Response Time', value: 98, color: '#4ADE80' },
            { label: 'Database Load', value: 42, color: '#6C9EFF' },
            { label: 'Storage Usage', value: 67, color: '#FBBF24' },
            { label: 'Active Connections', value: 81, color: '#A78BFA' },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                <span style={{ color }} className="font-bold">{value}%</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
