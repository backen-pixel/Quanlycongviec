import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, RefreshCw, Trash2, Edit3, Check, X, UserPlus, MessageCircle, ExternalLink, Phone,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import ZaloAutoToolPanel from './ZaloAutoToolPanel';

const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

function zaloActivityTs(c) {
  const msg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  const cre = c.created_at ? new Date(c.created_at).getTime() : 0;
  return Math.max(msg, cre);
}

function formatActivity(c) {
  const ts = zaloActivityTs(c);
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

function displayPhone(c) {
  return c.display_phone || c.phone || c.customer?.phone || '';
}

function Avatar({ name, url }) {
  if (url) {
    return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover bg-slate-200" />;
  }
  const letter = (name || 'Z')[0].toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {letter}
    </div>
  );
}

const FILTER_CHIPS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'has_phone', label: '📞 Có SĐT' },
  { key: 'no_phone', label: '❌ Chưa SĐT' },
  { key: 'has_lead', label: '🏷 Có Lead' },
  { key: 'no_lead', label: '🔔 Chưa Lead' },
];

export default function ZaloContactsTab({ onOpenInbox, accounts = [] }) {
  const navigate = useNavigate();
  const { socket } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState('all');
  const [oaFilter, setOaFilter] = useState('');
  const [meta, setMeta] = useState({ total: 0, hasMore: false, nextOffset: 0 });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [actionLoading, setActionLoading] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);

  const sortContacts = useCallback((list) => {
    return [...(list || [])].sort((a, b) => {
      const ua = (a.unread_count || 0) > 0 ? 1 : 0;
      const ub = (b.unread_count || 0) > 0 ? 1 : 0;
      if (ub !== ua) return ub - ua;
      const act = zaloActivityTs(b) - zaloActivityTs(a);
      if (act !== 0) return act;
      const bp = displayPhone(b) ? 1 : 0;
      const ap = displayPhone(a) ? 1 : 0;
      return bp - ap;
    });
  }, []);

  const load = useCallback((append = false) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (oaFilter) p.set('oa_id', oaFilter);
    if (filter === 'has_lead') p.set('has_lead', 'true');
    if (filter === 'no_lead') p.set('has_lead', 'false');
    p.set('limit', '200');
    p.set('offset', append ? String(meta.nextOffset || 0) : '0');

    fetch(`${API}/api/zalo/contacts?${p}`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, hasMore: false, nextOffset: 0 }))
      .then((payload) => {
        const rows = payload?.data || [];
        setContacts((prev) => {
          const merged = append ? [...prev, ...rows] : rows;
          const deduped = merged.filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx);
          return sortContacts(deduped);
        });
        setMeta({
          total: payload?.total ?? rows.length,
          hasMore: !!payload?.hasMore,
          nextOffset: payload?.nextOffset ?? (append ? (meta.nextOffset || 0) + rows.length : rows.length),
        });
      })
      .catch(() => {
        if (!append) setContacts([]);
      })
      .finally(() => setLoading(false));
  }, [search, filter, oaFilter, meta.nextOffset, sortContacts]);

  useEffect(() => { load(false); }, [search, filter, oaFilter]);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (data) => {
      const contactId = data?.contact_id;
      if (!contactId) return;
      const now = data?.message?.created_at || new Date().toISOString();
      setContacts((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const ex = list.find((c) => String(c.id) === String(contactId));
        if (ex) {
          const up = {
            ...ex,
            ...data.contact,
            last_message_at: now,
            last_message_preview: data.message?.content?.slice(0, 100) || ex.last_message_preview,
            unread_count: (ex.unread_count || 0) + 1,
          };
          return sortContacts([up, ...list.filter((c) => String(c.id) !== String(contactId))]);
        }
        return list;
      });
      fetch(`${API}/api/zalo/contacts/${contactId}`, { headers: hdr() })
        .then((r) => (r.ok ? r.json() : null))
        .then((fresh) => {
          if (!fresh) return;
          setContacts((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const exists = list.some((c) => String(c.id) === String(fresh.id));
            if (exists) {
              return sortContacts(list.map((c) => (String(c.id) === String(fresh.id) ? { ...c, ...fresh } : c)));
            }
            return sortContacts([fresh, ...list]).slice(0, 200);
          });
        })
        .catch(() => {});
    };
    const onBatch = (p) => {
      if (!p?.type?.startsWith('zalo_')) return;
      if (p.phase === 'start') setBatchProgress(`${p.type}: 0/${p.total}`);
      else if (p.current != null) setBatchProgress(`${p.type}: ${p.current}/${p.total}${p.name ? ` · ${p.name}` : ''}`);
    };
    const onBatchDone = (p) => {
      if (!p?.type?.startsWith('zalo_')) return;
      setBatchProgress(null);
      load(false);
    };
    socket.on('zalo_message', onMsg);
    socket.on('batch_progress', onBatch);
    socket.on('batch_done', onBatchDone);
    return () => {
      socket.off('zalo_message', onMsg);
      socket.off('batch_progress', onBatch);
      socket.off('batch_done', onBatchDone);
    };
  }, [socket, sortContacts, load]);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const ph = displayPhone(c);
      if (filter === 'has_phone') return !!ph;
      if (filter === 'no_phone') return !ph;
      if (filter === 'has_lead') return !!c.lead_id || !!c.lead;
      if (filter === 'no_lead') return !c.lead_id && !c.lead;
      return true;
    });
  }, [contacts, filter]);

  const filterCounts = useMemo(() => ({
    all: contacts.length,
    has_phone: contacts.filter((c) => displayPhone(c)).length,
    no_phone: contacts.filter((c) => !displayPhone(c)).length,
    has_lead: contacts.filter((c) => c.lead_id || c.lead).length,
    no_lead: contacts.filter((c) => !c.lead_id && !c.lead).length,
  }), [contacts]);

  const startEdit = (c) => {
    setEditing(c.id);
    setForm({
      display_name: c.display_name || '',
      phone: c.phone || displayPhone(c) || '',
      email: c.email || c.customer?.email || '',
    });
  };

  const saveEdit = async (id) => {
    try {
      const res = await fetch(`${API}/api/zalo/contacts/${id}`, {
        method: 'PUT',
        headers: hdr(),
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const d = await res.json();
        setContacts((prev) => prev.map((c) => (c.id === id ? d : c)));
        setEditing(null);
      }
    } catch {
      alert('Lỗi lưu');
    }
  };

  const deleteContact = async (id, name) => {
    if (!window.confirm(`Xóa liên hệ "${name}" và toàn bộ tin nhắn?`)) return;
    try {
      await fetch(`${API}/api/zalo/contacts/${id}`, { method: 'DELETE', headers: hdr() });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('Lỗi xóa');
    }
  };

  const createLead = async (c) => {
    setActionLoading(c.id);
    try {
      const res = await fetch(`${API}/api/zalo/contacts/${c.id}/create-lead`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Không tạo được lead');
        return;
      }
      setContacts((prev) => prev.map((x) => (x.id === c.id ? data.contact : x)));
    } catch {
      alert('Lỗi mạng');
    } finally {
      setActionLoading(null);
    }
  };

  const batchCreateLeads = async () => {
    const noLead = contacts.filter((c) => !c.lead_id);
    if (!noLead.length) return alert('Tất cả liên hệ đã có Lead!');
    if (!window.confirm(`Tạo Lead cho tối đa ${noLead.length} liên hệ chưa có Lead?`)) return;
    try {
      await fetch(`${API}/api/zalo/batch-create-leads`, { method: 'POST', headers: hdr() });
      load(false);
    } catch {
      alert('Lỗi');
    }
  };

  const batchExtractPhones = async () => {
    if (!window.confirm('Quét SĐT từ tin nhắn Zalo đã lưu?')) return;
    try {
      await fetch(`${API}/api/zalo/batch-extract-phones`, { method: 'POST', headers: hdr() });
      load(false);
    } catch {
      alert('Lỗi');
    }
  };

  return (
    <div className="space-y-4">
      <ZaloAutoToolPanel batchProgress={batchProgress} onComplete={() => load(false)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Danh bạ Zalo OA</h2>
          <p className="text-xs text-slate-500">
            {filtered.length}/{meta.total || contacts.length} liên hệ
            {loading ? ' · đang tải...' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={batchExtractPhones}
            className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1"
          >
            <Phone size={14} /> Quét SĐT
          </button>
          <button
            type="button"
            onClick={batchCreateLeads}
            className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 flex items-center gap-1"
          >
            <UserPlus size={14} /> Tạo Lead hàng loạt
          </button>
          <button
            type="button"
            onClick={() => load(false)}
            className="px-3 py-1.5 text-xs text-slate-600 border rounded-lg hover:bg-slate-50 flex items-center gap-1"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Làm mới
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput.trim())}
            placeholder="Tìm tên, SĐT, user ID..."
            className="w-full pl-8 pr-2 py-2 text-sm border rounded-lg"
          />
        </div>
        <button
          type="button"
          onClick={() => setSearch(searchInput.trim())}
          className="px-3 py-2 text-sm border rounded-lg hover:bg-slate-50"
        >
          Tìm
        </button>
        {accounts.length > 1 && (
          <select
            value={oaFilter}
            onChange={(e) => setOaFilter(e.target.value)}
            className="text-sm border rounded-lg px-2 py-2 bg-white"
          >
            <option value="">Tất cả OA</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.oa_id}>{a.oa_name || a.oa_id}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_CHIPS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              filter === key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
            }`}
          >
            {label} ({filterCounts[key] ?? 0})
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-left p-3 font-medium">Khách hàng</th>
                <th className="text-left p-3 font-medium">SĐT</th>
                <th className="text-left p-3 font-medium">Lead CRM</th>
                <th className="text-left p-3 font-medium">Hoạt động</th>
                <th className="text-right p-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {!filtered.length ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                    {loading ? 'Đang tải...' : 'Chưa có liên hệ — cần webhook nhận tin từ Zalo OA'}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="p-3">
                      {editing === c.id ? (
                        <input
                          value={form.display_name}
                          onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm"
                        />
                      ) : (
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <Avatar name={c.display_name} url={c.avatar_url} />
                          <div>
                            <div className="font-medium text-slate-800">{c.display_name || 'Khách Zalo'}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={c.user_id}>
                              ID: {c.user_id}
                            </div>
                            {(c.unread_count || 0) > 0 && (
                              <span className="text-[10px] bg-red-500 text-white px-1.5 rounded-full">{c.unread_count} mới</span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {editing === c.id ? (
                        <input
                          value={form.phone}
                          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm"
                          placeholder="0xxxxxxxxx"
                        />
                      ) : (
                        <span className={displayPhone(c) ? 'text-slate-800' : 'text-slate-400'}>
                          {displayPhone(c) || '—'}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {c.lead?.id ? (
                        <Link to={`/crm/leads/${c.lead.id}`} className="text-blue-600 hover:underline text-xs font-medium">
                          {c.lead.code || c.lead.title}
                        </Link>
                      ) : c.lead_id ? (
                        <span className="text-xs text-amber-600">Lead đã xóa</span>
                      ) : (
                        <span className="text-xs text-slate-400">Chưa có</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      <div>{formatActivity(c)}</div>
                      {c.last_message_preview && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[180px]" title={c.last_message_preview}>
                          {c.last_message_preview}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {editing === c.id ? (
                          <>
                            <button type="button" onClick={() => saveEdit(c.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Lưu">
                              <Check size={16} />
                            </button>
                            <button type="button" onClick={() => setEditing(null)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Hủy">
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => (onOpenInbox ? onOpenInbox(c.id) : navigate(`/crm/zalo?tab=inbox&contact=${c.id}`))}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                              title="Nhắn tin"
                            >
                              <MessageCircle size={16} />
                            </button>
                            {!c.lead_id && (
                              <button
                                type="button"
                                disabled={actionLoading === c.id}
                                onClick={() => createLead(c)}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                                title="Tạo Lead"
                              >
                                <UserPlus size={16} />
                              </button>
                            )}
                            {c.lead?.id && (
                              <Link to={`/crm/leads/${c.lead.id}`} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded inline-flex" title="Mở Lead">
                                <ExternalLink size={16} />
                              </Link>
                            )}
                            <button type="button" onClick={() => startEdit(c)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded" title="Sửa">
                              <Edit3 size={16} />
                            </button>
                            <button type="button" onClick={() => deleteContact(c.id, c.display_name)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Xóa">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {meta.hasMore && (
          <div className="p-3 border-t text-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => load(true)}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              Tải thêm ({contacts.length}/{meta.total})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
