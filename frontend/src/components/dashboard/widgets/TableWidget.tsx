import React from 'react';

interface TableWidgetProps {
  data: any[];
  columns: { key: string; label: string }[];
  title: string;
}

export const TableWidget: React.FC<TableWidgetProps> = ({ data, columns, title }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6 h-full overflow-auto">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.slice(0, 10).map((row, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              {columns.map(col => (
                <td key={col.key} className="px-4 py-2 text-sm text-gray-900">
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
