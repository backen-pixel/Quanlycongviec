import { useState, useRef, useEffect, useMemo } from 'react';
import { StickyNote, Send, X, Pencil, Check, Loader2, Minimize2, Maximize2, Search } from 'lucide-react';
import api from '../lib/api';

function sortNotesAsc(notes) {
  return [...(notes || [])].sort((a, b) => {
    const ta = new Date(a.activity_date || a.created_at || 0).getTime();
    const tb = new Date(b.activity_date || b.created_at || 0).getTime();
    return ta - tb;
  });
}

/**
 * Ghi chú CRM dạng bong bóng chat, lưu qua crm_activities (type = note, lead_id = deal/lead).
 * @param {'embedded'|'floating'} variant — embedded = tab nội dung; floating = nút góc màn hình + panel
 * @param {string} [contextLine] — ví dụ «🎯 Deal TB-2026-001 — Tên deal» (hiện trên panel / tab)
 * @param {string} [contextBadge] — mã ngắn trên thanh thu gọn (mặc định: cắt từ contextLine)
 */
export default function CrmChatNotesPanel({
  leadId,
  notes = [],
  onPosted,
  currentUserId,
  /** Admin / manager: sửa được mọi ghi chú (khớp backend) */
  canEditAnyNote = false,
  contextLine = '',
  contextBadge = '',
  variant = 'embedded',
}) {
  const dockStorageKey =
    variant === 'floating' ? (leadId ? `crm_notes_fab_dock_${leadId}` : 'crm_notes_fab_dock_global') : null;
  const [fabDocked, setFabDocked] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [savingEditId, setSavingEditId] = useState(null);
  const listRef = useRef(null);

  /** Chỉ panel nổi: ghi chú cho lead/deal khác (tìm từ API) */
  const [pickOverride, setPickOverride] = useState(null);
  const [pickQuery, setPickQuery] = useState('');
  const [pickResults, setPickResults] = useState([]);
  const [pickLoading, setPickLoading] = useState(false);

  const [remoteActs, setRemoteActs] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(false);

  /** Panel nổi + đang gắn trang (không pick): refetch GET activities để thấy ghi chú mới ngay (props anchor có thể trễ). */
  const [floatingActs, setFloatingActs] = useState(null);

  const targetLeadId = pickOverride?.id || leadId;
  const useRemote = variant === 'floating' && pickOverride != null;

  useEffect(() => {
    if (!useRemote || !targetLeadId) {
      setRemoteActs(null);
      setRemoteLoading(false);
      return;
    }
    let cancelled = false;
    setRemoteActs(null);
    setRemoteLoading(true);
    api
      .get(`/crm/leads/${targetLeadId}/activities`)
      .then((r) => {
        if (cancelled) return;
        const d = r.data;
        setRemoteActs(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setRemoteActs([]);
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useRemote, targetLeadId]);

  useEffect(() => {
    if (variant !== 'floating') {
      setFloatingActs(null);
      return;
    }
    if (pickOverride) {
      setFloatingActs(null);
      return;
    }
    setFloatingActs(null);
  }, [variant, pickOverride, notes]);

  const notesForSort = useMemo(() => {
    if (useRemote) return remoteActs ?? [];
    if (variant === 'floating' && floatingActs != null) return floatingActs;
    return notes ?? [];
  }, [useRemote, remoteActs, notes, variant, floatingActs]);

  const sorted = useMemo(
    () =>
      sortNotesAsc(
        (notesForSort || []).filter((a) => String(a.type || '').toLowerCase() === 'note'),
      ),
    [notesForSort],
  );

  const effectiveContextLine = useMemo(() => {
    if (pickOverride) {
      const typ = pickOverride.type === 'deal' ? '🎯 Deal' : '💼 Lead';
      return `${typ} ${[pickOverride.code, pickOverride.title].filter(Boolean).join(' — ')}`;
    }
    return contextLine;
  }, [pickOverride, contextLine]);

  const stripLabel = useMemo(() => {
    if (pickOverride?.code) return String(pickOverride.code).slice(0, 22);
    const b = (contextBadge || '').trim();
    if (b) return b;
    const line = (contextLine || '').trim();
    if (!line) return 'Ghi chú';
    const dash = line.split(/[—\-]/)[0];
    return (dash || line).trim().slice(0, 22) || 'Ghi chú';
  }, [pickOverride, contextBadge, contextLine]);

  useEffect(() => {
    if (variant !== 'floating') return;
    const q = pickQuery.trim();
    if (q.length < 2) {
      setPickResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setPickLoading(true);
      try {
        const [lr, dr] = await Promise.all([
          api.get('/crm/leads', { params: { type: 'lead', search: q, limit: 10, offset: 0 } }),
          api.get('/crm/leads', { params: { type: 'deal', search: q, limit: 10, offset: 0 } }),
        ]);
        const extract = (res) => {
          const d = res.data;
          if (Array.isArray(d?.data)) return d.data;
          if (Array.isArray(d)) return d;
          return [];
        };
        const m = new Map();
        [...extract(lr), ...extract(dr)].forEach((row) => {
          if (row?.id) m.set(row.id, row);
        });
        setPickResults([...m.values()].slice(0, 14));
      } catch {
        setPickResults([]);
      }
      setPickLoading(false);
    }, 320);
    return () => clearTimeout(t);
  }, [pickQuery, variant]);

  useEffect(() => {
    if (!dockStorageKey || typeof window === 'undefined') {
      setFabDocked(false);
      return;
    }
    try {
      setFabDocked(localStorage.getItem(dockStorageKey) === '1');
    } catch (_) {
      setFabDocked(false);
    }
  }, [dockStorageKey]);

  useEffect(() => {
    setOpen(false);
    setEditingId(null);
    setEditText('');
    setPickOverride(null);
    setPickQuery('');
    setPickResults([]);
  }, [leadId]);

  const setFabDockedPersist = (docked) => {
    setFabDocked(docked);
    if (!dockStorageKey) return;
    try {
      if (docked) localStorage.setItem(dockStorageKey, '1');
      else localStorage.removeItem(dockStorageKey);
    } catch (_) {
      /* ignore */
    }
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [sorted.length, open, variant]);

  const refreshRemoteActivities = async () => {
    const pid = pickOverride?.id;
    if (!pid) return;
    try {
      const { data } = await api.get(`/crm/leads/${pid}/activities`);
      setRemoteActs(Array.isArray(data) ? data : []);
    } catch {
      setRemoteActs([]);
    }
  };

  const refreshFloatingAnchoredActivities = async (lead) => {
    if (!lead || variant !== 'floating' || pickOverride) return;
    try {
      const { data } = await api.get(`/crm/leads/${lead}/activities`);
      setFloatingActs(Array.isArray(data) ? data : []);
    } catch {
      /* giữ cache cũ nếu lỗi */
    }
  };

  const send = async () => {
    const body = text.trim();
    const tid = targetLeadId;
    if (!body || !tid) return;
    setSending(true);
    try {
      const title = body.split('\n')[0].slice(0, 120) || 'Ghi chú';
      await api.post(`/crm/leads/${tid}/activities`, {
        type: 'note',
        title,
        description: body,
      });
      setText('');
      if (pickOverride) {
        await refreshRemoteActivities();
      } else {
        await refreshFloatingAnchoredActivities(tid);
      }
      await Promise.resolve(onPosted?.());
    } catch (e) {
      alert(e.response?.data?.error || 'Không gửi được ghi chú');
    }
    setSending(false);
  };

  const canEditNote = (n) =>
    canEditAnyNote || (currentUserId && String(n.created_by) === String(currentUserId));

  const startEdit = (n) => {
    const content = (n.description && String(n.description).trim()) || n.title || '';
    setEditingId(n.id);
    setEditText(content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setSavingEditId(null);
  };

  const saveEdit = async (n) => {
    const body = editText.trim();
    const tid = targetLeadId;
    if (!body || !tid) return;
    setSavingEditId(n.id);
    try {
      const title = body.split('\n')[0].slice(0, 120) || 'Ghi chú';
      await api.patch(`/crm/leads/${tid}/activities/${n.id}`, {
        title,
        description: body,
      });
      setEditingId(null);
      setEditText('');
      if (pickOverride) {
        await refreshRemoteActivities();
      } else {
        await refreshFloatingAnchoredActivities(tid);
      }
      await Promise.resolve(onPosted?.());
    } catch (e) {
      alert(e.response?.data?.error || 'Không lưu được ghi chú');
    } finally {
      setSavingEditId(null);
    }
  };

  const showRemoteLoading = variant === 'floating' && pickOverride && remoteLoading;

  const bubbleList = (
    <div
      ref={listRef}
      className={
        variant === 'embedded'
          ? 'space-y-3 overflow-y-auto pr-1 min-h-[220px] max-h-[50vh]'
          : 'space-y-3 overflow-y-auto pr-1 flex-1 min-h-0 py-1'
      }
    >
      {showRemoteLoading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-violet-600">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-xs text-gray-500">Đang tải ghi chú…</p>
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">Chưa có ghi chú. Soạn bên dưới và gửi.</p>
      ) : (
        sorted.map((n) => {
          const mine = currentUserId && String(n.created_by) === String(currentUserId);
          const when = new Date(n.activity_date || n.created_at).toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const name = n.creator?.full_name || 'Thành viên';
          const content = (n.description && String(n.description).trim()) || n.title || '';
          const editable = canEditNote(n);
          const isEditing = editingId === n.id;
          return (
            <div key={n.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`relative max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                  mine
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-br-md'
                    : 'bg-gray-50 text-gray-900 border border-gray-200 rounded-bl-md'
                }`}
              >
                {editable && !isEditing && (
                  <button
                    type="button"
                    onClick={() => startEdit(n)}
                    className={`absolute top-1.5 right-1.5 p-1 rounded-md transition cursor-pointer ${
                      mine
                        ? 'text-blue-100 hover:bg-white/15'
                        : 'text-gray-400 hover:bg-gray-200/80 hover:text-gray-700'
                    }`}
                    title="Sửa ghi chú"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {!mine && (
                  <p className="text-[10px] font-semibold text-violet-600 mb-1 pr-6">{name}</p>
                )}
                {isEditing ? (
                  <div className="space-y-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={4}
                      className={`w-full min-w-[12rem] rounded-lg border px-2 py-1.5 text-sm resize-y focus:ring-2 focus:ring-offset-0 ${
                        mine
                          ? 'border-blue-300/60 bg-white/95 text-gray-900 focus:ring-blue-400'
                          : 'border-gray-300 bg-white text-gray-900 focus:ring-blue-400'
                      }`}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEdit();
                        }
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          saveEdit(n);
                        }
                      }}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={!!savingEditId}
                        className={`px-2 py-1 rounded-md text-xs font-medium cursor-pointer disabled:opacity-50 ${
                          mine
                            ? 'bg-white/20 text-white hover:bg-white/30'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(n)}
                        disabled={!!savingEditId || !editText.trim()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {savingEditId === n.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Lưu
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
                      editable ? 'pr-7' : ''
                    }`}
                  >
                    {content}
                  </p>
                )}
                <p className={`text-[10px] mt-1.5 tabular-nums ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                  {when}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const composer = (
    <div
      className={`flex gap-2 items-end shrink-0 ${
        variant === 'floating' ? 'mt-3 pt-3 border-t border-gray-100' : 'mt-4 pt-4 border-t border-gray-100'
      }`}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={variant === 'embedded' ? 3 : 2}
        placeholder="Nhập ghi chú… Ctrl+Enter để gửi"
        disabled={showRemoteLoading}
        className="flex-1 min-h-[44px] max-h-36 px-3 py-2 rounded-xl border border-gray-200 text-sm resize-y focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white disabled:opacity-50"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button
        type="button"
        onClick={send}
        disabled={sending || showRemoteLoading || !text.trim() || !targetLeadId}
        className="shrink-0 h-11 w-11 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 shadow-md cursor-pointer disabled:cursor-not-allowed"
        title="Gửi (Ctrl+Enter)"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );

  if (variant === 'embedded') {
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-500 mb-2">
          Ghi chú gắn với lead/deal này; bấm <strong>bút</strong> để sửa. Trên <strong>bong bóng nổi</strong> có thể tìm và chọn lead/deal khác để xem/ghi chú nhanh. Cũng hiện trong tab <strong>Hoạt động</strong>.
        </p>
        {contextLine ? (
          <div
            className="mb-3 rounded-lg border border-violet-200 bg-violet-50/90 px-2.5 py-2 text-[11px] font-medium text-violet-950"
            title={contextLine}
          >
            <span className="text-violet-600/90 font-semibold uppercase tracking-wide text-[10px] block mb-0.5">
              Phạm vi ghi chú
            </span>
            <span className="leading-snug break-words">{contextLine}</span>
          </div>
        ) : null}
        {bubbleList}
        {composer}
      </div>
    );
  }

  const count = sorted.length;
  const canReturnToPageAnchor = Boolean(leadId || (contextLine && String(contextLine).trim()));

  const fabTitle = effectiveContextLine ? `${effectiveContextLine} — Ghi chú` : 'Ghi chú (nổi)';

  return (
    <>
      {!fabDocked && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-900/20 ring-4 ring-white transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          title={fabTitle}
          aria-label="Mở ghi chú nổi"
        >
          <StickyNote className="h-6 w-6" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-bold text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      )}

      {fabDocked && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-0 z-[60] flex max-w-[4.75rem] cursor-pointer flex-col items-center gap-1 rounded-l-xl border border-r-0 border-white/25 bg-gradient-to-b from-violet-600 to-indigo-700 py-3 pl-2.5 pr-1.5 text-white shadow-lg transition hover:brightness-110"
          title={fabTitle}
          aria-label="Mở ghi chú (thanh thu gọn)"
        >
          <StickyNote className="h-5 w-5 shrink-0" />
          <span className="w-full break-words text-center text-[9px] font-semibold leading-tight line-clamp-4">
            {stripLabel}
          </span>
          {count > 0 ? (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </button>
      )}

      {open && (
        <div
          className={`fixed bottom-24 z-[60] flex h-[min(72vh,26rem)] w-[min(calc(100vw-3rem),22rem)] max-w-[calc(100vw-5.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ${
            fabDocked ? 'right-2 sm:right-20' : 'right-6'
          }`}
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b bg-gradient-to-r from-violet-50 to-indigo-50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-gray-800">📝 Ghi chú</span>
              {effectiveContextLine ? (
                <p
                  className="mt-0.5 text-[11px] font-medium leading-snug text-violet-900/90 break-words"
                  title={effectiveContextLine}
                >
                  {effectiveContextLine}
                  {pickOverride ? (
                    <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800">
                      khác trang
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] text-gray-500">
                  {leadId || (contextLine && String(contextLine).trim())
                    ? 'Theo lead / deal đang mở'
                    : 'Chưa gắn trang chi tiết — mở «Tìm & chọn lead/deal» bên dưới'}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
              {!fabDocked ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setFabDockedPersist(true);
                  }}
                  className="rounded-lg p-1.5 text-gray-600 hover:bg-white/90 cursor-pointer"
                  title="Thu gọn thành thanh bên phải (ẩn nút tròn)"
                  aria-label="Thu gọn"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setFabDockedPersist(false)}
                  className="rounded-lg p-1.5 text-gray-600 hover:bg-white/90 cursor-pointer"
                  title="Hiện lại nút tròn"
                  aria-label="Hiện nút tròn"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-gray-600 hover:bg-white/90 cursor-pointer"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <details className="shrink-0 border-b border-violet-100 bg-white/80 px-2 py-1 text-left">
            <summary className="cursor-pointer select-none list-none px-1 py-1 text-[11px] font-medium text-violet-800 hover:text-violet-950 [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1">
                <Search className="h-3.5 w-3.5 opacity-80" />
                Tìm & chọn lead/deal…
              </span>
            </summary>
            <div className="space-y-2 px-1 pb-2 pt-1">
              <input
                type="search"
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Gõ mã, tên, SĐT… (≥2 ký tự)"
                className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-300"
              />
              {pickLoading && (
                <div className="flex justify-center py-1 text-violet-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              {!pickLoading && pickQuery.trim().length >= 2 && pickResults.length === 0 && (
                <p className="text-center text-[10px] text-gray-400">Không có kết quả</p>
              )}
              {pickResults.length > 0 && (
                <ul className="max-h-36 overflow-y-auto rounded-lg border border-violet-100 bg-white shadow-inner">
                  {pickResults.map((row) => (
                    <li key={row.id} className="border-b border-gray-50 last:border-0">
                      <button
                        type="button"
                        onClick={() => {
                          setPickOverride({
                            id: row.id,
                            code: row.code || '',
                            title: row.title || '',
                            type: row.type === 'deal' ? 'deal' : 'lead',
                          });
                          setPickQuery('');
                          setPickResults([]);
                        }}
                        className="w-full px-2 py-1.5 text-left text-[11px] leading-snug text-gray-800 hover:bg-violet-50 cursor-pointer"
                      >
                        <span className="font-semibold text-violet-700">
                          {row.type === 'deal' ? '🎯' : '💼'} {row.code || '—'}
                        </span>
                        <span className="block truncate text-gray-600">{row.title || '—'}</span>
                        {row.customer?.phone && (
                          <span className="text-[10px] text-emerald-600">📞 {row.customer.phone}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {pickOverride && (
                <button
                  type="button"
                  onClick={() => {
                    setPickOverride(null);
                    setPickQuery('');
                    setPickResults([]);
                  }}
                  className="w-full rounded-lg border border-dashed border-violet-200 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-50 cursor-pointer"
                >
                  {canReturnToPageAnchor ? 'Về lead/deal đang mở trên trang' : 'Bỏ chọn (không gắn trang)'}
                </button>
              )}
            </div>
          </details>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            {bubbleList}
            {composer}
          </div>
        </div>
      )}
    </>
  );
}
