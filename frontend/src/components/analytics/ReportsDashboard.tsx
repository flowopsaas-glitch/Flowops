import { useState } from 'react';
import { FileText, Download, Mail, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import { FLOWOPS_API_URL } from '@/lib/env';

export default function ReportsDashboard() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDownload = async () => {
    try {
      setLoading(true);
      setMessage(null);
      const token = localStorage.getItem('access_token');
      
      const response = await axios.get(`${FLOWOPS_API_URL}/reports/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'FlowOps_Analytics_Report.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setMessage({ type: 'success', text: 'PDF downloaded successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to download PDF' });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailReport = async () => {
    if (!email) {
      setMessage({ type: 'error', text: 'Please enter an email address' });
      return;
    }
    
    try {
      setLoading(true);
      setMessage(null);
      const token = localStorage.getItem('access_token');
      
      const response = await axios.post(
        `${FLOWOPS_API_URL}/reports/email`,
        { email },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );

      if (response.data.success) {
        setMessage({ type: 'success', text: `Report sent to ${email}!` });
        setEmail('');
      } else {
        setMessage({ type: 'error', text: response.data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to send email' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Automated Reports</h2>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>Generate and share professional reports</span>
        </div>
      </div>

      {/* Download PDF Card */}
      <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-blue-900/50 rounded-xl border border-blue-800">
                <FileText className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Download PDF Report</h3>
                <p className="text-sm text-gray-400">Generate a comprehensive 30-day analytics report</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs">Includes</div>
                <div className="text-white font-semibold">Revenue Metrics</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs">Includes</div>
                <div className="text-white font-semibold">Delivery KPIs</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs">Includes</div>
                <div className="text-white font-semibold">Route Analysis</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-gray-400 text-xs">Includes</div>
                <div className="text-white font-semibold">Predictive Insights</div>
              </div>
            </div>
          </div>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="ml-4 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 flex items-center gap-2 font-medium shadow-lg transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF
          </button>
        </div>
      </div>

      {/* Email Report Card */}
      <div className="bg-gray-900 rounded-2xl shadow-lg p-6 border border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-purple-900/50 rounded-xl border border-purple-800">
            <Mail className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Email Report</h3>
            <p className="text-sm text-gray-400">Send the PDF report directly to stakeholders</p>
          </div>
        </div>
        
        <div className="flex gap-3 mt-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter recipient email (e.g., investor@company.com)"
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={handleEmailReport}
            disabled={loading || !email}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 flex items-center gap-2 font-medium shadow-lg transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Send Report
          </button>
        </div>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${
          message.type === 'success' 
            ? 'bg-green-900/30 border-green-800 text-green-300' 
            : 'bg-red-900/30 border-red-800 text-red-300'
        }`}>
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      {/* Report Templates Info */}
      <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-2xl p-6 border border-indigo-800/50">
        <h3 className="text-lg font-bold text-white mb-3">📊 Report Contents</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-gray-300">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
              Executive Summary
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
              Key Performance Indicators (KPIs)
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
              Revenue & Financial Metrics
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-gray-300">
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
              Delivery Success Analysis
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
              Top Destinations & Routes
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
              Driver Capacity Insights
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
