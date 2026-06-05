import { useState, useEffect } from 'react';
import api from '../lib/api';
import { BUILTIN_UPDATES } from '../content/builtinUpdates';
import { renderReleaseNoteContent } from '../lib/renderReleaseNoteContent';
import { markAllBuiltinUpdatesRead } from '../lib/releaseNotesRead';
import { useReleaseNotesUnread } from '../hooks/useReleaseNotesUnread';
import {
  Megaphone, Plus, Edit3, Trash2, Eye, EyeOff, Pin, Check, Sparkles, Bug,
  Zap, Bell, ChevronDown, ChevronUp, X, Send, Clock, Users, Loader2,
} from 'lucide-react';

const CATEGORIES = {
  feature: { label: 'Tính năng mới', icon: '✨', color: 'bg-blue-100 text-blue-700', badge: 'bg-blue-500' },
  improvement: { label: 'Cải thiện', icon: '⚡', color: 'bg-amber-100 text-amber-700', badge: 'bg-amber-500' },
  bugfix: { label: 'Sửa lỗi', icon: '🐛', color: 'bg-red-100 text-red-700', badge: 'bg-red-500' },
  announcement: { label: 'Thông báo', icon: '📢', color: 'bg-purple-100 text-purple-700', badge: 'bg-purple-500' },
};

