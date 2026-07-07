import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, X, Loader2, ChevronDown } from 'lucide-react';
import api from '../lib/api';
import {
  builtinToNoteShape,
  getSortedUnreadBuiltinUpdates,
  markNotesReadLocally,
} from '../lib/releaseNotesRead';
import { ReleaseNoteContent } from '../lib/renderReleaseNoteContent';

/** Popup «Có gì mới» — hiện mọi bản chưa đọc; bắt buộc cuộn hết mới đóng được. */
const SHOW_RELEASE_NOTE_LOGIN_MODAL = true;

const SCROLL_END_THRESHOLD_PX = 32;

const CATEGORIES = {
  feature: { label: 'Tính năng mới', icon: '✨', color: 'bg-blue-100 text-blue-700' },
  improvement: { label: 'Cải thiện', icon: '⚡', color: 'bg-amber-100 text-amber-700' },
  bugfix: { label: 'Sửa lỗi', icon: '🐛', color: 'bg-red-100 text-red-700' },
  announcement: { label: 'Thông báo', icon: '📢', color: 'bg-purple-100 text-purple-700' },
  guide: { label: 'Hướng dẫn', icon: '📖', color: 'bg-teal-100 text-teal-700' },
};

function formatDateVN(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function mergeUnreadNotes(dbNotes, builtinItems) {
  const fromDb = (dbNotes || []).map((n) => ({ ...n, is_builtin: false }));
  const fromBuiltin = (builtinItems || []).map((item) => builtinToNoteShape(item));
  return [...fromDb, ...fromBuiltin].sort(
    (a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0),
  );
}

function ReleaseNoteBlock({ note }) {
  const cat = CATEGORIES[note.category] || CATEGORIES.feature;
  return (
    <article className="pb-8 mb-8 border-b border-gray-200 last:border-b-0 last:mb-0 last:pb-0">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${cat.color}`}>
          {cat.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-medium ${cat.color}`}>{cat.label}</span>
            {note.version && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{note.version}</span>}
            {note.is_builtin && (
              <span className="px-2 py-0.5 rounded-full font-medium bg-blue-600 text-white">Mới trong app</span>
            )}
            <span className="text-gray-400">{formatDateVN(note.published_at || note.created_at)}</span>
          </div>
          <h3 className="text-base font-bold text-gray-900 mt-1.5 leading-snug">{note.title}</h3>
        </div>
      </div>
      <div className="prose prose-sm max-w-none text-gray-700">
        <ReleaseNoteContent content={note.content || ''} />
      </div>
    </article>
  );
}

export default function ReleaseNoteLoginModal() {
  if (!SHOW_RELEASE_NOTE_LOGIN_MODAL) return null;

  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);

  const updateScrollGate = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const needsScroll = el.scrollHeight > el.clientHeight + 8;
    if (!needsScroll) {
      setCanDismiss(true);
      return;
    }
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    setCanDismiss(remaining <= SCROLL_END_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/release-notes/login-queue');
        if (cancelled) return;
        const merged = mergeUnreadNotes(data?.notes, getSortedUnreadBuiltinUpdates());
        setNotes(merged);
      } catch {
        if (!cancelled) {
          setNotes(mergeUnreadNotes([], getSortedUnreadBuiltinUpdates()));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading || !notes.length) return;
    setCanDismiss(false);
    const t = requestAnimationFrame(() => {
      updateScrollGate();
    });
    return () => cancelAnimationFrame(t);
  }, [loading, notes, updateScrollGate]);

  const markAllRead = useCallback(async () => {
    const dbIds = notes.filter((n) => !n.is_builtin).map((n) => n.id);
    markNotesReadLocally(notes.filter((n) => n.is_builtin));
    await Promise.all(
      dbIds.map((id) => api.put(`/release-notes/${id}/mark-read`).catch(() => {})),
    );
  }, [notes]);

  const dismiss = useCallback(async () => {
    if (!notes.length || closing || !canDismiss) return;
    setClosing(true);
    try {
      await markAllRead();
    } catch { /* vẫn đóng */ }
    setNotes([]);
    setClosing(false);
    window.dispatchEvent(new StorageEvent('storage', { key: 'release_notes_read_builtin_ids' }));
  }, [notes, closing, canDismiss, markAllRead]);

  const goToUpdates = useCallback(async () => {
    if (!notes.length || closing || !canDismiss) return;
    setClosing(true);
    try {
      await markAllRead();
    } catch { /* ignore */ }
    setNotes([]);
    setClosing(false);
    window.dispatchEvent(new StorageEvent('storage', { key: 'release_notes_read_builtin_ids' }));
    navigate('/updates');
  }, [notes, closing, canDismiss, markAllRead, navigate]);

  if (loading || !notes.length) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-note-login-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-[min(100%,56rem)] max-h-[92vh] overflow-hidden flex flex-col border border-gray-200/80">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 to-white shrink-0">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0 bg-blue-100 text-blue-700">
            <Megaphone className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-xs font-medium text-blue-600 flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5 shrink-0" /> Có gì mới?
            </p>
            <h2 id="release-note-login-title" className="text-lg font-bold text-gray-900 mt-1 leading-snug">
              {notes.length === 1 ? notes[0].title : `${notes.length} cập nhật mới — vui lòng xem hết`}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Cuộn xuống cuối danh sách để bật nút «Đã đọc».
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={closing || !canDismiss}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Đóng"
            title={canDismiss ? 'Đóng' : 'Cuộn hết nội dung trước khi đóng'}
          >
            {closing ? <Loader2 className="h-5 w-5 animate-spin" /> : <X className="h-5 w-5" />}
          </button>
        </div>

        <div
          ref={scrollRef}
          onScroll={updateScrollGate}
          className="overflow-y-auto px-5 py-4 flex-1 min-h-0 relative"
        >
          {notes.map((note) => (
            <ReleaseNoteBlock key={note.id} note={note} />
          ))}

          {!canDismiss && (
            <div className="sticky bottom-0 -mx-5 px-5 py-3 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none flex items-center justify-center gap-1.5 text-sm text-blue-700 font-medium">
              <ChevronDown className="h-4 w-4 animate-bounce" />
              Cuộn tiếp để xem hết {notes.length} thông báo
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <p className="text-xs text-gray-500">
            {canDismiss
              ? 'Đã xem hết — bạn có thể đóng popup.'
              : 'Chưa cuộn hết — nút đóng sẽ bật khi xem đến cuối.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={goToUpdates}
              disabled={closing || !canDismiss}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Xem trang Có gì mới?
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={closing || !canDismiss}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--color-primary-600,#2563eb)] text-white hover:opacity-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {closing ? 'Đang lưu…' : 'Đã đọc, không hiển thị lại'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
