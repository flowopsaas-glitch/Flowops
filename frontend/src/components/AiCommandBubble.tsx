import React, { useState } from 'react';
import { MessageCircle, Send, X, Loader2, Sparkles } from 'lucide-react';

const AiCommandBubble = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);

  const handleSendInstruction = async () => {
    if (!command.trim()) return;
    
    setLoading(true);
    setResponse(null);

    try {
      // Replace with your actual API utility or fetch call
      const res = await fetch('/api/ai/instruct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('flowops.access_token') || ''}` // Use canonical token key
        },
        body: JSON.stringify({ command }),
      });

      const data = await res.json();
      setResponse(data);
      setCommand('');
    } catch (error) {
      setResponse({ response: "System offline. Unable to reach AI controller." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* AI Response / Interaction Window */}
      {isOpen && (
        <div className="mb-4 w-80 bg-white rounded-2xl shadow-2xl border border-blue-50 overflow-hidden transition-all animate-in slide-in-from-bottom-5">
          <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Sparkles size={18} />
              <span className="font-semibold">FlowOps Copilot</span>
            </div>
            <button onClick={() => setIsOpen(false)}><X size={18} /></button>
          </div>

          <div className="p-4 max-h-96 overflow-y-auto">
            {response ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 font-medium">AI Response:</p>
                <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 border border-gray-100">
                  {response.response || response.insight?.insight || "Analysis complete."}
                </div>
                {response.drivers && (
                  <div className="text-xs text-blue-600">
                    Found {response.availableCount} drivers available.
                  </div>
                )}
                <button 
                  onClick={() => setResponse(null)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  Ask something else
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Try: "Check drivers", "Status of deliveries", or "Run system upgrade"
              </p>
            )}
          </div>

          <div className="p-3 border-t bg-gray-50 flex gap-2">
            <input 
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendInstruction()}
              placeholder="Instruct AI..."
              className="flex-1 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button 
              onClick={handleSendInstruction}
              disabled={loading}
              className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:bg-gray-300"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}

      {/* The Actual Bubble Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-blue-600 text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform active:scale-95 flex items-center justify-center"
      >
        <MessageCircle size={28} />
      </button>
    </div>
  );
};

export default AiCommandBubble;
