import { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  color?: string;
  actionLabel?: string;
  actionPath?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon: Icon, title, description, color = '#6C9EFF', actionLabel, actionPath, onAction }: EmptyStateProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onAction) onAction();
    else if (actionPath) navigate(actionPath);
  };

  return (
    <div style={{
      borderRadius: '16px', padding: '48px 24px', textAlign: 'center',
      background: `${color}05`, border: `1px solid ${color}15`,
    }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}12`,
      }}>
        <Icon size={28} color={color} />
      </div>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>{title}</h3>
      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', maxWidth: '360px', margin: '0 auto', lineHeight: '1.5' }}>
        {description}
      </p>
      {actionLabel && (
        <button onClick={handleClick} style={{
          marginTop: '20px', padding: '10px 20px', borderRadius: '10px',
          fontSize: '13px', fontWeight: 600, color: 'white', border: 'none', cursor: 'pointer',
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
