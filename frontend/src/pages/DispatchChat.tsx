import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageSquare, Send, Phone, Users, Paperclip, X } from 'lucide-react';
import { dispatchChatApi, ChatDriver, ChatMessage } from '../api/dispatchChatApi';

const DispatchChat: React.FC = () => {
  const [drivers, setDrivers] = useState<ChatDriver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<ChatDriver | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [isDriverTyping, setIsDriverTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const typingPollRef = useRef<any>(null);

  useEffect(() => {
    loadDrivers();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (selectedDriver) {
      setMessages([]);
      setHasMore(true);
      fetchMessages(selectedDriver.id, 0, false);
      
      const interval = setInterval(() => fetchMessages(selectedDriver.id, 0, false), 3000);
      
      // Poll typing status
      const pollTyping = async () => {
        try {
          const res = await dispatchChatApi.getTypingStatus(selectedDriver.id);
          setIsDriverTyping(res?.isTyping || false);
        } catch (err) {}
      };
      pollTyping();
      typingPollRef.current = setInterval(pollTyping, 1500);

      // Mark as read
      dispatchChatApi.markAsRead(selectedDriver.id).catch(console.error);

      return () => {
        clearInterval(interval);
        if (typingPollRef.current) clearInterval(typingPollRef.current);
      };
    }
  }, [selectedDriver]);

  const loadDrivers = async () => {
    try {
      setError(null);
      const data = await dispatchChatApi.getActiveDrivers();
      setDrivers(data);
      if (data.length > 0 && !selectedDriver) {
        setSelectedDriver(data[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (driverId: number, skip: number, prepend: boolean) => {
    try {
      if (skip === 0 && !prepend) setLoading(true);
      else setLoadingMore(true);

      const data = await dispatchChatApi.getMessages(driverId, 50, skip);
      const newMsgs = Array.isArray(data) ? data : [];

      if (newMsgs.length < 50) setHasMore(false);

      if (prepend) {
        setMessages(prev => [...newMsgs.reverse(), ...prev]);
      } else {
        setMessages(newMsgs.reverse());
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleScroll = () => {
    if (messagesContainerRef.current?.scrollTop === 0 && hasMore && !loadingMore && selectedDriver) {
      fetchMessages(selectedDriver.id, messages.length, true);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && !selectedFile) || !selectedDriver || sending) return;

    setSending(true);
    try {
      let attachmentUrl, attachmentType;
      if (selectedFile) {
        const uploadRes = await dispatchChatApi.uploadFile(selectedFile);
        attachmentUrl = uploadRes.url;
        attachmentType = uploadRes.type;
      }

      await dispatchChatApi.sendMessage(
        selectedDriver.id,
        message.trim() || '📎 Attachment',
        attachmentUrl,
        attachmentType
      );

      setMessage('');
      setSelectedFile(null);
      await fetchMessages(selectedDriver.id, 0, false);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleTyping = (value: string) => {
    setMessage(value);
    if (selectedDriver) {
      dispatchChatApi.setTyping(selectedDriver.id, true).catch(console.error);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        dispatchChatApi.setTyping(selectedDriver.id, false).catch(console.error);
      }, 2000);
    }
  };

  // Push notifications for new driver messages
  useEffect(() => {
    if (document.hidden && messages.length > 0 && selectedDriver) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.senderType === 'driver' && !lastMsg.readAt) {
        if (Notification.permission === 'granted') {
          new Notification(`New message from ${selectedDriver.name}`, {
            body: lastMsg.message,
            icon: '/favicon.ico'
          });
        }
      }
    }
  }, [messages, selectedDriver]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading && !selectedDriver) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="animate-pulse">Loading dispatch chat...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-gray-800 bg-gray-900/50">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-green-500" /> Dispatch Chat
        </h1>
        <p className="text-gray-400 text-sm mt-1">Real-time communication with drivers</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Driver Sidebar */}
        <div className="w-80 border-r border-gray-800 bg-gray-900/30 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="w-3 h-3" /> Active Drivers ({drivers.length})
            </h3>
            {drivers.length === 0 ? (
              <div className="text-center text-gray-600 py-8">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No active drivers</p>
              </div>
            ) : (
              drivers.map((driver) => (
                <div
                  key={driver.id}
                  onClick={() => setSelectedDriver(driver)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors mb-2 ${
                    selectedDriver?.id === driver.id
                      ? 'bg-blue-600/20 border border-blue-500/50'
                      : 'hover:bg-gray-800/50 border border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                    {driver.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{driver.name}</div>
                    <div className="text-xs text-gray-500 truncate">{driver.vehicleReg}</div>
                    <div className={`text-xs mt-1 ${
                      driver.status === 'EN_ROUTE' ? 'text-blue-400' :
                      driver.status === 'ON_DUTY' ? 'text-green-400' :
                      'text-yellow-400'
                    }`}>
                      {driver.status}
                    </div>
                  </div>
                  <Phone className="w-4 h-4 text-gray-600" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-gray-950">
          {selectedDriver ? (
            <>
              {/* Chat Header with Typing Indicator */}
              <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between">
                <div>
                  <div className="text-white font-medium">{selectedDriver.name}</div>
                  {isDriverTyping ? (
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      {selectedDriver.name} is typing<span className="animate-pulse">...</span>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">Connected</div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div 
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-6 space-y-4"
              >
                {loadingMore && (
                  <div className="text-center text-gray-500 text-sm py-2">Loading older messages...</div>
                )}
                {loading ? (
                  <div className="text-center text-gray-600 py-12">
                    <div className="animate-pulse">Loading messages...</div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-gray-600 py-12">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No messages yet</p>
                    <p className="text-xs mt-1">Start a conversation with {selectedDriver.name}</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.senderType === 'driver' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-md px-4 py-3 rounded-2xl ${
                        msg.senderType === 'driver'
                          ? 'bg-gray-800 text-white rounded-tl-none'
                          : 'bg-blue-600 text-white rounded-tr-none'
                      }`}>
                        {msg.attachmentUrl && (
                          <div className="mb-2">
                            {msg.attachmentType === 'image' ? (
                              <img 
                                src={`https://api.flowop.work${msg.attachmentUrl}`} 
                                alt="attachment" 
                                className="rounded-lg max-h-48 cursor-pointer hover:opacity-90"
                                onClick={() => window.open(`https://api.flowop.work${msg.attachmentUrl}`, '_blank')}
                              />
                            ) : (
                              <a 
                                href={`https://api.flowop.work${msg.attachmentUrl}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 bg-gray-700/50 p-2 rounded text-xs hover:bg-gray-700"
                              >
                                📎 {msg.message !== '📎 Attachment' ? msg.message : 'Download File'}
                              </a>
                            )}
                          </div>
                        )}
                        {msg.message !== '📎 Attachment' && (
                          <div className="text-sm">{msg.message}</div>
                        )}
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <div className="text-[10px] opacity-60">
                            {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                          {msg.senderType === 'dispatch' && (
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
                <div className="bg-gray-900/50 px-4 py-2 flex items-center gap-2 border-t border-gray-800">
                  <span className="text-sm text-gray-300 truncate flex-1">📎 {selectedFile.name}</span>
                  <button onClick={() => setSelectedFile(null)} className="text-red-400 hover:text-red-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Input Area */}
              <form onSubmit={handleSend} className="p-4 border-t border-gray-800 bg-gray-900/50">
                <div className="flex gap-3 items-center">
                  <label className="cursor-pointer p-2 hover:bg-gray-800 rounded-lg transition-colors">
                    <input 
                      type="file" 
                      className="hidden" 
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      accept="image/*,.pdf,.doc,.docx"
                    />
                    <Paperclip className="w-5 h-5 text-gray-400 hover:text-white" />
                  </label>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => handleTyping(e.target.value)}
                    placeholder={`Message ${selectedDriver.name}...`}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={(!message.trim() && !selectedFile) || sending}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" /> {sending ? '...' : 'Send'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">Select a driver to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DispatchChat;
