import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { WhatsAppThread, WhatsAppMessage } from '../types/whatsapp';

export const WhatsAppChat: React.FC = () => {
  const [threads, setThreads] = useState<WhatsAppThread[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [inputValue, setInputValue] = useState('');

  // 1. Fetch all active conversations
  useEffect(() => {
    const fetchThreads = async () => {
      const res = await axios.get('/api/whatsapp/threads');
      setThreads(res.data);
    };
    fetchThreads();
  }, []);

  // 2. Fetch messages when a thread is clicked
  useEffect(() => {
    if (selectedPhone) {
      const fetchMessages = async () => {
        const res = await axios.get(`/api/whatsapp/messages/${selectedPhone}`);
        setMessages(res.data);
      };
      fetchMessages();
      const interval = setInterval(fetchMessages, 3000); // Auto-refresh every 3s
      return () => clearInterval(interval);
    }
  }, [selectedPhone]);

  const handleSendMessage = async () => {
    if (!inputValue || !selectedPhone) return;
    await axios.post('/api/whatsapp/send', {
      to: selectedPhone,
      message: inputValue,
    });
    setInputValue('');
  };

  return (
    <div className="flex h-[600px] border rounded-lg overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="w-1/3 border-r overflow-y-auto bg-gray-50">
        <div className="p-4 border-b font-bold bg-blue-600 text-white">Active Threads</div>
        {threads.map((t) => (
          <div
            key={t.phone}
            onClick={() => setSelectedPhone(t.phone)}
            className={`p-4 border-b cursor-pointer hover:bg-gray-100 ${selectedPhone === t.phone ? 'bg-blue-50 border-l-4 border-blue-600' : ''}`}
          >
            <p className="font-medium">+{t.phone}</p>
          </div>
        ))}
      </div>

      {/* Main Chat View */}
      <div className="flex-1 flex flex-col">
        {selectedPhone ? (
          <>
            <div className="p-4 border-b font-bold text-gray-700">Chatting with +{selectedPhone}</div>
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-100">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] p-3 rounded-lg shadow-sm ${m.direction === 'outbound' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none'}`}>
                    {m.body}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t flex gap-2">
              <input
                className="flex-1 border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type a manual reply..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <button onClick={handleSendMessage} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Send</button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">Select a conversation to start</div>
        )}
      </div>
    </div>
  );
};
