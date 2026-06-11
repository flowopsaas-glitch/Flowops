import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, DollarSign, X } from 'lucide-react';

interface AIChatBilledProps {
  sessionId: number;
  onClose: () => void;
}

export default function AIChatBilled({ sessionId, onClose }: AIChatBilledProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ messageCount: 0, totalCost: 0 });

  useEffect(() => {
    loadSessionStats();
  }, [sessionId]);

  const loadSessionStats = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const API_BASE = import.meta.env.VITE_FLOWOPS_API_URL || 'http://localhost:3000/api/v1';
      
      const response = await fetch(`${API_BASE}/ai-security/session/${sessionId}/stats`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      const data = await response.json();
      setStats({ messageCount: data.messageCount, totalCost: data.totalCost });
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load session stats', err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput('');
    setLoading(true);

    // Add user message to UI
    setMessages(prev => [...prev, { role: 'USER', content: userMessage }]);

    try {
      // TODO: Call your existing AI endpoint here
      // For now, simulate AI response
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const aiResponse = "I'm your AI assistant. How can I help you today?";
      
      setMessages(prev => [...prev, { role: 'ASSISTANT', content: aiResponse }]);
      
      // Refresh stats
      await loadSessionStats();
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl h-[600px] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl">
              <MessageSquare className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">AI Assistant</h3>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <DollarSign className="w-3 h-3" />
                <span>{stats.messageCount} messages • R{stats.totalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                  msg.role === 'USER'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-100'
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                {msg.cost > 0 && (
                  <p className="text-[10px] opacity-70 mt-1">
                    💬 R{msg.cost.toFixed(2)}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 px-4 py-2 rounded-2xl">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/5">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type your message... (R0.50 per message)"
              className="flex-1 px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition"
            >
              Send
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
