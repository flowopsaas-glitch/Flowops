import { useState, useEffect, useRef, useCallback } from 'react';
import { driverApi } from '../services/api';

export default function Chat({ driver, onBack }: { driver: any, onBack: () => void }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isDispatchTyping, setIsDispatchTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const typingPollRef = useRef<any>(null);
  const driverId = driver.driverId || driver.id;

  // Fetch messages (with pagination support)
  const fetchMessages = useCallback(async (skip = 0, prepend = false) => {
    if (!driverId) return;
    try {
      if (skip === 0) setLoading(true);
      else setLoadingMore(true);
      
      const res = await driverApi.getMessages(driverId, 50, skip);
      const data = res.data || res;
      const newMsgs = Array.isArray(data) ? data : [];
      
      if (newMsgs.length < 50) setHasMore(false);
      
      if (prepend) {
        setMessages(prev => [...newMsgs.reverse(), ...prev]);
      } else {
        setMessages(newMsgs.reverse());
        // Mark as read on initial load
        driverApi.markAsRead(driverId).catch(console.error);
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [driverId]);

  // Load older messages on scroll to top
  const handleScroll = () => {
    if (messagesContainerRef.current?.scrollTop === 0 && hasMore && !loadingMore) {
      fetchMessages(messages.length, true);
    }
  };

  // Send message (text or file)
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !driverId || sending) return;

    setSending(true);
    try {
      let attachmentUrl, attachmentType;
      if (selectedFile) {
        const uploadRes = await driverApi.uploadFile(selectedFile);
        attachmentUrl = uploadRes.data.url;
        attachmentType = uploadRes.data.type;
      }
      
      await driverApi.sendMessage(driverId, newMessage.trim() || '📎 Attachment', attachmentUrl, attachmentType);
      setNewMessage('');
      setSelectedFile(null);
      await fetchMessages();
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // Typing indicator logic
  const handleTyping = (value: string) => {
    setNewMessage(value);
    driverApi.setTyping(driverId, true).catch(console.error);
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      driverApi.setTyping(driverId, false).catch(console.error);
    }, 2000);
  };

  // Poll for dispatch typing status
  useEffect(() => {
    if (!driverId) return;
    const pollTyping = async () => {
      try {
        const res = await driverApi.getTypingStatus(driverId);
        setIsDispatchTyping(res.data?.isTyping || false);
      } catch (err) {}
    };
    pollTyping();
    typingPollRef.current = setInterval(pollTyping, 1500);
    return () => { if (typingPollRef.current) clearInterval(typingPollRef.current); };
  }, [driverId]);

  // Initial load and polling for new messages
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(() => fetchMessages(), 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Push Notification Request
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Show push notification for new dispatch messages
  useEffect(() => {
    if (document.hidden && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.senderType === 'dispatch' && !lastMsg.readAt) {
        if (Notification.permission === 'granted') {
          new Notification('New message from Dispatch', {
            body: lastMsg.message,
            icon: '/favicon.ico'
          });
        }
      }
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 p-4 flex items-center gap-4 border-b border-slate-700 shadow-lg">
        <button onClick={onBack} className="p-2 hover:bg-slate-700 rounded-lg transition">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Dispatch Chat</h1>
          <p className="text-xs text-slate-400">
            {isDispatchTyping ? (
              <span className="text-green-400 flex items-center gap-1">
                Dispatch is typing<span className="animate-pulse">...</span>
              </span>
            ) : 'Connected to Base'}
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {loadingMore && <div className="text-center text-slate-500 text-sm">Loading older messages...</div>}
        {loading ? (
          <div className="text-center text-slate-500 mt-10">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-slate-500 mt-10">
            <p className="text-4xl mb-2">📭</p>
            <p>No messages yet. Send one below!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.senderType === 'dispatch' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] p-3 rounded-2xl shadow-md ${
                msg.senderType === 'dispatch' ? 'bg-blue-600 text-white rounded-tl-none' : 'bg-slate-700 text-white rounded-tr-none'
              }`}>
                {msg.attachmentUrl && (
                  <div className="mb-2">
                    {msg.attachmentType === 'image' ? (
                      <img src={`https://api.flowop.work${msg.attachmentUrl}`} alt="attachment" className="rounded-lg max-h-48" />
                    ) : (
                      <a href={`https://api.flowop.work${msg.attachmentUrl}`} target="_blank" rel="noopener" className="flex items-center gap-2 bg-slate-800 p-2 rounded text-sm">
                        📎 {msg.message !== '📎 Attachment' ? msg.message : 'Download File'}
                      </a>
                    )}
                  </div>
                )}
                {msg.message !== '📎 Attachment' && <p className="text-sm">{msg.message}</p>}
                <div className="flex items-center justify-end gap-1 mt-1">
                  <p className="text-[10px] opacity-60">
                    {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                  {msg.senderType === 'driver' && (
                    <span className="text-[10px]">{msg.readAt ? '✓✓' : '✓'}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* File Preview */}
      {selectedFile && (
        <div className="bg-slate-800 px-4 py-2 flex items-center gap-2 border-t border-slate-700">
          <span className="text-sm text-slate-300 truncate flex-1">📎 {selectedFile.name}</span>
          <button onClick={() => setSelectedFile(null)} className="text-red-400 text-sm">✕</button>
        </div>
      )}

      {/* Message Input */}
      <form onSubmit={sendMessage} className="bg-slate-800 border-t border-slate-700 p-4">
        <div className="flex gap-2 items-center">
          <label className="cursor-pointer p-2 hover:bg-slate-700 rounded-lg transition">
            <input 
              type="file" 
              className="hidden" 
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              accept="image/*,.pdf,.doc,.docx"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </label>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => handleTyping(e.target.value)}
            placeholder="Type a message to dispatch..."
            className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={(!newMessage.trim() && !selectedFile) || sending}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
