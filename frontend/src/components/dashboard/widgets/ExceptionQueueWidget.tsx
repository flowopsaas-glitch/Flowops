import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ExceptionQueueWidgetProps {
  exceptions: any[];
}

export const ExceptionQueueWidget: React.FC<ExceptionQueueWidgetProps> = ({ exceptions }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Exception Queue</h3>
        <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded">
          {exceptions.length} active
        </span>
      </div>
      <div className="space-y-2 overflow-auto max-h-64">
        {exceptions.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No exceptions</div>
        ) : (
          exceptions.map((ex, idx) => (
            <div key={idx} className="flex items-center p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-3" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{ex.waybillNumber}</div>
                <div className="text-xs text-gray-600">{ex.type}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
