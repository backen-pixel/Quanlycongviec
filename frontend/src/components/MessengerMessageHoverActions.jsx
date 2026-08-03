import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Quote,
  Forward,
  MoreHorizontal,
  ThumbsUp,
  Copy,
  Undo2,
  Download,
  Image as ImageIcon,
  ListChecks,
} from 'lucide-react';
import { isMessengerMessageRecalled, MESSENGER_QUICK_REACTIONS } from '../lib/messengerReactions';
import {
  buildMessengerCopyText,
  copyImageToClipboard,
  copyTextToClipboard,
  downloadAllMessengerImages,
  downloadMessengerFile,
  getFirstDownloadableAttachment,
  getFirstImageAttachment,
  getImageAttachments,
} from '../lib/messengerMessageActions';
import { showCopyToast } from '../lib/copyToast';

const QUICK_BTN =
  'w-6 h-6 rounded-full bg-white border border-slate-200/90 shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-violet-600 transition-colors';
const QUICK_ICON = 'h-3 w-3';

/**
 * Icon hành động nhanh (Zalo-style): trích dẫn, chuyển tiếp, menu ···
 * Chuột phải → menu mở rộng tại vị trí con trỏ.
 */
export default function MessengerMessageHoverActions({
  message,
  isMe,
  groupTitle,
  canRecall,
  reactionGroups = [],
  onReply,
  onToggleReaction,
  onRecall,
  onForward,
  onStartSelectMode,
  moreMenuOpen,
  onMoreMenuOpen,
  alignEnd = false,
  children,
}) {
  const recalled = isMessengerMessageRecalled(message);
  const showRecallRow = isMe && !recalled && !message?.is_system;
  const [reactionHover, setReactionHover] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const reactionLeaveTimer = useRef(null);
  const menuRef = useRef(null);

  const img = getFirstImageAttachment(message);
  const images = getImageAttachments(message);
  const file = getFirstDownloadableAttachment(message);
  const hasText = !!(message?.content || '').trim();
  const hasReactions = reactionGroups.length > 0;

  useEffect(() => {
    if (!moreMenuOpen) {
      setMenuAnchor(null);
      return undefined;
    }
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      onMoreMenuOpen?.(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moreMenuOpen, onMoreMenuOpen]);

  const clearReactionLeaveTimer = () => {
    if (reactionLeaveTimer.current) {
      clearTimeout(reactionLeaveTimer.current);
      reactionLeaveTimer.current = null;
    }
  };

  const scheduleReactionClose = () => {
    clearReactionLeaveTimer();
    reactionLeaveTimer.current = setTimeout(() => setReactionHover(false), 200);
  };

  const runMenuAction = async (fn) => {
    onMoreMenuOpen?.(false);
    setMenuAnchor(null);
    try {
      await fn();
    } catch (e) {
      alert(e?.message || 'Thao tác thất bại');
    }
  };

  const handleContextMenu = (e) => {
    if (recalled) return;
    e.preventDefault();
    e.stopPropagation();
    setMenuAnchor({ x: e.clientX, y: e.clientY });
    onMoreMenuOpen?.(true);
  };

  const openMenuFromButton = () => {
    setMenuAnchor(null);
    onMoreMenuOpen?.(!moreMenuOpen);
  };

  const reactionTriggerSide = isMe ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2';
  const reactionSummarySide = isMe ? 'right-2' : 'left-2';

  const actionsVisible = moreMenuOpen;

  const moreMenu = moreMenuOpen ? (
    <MoreMenuPanel
      menuRef={menuRef}
      className={
        menuAnchor
          ? ''
          : `absolute bottom-full mb-1.5 z-30 min-w-[210px] ${alignEnd ? 'right-0' : 'left-0'}`
      }
      style={
        menuAnchor
          ? {
              position: 'fixed',
              left: Math.min(menuAnchor.x, window.innerWidth - 220),
              top: Math.max(8, menuAnchor.y - 8),
              transform: 'translateY(-100%)',
              zIndex: 200,
            }
          : undefined
      }
      hasText={hasText}
      img={img}
      images={images}
      file={file}
      showRecallRow={showRecallRow}
      canRecall={canRecall}
      groupTitle={groupTitle}
      message={message}
      runMenuAction={runMenuAction}
      onReply={onReply}
      onForward={onForward}
      onStartSelectMode={onStartSelectMode}
      onRecall={onRecall}
      onMoreMenuOpen={onMoreMenuOpen}
    />
  ) : null;

  return (
    <div
      className={`relative flex flex-col max-w-full group/actions ${alignEnd ? 'items-end' : 'items-start'}`}
      onContextMenu={handleContextMenu}
    >
      <div className={`relative group/bubble max-w-full ${hasReactions ? 'pb-2' : ''}`}>
        {children}

        {hasReactions ? (
          <div
            className={`absolute -bottom-1 z-[6] flex flex-wrap gap-1 max-w-[min(100%,12rem)] ${reactionSummarySide}`}
          >
            {reactionGroups.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onToggleReaction?.(r.emoji)}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] leading-none border shadow-sm transition ${
                  r.mine
                    ? 'bg-violet-50 border-violet-200 text-violet-800'
                    : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50'
                }`}
                title={r.mine ? 'Bỏ cảm xúc' : 'Thả cảm xúc'}
              >
                <span className="text-sm leading-none">{r.emoji}</span>
                {r.count > 1 ? <span className="font-semibold text-[10px] tabular-nums">{r.count}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={`absolute top-1/2 -translate-y-1/2 z-10 ${reactionTriggerSide}`}
          onMouseEnter={() => {
            clearReactionLeaveTimer();
            setReactionHover(true);
          }}
          onMouseLeave={scheduleReactionClose}
        >
          <button
            type="button"
            onClick={() => setReactionHover((v) => !v)}
            className={`w-7 h-7 rounded-full bg-white border border-slate-200/90 shadow-md flex items-center justify-center text-slate-500 transition-all opacity-0 group-hover/bubble:opacity-100 group-hover/msg:opacity-100 focus:opacity-100 ${
              reactionHover ? 'opacity-100 ring-2 ring-violet-200/80 text-violet-600' : 'hover:text-violet-600'
            }`}
            title="Thả cảm xúc"
            aria-label="Thả cảm xúc"
            aria-expanded={reactionHover}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>

          {reactionHover ? (
            <div
              className={`absolute top-1/2 -translate-y-1/2 z-20 flex items-center gap-0.5 p-1 rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200/90 shadow-lg whitespace-nowrap ${
                isMe ? 'right-full mr-2' : 'left-full ml-2'
              }`}
              onMouseEnter={() => {
                clearReactionLeaveTimer();
                setReactionHover(true);
              }}
              onMouseLeave={scheduleReactionClose}
            >
              {MESSENGER_QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    onToggleReaction?.(e);
                    setReactionHover(false);
                  }}
                  className="w-8 h-8 rounded-xl hover:bg-violet-50 hover:scale-110 text-lg flex items-center justify-center transition"
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={`flex items-center gap-1 mt-0.5 min-h-[24px] transition-opacity duration-150 ${
          alignEnd ? 'flex-row-reverse' : ''
        } ${
          actionsVisible
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto group-hover/actions:opacity-100 group-hover/actions:pointer-events-auto'
        }`}
      >
        <button type="button" className={QUICK_BTN} title="Trích dẫn / Trả lời" onClick={() => onReply?.()}>
          <Quote className={QUICK_ICON} />
        </button>
        <button type="button" className={QUICK_BTN} title="Chia sẻ sang chat khác" onClick={() => onForward?.()}>
          <Forward className={QUICK_ICON} />
        </button>
        <div className="relative">
          <button
            type="button"
            className={`${QUICK_BTN} ${moreMenuOpen ? 'bg-violet-50 text-violet-600 border-violet-200' : ''}`}
            title="Thêm tùy chọn"
            onClick={openMenuFromButton}
          >
            <MoreHorizontal className={QUICK_ICON} />
          </button>
          {!menuAnchor && moreMenu}
        </div>
      </div>

      {menuAnchor && moreMenu ? createPortal(moreMenu, document.body) : null}
    </div>
  );
}

function MoreMenuPanel({
  menuRef,
  className,
  style,
  hasText,
  img,
  images = [],
  file,
  showRecallRow,
  canRecall,
  groupTitle,
  message,
  runMenuAction,
  onReply,
  onForward,
  onStartSelectMode,
  onRecall,
  onMoreMenuOpen,
}) {
  const closeAnd = (fn) => () => {
    onMoreMenuOpen?.(false);
    fn?.();
  };

  return (
    <div
      ref={menuRef}
      className={`py-1 rounded-xl bg-white border border-slate-200 shadow-xl min-w-[210px] ${className || ''}`}
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MenuRow icon={Quote} label="Trả lời" onClick={closeAnd(onReply)} />
      <MenuRow icon={Forward} label="Chia sẻ" onClick={closeAnd(onForward)} />
      <div className="my-1 border-t border-slate-100" />
      {hasText ? (
        <MenuRow
          icon={Copy}
          label="Sao chép tin nhắn"
          onClick={() =>
            void runMenuAction(async () => {
              await copyTextToClipboard(buildMessengerCopyText(message));
              showCopyToast('Đã sao chép');
            })
          }
        />
      ) : null}
      {img ? (
        <MenuRow
          icon={ImageIcon}
          label="Sao chép ảnh"
          onClick={() =>
            void runMenuAction(async () => {
              const kind = await copyImageToClipboard(img.url);
              if (kind === 'url') {
                showCopyToast('Đã sao chép link ảnh');
              } else {
                showCopyToast('Đã sao chép');
              }
            })
          }
        />
      ) : null}
      {file?.url ? (
        <MenuRow
          icon={Download}
          label="Tải xuống"
          onClick={() =>
            void runMenuAction(async () => {
              await downloadMessengerFile(file.url, file.name);
            })
          }
        />
      ) : null}
      {images.length > 1 ? (
        <MenuRow
          icon={Download}
          label={`Tải hết ${images.length} ảnh`}
          onClick={() =>
            void runMenuAction(async () => {
              await downloadAllMessengerImages(message);
              showCopyToast(`Đã tải ${images.length} ảnh`);
            })
          }
        />
      ) : null}
      <MenuRow
        icon={ListChecks}
        label="Chọn nhiều tin nhắn"
        onClick={() => {
          onMoreMenuOpen?.(false);
          onStartSelectMode?.(message?.id);
        }}
      />
      {showRecallRow ? (
        <>
          <div className="my-1 border-t border-slate-100" />
          <MenuRow
            icon={Undo2}
            label={canRecall ? 'Thu hồi tin nhắn' : 'Thu hồi (quá 24 giờ)'}
            danger
            disabled={!canRecall}
            onClick={() => {
              if (!canRecall) return;
              onMoreMenuOpen?.(false);
              onRecall?.();
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function MenuRow({ icon: Icon, label, onClick, danger, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition disabled:opacity-45 disabled:cursor-not-allowed ${
        danger && !disabled ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-800 hover:bg-slate-50'
      } ${disabled ? 'text-slate-400' : ''}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${danger ? 'text-rose-500' : 'text-slate-500'}`} />
      {label}
    </button>
  );
}
