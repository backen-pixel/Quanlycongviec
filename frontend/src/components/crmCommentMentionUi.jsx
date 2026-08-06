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
  canSubmit,
  attachSlot = null,
  onPaste,
  quickReplyTemplates = [],
  onQuickReply,
  allowPrivate = true,
}) {
  const textareaRef = useRef(null);
  const pickedIdsRef = useRef(new Set());
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionPickIdx, setMentionPickIdx] = useState(0);
  const [privateOn, setPrivateOn] = useState(false);
  const [privatePickerOpen, setPrivatePickerOpen] = useState(false);
  const [privateSelectedIds, setPrivateSelectedIds] = useState(() => new Set());

  const meId = user?.userId || user?.id;

  // Đồng bộ danh sách người nhận riêng tư theo @mention hiện có trong nội dung.
  useEffect(() => {
    if (!privateOn) return;
    const fromText = resolveMentionIdsFromContent(String(value || ''), members, { excludeUserId: meId });
    if (!fromText.length) return;
    setPrivateSelectedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of fromText) {
        if (!next.has(String(id))) {
          next.add(String(id));
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [value, privateOn, members, meId]);

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
    if (posting || !(canSubmit ?? trimmed)) return;
    const fromText = resolveMentionIdsFromContent(trimmed, members, { excludeUserId: meId });
    const fromPicks = [...pickedIdsRef.current].filter((id) => String(id) !== String(meId));
    const mentionIds = [...new Set([...fromText, ...fromPicks])];
    const payload = { mention_user_ids: mentionIds };
    if (allowPrivate && privateOn) {
      const audience = new Set([...privateSelectedIds].map(String));
      for (const id of mentionIds) audience.add(String(id));
      audience.delete(String(meId || ''));
      payload.visibility = 'private';
      payload.visible_user_ids = [...audience];
    }
    onSubmit?.(payload);
    pickedIdsRef.current = new Set();
    if (privateOn) {
      setPrivateOn(false);
      setPrivatePickerOpen(false);
      setPrivateSelectedIds(new Set());
    }
  };

  const togglePrivateMember = (uid) => {
    setPrivateSelectedIds((prev) => {
      const next = new Set(prev);
      const key = String(uid);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const privateMemberList = (members || [])
    .map((m) => ({ id: String(m?.user?.id || m?.user_id || ''), name: memberDisplayName(m) || 'Thành viên', mem: m }))
    .filter((m) => m.id && m.id !== String(meId || ''));

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
      {allowPrivate && privateOn && privatePickerOpen && (
        <div className="absolute bottom-full left-10 right-14 z-[100] mb-1 max-h-64 overflow-y-auto rounded-xl border border-amber-200 bg-white py-1 shadow-xl ring-1 ring-black/5">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Chọn người được xem (bình luận riêng tư)
          </p>
          {privateMemberList.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-[#65676b]">Chưa có thành viên khác trong lead/deal.</p>
          )}
          {privateMemberList.map((m) => {
            const checked = privateSelectedIds.has(m.id);
            return (
              <label
                key={m.id}
                className={`flex w-full items-center gap-2 px-3 py-2 text-[14px] cursor-pointer ${checked ? 'bg-amber-50' : 'hover:bg-[#f0f2f5]'}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-600"
                  checked={checked}
                  onChange={() => togglePrivateMember(m.id)}
                />
                <FbCrmAvatar user={m.mem?.user} className="h-6 w-6 shrink-0" />
                <span className="truncate text-[#050505]">{m.name}</span>
              </label>
            );
          })}
          <div className="flex justify-end gap-2 px-3 py-2 border-t border-amber-100">
            <button
              type="button"
              className="h-7 px-2 rounded-md text-[12px] font-semibold text-[#65676b] hover:bg-[#f0f2f5]"
              onClick={() => setPrivatePickerOpen(false)}
            >
              Xong
            </button>
          </div>
        </div>
      )}
      <div className="flex items-end gap-2 px-3 py-2.5 bg-white">
        <FbCrmAvatar user={user} className="h-8 w-8 shrink-0 mb-px" />
        <div className="flex-1 min-w-0 rounded-[22px] bg-[#f0f2f5] px-3 py-2 border border-transparent focus-within:border-[#1877f2]/30 transition-colors">
          {quickReplyTemplates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pb-2 mb-1 border-b border-[#e4e6eb]/70">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#65676b] shrink-0">Tin mẫu</span>
              {quickReplyTemplates.map((item) => {
                const label = typeof item === 'string' ? item : (item.label || item.text || '');
                const text = typeof item === 'string' ? item : (item.text || item.label || '');
                if (!label) return null;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={posting}
                    onClick={() => {
                      onQuickReply?.(text);
                      onChange?.({ target: { value: text } });
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                    className="h-6 px-2 rounded-full border border-[#ccd0d5] bg-white text-[11px] font-medium text-[#050505] hover:bg-[#e7f3ff] hover:border-[#1877f2]/40 disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-start gap-1.5">
            {attachSlot ? <div className="shrink-0 pt-0.5">{attachSlot}</div> : null}
            <textarea
              ref={textareaRef}
              autoFocus={autoFocus}
              value={value}
              onChange={handleChange}
              onPaste={onPaste}
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
            className="min-w-0 flex-1 w-full bg-transparent border-0 p-0 text-[15px] leading-snug text-[#050505] placeholder:text-[#65676b] focus:ring-0 resize-none min-h-[22px] overflow-hidden"
            style={{ maxHeight: COMPOSER_MAX_H }}
          />
          </div>
        </div>
        {allowPrivate && (
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            <button
              type="button"
              onClick={() => {
                setPrivateOn((v) => {
                  const next = !v;
                  setPrivatePickerOpen(next);
                  if (!next) setPrivateSelectedIds(new Set());
                  return next;
                });
              }}
              title={privateOn ? 'Đang bật riêng tư — bấm để tắt' : 'Chỉ hiện với người được chọn'}
              className={`h-8 px-2 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                privateOn
                  ? 'border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200'
                  : 'border-[#ccd0d5] bg-white text-[#65676b] hover:bg-[#f0f2f5]'
              }`}
            >
              {privateOn ? `🔒 Riêng tư (${privateSelectedIds.size})` : '🔒 Riêng tư'}
            </button>
            {privateOn && (
              <button
                type="button"
                onClick={() => setPrivatePickerOpen((v) => !v)}
                className="text-[10px] font-medium text-amber-800 underline hover:text-amber-900"
              >
                {privatePickerOpen ? 'Đóng danh sách' : 'Chọn người nhận'}
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          disabled={posting || !(canSubmit ?? String(value || '').trim())}
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
