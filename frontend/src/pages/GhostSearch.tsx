import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

interface SearchFilters {
  query: string;
  dateRange: 'today' | 'week' | 'month' | 'custom';
  minWeight?: number;
  maxWeight?: number;
  zone?: string;
  status?: string;
  ocrConfidence?: number;
}

export default function GhostSearch() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    dateRange: 'month',
  });
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<any>({});
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!filters.query.trim()) {
      setError('Enter a search query');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/search/ghost', {
        query: filters.query,
        filters: {
          dateRange: filters.dateRange,
          minWeight: filters.minWeight,
          maxWeight: filters.maxWeight,
          zone: filters.zone,
          status: filters.status,
          ocrConfidence: filters.ocrConfidence,
        },
      });

      setResults(response.data.results || []);
      setFacets(response.data.facets || {});
    } catch (err: any) {
      setError(err.response?.data?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      const response = await api.post('/search/export', {
        results,
        format,
      });
      // Trigger download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `search-results.${format}`);
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🔍 Ghost Search</h1>
          <p className="text-slate-400">Search archived waybills using natural language or filters</p>
        </div>

        {/* Search Bar */}
        <div className="bg-slate-800 rounded-lg p-6 mb-6 border border-slate-700">
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Try: 'Zone 5 waybills over 50kg from last month' or 'failed OCR scans'"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Date Range</label>
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value as any })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Min Weight (kg)</label>
              <input
                type="number"
                value={filters.minWeight || ''}
                onChange={(e) => setFilters({ ...filters, minWeight: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Max Weight (kg)</label>
              <input
                type="number"
                value={filters.maxWeight || ''}
                onChange={(e) => setFilters({ ...filters, maxWeight: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Zone</label>
              <input
                type="text"
                value={filters.zone || ''}
                onChange={(e) => setFilters({ ...filters, zone: e.target.value || undefined })}
                placeholder="e.g., Zone 5"
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              />
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700 text-red-200 rounded flex gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">
                Found {results.length} results
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport('csv')}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
                <button
                  onClick={() => handleExport('excel')}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Excel
                </button>
              </div>
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-700">
                  <tr>
                    <th className="text-left py-2 px-3 text-slate-300">Waybill</th>
                    <th className="text-left py-2 px-3 text-slate-300">Recipient</th>
                    <th className="text-left py-2 px-3 text-slate-300">Weight</th>
                    <th className="text-left py-2 px-3 text-slate-300">Zone</th>
                    <th className="text-left py-2 px-3 text-slate-300">Status</th>
                    <th className="text-left py-2 px-3 text-slate-300">OCR Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                      <td className="py-3 px-3 text-blue-400 font-medium">{result.waybillNumber}</td>
                      <td className="py-3 px-3 text-white">{result.recipient}</td>
                      <td className="py-3 px-3 text-slate-300">{result.weight}kg</td>
                      <td className="py-3 px-3 text-slate-300">{result.zone}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          result.status === 'DELIVERED' ? 'bg-green-900/20 text-green-200' :
                          result.status === 'FAILED' ? 'bg-red-900/20 text-red-200' :
                          'bg-yellow-900/20 text-yellow-200'
                        }`}>
                          {result.status}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="w-full bg-slate-700 rounded h-2">
                          <div
                            className="bg-blue-500 h-2 rounded"
                            style={{ width: `${(result.ocrConfidence || 0) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && !error && (
          <div className="text-center py-12 bg-slate-800 rounded-lg border border-slate-700">
            <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Search archived waybills by entering your query above</p>
          </div>
        )}
      </div>
    </div>
  );
}
