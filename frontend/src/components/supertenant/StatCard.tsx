import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  progress: number;
  progressColor: string;
  label: string;
  trend?: string | null;
}

export default function StatCard({ title, value, icon: Icon, iconBg, iconColor, progress, progressColor, label, trend }: StatCardProps) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{title}</div>
          <div className="text-2xl font-black text-white">{value}</div>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
          <Icon size={16} style={{ color: iconColor }} />
        </div>
      </div>
      <div>
        <div className="h-1.5 rounded-full mb-1.5" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%`, background: progressColor }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
          {trend && <span className="text-xs font-bold" style={{ color: '#4ADE80' }}>+{trend}%</span>}
        </div>
      </div>
    </div>
  );
}
