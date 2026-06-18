import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  MessageCircle, Settings, Send, Search, RefreshCw, Plus, Save, Trash2,
  ExternalLink, Copy, Check, Users, Bell, Zap, UserCircle, BadgeCheck,
  CheckCheck, ChevronRight,
} from 'lucide-react';
import ZaloAutoToolPanel from '../components/ZaloAutoToolPanel';
import ZaloContactsTab from '../components/ZaloContactsTab';
import IntegrationLeadRoutingFields from '../components/IntegrationLeadRoutingFields';

const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

function Avatar({ name, url, size = 'md' }) {
  const sz = size === 'lg' ? 'w-11 h-11 text-[15px]' : 'w-10 h-10 text-sm';
  const ring = 'ring-2 ring-white shadow-md';
  if (url) {
    return <img src={url} alt="" className={`${sz} rounded-full object-cover bg-slate-200 ${ring}`} />;
  }
  const letter = (name || 'Z')[0].toUpperCase();
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br from-[#0068FF] to-[#0047b3] flex items-center justify-center text-white font-bold ${ring}`}>
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

function formatListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
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

function resolveN8nTriggerLinks(trigger) {
  if (!trigger?.token) return null;
  return {
    inbound: trigger.n8n_auto?.inbound || trigger.n8n_paths?.inbound || null,
    syncProfile: trigger.n8n_auto?.sync_profile || trigger.n8n_paths?.sync_profile || null,
    crmCallback: trigger.crm?.sync_profile || null,
    token: trigger.token,
    hasN8nBase: !!trigger.n8n_webhook_base_set,
  };
}

function CopyBtn({ label, value, title, variant = 'outline' }) {
  const [ok, setOk] = useState(false);
  if (!value) return null;
  const copy = () => {
    navigator.clipboard.writeText(String(value)).then(() => {
      setOk(true);
      setTimeout(() => setOk(false), 1500);
    }).catch(() => {});
  };
  const base = variant === 'solid'
    ? 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700'
    : 'bg-white text-violet-800 border-violet-200 hover:bg-violet-50';
  return (
    <button
      type="button"
      onClick={copy}
      title={title || value}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium transition-colors ${base}`}
    >
      {ok ? <Check size={12} className={variant === 'solid' ? 'text-white' : 'text-green-600 shrink-0'} /> : <Copy size={12} className="shrink-0" />}
      {label}
    </button>
  );
}

function TriggerLinkCard({ step, title, desc, value }) {
  if (!value) return null;
  return (
    <div className="rounded-lg border border-violet-100 bg-white p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-violet-900">
          {step}. {title}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
        <code className="block mt-1.5 text-[11px] text-slate-700 bg-slate-50 rounded px-2 py-1 break-all line-clamp-2">
          {value}
        </code>
      </div>
      <CopyBtn label="Copy" value={value} variant="solid" />
    </div>
  );
}

function OaN8nTriggerLinksCompact({ trigger }) {
  const links = resolveN8nTriggerLinks(trigger);
  if (!links) {
    return <span className="text-slate-400 text-xs">Lưu OA để có link</span>;
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        <CopyBtn label="Tin mới" value={links.inbound} title="Webhook n8n khi có tin Zalo" />
        <CopyBtn label="Lấy tên" value={links.syncProfile} title="Webhook n8n lấy tên khách" />
        <CopyBtn label="→ CRM" value={links.crmCallback} title="n8n POST về CRM lấy tên" />
      </div>
      <div className="text-[10px] text-slate-400 font-mono truncate max-w-[220px]" title={links.token}>
        token …{links.token.slice(-8)}
      </div>
    </div>
  );
}

function OaN8nTriggerPanel({ trigger }) {
  const links = resolveN8nTriggerLinks(trigger);
  if (!links) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Sau khi <strong>Lưu</strong>, link trigger n8n hiện ở đây và cột <strong>Trigger n8n</strong> trong bảng OA.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
        <Zap size={16} className="text-violet-600" />
        Link trigger n8n — OA này
      </div>
      <TriggerLinkCard
        step="1"
        title="Tin Zalo mới → n8n"
        desc="Path/URL dán vào node Webhook workflow n8n"
        value={links.inbound}
      />
      <TriggerLinkCard
        step="2"
        title="Lấy tên khách → n8n"
        desc="Webhook khi CRM cần n8n gọi Zalo lấy tên"
        value={links.syncProfile}
      />
      <TriggerLinkCard
        step="3"
        title="n8n → CRM (POST)"
        desc="HTTP Request từ n8n gửi contact_id về CRM"
        value={links.crmCallback}
      />
      {!links.hasN8nBase && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Server chưa có <code className="bg-white px-1 rounded">N8N_WEBHOOK_BASE_URL</code> — copy <strong>path</strong> (bắt đầu <code>/webhook/…</code>) và ghép với domain n8n.
        </p>
      )}
    </div>
  );
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
  n8n_webhook_url: '',
  n8n_sync_profile_webhook_url: '',
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
  const [applyingRouting, setApplyingRouting] = useState(false);
  const [n8nTriggerDisplay, setN8nTriggerDisplay] = useState(null);
  const [showN8nOverride, setShowN8nOverride] = useState(false);
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
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (tab === 'inbox') loadContacts();
  }, [tab, loadContacts]);

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
    setN8nTriggerDisplay(d.n8n_trigger || null);
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

  const applyOaRoutingBatch = async () => {
    if (!window.confirm('Cập nhật công ty / khu vực / cột pipeline / NV cho mọi lead đã gắn contact Zalo theo cấu hình OA hiện tại?')) return;
    setApplyingRouting(true);
    try {
      const r = await fetch(`${API}/api/zalo/batch-apply-oa-routing`, { method: 'POST', headers: hdr(), body: JSON.stringify({ limit: 500 }) });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || 'Thất bại');
        return;
      }
      alert(`Đã cập nhật ${d.updated}/${d.total} lead${d.tasks_created ? `, tạo ${d.tasks_created} nhiệm vụ` : ''}. Mở Kanban tab Lead, công ty Phúc Đạt để kiểm tra.`);
    } catch {
      alert('Lỗi mạng');
    } finally {
      setApplyingRouting(false);
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
    <div className="flex flex-col h-[calc(100vh-3rem)] min-h-0 max-h-[calc(100vh-3rem)] overflow-hidden bg-white -m-6">
      {/* Header */}
      <div className="shrink-0 border-b border-sky-100 bg-gradient-to-r from-sky-50/90 via-white to-white px-4 sm:px-6 py-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0068FF] to-[#0047b3] flex items-center justify-center shrink-0 shadow-lg shadow-sky-200/60 text-lg">
              💬
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-bold text-gray-900 tracking-tight">Zalo OA</h1>
                <BadgeCheck className="h-4 w-4 text-[#0068FF] shrink-0" aria-label="Official Account" />
              </div>
              <p className="text-[10px] text-gray-500 font-medium">Hộp thư & quản lý khách hàng</p>
            </div>
          </div>
          {stats && (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-[11px] font-bold text-gray-800 tabular-nums shadow-sm">
                <Users className="h-3.5 w-3.5 text-gray-500" />
                {stats.contacts}
                <span className="font-normal text-gray-500">liên hệ</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0068FF] text-white text-[11px] font-bold tabular-nums shadow-md shadow-sky-300/40">
                <Bell className="h-3.5 w-3.5" />
                {stats.unread}
                <span className="font-semibold opacity-90">chưa đọc</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[11px] font-bold tabular-nums shadow-md shadow-emerald-300/40">
                {stats.messages_today}
                <span className="font-semibold opacity-90">tin hôm nay</span>
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3.5 -mb-px overflow-x-auto">
          {[
            { id: 'inbox', label: 'Hộp thư', icon: MessageCircle, badge: stats?.unread },
            { id: 'contacts', label: 'Danh bạ', icon: Users },
            { id: 'tools', label: 'Công cụ Lead', icon: Zap },
            { id: 'settings', label: 'Cài đặt', icon: Settings },
          ].map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => switchTab(id)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-[13px] font-bold border-b-2 transition-all ${
                tab === id
                  ? 'border-[#0068FF] text-[#0068FF] bg-white shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-white/60'
              }`}
            >
              <Icon size={15} strokeWidth={2.25} />
              {label}
              {badge > 0 ? (
                <span className="bg-red-500 text-white text-[9px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 font-bold animate-pulse">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`flex-1 min-h-0 flex flex-col ${
          tab === 'inbox' ? 'px-3 pt-3 pb-0 sm:px-4 sm:pt-4 bg-gradient-to-b from-sky-50/30 to-gray-50/50' : 'p-4 sm:p-5 bg-gray-50/40'
        } ${tab === 'inbox' || tab === 'contacts' ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >

      {tab === 'tools' && (
        <div className="shrink-0 mb-4">
          <ZaloAutoToolPanel
            batchProgress={batchProgress}
            onComplete={() => { loadStats(); loadContacts(); }}
          />
        </div>
      )}

      {tab === 'tools' && (
        <div className="bg-sky-50/80 border border-sky-100 rounded-xl p-4 text-sm text-sky-950 space-y-2 mb-4">
          <p className="font-bold text-gray-900">Luồng xử lý Lead từ Zalo OA</p>
          <ol className="list-decimal list-inside text-xs space-y-1.5 text-gray-700">
            <li><strong className="text-gray-900">Lấy tên KH</strong> — display_name / avatar từ Zalo OA API</li>
            <li><strong className="text-gray-900">Quét SĐT</strong> — trích SĐT/địa chỉ từ tin inbound</li>
            <li><strong className="text-gray-900">Tạo Lead</strong> — contact chưa có lead (ưu tiên có SĐT)</li>
            <li><strong className="text-gray-900">Kanban</strong> — «Áp dụng routing OA» cho lead cũ</li>
            <li><strong className="text-gray-900">Auto</strong> — lặp quét + tạo lead theo batch</li>
          </ol>
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-sky-100">
          <button
            type="button"
            onClick={refreshAllProfiles}
            disabled={refreshingNames}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5 text-gray-700"
          >
            <UserCircle size={14} /> {refreshingNames ? 'Đang lấy tên…' : 'Cập nhật tên tất cả liên hệ'}
          </button>
          <button
            type="button"
            onClick={applyOaRoutingBatch}
            disabled={applyingRouting}
            className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw size={14} className={applyingRouting ? 'animate-spin' : ''} />
            {applyingRouting ? 'Đang cập nhật…' : 'Áp dụng routing OA → Kanban'}
          </button>
          </div>
        </div>
      )}

      {tab === 'inbox' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden rounded-t-2xl rounded-b-none bg-white shadow-xl shadow-sky-100/50 ring-1 ring-sky-100/80 ring-b-0">
          {/* Sidebar liên hệ */}
          <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-gray-100 bg-gradient-to-b from-white to-sky-50/20 min-h-0 shrink-0 max-h-[36vh] lg:max-h-none lg:w-[min(340px,34%)] lg:max-w-[340px] lg:h-full overflow-hidden">
            <div className="px-3 pt-3 pb-2 border-b border-gray-100 shrink-0 bg-white/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0068FF]">Hội thoại</span>
                <span className="text-[10px] font-semibold text-gray-400 tabular-nums">{contacts.length} cuộc</span>
              </div>
              <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadContacts()}
                  placeholder="Tìm tên, SĐT…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-sky-100 rounded-full bg-sky-50/50 focus:bg-white focus:ring-2 focus:ring-[#0068FF]/20 focus:border-[#0068FF]/40 outline-none transition shadow-inner"
                />
              </div>
              <button
                type="button"
                onClick={loadContacts}
                className="h-9 w-9 shrink-0 border border-sky-100 rounded-full hover:bg-sky-50 flex items-center justify-center text-[#0068FF] bg-white shadow-sm"
                title="Làm mới"
              >
                <RefreshCw size={15} className={loadingContacts ? 'animate-spin' : ''} />
              </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
              {loadingContacts && !contacts.length ? (
                <p className="p-6 text-sm text-gray-500 text-center">Đang tải…</p>
              ) : !contacts.length ? (
                <p className="p-6 text-sm text-gray-500 text-center leading-relaxed">
                  Chưa có tin nhắn.
                  <br />
                  <span className="text-xs text-gray-400">Cấu hình webhook trong tab Cài đặt.</span>
                </p>
              ) : (
                contacts.map((c) => {
                  const isActive = selectedId === c.id;
                  const hasUnread = (c.unread_count || 0) > 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full text-left px-3 py-2.5 flex gap-3 border-b border-gray-100/80 transition-all relative ${
                        isActive
                          ? 'bg-gradient-to-r from-sky-100/90 to-sky-50/40 border-l-[3px] border-l-[#0068FF] pl-[9px] shadow-sm'
                          : 'hover:bg-sky-50/50 border-l-[3px] border-l-transparent'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <Avatar name={c.display_name} url={c.avatar_url} />
                        {hasUnread ? (
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-500 ring-2 ring-white" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2 items-start">
                          <span className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
                            {c.display_name || c.user_id}
                          </span>
                          <span className={`text-[10px] shrink-0 tabular-nums ${hasUnread ? 'text-sky-700 font-semibold' : 'text-gray-400'}`}>
                            {formatListTime(c.last_message_at)}
                          </span>
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                          {c.last_message_preview || '—'}
                        </p>
                        {c.lead?.code ? (
                          <Link
                            to={`/crm/leads/${c.lead.id}`}
                            className="inline-flex mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-r from-sky-100 to-indigo-50 text-[#0047b3] border border-sky-200/80 hover:shadow-sm transition-shadow"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {c.lead.code}
                          </Link>
                        ) : (
                          <span className="inline-flex mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Chưa có Lead
                          </span>
                        )}
                      </div>
                      {hasUnread ? (
                        <span className="self-center shrink-0 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-[#0068FF] text-white text-[10px] font-bold px-1.5 shadow-md shadow-sky-300/50">
                          {c.unread_count > 9 ? '9+' : c.unread_count}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Khung chat — flex-1 để thanh nhập dính đáy panel */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white">
            {!selectedId ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 bg-gradient-to-br from-sky-50/40 via-white to-indigo-50/30">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0068FF] to-[#0047b3] flex items-center justify-center shadow-xl shadow-sky-200/60">
                  <MessageCircle className="h-8 w-8 text-white" strokeWidth={1.75} />
                </div>
                <p className="text-sm font-bold text-gray-800">Chọn cuộc hội thoại</p>
                <p className="text-xs text-gray-500 text-center max-w-[220px]">Tin nhắn Zalo OA hiển thị tại đây — phản hồi khách trong vòng 7 ngày</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-sky-100 flex items-center gap-3 bg-gradient-to-r from-white via-sky-50/30 to-white shrink-0">
                  <Avatar name={activeContact?.display_name} url={activeContact?.avatar_url} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 truncate text-[16px]">
                      {activeContact?.display_name || activeContact?.user_id || 'Khách Zalo'}
                    </div>
                    {activeContact?.phone ? (
                      <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 tabular-nums">
                        📞 {activeContact.phone}
                      </div>
                    ) : (
                      <div className="inline-flex mt-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                        Chưa có SĐT
                      </div>
                    )}
                    {activeContact?.lead_id ? (
                      <Link
                        to={`/crm/leads/${activeContact.lead_id}`}
                        className="inline-flex items-center gap-0.5 mt-1.5 text-xs font-bold text-[#0068FF] hover:underline"
                      >
                        Xem lead CRM
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={syncContactProfile}
                    disabled={syncingProfile}
                    className="text-[11px] font-bold border-2 border-sky-100 rounded-xl px-3 py-2 hover:bg-sky-50 flex items-center gap-1.5 shrink-0 disabled:opacity-50 text-[#0068FF] bg-white shadow-sm"
                    title="Lấy tên & avatar từ Zalo OA API"
                  >
                    <UserCircle size={15} className={syncingProfile ? 'animate-pulse' : ''} />
                    Tên KH
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3 bg-[#eef2f6] [scrollbar-width:thin]">
                  {loadingMessages ? (
                    <p className="text-sm text-gray-500 text-center py-8">Đang tải tin nhắn…</p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Chưa có tin nhắn trong hội thoại này.</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[min(420px,78%)] rounded-2xl px-3.5 py-2.5 text-sm shadow-md ${
                            m.direction === 'outbound'
                              ? 'bg-gradient-to-br from-[#0068FF] to-[#0050d4] text-white rounded-br-sm'
                              : 'bg-white border border-gray-100 text-gray-900 rounded-bl-sm shadow-sm'
                          }`}
                        >
                          {m.attachment_url && m.message_type === 'image' ? (
                            <img src={m.attachment_url} alt="" className="max-w-full rounded-lg mb-1.5" />
                          ) : null}
                          <div className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</div>
                          <div className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                            m.direction === 'outbound' ? 'text-sky-100' : 'text-gray-400'
                          }`}>
                            <span>{formatTime(m.created_at)}</span>
                            {m.direction === 'outbound' ? (
                              <CheckCheck size={12} className="text-sky-200 shrink-0" />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="mt-auto shrink-0 border-t border-sky-100 bg-white shadow-[0_-4px_20px_rgba(0,104,255,0.06)] px-4 pt-2.5 pb-4">
                  <div className="flex gap-2 items-center">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                      placeholder="Nhập tin trả lời…"
                      className="flex-1 border-2 border-sky-100 rounded-full px-4 py-2.5 text-sm bg-sky-50/30 focus:bg-white focus:ring-2 focus:ring-[#0068FF]/25 focus:border-[#0068FF]/30 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={sending || !reply.trim()}
                      className="h-11 w-11 shrink-0 bg-gradient-to-br from-[#0068FF] to-[#0050d4] text-white rounded-full flex items-center justify-center hover:brightness-110 disabled:opacity-40 transition-all shadow-lg shadow-sky-300/40"
                      title="Gửi"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 px-0.5">
                    Tin tư vấn Zalo OA — khách phải nhắn trước trong vòng 7 ngày.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <ZaloContactsTab accounts={accounts} onOpenInbox={openInboxContact} />
        </div>
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
            <h2 className="font-semibold mb-2 flex items-center gap-2 text-violet-900">
              <Zap size={18} /> n8n — trigger theo từng OA
            </h2>
            <p className="text-sm text-slate-600">
              Mỗi OA có link riêng. Copy trực tiếp từ bảng <strong>OA đã cấu hình</strong> bên dưới
              (cột Trigger n8n). Dán path vào Webhook node trên n8n.
            </p>
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
                      <th className="py-2 pr-4 min-w-[200px]">Trigger n8n</th>
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
                        <td className="py-2 pr-4 align-top">
                          <OaN8nTriggerLinksCompact trigger={a.n8n_trigger} />
                        </td>
                        <td className="py-2 align-top">
                          <div className="flex flex-wrap gap-2">
                          {a.refresh_token_set && a.app_id && (
                            <button
                              type="button"
                              className="text-emerald-700 hover:underline flex items-center gap-1"
                              disabled={refreshingTokenId === a.id}
                              onClick={() => refreshAccountToken(a.id)}
                            >
                              <RefreshCw size={14} className={refreshingTokenId === a.id ? 'animate-spin' : ''} />
                              Refresh
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={() => {
                              setEditingId(a.id);
                              setN8nTriggerDisplay(a.n8n_trigger || null);
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
                                n8n_webhook_url: a.n8n_webhook_url || '',
                                n8n_sync_profile_webhook_url: a.n8n_sync_profile_webhook_url || '',
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-4">
              Nhập <strong>Refresh Token</strong> lần đầu từ Zalo Developer (OAuth). Migration:{' '}
              <code className="bg-slate-100 px-1 rounded">328_zalo_oa_n8n_trigger_token.sql</code>
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-2">
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
              <OaN8nTriggerPanel trigger={n8nTriggerDisplay} />
              <button
                type="button"
                className="text-xs text-slate-500 underline"
                onClick={() => setShowN8nOverride((v) => !v)}
              >
                {showN8nOverride ? 'Ẩn ghi đè URL n8n' : 'Ghi đè URL n8n thủ công (tùy chọn)'}
              </button>
              {showN8nOverride && (
                <>
                  <div>
                    <label className="block text-slate-600 mb-1">Ghi đè webhook tin mới</label>
                    <input
                      type="url"
                      value={form.n8n_webhook_url || ''}
                      onChange={(e) => setForm((f) => ({ ...f, n8n_webhook_url: e.target.value }))}
                      placeholder="Để trống = dùng N8N_WEBHOOK_BASE_URL + token OA"
                      className="w-full border rounded-lg px-3 py-2 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Ghi đè webhook lấy tên</label>
                    <input
                      type="url"
                      value={form.n8n_sync_profile_webhook_url || ''}
                      onChange={(e) => setForm((f) => ({ ...f, n8n_sync_profile_webhook_url: e.target.value }))}
                      placeholder="Để trống = dùng N8N_WEBHOOK_BASE_URL + token OA"
                      className="w-full border rounded-lg px-3 py-2 font-mono text-xs"
                    />
                  </div>
                </>
              )}
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
                    onClick={() => { setEditingId(null); setForm({ ...EMPTY_ACCOUNT }); setN8nTriggerDisplay(null); }}
                    className="px-4 py-2 border rounded-lg"
                  >
                    Hủy
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
