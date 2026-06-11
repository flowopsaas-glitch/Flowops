import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, MessageSquare, X, Globe, TrendingUp, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import axios from 'axios';
import { FLOWOPS_API_URL } from '@/lib/env';

export default function AiChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [language, setLanguage] = useState('en');
  const [languages, setLanguages] = useState<any[]>([]);
  const [showLangMenu, setShowLangMenu] = useState(false);
  
  // Voice states
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      loadLanguages();
      if (suggestions.length === 0) getSuggestedQueries();
      initSpeechRecognition();
    }
  }, [isOpen, language]);

  // Initialize Speech Recognition
  const initSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = language === 'en' ? 'en-ZA' : language === 'af' ? 'af-ZA' : 'en-ZA';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setTimeout(() => handleSubmit(undefined, transcript), 500);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      setSpeechSupported(true);
    } else {
      setSpeechSupported(false);
    }
  };

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) {
      alert('Voice recognition is not supported in Firefox. Please use Chrome or Edge for voice input. You can still type your questions and the AI will read responses aloud.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  // Text-to-Speech (Works in Firefox!)
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'en' ? 'en-ZA' : language === 'af' ? 'af-ZA' : 'en-ZA';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const loadLanguages = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${FLOWOPS_API_URL}/ai-query/languages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLanguages(response.data.languages || []);
    } catch (error) {
      setLanguages([
        { code: 'en', name: 'English' },
        { code: 'af', name: 'Afrikaans' },
        { code: 'zu', name: 'isiZulu' },
        { code: 'xh', name: 'isiXhosa' },
      ]);
    }
  };

  const getSuggestedQueries = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.get(`${FLOWOPS_API_URL}/ai-query/suggestions?language=${language}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuggestions(response.data.suggestions || []);
    } catch (error) {
      setSuggestions(['What will revenue be next month?', 'When should we hire more drivers?']);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const query = customQuery || input.trim();
    if (!query || loading) return;

    stopSpeaking();

    setMessages(prev => [...prev, { role: 'user', content: query, timestamp: new Date() }]);
    setInput('');
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        `${FLOWOPS_API_URL}/ai-query/analyze`,
        { query, language },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      
      const aiMessage = {
        role: 'assistant',
        content: response.data.answer,
        timestamp: new Date(),
        predictions: response.data.predictions,
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Auto-speak response
      setTimeout(() => speakText(response.data.answer), 300);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    stopSpeaking();
  };

  const currentLang = languages.find(l => l.code === language) || { code: 'en', name: 'English' };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform z-50"
        title="Ask AI"
      >
        <Bot className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[420px] bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl z-50 flex flex-col" style={{ maxHeight: '650px' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-purple-400" />
          <div>
            <h3 className="font-bold text-white flex items-center gap-2">
              Ask AI
              <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded-full border border-purple-700">
                Llama 3.3
              </span>
            </h3>
            <p className="text-xs text-gray-400">
              {speechSupported ? 'Speak or type your questions' : 'Type questions (voice requires Chrome/Edge)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white flex items-center gap-1 text-xs"
              title="Select language"
            >
              <Globe className="w-4 h-4" />
              <span>{currentLang.code.toUpperCase()}</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[150px] z-50">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setShowLangMenu(false);
                      setSuggestions([]);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-700 text-sm ${
                      language === lang.code ? 'text-purple-400 bg-gray-700/50' : 'text-gray-300'
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {messages.length > 0 && (
            <button onClick={clearChat} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white text-xs">
              Clear
            </button>
          )}
          <button onClick={() => { setIsOpen(false); stopSpeaking(); }} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ minHeight: '300px', maxHeight: '450px' }}>
        {messages.length === 0 ? (
          <div className="text-center py-6">
            <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-xl p-4 border border-purple-800/50 mb-4">
              <TrendingUp className="w-8 h-8 text-purple-400 mx-auto mb-2" />
              <p className="text-white font-semibold text-sm mb-1">Predictive Analytics</p>
              <p className="text-gray-400 text-xs">Ask in {currentLang.name}</p>
            </div>
            {!speechSupported && (
              <div className="bg-amber-900/30 border border-amber-800 rounded-lg p-3 mb-4">
                <p className="text-amber-300 text-xs font-semibold mb-1">🎤 Voice Input</p>
                <p className="text-amber-200 text-xs">For voice recognition, please use Chrome or Edge. Firefox supports text-to-speech only.</p>
              </div>
            )}
            <div className="space-y-2">
              {suggestions.slice(0, 4).map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(undefined, s)}
                  className="block w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] p-3 rounded-lg ${
                    msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100 border border-gray-700'
                  }`}>
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                    <div className="text-xs opacity-60 mt-1">{msg.timestamp.toLocaleTimeString()}</div>
                  </div>
                </div>
                {/* Voice controls for AI messages */}
                {msg.role === 'assistant' && (
                  <div className="flex justify-start mt-1 ml-2">
                    <button
                      onClick={() => isSpeaking ? stopSpeaking() : speakText(msg.content)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isSpeaking ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                      title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
                    >
                      {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    </button>
                  </div>
                )}
                {/* Predictions Card */}
                {msg.predictions && msg.role === 'assistant' && (
                  <div className="mt-2 ml-2 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-purple-700/50 rounded-lg p-3 max-w-[90%]">
                    <div className="flex items-center gap-1 mb-2">
                      <TrendingUp className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-semibold text-purple-300">Predictions</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-900/50 rounded p-2">
                        <div className="text-gray-400">Next Month</div>
                        <div className="text-white font-bold">{msg.predictions.volume.predictedNextMonth} waybills</div>
                        <div className={`text-xs ${msg.predictions.volume.growthRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {msg.predictions.volume.growthRate >= 0 ? '↑' : '↓'} {Math.abs(msg.predictions.volume.growthRate)}%
                        </div>
                      </div>
                      <div className="bg-gray-900/50 rounded p-2">
                        <div className="text-gray-400">Predicted Revenue</div>
                        <div className="text-white font-bold">R{msg.predictions.revenue.predictedNextMonth.toFixed(0)}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded p-2">
                        <div className="text-gray-400">Need to Hire</div>
                        <div className={`font-bold ${msg.predictions.capacity.needToHire ? 'text-amber-400' : 'text-green-400'}`}>
                          {msg.predictions.capacity.needToHire ? 'YES' : 'NO'}
                        </div>
                      </div>
                      <div className="bg-gray-900/50 rounded p-2">
                        <div className="text-gray-400">Peak Day</div>
                        <div className="text-white font-bold text-xs">{msg.predictions.peakDays[0]?.day || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span className="text-gray-300 text-sm">AI is analyzing...</span>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form with Voice */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-800 bg-gray-900 rounded-b-2xl">
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={toggleListening}
            className={`p-2.5 rounded-lg transition-all relative ${
              !speechSupported 
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed' 
                : isListening 
                  ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/50' 
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title={!speechSupported ? 'Voice recognition requires Chrome or Edge' : isListening ? 'Stop listening' : 'Start voice input'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {!speechSupported && (
              <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded whitespace-nowrap border border-gray-700">
                Use Chrome/Edge for voice
              </span>
            )}
          </button>
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? 'Listening...' : `Ask in ${currentLang.name}...`}
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
            disabled={loading || isListening}
          />
          
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
