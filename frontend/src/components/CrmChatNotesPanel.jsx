import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  StickyNote,
  Send,
  X,
  Pencil,
  Check,
  Loader2,
  Minimize2,
  Maximize2,
  Search,
  Paperclip,
  Image as ImageIcon,
  Mic,
} from 'lucide-react';
import api from '../lib/api';
import { publicFileUrl } from '../lib/publicFileUrl';
import { formatDateTime } from '../lib/utils';

function sortNotesAsc(notes) {
  return [...(notes || [])].sort((a, b) => {
    const ta = new Date(a.activity_date || a.created_at || 0).getTime();
    const tb = new Date(b.activity_date || b.created_at || 0).getTime();
    return ta - tb;
  });
}

function recordingAudioUrl(rec) {
  if (rec?.audio_url) return rec.audio_url;
  const storage_path = rec?.storage_path || rec;
  if (typeof storage_path !== 'string') return '';
  const path = storage_path.startsWith('/') ? storage_path : `/${storage_path}`;
  const base = import.meta.env.VITE_API_URL;
  if (base) return `${String(base).replace(/\/$/, '')}${path}`;
  return path;
}

function voiceDirLabel(d) {
  if (d === 'inbound') return 'Gọi đến';
  if (d === 'outbound') return 'Gọi đi';
  if (d === 'unknown') return 'Không rõ';
  return d || '';
}

