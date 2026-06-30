/**
 * Panel bình luận (thread + reactions) dùng chung cho chi tiết CRM và Sản xuất.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, Paperclip } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { FbCrmAvatar, FbCrmCommentComposer, formatCrmCommentFullDateTime, formatCrmFbRelativeTime } from './crmFbCommentUi';
import { CrmCommentMentionComposer, renderCrmCommentBody } from './crmCommentMentionUi';
import { FilePreview, FileUploadButton, uploadFilesBatch } from './FileUpload';
import UploadProgressBubble from './UploadProgressBubble';
import { publicFileUrl as pubUrl } from '../lib/publicFileUrl';
import { handleCommentFilePaste } from '../lib/chatClipboard';

const REACTION_PICKER = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const SYSTEM_COMMENT_PREFIXES = ['🔄', '⏰', '📎', '👤', '📋', '✅', '🗑️', '🔀', '🚚'];

function isSystemComment(body) {
  if (!body) return false;
  const trimmed = body.trim();
  return SYSTEM_COMMENT_PREFIXES.some((p) => trimmed.startsWith(p));
}

function isImageFileName(name) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(name || '');
}

function extractSystemFileLink(text) {
  if (!text) return null;
  const m = text.match(/«([^»|]+)\|([^»]+)»/);
  if (!m) return null;
  return { label: m[1], url: m[2] };
}

function renderSystemCommentBody(text) {
  if (!text) return null;
  const parts = [];
  const regex = /«([^»]+)»/g;
  let lastIdx = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const inner = m[1];
    const pipeIdx = inner.indexOf('|');
    if (pipeIdx > 0 && pipeIdx < inner.length - 1) {
      const label = inner.slice(0, pipeIdx);
      const url = inner.slice(pipeIdx + 1);
      parts.push(
        <a key={m.index} href={pubUrl(url)} target="_blank" rel="noopener noreferrer"
          className="font-semibold text-blue-600 hover:underline">
          {`«${label}»`}
        </a>,
      );
    } else {
      parts.push(<strong key={m.index} className="font-semibold text-[#050505]">{`«${inner}»`}</strong>);
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

function normalizeCommentAttachment(att) {
  if (!att) return null;
  const url = att.file_url || att.url || '';
  if (!url) return null;
  return {
    url,
    name: att.file_name || att.name || 'file',
    mime: att.mime_type || att.type || '',
    size: att.file_size || att.size || 0,
  };
}

function commentAttachmentList(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map(normalizeCommentAttachment).filter(Boolean);
}

function isCommentImage(att) {
  const mime = att.mime || '';
  const name = att.name || '';
  return mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(name);
}

export function CommentAttachmentsBlock({ attachments }) {
  const items = commentAttachmentList(attachments);
  if (!items.length) return null;
  const images = items.filter(isCommentImage);
  const otherFiles = items.filter((f) => !isCommentImage(f));
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, ii) => {
            const href = pubUrl(img.url);
            return (
              <a key={ii} href={href} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={href}
                  alt={img.name || 'image'}
                  className="max-h-48 max-w-xs rounded-lg border border-[#e4e6eb] object-cover hover:opacity-90 transition-opacity"
                />
              </a>
            );
          })}
        </div>
      )}
      {otherFiles.length > 0 && (
        <div className="space-y-1">
          {otherFiles.map((f, fi) => {
            const href = pubUrl(f.url);
            return (
              <a
                key={fi}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-2.5 py-1.5 hover:bg-[#e4e6eb] transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#65676b]" />
                <span className="min-w-0 flex-1 truncate text-xs text-[#1877f2]">{f.name}</span>
                {f.size > 0 && (
                  <span className="shrink-0 text-[10px] text-[#65676b] tabular-nums">
                    {f.size < 1048576 ? `${(f.size / 1024).toFixed(0)} KB` : `${(f.size / 1048576).toFixed(1)} MB`}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function useProjectCommentSocket(projectId, onEvent, onRead) {
  const { socket } = useAuth();

  useEffect(() => {
    if (!projectId || !socket) return;

    const join = () => socket.emit('join:project', projectId);
    join();
    socket.on('connect', join);

    const merge = (payload) => {
      if (String(payload?.project_id) !== String(projectId)) return;
      onEvent(payload);
    };
    const onDeleted = (p) => merge({ ...p, action: 'deleted' });
    const onUpdated = (p) => merge({ ...p, action: 'updated' });
    const onReadEvt = (payload) => {
      if (String(payload?.project_id) !== String(projectId)) return;
      onRead?.(payload);
    };
    socket.on('project:comment', merge);
    socket.on('project:comment:deleted', onDeleted);
    socket.on('project:comment:updated', onUpdated);
    if (onRead) socket.on('project:comment:read', onReadEvt);

    return () => {
      socket.off('connect', join);
      socket.emit('leave:project', projectId);
      socket.off('project:comment', merge);
      socket.off('project:comment:deleted', onDeleted);
      socket.off('project:comment:updated', onUpdated);
      if (onRead) socket.off('project:comment:read', onReadEvt);
    };
  }, [projectId, socket, onEvent, onRead]);
}

function useLeadCommentSocket(leadId, onEvent) {
  const { socket } = useAuth();

  useEffect(() => {
    if (!leadId || !socket) return;

    const join = () => socket.emit('join:lead', leadId);
    join();
    socket.on('connect', join);

    const handler = (payload) => {
      if (String(payload?.lead_id) !== String(leadId)) return;
      onEvent(payload);
    };
    socket.on('lead:comment', handler);

    return () => {
      socket.off('connect', join);
      socket.emit('leave:lead', leadId);
      socket.off('lead:comment', handler);
    };
  }, [leadId, socket, onEvent]);
}

function memberDisplayName(userId, members) {
  const mem = (members || []).find((m) => String(m.user_id || m.id) === String(userId));
  return mem?.user?.full_name || mem?.full_name || mem?.user?.email || mem?.email || '';
}

function getSeenByUsersForComment(comment, readReceipts, excludeUserId) {
  if (!comment?.created_at || !readReceipts || readReceipts.size === 0) return [];
  const ts = new Date(comment.created_at).getTime();
  if (!Number.isFinite(ts)) return [];
  const excludeStr = String(excludeUserId || '');
  const out = [];
  for (const [userId, lastReadAt] of readReceipts) {
    if (String(userId) === excludeStr) continue;
    const readTs = new Date(lastReadAt).getTime();
    if (Number.isFinite(readTs) && readTs >= ts) {
      out.push({ user_id: userId, last_read_at: lastReadAt });
    }
  }
  return out;
}

function getNotSeenMembersForComment(seenBy, members, excludeUserId) {
  const seenIds = new Set(seenBy.map((r) => String(r.user_id)));
  const excludeStr = String(excludeUserId || '');
  return (members || []).filter((m) => {
    const id = String(m.user_id || m.id || '');
    return id && id !== excludeStr && !seenIds.has(id);
  });
}

function formatReadStatusTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return isToday ? time : `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${time}`;
}

function ProjectCommentReadStatus({
  comment,
  readReceipts,
  members,
  selfUid,
  openDetailId,
  onOpenDetail,
}) {
  const wrapRef = useRef(null);
  const msgId = String(comment?.id || '');
  const detailOpen = openDetailId === msgId;
  const isOwn = String(comment?.user_id || '') === String(selfUid || '');

  useEffect(() => {
    if (!detailOpen) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onOpenDetail?.(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [detailOpen, onOpenDetail]);

  if (!comment) return null;

  const excludeUid = isOwn ? selfUid : comment.user_id;
  const seenBy = getSeenByUsersForComment(comment, readReceipts, excludeUid);
  const notSeen = getNotSeenMembersForComment(seenBy, members, excludeUid);
  const seenCount = seenBy.length;
  const Icon = seenCount > 0 ? CheckCheck : Check;
  const activeCls = seenCount > 0 ? 'text-sky-500 font-medium' : 'text-[#65676b]';

  const compactLabel = isOwn
    ? seenCount === 0
      ? 'Đã gửi'
      : `Đã xem (${seenCount})`
    : seenCount === 0
      ? 'Chưa xem'
      : `Đã xem (${seenCount})`;

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail?.(detailOpen ? null : msgId);
        }}
        className={`inline-flex items-center gap-0.5 rounded px-0.5 -mx-0.5 hover:bg-black/[0.04] transition cursor-pointer ${activeCls}`}
        title="Bấm xem ai đã xem / đã nhận"
        aria-expanded={detailOpen}
      >
        <Icon size={11} className="shrink-0" aria-hidden />
        <span className="text-[10px]">{compactLabel}</span>
      </button>
      {detailOpen ? (
        <div
          className="absolute bottom-full right-0 mb-1 z-30 min-w-[168px] max-w-[240px] rounded-lg border border-[#e4e6eb] bg-white shadow-lg py-1.5 px-2 text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[9px] text-[#65676b] mb-1.5 pb-1 border-b border-[#e4e6eb]">
            {formatCrmCommentFullDateTime(comment.created_at)}
          </p>
          {seenBy.length > 0 ? (
            <div className="mb-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-sky-600 mb-0.5">
                Đã xem ({seenBy.length})
              </p>
              <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                {seenBy.map((r) => (
                  <li key={r.user_id} className="text-[10px] text-[#050505] leading-snug">
                    <span className="font-medium">{memberDisplayName(r.user_id, members) || 'Thành viên'}</span>
                    {r.last_read_at ? (
                      <span className="text-[#65676b] ml-1">{formatReadStatusTime(r.last_read_at)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[10px] text-[#65676b] mb-1">Chưa có ai xem bình luận này</p>
          )}
          {notSeen.length > 0 ? (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 mb-0.5">
                Đã nhận, chưa xem ({notSeen.length})
              </p>
              <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                {notSeen.map((m) => (
                  <li key={m.user_id || m.id} className="text-[10px] text-[#65676b] leading-snug">
                    {memberDisplayName(m.user_id || m.id, members) || 'Thành viên'}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

function commentId(c) {
  return c?.id != null && c.id !== '' ? String(c.id) : '';
}

/** Thêm hoặc cập nhật một bình luận — tránh trùng khi POST và socket cùng trả về. */
export function upsertComment(prev, row) {
  const id = commentId(row);
  if (!id) return prev || [];
  const list = prev || [];
  const idx = list.findIndex((c) => commentId(c) === id);
  const normalized = { ...row, reactions: row.reactions || { summary: [], mine: null } };
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...normalized, reactions: normalized.reactions ?? next[idx].reactions };
    return next;
  }
  return [...list, normalized];
}

