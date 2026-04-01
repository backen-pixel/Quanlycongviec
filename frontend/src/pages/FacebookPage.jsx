import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  MessageCircle, Users, FileText, MessageSquare, Settings, Send, Search, ExternalLink,
  Link2, Plus, ChevronRight, Bell, Image, Paperclip, RefreshCw, ToggleLeft, ToggleRight,
  X, Trash2, Edit3, UserPlus, Phone, Mail, MoreHorizontal, Check, Copy, Save, Eye, EyeOff
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
    { id: 'lead-ads', label: 'Lead Ads', icon: FileText, badge: stats?.lead_ads_today },
    { id: 'comments', label: 'Bình luận', icon: MessageSquare, badge: stats?.comments_today },
    { id: 'settings', label: 'Cài đặt', icon: Settings },
  ];

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">f</span>
          </div>
          <h1 className="text-lg font-bold text-gray-800">Facebook Integration</h1>
        </div>
        {stats && (
          <div className="flex gap-4 text-xs text-gray-500">
            <span>📨 {stats.messages_today} tin nhắn</span>
            <span>👥 {stats.total_contacts} liên hệ</span>
            <span>📋 {stats.lead_ads_today} lead ads</span>
          </div>
        )}
      </div>

      <div className="border-b bg-white px-6 flex gap-1 shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon size={16} />
            {t.label}
            {t.badge > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'inbox' && <InboxTab />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'lead-ads' && <LeadAdsTab />}
        {tab === 'comments' && <CommentsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INBOX TAB — Chat Messenger (realtime)
// ═══════════════════════════════════════════════════════════════

function InboxTab() {
  const { socket } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  const loadContacts = useCallback(() => {
    const p = search ? `?search=${encodeURIComponent(search)}` : '';
    fetch(`${API}/api/facebook/contacts${p}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(setContacts).catch(() => {});
  }, [search]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Realtime
  useEffect(() => {
    if (!socket) return;
    const h = (data) => {
      setContacts(prev => {
        const ex = prev.find(c => c.id === data.contact_id);
        if (ex) {
          const up = { ...ex, last_message_at: new Date().toISOString(),
            unread_count: selectedRef.current?.id === data.contact_id ? 0 : (ex.unread_count || 0) + 1 };
          return [up, ...prev.filter(c => c.id !== data.contact_id)];
        }
        return [data.contact || { id: data.contact_id, fb_name: 'Facebook User', unread_count: 1 }, ...prev];
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
    fetch(`${API}/api/facebook/contacts/${selected.id}/messages`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(d => { setMessages(d); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); })
      .catch(() => {});
  }, [selected]);

  const sendReply = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${selected.id}/reply`, {
        method: 'POST', headers: hdr(), body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, msg]);
        setReply('');
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (e) { console.error(e); }
    setSending(false);
  };

  return (
    <div className="flex h-full">
      {/* Contact list */}
      <div className="w-80 border-r bg-gray-50 flex flex-col shrink-0">
        <div className="p-3 border-b">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm..."
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {contacts.map(c => (
            <div key={c.id} onClick={() => setSelected(c)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 hover:bg-blue-50 transition ${
                selected?.id === c.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}>
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                {(c.fb_name || 'FB')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm text-gray-800 truncate">{c.fb_name}</p>
                  {c.unread_count > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 min-w-[18px] text-center">{c.unread_count}</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {c.lead ? `🏷 ${c.lead.code}` : c.phone || 'Messenger'}
                </p>
              </div>
            </div>
          ))}
          {!contacts.length && <p className="text-center text-sm text-gray-400 py-8">Chưa có liên hệ</p>}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {selected ? (
          <>
            <div className="border-b px-4 py-3 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">{(selected.fb_name || 'FB')[0]}</div>
                <div>
                  <p className="font-medium text-sm">{selected.fb_name}</p>
                  <p className="text-xs text-gray-500">{selected.phone || selected.email || 'Messenger'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selected.lead ? (
                  <a href={`/crm/leads/${selected.lead.id}`} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1">
                    <ExternalLink size={12} /> {selected.lead.code}
                  </a>
                ) : (
                  <CreateLeadButton contactId={selected.id} onCreated={(lead) => {
                    setSelected(prev => ({ ...prev, lead }));
                    loadContacts();
                  }} />
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    m.direction === 'outbound' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                  }`}>
                    {m.attachment_url && m.message_type === 'image' && <img src={m.attachment_url} className="max-w-[250px] rounded-lg mb-1" alt="" />}
                    {m.attachment_url && m.message_type !== 'image' && (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm underline"><Paperclip size={12} /> Tệp</a>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                    <p className={`text-[10px] mt-1 ${m.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'}`}>
                      {new Date(m.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t bg-white p-3 shrink-0">
              <div className="flex gap-2">
                <input value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 px-4 py-2 border rounded-full text-sm focus:ring-2 focus:ring-blue-500" />
                <button onClick={sendReply} disabled={sending || !reply.trim()}
                  className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center"><MessageCircle size={48} className="mx-auto mb-3 opacity-30" /><p className="text-sm">Chọn một cuộc hội thoại</p></div>
          </div>
        )}
      </div>
    </div>
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
      className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100 flex items-center gap-1 cursor-pointer disabled:opacity-50">
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
  const [filter, setFilter] = useState('all'); // all | has_lead | no_lead
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (filter === 'has_lead') p.set('has_lead', 'true');
    if (filter === 'no_lead') p.set('has_lead', 'false');
    fetch(`${API}/api/facebook/contacts?${p}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(setContacts).catch(() => {});
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
    try {
      await fetch(`${API}/api/facebook/contacts/${id}`, { method: 'DELETE', headers: hdr() });
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch (e) { alert('Lỗi'); }
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">👥 Danh bạ Facebook ({contacts.length})</h2>
        <button onClick={load} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer"><RefreshCw size={14} /> Làm mới</button>
      </div>

      {/* Filters */}
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

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Tên</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">SĐT</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
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
                    <td className="px-4 py-2"><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" placeholder="SĐT" /></td>
                    <td className="px-4 py-2"><input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" placeholder="Email" /></td>
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
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">{(c.fb_name || 'F')[0]}</div>
                        <span className="font-medium text-gray-800">{c.fb_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.phone || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{c.email || <span className="text-gray-300">—</span>}</td>
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
    fetch(`${API}/api/facebook/lead-ads`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(setAds).catch(() => {});
  }, []);

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-4">📋 Facebook Lead Ads</h2>
      {!ads.length ? (
        <div className="text-center text-gray-400 py-12">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p>Chưa có lead ads. Khi KH submit form trên Facebook, dữ liệu sẽ hiện ở đây.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ads.map(ad => (
            <div key={ad.id} className="bg-white border rounded-lg p-4 hover:shadow-md transition">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📋</span>
                  <span className="font-medium">{ad.full_name || 'N/A'}</span>
                  {ad.phone && <span className="text-sm text-gray-500">📞 {ad.phone}</span>}
                  {ad.email && <span className="text-sm text-gray-500">✉ {ad.email}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {ad.lead && <a href={`/crm/leads/${ad.lead.id}`} className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100">✅ {ad.lead.code}</a>}
                  {ad.processed && !ad.lead && <span className="text-xs text-orange-500">⚠ Đã xử lý</span>}
                  {!ad.processed && <span className="text-xs text-red-500">🔴 Chưa xử lý</span>}
                </div>
              </div>
              {ad.form_name && <p className="text-xs text-gray-500 mb-1">Form: {ad.form_name}</p>}
              {ad.field_data && (
                <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-1">
                  {Object.entries(ad.field_data).map(([k, v]) => (
                    <div key={k}><span className="font-medium">{k}:</span> {v}</div>
                  ))}
                </div>
              )}
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
    fetch(`${API}/api/facebook/comments`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(setComments).catch(() => {});
  }, []);

  const sendReply = async (commentId) => {
    if (!replyText.trim()) return;
    try {
      await fetch(`${API}/api/facebook/comments/${commentId}/reply`, {
        method: 'POST', headers: hdr(), body: JSON.stringify({ message: replyText }),
      });
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, replied: true, reply_text: replyText } : c));
      setReplyingTo(null); setReplyText('');
    } catch (e) { console.error(e); }
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-4">💬 Bình luận Facebook</h2>
      {!comments.length ? (
        <div className="text-center text-gray-400 py-12">
          <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
          <p>Chưa có bình luận nào.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="bg-white border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm">{c.from_name || 'Ẩn danh'}</p>
                  <p className="text-sm text-gray-700 mt-1">{c.message}</p>
                  {c.attachment_url && <img src={c.attachment_url} className="max-w-[200px] rounded mt-2" alt="" />}
                </div>
                {c.replied ? (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded shrink-0">✅ Đã trả lời</span>
                ) : (
                  <button onClick={() => { setReplyingTo(c.id); setReplyText(''); }}
                    className="text-xs text-blue-600 hover:underline cursor-pointer shrink-0">Trả lời</button>
                )}
              </div>
              {c.replied && c.reply_text && (
                <div className="mt-2 ml-4 border-l-2 border-blue-200 pl-3">
                  <p className="text-xs text-blue-600">↩ {c.reply_text}</p>
                </div>
              )}
              {replyingTo === c.id && (
                <div className="mt-3 flex gap-2">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)}
                    placeholder="Nhập phản hồi..." className="flex-1 px-3 py-1.5 text-sm border rounded" />
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

function SettingsTab() {
  const [pages, setPages] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stages, setStages] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showToken, setShowToken] = useState({});
  const emptyForm = { page_id: '', page_name: '', access_token: '', webhook_verify_token: 'tubep_pro_verify_2024', auto_reply_message: 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.', auto_create_lead: true, default_company_id: '', default_stage_id: '' };
  const [form, setForm] = useState({ ...emptyForm });

  const load = () => {
    fetch(`${API}/api/facebook/pages`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(setPages).catch(() => {});
  };
  useEffect(() => {
    load();
    api.get('/companies').then(r => setCompanies(r.data?.companies || r.data || [])).catch(() => {});
    api.get('/crm/pipeline-stages', { params: { type: 'lead' } }).then(r => setStages(r.data || [])).catch(() => {});
  }, []);

  const addPage = async () => {
    if (!form.page_id || !form.access_token) return alert('Cần nhập Page ID và Access Token');
    const res = await fetch(`${API}/api/facebook/pages`, { method: 'POST', headers: hdr(), body: JSON.stringify(form) });
    if (res.ok) { load(); setShowAdd(false); setForm({ ...emptyForm }); }
    else { const e = await res.json(); alert(e.error || 'Lỗi'); }
  };

  const updatePage = async (id, updates) => {
    const res = await fetch(`${API}/api/facebook/pages/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify(updates) });
    if (res.ok) { const d = await res.json(); setPages(prev => prev.map(p => p.id === id ? { ...p, ...d } : p)); }
  };

  const deletePage = async (id, name) => {
    if (!confirm(`Xóa Page "${name}"? Dữ liệu contacts/messages sẽ vẫn giữ.`)) return;
    await fetch(`${API}/api/facebook/pages/${id}`, { method: 'DELETE', headers: hdr() });
    setPages(prev => prev.filter(p => p.id !== id));
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setForm({ page_id: p.page_id, page_name: p.page_name || '', access_token: '', webhook_verify_token: p.webhook_verify_token || '', auto_reply_message: p.auto_reply_message || '', auto_create_lead: p.auto_create_lead, default_company_id: p.default_company_id || '', default_stage_id: p.default_stage_id || '' });
  };

  const saveEdit = async (id) => {
    const updates = { ...form };
    if (!updates.access_token) delete updates.access_token; // Don't clear token if empty
    await fetch(`${API}/api/facebook/pages/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify(updates) });
    setEditingId(null);
    load();
  };

  const webhookUrl = `${window.location.origin.replace(/:\d+$/, '').replace('http://', 'https://').replace('frontend-s30w', 'backend')}/api/facebook/webhook`;

  return (
    <div className="p-6 overflow-y-auto h-full max-w-4xl">
      <h2 className="text-lg font-bold mb-4">⚙ Cài đặt Facebook Integration</h2>

      {/* Hướng dẫn */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-blue-800 mb-2">📋 Hướng dẫn cài đặt</h3>
        <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
          <li>Vào <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline font-medium">developers.facebook.com</a> → Tạo App loại Business</li>
          <li>Thêm sản phẩm: <strong>Messenger</strong>, <strong>Webhooks</strong></li>
          <li>Kết nối Facebook Page → Lấy <strong>Page Access Token</strong></li>
          <li>Cài Webhook URL bên dưới, Subscribe events: <code>messages</code></li>
          <li>Nhập Page ID + Token vào form bên dưới</li>
        </ol>
      </div>

      {/* Webhook URL */}
      <div className="bg-gray-50 border rounded-lg p-3 mb-6 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600 shrink-0">Webhook URL:</span>
        <code className="text-xs bg-white px-2 py-1 rounded border flex-1 break-all">{webhookUrl}</code>
        <button onClick={() => { navigator.clipboard.writeText(webhookUrl); }} className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300 cursor-pointer flex items-center gap-1"><Copy size={12} /> Copy</button>
      </div>

      {/* Pages list */}
      <div className="space-y-4 mb-6">
        {pages.map(p => (
          <div key={p.id} className="bg-white border rounded-xl p-5 shadow-sm">
            {editingId === p.id ? (
              /* Edit mode */
              <div className="space-y-3">
                <h3 className="font-bold text-sm text-gray-700">✏️ Sửa Page</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Page ID</label>
                    <input value={form.page_id} onChange={e => setForm({...form, page_id: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Tên Page</label>
                    <input value={form.page_name} onChange={e => setForm({...form, page_name: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Access Token mới (bỏ trống = giữ cũ)</label>
                  <textarea value={form.access_token} onChange={e => setForm({...form, access_token: e.target.value})}
                    rows={2} className="w-full px-3 py-2 text-sm border rounded font-mono" placeholder="Paste token mới..." />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Tin nhắn tự động trả lời</label>
                  <input value={form.auto_reply_message} onChange={e => setForm({...form, auto_reply_message: e.target.value})}
                    className="w-full px-3 py-2 text-sm border rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={form.auto_create_lead} onChange={e => setForm({...form, auto_create_lead: e.target.checked})} id={`acl-${p.id}`} className="cursor-pointer" />
                  <label htmlFor={`acl-${p.id}`} className="text-sm text-gray-700 cursor-pointer">Tự động tạo Lead khi có tin nhắn mới</label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Công ty mặc định (tạo Lead vào)</label>
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
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => saveEdit(p.id)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 cursor-pointer flex items-center gap-1"><Save size={14} /> Lưu</button>
                  <button onClick={() => setEditingId(null)} className="text-gray-500 text-sm cursor-pointer px-4 py-2">Hủy</button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold">f</div>
                    <div>
                      <h3 className="font-bold text-gray-800">{p.page_name || p.page_id}</h3>
                      <p className="text-xs text-gray-500">Page ID: {p.page_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(p)} className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-1"><Edit3 size={12} /> Sửa</button>
                    <button onClick={() => deletePage(p.id, p.page_name)} className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-1"><Trash2 size={12} /> Xóa</button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* Toggle Active */}
                  <button onClick={() => updatePage(p.id, { is_active: !p.is_active })}
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${p.is_active ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100' : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'}`}>
                    {p.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    {p.is_active ? 'Đang hoạt động' : 'Đã tắt'}
                  </button>

                  {/* Toggle Auto Lead */}
                  <button onClick={() => updatePage(p.id, { auto_create_lead: !p.auto_create_lead })}
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${p.auto_create_lead ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100' : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'}`}>
                    <UserPlus size={14} />
                    {p.auto_create_lead ? 'Auto Lead: BẬT' : 'Auto Lead: TẮT'}
                  </button>

                  {/* Auto reply */}
                  {p.auto_reply_message && (
                    <span className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 border border-purple-200">
                      💬 "{p.auto_reply_message.substring(0, 30)}..."
                    </span>
                  )}

                  {/* Default company */}
                  {p.default_company_id && (
                    <span className="text-xs px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">
                      🏢 {companies.find(c => c.id === p.default_company_id)?.short_name || companies.find(c => c.id === p.default_company_id)?.name || 'Công ty'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add page */}
      {!showAdd ? (
        <button onClick={() => { setShowAdd(true); setForm({ ...emptyForm }); }}
          className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer">
          <Plus size={16} /> Thêm Facebook Page
        </button>
      ) : (
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-sm">➕ Thêm Facebook Page</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Page ID *</label>
              <input value={form.page_id} onChange={e => setForm({...form, page_id: e.target.value})} placeholder="VD: 479307381939218" className="w-full px-3 py-2 text-sm border rounded" />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Tên Page</label>
              <input value={form.page_name} onChange={e => setForm({...form, page_name: e.target.value})} placeholder="VD: Supermarket 3K1D" className="w-full px-3 py-2 text-sm border rounded" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Page Access Token *</label>
            <textarea value={form.access_token} onChange={e => setForm({...form, access_token: e.target.value})}
              placeholder="Paste token từ Facebook Developer..." rows={2} className="w-full px-3 py-2 text-sm border rounded font-mono" />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Tin nhắn tự động trả lời</label>
            <input value={form.auto_reply_message} onChange={e => setForm({...form, auto_reply_message: e.target.value})}
              className="w-full px-3 py-2 text-sm border rounded" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.auto_create_lead} onChange={e => setForm({...form, auto_create_lead: e.target.checked})} id="acl-new" className="cursor-pointer" />
            <label htmlFor="acl-new" className="text-sm text-gray-700 cursor-pointer">Tự động tạo Lead khi có tin nhắn mới</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Công ty mặc định (tạo Lead vào)</label>
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
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={addPage} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 cursor-pointer">Lưu</button>
            <button onClick={() => setShowAdd(false)} className="text-gray-500 text-sm cursor-pointer px-4 py-2">Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}
