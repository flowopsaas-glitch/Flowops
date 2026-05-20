import React from 'react';
import { Loader2, CheckCircle, Cpu, FileSearch } from 'lucide-react';

export const ExtractionProgress = ({ status }: { status: string }) => {
  const steps = [
    { id: 'PENDING', label: 'Ingested', icon: FileSearch },
    { id: 'EXTRACTING', label: 'AI Analysis', icon: Cpu },
    { id: 'READY', label: 'Verified', icon: CheckCircle },
  ];

  const currentIndex = steps.findIndex(s => s.id === status);
  const progressPercent = ((currentIndex + 1) / steps.length) * 100;

  return (
    <div className="w-full space-y-4 p-6 bg-white/5 rounded-3xl border border-white/10">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">
          Pipeline Status: {status}
        </span>
        <span className="text-[10px] font-black text-white/40">{Math.round(progressPercent)}%</span>
      </div>
      
      {/* 🟢 Progress Track */}
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(59,130,246,0.5)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex justify-between mt-2">
        {steps.map((step, idx) => {
          const isCompleted = idx <= currentIndex;
          const Icon = step.icon;
          return (
            <div key={step.id} className={`flex flex-col items-center gap-2 ${isCompleted ? 'opacity-100' : 'opacity-20'}`}>
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center border ${isCompleted ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'}`}>
                {step.id === 'EXTRACTING' && status === 'EXTRACTING' ? (
                  <Loader2 className="animate-spin text-blue-500" size={14} />
                ) : (
                  <Icon size={14} className={isCompleted ? 'text-blue-500' : 'text-white'} />
                )}
              </div>
              <span className="text-[8px] font-bold text-white uppercase tracking-tighter">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};