function replaceComment(prev, row) {
  const id = commentId(row);
  if (!id) return prev || [];
  return (prev || []).map((c) => (commentId(c) === id ? { ...c, ...row, reactions: row.reactions ?? c.reactions } : c));
}

function removeCommentById(prev, rawId) {
  const id = String(rawId);
  return (prev || []).filter((c) => commentId(c) !== id);
}

function groupByParent(flat, parentKey = 'parent_id') {
  const m = new Map();
  for (const c of flat || []) {
    const pk = c[parentKey] != null && c[parentKey] !== '' ? String(c[parentKey]) : '__root__';
    if (!m.has(pk)) m.set(pk, []);
    m.get(pk).push(c);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }
  return m;
}

function ReactionStrip({ comment, disabled, onPick }) {
  const rx = comment.reactions || { summary: [], mine: null };
  const countOf = (em) => (rx.summary || []).find((s) => s.emoji === em)?.count || 0;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 pl-0.5">
      {REACTION_PICKER.map((em) => {
        const n = countOf(em);
        const mine = rx.mine === em;
        return (
          <button
            key={em}
            type="button"
            disabled={disabled}
            onClick={() => onPick(em)}
            className={`inline-flex min-h-[26px] items-center gap-0.5 rounded-full border px-2 py-0.5 text-[14px] leading-none transition-colors disabled:opacity-50 ${
              mine ? 'border-[#1877f2] bg-[#e7f3ff] shadow-sm' : n > 0 ? 'border-[#e4e6eb] bg-white hover:bg-[#f0f2f5]' : 'border-transparent bg-[#f0f2f5]/80 text-[#65676b] hover:bg-[#e4e6eb]'
            }`}
          >
            <span>{em}</span>
            {n > 0 && <span className="text-[11px] font-semibold text-[#65676b] tabular-nums">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ReactionCornerBadge({ comment }) {
  const items = (comment.reactions?.summary || []).filter((s) => s.count > 0);
  if (!items.length) return null;
  const total = items.reduce((acc, s) => acc + s.count, 0);
  return (
    <div className="pointer-events-none absolute bottom-0 right-1 z-10 translate-y-1/2 select-none">
      <div className="flex items-center gap-0.5 rounded-full border border-[#e4e6eb] bg-white py-0.5 pl-0.5 pr-1.5 shadow-md ring-1 ring-black/[0.04]">
        <div className="flex items-center -space-x-1.5 pl-0.5">
          {items.slice(0, 3).map((s) => <span key={s.emoji} className="text-[13px] leading-none">{s.emoji}</span>)}
        </div>
        {total > 1 && <span className="text-[10px] font-semibold text-[#65676b] tabular-nums">{total}</span>}
      </div>
    </div>
  );
}

function useCommentPasteUpload(onFilesUploaded) {
  const [uploadingPaste, setUploadingPaste] = useState(false);
  const [pasteProgress, setPasteProgress] = useState(null);

  const handlePasteFiles = useCallback(async (rawFiles) => {
    const files = Array.from(rawFiles || []).filter(Boolean).slice(0, 20);
    if (!files.length) return;
    setUploadingPaste(true);
    setPasteProgress(null);
    try {
      const uploaded = await uploadFilesBatch(files, { onProgress: setPasteProgress });
      onFilesUploaded?.(uploaded);
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không upload được file dán');
    } finally {
      setPasteProgress(null);
      setUploadingPaste(false);
    }
  }, [onFilesUploaded]);

  return { handlePasteFiles, uploadingPaste, pasteProgress };
}

function commentComposerPlaceholder(replyTo, user, { withPasteHint = false, withMentionHint = false } = {}) {
  if (replyTo) return `Trả lời ${replyTo.name}…`;
  const who = user?.full_name || user?.email || 'bạn';
  let text = `Bình luận với tư cách ${who}…`;
  if (withMentionHint) text += ' (@ nhắc thành viên)';
  if (withPasteHint) text += ' · Ctrl+V dán ảnh/file';
  return text;
}

function CommentThread({
  comments,
  loading,
  loadError = '',
  user,
  bodyField,
  getBody,
  setBody,
  editingId,
  editingBody,
  setEditingId,
  setEditingBody,
  replyTo,
  setReplyTo,
  posting,
  reactionBusy,
  onSubmit,
  onSaveEdit,
  onRemove,
  onReply,
  onReaction,
  renderBody,
  members = [],
  enableMentions = false,
  enableAttachments = false,
  pendingFiles = [],
  onFilesUploaded,
  onRemovePendingFile,
  onPasteFiles,
  pasteUploadProgress = null,
  canSubmit,
  readReceipts,
  commentMembers = [],
  readDetailId,
  onOpenReadDetail,
  showReadStatus = false,
}) {
  const selfUid = user?.userId || user?.id;
  const commentsByParent = useMemo(() => groupByParent(comments), [comments]);

  const handleComposerPaste = useCallback((e) => {
    if (!enableAttachments || !onPasteFiles) return;
    handleCommentFilePaste(e, onPasteFiles);
  }, [enableAttachments, onPasteFiles]);

  const composerPlaceholder = commentComposerPlaceholder(replyTo, user, {
    withPasteHint: enableAttachments,
    withMentionHint: enableMentions,
  });

  const renderBranch = (parentKey, depth) => {
    const list = commentsByParent.get(parentKey) || [];
    return list.map((c) => {
      const bodyText = getBody(c) || '';
      const isSys = isSystemComment(bodyText);

      if (isSys && depth === 0) {
        const fileLink = extractSystemFileLink(bodyText);
        const hasImagePreview = fileLink && isImageFileName(fileLink.label);
        return (
          <div key={c.id} className="flex flex-col items-center py-1.5 gap-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e4e6eb]/70 px-3 py-1 max-w-[90%]">
              <span className="text-[12px] leading-relaxed text-[#65676b] text-center break-words whitespace-pre-wrap">
                {renderSystemCommentBody(bodyText)}
              </span>
              <span className="shrink-0 text-[10px] text-[#65676b]/60 ml-1" title={formatCrmCommentFullDateTime(c.created_at)}>
                {formatCrmFbRelativeTime(c.created_at)}
              </span>
            </div>
            {hasImagePreview && (
              <a href={pubUrl(fileLink.url)} target="_blank" rel="noopener noreferrer" className="block mt-1">
                <img
                  src={pubUrl(fileLink.url)}
                  alt={fileLink.label}
                  className="max-h-40 max-w-[260px] rounded-lg border border-[#e4e6eb] object-cover hover:opacity-90 transition-opacity"
                />
              </a>
            )}
            {fileLink && !hasImagePreview && (
              <a href={pubUrl(fileLink.url)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-0.5 px-2.5 py-1 rounded-lg border border-[#e4e6eb] bg-white hover:bg-gray-50 transition-colors text-[12px] text-blue-600">
                <Paperclip size={13} className="text-[#65676b]" />
                <span className="truncate max-w-[200px]">{fileLink.label}</span>
              </a>
            )}
          </div>
        );
      }

      const showCornerRx = editingId !== c.id && (c.reactions?.summary || []).some((s) => s.count > 0);
      return (
        <div key={c.id} className={depth > 0 ? 'ml-5 border-l border-[#ccd0d5] pl-2.5 pt-0.5' : ''}>
          <div className="group/crx flex gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-black/[0.025]">
            <FbCrmAvatar user={c.user} className="h-8 w-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className={`relative inline-block max-w-full ${showCornerRx ? 'mb-2.5' : ''}`}>
                <div className={`max-w-full rounded-2xl border border-[#e4e6eb]/90 bg-white px-3 py-2 shadow-sm ${showCornerRx ? 'pb-2.5' : ''}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    <span className="text-[13px] font-semibold text-[#050505]">{c.user?.full_name || 'Thành viên'}</span>
                    <span className="text-[11px] text-[#65676b]">
                      <time dateTime={c.created_at || ''} title={formatCrmCommentFullDateTime(c.created_at)}>
                        {formatCrmFbRelativeTime(c.created_at)}
                      </time>
                      {c.updated_at && c.updated_at !== c.created_at && <span className="text-[#65676b]/70"> · Đã chỉnh sửa</span>}
                    </span>
                  </div>
                  {editingId === c.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editingBody}
                        onChange={(e) => setEditingBody(e.target.value)}
                        rows={3}
                        className="w-full resize-y rounded-xl border border-[#e4e6eb] bg-[#f0f2f5] px-3 py-2 text-[15px] text-[#050505] focus:border-[#1877f2]/40 focus:outline-none focus:ring-1 focus:ring-[#1877f2]/30"
                      />
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={onSaveEdit} className="text-[13px] font-semibold text-[#1877f2] hover:underline">Lưu</button>
                        <button type="button" onClick={() => { setEditingId(null); setEditingBody(''); }} className="text-[13px] font-semibold text-[#65676b] hover:underline">Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {(getBody(c) || '').trim() ? (
                        <p className="mt-1 break-words text-[15px] leading-snug text-[#050505] whitespace-pre-wrap">
                          {renderBody ? renderBody(getBody(c)) : getBody(c)}
                        </p>
                      ) : null}
                      <CommentAttachmentsBlock attachments={c.attachments} />
                    </>
                  )}
                </div>
                {editingId !== c.id && <ReactionCornerBadge comment={c} />}
              </div>
              {showReadStatus && editingId !== c.id && (
                <div className="mt-0.5 flex justify-end pr-1">
                  <ProjectCommentReadStatus
                    comment={c}
                    readReceipts={readReceipts}
                    members={commentMembers}
                    selfUid={selfUid}
                    openDetailId={readDetailId}
                    onOpenDetail={onOpenReadDetail}
                  />
                </div>
              )}
              {editingId !== c.id && (
                <div
                  className="overflow-hidden transition-[max-height,opacity] duration-200 ease-out max-h-0 opacity-0 pointer-events-none group-hover/crx:max-h-28 group-hover/crx:opacity-100 group-hover/crx:pointer-events-auto group-focus-within/crx:max-h-28 group-focus-within/crx:opacity-100 group-focus-within/crx:pointer-events-auto"
                >
                  <div className="pt-1">
                    <ReactionStrip comment={c} disabled={reactionBusy === c.id} onPick={(em) => onReaction(c, em)} />
                  </div>
                </div>
              )}
              {editingId !== c.id && (
                <div className="overflow-hidden transition-[max-height,opacity] duration-200 ease-out max-h-0 opacity-0 pointer-events-none group-hover/crx:max-h-10 group-hover/crx:opacity-100 group-hover/crx:pointer-events-auto group-focus-within/crx:max-h-10 group-focus-within/crx:opacity-100 group-focus-within/crx:pointer-events-auto">
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-1 text-[12px]">
                    <button type="button" className="font-semibold text-[#65676b] hover:underline" onClick={() => onReply(c)}>Trả lời</button>
                    {String(c.user_id || '') === String(user?.id || user?.userId || '') && (
                      <>
                        <span className="text-[#ccd0d5]">·</span>
                        <button type="button" className="font-semibold text-[#65676b] hover:underline" onClick={() => { setEditingId(c.id); setEditingBody(getBody(c)); }}>Sửa</button>
                        <span className="text-[#ccd0d5]">·</span>
                        <button type="button" className="font-semibold text-[#65676b] hover:underline" onClick={() => onRemove(c)}>Xóa</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {renderBranch(String(c.id), depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="rounded-xl border border-[#e4e6eb] bg-[#f0f2f5] overflow-hidden">
      <div className="min-h-[320px] max-h-[min(720px,75vh)] overflow-y-auto px-2 py-3">
        {loading && <p className="py-8 text-center text-sm text-[#65676b]">Đang tải…</p>}
        {!loading && loadError && (
          <p className="py-8 text-center text-sm text-red-600 px-4">{loadError}</p>
        )}
        {!loading && !loadError && !(comments || []).length && (
          <p className="py-8 text-center text-sm text-[#65676b]">Chưa có bình luận. Hãy là người đầu tiên!</p>
        )}
        {!loading && !loadError && renderBranch('__root__', 0)}
      </div>
      <div className="border-t border-[#e4e6eb] bg-white">
        {replyTo && (
          <div className="flex items-center justify-between gap-2 border-b border-[#e4e6eb] bg-[#f0f2f5] px-3 py-2 text-[13px] text-[#050505]">
            <span className="min-w-0 truncate">Đang trả lời <span className="font-semibold">{replyTo.name}</span></span>
            <button type="button" className="shrink-0 font-semibold text-[#65676b] hover:underline" onClick={() => setReplyTo(null)}>Hủy</button>
          </div>
        )}
        {enableAttachments && pendingFiles.length > 0 && (
          <div className="px-3 pt-2">
            <FilePreview files={pendingFiles} onRemove={onRemovePendingFile} small />
          </div>
        )}
        {pasteUploadProgress ? (
          <div className="px-3 pt-2">
            <UploadProgressBubble
              variant="inline"
              align="start"
              fileName={pasteUploadProgress.fileName}
              fileSize={pasteUploadProgress.fileSize}
              percent={pasteUploadProgress.percent}
              bytesPerSec={pasteUploadProgress.bytesPerSec}
              remainingSec={pasteUploadProgress.remainingSec}
              compact
            />
          </div>
        ) : null}
        {enableMentions ? (
          <CrmCommentMentionComposer
            user={user}
            members={members}
            value={bodyField}
            onChange={(e) => setBody(e.target.value)}
            onSubmit={onSubmit}
            onPaste={enableAttachments ? handleComposerPaste : undefined}
            posting={posting}
            canSubmit={canSubmit}
            attachSlot={enableAttachments ? <FileUploadButton compact onFilesUploaded={onFilesUploaded} /> : null}
            placeholder={composerPlaceholder}
          />
        ) : (
          <FbCrmCommentComposer
            user={user}
            value={bodyField}
            onChange={(e) => setBody(e.target.value)}
            onSubmit={onSubmit}
            onPaste={enableAttachments ? handleComposerPaste : undefined}
            posting={posting}
            canSubmit={canSubmit}
            attachSlot={enableAttachments ? <FileUploadButton compact onFilesUploaded={onFilesUploaded} /> : null}
            placeholder={composerPlaceholder}
          />
        )}
      </div>
    </div>
  );
}

/** Bình luận lead/deal CRM — realtime qua socket `lead:comment` */
export function CrmLeadCommentsPanel({ leadId, onCountChange }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reactionBusy, setReactionBusy] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadError, setLoadError] = useState('');

  const loadMembers = useCallback(async () => {
    if (!leadId) return;
    try {
      const r = await api.get(`/crm/leads/${leadId}/members`);
      setMembers(Array.isArray(r.data) ? r.data : []);
      setLoadError((prev) => (prev && prev.includes('bình luận') ? prev : ''));
    } catch (e) {
      setMembers([]);
      setLoadError(e?.response?.data?.error || 'Không tải được danh sách thành viên');
    }
  }, [leadId]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setLoadError('');
    try {
      const r = await api.get(`/crm/leads/${leadId}/comments`);
      const rows = Array.isArray(r.data) ? r.data : [];
      setComments(rows.map((c) => ({ ...c, reactions: c.reactions || { summary: [], mine: null } })));
      onCountChange?.(rows.length);
    } catch (e) {
      setComments([]);
      onCountChange?.(0);
      setLoadError(e?.response?.data?.error || 'Không tải được bình luận');
    } finally {
      setLoading(false);
    }
  }, [leadId, onCountChange]);

  useEffect(() => { void load(); }, [load]);

  const handleLeadCommentEvent = useCallback((payload) => {
    const action = payload?.action || 'created';
    if (action === 'deleted') {
      setComments((prev) => {
        const next = removeCommentById(prev, payload.comment_id);
        onCountChange?.(next.length);
        return next;
      });
      return;
    }
    const row = payload.comment;
    if (!row?.id) return;
    if (action === 'updated') {
      setComments((prev) => replaceComment(prev, row));
      return;
    }
    setComments((prev) => {
      const next = upsertComment(prev, row);
      if (next.length !== (prev || []).length) onCountChange?.(next.length);
      return next;
    });
  }, [onCountChange]);

  useLeadCommentSocket(leadId, handleLeadCommentEvent);

  const submit = useCallback(async ({ mention_user_ids, attachmentList } = {}) => {
    const v = body.trim();
    const files = attachmentList ?? pendingFiles;
    if (!v && !files.length) return;
    setPosting(true);
    try {
      const payload = { body: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      if (mention_user_ids?.length) payload.mention_user_ids = mention_user_ids;
      if (files.length) payload.attachments = files;
      const r = await api.post(`/crm/leads/${leadId}/comments`, payload);
      const row = r.data || {};
      setComments((prev) => {
        const next = upsertComment(prev, row);
        if (next.length !== (prev || []).length) onCountChange?.(next.length);
        return next;
      });
      setBody('');
      setPendingFiles([]);
      setReplyTo(null);
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi gửi bình luận');
    } finally {
      setPosting(false);
    }
  }, [body, pendingFiles, leadId, replyTo, onCountChange]);

  const handleFilesUploaded = useCallback((files) => {
    const uploaded = (files || []).filter((f) => f?.file_url || f?.url);
    if (!uploaded.length) return;
    setPendingFiles((prev) => [...prev, ...uploaded]);
  }, []);

  const { handlePasteFiles, uploadingPaste, pasteProgress } = useCommentPasteUpload(handleFilesUploaded);

  const saveEdit = async () => {
    const v = editingBody.trim();
    if (!v) return;
    try {
      const r = await api.patch(`/crm/lead-comments/${editingId}`, { body: v });
      const row = r.data || {};
      setComments((prev) => replaceComment(prev, { ...row, id: editingId }));
      setEditingId(null);
      setEditingBody('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi sửa');
    }
  };

  const removeComment = async (c) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    try {
      await api.delete(`/crm/lead-comments/${c.id}`);
      setComments((prev) => {
        const next = removeCommentById(prev, c.id);
        onCountChange?.(next.length);
        return next;
      });
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa');
    }
  };

  const pickReaction = async (c, emoji) => {
    if (reactionBusy != null) return;
    setReactionBusy(c.id);
    try {
      const r = await api.put(`/crm/lead-comments/${c.id}/reaction`, { emoji });
      const reactions = r.data || { summary: [], mine: null };
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, reactions } : x)));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi cảm xúc');
    } finally {
      setReactionBusy(null);
    }
  };

  return (
    <CommentThread
      comments={comments}
      loading={loading}
      loadError={loadError}
      user={user}
      bodyField={body}
      getBody={(c) => c.body}
      setBody={setBody}
      editingId={editingId}
      editingBody={editingBody}
      setEditingId={setEditingId}
      setEditingBody={setEditingBody}
      replyTo={replyTo}
      setReplyTo={setReplyTo}
      posting={posting || uploadingPaste}
      reactionBusy={reactionBusy}
      onSubmit={submit}
      onSaveEdit={saveEdit}
      onRemove={removeComment}
      onReply={(c) => { setReplyTo({ id: c.id, name: c.user?.full_name || 'Thành viên' }); setEditingId(null); }}
      onReaction={pickReaction}
      members={members}
      enableMentions
      enableAttachments
      pendingFiles={pendingFiles}
      onFilesUploaded={handleFilesUploaded}
      onPasteFiles={handlePasteFiles}
      pasteUploadProgress={pasteProgress}
      onRemovePendingFile={(i) => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
      canSubmit={Boolean(body.trim() || pendingFiles.length)}
      renderBody={(text) => renderCrmCommentBody(text, members)}
    />
  );
}

/** Bình luận dự án sản xuất — realtime qua socket `project:comment` */
export function ProjectCommentsPanel({ projectId, onCountChange }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reactionBusy, setReactionBusy] = useState(null);
  const [readReceipts, setReadReceipts] = useState(() => new Map());
  const [commentMembers, setCommentMembers] = useState([]);
  const [readDetailId, setReadDetailId] = useState(null);
  const selfUid = user?.userId || user?.id;

  const applyReadReceipt = useCallback((payload) => {
    if (!payload?.user_id || !payload?.last_read_at) return;
    setReadReceipts((prev) => {
      const next = new Map(prev);
      next.set(String(payload.user_id), payload.last_read_at);
      return next;
    });
  }, []);

  const loadReadMeta = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await api.get(`/projects/${projectId}/comments/read-receipts`);
      const next = new Map();
      for (const row of r.data?.receipts || []) {
        if (row?.user_id && row?.last_read_at) next.set(String(row.user_id), row.last_read_at);
      }
      setReadReceipts(next);
      setCommentMembers(Array.isArray(r.data?.members) ? r.data.members : []);
    } catch {
      setReadReceipts(new Map());
      setCommentMembers([]);
    }
  }, [projectId]);

  const markCommentsRead = useCallback(async () => {
    if (!projectId || !selfUid) return;
    try {
      const r = await api.patch(`/projects/${projectId}/comments/read`);
      if (r.data?.last_read_at) {
        applyReadReceipt({ user_id: selfUid, last_read_at: r.data.last_read_at });
      }
    } catch { /* bảng chưa migrate — bỏ qua */ }
  }, [projectId, selfUid, applyReadReceipt]);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await api.get(`/projects/${projectId}/comments`);
      const rows = Array.isArray(r.data?.comments) ? r.data.comments : [];
      setComments(rows.map((c) => ({ ...c, reactions: c.reactions || { summary: [], mine: null } })));
      onCountChange?.(rows.length);
    } catch {
      setComments([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [projectId, onCountChange]);

  useEffect(() => {
    void load();
    void loadReadMeta();
  }, [load, loadReadMeta]);

  useEffect(() => {
    if (!loading) void markCommentsRead();
  }, [loading, comments.length, markCommentsRead]);

  const handleProjectCommentEvent = useCallback((payload) => {
    const action = payload?.action;
    if (action === 'deleted') {
      const cid = payload.comment_id || payload.comment?.id;
      if (cid) {
        setComments((prev) => {
          const next = removeCommentById(prev, cid);
          if (next.length !== (prev || []).length) onCountChange?.(next.length);
          return next;
        });
      }
      return;
    }
    const row = payload.comment;
    if (!row?.id) return;
    if (action === 'updated') {
      setComments((prev) => replaceComment(prev, row));
      return;
    }
    setComments((prev) => {
      const next = upsertComment(prev, row);
      if (next.length !== (prev || []).length) onCountChange?.(next.length);
      return next;
    });
  }, [onCountChange]);

  useProjectCommentSocket(projectId, handleProjectCommentEvent, applyReadReceipt);

  const submit = useCallback(async (attachmentList) => {
    const v = body.trim();
    const files = attachmentList ?? pendingFiles;
    if (!v && !files.length) return;
    setPosting(true);
    try {
      const payload = { content: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      if (files.length) payload.attachments = files;
      const r = await api.post(`/projects/${projectId}/comments`, payload);
      const row = r.data?.comment || r.data;
      if (row?.id) {
        setComments((prev) => {
          const next = upsertComment(prev, row);
          if (next.length !== (prev || []).length) onCountChange?.(next.length);
          return next;
        });
      } else await load();
      setBody('');
      setPendingFiles([]);
      setReplyTo(null);
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi gửi bình luận');
    } finally {
      setPosting(false);
    }
  }, [body, pendingFiles, projectId, replyTo, onCountChange, load]);

  const handleFilesUploaded = useCallback((files) => {
    const uploaded = (files || []).filter((f) => f?.file_url || f?.url);
    if (!uploaded.length) return;
    setPendingFiles((prev) => [...prev, ...uploaded]);
  }, []);

  const { handlePasteFiles, uploadingPaste, pasteProgress } = useCommentPasteUpload(handleFilesUploaded);

  const saveEdit = async () => {
    const v = editingBody.trim();
    if (!v) return;
    try {
      const r = await api.patch(`/projects/${projectId}/comments/${editingId}`, { content: v });
      const row = r.data || {};
      setComments((prev) => replaceComment(prev, { ...row, id: editingId }));
      setEditingId(null);
      setEditingBody('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi sửa');
    }
  };

  const removeComment = async (c) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    try {
      await api.delete(`/projects/${projectId}/comments/${c.id}`);
      setComments((prev) => {
        const next = removeCommentById(prev, c.id);
        onCountChange?.(next.length);
        return next;
      });
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa');
    }
  };

  const pickReaction = async (c, emoji) => {
    if (reactionBusy != null) return;
    setReactionBusy(c.id);
    try {
      const r = await api.put(`/projects/${projectId}/comments/${c.id}/reaction`, { emoji });
      const reactions = r.data || { summary: [], mine: null };
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, reactions } : x)));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi cảm xúc');
    } finally {
      setReactionBusy(null);
    }
  };

  return (
    <CommentThread
      comments={comments}
      loading={loading}
      user={user}
      bodyField={body}
      getBody={(c) => c.content}
      setBody={setBody}
      editingId={editingId}
      editingBody={editingBody}
      setEditingId={setEditingId}
      setEditingBody={setEditingBody}
      replyTo={replyTo}
      setReplyTo={setReplyTo}
      posting={posting || uploadingPaste}
      reactionBusy={reactionBusy}
      onSubmit={submit}
      onSaveEdit={saveEdit}
      onRemove={removeComment}
      onReply={(c) => { setReplyTo({ id: c.id, name: c.user?.full_name || 'Thành viên' }); setEditingId(null); }}
      onReaction={pickReaction}
      enableAttachments
      pendingFiles={pendingFiles}
      onFilesUploaded={handleFilesUploaded}
      onPasteFiles={handlePasteFiles}
      pasteUploadProgress={pasteProgress}
      onRemovePendingFile={(i) => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
      canSubmit={Boolean(body.trim() || pendingFiles.length)}
      readReceipts={readReceipts}
      commentMembers={commentMembers}
      readDetailId={readDetailId}
      onOpenReadDetail={setReadDetailId}
      showReadStatus
    />
  );
}
