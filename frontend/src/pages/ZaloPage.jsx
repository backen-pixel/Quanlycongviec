import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  MessageCircle, Settings, Send, Search, RefreshCw, Plus, Save, Trash2,
  ExternalLink, Copy, Check, Users, Bell, Zap, UserCircle,
} from 'lucide-react';
import ZaloAutoToolPanel from '../components/ZaloAutoToolPanel';
import ZaloContactsTab from '../components/ZaloContactsTab';
import IntegrationLeadRoutingFields from '../components/IntegrationLeadRoutingFields';

const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

function Avatar({ name, url }) {
  if (url) {
    return <img src={url} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-200" />;
  }
  const letter = (name || 'Z')[0].toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
      {letter}
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${time}`;
}

function looksLikePlaceholderName(name, userId) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (/^Zalo\s/i.test(n)) return true;
  if (/^Zalo KH$/i.test(n)) return true;
  if (userId && n === String(userId)) return true;
  return false;
}

function formatTokenExpiry(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function tokenStatusLabel(account) {
  if (account.access_token_expired) return { text: 'Access hết hạn', cls: 'text-red-600' };
  if (account.needs_token_refresh) return { text: 'Cần refresh', cls: 'text-amber-600' };
  if (account.access_token_expiring_soon) return { text: 'Sắp hết hạn', cls: 'text-amber-600' };
  if (account.access_token_expires_at) return { text: 'OK', cls: 'text-green-600' };
  if (!account.refresh_token_set) return { text: 'Chưa có refresh', cls: 'text-slate-500' };
  return { text: '—', cls: 'text-slate-400' };
}

const EMPTY_ACCOUNT = {
  oa_id: '',
  oa_name: '',
  app_id: '',
  access_token: '',
  refresh_token: '',
  secret_key: '',
  is_active: true,
  auto_create_lead: true,
  auto_reply_message: 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.',
  webhook_verify_enabled: true,
  default_module_key: '',
  default_target_type: '',
  default_company_id: '',
  default_region_id: '',
  default_lead_type_id: '',
  default_stage_id: '',
  default_lead_owner_id: '',
};

export default function ZaloPage() {
  const { socket } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'inbox');
  const [stats, setStats] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [webhookInfo, setWebhookInfo] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_ACCOUNT });
  const [editingId, setEditingId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [syncingProfile, setSyncingProfile] = useState(false);
  const [refreshingNames, setRefreshingNames] = useState(false);
  const [refreshingTokenId, setRefreshingTokenId] = useState(null);
  const messagesEndRef = useRef(null);

  const loadStats = useCallback(() => {
    fetch(`${API}/api/zalo/stats`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => {});
  }, []);

  const loadContacts = useCallback(() => {
    setLoadingContacts(true);
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    fetch(`${API}/api/zalo/contacts${q}`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setContacts(d.data || []))
      .catch(() => setContacts([]))
      .finally(() => setLoadingContacts(false));
  }, [search]);

  const loadAccounts = useCallback(() => {
    fetch(`${API}/api/zalo/accounts`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : []))
      .then(setAccounts)
      .catch(() => setAccounts([]));
    fetch(`${API}/api/zalo/webhook-info`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setWebhookInfo)
      .catch(() => {});
  }, []);

  const loadMessages = useCallback(async (contactId, opts = {}) => {
    if (!contactId) return;
    setLoadingMessages(true);
    try {
      const r = await fetch(`${API}/api/zalo/contacts/${contactId}/messages`, { headers: hdr() });
      const d = r.ok ? await r.json() : null;
      let contact = d?.contact || null;
      const msgs = d?.messages || [];
      if (contact?.id && (opts.syncProfile || looksLikePlaceholderName(contact.display_name, contact.user_id))) {
        const sr = await fetch(`${API}/api/zalo/contacts/${contactId}/sync-profile`, { method: 'POST', headers: hdr() });
        if (sr.ok) {
          const sd = await sr.json();
          if (sd.contact) contact = sd.contact;
        }
      }
      setActiveContact(contact);
      setMessages(msgs);
      setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, ...contact, unread_count: 0 } : c)));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch {
      setMessages([]);
      setActiveContact(null);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'inbox') {
      loadStats();
      loadContacts();
    }
  }, [tab, loadStats, loadContacts]);

  useEffect(() => {
    if (tab === 'settings' || tab === 'contacts') loadAccounts();
  }, [tab, loadAccounts]);

  useEffect(() => {
    const next = searchParams.get('tab');
    if (next && next !== tab) setTab(next);
    const contactId = searchParams.get('contact');
    if (contactId && tab === 'inbox') setSelectedId(contactId);
  }, [searchParams, tab]);

  const switchTab = (id) => {
    setTab(id);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', id);
      if (id !== 'inbox') p.delete('contact');
      return p;
    });
  };

  const openInboxContact = (contactId) => {
    setSelectedId(contactId);
    switchTab('inbox');
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', 'inbox');
      p.set('contact', contactId);
      return p;
    });
  };
  useEffect(() => { if (selectedId) loadMessages(selectedId); }, [selectedId, loadMessages]);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (payload) => {
      loadStats();
      loadContacts();
      if (payload?.contact_id && payload.contact_id === selectedId) {
        loadMessages(selectedId);
      }
    };
    const onBatch = (p) => {
      if (!p?.type?.startsWith('zalo_')) return;
      if (p.phase === 'start') {
        setBatchProgress(`Bắt đầu ${p.type} — ${p.total} liên hệ`);
      } else if (p.current != null && p.total) {
        setBatchProgress(`${p.type}: ${p.current}/${p.total}${p.name ? ` · ${p.name}` : ''}${p.phone ? ` · ${p.phone}` : ''}`);
      }
    };
    const onBatchDone = (p) => {
      if (!p?.type?.startsWith('zalo_')) return;
      setBatchProgress(`Xong ${p.type}: ${JSON.stringify(p).slice(0, 120)}…`);
      loadStats();
      loadContacts();
      if (selectedId) loadMessages(selectedId);
    };
    socket.on('zalo_message', onMsg);
    socket.on('batch_progress', onBatch);
    socket.on('batch_done', onBatchDone);
    return () => {
      socket.off('zalo_message', onMsg);
      socket.off('batch_progress', onBatch);
      socket.off('batch_done', onBatchDone);
    };
  }, [socket, selectedId, loadStats, loadContacts, loadMessages]);

  const syncContactProfile = async () => {
    if (!selectedId || syncingProfile) return;
    setSyncingProfile(true);
    try {
      const r = await fetch(`${API}/api/zalo/contacts/${selectedId}/sync-profile`, { method: 'POST', headers: hdr() });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || 'Không lấy được tên từ Zalo');
        return;
      }
      if (d.contact) {
        setActiveContact(d.contact);
        setContacts((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...d.contact } : c)));
      }
    } catch {
      alert('Lỗi mạng');
    } finally {
      setSyncingProfile(false);
    }
  };

  const refreshAllProfiles = async () => {
    if (refreshingNames) return;
    setRefreshingNames(true);
    try {
      const r = await fetch(`${API}/api/zalo/refresh-profiles`, { method: 'POST', headers: hdr() });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || 'Lỗi cập nhật tên');
        return;
      }
      alert(d.message || `Đã cập nhật ${d.updated}/${d.total} liên hệ`);
      loadContacts();
      if (selectedId) loadMessages(selectedId, { syncProfile: false });
    } catch {
      alert('Lỗi mạng');
    } finally {
      setRefreshingNames(false);
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/api/zalo/contacts/${selectedId}/messages`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || 'Gửi tin thất bại');
        return;
      }
      setReply('');
      loadMessages(selectedId);
      loadContacts();
    } catch {
      alert('Lỗi mạng');
    } finally {
      setSending(false);
    }
  };

  const saveAccount = async () => {
    if (!form.oa_id || (!editingId && !form.access_token)) {
      alert('Nhập OA ID và Access Token');
      return;
    }
    if (!String(form.default_module_key || '').trim()) {
      alert('Cần chọn module tạo mới (CRM / Sản xuất / Vận chuyển)');
      return;
    }
    if (!form.default_company_id) {
      alert('Cần chọn công ty mặc định của module');
      return;
    }
    const payload = { ...form };
    if (editingId && !payload.access_token) delete payload.access_token;
    if (editingId && !payload.refresh_token) delete payload.refresh_token;
    if (editingId && !payload.secret_key) delete payload.secret_key;
    const url = editingId ? `${API}/api/zalo/accounts/${editingId}` : `${API}/api/zalo/accounts`;
    const method = editingId ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: hdr(), body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || 'Lưu thất bại');
      return;
    }
    setForm({ ...EMPTY_ACCOUNT });
    setEditingId(null);
    loadAccounts();
  };

  const refreshAccountToken = async (accountId) => {
    setRefreshingTokenId(accountId);
    try {
      const r = await fetch(`${API}/api/zalo/accounts/${accountId}/refresh-token`, {
        method: 'POST',
        headers: hdr(),
      });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || d.message || 'Refresh token thất bại');
        return;
      }
      alert(`Đã làm mới token. Access hết hạn: ${formatTokenExpiry(d.access_token_expires_at)}`);
      loadAccounts();
    } catch {
      alert('Lỗi mạng');
    } finally {
      setRefreshingTokenId(null);
    }
  };

  const deleteAccount = async (id) => {
    if (!window.confirm('Xóa cấu hình OA này?')) return;
    await fetch(`${API}/api/zalo/accounts/${id}`, { method: 'DELETE', headers: hdr() });
    loadAccounts();
  };

  const copyWebhook = () => {
    const url = webhookInfo?.webhook_url || '';
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span className="text-2xl">💬</span> Zalo OA
        </h1>
        {stats && (
          <div className="flex gap-3 text-sm text-slate-600 ml-auto">
            <span className="flex items-center gap-1"><Users size={14} /> {stats.contacts} liên hệ</span>
            <span className="flex items-center gap-1"><Bell size={14} /> {stats.unread} chưa đọc</span>
            <span>{stats.messages_today} tin hôm nay</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4 border-b border-slate-200">
        {[
          { id: 'inbox', label: 'Hộp thư', icon: MessageCircle },
          { id: 'contacts', label: 'Danh bạ', icon: Users },
          { id: 'tools', label: 'Công cụ Lead', icon: Zap },
          { id: 'settings', label: 'Cài đặt', icon: Settings },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {(tab === 'inbox' || tab === 'tools') && (
        <div className="mb-4">
          <ZaloAutoToolPanel
            batchProgress={batchProgress}
            onComplete={() => { loadStats(); loadContacts(); }}
          />
        </div>
      )}

      {tab === 'tools' && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 space-y-2 mb-4">
          <p className="font-medium">Luồng giống Facebook (rút gọn)</p>
          <ol className="list-decimal list-inside text-xs space-y-1 text-blue-800">
            <li><strong>Lấy tên KH</strong> — gọi Zalo OA API lấy display_name / avatar (webhook hoặc nút Tên KH)</li>
            <li><strong>Quét SĐT</strong> — đọc tin inbound đã lưu, trích SĐT/địa chỉ → cập nhật KH & lead</li>
            <li><strong>Tạo Lead</strong> — contact chưa có lead (ưu tiên có SĐT)</li>
            <li><strong>Auto</strong> — lặp quét + tạo lead theo batch (bật công tắc Auto)</li>
          </ol>
          <button
            type="button"
            onClick={refreshAllProfiles}
            disabled={refreshingNames}
            className="mt-2 px-3 py-1.5 text-xs font-medium bg-white border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1"
          >
            <UserCircle size={14} /> {refreshingNames ? 'Đang lấy tên...' : 'Cập nhật tên tất cả liên hệ'}
          </button>
        </div>
      )}

      {tab === 'inbox' && (
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 min-h-[520px] border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="border-r border-slate-200 flex flex-col">
            <div className="p-3 border-b flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadContacts()}
                  placeholder="Tìm tên, SĐT..."
                  className="w-full pl-8 pr-2 py-1.5 text-sm border rounded-lg"
                />
              </div>
              <button type="button" onClick={loadContacts} className="p-2 border rounded-lg hover:bg-slate-50" title="Làm mới">
                <RefreshCw size={16} className={loadingContacts ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingContacts && !contacts.length ? (
                <p className="p-4 text-sm text-slate-500">Đang tải...</p>
              ) : !contacts.length ? (
                <p className="p-4 text-sm text-slate-500">Chưa có tin nhắn. Cấu hình webhook trong tab Cài đặt.</p>
              ) : (
                contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left p-3 flex gap-3 border-b border-slate-100 hover:bg-slate-50 ${
                      selectedId === c.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <Avatar name={c.display_name} url={c.avatar_url} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-sm truncate">{c.display_name || c.user_id}</span>
                        <span className="text-xs text-slate-400 shrink-0">{formatTime(c.last_message_at)}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{c.last_message_preview || '—'}</p>
                      {c.lead?.code && (
                        <Link to={`/crm/leads/${c.lead.id}`} className="text-xs text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.lead.code}
                        </Link>
                      )}
                    </div>
                    {(c.unread_count || 0) > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {c.unread_count}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col min-h-[480px]">
            {!selectedId ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Chọn cuộc hội thoại</div>
            ) : (
              <>
                <div className="p-3 border-b flex items-center gap-3">
                  <Avatar name={activeContact?.display_name} url={activeContact?.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{activeContact?.display_name || activeContact?.user_id || 'Khách Zalo'}</div>
                    {activeContact?.phone && (
                      <div className="text-xs text-green-600">📞 {activeContact.phone}</div>
                    )}
                    {activeContact?.lead_id && (
                      <Link to={`/crm/leads/${activeContact.lead_id}`} className="text-xs text-blue-600 hover:underline">
                        Xem lead CRM →
                      </Link>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={syncContactProfile}
                    disabled={syncingProfile}
                    className="text-xs border rounded-lg px-2 py-1.5 hover:bg-slate-50 flex items-center gap-1 shrink-0 disabled:opacity-50"
                    title="Lấy tên & avatar từ Zalo OA API"
                  >
                    <UserCircle size={14} className={syncingProfile ? 'animate-pulse' : ''} /> Tên KH
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                  {loadingMessages ? (
                    <p className="text-sm text-slate-500">Đang tải tin nhắn...</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                            m.direction === 'outbound'
                              ? 'bg-blue-600 text-white rounded-br-md'
                              : 'bg-white border border-slate-200 rounded-bl-md'
                          }`}
                        >
                          {m.attachment_url && m.message_type === 'image' ? (
                            <img src={m.attachment_url} alt="" className="max-w-full rounded-lg mb-1" />
                          ) : null}
                          <div>{m.content}</div>
                          <div className={`text-[10px] mt-1 ${m.direction === 'outbound' ? 'text-blue-100' : 'text-slate-400'}`}>
                            {formatTime(m.created_at)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-3 border-t flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                    placeholder="Nhập tin trả lời (tin tư vấn — trong 7 ngày)..."
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <Send size={16} /> Gửi
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <ZaloContactsTab accounts={accounts} onOpenInbox={openInboxContact} />
      )}

      {tab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <ExternalLink size={18} /> Webhook URL
            </h2>
            <p className="text-sm text-slate-600 mb-3">
              Dán URL này vào Zalo OA → Quản lý ứng dụng → Cấu hình Webhook. Chọn sự kiện{' '}
              <code className="bg-slate-100 px-1 rounded">user_send_text</code>,{' '}
              <code className="bg-slate-100 px-1 rounded">user_send_image</code>, ...
            </p>
            <div className="flex gap-2 mb-3">
              <code className="flex-1 text-xs bg-slate-100 p-2 rounded break-all">{webhookInfo?.webhook_url || '...'}</code>
              <button type="button" onClick={copyWebhook} className="p-2 border rounded-lg hover:bg-slate-50 shrink-0">
                {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
              </button>
            </div>
            <a
              href="https://developers.zalo.me/docs/official-account/webhook/tong-quan"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Tài liệu webhook Zalo OA →
            </a>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              {editingId ? <Save size={18} /> : <Plus size={18} />}
              {editingId ? 'Sửa OA' : 'Thêm Official Account'}
            </h2>
            <div className="space-y-3 text-sm">
              {[
                ['oa_id', 'OA ID (recipient id)', true],
                ['oa_name', 'Tên OA', false],
                ['app_id', 'App ID (bắt buộc để refresh token)', false],
                ['access_token', 'Access Token (~25h)', true],
                ['refresh_token', 'Refresh Token (~3 tháng, rotate mỗi lần refresh)', false],
                ['secret_key', 'Secret Key (webhook + refresh token)', false],
              ].map(([key, label, required]) => (
                <div key={key}>
                  <label className="block text-slate-600 mb-1">{label}{required ? ' *' : ''}</label>
                  <input
                    type={key.includes('token') || key.includes('secret') ? 'password' : 'text'}
                    value={form[key] || ''}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              ))}
              <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Access token hết hạn sau <strong>~25 giờ</strong>. Refresh token dùng <strong>1 lần</strong> để lấy cặp token mới (refresh cũ vô hiệu).
                Hệ thống tự refresh lúc <strong>6:00 sáng</strong> (VN) mỗi ngày khi đủ App ID + Secret + Refresh Token.
              </p>
              <div>
                <label className="block text-slate-600 mb-1">Tin tự động trả lời</label>
                <textarea
                  value={form.auto_reply_message || ''}
                  onChange={(e) => setForm((f) => ({ ...f, auto_reply_message: e.target.value }))}
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!form.auto_create_lead}
                  onChange={(e) => setForm((f) => ({ ...f, auto_create_lead: e.target.checked }))}
                />
                Tự tạo Lead CRM khi có tin mới
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.webhook_verify_enabled !== false}
                  onChange={(e) => setForm((f) => ({ ...f, webhook_verify_enabled: e.target.checked }))}
                />
                Xác thực chữ ký webhook (khuyến nghị)
              </label>
              <IntegrationLeadRoutingFields
                form={form}
                setForm={setForm}
                channelName="Zalo OA"
                ownerFallbackLabel="Người tạo OA (mặc định)"
              />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={saveAccount} className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-1">
                  <Save size={16} /> Lưu
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setForm({ ...EMPTY_ACCOUNT }); }}
                    className="px-4 py-2 border rounded-lg"
                  >
                    Hủy
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold mb-3">OA đã cấu hình</h2>
            {!accounts.length ? (
              <p className="text-sm text-slate-500">Chưa có OA nào.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 pr-4">OA</th>
                      <th className="py-2 pr-4">Module / Công ty</th>
                      <th className="py-2 pr-4">App ID</th>
                      <th className="py-2 pr-4">Token</th>
                      <th className="py-2 pr-4">Trạng thái</th>
                      <th className="py-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id} className="border-b border-slate-100">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{a.oa_name || a.oa_id}</div>
                          <div className="text-xs text-slate-400">{a.oa_id}</div>
                        </td>
                        <td className="py-2 pr-4 text-xs">
                          <div>{a.default_module_key === 'production' ? 'Sản xuất' : a.default_module_key === 'logistics' ? 'Vận chuyển' : a.default_module_key === 'crm' ? 'CRM' : '—'}</div>
                          <div className="text-slate-400">{a.default_company_id ? `Công ty #${String(a.default_company_id).slice(0, 8)}…` : 'Chưa cấu hình'}</div>
                        </td>
                        <td className="py-2 pr-4">{a.app_id || '—'}</td>
                        <td className="py-2 pr-4 text-xs">
                          {(() => {
                            const st = tokenStatusLabel(a);
                            return (
                              <>
                                <div className={st.cls}>{st.text}</div>
                                <div className="text-slate-400">Access → {formatTokenExpiry(a.access_token_expires_at)}</div>
                                {a.refresh_token_set && (
                                  <div className="text-slate-400">Refresh → {formatTokenExpiry(a.refresh_token_expires_at)}</div>
                                )}
                                {a.last_token_error && (
                                  <div className="text-red-500 truncate max-w-[180px]" title={a.last_token_error}>{a.last_token_error}</div>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="py-2 pr-4">{a.is_active ? '✅ Bật' : '⏸ Tắt'}</td>
                        <td className="py-2 flex flex-wrap gap-2">
                          {a.refresh_token_set && a.app_id && (
                            <button
                              type="button"
                              className="text-emerald-700 hover:underline flex items-center gap-1"
                              disabled={refreshingTokenId === a.id}
                              onClick={() => refreshAccountToken(a.id)}
                            >
                              <RefreshCw size={14} className={refreshingTokenId === a.id ? 'animate-spin' : ''} />
                              Refresh token
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={() => {
                              setEditingId(a.id);
                              setForm({
                                ...EMPTY_ACCOUNT,
                                oa_id: a.oa_id,
                                oa_name: a.oa_name || '',
                                app_id: a.app_id || '',
                                access_token: '',
                                secret_key: '',
                                is_active: a.is_active,
                                auto_create_lead: a.auto_create_lead,
                                auto_reply_message: a.auto_reply_message,
                                webhook_verify_enabled: a.webhook_verify_enabled,
                                default_module_key: a.default_module_key || (String(a.default_target_type || '').toLowerCase() === 'deal' ? 'production' : 'crm'),
                                default_target_type: a.default_target_type || '',
                                default_company_id: a.default_company_id || '',
                                default_region_id: a.default_region_id || '',
                                default_lead_type_id: a.default_lead_type_id || '',
                                default_stage_id: a.default_stage_id || '',
                                default_lead_owner_id: a.default_lead_owner_id || '',
                              });
                            }}
                          >
                            Sửa
                          </button>
                          <button type="button" className="text-red-600 hover:underline flex items-center gap-1" onClick={() => deleteAccount(a.id)}>
                            <Trash2 size={14} /> Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-4">
              Nhập <strong>Refresh Token</strong> lần đầu từ Zalo Developer (OAuth). Sau đó hệ thống tự rotate hàng ngày — không cần dán lại access token thủ công.
              Migration:{' '}
              <code className="bg-slate-100 px-1 rounded">database/319_zalo_oa_refresh_token.sql</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
