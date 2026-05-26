import { useEffect, useRef, useState } from 'react';
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
    <div className={`px-4 py-2 border-t border-gray-100 flex items-center justify-between gap-2 text-sm text-gray-600 ${className}`}>
      <span className="flex flex-1 items-center gap-3 flex-wrap min-w-0">
        {total > 0 && (
          <button
            type="button"
            onClick={() => onOpenReactionList?.()}
            className="flex max-w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left text-gray-800 hover:bg-gray-100"
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
  const rxCloseTimer = useRef(null);

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

  const myRx = myReaction && REACTION_EMOJI[myReaction] ? myReaction : null;

  return (
    <div className="flex border-t border-gray-100">
      <div
        className="relative flex-1"
        onMouseEnter={openRx}
        onMouseLeave={scheduleCloseRx}
      >
        {rxHover && (
          <div
            role="menu"
            className="absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-gray-200/90 bg-white/95 px-2 py-1.5 shadow-[0_2px_16px_rgba(0,0,0,0.18)] backdrop-blur-sm"
            onMouseEnter={openRx}
            onMouseLeave={scheduleCloseRx}
          >
            {REACTION_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                title={opt.label}
                className="rounded-full p-0.5 transition-transform hover:scale-125 hover:z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
                onClick={() => {
                  clearRxTimer();
                  setRxHover(false);
                  onReaction?.(entityId, opt.key);
                }}
              >
                <ReactionCircle reactionKey={opt.key} size="lg" />
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => onReaction?.(entityId, 'like')}
          className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            likedByMe ? 'text-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'
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
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-l border-gray-100 ${
          commentsOpen ? 'text-blue-600 bg-blue-50/30' : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        <MessageCircle className="w-5 h-5" />
        Bình luận
      </button>
      {onShare && (
        <button
          type="button"
          onClick={() => onShare?.()}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-l border-gray-100 text-gray-600 hover:bg-gray-50"
          title="Chia sẻ hoặc sao chép liên kết"
        >
          <Share2 className="w-5 h-5" />
          Chia sẻ
        </button>
      )}
    </div>
  );
}
