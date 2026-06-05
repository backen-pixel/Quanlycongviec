import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, X, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { builtinToNoteShape, getLatestUnreadBuiltinUpdate, markNoteRead } from '../lib/releaseNotesRead';
import { renderReleaseNoteContent } from '../lib/renderReleaseNoteContent';

/** Popup «Có gì mới» — hiện 1 lần cho mỗi bản cập nhật mới (đóng → mark-read → không hiện lại). */
const SHOW_RELEASE_NOTE_LOGIN_MODAL = true;

const CATEGORIES = {
  feature: { label: 'Tính năng mới', icon: '✨', color: 'bg-blue-100 text-blue-700' },
  improvement: { label: 'Cải thiện', icon: '⚡', color: 'bg-amber-100 text-amber-700' },
  bugfix: { label: 'Sửa lỗi', icon: '🐛', color: 'bg-red-100 text-red-700' },
  announcement: { label: 'Thông báo', icon: '📢', color: 'bg-purple-100 text-purple-700' },
};

function formatDateVN(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function ReleaseNoteBody({ content }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      {renderReleaseNoteContent(content)}
    </div>
  );
}

/**
 * Popup cho đúng bản cập nhật mới nhất (đã xuất bản): đóng → mark-read → không hiện lại cho bản đó.
 */
export default function ReleaseNoteLoginModal() {
  if (!SHOW_RELEASE_NOTE_LOGIN_MODAL) return null;

  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/release-notes/login-banner');
        if (cancelled) return;
        if (data.note) {
          setNote(data.note);
        } else {
          const builtin = getLatestUnreadBuiltinUpdate();
          setNote(builtin ? builtinToNoteShape(builtin) : null);
        }
      } catch {
        if (!cancelled) {
          const builtin = getLatestUnreadBuiltinUpdate();
          setNote(builtin ? builtinToNoteShape(builtin) : null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(async () => {
    if (!note?.id || closing) return;
    setClosing(true);
    try {
      if (note.is_builtin) {
        markNoteRead(note);
      } else {
        await api.put(`/release-notes/${note.id}/mark-read`);
      }
    } catch { /* vẫn đóng để không kẹt UI */ }
    setNote(null);
    setClosing(false);
    window.dispatchEvent(new StorageEvent('storage', { key: 'release_notes_read_builtin_ids' }));
  }, [note, closing]);

  const goToUpdates = useCallback(async () => {
    if (!note?.id || closing) return;
    setClosing(true);
    try {
      if (note.is_builtin) {
        markNoteRead(note);
      } else {
        await api.put(`/release-notes/${note.id}/mark-read`);
      }
    } catch { /* ignore */ }
    setNote(null);
    setClosing(false);
    window.dispatchEvent(new StorageEvent('storage', { key: 'release_notes_read_builtin_ids' }));
    navigate('/updates');
  }, [note, closing, navigate]);

  if (loading || !note) return null;

  const cat = CATEGORIES[note.category] || CATEGORIES.feature;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="release-note-login-title">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-[min(100%,56rem)] max-h-[92vh] overflow-hidden flex flex-col border border-gray-200/80">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 to-white shrink-0">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0 ${cat.color}`}>
            {cat.icon}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-xs font-medium text-blue-600 flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5 shrink-0" /> Cập nhật phần mềm
            </p>
            <h2 id="release-note-login-title" className="text-lg font-bold text-gray-900 mt-1 leading-snug">
              {note.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
              <span className={`px-2 py-0.5 rounded-full font-medium ${cat.color}`}>{cat.label}</span>
              {note.version && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{note.version}</span>}
              <span>{formatDateVN(note.published_at || note.created_at)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={closing}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0 cursor-pointer disabled:opacity-50"
            aria-label="Đóng"
          >
            {closing ? <Loader2 className="h-5 w-5 animate-spin" /> : <X className="h-5 w-5" />}
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 min-h-0">
          <ReleaseNoteBody content={note.content || ''} />
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/80 flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={goToUpdates}
            disabled={closing}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer disabled:opacity-50"
          >
            Xem tất cả cập nhật
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={closing}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--color-primary-600,#2563eb)] text-white hover:opacity-95 cursor-pointer disabled:opacity-60"
          >
            Đã đọc, không hiển thị lại
          </button>
        </div>
      </div>
    </div>
  );
}
