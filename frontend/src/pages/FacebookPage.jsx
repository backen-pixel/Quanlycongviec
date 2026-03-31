import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, Users, FileText, MessageSquare, Settings, Send, Search, ExternalLink, Link2, Plus, ChevronRight, Bell, Image, Paperclip, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });

// ═══════════════════════════════════════════════════════════════
// FACEBOOK INTEGRATION PAGE
// ═══════════════════════════════════════════════════════════════

export default function FacebookPage() {
  const [tab, setTab] = useState('inbox');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/facebook/stats`, { headers: headers() })
      .then(r => r.ok ? r.json() : {}).then(setStats).catch(() => {});
  }, [tab]);

  const tabs = [
    { id: 'inbox', label: 'Hộp thư', icon: MessageCircle, badge: stats?.total_unread },
    { id: 'lead-ads', label: 'Lead Ads', icon: FileText, badge: stats?.lead_ads_today },
    { id: 'comments', label: 'Bình luận', icon: MessageSquare, badge: stats?.comments_today },
    { id: 'settings', label: 'Cài đặt', icon: Settings },
  ];

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Header */}
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">f</span>
          </div>
          <h1 className="text-lg font-bold text-gray-800">Facebook Integration</h1>
        </div>
        {stats && (
          <div className="flex gap-4 text-xs text-gray-500">
            <span>📨 {stats.messages_today} tin nhắn hôm nay</span>
            <span>📋 {stats.lead_ads_today} lead ads</span>
            <span>💬 {stats.comments_today} bình luận</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b bg-white px-6 flex gap-1 shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon size={16} />
            {t.label}
            {t.badge > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'inbox' && <InboxTab />}
        {tab === 'lead-ads' && <LeadAdsTab />}
        {tab === 'comments' && <CommentsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INBOX TAB — Chat Messenger
// ═══════════════════════════════════════════════════════════════

function InboxTab() {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const loadContacts = useCallback(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    fetch(`${API}/api/facebook/contacts${params}`, { headers: headers() })
      .then(r => r.ok ? r.json() : []).then(setContacts).catch(() => {});
  }, [search]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  useEffect(() => {
    if (!selected) return;
    fetch(`${API}/api/facebook/contacts/${selected.id}/messages`, { headers: headers() })
      .then(r => r.ok ? r.json() : []).then(d => { setMessages(d); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); })
      .catch(() => {});
  }, [selected]);

  const sendReply = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${selected.id}/reply`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ message: reply }),
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
                selected?.id === c.id ? 'bg-blue-50' : ''
              }`}>
              {c.fb_profile_pic
                ? <img src={c.fb_profile_pic} className="w-10 h-10 rounded-full" alt="" />
                : <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                    {(c.fb_name || 'FB')[0]}
                  </div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm text-gray-800 truncate">{c.fb_name}</p>
                  {c.unread_count > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 min-w-[18px] text-center">{c.unread_count}</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {c.lead ? `🏷 ${c.lead.code}` : c.phone || 'Chưa gắn Lead'}
                </p>
              </div>
            </div>
          ))}
          {contacts.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Chưa có liên hệ nào</p>}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {selected ? (
          <>
            {/* Chat header */}
            <div className="border-b px-4 py-3 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {selected.fb_profile_pic
                  ? <img src={selected.fb_profile_pic} className="w-8 h-8 rounded-full" alt="" />
                  : <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">{(selected.fb_name || 'FB')[0]}</div>}
                <div>
                  <p className="font-medium text-sm">{selected.fb_name}</p>
                  <p className="text-xs text-gray-500">{selected.phone || selected.email || 'Messenger'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selected.lead && (
                  <a href={`/crm/leads/${selected.lead.id}`} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1">
                    <ExternalLink size={12} /> {selected.lead.code}
                  </a>
                )}
                {!selected.lead && (
                  <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded">⚠ Chưa gắn Lead</span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    m.direction === 'outbound'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                  }`}>
                    {m.attachment_url && m.message_type === 'image' && (
                      <img src={m.attachment_url} className="max-w-[250px] rounded-lg mb-1" alt="" />
                    )}
                    {m.attachment_url && m.message_type !== 'image' && (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm underline">
                        <Paperclip size={12} /> Tệp đính kèm
                      </a>
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

            {/* Reply box */}
            <div className="border-t bg-white p-3 shrink-0">
              <div className="flex gap-2">
                <input value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 px-4 py-2 border rounded-full text-sm focus:ring-2 focus:ring-blue-500" />
                <button onClick={sendReply} disabled={sending || !reply.trim()}
                  className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-blue-700 disabled:opacity-50">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageCircle size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Chọn một cuộc hội thoại</p>
            </div>
          </div>
        )}
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
    fetch(`${API}/api/facebook/lead-ads`, { headers: headers() })
      .then(r => r.ok ? r.json() : []).then(setAds).catch(() => {});
  }, []);

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-4">📋 Facebook Lead Ads</h2>
      {ads.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p>Chưa có lead ads nào. Khi KH submit form trên Facebook, dữ liệu sẽ hiện ở đây.</p>
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
                  {ad.lead && (
                    <a href={`/crm/leads/${ad.lead.id}`} className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100">
                      ✅ {ad.lead.code}
                    </a>
                  )}
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
    fetch(`${API}/api/facebook/comments`, { headers: headers() })
      .then(r => r.ok ? r.json() : []).then(setComments).catch(() => {});
  }, []);

  const sendReply = async (commentId) => {
    if (!replyText.trim()) return;
    try {
      await fetch(`${API}/api/facebook/comments/${commentId}/reply`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ message: replyText }),
      });
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, replied: true, reply_text: replyText } : c));
      setReplyingTo(null);
      setReplyText('');
    } catch (e) { console.error(e); }
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-4">💬 Bình luận Facebook</h2>
      {comments.length === 0 ? (
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
                <div className="flex items-center gap-2 shrink-0">
                  {c.replied ? (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">✅ Đã trả lời</span>
                  ) : (
                    <button onClick={() => { setReplyingTo(c.id); setReplyText(''); }}
                      className="text-xs text-blue-600 hover:underline">Trả lời</button>
                  )}
                </div>
              </div>
              {c.replied && c.reply_text && (
                <div className="mt-2 ml-4 border-l-2 border-blue-200 pl-3">
                  <p className="text-xs text-blue-600">↩ Đã trả lời: {c.reply_text}</p>
                </div>
              )}
              {replyingTo === c.id && (
                <div className="mt-3 flex gap-2">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)}
                    placeholder="Nhập phản hồi..." className="flex-1 px-3 py-1.5 text-sm border rounded" />
                  <button onClick={() => sendReply(c.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">Gửi</button>
                  <button onClick={() => setReplyingTo(null)} className="text-gray-500 text-sm">Hủy</button>
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
// SETTINGS TAB — Quản lý Facebook Pages
// ═══════════════════════════════════════════════════════════════

function SettingsTab() {
  const [pages, setPages] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ page_id: '', page_name: '', access_token: '', webhook_verify_token: 'tubep_pro_verify_2024', auto_reply_message: 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.' });

  useEffect(() => {
    fetch(`${API}/api/facebook/pages`, { headers: headers() })
      .then(r => r.ok ? r.json() : []).then(setPages).catch(() => {});
  }, []);

  const addPage = async () => {
    if (!form.page_id || !form.access_token) return alert('Cần nhập Page ID và Access Token');
    const res = await fetch(`${API}/api/facebook/pages`, { method: 'POST', headers: headers(), body: JSON.stringify(form) });
    if (res.ok) {
      const data = await res.json();
      setPages(prev => [...prev, data]);
      setShowAdd(false);
      setForm({ page_id: '', page_name: '', access_token: '', webhook_verify_token: 'tubep_pro_verify_2024', auto_reply_message: 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.' });
    }
  };

  const webhookUrl = `${window.location.origin.replace(/:\d+$/, '').replace('http://', 'https://')}/api/facebook/webhook`;

  return (
    <div className="p-6 overflow-y-auto h-full max-w-3xl">
      <h2 className="text-lg font-bold mb-4">⚙ Cài đặt Facebook Integration</h2>

      {/* Hướng dẫn */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-blue-800 mb-2">📋 Hướng dẫn cài đặt</h3>
        <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
          <li>Vào <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline font-medium">developers.facebook.com</a> → Tạo App loại Business</li>
          <li>Thêm sản phẩm: <strong>Messenger</strong>, <strong>Webhooks</strong></li>
          <li>Kết nối Facebook Page → Lấy <strong>Page Access Token</strong></li>
          <li>Cài Webhook URL: <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs break-all">{webhookUrl}</code></li>
          <li>Subscribe events: <code>messages, messaging_postbacks, feed, leadgen</code></li>
          <li>Nhập Page ID + Token vào form bên dưới</li>
        </ol>
      </div>

      {/* Webhook URL copy */}
      <div className="bg-gray-50 border rounded-lg p-3 mb-6 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600">Webhook URL:</span>
        <code className="text-xs bg-white px-2 py-1 rounded border flex-1 break-all">{webhookUrl}</code>
        <button onClick={() => navigator.clipboard.writeText(webhookUrl)} className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300">Copy</button>
      </div>

      {/* Pages list */}
      <div className="space-y-3 mb-6">
        {pages.map(p => (
          <div key={p.id} className="bg-white border rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{p.page_name || p.page_id}</p>
              <p className="text-xs text-gray-500">Page ID: {p.page_id}</p>
            </div>
            <div className="flex items-center gap-3">
              {p.auto_create_lead && <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded">🟢 Auto Lead</span>}
              <span className={`text-xs px-2 py-1 rounded ${p.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {p.is_active ? '✅ Active' : '❌ Inactive'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add page */}
      {!showAdd ? (
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus size={16} /> Thêm Facebook Page
        </button>
      ) : (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <h3 className="font-bold text-sm">Thêm Facebook Page</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Page ID *</label>
              <input value={form.page_id} onChange={e => setForm({ ...form, page_id: e.target.value })}
                placeholder="VD: 123456789" className="w-full px-3 py-2 text-sm border rounded" />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Tên Page</label>
              <input value={form.page_name} onChange={e => setForm({ ...form, page_name: e.target.value })}
                placeholder="VD: TuBep Pro" className="w-full px-3 py-2 text-sm border rounded" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Page Access Token *</label>
            <textarea value={form.access_token} onChange={e => setForm({ ...form, access_token: e.target.value })}
              placeholder="Paste token từ Facebook Developer..." rows={2}
              className="w-full px-3 py-2 text-sm border rounded font-mono" />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Verify Token</label>
            <input value={form.webhook_verify_token} onChange={e => setForm({ ...form, webhook_verify_token: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded" />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Tin nhắn tự động trả lời</label>
            <input value={form.auto_reply_message} onChange={e => setForm({ ...form, auto_reply_message: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded" />
          </div>
          <div className="flex gap-2">
            <button onClick={addPage} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Lưu</button>
            <button onClick={() => setShowAdd(false)} className="text-gray-500 text-sm">Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}