function formatDateVN(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderMarkdownLines(content) {
  return renderReleaseNoteContent(content);
}

function BuiltinUpdateCard({ item, isExpanded, onToggle }) {
  const cat = CATEGORIES[item.category] || CATEGORIES.feature;
  return (
    <article className="bg-white rounded-xl border border-blue-200 shadow-sm ring-1 ring-blue-100">
      <div
        className="flex items-start gap-3 px-5 py-4 cursor-pointer"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${cat.color}`}>
          {cat.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-600 text-white">Mới trong app</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cat.color}`}>{cat.label}</span>
            {item.version && (
              <span className="text-[11px] bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold shadow-sm" style={{ color: '#047857' }}>v{item.version}</span>
            )}
          </div>
          <h3 className="text-base font-bold mt-1" style={{ color: '#000000' }}>{item.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{formatDateVN(item.publishedAt)}</p>
          {!isExpanded && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              {item.content.replace(/[#*`\-_>]/g, '').slice(0, 160)}…
            </p>
          )}
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </div>
      {isExpanded && (
        <div className="px-5 pb-4 border-t">
          <div className="pt-4 prose prose-sm max-w-none text-gray-700">
            {renderMarkdownLines(item.content)}
          </div>
        </div>
      )}
    </article>
  );
}

export default function ReleaseNotesPage() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedBuiltinId, setExpandedBuiltinId] = useState(BUILTIN_UPDATES[0]?.id ?? null);
  const { refresh: refreshUnread } = useReleaseNotesUnread();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = ['admin', 'sales_admin', 'manager'].includes(currentUser.role);

  useEffect(() => {
    markAllBuiltinUpdatesRead();
    refreshUnread();
  }, [refreshUnread]);

  useEffect(() => { load(); }, [showAll]);

  const load = async () => {
    setLoading(true);
    try {
      const params = isAdmin && showAll ? { all: true } : {};
      const { data } = await api.get('/release-notes', { params });
      setNotes(data.notes || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa thông báo này?')) return;
    try { await api.delete(`/release-notes/${id}`); load(); }
    catch (e) { alert('Lỗi xóa'); }
  };

  const handleTogglePublish = async (note) => {
    try {
      await api.put(`/release-notes/${note.id}`, { is_published: !note.is_published, title: note.title });
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const handleTogglePin = async (note) => {
    try {
      await api.put(`/release-notes/${note.id}`, { is_pinned: !note.is_pinned });
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const handleMarkRead = async (id) => {
    try {
      await api.put(`/release-notes/${id}/mark-read`);
      load();
      refreshUnread();
    } catch (e) { /* ignore */ }
  };

  const toggleExpand = (id) => {
    if (expandedId !== id) handleMarkRead(id);
    setExpandedId(expandedId === id ? null : id);
  };

  // Group by month
  const grouped = {};
  notes.forEach(n => {
    const d = new Date(n.published_at || n.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
    if (!grouped[key]) grouped[key] = { label, items: [] };
    grouped[key].items.push(n);
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#000000' }}>
            <Megaphone className="h-6 w-6 text-blue-600" /> Có gì mới?
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin
              ? 'Quản lý thông báo cập nhật — popup khi mở web chỉ hiện đúng bản mới nhất cho đến khi nhân viên đã đọc.'
              : 'Cập nhật và thay đổi mới nhất'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="rounded" />
                Xem bản nháp
              </label>
              <button onClick={() => { setEditNote(null); setShowEditor(true); }}
                className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
                <Plus className="h-4 w-4" /> Tạo thông báo
              </button>
            </>
          )}
        </div>
      </div>

      {BUILTIN_UPDATES.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" /> Cập nhật gần đây
          </h2>
          <div className="space-y-3">
            {BUILTIN_UPDATES.map((item) => (
              <BuiltinUpdateCard
                key={item.id}
                item={item}
                isExpanded={expandedBuiltinId === item.id}
                onToggle={() => setExpandedBuiltinId((cur) => (cur === item.id ? null : item.id))}
              />
            ))}
          </div>
        </section>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : notes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Chưa có thông báo từ quản trị — xem mục &quot;Cập nhật gần đây&quot; phía trên.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([key, group]) => (
          <div key={key}>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> {group.label}
            </h2>
            <div className="space-y-3">
              {group.items.map(note => {
                const cat = CATEGORIES[note.category] || CATEGORIES.feature;
                const isExpanded = expandedId === note.id;
                return (
                  <div key={note.id} className={`bg-white rounded-xl border shadow-sm transition-shadow hover:shadow-md ${!note.is_read ? 'ring-2 ring-blue-200' : ''} ${note.is_pinned ? 'border-amber-300' : ''}`}>
                    {/* Header */}
                    <div className="flex items-start gap-3 px-5 py-4 cursor-pointer" onClick={() => toggleExpand(note.id)}>
                      {/* Category badge */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${cat.color}`}>
                        {cat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {note.is_pinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
                          {!note.is_published && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">Nháp</span>}
                          {!note.is_read && note.is_published && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cat.color}`}>{cat.label}</span>
                          {note.version && <span className="text-[11px] bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold shadow-sm" style={{ color: '#047857' }}>v{note.version}</span>}
                        </div>
                        <h3 className="text-base font-bold mt-1" style={{ color: '#000000' }}>{note.title}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {note.creator?.full_name || 'Admin'} · {formatDateVN(note.published_at || note.created_at)}
                        </p>
                        {!isExpanded && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{note.content.replace(/[#*`\-_>]/g, '').slice(0, 150)}...</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-5 pb-4 border-t">
                        <div className="pt-4 prose prose-sm max-w-none text-gray-700">
                          {renderMarkdownLines(note.content)}
                        </div>

                        {/* Admin actions */}
                        {isAdmin && (
                          <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                            <button onClick={(e) => { e.stopPropagation(); setEditNote(note); setShowEditor(true); }}
                              className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer"><Edit3 className="h-3.5 w-3.5" /> Sửa</button>
                            <button onClick={(e) => { e.stopPropagation(); handleTogglePublish(note); }}
                              className="text-xs text-gray-500 hover:text-green-600 flex items-center gap-1 cursor-pointer">
                              {note.is_published ? <><EyeOff className="h-3.5 w-3.5" /> Ẩn</> : <><Eye className="h-3.5 w-3.5" /> Xuất bản</>}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleTogglePin(note); }}
                              className="text-xs text-gray-500 hover:text-amber-600 flex items-center gap-1 cursor-pointer">
                              <Pin className="h-3.5 w-3.5" /> {note.is_pinned ? 'Bỏ ghim' : 'Ghim'}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                              className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /> Xóa</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Editor Modal */}
      {showEditor && (
        <NoteEditor
          note={editNote}
          onClose={() => { setShowEditor(false); setEditNote(null); }}
          onSaved={() => { setShowEditor(false); setEditNote(null); load(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NOTE EDITOR MODAL
// ═══════════════════════════════════════════════════════════════
function NoteEditor({ note, onClose, onSaved }) {
  const isEdit = !!note;
  const [form, setForm] = useState({
    title: note?.title || '',
    content: note?.content || '',
    version: note?.version || '',
    category: note?.category || 'feature',
    is_published: note?.is_published || false,
    is_pinned: note?.is_pinned || false,
  });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const save = async (publish = false) => {
    if (!form.title.trim()) return alert('Nhập tiêu đề');
    if (!form.content.trim()) return alert('Nhập nội dung');
    setSaving(true);
    try {
      const payload = { ...form };
      if (publish) payload.is_published = true;
      if (isEdit) {
        await api.put(`/release-notes/${note.id}`, payload);
      } else {
        await api.post('/release-notes', payload);
      }
      onSaved();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? '✏️ Sửa thông báo' : '📝 Tạo thông báo cập nhật'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-5 w-5 text-gray-500" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Category */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Loại</label>
            <div className="flex gap-2">
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <button key={key} onClick={() => setForm(f => ({ ...f, category: key }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 cursor-pointer transition ${
                    form.category === key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title + Version */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Tiêu đề *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="VD: Cập nhật tháng 3 — Trang Sự kiện & Cải thiện tìm kiếm"
                className="w-full h-10 px-3 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Phiên bản</label>
              <input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                placeholder="VD: 1.5.0"
                className="w-full h-10 px-3 border rounded-lg text-sm" />
            </div>
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">Nội dung * (hỗ trợ markdown đơn giản)</label>
              <button onClick={() => setPreview(!preview)} className="text-xs text-blue-600 hover:underline cursor-pointer">
                {preview ? 'Soạn thảo' : 'Xem trước'}
              </button>
            </div>
            {preview ? (
              <div className="min-h-[200px] p-4 border rounded-lg bg-gray-50 prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {form.content.split('\n').map((line, i) => {
                  if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-bold mt-3 mb-1">{line.slice(4)}</h4>;
                  if (line.startsWith('## ')) return <h3 key={i} className="text-base font-bold mt-4 mb-1">{line.slice(3)}</h3>;
                  if (line.startsWith('- ')) return <li key={i} className="ml-4 text-sm">{line.slice(2)}</li>;
                  if (line.trim() === '') return <br key={i} />;
                  return <p key={i} className="text-sm">{line}</p>;
                })}
              </div>
            ) : (
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={12} placeholder={`## Tính năng mới\n- Trang Sự kiện: theo dõi hoạt động nhân viên\n- Tìm kiếm sản phẩm thông minh\n\n## Cải thiện\n- Giao diện báo giá mở rộng hơn\n\n## Sửa lỗi\n- Fix lỗi import Excel báo giá`}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono leading-relaxed" />
            )}
          </div>

          {/* Options */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_pinned} onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))} className="rounded" />
              <Pin className="h-3.5 w-3.5 text-amber-500" /> Ghim lên đầu
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex justify-between">
          <button onClick={onClose} className="h-9 px-4 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
          <div className="flex gap-2">
            <button onClick={() => save(false)} disabled={saving}
              className="h-9 px-4 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
              💾 Lưu nháp
            </button>
            <button onClick={() => save(true)} disabled={saving}
              className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50">
              {saving ? 'Đang lưu...' : '🚀 Xuất bản & Thông báo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
