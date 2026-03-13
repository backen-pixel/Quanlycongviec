import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Bot, X, Send, Sparkles, Lightbulb, ChevronDown, Loader2, ArrowRight, Minimize2, Maximize2 } from 'lucide-react';

export default function AIAssistantChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Load suggestions on open
  useEffect(() => {
    if (open && !messages.length) {
      loadSuggestions();
      setMessages([{ role: 'assistant', content: '👋 Xin chào! Tôi là trợ lý AI của TuBep Pro.\n\nTôi có thể:\n• Gợi ý việc cần làm tiếp\n• Tạo dự án, lead, báo giá\n• Báo cáo nhanh\n• Trả lời câu hỏi\n\nHỏi gì đi! 😊' }]);
    }
  }, [open]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadSuggestions = async () => {
    try { const { data } = await api.get('/assistant/suggestions'); setSuggestions(data.suggestions || []); } catch {}
  };

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const conversation = messages.slice(-10);
      const { data } = await api.post('/assistant/chat', { message: msg, conversation });

      const botMsg = { role: 'assistant', content: data.reply, action: data.action };
      setMessages(prev => [...prev, botMsg]);

      // Handle actions from backend
      if (data.action?.action === 'suggest') {
        setSuggestions(data.action.suggestions || []);
      }
      if (data.action?.action === 'navigate' && data.action.url) {
        setTimeout(() => { navigate(data.action.url); setOpen(false); }, 1500);
      }
      if (data.created) {
        // Refresh suggestions after creating something
        loadSuggestions();
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Lỗi: ' + (e.response?.data?.error || e.message) }]);
    }
    setLoading(false);
  };

  const executeAction = async (action, actionData) => {
    setLoading(true);
    try {
      const { data } = await api.post('/assistant/execute', { action, data: actionData });
      setMessages(prev => [...prev, { role: 'assistant', content: data.message || '✅ Đã thực hiện!' }]);
      if (data.project) {
        setTimeout(() => navigate(`/projects/${data.project.id}`), 1500);
      } else if (data.lead) {
        setTimeout(() => navigate(`/crm/leads/${data.lead.id}`), 1500);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ ' + (e.response?.data?.error || e.message) }]);
    }
    setLoading(false);
  };

  // Quick actions
  const quickActions = [
    { label: 'Gợi ý việc cần làm', icon: '💡', msg: 'Gợi ý việc cần làm tiếp theo' },
    { label: 'Báo cáo nhanh', icon: '📊', msg: 'Báo cáo tổng quan' },
    { label: 'Quá hạn?', icon: '⚠️', msg: 'Có gì quá hạn không?' },
    { label: 'Tạo dự án', icon: '🏗️', msg: 'Tạo dự án mới' },
  ];

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-50 w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-full shadow-xl flex items-center justify-center cursor-pointer transition-all hover:scale-110 group">
        <Bot className="h-6 w-6" />
        {suggestions.filter(s => s.priority === 'high').length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
            {suggestions.filter(s => s.priority === 'high').length}
          </span>
        )}
        <span className="absolute left-16 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">Trợ lý AI</span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 left-6 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col transition-all ${minimized ? 'w-80 h-12' : 'w-96'}`}
      style={{ maxHeight: minimized ? '48px' : '75vh' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-t-2xl cursor-pointer shrink-0"
        onClick={() => setMinimized(!minimized)}>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-white" />
          <span className="text-sm font-bold text-white">Trợ lý AI</span>
          <Sparkles className="h-3.5 w-3.5 text-purple-200" />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={e => { e.stopPropagation(); setMinimized(!minimized); }} className="p-1 hover:bg-white/20 rounded cursor-pointer">
            {minimized ? <Maximize2 className="h-3.5 w-3.5 text-white" /> : <Minimize2 className="h-3.5 w-3.5 text-white" />}
          </button>
          <button onClick={e => { e.stopPropagation(); setOpen(false); }} className="p-1 hover:bg-white/20 rounded cursor-pointer">
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Suggestion Pills */}
          {suggestions.length > 0 && messages.length <= 1 && (
            <div className="px-3 py-2 border-b bg-amber-50 shrink-0">
              <p className="text-[10px] text-amber-700 font-bold mb-1.5 flex items-center gap-1"><Lightbulb className="h-3 w-3" />Cần chú ý:</p>
              <div className="space-y-1">
                {suggestions.slice(0, 3).map((s, i) => (
                  <div key={i} onClick={() => s.action && navigate(s.action)} className="flex items-center gap-2 p-1.5 bg-white rounded-lg cursor-pointer hover:bg-amber-100 transition-colors">
                    <span className="text-sm">{s.icon}</span>
                    <span className="text-[11px] text-gray-700 flex-1">{s.message}</span>
                    <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" style={{ maxHeight: '45vh' }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'
                }`}>
                  {m.content}
                  {/* Customer picker for create prompts */}
                  {m.action?.action === 'prompt_create_project' && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-[10px] text-gray-500 mb-1">Chọn KH nhanh:</p>
                      <div className="flex flex-wrap gap-1">
                        {(m.action.customers || []).slice(0, 8).map(c => (
                          <button key={c.id} onClick={() => sendMessage(`Tạo dự án Tủ bếp cho ${c.name}`)}
                            className="text-[10px] px-2 py-1 bg-white border rounded-full hover:bg-blue-50 cursor-pointer text-gray-700">{c.name}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.action?.action === 'prompt_create_lead' && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-[10px] text-gray-500 mb-1">Chọn KH nhanh:</p>
                      <div className="flex flex-wrap gap-1">
                        {(m.action.customers || []).slice(0, 8).map(c => (
                          <button key={c.id} onClick={() => sendMessage(`Tạo lead Tủ bếp cho ${c.name}`)}
                            className="text-[10px] px-2 py-1 bg-white border rounded-full hover:bg-blue-50 cursor-pointer text-gray-700">{c.name}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Navigate button for created items */}
                  {m.action?.action === 'navigate' && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <button onClick={() => { navigate(m.action.url); setOpen(false); }}
                        className="text-[11px] px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" /> Xem chi tiết
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick Actions */}
          {messages.length <= 2 && (
            <div className="px-3 py-2 border-t flex gap-1.5 flex-wrap shrink-0">
              {quickActions.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q.msg)}
                  className="text-[10px] px-2.5 py-1.5 bg-gray-100 hover:bg-purple-100 rounded-full cursor-pointer text-gray-700 font-medium flex items-center gap-1 whitespace-nowrap">
                  <span>{q.icon}</span>{q.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-2.5 border-t flex items-center gap-2 shrink-0">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Hỏi gì đi..."
              className="flex-1 h-9 px-3 bg-gray-100 border-0 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              disabled={loading} />
            <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
              className="w-9 h-9 bg-purple-600 hover:bg-purple-700 text-white rounded-full flex items-center justify-center cursor-pointer disabled:opacity-50 shrink-0">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