function mergeNotesAndVoiceTimeline(notesAsc, voiceList, includeVoice) {
  const notes = (notesAsc || []).map((n) => ({
    kind: 'note',
    ts: new Date(n.activity_date || n.created_at || 0).getTime(),
    note: n,
  }));
  if (!includeVoice) return notes;
  const voices = (voiceList || []).map((r) => ({
    kind: 'voice',
    ts: new Date(r.created_at || 0).getTime(),
    rec: r,
  }));
  return [...notes, ...voices].sort((a, b) => a.ts - b.ts || (a.kind === b.kind ? 0 : a.kind === 'note' ? -1 : 1));
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
  /** Gộp ghi âm CRM (voice_recordings theo lead) vào dòng thời gian cùng tab Ghi chú */
  includeVoiceTimeline = false,
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
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  /** Đã upload, chờ gửi kèm ghi chú — { url, name, type, size } */
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  /** Chỉ panel nổi: ghi chú cho lead/deal khác (tìm từ API) */
  const [pickOverride, setPickOverride] = useState(null);
  const [pickQuery, setPickQuery] = useState('');
  const [pickResults, setPickResults] = useState([]);
  const [pickLoading, setPickLoading] = useState(false);

  const [remoteActs, setRemoteActs] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(false);

  /** Panel nổi + đang gắn trang (không pick): refetch GET activities để thấy ghi chú mới ngay (props anchor có thể trễ). */
  const [floatingActs, setFloatingActs] = useState(null);

  const [voiceList, setVoiceList] = useState([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceErr, setVoiceErr] = useState('');

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

  const voiceEnabled = includeVoiceTimeline && !!targetLeadId;

  const loadVoices = useCallback(async () => {
    if (!voiceEnabled) {
      setVoiceList([]);
      setVoiceErr('');
      setVoiceLoading(false);
      return;
    }
    setVoiceLoading(true);
    setVoiceErr('');
    try {
      const { data } = await api.get('/voice-recordings', { params: { lead_id: targetLeadId } });
      setVoiceList(Array.isArray(data?.recordings) ? data.recordings : []);
    } catch (e) {
      setVoiceErr(e.response?.data?.error || e.message || 'Không tải ghi âm');
      setVoiceList([]);
    } finally {
      setVoiceLoading(false);
    }
  }, [voiceEnabled, targetLeadId]);

  useEffect(() => {
    void loadVoices();
  }, [loadVoices]);

  const mergedTimeline = useMemo(
    () => mergeNotesAndVoiceTimeline(sorted, voiceList, voiceEnabled),
    [sorted, voiceList, voiceEnabled],
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

  useEffect(() => {
    setPendingAttachments([]);
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
  }, [mergedTimeline.length, open, variant]);

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

  const uploadNoteFile = async (file) => {
    const tid = targetLeadId;
    if (!file || !tid) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/crm/leads/${tid}/activities/upload`, fd);
      if (data?.url) {
        setPendingAttachments((prev) => [
          ...prev,
          {
            url: data.url,
            name: data.name || file.name,
            type: data.type || file.type,
            size: data.size ?? file.size,
          },
        ]);
      }
    } catch (e) {
      alert(e.response?.data?.error || 'Không upload được file');
    }
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const send = async () => {
    const body = text.trim();
    const tid = targetLeadId;
    if ((!body && !pendingAttachments.length) || !tid) return;
    setSending(true);
    try {
      const title =
        body.split('\n')[0]?.slice(0, 120) ||
        (pendingAttachments[0]?.name ? String(pendingAttachments[0].name).slice(0, 120) : '') ||
        'Ghi chú';
      await api.post(`/crm/leads/${tid}/activities`, {
        type: 'note',
        title,
        description: body,
        attachments: pendingAttachments.length ? pendingAttachments : undefined,
      });
      setText('');
      setPendingAttachments([]);
      if (pickOverride) {
        await refreshRemoteActivities();
      } else {
        await refreshFloatingAnchoredActivities(tid);
      }
      await Promise.resolve(onPosted?.());
      if (voiceEnabled) await loadVoices();
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
    const keepFiles = Array.isArray(n.attachments) && n.attachments.length > 0;
    if ((!body && !keepFiles) || !tid) return;
    setSavingEditId(n.id);
    try {
      const title =
        body.split('\n')[0]?.slice(0, 120) ||
        (n.attachments?.[0]?.name ? String(n.attachments[0].name).slice(0, 120) : '') ||
        'Ghi chú';
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
      if (voiceEnabled) await loadVoices();
    } catch (e) {
      alert(e.response?.data?.error || 'Không lưu được ghi chú');
    } finally {
      setSavingEditId(null);
    }
  };

  const showRemoteLoading = variant === 'floating' && pickOverride && remoteLoading;
  const voiceBlockingEmpty = voiceEnabled && voiceLoading && sorted.length === 0;

  const bubbleList = (
    <div
      ref={listRef}
      className={
        variant === 'embedded'
          ? 'space-y-3 overflow-y-auto pr-1 min-h-[220px] max-h-[50vh]'
          : 'space-y-3 overflow-y-auto pr-1 flex-1 min-h-0 py-1'
      }
    >
      {voiceErr && voiceEnabled && !showRemoteLoading ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-900">
          {voiceErr}
        </div>
      ) : null}
      {showRemoteLoading || voiceBlockingEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-violet-600">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-xs text-gray-500">
            {showRemoteLoading ? 'Đang tải ghi chú…' : 'Đang tải ghi âm & ghi chú…'}
          </p>
        </div>
      ) : mergedTimeline.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">
          {voiceEnabled
            ? 'Chưa có ghi chú hay ghi âm gắn cơ hội này. Soạn bên dưới hoặc dùng tab Ghi âm CRM.'
            : 'Chưa có ghi chú. Soạn bên dưới và gửi.'}
        </p>
      ) : (
        mergedTimeline.map((item) => {
          if (item.kind === 'voice') {
            const r = item.rec;
            const mineV = currentUserId && String(r.user_id) === String(currentUserId);
            const whenVoice = formatDateTime(r.created_at);
            const nvVoice = r.uploader?.full_name || 'Thành viên';
            const metaBits = [
              r.phone_number ? `Số: ${r.phone_number}` : null,
              r.direction ? voiceDirLabel(r.direction) : null,
              r.duration_sec != null ? `${r.duration_sec}s` : null,
            ].filter(Boolean);
            return (
              <div key={`v-${r.id}`} className={`flex ${mineV ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`relative max-w-[92%] rounded-2xl px-3.5 py-2.5 shadow-sm border ${
                    mineV
                      ? 'bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white border-violet-500/30 rounded-br-md'
                      : 'bg-white text-gray-900 border-violet-100 rounded-bl-md'
                  }`}
                >
                  <div className={`flex items-center gap-2 mb-1 ${mineV ? 'text-violet-100' : 'text-violet-700'}`}>
                    <Mic className={`h-4 w-4 shrink-0 ${mineV ? 'text-white' : ''}`} />
                    <span className="text-[11px] font-bold uppercase tracking-wide">Ghi âm</span>
                  </div>
                  {!mineV && <p className="text-[10px] font-semibold text-violet-600 mb-1">{nvVoice}</p>}
                  <p className={`text-xs font-medium break-all ${mineV ? 'text-white' : 'text-gray-800'}`}>
                    {r.file_name || 'File'}
                  </p>
                  {metaBits.length > 0 && (
                    <p className={`text-[10px] mt-0.5 ${mineV ? 'text-violet-100/95' : 'text-gray-500'}`}>
                      {metaBits.join(' · ')}
                    </p>
                  )}
                  {r.notes ? (
                    <p className={`text-[11px] mt-1.5 line-clamp-3 ${mineV ? 'text-violet-50' : 'text-gray-600'}`}>
                      {r.notes}
                    </p>
                  ) : null}
                  <audio
                    controls
                    className={`mt-2 w-full max-w-xs h-9 ${mineV ? 'opacity-95' : ''}`}
                    src={recordingAudioUrl(r)}
                    preload="none"
                  />
                  <p className={`text-[10px] mt-1.5 tabular-nums ${mineV ? 'text-violet-100' : 'text-gray-400'}`}>
                    {whenVoice}
                  </p>
                </div>
              </div>
            );
          }
          const n = item.note;
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
          const attachments = Array.isArray(n.attachments) ? n.attachments : [];
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
                        disabled={
                          !!savingEditId ||
                          (!editText.trim() && !(Array.isArray(n.attachments) && n.attachments.length > 0))
                        }
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
                  <>
                    {content ? (
                      <p
                        className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
                          editable ? 'pr-7' : ''
                        }`}
                      >
                        {content}
                      </p>
                    ) : null}
                    {attachments.length > 0 && (
                      <div
                        className={`mt-1.5 space-y-2 ${content && editable ? 'pr-7' : ''} ${
                          content ? 'mt-2' : ''
                        }`}
                      >
                        {attachments.map((a, idx) => {
                          const href = publicFileUrl(a.url);
                          const isImg = String(a.type || '').startsWith('image/');
                          if (isImg && href) {
                            return (
                              <a
                                key={`${a.url}-${idx}`}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={href}
                                  alt={a.name || ''}
                                  className="max-h-52 max-w-full rounded-lg border border-white/20 object-contain bg-black/10"
                                />
                              </a>
                            );
                          }
                          return (
                            <a
                              key={`${a.url}-${idx}`}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium underline-offset-2 hover:underline ${
                                mine ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              <Paperclip className="h-3.5 w-3.5 shrink-0 opacity-80" />
                              <span className="truncate">{a.name || 'Tệp đính kèm'}</span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </>
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
      className={`shrink-0 space-y-2 ${
        variant === 'floating' ? 'mt-3 pt-3 border-t border-gray-100' : 'mt-4 pt-4 border-t border-gray-100'
      }`}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadNoteFile(f);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadNoteFile(f);
        }}
      />
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pendingAttachments.map((a, i) => (
            <span
              key={`${a.url}-${i}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-gray-50 py-0.5 pl-2 pr-1 text-[11px] text-gray-700"
            >
              <span className="truncate">{a.name || 'File'}</span>
              <button
                type="button"
                className="rounded-full p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800 cursor-pointer"
                onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                aria-label="Bỏ file"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={showRemoteLoading || uploadingFile || !targetLeadId}
              onClick={() => imageInputRef.current?.click()}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              title="Đính kèm ảnh"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={showRemoteLoading || uploadingFile || !targetLeadId}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              title="Đính kèm tệp"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {uploadingFile && (
              <span className="text-[10px] text-violet-600 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
              </span>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={variant === 'embedded' ? 3 : 2}
            placeholder="Nhập ghi chú… Ctrl+Enter để gửi"
            disabled={showRemoteLoading || uploadingFile}
            className="w-full min-h-[44px] max-h-36 px-3 py-2 rounded-xl border border-gray-200 text-sm resize-y focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={send}
          disabled={
            sending ||
            showRemoteLoading ||
            uploadingFile ||
            (!text.trim() && !pendingAttachments.length) ||
            !targetLeadId
          }
          className="shrink-0 h-11 w-11 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 shadow-md cursor-pointer disabled:cursor-not-allowed"
          title="Gửi (Ctrl+Enter)"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  if (variant === 'embedded') {
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-500 mb-2">
          Ghi chú gắn với lead/deal này; bấm <strong>bút</strong> để sửa.
          {includeVoiceTimeline ? (
            <>
              {' '}
              <strong>Ghi âm CRM</strong> đã ghép cơ hội hiện cùng dòng thời gian (bong bóng tím). Chi tiết đầy đủ ở tab{' '}
              <strong>Ghi âm CRM</strong>.
            </>
          ) : null}{' '}
          Trên <strong>bong bóng nổi</strong> có thể tìm và chọn lead/deal khác để xem/ghi chú nhanh. Cũng hiện trong tab <strong>Hoạt động</strong>.
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
