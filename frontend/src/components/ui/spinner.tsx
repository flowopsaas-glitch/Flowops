import React from 'react';
import { cn } from '@/lib/utils';

export const Spinner = ({ className }: { className?: string }) => (
  <div className={cn("animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900", className)} />
);
