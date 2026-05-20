import React from 'react';

export default function QuotesSkeleton() {
  const styles: Record<string, React.CSSProperties> = {
    skeleton: { 
      height: 48, 
      background: "linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)", 
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
      borderRadius: 8,
      marginBottom: 12
    }
  };

  return (
    <>
      <style>
        {`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}
      </style>
      <div style={{ padding: "12px 0" }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={styles.skeleton} />
        ))}
      </div>
    </>
  );
}
