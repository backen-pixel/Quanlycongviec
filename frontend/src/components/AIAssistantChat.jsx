import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { CRM_KPI_COACH_EVENT, KPI_EXPLAIN_EVENT } from '../lib/kpiPersonalLedgerHints';
import { Bot, X, Send, Sparkles, Lightbulb, Loader2, ArrowRight, Minimize2, Maximize2, GripVertical, MessageCircle, BellRing, RefreshCw, AlertTriangle, Clock, Target, Users } from 'lucide-react';
import useDraggable from '../hooks/useDraggable';

export default function AIAssistantChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [view, setView] = useState('chat');
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState('');
  const bottomRef = useRef(null);
  const navigate = useNavigate();
  const { pos, dragging, onDragStart, didDrag } = useDraggable('ai_chat', { right: 24, bottom: 88 });

  const overdueCount = briefing?.payload?.summary_counts?.overdue_tasks || 0;

  useEffect(() => {
    if (open && !messages.length) {
      loadSuggestions();
      setMessages([{ role: 'assistant', content: '👋 Chào! Tôi là trợ lý AI TuBep Pro.\n\nGõ "help" để xem lệnh 😊' }]);
    }
  }, [open]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const onCrmKpiCoach = (ev) => {
      const d = ev.detail || {};
      if (!d.message) return;
      setOpen(true);
      setMinimized(false);
      setView('chat');
      const userMsg = { role: 'user', content: d.message };
      setMessages((prev) => {
        const welcome =
          prev.length && prev[0]?.role === 'assistant'
            ? prev[0]
            : { role: 'assistant', content: '👋 Chào! Tôi là trợ lý AI TuBep Pro.\n\nGõ "help" để xem lệnh 😊' };
        return [welcome, ...(prev.length > 1 ? prev.slice(1) : []), userMsg];
      });
      setLoading(true);
      void (async () => {
        try {
          const { data } = await api.post('/assistant/chat', {
            message: d.message,
            conversation: [],
            context_pack: d.context_pack || undefined,
          });
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.reply, action: data.action },
          ]);
          if (data.created) loadSuggestions();
        } catch (e) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: '❌ ' + (e.response?.data?.error || e.message) },
          ]);
        } finally {
          setLoading(false);
        }
      })();
    };
    window.addEventListener(CRM_KPI_COACH_EVENT, onCrmKpiCoach);
    window.addEventListener(KPI_EXPLAIN_EVENT, onCrmKpiCoach);
    return () => {
      window.removeEventListener(CRM_KPI_COACH_EVENT, onCrmKpiCoach);
      window.removeEventListener(KPI_EXPLAIN_EVENT, onCrmKpiCoach);
    };
  }, []);

  const loadSuggestions = async () => {
    try { const { data } = await api.get('/assistant/suggestions'); setSuggestions(data.suggestions || []); } catch {}
  };

  const loadBriefing = async (force = false) => {
    setBriefingLoading(true);
    setBriefingError('');
    try {
      const { data } = await api.get('/assistant/me/briefing', { params: force ? { force: 1 } : {} });
      setBriefing(data);
    } catch (e) {
      setBriefingError(e.response?.data?.error || e.message || 'Lỗi tải nhắc nhở');
    } finally {
      setBriefingLoading(false);
    }
  };

  // Tự tải nhắc nhở im lặng khi mở bong bóng (badge trên nút bot)
  useEffect(() => {
    if (open && !briefing && !briefingLoading) {
      void loadBriefing(false);
    }
  }, [open]);

  useEffect(() => {
    if (view === 'briefing' && !briefing && !briefingLoading) {
      void loadBriefing(false);
    }
  }, [view]);

  const openKpiCoachFromBriefing = () => {
    navigate('/crm/dashboard');
    setOpen(false);
  };

  const sendMessage = async (text, opts = {}) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post('/assistant/chat', {
        message: msg,
        conversation: messages.slice(-10),
        ...(opts.context_pack ? { context_pack: opts.context_pack } : {}),
      });
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
    { label: '📊 Báo cáo', msg: 'Báo cáo tổng quan' },
    { label: '⚠️ Quá hạn', msg: 'Quá hạn' },
    { label: '💰 Doanh thu', msg: 'Doanh thu' },
    { label: '🏗️ Tạo DA', msg: 'Tạo dự án' },
    { label: '👤 Tạo KH', msg: 'Tạo khách hàng' },
    { label: '🔍 Tìm', msg: 'Tìm ' },
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
        {(overdueCount > 0 || suggestions.filter(s => s.priority === 'high').length > 0) && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse pointer-events-none text-white">
            {overdueCount > 0 ? overdueCount : '!'}
          </span>
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
          {overdueCount > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
              <AlertTriangle className="h-2.5 w-2.5" /> {overdueCount}
            </span>
          )}
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
          {/* Tabs */}
          <div className="flex border-b border-gray-100 shrink-0">
            <button type="button" onClick={() => setView('chat')}
              className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${view === 'chat' ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/40' : 'text-gray-500 hover:text-gray-700'}`}>
              <MessageCircle className="h-3.5 w-3.5" /> Trò chuyện
            </button>
            <button type="button" onClick={() => setView('briefing')}
              className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${view === 'briefing' ? 'text-fuchsia-700 border-b-2 border-fuchsia-600 bg-fuchsia-50/40' : 'text-gray-500 hover:text-gray-700'}`}>
              <BellRing className="h-3.5 w-3.5" /> Nhắc nhở của tôi
              {overdueCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold">{overdueCount}</span>
              )}
            </button>
          </div>

          {view === 'briefing' && <BriefingPanel
            data={briefing}
            loading={briefingLoading}
            error={briefingError}
            onRefresh={() => loadBriefing(true)}
            onNavigate={(url) => { navigate(url); setOpen(false); }}
            onOpenKpi={openKpiCoachFromBriefing}
            onSwitchToChat={() => setView('chat')}
          />}

          {view === 'chat' && (<>
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
                  {(m.content || '').replace(/\[WIZARD:\w+:\d+\]/g, '').replace(/\[DATA:\w+=.*?\]/g, '').trim()}
                  {m.action?.action === 'prompt' && m.action.customers && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      {m.action.flows?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] text-gray-500 mb-1">📋 Luồng:</p>
                          <div className="flex flex-wrap gap-1">
                            {m.action.flows.map(f => (
                              <span key={f.id} className="text-[10px] px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-indigo-700">{f.name}</span>
                            ))}
                          </div>
                          <p className="text-[9px] text-gray-400 mt-1">_(Dùng luồng + bộ NV mặc định)_</p>
                        </div>
                      )}
                      <p className="text-[10px] text-gray-500 mb-1">👥 Chọn KH:</p>
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
              <button onClick={() => setView('briefing')}
                className="text-[10px] px-2.5 py-1.5 bg-fuchsia-100 hover:bg-fuchsia-200 rounded-full cursor-pointer text-fuchsia-800 font-semibold whitespace-nowrap flex items-center gap-1">
                <BellRing className="h-3 w-3" /> Nhắc tôi hôm nay
              </button>
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
          </>)}
        </>
      )}
    </div>
  );
}

function BriefingPanel({ data, loading, error, onRefresh, onNavigate, onOpenKpi, onSwitchToChat }) {
  const payload = data?.payload || null;
  const counts = payload?.summary_counts || {};
  const overdue = payload?.crm_tasks?.overdue || [];
  const dueSoon = payload?.crm_tasks?.due_soon || [];
  const cskh = payload?.cskh_buckets || [];
  const kpi = payload?.kpi_ledger_month || null;

  return (
    <div className="flex-1 overflow-y-auto min-h-0 bg-gradient-to-b from-fuchsia-50/40 to-white" style={{ maxHeight: '60vh' }}>
      <div className="p-3 space-y-3">
        {/* Header / actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-fuchsia-800 font-semibold">
            <Sparkles className="h-3.5 w-3.5" /> AI phân tích dữ liệu của bạn
          </div>
          <button type="button" onClick={onRefresh} disabled={loading}
            className="text-[10px] px-2 py-1 rounded-full bg-white border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 cursor-pointer disabled:opacity-50 flex items-center gap-1">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
            {error}
          </div>
        )}

        {loading && !payload && (
          <div className="space-y-2">
            <div className="h-5 w-3/4 rounded bg-gray-200/70 animate-pulse" />
            <div className="h-12 w-full rounded bg-gray-200/70 animate-pulse" />
            <div className="h-12 w-full rounded bg-gray-200/70 animate-pulse" />
          </div>
        )}

        {payload && (
          <>
            {/* Summary chips */}
            <div className="grid grid-cols-2 gap-1.5">
              <SummaryChip label="Quá hạn" value={counts.overdue_tasks || 0} tone="red" icon={<AlertTriangle className="h-3 w-3" />} />
              <SummaryChip label="Sắp hạn" value={counts.due_soon_tasks || 0} tone="amber" icon={<Clock className="h-3 w-3" />} />
              <SummaryChip label="CSKH" value={counts.cskh_total || 0} tone="emerald" icon={<Users className="h-3 w-3" />} />
              <SummaryChip label="KPI ròng" value={counts.kpi_net_sum ?? '—'} tone="violet" icon={<Target className="h-3 w-3" />} />
            </div>

            {/* AI reply */}
            {data?.reply && (
              <div className="rounded-xl border border-fuchsia-200 bg-white p-3 text-[12px] leading-relaxed text-gray-800 whitespace-pre-wrap">
                {data.reply}
                {data.source === 'fallback' && (
                  <p className="mt-2 text-[10px] text-gray-400 italic">(Tóm tắt tĩnh — chưa cấu hình OPENAI_API_KEY trên server)</p>
                )}
              </div>
            )}

            {/* Tasks */}
            {(overdue.length > 0 || dueSoon.length > 0) && (
              <div className="rounded-xl border border-gray-200 bg-white p-2.5">
                <p className="text-[10px] font-bold uppercase text-gray-500 mb-1.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Nhiệm vụ cần xử lý
                </p>
                <ul className="space-y-1.5">
                  {[...overdue, ...dueSoon].slice(0, 8).map((t) => (
                    <li key={t.id}>
                      <button type="button"
                        onClick={() => onNavigate(t.lead_id ? `/crm/leads/${t.lead_id}?tab=tasks` : '/crm/tasks')}
                        className="w-full text-left flex items-start gap-2 rounded-lg p-1.5 hover:bg-gray-50 cursor-pointer">
                        <span className={`mt-0.5 inline-block h-1.5 w-1.5 rounded-full shrink-0 ${t.overdue ? 'bg-red-500' : 'bg-amber-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-800 truncate">{t.title}</p>
                          <p className="text-[10px] text-gray-500">
                            {t.lead_code ? `${t.lead_code} · ` : ''}
                            {t.overdue ? `Quá hạn ${Math.abs(t.hours_to_deadline)}h` : `Còn ${t.hours_to_deadline}h`}
                          </p>
                        </div>
                        <ArrowRight className="h-3 w-3 text-gray-400 shrink-0 mt-1" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* KPI */}
            {kpi && (
              <div className="rounded-xl border border-violet-200 bg-white p-2.5">
                <p className="text-[10px] font-bold uppercase text-violet-700 mb-1.5 flex items-center gap-1">
                  <Target className="h-3 w-3" /> KPI sổ cái tháng ({kpi.period_start ? String(kpi.period_start).slice(0, 7) : '—'})
                </p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-lg font-bold ${(kpi.net_sum || 0) > 0 ? 'text-emerald-600' : (kpi.net_sum || 0) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {kpi.net_sum ?? 0}
                  </span>
                  <span className="text-[10px] text-gray-500">điểm ròng · {kpi.lead_count_with_points} lead có điểm</span>
                </div>
                {kpi.top_leads?.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {kpi.top_leads.slice(0, 4).map((l) => (
                      <li key={l.lead_id}>
                        <button type="button" onClick={() => onNavigate(`/crm/leads/${l.lead_id}`)}
                          className="w-full text-left flex items-center gap-2 rounded-lg p-1 hover:bg-violet-50 cursor-pointer">
                          <span className={`text-[10px] font-mono ${l.net > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {l.net > 0 ? `+${l.net}` : l.net}
                          </span>
                          <span className="text-[11px] text-gray-700 truncate flex-1">{l.code || ''} {l.title || ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={onOpenKpi}
                  className="mt-2 w-full text-[10px] px-2 py-1 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-800 font-semibold cursor-pointer flex items-center justify-center gap-1">
                  <Sparkles className="h-3 w-3" /> Phân tích sâu KPI trên Dashboard
                </button>
              </div>
            )}

            {/* CSKH */}
            {cskh.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-white p-2.5">
                <p className="text-[10px] font-bold uppercase text-emerald-700 mb-1.5 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Lead cần chăm lại
                </p>
                <ul className="space-y-1">
                  {cskh.slice(0, 6).map((b) => (
                    <li key={`${b.pipeline_id}-${b.stage_id}-${b.time_bucket}`}>
                      <button type="button" onClick={() => onNavigate(b.nav_url)}
                        className="w-full text-left flex items-center gap-2 rounded-lg p-1.5 hover:bg-emerald-50 cursor-pointer">
                        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">{b.lead_count}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-800 truncate">{b.stage_name} · {b.pipeline_name}</p>
                          <p className="text-[10px] text-gray-500">{b.time_label}</p>
                        </div>
                        <ArrowRight className="h-3 w-3 text-gray-400 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Empty */}
            {!overdue.length && !dueSoon.length && !cskh.length && (kpi?.net_sum ?? 0) === 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-center">
                <p className="text-[12px] text-emerald-800 font-semibold">Mọi thứ ổn áp!</p>
                <p className="text-[10px] text-emerald-700 mt-0.5">Không có nhiệm vụ gấp, không có cảnh báo. Chúc bạn một ngày năng suất.</p>
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              <p className="text-[9px] text-gray-400">
                Cập nhật: {data?.generated_at ? new Date(data.generated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                {data?.cached ? ' · cache 10p' : ''}
              </p>
              <button type="button" onClick={onSwitchToChat}
                className="text-[10px] px-2 py-1 rounded-full text-purple-700 hover:bg-purple-50 cursor-pointer flex items-center gap-1">
                <MessageCircle className="h-3 w-3" /> Hỏi AI thêm
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryChip({ label, value, tone, icon }) {
  const tones = {
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    violet: 'bg-violet-50 border-violet-200 text-violet-800',
  };
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${tones[tone] || 'bg-gray-50 border-gray-200 text-gray-700'}`}>
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide opacity-80">{icon} {label}</div>
      <div className="text-base font-bold leading-tight">{value}</div>
    </div>
  );
}
