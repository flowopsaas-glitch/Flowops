// frontend/src/components/ui/index.tsx
import React from 'react';

export const Table: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <table className="w-full table-auto border-collapse border border-gray-200 bg-white">{children}</table>
);

export const Button: React.FC<{ children: React.ReactNode; onClick?: () => void; variant?: 'success' | 'destructive' }> = ({ children, onClick, variant }) => {
  let base = 'px-2 py-1 rounded text-white font-semibold';
  if (variant === 'success') base += ' bg-green-500 hover:bg-green-600';
  else if (variant === 'destructive') base += ' bg-red-500 hover:bg-red-600';
  else base += ' bg-blue-500 hover:bg-blue-600';
  return <button className={base} onClick={onClick}>{children}</button>;
};
