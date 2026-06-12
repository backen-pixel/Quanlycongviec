/** Composer bình luận CRM có @mention thành viên lead/deal. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FbCrmAvatar } from './crmFbCommentUi';
import {
  CRM_MENTION_ALL_LABEL,
  applyMentionPickToText,
  buildMentionPickerItems,
  getActiveMentionState,
  memberDisplayName,
  resolveMentionIdsFromContent,
} from '../lib/crmCommentMentions';

const COMPOSER_MAX_H = 160;

export function CrmCommentMentionComposer({
  user,
  value,
  onChange,
  onSubmit,
  posting,
  members = [],
  placeholder = 'Viết bình luận… (@ để nhắc thành viên)',
  submitLabel = 'Đăng',
  minRows = 1,
  autoFocus = false,
}) {
  const textareaRef = useRef(null);
  const pickedIdsRef = useRef(new Set());
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionPickIdx, setMentionPickIdx] = useState(0);

  const meId = user?.userId || user?.id;

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(Math.max(el.scrollHeight, 22), COMPOSER_MAX_H);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_H ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  const syncMentionUi = useCallback((pos) => {
    const p = pos ?? cursorPos;
    setCursorPos(p);
    const { active, start } = getActiveMentionState(value, p);
    if (!active) {
      setMentionOpen(false);
      return;
    }
    setMentionStart(start);
    setMentionOpen(true);
  }, [value, cursorPos]);

  const mentionState = buildMentionPickerItems({
    text: value,
    cursorPos,
    members,
    currentUserId: meId,
  });

  useEffect(() => {
    setMentionPickIdx(0);
  }, [mentionState.query, mentionStart]);

  const handleChange = (e) => {
    const pos = e.target.selectionStart ?? 0;
    const nextText = e.target.value;
    onChange?.(e);
    requestAnimationFrame(() => {
      syncHeight();
      setCursorPos(pos);
      const { active, start } = getActiveMentionState(nextText, pos);
      if (!active) {
        setMentionOpen(false);
        return;
      }
      setMentionStart(start);
      setMentionOpen(true);
    });
  };

  const applyMentionPick = (item) => {
    const { text: next, caret, pickedId } = applyMentionPickToText({
      text: value,
      mentionStart,
      cursorPos,
      item,
    });
    if (pickedId) pickedIdsRef.current.add(pickedId);
    onChange?.({ target: { value: next } });
    setMentionOpen(false);
    setCursorPos(caret);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(caret, caret);
      }
      syncHeight();
    });
  };

  const handleSubmit = () => {
    const trimmed = String(value || '').trim();
    const fromText = resolveMentionIdsFromContent(trimmed, members, { excludeUserId: meId });
    const fromPicks = [...pickedIdsRef.current].filter((id) => String(id) !== String(meId));
    const mentionIds = [...new Set([...fromText, ...fromPicks])];
    onSubmit?.({ mention_user_ids: mentionIds });
    pickedIdsRef.current = new Set();
  };

  const pickerItems = mentionOpen ? mentionState.items : [];
  const showEmptyHint = mentionOpen && !pickerItems.length && (members || []).length === 0;
  const showNoMatch = mentionOpen && !pickerItems.length && (members || []).length > 0;

  return (
    <div className="relative">
      {(mentionOpen && pickerItems.length > 0) && (
        <div className="absolute bottom-full left-10 right-14 z-[100] mb-1 max-h-52 overflow-y-auto rounded-xl border border-[#e4e6eb] bg-white py-1 shadow-xl ring-1 ring-black/5">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#65676b]">
            Nhắc thành viên · Tab hoặc Enter để chọn
          </p>
          {pickerItems.map((item, idx) => {
            const active = idx === mentionPickIdx;
            if (item.type === 'all') {
              return (
                <button
                  key={item.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyMentionPick(item)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] ${active ? 'bg-[#e7f3ff]' : 'hover:bg-[#f0f2f5]'}`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-800">@</span>
                  <span className="font-semibold text-[#050505]">@{CRM_MENTION_ALL_LABEL}</span>
                  <span className="text-[12px] text-[#65676b]">— mọi thành viên</span>
                </button>
              );
            }
            const mem = item.mem;
            const name = memberDisplayName(mem) || 'Thành viên';
            return (
              <button
                key={item.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyMentionPick(item)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] ${active ? 'bg-[#e7f3ff]' : 'hover:bg-[#f0f2f5]'}`}
              >
                <FbCrmAvatar user={mem?.user} className="h-7 w-7 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#050505]">{name}</p>
                  {mem?.user?.email && (
                    <p className="truncate text-[11px] text-[#65676b]">{mem.user.email}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {showEmptyHint && (
        <div className="absolute bottom-full left-10 right-14 z-[100] mb-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 shadow-md">
          Chưa có thành viên trong lead/deal. Thêm ở tab Nhóm trước khi @.
        </div>
      )}
      {showNoMatch && (
        <div className="absolute bottom-full left-10 right-14 z-[100] mb-1 rounded-xl border border-[#e4e6eb] bg-white px-3 py-2 text-[12px] text-[#65676b] shadow-md">
          Không tìm thấy tên phù hợp «{mentionState.query}»
        </div>
      )}
      <div className="flex items-end gap-2 px-3 py-2.5 bg-white">
        <FbCrmAvatar user={user} className="h-8 w-8 shrink-0 mb-px" />
        <div className="flex-1 min-w-0 rounded-[22px] bg-[#f0f2f5] px-3 py-2 border border-transparent focus-within:border-[#1877f2]/30 transition-colors">
          <textarea
            ref={textareaRef}
            autoFocus={autoFocus}
            value={value}
            onChange={handleChange}
            onSelect={(e) => syncMentionUi(e.target.selectionStart ?? 0)}
            onClick={(e) => syncMentionUi(e.target.selectionStart ?? 0)}
            onKeyUp={(e) => syncMentionUi(e.target.selectionStart ?? 0)}
            rows={minRows}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (mentionOpen && pickerItems.length) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionPickIdx((i) => (i + 1) % pickerItems.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionPickIdx((i) => (i - 1 + pickerItems.length) % pickerItems.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  applyMentionPick(pickerItems[mentionPickIdx] || pickerItems[0]);
                  return;
                }
                if (e.key === 'Escape') {
                  setMentionOpen(false);
                  return;
                }
              }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !posting) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="w-full bg-transparent border-0 p-0 text-[15px] leading-snug text-[#050505] placeholder:text-[#65676b] focus:ring-0 resize-none min-h-[22px] overflow-hidden"
            style={{ maxHeight: COMPOSER_MAX_H }}
          />
        </div>
        <button
          type="button"
          disabled={posting || !String(value || '').trim()}
          onClick={handleSubmit}
          className="shrink-0 rounded-full bg-[#1877f2] px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-[#166fe5] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {posting ? '…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

/** Highlight @mention (tên đầy đủ) trong nội dung bình luận. */
export function renderCrmCommentBody(content, members = []) {
  if (!content) return null;
  const text = String(content);
  const spans = [];
  let last = 0;
  let i = 0;

  const sorted = [...(members || [])].sort(
    (a, b) => memberDisplayName(b).length - memberDisplayName(a).length,
  );

  while (i < text.length) {
    if (text[i] !== '@') {
      i += 1;
      continue;
    }
    const rest = text.slice(i + 1);
    const allMatch = rest.match(/^(tất\s*cả|tat\s*ca|all)\b/i);
    if (allMatch) {
      if (i > last) spans.push(<span key={`t-${i}`}>{text.slice(last, i)}</span>);
      const len = 1 + allMatch[0].length;
      spans.push(
        <span key={`m-${i}`} className="font-semibold text-amber-900 bg-amber-100/90 px-0.5 rounded">
          {text.slice(i, i + len)}
        </span>,
      );
      i += len;
      last = i;
      continue;
    }

    let hit = null;
    for (const mem of sorted) {
      const name = memberDisplayName(mem);
      if (!name) continue;
      if (!rest.toLowerCase().startsWith(name.toLowerCase())) {
        const restNorm = rest.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const nameNorm = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (!restNorm.startsWith(nameNorm)) continue;
      }
      const after = rest.slice(name.length);
      if (after.length > 0 && after[0] !== ' ' && after[0] !== '\n') continue;
      hit = name;
      break;
    }

    if (hit) {
      if (i > last) spans.push(<span key={`t-${i}`}>{text.slice(last, i)}</span>);
      const len = 1 + hit.length;
      spans.push(
        <span key={`m-${i}`} className="font-semibold text-amber-900 bg-amber-100/90 px-0.5 rounded">
          {text.slice(i, i + len)}
        </span>,
      );
      i += len;
      last = i;
    } else {
      i += 1;
    }
  }

  if (last < text.length) spans.push(<span key="tail">{text.slice(last)}</span>);
  if (!spans.length) return text;
  return spans;
}
