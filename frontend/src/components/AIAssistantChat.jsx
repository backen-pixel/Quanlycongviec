import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Bot, X, Send, Sparkles, Lightbulb, Loader2, ArrowRight, Minimize2, Maximize2, GripVertical } from 'lucide-react';
import useDraggable from '../hooks/useDraggable';

export default function AIAssistantChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const bottomRef = useRef(null);
  const navigate = useNavigate();
  const { pos, dragging, onDragStart, didDrag } = useDraggable('ai_chat', { right: 24, bottom: 88 });

  useEffect(() => {
    if (open && !messages.length) {
      loadSuggestions();
      setMessages([{ role: 'assistant', content: '👋 Chào! Tôi là trợ lý AI TuBep Pro.\n\nGõ "help" để xem lệnh 😊' }]);
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
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post('/assistant/chat', { message: msg, conversation: messages.slice(-10) });
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, action: data.action }]);
      if (data.action?.action === 'suggest') setSuggestions(data.action.suggestions || []);
      if (data.action?.action === 'navigate' && data.action.url) setTimeout(() => { navigate(data.action.url); setOpen(false); }, 2000);
      if (data.created) loadSuggestions();
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ ' + (e.response?.data?.error || e.message) }]);
    }
    setLoading(false);
  };

  const quickActions = [
    { label: '💡 Gợi ý', msg: 'Gợi ý việc cần làm' },
    { label: '📊 Báo cáo', msg: 'Báo cáo tổng quan' },
    { label: '🏗️ Tạo DA', msg: 'Tạo dự án' },
    { label: '🎯 Lead', msg: 'Tạo lead' },
    { label: '👤 KH', msg: 'Tạo KH' },
    { label: '🚀 Auto', msg: 'Luồng tự động' },
    { label: '❓ Help', msg: 'help' },
  ];

  // Collapsed button
  if (!open) {
    return (
      <div style={{ position: 'fixed', right: pos.right, bottom: pos.bottom, zIndex: 50 }}
        className={`w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-full shadow-xl flex items-center justify-center cursor-grab transition-all hover:scale-110 ${dragging ? 'cursor-grabbing opacity-80' : ''}`}
        onMouseDown={onDragStart} onTouchStart={onDragStart} onClick={() => !didDrag() && setOpen(true)}>
        <Bot className="h-6 w-6 pointer-events-none" />
        {suggestions.filter(s => s.priority === 'high').length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse pointer-events-none">!</span>
        )}
      </div>
    );
  }

  // Expanded panel
  return (
    <div style={{ position: 'fixed', right: pos.right, bottom: pos.bottom, zIndex: 50, maxHeight: minimized ? 48 : '75vh' }}
      className={`bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col transition-all ${minimized ? 'w-80' : 'w-96'} ${dragging ? 'opacity-90' : ''}`}>

      {/* Header — drag handle */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-t-2xl cursor-grab select-none shrink-0"
        onMouseDown={onDragStart} onTouchStart={onDragStart}>
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-purple-200" />
          <Bot className="h-5 w-5 text-white" />
          <span className="text-sm font-bold text-white">Trợ lý AI</span>
          <Sparkles className="h-3.5 w-3.5 text-purple-200" />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(!minimized)} className="p-1 hover:bg-white/20 rounded cursor-pointer">
            {minimized ? <Maximize2 className="h-3.5 w-3.5 text-white" /> : <Minimize2 className="h-3.5 w-3.5 text-white" />}
          </button>
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded cursor-pointer">
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Alerts */}
          {suggestions.length > 0 && messages.length <= 1 && (
            <div className="px-3 py-2 border-b bg-amber-50 shrink-0">
              <p className="text-[10px] text-amber-700 font-bold mb-1.5 flex items-center gap-1"><Lightbulb className="h-3 w-3" />Cần chú ý:</p>
              {suggestions.slice(0,3).map((s,i) => (
                <div key={i} onClick={() => s.action && navigate(s.action)} className="flex items-center gap-2 p-1.5 bg-white rounded-lg cursor-pointer hover:bg-amber-100 mb-1">
                  <span className="text-sm">{s.icon}</span>
                  <span className="text-[11px] text-gray-700 flex-1">{s.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" style={{ maxHeight: '45vh' }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'}`}>
                  {m.content}
                  {m.action?.action === 'prompt' && m.action.customers && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-[10px] text-gray-500 mb-1">Chọn KH:</p>
                      <div className="flex flex-wrap gap-1">
                        {m.action.customers.slice(0,8).map(c => (
                          <button key={c.id} onClick={() => sendMessage(`${m.action.type === 'create_lead' ? 'Tạo lead Tủ bếp cho' : 'Tạo dự án Tủ bếp cho'} ${c.name}`)}
                            className="text-[10px] px-2 py-1 bg-white border rounded-full hover:bg-blue-50 cursor-pointer text-gray-700">{c.name}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.action?.action === 'navigate' && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <button onClick={() => { navigate(m.action.url); setOpen(false); }}
                        className="text-[11px] px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" /> Xem chi tiết
                      </button>
                    </div>
                  )}
                  {m.action?.action === 'suggest' && m.action.suggestions?.map((s,idx) => (
                    <div key={idx} onClick={() => navigate(s.action)} className="flex items-center gap-1.5 p-1 mt-1 rounded cursor-pointer hover:bg-gray-200">
                      <span className="text-xs">{s.icon}</span><span className="text-[10px] text-gray-600">{s.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3"><Loader2 className="h-4 w-4 animate-spin text-purple-600" /></div></div>}
            <div ref={bottomRef} />
          </div>

          {/* Quick Actions */}
          {messages.length <= 2 && (
            <div className="px-3 py-2 border-t flex gap-1.5 flex-wrap shrink-0">
              {quickActions.map((q,i) => (
                <button key={i} onClick={() => sendMessage(q.msg)}
                  className="text-[10px] px-2.5 py-1.5 bg-gray-100 hover:bg-purple-100 rounded-full cursor-pointer text-gray-700 font-medium whitespace-nowrap">{q.label}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-2.5 border-t flex items-center gap-2 shrink-0">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="VD: Tạo dự án Tủ bếp cho KH..."
              className="flex-1 h-9 px-3 bg-gray-100 border-0 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              disabled={loading} data-no-drag />
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
