interface PageSkeletonProps {
  rows?: number;
  type?: 'table' | 'cards' | 'list';
}

export default function PageSkeleton({ rows = 5, type = 'table' }: PageSkeletonProps) {
  if (type === 'cards') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ borderRadius: '12px', padding: '20px', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ width: '60%', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', marginBottom: '12px' }} className="animate-pulse" />
            <div style={{ width: '40%', height: '24px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }} className="animate-pulse" />
            <div style={{ width: '80%', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', marginTop: '12px' }} className="animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{
            borderRadius: '10px', padding: '16px 20px',
            background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', gap: '16px',
          }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)' }} className="animate-pulse" />
            <div style={{ flex: 1 }}>
              <div style={{ width: '45%', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', marginBottom: '6px' }} className="animate-pulse" />
              <div style={{ width: '65%', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)' }} className="animate-pulse" />
            </div>
            <div style={{ width: '60px', height: '20px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }} className="animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  // Default: table skeleton
  return (
    <div style={{ borderRadius: '12px', overflow: 'hidden', background: 'rgba(15,22,45,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', gap: '16px', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ width: `${60 + i * 15}px`, height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }} className="animate-pulse" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: '16px', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: '80px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }} className="animate-pulse" />
          <div style={{ width: '120px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="animate-pulse" />
          <div style={{ width: '100px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="animate-pulse" />
          <div style={{ width: '60px', height: '18px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }} className="animate-pulse" />
          <div style={{ width: '70px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)' }} className="animate-pulse" />
        </div>
      ))}
    </div>
  );
}
