import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Share2, ThumbsUp } from 'lucide-react';
import ReactionCircle from './ReactionCircle';
import {
  REACTION_OPTIONS,
  REACTION_EMOJI,
  reactionLabel,
  topReactionKeys,
  totalReactionCount,
} from '../lib/reactions';

/** Tóm tắt cảm xúc + số bình luận (phía trên nút Thích/Bình luận). */
export function ReactionSummary({
  reactionCounts,
  likeCount,
  commentCount = 0,
  onOpenReactionList,
  className = '',
}) {
  const total = totalReactionCount(reactionCounts, likeCount);
  const keys = topReactionKeys(reactionCounts, 3);

  return (
    <div className={`px-4 py-2 border-t border-slate-100 flex items-center justify-between gap-2 text-sm text-slate-600 ${className}`}>
      <span className="flex flex-1 items-center gap-3 flex-wrap min-w-0">
        {total > 0 && (
          <button
            type="button"
            onClick={() => onOpenReactionList?.()}
            className="flex max-w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left text-slate-800 hover:bg-slate-200/70 transition-colors"
          >
            {keys.length > 0 ? (
              <span className="flex items-center shrink-0 pl-0.5">
                {keys.map((k, i) => (
                  <span
                    key={k}
                    className={`relative inline-flex ${i > 0 ? '-ml-1.5' : ''}`}
                    style={{ zIndex: i }}
                    title={k}
                  >
                    <ReactionCircle reactionKey={k} size="sm" />
                  </span>
                ))}
              </span>
            ) : (
              <ThumbsUp className="w-4 h-4 fill-current text-blue-700" />
            )}
            <span className="font-medium tabular-nums">{total}</span>
          </button>
        )}
        {commentCount > 0 && (
          <span className="flex items-center gap-1 text-gray-600">
            <MessageCircle className="w-4 h-4 shrink-0 text-gray-500" />
            <span>{commentCount}</span>
          </span>
        )}
      </span>
    </div>
  );
}

/** Hàng nút Thích (hover picker) + Bình luận. */
export function PostReactionActions({
  entityId,
  myReaction,
  likedByMe,
  onReaction,
  onToggleComments,
  commentsOpen = false,
  onShare,
}) {
  const [rxHover, setRxHover] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const rxCloseTimer = useRef(null);
  const anchorRef = useRef(null);
  const pickerRef = useRef(null);

  const clearRxTimer = () => {
    if (rxCloseTimer.current) {
      clearTimeout(rxCloseTimer.current);
      rxCloseTimer.current = null;
    }
  };
  const openRx = () => {
    clearRxTimer();
    setRxHover(true);
  };
  const scheduleCloseRx = () => {
    clearRxTimer();
    rxCloseTimer.current = setTimeout(() => setRxHover(false), 280);
  };
  useEffect(() => () => clearRxTimer(), []);

  /** Định vị popup phía trên nút Thích, tự bám viewport (giữ trong màn hình). */
  useLayoutEffect(() => {
    if (!rxHover) return undefined;
    const compute = () => {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      const picker = pickerRef.current;
      const pw = picker?.offsetWidth || 320;
      const ph = picker?.offsetHeight || 48;
      const vw = window.innerWidth;
      // Mặc định: căn giữa theo nút, đặt phía trên
      let left = r.left + r.width / 2 - pw / 2;
      let top = r.top - ph - 10;
      // Giữ trong viewport
      left = Math.max(8, Math.min(left, vw - pw - 8));
      if (top < 8) top = r.bottom + 10; // không đủ trên → bật xuống dưới
      setPickerPos({ top, left });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [rxHover]);

  const myRx = myReaction && REACTION_EMOJI[myReaction] ? myReaction : null;

  return (
    <div className="flex border-t border-slate-100">
      <div
        ref={anchorRef}
        className="relative flex-1"
        onMouseEnter={openRx}
        onMouseLeave={scheduleCloseRx}
      >
        <button
          type="button"
          onClick={() => onReaction?.(entityId, 'like')}
          className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            likedByMe ? 'text-blue-600 bg-blue-50/50' : 'text-slate-600 hover:bg-slate-200/70'
          }`}
        >
          {myRx && myRx !== 'like' ? (
            <ReactionCircle reactionKey={myRx} size="md" />
          ) : (
            <ThumbsUp className={`w-5 h-5 ${likedByMe && (!myRx || myRx === 'like') ? 'fill-current' : ''}`} />
          )}
          {myRx && myRx !== 'like' ? reactionLabel(myRx) : 'Thích'}
        </button>
      </div>
      <button
        type="button"
        onClick={() => onToggleComments?.(entityId)}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-l border-slate-100 transition-colors ${
          commentsOpen ? 'text-blue-600 bg-blue-50/30' : 'text-slate-600 hover:bg-slate-200/70'
        }`}
      >
        <MessageCircle className="w-5 h-5" />
        Bình luận
      </button>
      {onShare && (
        <button
          type="button"
          onClick={() => onShare?.()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-l border-slate-100 text-slate-600 hover:bg-slate-200/70 transition-colors"
          title="Chia sẻ hoặc sao chép liên kết"
        >
          <Share2 className="w-5 h-5" />
          Chia sẻ
        </button>
      )}

      {/* Popup chọn cảm xúc — render vào body để không bị card cắt (overflow-hidden / rounded) */}
      {rxHover && typeof document !== 'undefined' && createPortal(
        <div
          ref={pickerRef}
          role="menu"
          className="fixed z-[300] flex items-center gap-0.5 rounded-full border border-slate-200/80 bg-white/95 backdrop-blur-md px-2 py-1.5 shadow-[0_8px_28px_rgba(15,23,42,0.18)] animate-fade-in"
          style={{ top: pickerPos.top, left: pickerPos.left }}
          onMouseEnter={openRx}
          onMouseLeave={scheduleCloseRx}
        >
          {REACTION_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              title={opt.label}
              className="rounded-full p-0.5 transition-transform hover:scale-125 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
              onClick={() => {
                clearRxTimer();
                setRxHover(false);
                onReaction?.(entityId, opt.key);
              }}
            >
              <ReactionCircle reactionKey={opt.key} size="lg" />
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
