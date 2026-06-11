import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  color?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ icon: Icon, title, description, color = '#6C9EFF', children }: PageHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}15`,
        }}>
          <Icon size={20} color={color} />
        </div>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'white', margin: 0 }}>{title}</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{description}</p>
        </div>
      </div>
      {children && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{children}</div>}
    </div>
  );
}
