import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import api from '../services/api';

type Msg = { id: string; message: string; senderType: string; createdAt: string };

export default function Chat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await api.get<Msg[]>('/driver-portal/chat/messages');
      setMessages(Array.isArray(data) ? data : []);
    } catch { /* keep last */ }
  };

  useEffect(() => {
    void load();
    api.post('/driver-portal/chat/read', {}).catch(() => undefined);
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setText('');
    try {
      await api.post('/driver-portal/chat/send', { message: body });
      await load();
    } catch {
      setText(body); // restore on failure
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white safe-area-top safe-area-bottom">
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-white/5 border-b border-white/10 p-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl border border-white/10 hover:bg-white/10">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="font-bold">Dispatch Chat</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-gray-400 mt-8 text-sm">No messages yet. Say hello to dispatch 👋</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderType === 'driver';
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : 'bg-white/10 border border-white/10 text-gray-100'}`}>
                  <div>{m.message}</div>
                  <div className={`mt-1 text-[10px] ${mine ? 'text-blue-100/70' : 'text-gray-400'}`}>
                    {new Date(m.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="p-3 border-t border-white/10 bg-white/5 flex items-center gap-2 safe-area-bottom">
        <input
          value={text} onChange={(e) => setText(e.target.value)} placeholder="Message dispatch…"
          className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" disabled={sending || !text.trim()} className="p-3 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-50">
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
