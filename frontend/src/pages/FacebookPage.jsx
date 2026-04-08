import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  MessageCircle, Users, FileText, MessageSquare, Settings, Send, Search, ExternalLink,
  Link2, Plus, ChevronRight, Bell, Image, Paperclip, RefreshCw, ToggleLeft, ToggleRight,
  X, Trash2, Edit3, UserPlus, Phone, Mail, MoreHorizontal, Check, Copy, Save, Eye, EyeOff,
  Mic, MicOff, File, Camera, Smile, ArrowLeft, BarChart3
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

// ═══════════════════════════════════════════════════════════════
// FACEBOOK INTEGRATION PAGE
// ═══════════════════════════════════════════════════════════════

export default function FacebookPage() {
  const { socket } = useAuth();
  const [tab, setTab] = useState('inbox');
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(() => {
    fetch(`${API}/api/facebook/stats`, { headers: hdr() })
      .then(r => r.ok ? r.json() : {}).then(setStats).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [tab, loadStats]);

  useEffect(() => {
    if (!socket) return;
    const h = () => loadStats();
    socket.on('fb_message', h);
    return () => { socket.off('fb_message', h); };
  }, [socket, loadStats]);

  const tabs = [
    { id: 'inbox', label: 'Hộp thư', icon: MessageCircle, badge: stats?.total_unread },
    { id: 'contacts', label: 'Danh bạ', icon: Users },
    { id: 'analytics', label: 'Phân tích', icon: BarChart3 },
    { id: 'lead-ads', label: 'Lead Ads', icon: FileText, badge: stats?.lead_ads_today },
    { id: 'comments', label: 'Bình luận', icon: MessageSquare, badge: stats?.comments_today },
    { id: 'auto-lead', label: 'Tự động', icon: UserPlus },
    { id: 'logs', label: 'Logs', icon: Eye },
    { id: 'settings', label: 'Cài đặt', icon: Settings },
  ];

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-100">
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-sm">f</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-800">Facebook Messenger</h1>
            <p className="text-[11px] text-gray-400">Quản lý tin nhắn & khách hàng</p>
          </div>
        </div>
        {stats && (
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="bg-blue-50 px-2.5 py-1 rounded-full">📨 {stats.messages_today} hôm nay</span>
            <span className="bg-green-50 px-2.5 py-1 rounded-full">👥 {stats.total_contacts} liên hệ</span>
          </div>
        )}
      </div>

      <div className="border-b bg-white px-6 flex gap-0.5 shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer ${
              tab === t.id ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            <t.icon size={15} />
            {t.label}
            {t.badge > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'inbox' && <InboxTab pageStats={stats?.page_stats} />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'lead-ads' && <LeadAdsTab />}
        {tab === 'comments' && <CommentsTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'auto-lead' && <AutoLeadTab />}
        {tab === 'logs' && <WebhookLogsTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INBOX TAB — Messenger Chat (realtime + media)
// ═══════════════════════════════════════════════════════════════


function PageSelector({ value, onChange, pages, pageStats }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedPage = pages.find(p => p.page_id === value);
  const count = (ps) => (ps?.new_contacts_7d || 0) + (ps?.unread_count || 0);

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} 
        className="w-full text-left text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 flex justify-between items-center hover:bg-gray-50">
        <span className="truncate">{selectedPage ? selectedPage.page_name : 'Tất cả các Page'}</span>
        <ChevronRight size={12} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
          <button onClick={() => { onChange(''); setIsOpen(false); }} 
            className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${!value ? 'bg-blue-50 text-blue-600' : ''}`}>
            Tất cả các Page
          </button>
          {pages.map(p => {
            const ps = pageStats?.find(s => s.page_id === p.page_id);
            const cnt = count(ps);
            return (
              <button key={p.id} onClick={() => { onChange(p.page_id); setIsOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50 ${value === p.page_id ? 'bg-blue-50' : ''}`}>
                <span className="truncate">{p.page_name}</span>
                {cnt > 0 && <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[9px]">{cnt}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InboxTab({ pageStats }) {
  const { socket } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [pageFilter, setPageFilter] = useState('');
  const [pages, setPages] = useState([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const selectedRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  selectedRef.current = selected;

  // Load pages
  useEffect(() => {
    fetch(`${API}/api/facebook/pages`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(setPages).catch(() => {});
  }, []);

  const loadContacts = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (pageFilter) params.set('page_id', pageFilter);
    const qs = params.toString() ? `?${params}` : '';
    fetch(`${API}/api/facebook/contacts${qs}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        // Sort: unread lên trước, rồi theo tin nhắn mới nhất
        const sorted = [...(data || [])].sort((a, b) => {
          // Unread first
          const ua = (a.unread_count || 0) > 0 ? 1 : 0;
          const ub = (b.unread_count || 0) > 0 ? 1 : 0;
          if (ub !== ua) return ub - ua;
          // Then by last_message_at desc
          const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return dateB - dateA;
        });
        setContacts(sorted);
      }).catch(() => {});
  }, [search, pageFilter]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Realtime
  useEffect(() => {
    if (!socket) return;
    const h = (data) => {
      setContacts(prev => {
        const now = data.message?.created_at || new Date().toISOString();
        const ex = prev.find(c => c.id === data.contact_id);
        if (ex) {
          const up = { ...ex, last_message_at: now,
            unread_count: selectedRef.current?.id === data.contact_id ? 0 : (ex.unread_count || 0) + 1 };
          return [up, ...prev.filter(c => c.id !== data.contact_id)];
        }
        // Contact mới chưa có trong list — thêm vào đầu
        const newContact = data.contact
          ? { ...data.contact, last_message_at: now, unread_count: 1 }
          : { id: data.contact_id, fb_name: 'Khách', unread_count: 1, last_message_at: now };
        return [newContact, ...prev];
      });
      if (selectedRef.current?.id === data.contact_id && data.message) {
        setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    };
    socket.on('fb_message', h);
    return () => { socket.off('fb_message', h); };
  }, [socket]);

  useEffect(() => {
    if (!selected) return;
    
    // Mark as read in local state immediately
    setContacts(prev => prev.map(c => 
      c.id === selected.id ? { ...c, unread_count: 0 } : c
    ));
    
    // Load messages
    const loadMsgs = () => {
      fetch(`${API}/api/facebook/contacts/${selected.id}/messages`, { headers: hdr() })
        .then(r => r.ok ? r.json() : []).then(d => { 
          setMessages(d); 
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          
          // Auto-sync nếu ít tin nhắn (< 5) → có thể thiếu history
          if (d.length < 5) {
            fetch(`${API}/api/facebook/contacts/${selected.id}/sync-history`, { method: 'POST', headers: hdr() })
              .then(r => r.ok ? r.json() : null)
              .then(result => {
                if (result?.synced > 0) {
                  console.log(`[FB] Auto-synced ${result.synced} messages`);
                  // Reload messages
                  fetch(`${API}/api/facebook/contacts/${selected.id}/messages`, { headers: hdr() })
                    .then(r => r.ok ? r.json() : [])
                    .then(fresh => { setMessages(fresh); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); });
                }
              });
          }
        })
        .catch(() => {});
    };
    
    loadMsgs();
  }, [selected]);

  // Send text
  const sendReply = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${selected.id}/reply`, {
        method: 'POST', headers: hdr(), body: JSON.stringify({ message: reply }),
      });
      if (res.ok) { const msg = await res.json(); setMessages(prev => [...prev, msg]); setReply(''); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }
    } catch (e) { console.error(e); }
    setSending(false);
  };

  // Upload & send file/image
  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const upRes = await fetch(`${API}/api/upload/single`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!upRes.ok) { const err = await upRes.json().catch(() => ({})); throw new Error(err.error || 'Upload failed'); }
      const upData = await upRes.json();
      const fileUrl = upData.file_url;

      // Determine attachment type
      let attType = type || 'file';
      if (file.type.startsWith('image/')) attType = 'image';
      else if (file.type.startsWith('video/')) attType = 'video';
      else if (file.type.startsWith('audio/')) attType = 'audio';

      const res = await fetch(`${API}/api/facebook/contacts/${selected.id}/reply`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ message: '', attachment_url: fileUrl, attachment_type: attType }),
      });
      if (res.ok) { const msg = await res.json(); setMessages(prev => [...prev, msg]); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }
    } catch (e) { alert('Lỗi gửi file: ' + e.message); }
    setUploading(false);
    e.target.value = '';
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new window.File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

        // Upload then send
        setUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', file);
          const upRes = await fetch(`${API}/api/upload/single`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: formData,
          });
          if (!upRes.ok) { const err = await upRes.json().catch(() => ({})); throw new Error(err.error || 'Upload failed'); }
          const upData = await upRes.json();
          const fileUrl = upData.file_url;

          const res = await fetch(`${API}/api/facebook/contacts/${selected.id}/reply`, {
            method: 'POST', headers: hdr(),
            body: JSON.stringify({ message: '', attachment_url: fileUrl, attachment_type: 'audio' }),
          });
          if (res.ok) { const msg = await res.json(); setMessages(prev => [...prev, msg]); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }
        } catch (e) { alert('Lỗi gửi ghi âm'); }
        setUploading(false);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (e) { alert('Không thể ghi âm. Hãy cấp quyền microphone.'); }
  };

  const stopRecording = () => {
    if (mediaRecorder) { mediaRecorder.stop(); setRecording(false); setMediaRecorder(null); }
  };

  const [contactFilter, setContactFilter] = useState('all'); // all | has_phone | no_phone | has_lead

  const formatTime = (d) => new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

  const filteredContacts = contacts.filter(c => {
    if (contactFilter === 'has_phone') return !!c.phone;
    if (contactFilter === 'no_phone') return !c.phone;
    if (contactFilter === 'has_lead') return !!c.lead;
    return true;
  });

  // Dedup messages — loại bỏ tin nhắn trùng fb_message_id hoặc id
  const uniqueMessages = useMemo(() => {
    const seen = new Set();
    return messages.filter(m => {
      const key = m.fb_message_id || m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      if (m.id && key !== m.id) {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
      }
      return true;
    });
  }, [messages]);

  return (
    <div className="flex h-full">
      {/* ── LEFT: Contact list ── */}
      <div className={`w-80 border-r bg-white flex flex-col shrink-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 border-b bg-gray-50 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm khách hàng..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
              {pages.length > 1 && (
            <PageSelector
              value={pageFilter}
              onChange={setPageFilter}
              pages={pages}
              pageStats={pageStats}
            />
          )}
          <div className="flex gap-1 text-[11px]">
            {[
              { key: 'all', label: 'Tất cả', count: contacts.length },
              { key: 'has_phone', label: '📞 Có SĐT', count: contacts.filter(c => c.phone).length },
              { key: 'no_phone', label: '❌ Chưa SĐT', count: contacts.filter(c => !c.phone).length },
              { key: 'has_lead', label: '🏷 Có Lead', count: contacts.filter(c => c.lead).length },
            ].map(f => (
              <button key={f.key} onClick={() => setContactFilter(f.key)}
                className={`px-2 py-1 rounded-lg cursor-pointer transition ${contactFilter === f.key ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.map(c => (
            <div key={c.id} onClick={() => {
              setSelected(c);
              // Reload contact để check lead còn tồn tại không
              fetch(`${API}/api/facebook/contacts/${c.id}`, { headers: hdr() })
                .then(r => r.ok ? r.json() : null)
                .then(fresh => { if (fresh) setSelected(fresh); })
                .catch(() => {});
            }}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 transition-all ${
                selected?.id === c.id ? 'bg-blue-50 border-l-3 border-l-blue-500' : 'hover:bg-gray-50'
              }`}>
              <div className="relative">
                <FBAvatar name={c.fb_name} pic={c.fb_profile_pic} size={11} />
                {c.unread_count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-5 h-5 flex items-center justify-center font-bold shadow">{c.unread_count}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${c.unread_count > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{c.fb_name}</p>
                {c.last_message_preview ? (
                  <p className={`text-xs truncate mt-0.5 ${c.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{c.last_message_preview}</p>
                ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  {c.phone && <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md">📞 {c.phone}</span>}
                  {c.lead && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">🏷 {c.lead.code}</span>}
                  {!c.phone && !c.lead && <span className="text-xs text-gray-400">💬 Messenger</span>}
                </div>
                )}
              </div>
              <div className="text-[10px] text-gray-400 shrink-0">
                {c.last_message_at && (() => {
                  const d = new Date(c.last_message_at);
                  const today = new Date();
                  const isToday = d.toDateString() === today.toDateString();
                  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
                  const isYesterday = d.toDateString() === yesterday.toDateString();
                  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                  if (isToday) return time;
                  if (isYesterday) return `H.qua ${time}`;
                  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + time;
                })()}
              </div>
            </div>
          ))}
          {!filteredContacts.length && (
            <div className="text-center py-12">
              <MessageCircle size={40} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">{contacts.length ? 'Không có kết quả lọc' : 'Chưa có cuộc hội thoại'}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Chat area ── */}
      <div className={`flex-1 flex flex-col bg-gray-50 ${!selected ? 'hidden md:flex' : 'flex'}`}>
        {selected ? (
          <>
            {/* Chat header */}
            <div className="border-b px-4 py-3 bg-white flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelected(null)} className="md:hidden text-gray-400 hover:text-gray-600 cursor-pointer mr-1">
                  <ArrowLeft size={20} />
                </button>
                <FBAvatar name={selected.fb_name} pic={selected.fb_profile_pic} size={10} />
                <div>
                  <p className="font-semibold text-sm text-gray-800">{selected.fb_name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    {selected.phone && <span className="text-green-600">📞 {selected.phone}</span>}
                    {!selected.phone && <span>Facebook Messenger</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SyncHistoryButton contactId={selected.id} onSynced={() => {
                  fetch(`${API}/api/facebook/contacts/${selected.id}/messages`, { headers: hdr() })
                    .then(r => r.ok ? r.json() : []).then(d => { setMessages(d); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }).catch(() => {});
                }} />
                {selected.lead ? (
                  <a href={`/crm/leads/${selected.lead.id}`} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 flex items-center gap-1 font-medium transition">
                    <ExternalLink size={12} /> {selected.lead.code}
                  </a>
                ) : (
                  <CreateLeadButton contactId={selected.id} onCreated={(lead) => { setSelected(prev => ({ ...prev, lead })); loadContacts(); }} />
                )}
              </div>
            </div>

              {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {uniqueMessages.map((m, i) => {
                const isOut = m.direction === 'outbound';
                const showDate = i === 0 || new Date(m.created_at).toDateString() !== new Date(uniqueMessages[i-1]?.created_at).toDateString();
                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-[10px] text-gray-400 bg-white px-3 py-1 rounded-full shadow-sm border">
                          {new Date(m.created_at).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                        isOut ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md' : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'
                      }`}>
                        {/* Image */}
                        {m.attachment_url && (m.message_type === 'image' || m.attachment_type === 'image') && (
                          <div className="mb-2">
                            <img 
                              src={m.attachment_url} 
                              className="max-w-[280px] rounded-xl cursor-pointer hover:opacity-90 transition" 
                              alt="Hình ảnh"
                              onClick={() => window.open(m.attachment_url, '_blank')}
                            />
                          </div>
                        )}
                        {/* Audio */}
                        {m.attachment_url && (m.message_type === 'audio' || m.attachment_type === 'audio') && (
                          <div className="mb-1">
                            <audio 
                              src={m.attachment_url} 
                              controls 
                              className="max-w-[280px] h-10"
                              style={{ filter: isOut ? 'invert(1) hue-rotate(180deg)' : 'none' }}
                            />
                          </div>
                        )}
                        {/* Video */}
                        {m.attachment_url && (m.message_type === 'video' || m.attachment_type === 'video') && (
                          <div className="mb-2">
                            <video 
                              src={m.attachment_url} 
                              controls 
                              className="max-w-[280px] rounded-xl"
                              preload="metadata"
                            />
                          </div>
                        )}
                        {/* File */}
                        {m.attachment_url && (m.message_type === 'file' || m.attachment_type === 'file') && (
                          <a href={m.attachment_url} target="_blank" rel="noreferrer"
                            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-1 transition ${isOut ? 'bg-blue-400/30 hover:bg-blue-400/50' : 'bg-gray-50 hover:bg-gray-100'}`}>
                            <File size={16} /> Tệp đính kèm
                          </a>
                        )}
                        {/* Text */}
                        {m.content && m.content !== '[image]' && m.content !== '[audio]' && m.content !== '[video]' && m.content !== '[file]' && (
                          <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                        )}
                        <p className={`text-[10px] mt-1 ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input bar ── */}
            <div className="border-t bg-white p-3 shrink-0 shadow-inner">
              {uploading && (
                <div className="flex items-center gap-2 text-xs text-blue-600 mb-2 px-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Đang tải lên...
                </div>
              )}
              <div className="flex items-center gap-2">
                {/* Image button */}
                <button onClick={() => imageInputRef.current?.click()} disabled={uploading}
                  className="p-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl cursor-pointer transition disabled:opacity-40" title="Gửi hình ảnh">
                  <Image size={20} />
                </button>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />

                {/* File button */}
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="p-2.5 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-xl cursor-pointer transition disabled:opacity-40" title="Gửi file">
                  <Paperclip size={20} />
                </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />

                {/* Voice button */}
                {!recording ? (
                  <button onClick={startRecording} disabled={uploading}
                    className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl cursor-pointer transition disabled:opacity-40" title="Ghi âm">
                    <Mic size={20} />
                  </button>
                ) : (
                  <button onClick={stopRecording}
                    className="p-2.5 text-red-500 bg-red-50 rounded-xl cursor-pointer animate-pulse" title="Dừng ghi âm">
                    <MicOff size={20} />
                  </button>
                )}

                {/* Text input */}
                <input value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder={recording ? '🎙 Đang ghi âm...' : 'Nhập tin nhắn...'}
                  disabled={recording}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 disabled:opacity-40" />

                {/* Send button */}
                <button onClick={sendReply} disabled={sending || !reply.trim() || recording}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl w-10 h-10 flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer transition shadow-sm">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={36} className="text-blue-400" />
              </div>
              <p className="text-gray-500 font-medium">Chọn cuộc hội thoại</p>
              <p className="text-xs text-gray-400 mt-1">Tin nhắn từ Facebook Messenger sẽ hiện ở đây</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper: Avatar ──
function FBAvatar({ name, pic, size = 11 }) {
  const cls = `w-${size} h-${size} rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-sm`;
  const textSize = size >= 10 ? 'text-sm' : 'text-xs';
  if (pic) return <img src={pic} alt="" className={`w-${size} h-${size} rounded-full object-cover shrink-0 shadow-sm`} />;
  return <div className={`${cls} bg-gradient-to-br from-blue-400 to-blue-600 ${textSize}`}>{(name || 'F')[0].toUpperCase()}</div>;
}

// ── Helper: Nút sync lịch sử tin nhắn cũ từ Facebook ──
function SyncHistoryButton({ contactId, onSynced }) {
  const [loading, setLoading] = useState(false);
  const sync = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${contactId}/sync-history`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      if (data.synced > 0) { alert(`✅ Đã đồng bộ ${data.synced} tin nhắn cũ`); onSynced?.(); }
      else alert(data.message || 'Không có tin nhắn mới để đồng bộ');
    } catch (e) { alert('Lỗi đồng bộ'); }
    setLoading(false);
  };
  return (
    <button onClick={sync} disabled={loading}
      className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition" title="Đồng bộ tin nhắn cũ từ Facebook">
      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {loading ? 'Đang sync...' : 'Sync'}
    </button>
  );
}

// ── Helper: Nút tạo Lead nhanh từ contact ──
function CreateLeadButton({ contactId, onCreated }) {
  const [loading, setLoading] = useState(false);
  const create = async () => {
    if (!confirm('Tạo Lead mới từ contact này?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${contactId}/create-lead`, { method: 'POST', headers: hdr() });
      if (res.ok) { const lead = await res.json(); onCreated(lead); }
      else { const err = await res.json(); alert(err.error || 'Lỗi'); }
    } catch (e) { alert('Lỗi tạo Lead'); }
    setLoading(false);
  };
  return (
    <button onClick={create} disabled={loading}
      className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg hover:bg-green-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-medium transition">
      <UserPlus size={12} /> {loading ? 'Đang tạo...' : 'Tạo Lead'}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONTACTS TAB — Danh bạ Facebook (CRUD)
// ═══════════════════════════════════════════════════════════════

function ContactsTab() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [batchStatus, setBatchStatus] = useState(null); // { type, loading, result }

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (filter === 'has_lead') p.set('has_lead', 'true');
    if (filter === 'no_lead') p.set('has_lead', 'false');
    fetch(`${API}/api/facebook/contacts?${p}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        // Sort: tin nhắn mới nhất lên đầu
        const sorted = [...(data || [])].sort((a, b) => {
          const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return dateB - dateA;
        });
        setContacts(sorted);
      })
      .catch(() => {});
  }, [search, filter]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (c) => { setEditing(c.id); setForm({ fb_name: c.fb_name || '', phone: c.phone || '', email: c.email || '', notes: c.notes || '' }); };

  const saveEdit = async (id) => {
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify(form) });
      if (res.ok) { const d = await res.json(); setContacts(prev => prev.map(c => c.id === id ? d : c)); setEditing(null); }
    } catch (e) { alert('Lỗi'); }
  };

  const deleteContact = async (id, name) => {
    if (!confirm(`Xóa liên hệ "${name}" và toàn bộ tin nhắn?`)) return;
    try { await fetch(`${API}/api/facebook/contacts/${id}`, { method: 'DELETE', headers: hdr() }); setContacts(prev => prev.filter(c => c.id !== id)); } catch (e) { alert('Lỗi'); }
  };

  // Batch: tạo Lead cho contact chưa có lead
  const batchCreateLeads = async () => {
    const noLead = contacts.filter(c => !c.lead_id);
    if (!noLead.length) return alert('Tất cả liên hệ đã có Lead!');
    if (!confirm(`Tạo Lead cho ${noLead.length} liên hệ chưa có Lead?`)) return;
    setBatchStatus({ type: 'leads', loading: true, result: null });
    try {
      const res = await fetch(`${API}/api/facebook/batch-create-leads`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      setBatchStatus({ type: 'leads', loading: false, result: data });
      load(); // Refresh danh sách
    } catch (e) {
      setBatchStatus({ type: 'leads', loading: false, result: { error: e.message } });
    }
  };

  // Batch: quét SĐT + thông tin từ tin nhắn
  const batchExtractPhones = async () => {
    if (!confirm('Quét toàn bộ tin nhắn để tìm SĐT và thông tin khách hàng?')) return;
    setBatchStatus({ type: 'phones', loading: true, result: null });
    try {
      const res = await fetch(`${API}/api/facebook/batch-extract-phones`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      setBatchStatus({ type: 'phones', loading: false, result: data });
      load();
    } catch (e) {
      setBatchStatus({ type: 'phones', loading: false, result: { error: e.message } });
    }
  };

  // Refresh tên các contact bị "Facebook User"
  const refreshNames = async () => {
    const stuckCount = contacts.filter(c => !c.fb_name || c.fb_name === 'Facebook User' || c.fb_name === 'User').length;
    if (!stuckCount) return alert('Tất cả liên hệ đã có tên!');
    if (!confirm(`Cập nhật tên cho ${stuckCount} liên hệ đang thiếu tên?`)) return;
    setBatchStatus({ type: 'names', loading: true, result: null });
    try {
      const res = await fetch(`${API}/api/facebook/refresh-names`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      setBatchStatus({ type: 'names', loading: false, result: data });
      load();
    } catch (e) {
      setBatchStatus({ type: 'names', loading: false, result: { error: e.message } });
    }
  };

  // Kiểm tra & xóa lead trùng không liên kết FB
  const dedupLeads = async () => {
    if (!confirm('Kiểm tra và xóa lead trùng không liên kết với Facebook?')) return;
    setBatchStatus({ type: 'dedup', loading: true, result: null });
    try {
      const res = await fetch(`${API}/api/facebook/dedup-leads`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      setBatchStatus({ type: 'dedup', loading: false, result: data });
      load();
    } catch (e) {
      setBatchStatus({ type: 'dedup', loading: false, result: { error: e.message } });
    }
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-lg font-bold">👥 Danh bạ Facebook ({contacts.length})</h2>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={batchCreateLeads} disabled={batchStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
            {batchStatus?.type === 'leads' && batchStatus.loading ? <span className="animate-spin h-3 w-3 border-2 border-green-600 border-t-transparent rounded-full" /> : '🆕'}
            Tạo Lead hàng loạt
          </button>
          <button onClick={refreshNames} disabled={batchStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
            {batchStatus?.type === 'names' && batchStatus.loading ? <span className="animate-spin h-3 w-3 border-2 border-purple-600 border-t-transparent rounded-full" /> : '🔄'}
            Refresh tên
          </button>
          <button onClick={dedupLeads} disabled={batchStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
            {batchStatus?.type === 'dedup' && batchStatus.loading ? <span className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full" /> : '🔍'}
            Xóa Lead trùng
          </button>
          <button onClick={batchExtractPhones} disabled={batchStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
            {batchStatus?.type === 'phones' && batchStatus.loading ? <span className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full" /> : '📞'}
            Quét SĐT & thông tin
          </button>
          <button onClick={load} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer"><RefreshCw size={14} /> Làm mới</button>
        </div>
      </div>

      {/* Batch result banner */}
      {batchStatus?.result && !batchStatus.loading && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${batchStatus.result.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              {batchStatus.result.error ? (
                <span>❌ Lỗi: {batchStatus.result.error}</span>
              ) : batchStatus.type === 'leads' ? (
                <span>✅ Đã tạo <strong>{batchStatus.result.created || 0}</strong> Lead mới — Bỏ qua: {batchStatus.result.skipped || 0} (đã có Lead)</span>
              ) : batchStatus.type === 'dedup' ? (
                <span>✅ {batchStatus.result.message}</span>
              ) : (
                <span>✅ Đã quét <strong>{batchStatus.result.scanned || batchStatus.result.total || 0}</strong> liên hệ — Tìm thấy: <strong>{batchStatus.result.updated || batchStatus.result.found || 0}</strong> SĐT mới</span>
              )}
            </div>
            <button onClick={() => setBatchStatus(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
          </div>
        </div>
      )}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, SĐT..."
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['all','Tất cả'], ['has_lead','Có Lead'], ['no_lead','Chưa có Lead']].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${filter === k ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Tên</th>
              <th className="text-center px-3 py-3 font-semibold text-gray-600">💬</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-600">Lần cuối</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">SĐT</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Lead</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Ghi chú</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                {editing === c.id ? (
                  <>
                    <td className="px-4 py-2"><input value={form.fb_name} onChange={e => setForm({...form, fb_name: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" /></td>
                    <td className="px-3 py-2 text-center text-xs text-gray-400">{c.message_count || 0}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">—</td>
                    <td className="px-4 py-2"><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" placeholder="SĐT" /></td>
                    <td className="px-4 py-2">—</td>
                    <td className="px-4 py-2"><input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" placeholder="Ghi chú" /></td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => saveEdit(c.id)} className="text-green-600 hover:text-green-800 p-1 cursor-pointer"><Check size={16} /></button>
                      <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"><X size={16} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FBAvatar name={c.fb_name} pic={c.fb_profile_pic} size={8} />
                        <div>
                          <span className="font-medium text-gray-800">{c.fb_name}</span>
                          {c.unread_count > 0 && <span className="ml-1.5 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">{c.unread_count} mới</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {c.message_count > 0 ? (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{c.message_count}</span>
                      ) : <span className="text-gray-300 text-xs">0</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">
                      {c.last_message_at ? new Date(c.last_message_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.phone || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      {c.lead ? (
                        <a href={`/crm/leads/${c.lead.id}`} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100">{c.lead.code}</a>
                      ) : (
                        <CreateLeadButton contactId={c.id} onCreated={() => load()} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">{c.notes || ''}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => startEdit(c)} className="text-gray-400 hover:text-blue-600 p-1 cursor-pointer" title="Sửa"><Edit3 size={14} /></button>
                      <button onClick={() => deleteContact(c.id, c.fb_name)} className="text-gray-400 hover:text-red-600 p-1 cursor-pointer" title="Xóa"><Trash2 size={14} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!contacts.length && <p className="text-center text-gray-400 py-8 text-sm">Chưa có liên hệ nào</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LEAD ADS TAB
// ═══════════════════════════════════════════════════════════════

function LeadAdsTab() {
  const [ads, setAds] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/facebook/lead-ads`, { headers: hdr() }).then(r => r.ok ? r.json() : []).then(setAds).catch(() => {});
  }, []);
  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-4">📋 Facebook Lead Ads</h2>
      {!ads.length ? (
        <div className="text-center text-gray-400 py-12"><FileText size={48} className="mx-auto mb-3 opacity-30" /><p>Chưa có lead ads.</p></div>
      ) : (
        <div className="space-y-3">
          {ads.map(ad => (
            <div key={ad.id} className="bg-white border rounded-lg p-4 hover:shadow-md transition">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📋</span>
                  <span className="font-medium">{ad.full_name || 'N/A'}</span>
                  {ad.phone && <span className="text-sm text-gray-500">📞 {ad.phone}</span>}
                </div>
                {ad.lead && <a href={`/crm/leads/${ad.lead.id}`} className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100">✅ {ad.lead.code}</a>}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">{new Date(ad.created_at).toLocaleString('vi-VN')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMMENTS TAB
// ═══════════════════════════════════════════════════════════════

function CommentsTab() {
  const [comments, setComments] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  useEffect(() => {
    fetch(`${API}/api/facebook/comments`, { headers: hdr() }).then(r => r.ok ? r.json() : []).then(setComments).catch(() => {});
  }, []);
  const sendReply = async (commentId) => {
    if (!replyText.trim()) return;
    try {
      await fetch(`${API}/api/facebook/comments/${commentId}/reply`, { method: 'POST', headers: hdr(), body: JSON.stringify({ message: replyText }) });
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, replied: true, reply_text: replyText } : c));
      setReplyingTo(null); setReplyText('');
    } catch (e) { console.error(e); }
  };
  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-4">💬 Bình luận Facebook</h2>
      {!comments.length ? (
        <div className="text-center text-gray-400 py-12"><MessageSquare size={48} className="mx-auto mb-3 opacity-30" /><p>Chưa có bình luận.</p></div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="bg-white border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div><p className="font-medium text-sm">{c.from_name || 'Ẩn danh'}</p><p className="text-sm text-gray-700 mt-1">{c.message}</p></div>
                {c.replied ? <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded shrink-0">✅ Đã trả lời</span> :
                  <button onClick={() => { setReplyingTo(c.id); setReplyText(''); }} className="text-xs text-blue-600 hover:underline cursor-pointer shrink-0">Trả lời</button>}
              </div>
              {c.replied && c.reply_text && <div className="mt-2 ml-4 border-l-2 border-blue-200 pl-3"><p className="text-xs text-blue-600">↩ {c.reply_text}</p></div>}
              {replyingTo === c.id && (
                <div className="mt-3 flex gap-2">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Nhập phản hồi..." className="flex-1 px-3 py-1.5 text-sm border rounded" />
                  <button onClick={() => sendReply(c.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 cursor-pointer">Gửi</button>
                  <button onClick={() => setReplyingTo(null)} className="text-gray-500 text-sm cursor-pointer">Hủy</button>
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-2">{new Date(c.created_at).toLocaleString('vi-VN')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB — CRUD Facebook Pages
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ANALYTICS TAB — Phân tích hành vi khách hàng
// ═══════════════════════════════════════════════════════════════

function AnalyticsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageFilter, setPageFilter] = useState('');
  const [days, setDays] = useState(30);
  const [pages, setPages] = useState([]);

  useEffect(() => {
    fetch(`${API}/api/facebook/pages`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(setPages).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ days });
    if (pageFilter) params.set('page_id', pageFilter);
    fetch(`${API}/api/facebook/analytics?${params}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : null).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [pageFilter, days]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  if (!data) return <p className="text-center py-8 text-gray-400">Không có dữ liệu</p>;

  const f = data.conversionFunnel;
  const maxMsg = Math.max(...(data.messagesByHour || []).map(h => h.total), 1);
  const maxDay = Math.max(...(data.messagesByDay || []).map(d => d.total), 1);

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      {/* Header + Filters */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">📊 Phân tích hành vi khách hàng</h2>
        <div className="flex gap-2">
          {pages.length > 1 && (
            <select value={pageFilter} onChange={e => setPageFilter(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-white">
              <option value="">Tất cả Page</option>
              {pages.map(p => <option key={p.id} value={p.page_id}>{p.page_name}</option>)}
            </select>
          )}
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white">
            <option value={7}>7 ngày</option>
            <option value={14}>14 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Tổng liên hệ', value: data.totalContacts, icon: '👥', color: 'blue' },
          { label: 'Có SĐT', value: data.hasPhone, icon: '📞', color: 'green', sub: `${f.phone_rate}%` },
          { label: 'Có Lead', value: data.hasLead, icon: '🏷️', color: 'purple', sub: `${f.lead_rate}%` },
          { label: 'Đã chuyển Deal', value: data.dealCount, icon: '🤝', color: 'orange', sub: `${f.deal_rate}%` },
          { label: 'Tin nhắn', value: data.totalMessages, icon: '💬', color: 'cyan' },
          { label: 'TG phản hồi', value: data.avgResponseTime ? `${data.avgResponseTime} phút` : '—', icon: '⏱️', color: 'pink' },
        ].map((kpi, i) => (
          <div key={i} className={`bg-white rounded-xl border p-4 space-y-1`}>
            <div className="flex items-center justify-between">
              <span className="text-xl">{kpi.icon}</span>
              {kpi.sub && <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-${kpi.color}-50 text-${kpi.color}-600`}>{kpi.sub}</span>}
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">🔄 Phễu chuyển đổi</h3>
        <div className="space-y-3">
          {[
            { label: 'Tổng liên hệ nhắn tin', count: f.total_contacts, pct: 100, color: 'bg-blue-500' },
            { label: 'Để lại SĐT', count: f.has_phone, pct: f.phone_rate, color: 'bg-green-500' },
            { label: 'Tạo Lead', count: f.has_lead, pct: f.lead_rate, color: 'bg-purple-500' },
            { label: 'Chuyển đổi Deal', count: f.has_deal, pct: f.overall_rate, color: 'bg-orange-500' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-32 text-xs text-gray-600 text-right shrink-0">{step.label}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden">
                <div className={`${step.color} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.max(step.pct, 2)}%` }} />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                  {step.count} ({step.pct}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages by Hour */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">🕐 Khung giờ nhắn tin (UTC+7)</h3>
          <div className="flex items-end gap-1 h-40">
            {(data.messagesByHour || []).map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center justify-end" style={{ height: '120px' }}>
                  <div className="w-full bg-blue-400 rounded-t-sm transition-all" style={{ height: `${Math.max(h.total / maxMsg * 100, 2)}%` }}
                    title={`${h.hour}: ${h.total} tin (${h.inbound} đến)`} />
                </div>
                <span className="text-[9px] text-gray-400">{i % 3 === 0 ? h.hour.split(':')[0] : ''}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-[10px] text-gray-400">
            <span>📥 Đến: {data.inboundMessages}</span>
            <span>📤 Đi: {data.outboundMessages}</span>
          </div>
        </div>

        {/* Messages by Day */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">📅 Tin nhắn theo ngày</h3>
          <div className="flex items-end gap-0.5 h-40">
            {(data.messagesByDay || []).slice(-30).map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ height: '120px' }}>
                <div className="w-full rounded-t-sm transition-all" style={{ height: `${Math.max(d.total / maxDay * 100, 2)}%` }}
                  title={`${d.date}: ${d.inbound} đến + ${d.outbound} đi = ${d.total}`}>
                  <div className="bg-blue-400 w-full rounded-t-sm" style={{ height: `${d.inbound / Math.max(d.total, 1) * 100}%` }} />
                  <div className="bg-green-400 w-full" style={{ height: `${d.outbound / Math.max(d.total, 1) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[9px] text-gray-400">
            <span>{(data.messagesByDay || [])[0]?.date?.slice(5)}</span>
            <span>{(data.messagesByDay || []).slice(-1)[0]?.date?.slice(5)}</span>
          </div>
        </div>
      </div>

      {/* Page Breakdown */}
      {data.pageBreakdown?.length > 1 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">📄 Theo Page</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 font-medium">Page</th>
                  <th className="py-2 font-medium text-center">Liên hệ</th>
                  <th className="py-2 font-medium text-center">Có SĐT</th>
                  <th className="py-2 font-medium text-center">Có Lead</th>
                  <th className="py-2 font-medium text-center">Tỷ lệ SĐT</th>
                </tr>
              </thead>
              <tbody>
                {data.pageBreakdown.map(p => (
                  <tr key={p.page_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 font-medium">{p.page_name}</td>
                    <td className="py-2.5 text-center">{p.contacts}</td>
                    <td className="py-2.5 text-center text-green-600">{p.has_phone}</td>
                    <td className="py-2.5 text-center text-purple-600">{p.has_lead}</td>
                    <td className="py-2.5 text-center">
                      <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        {p.contacts ? Math.round(p.has_phone / p.contacts * 100) : 0}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════

function AutoLeadTab() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/facebook/auto-lead-config`, { headers: hdr() })
      .then(r => r.ok ? r.json() : null).then(setConfig).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/facebook/auto-lead-config`, {
        method: 'PUT', headers: hdr(), body: JSON.stringify(config),
      });
      if (res.ok) { const d = await res.json(); setConfig(d); setSaved(true); setTimeout(() => setSaved(false), 3000); }
      else { const e = await res.json(); alert(e.error || 'Lỗi'); }
    } catch (e) { alert('Lỗi: ' + e.message); }
    setSaving(false);
  };

  const reset = async () => {
    if (!confirm('Khôi phục cài đặt mặc định?')) return;
    const res = await fetch(`${API}/api/facebook/auto-lead-config/defaults`, { headers: hdr() });
    if (res.ok) { const d = await res.json(); setConfig(d); }
  };

  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  if (!config) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;

  const triggers = [
    { id: 'first_message', icon: '⚡', label: 'Tạo ngay khi có tin nhắn', desc: 'Khách nhắn tin lần đầu → tự động tạo Lead ngay lập tức' },
    { id: 'message_count', icon: '🔢', label: 'Sau N tin nhắn', desc: 'Chờ khách nhắn đủ số tin nhắn mới tạo Lead' },
    { id: 'has_phone', icon: '📞', label: 'Khi có số điện thoại', desc: 'Chỉ tạo Lead khi tìm được SĐT trong tin nhắn' },
    { id: 'manual', icon: '🖱️', label: 'Thủ công', desc: 'Không tự tạo — chỉ tạo Lead bằng tay' },
  ];

  return (
    <div className="p-6 overflow-y-auto h-full max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">🤖 Điều kiện tự động tạo Lead</h2>
          <p className="text-sm text-gray-500 mt-0.5">Cấu hình khi nào hệ thống tự tạo Lead từ tin nhắn Facebook</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            Mặc định
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm">
            {saving ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={14} />}
            Lưu cài đặt
          </button>
        </div>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <Check size={16} /> Đã lưu cài đặt thành công!
        </div>
      )}

      {/* ═══ TRIGGER — Điều kiện tạo Lead ═══ */}
      <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center text-xs">1</span>
          Điều kiện tạo Lead
        </h3>
        <div className="space-y-2">
          {triggers.map(t => (
            <label key={t.id}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${config.trigger === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}
              onClick={() => set('trigger', t.id)}>
              <input type="radio" name="trigger" checked={config.trigger === t.id} onChange={() => set('trigger', t.id)}
                className="mt-0.5 cursor-pointer" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t.icon}</span>
                  <span className="text-sm font-semibold text-gray-800">{t.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Threshold cho message_count */}
        {config.trigger === 'message_count' && (
          <div className="mt-3 ml-9 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <label className="text-xs font-medium text-amber-800 block mb-1.5">Số tin nhắn tối thiểu</label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={10} value={config.message_count_threshold || 2}
                onChange={e => set('message_count_threshold', parseInt(e.target.value))}
                className="flex-1 cursor-pointer" />
              <span className="text-lg font-bold text-amber-700 w-8 text-center">{config.message_count_threshold || 2}</span>
            </div>
            <p className="text-[10px] text-amber-600 mt-1">
              Khách phải nhắn ít nhất {config.message_count_threshold || 2} tin nhắn mới tự động tạo Lead
            </p>
          </div>
        )}
      </div>

      {/* ═══ TÊN KHÁCH MẶC ĐỊNH ═══ */}
      <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center text-xs">2</span>
          Tên khách mặc định
        </h3>
        <div className="flex items-center gap-3">
          <input value={config.default_customer_name || ''} onChange={e => set('default_customer_name', e.target.value)}
            placeholder="User" className="flex-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-500">Tên tạm khi chưa biết tên thật</p>
        </div>
      </div>

      {/* ═══ TỰ ĐỘNG CẬP NHẬT ═══ */}
      <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center text-xs">3</span>
          Tự động cập nhật thông tin
        </h3>
        <div className="space-y-3">
          {[
            { key: 'auto_update_name', icon: '👤', label: 'Cập nhật tên', desc: 'Tự động cập nhật tên khách khi lấy được từ Facebook' },
            { key: 'auto_update_phone', icon: '📞', label: 'Cập nhật SĐT', desc: 'Tự động cập nhật SĐT khi tìm được trong tin nhắn' },
            { key: 'auto_update_address', icon: '📍', label: 'Cập nhật địa chỉ', desc: 'Tự động cập nhật địa chỉ khi tìm được trong tin nhắn' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2">
                <span>{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-700">{item.label}</p>
                  <p className="text-[10px] text-gray-500">{item.desc}</p>
                </div>
              </div>
              <button onClick={() => set(item.key, !config[item.key])}
                className={`w-10 h-6 rounded-full transition cursor-pointer flex items-center ${config[item.key] ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ HÀNH VI KHÁC ═══ */}
      <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-amber-100 rounded-lg flex items-center justify-center text-xs">4</span>
          Hành vi khác
        </h3>
        <div className="space-y-3">
          {[
            { key: 'auto_reply_first_message', icon: '💬', label: 'Tự động trả lời tin đầu', desc: 'Gửi tin nhắn tự động khi khách nhắn lần đầu (cấu hình ở Cài đặt Page)' },
            { key: 'recreate_deleted_leads', icon: '♻️', label: 'Tạo lại Lead đã xóa', desc: 'Nếu Lead cũ bị xóa, tạo lại khi khách nhắn tin tiếp' },
            { key: 'notify_on_new_lead', icon: '🔔', label: 'Thông báo Lead mới', desc: 'Gửi thông báo cho người phụ trách khi tạo Lead mới' },
            { key: 'notify_on_phone_found', icon: '📲', label: 'Thông báo tìm SĐT', desc: 'Gửi thông báo khi tìm được SĐT mới trong tin nhắn' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2">
                <span>{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-700">{item.label}</p>
                  <p className="text-[10px] text-gray-500">{item.desc}</p>
                </div>
              </div>
              <button onClick={() => set(item.key, !config[item.key])}
                className={`w-10 h-6 rounded-full transition cursor-pointer flex items-center ${config[item.key] ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ PREVIEW ═══ */}
      <div className="bg-gradient-to-br from-gray-50 to-blue-50 border-2 border-dashed border-blue-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">👁️ Xem trước luồng hoạt động</h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
            <span className="text-gray-600">Khách nhắn tin trên Facebook Messenger</span>
          </div>
          <div className="ml-2.5 border-l-2 border-blue-200 h-3" />
          {config.trigger === 'first_message' ? (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-gray-600">⚡ <strong>Tạo Lead ngay</strong> — tên: "{config.default_customer_name || 'User'}"</span>
            </div>
          ) : config.trigger === 'message_count' ? (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-gray-600">⏳ Chờ khách nhắn đủ <strong>{config.message_count_threshold}</strong> tin → tạo Lead</span>
            </div>
          ) : config.trigger === 'has_phone' ? (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 bg-purple-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-gray-600">📞 Chờ phát hiện SĐT trong tin nhắn → tạo Lead</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 bg-gray-400 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-gray-600">🖱️ Không tạo Lead tự động — chờ nhân viên tạo thủ công</span>
            </div>
          )}
          <div className="ml-2.5 border-l-2 border-blue-200 h-3" />
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">3</span>
            <span className="text-gray-600">
              {config.auto_update_name && '👤 Cập nhật tên'}
              {config.auto_update_name && config.auto_update_phone && ' → '}
              {config.auto_update_phone && '📞 Cập nhật SĐT'}
              {(config.auto_update_name || config.auto_update_phone) && config.auto_update_address && ' → '}
              {config.auto_update_address && '📍 Cập nhật địa chỉ'}
              {!config.auto_update_name && !config.auto_update_phone && !config.auto_update_address && 'Không tự cập nhật'}
            </span>
          </div>
          {config.notify_on_new_lead && (
            <>
              <div className="ml-2.5 border-l-2 border-blue-200 h-3" />
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 bg-orange-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">4</span>
                <span className="text-gray-600">🔔 Thông báo cho người phụ trách</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ LEAD SCAN — Quét SĐT → Tạo lead theo lịch ══ */}
      <LeadScanPanel />
    </div>
  );
}

function LeadScanPanel() {
  const [cfg, setCfg] = useState({ enabled: false, interval_minutes: 60, timer_active: false });
  const [preview, setPreview] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const loadCfg = () => fetch(`${API}/api/facebook/lead-scan/config`, { headers: hdr() })
    .then(r => r.ok ? r.json() : null).then(d => d && setCfg(d)).catch(() => {});

  const loadPreview = () => fetch(`${API}/api/facebook/lead-scan/preview`, { headers: hdr() })
    .then(r => r.ok ? r.json() : null).then(d => d && setPreview(d)).catch(() => {});

  useEffect(() => { loadCfg(); loadPreview(); }, []);

  const saveCfg = async (patch) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/facebook/lead-scan/config`, {
        method: 'PUT', headers: hdr(), body: JSON.stringify({ ...cfg, ...patch }),
      });
      if (res.ok) { const d = await res.json(); setCfg(d); }
    } catch (e) { alert('Lỗi: ' + e.message); }
    setSaving(false);
  };

  const runNow = async () => {
    if (!confirm(`Chạy quét ngay bây giờ? Sẽ tạo lead cho ${preview?.count || 0} contact có SĐT.`)) return;
    setRunning(true); setResult(null);
    try {
      const res = await fetch(`${API}/api/facebook/lead-scan/run`, { method: 'POST', headers: hdr() });
      const d = await res.json();
      setResult(d);
      loadPreview();
    } catch (e) { alert('Lỗi: ' + e.message); }
    setRunning(false);
  };

  const INTERVALS = [
    { value: 15, label: 'Mỗi 15 phút' },
    { value: 30, label: 'Mỗi 30 phút' },
    { value: 60, label: 'Mỗi 1 giờ' },
    { value: 120, label: 'Mỗi 2 giờ' },
    { value: 360, label: 'Mỗi 6 giờ' },
    { value: 720, label: 'Mỗi 12 giờ' },
    { value: 1440, label: 'Mỗi 24 giờ' },
  ];

  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            📶 Quét contact có SĐT → Tạo Lead tự động
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Hệ thống sẽ quét tất cả contact Facebook có số điện thoại nhưng chưa có Lead → tự động tạo Lead theo lịch.
            Nguồn Lead sẽ được đặt theo tên Page Facebook tương ứng.
          </p>
        </div>
        {/* Toggle enabled */}
        <label className="flex items-center gap-2 cursor-pointer ml-4">
          <div
            onClick={() => saveCfg({ enabled: !cfg.enabled })}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              cfg.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}>
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.enabled ? 'translate-x-6' : ''}`} />
          </div>
          <span className={`text-xs font-medium ${cfg.enabled ? 'text-green-700' : 'text-gray-500'}`}>
            {cfg.enabled ? '✅ Đang bật' : 'Tắt'}
          </span>
        </label>
      </div>

      {/* Preview count */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
        <span className="text-2xl font-bold text-blue-700">{preview?.count ?? '...'}</span>
        <div>
          <div className="text-sm font-medium text-blue-800">contact có SĐT, chưa có Lead</div>
          <button onClick={() => { loadPreview(); setShowPreview(v => !v); }}
            className="text-xs text-blue-600 hover:underline cursor-pointer">
            {showPreview ? 'Ẩn danh sách' : 'Xem danh sách'}
          </button>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={runNow} disabled={running || (preview?.count ?? 0) === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer shadow-sm">
            {running
              ? <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
              : '▶️'}
            Chạy ngay
          </button>
        </div>
      </div>

      {/* Preview list */}
      {showPreview && preview?.contacts?.length > 0 && (
        <div className="mb-4 border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500">Tên</th>
                <th className="px-3 py-2 text-left text-gray-500">SĐT</th>
                <th className="px-3 py-2 text-left text-gray-500">Page Facebook</th>
                <th className="px-3 py-2 text-left text-gray-500">Tin nhắn</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.contacts.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{c.fb_name || 'Facebook User'}</td>
                  <td className="px-3 py-2 font-mono text-green-700">{c.phone}</td>
                  <td className="px-3 py-2 text-blue-700">{c.page_name}</td>
                  <td className="px-3 py-2 text-gray-500">{c.message_count || 0} tin</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule settings */}
      {cfg.enabled && (
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
          <span className="text-sm text-gray-700 whitespace-nowrap">⏰ Chạy tự động:</span>
          <select
            value={cfg.interval_minutes}
            onChange={e => saveCfg({ interval_minutes: parseInt(e.target.value) })}
            className="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 cursor-pointer bg-white">
            {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            cfg.timer_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {cfg.timer_active ? '⏰ Đang chạy' : '⏹️ Chưa chạy'}
          </span>
        </div>
      )}

      {/* Last scan result */}
      {result && (
        <div className={`p-3 rounded-lg border text-sm ${
          result.errors?.length ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
        }`}>
          <div className="font-semibold mb-1">📊 Kết quả quét:</div>
          <div className="flex gap-4 text-xs">
            <span>🔍 Quét: <b>{result.scanned}</b></span>
            <span className="text-green-700">✅ Tạo: <b>{result.created}</b></span>
            <span className="text-gray-500">⏩ Bỏ qua: <b>{result.skipped}</b></span>
            {result.errors?.length > 0 && <span className="text-red-600">❌ Lỗi: <b>{result.errors.length}</b></span>}
          </div>
          {result.leads?.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.leads.map((l, i) => (
                <div key={i} className="text-xs text-green-700">✅ {l.code} — {l.name} — {l.phone}</div>
              ))}
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="mt-1 text-xs text-red-600">{result.errors.join('; ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══ WEBHOOK LOGS TAB ═══
function WebhookLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/facebook/webhook-logs`, { headers: hdr() });
      if (res.ok) setLogs(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const clearLogs = async () => {
    if (!confirm('Xóa toàn bộ logs?')) return;
    await fetch(`${API}/api/facebook/webhook-logs`, { method: 'DELETE', headers: hdr() });
    load();
  };

  const fmtTime = (t) => {
    if (!t) return '';
    const d = new Date(t);
    return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
  };

  // Extract useful info from payload
  const extractInfo = (payload, result) => {
    if (!payload) return { type: '?', sender: '?', content: '?' };
    // Log xử lý tin nhắn
    if (payload.type === 'message_processed') {
      const name = result?.contact_name || payload.psid;
      const lead = result?.has_lead ? `✅ Lead ${result.lead_id?.substring(0,8)}` : '❌ Chưa có lead';
      return { type: '⚙️ Xử lý', sender: name, content: `PSID: ${payload.psid} | ${lead}` };
    }
    // Log fetch tên
    if (payload.type === 'fetch_name') {
      const name = payload.name || '?';
      return { type: '🔍 Tìm tên', sender: payload.psid, content: name !== '?' ? `✅ ${name}` : '❌ Không lấy được' };
    }
    // Webhook raw
    if (payload.messaging) {
      const m = payload.messaging[0];
      const sender = m?.sender?.id || '?';
      const text = m?.message?.text || m?.message?.attachments?.[0]?.type || (m?.read ? 'read receipt' : (m?.delivery ? 'delivery' : '?'));
      return { type: '📩 Webhook', sender, content: text?.substring(0, 100) || '' };
    }
    if (payload.changes) {
      const c = payload.changes[0];
      if (c?.field === 'leadgen') return { type: '📝 Lead Ad', sender: c.value?.leadgen_id, content: 'form: ' + c.value?.form_id };
      if (c?.field === 'feed') return { type: '💬 Comment', sender: c.value?.from?.name, content: c.value?.message?.substring(0, 100) };
      return { type: c?.field || '?', sender: '?', content: JSON.stringify(c?.value)?.substring(0, 100) };
    }
    return { type: '?', sender: '?', content: JSON.stringify(payload)?.substring(0, 100) };
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">📡 Facebook Webhook Logs</h2>
          <p className="text-xs text-gray-500">Dữ liệu thô từ Facebook gửi về và kết quả xử lý</p>
        </div>
        <div className="flex gap-2">
          <button onClick={clearLogs} className="px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer">🗑️ Xóa logs</button>
          <button onClick={load} disabled={loading} className="px-3 py-1.5 text-xs bg-white border rounded-lg hover:bg-gray-50 flex items-center gap-1.5 cursor-pointer">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Làm mới
          </button>
        </div>
      </div>

      {!logs.length && !loading && (
        <div className="text-center py-16 text-gray-400">
          <Eye size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Chưa có webhook log nào</p>
          <p className="text-xs mt-1">Khi có người nhắn tin trên Facebook, log sẽ hiển ở đây</p>
        </div>
      )}

      <div className="space-y-2">
        {logs.map(log => {
          const info = extractInfo(log.payload, log.result);
          const isOpen = expanded === log.id;
          return (
            <div key={log.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(isOpen ? null : log.id)}>
                <span className="text-xs text-gray-400 whitespace-nowrap w-28">{fmtTime(log.processed_at)}</span>
                <span className="text-xs font-medium w-24">{info.type}</span>
                <span className="text-xs text-gray-500 w-32 truncate" title={info.sender}>PSID: {info.sender}</span>
                <span className="text-xs text-gray-600 flex-1 truncate">{info.content}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${log.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{log.status}</span>
                <ChevronRight size={14} className={`text-gray-400 transition ${isOpen ? 'rotate-90' : ''}`} />
              </div>
              {isOpen && (
                <div className="border-t px-4 py-3 bg-gray-50">
                  <p className="text-[10px] font-bold text-gray-500 mb-1 uppercase">Raw Payload</p>
                  <pre className="text-[11px] text-gray-700 bg-white p-3 rounded-lg border overflow-x-auto max-h-64 whitespace-pre-wrap break-all">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                  {log.result && (
                    <>
                      <p className="text-[10px] font-bold text-gray-500 mb-1 mt-3 uppercase">Result</p>
                      <pre className="text-[11px] text-gray-700 bg-white p-3 rounded-lg border overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                        {JSON.stringify(log.result, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsTab() {
  const [pages, setPages] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const emptyForm = { page_id: '', page_name: '', access_token: '', webhook_verify_token: 'tubep_pro_verify_2024', auto_reply_message: 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.', auto_create_lead: true, default_company_id: '', default_stage_id: '', default_lead_owner_id: '' };
  const [form, setForm] = useState({ ...emptyForm });

  const load = () => { fetch(`${API}/api/facebook/pages`, { headers: hdr() }).then(r => r.ok ? r.json() : []).then(setPages).catch(() => {}); };
  useEffect(() => {
    load();
    api.get('/companies').then(r => setCompanies(r.data?.companies || r.data || [])).catch(() => {});
    api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).then(r => setStages(r.data || [])).catch(() => {});
    api.get('/users').then(r => setUsers(r.data?.users || r.data || [])).catch(() => {});
  }, []);

  const addPage = async () => {
    if (!form.page_id || !form.access_token) return alert('Cần nhập Page ID và Access Token');
    const res = await fetch(`${API}/api/facebook/pages`, { method: 'POST', headers: hdr(), body: JSON.stringify(form) });
    if (res.ok) { load(); setShowAdd(false); setForm({ ...emptyForm }); } else { const e = await res.json(); alert(e.error || 'Lỗi'); }
  };
  const updatePage = async (id, updates) => {
    const res = await fetch(`${API}/api/facebook/pages/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify(updates) });
    if (res.ok) { const d = await res.json(); setPages(prev => prev.map(p => p.id === id ? { ...p, ...d } : p)); }
  };
  const deletePage = async (id, name) => {
    if (!confirm(`Xóa Page "${name}"?`)) return;
    await fetch(`${API}/api/facebook/pages/${id}`, { method: 'DELETE', headers: hdr() });
    setPages(prev => prev.filter(p => p.id !== id));
  };
  const startEdit = (p) => { setEditingId(p.id); setForm({ page_id: p.page_id, page_name: p.page_name || '', access_token: '', webhook_verify_token: p.webhook_verify_token || '', auto_reply_message: p.auto_reply_message || '', auto_create_lead: p.auto_create_lead, default_company_id: p.default_company_id || '', default_stage_id: p.default_stage_id || '', default_lead_owner_id: p.default_lead_owner_id || '' }); };
  const saveEdit = async (id) => {
    const updates = { ...form }; if (!updates.access_token) delete updates.access_token;
    await fetch(`${API}/api/facebook/pages/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify(updates) });
    setEditingId(null); load();
  };

  const webhookUrl = `${window.location.origin.replace(/:\d+$/, '').replace('http://', 'https://').replace('frontend-s30w', 'backend')}/api/facebook/webhook`;

  const CompanyStageSelectors = () => (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-gray-600 mb-1 block">Công ty mặc định (Lead vào)</label>
        <select value={form.default_company_id} onChange={e => setForm({...form, default_company_id: e.target.value})}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer">
          <option value="">-- Không chọn --</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-600 mb-1 block">Giai đoạn mặc định</label>
        <select value={form.default_stage_id} onChange={e => setForm({...form, default_stage_id: e.target.value})}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer">
          <option value="">-- Tự động (Mới) --</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className="text-xs text-gray-600 mb-1 block">👤 Người chịu trách nhiệm Lead mặc định</label>
        <select value={form.default_lead_owner_id} onChange={e => setForm({...form, default_lead_owner_id: e.target.value})}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer">
          <option value="">-- Người tạo Page (mặc định) --</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email} {u.role === 'admin' ? '(Admin)' : ''}</option>)}
        </select>
        <p className="text-[10px] text-gray-400 mt-1">Khi có lead mới từ Facebook, người này sẽ được gán làm chủ lead + người phụ trách</p>
      </div>
    </div>
  );

  return (
    <div className="p-6 overflow-y-auto h-full max-w-4xl">
      <h2 className="text-lg font-bold mb-4">⚙ Cài đặt Facebook</h2>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h3 className="font-bold text-blue-800 mb-2">📋 Hướng dẫn</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Vào <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline font-medium">developers.facebook.com</a> → Tạo App Business</li>
          <li>Thêm Messenger + Webhooks → Kết nối Page → Lấy Token</li>
          <li>Cài Webhook URL bên dưới → Subscribe <code>messages</code></li>
          <li>Nhập Page ID + Token vào form</li>
        </ol>
      </div>
      <div className="bg-gray-50 border rounded-lg p-3 mb-6 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600 shrink-0">Webhook:</span>
        <code className="text-xs bg-white px-2 py-1 rounded border flex-1 break-all">{webhookUrl}</code>
        <button onClick={() => navigator.clipboard.writeText(webhookUrl)} className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300 cursor-pointer flex items-center gap-1"><Copy size={12} /> Copy</button>
      </div>

      <div className="space-y-4 mb-6">
        {pages.map(p => (
          <div key={p.id} className="bg-white border rounded-xl p-5 shadow-sm">
            {editingId === p.id ? (
              <div className="space-y-3">
                <h3 className="font-bold text-sm">✏️ Sửa Page</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-600 mb-1 block">Page ID</label><input value={form.page_id} onChange={e => setForm({...form, page_id: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" /></div>
                  <div><label className="text-xs text-gray-600 mb-1 block">Tên Page</label><input value={form.page_name} onChange={e => setForm({...form, page_name: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" /></div>
                </div>
                <div><label className="text-xs text-gray-600 mb-1 block">Token mới (bỏ trống = giữ cũ)</label><textarea value={form.access_token} onChange={e => setForm({...form, access_token: e.target.value})} rows={2} className="w-full px-3 py-2 text-sm border rounded font-mono" placeholder="Paste token..." /></div>
                <div><label className="text-xs text-gray-600 mb-1 block">Tin nhắn tự động</label><input value={form.auto_reply_message} onChange={e => setForm({...form, auto_reply_message: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" /></div>
                <div className="flex items-center gap-2"><input type="checkbox" checked={form.auto_create_lead} onChange={e => setForm({...form, auto_create_lead: e.target.checked})} id={`acl-${p.id}`} className="cursor-pointer" /><label htmlFor={`acl-${p.id}`} className="text-sm">Tự động tạo Lead</label></div>
                <CompanyStageSelectors />
                <div className="flex gap-2 pt-2">
                  <button onClick={() => saveEdit(p.id)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 cursor-pointer flex items-center gap-1"><Save size={14} /> Lưu</button>
                  <button onClick={() => setEditingId(null)} className="text-gray-500 text-sm cursor-pointer px-4 py-2">Hủy</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">f</div>
                    <div><h3 className="font-bold text-gray-800">{p.page_name || p.page_id}</h3><p className="text-xs text-gray-500">ID: {p.page_id}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(p)} className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-1"><Edit3 size={12} /> Sửa</button>
                    <button onClick={() => deletePage(p.id, p.page_name)} className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-1"><Trash2 size={12} /> Xóa</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => updatePage(p.id, { is_active: !p.is_active })}
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${p.is_active ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                    {p.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />} {p.is_active ? 'Active' : 'Tắt'}
                  </button>
                  <button onClick={() => updatePage(p.id, { auto_create_lead: !p.auto_create_lead })}
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${p.auto_create_lead ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                    <UserPlus size={14} /> {p.auto_create_lead ? 'Auto Lead: BẬT' : 'Auto Lead: TẮT'}
                  </button>
                  {p.auto_reply_message && <span className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 border border-purple-200">💬 "{p.auto_reply_message.substring(0, 25)}..."</span>}
                  {p.default_company_id && <span className="text-xs px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">🏢 {companies.find(c => c.id === p.default_company_id)?.short_name || companies.find(c => c.id === p.default_company_id)?.name || 'Công ty'}</span>}
                  {p.default_lead_owner_id && <span className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">👤 {users.find(u => u.id === p.default_lead_owner_id)?.full_name || 'Người phụ trách'}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!showAdd ? (
        <button onClick={() => { setShowAdd(true); setForm({ ...emptyForm }); }}
          className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer"><Plus size={16} /> Thêm Page</button>
      ) : (
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-sm">➕ Thêm Facebook Page</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-600 mb-1 block">Page ID *</label><input value={form.page_id} onChange={e => setForm({...form, page_id: e.target.value})} placeholder="479307381939218" className="w-full px-3 py-2 text-sm border rounded" /></div>
            <div><label className="text-xs text-gray-600 mb-1 block">Tên Page</label><input value={form.page_name} onChange={e => setForm({...form, page_name: e.target.value})} placeholder="Supermarket 3K1D" className="w-full px-3 py-2 text-sm border rounded" /></div>
          </div>
          <div><label className="text-xs text-gray-600 mb-1 block">Token *</label><textarea value={form.access_token} onChange={e => setForm({...form, access_token: e.target.value})} rows={2} className="w-full px-3 py-2 text-sm border rounded font-mono" placeholder="Paste token..." /></div>
          <div><label className="text-xs text-gray-600 mb-1 block">Tin nhắn tự động</label><input value={form.auto_reply_message} onChange={e => setForm({...form, auto_reply_message: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" /></div>
          <div className="flex items-center gap-2"><input type="checkbox" checked={form.auto_create_lead} onChange={e => setForm({...form, auto_create_lead: e.target.checked})} id="acl-new" className="cursor-pointer" /><label htmlFor="acl-new" className="text-sm">Tự động tạo Lead</label></div>
          <CompanyStageSelectors />
          <div className="flex gap-2 pt-2">
            <button onClick={addPage} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 cursor-pointer">Lưu</button>
            <button onClick={() => setShowAdd(false)} className="text-gray-500 text-sm cursor-pointer px-4 py-2">Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}
