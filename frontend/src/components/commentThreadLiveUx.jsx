import { useCallback, useEffect, useRef, useState } from 'react';

const NEAR_BOTTOM_PX = 72;

export function isScrollNearBottom(el) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
}

/** Banner mượt khi có bình luận mới ngoài vùng nhìn thấy. */
export function CommentNewNotice({ count, onScrollToNew }) {
  if (!count) return null;
  const label = count === 1 ? '1 bình luận mới' : `${count} bình luận mới`;
  return (
    <div className="pointer-events-none sticky bottom-2 z-10 flex justify-center px-2">
      <button
        type="button"
        onClick={onScrollToNew}
        className="pointer-events-auto rounded-full border border-[#1877f2]/25 bg-[#1877f2] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-lg transition-all duration-300 ease-out hover:bg-[#166fe5] hover:shadow-xl active:scale-[0.98]"
        style={{ animation: 'commentNewBannerIn 0.35s ease-out' }}
      >
        {label}
      </button>
      <style>{`
        @keyframes commentNewBannerIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Hai bước: bấm Ẩn → hiện xác nhận → mới đóng được. */
export function CommentHideConfirmBar({ unreadCount = 0, hasDraft = false, onConfirm, onCancel }) {
  const parts = [];
  if (unreadCount > 0) parts.push(`${unreadCount} bình luận mới chưa xem`);
  if (hasDraft) parts.push('nội dung đang soạn');
  return (
    <div
      className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-950"
      style={{ animation: 'commentHideConfirmIn 0.25s ease-out' }}
    >
      <p className="font-medium text-[#050505]">Ẩn bình luận?</p>
      {parts.length > 0 && (
        <p className="mt-0.5 text-[#65676b]">Còn {parts.join(' và ')}.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-[#1877f2] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#166fe5] transition-colors"
        >
          Xác nhận ẩn
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[#e4e6eb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#65676b] hover:bg-[#f0f2f5] transition-colors"
        >
          Tiếp tục xem
        </button>
      </div>
      <style>{`
        @keyframes commentHideConfirmIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export function useCommentThreadLive({ expanded, comments, loading, currentUserId }) {
  const scrollRef = useRef(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const knownIdsRef = useRef(new Set());
  const expandedRef = useRef(expanded);
  const seededRef = useRef(false);

  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  useEffect(() => {
    if (!expanded) {
      setUnreadCount(0);
      knownIdsRef.current = new Set();
      seededRef.current = false;
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded || loading || comments == null) return;
    const ids = new Set((comments || []).map((c) => String(c.id)));
    const firstSeed = !seededRef.current && ids.size >= 0;
    if (firstSeed) {
      knownIdsRef.current = ids;
      seededRef.current = true;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [expanded, comments, loading]);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setUnreadCount(0);
  }, []);

  const handleIncomingComment = useCallback((row, { isOwnPost = false } = {}) => {
    if (!row?.id || !expandedRef.current) return;
    const id = String(row.id);
    if (knownIdsRef.current.has(id)) return;
    knownIdsRef.current.add(id);

    const isOwn = isOwnPost || String(row.user_id || '') === String(currentUserId || '');
    const nearBottom = isScrollNearBottom(scrollRef.current);

    if (isOwn || nearBottom) {
      requestAnimationFrame(() => scrollToLatest());
    } else {
      setUnreadCount((n) => n + 1);
    }
  }, [currentUserId, scrollToLatest]);

  const onScroll = useCallback(() => {
    if (isScrollNearBottom(scrollRef.current)) setUnreadCount(0);
  }, []);

  return { scrollRef, unreadCount, handleIncomingComment, scrollToLatest, onScroll };
}
