/**
 * Panel bình luận (thread + reactions) dùng chung cho chi tiết CRM và Sản xuất.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Paperclip,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { FbCrmAvatar, FbCrmCommentComposer, formatCrmCommentFullDateTime, formatCrmFbRelativeTime } from './crmFbCommentUi';
import { CrmCommentMentionComposer, renderCrmCommentBody } from './crmCommentMentionUi';
import { FilePreview, FileUploadButton, uploadFilesBatch } from './FileUpload';
import UploadProgressBubble from './UploadProgressBubble';
import UploadFileLightbox from './UploadFileLightbox';
import { downloadUploadFile, publicFileUrl as pubUrl } from '../lib/publicFileUrl';
import { handleCommentFilePaste } from '../lib/chatClipboard';
import { CommentNewNotice, useCommentThreadLive } from './commentThreadLiveUx';
import { isQuoteContractActivityComment } from '../lib/hideQuoteContractFromProduction';
import CommentDisplayHiddenBanner, { useCommentShowOnScreenEnabled } from './CommentDisplayHiddenBanner';

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

function fileExt(name) {
  const s = String(name || '').trim();
  const idx = s.lastIndexOf('.');
  if (idx < 0 || idx === s.length - 1) return '';
  return s.slice(idx + 1).toLowerCase();
}

function humanFileSize(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fileVisual(name, mime) {
  const ext = fileExt(name);
  const mm = String(mime || '').toLowerCase();
  const isVideo = mm.startsWith('video/') || ['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext);
  const isAudio = mm.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext);
  const isPdf = ext === 'pdf' || mm === 'application/pdf';
  const isDoc = ['doc', 'docx'].includes(ext);
  const isPpt = ['ppt', 'pptx'].includes(ext);
  const isXls = ['xls', 'xlsx', 'csv'].includes(ext);
  const isZip = ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext);
  const isCode = ['js', 'ts', 'tsx', 'jsx', 'json', 'sql', 'py', 'java', 'cs', 'php', 'rb', 'go', 'rs', 'yml', 'yaml'].includes(ext);
  const isTxt = ['txt', 'md', 'log'].includes(ext);

  if (isVideo) return { Icon: FileVideo, bg: 'bg-indigo-50', fg: 'text-indigo-600', ring: 'ring-indigo-200', label: ext || 'video' };
  if (isAudio) return { Icon: FileAudio, bg: 'bg-fuchsia-50', fg: 'text-fuchsia-600', ring: 'ring-fuchsia-200', label: ext || 'audio' };
  if (isPdf) return { Icon: FileText, bg: 'bg-red-50', fg: 'text-red-600', ring: 'ring-red-200', label: 'pdf' };
  if (isXls) return { Icon: FileSpreadsheet, bg: 'bg-emerald-50', fg: 'text-emerald-700', ring: 'ring-emerald-200', label: ext || 'xls' };
  if (isDoc || isPpt) return { Icon: FileText, bg: 'bg-sky-50', fg: 'text-sky-700', ring: 'ring-sky-200', label: ext || 'doc' };
  if (isZip) return { Icon: FileArchive, bg: 'bg-amber-50', fg: 'text-amber-700', ring: 'ring-amber-200', label: ext || 'zip' };
  if (isCode) return { Icon: FileCode, bg: 'bg-slate-50', fg: 'text-slate-700', ring: 'ring-slate-200', label: ext || 'code' };
  if (isTxt) return { Icon: FileText, bg: 'bg-gray-50', fg: 'text-gray-700', ring: 'ring-gray-200', label: ext || 'txt' };
  return { Icon: File, bg: 'bg-gray-50', fg: 'text-gray-700', ring: 'ring-gray-200', label: ext || 'file' };
}

export function CommentAttachmentsBlock({ attachments, onOpenImage }) {
  const items = commentAttachmentList(attachments);
  if (!items.length) return null;
  const images = items.filter(isCommentImage);
  const otherFiles = items.filter((f) => !isCommentImage(f));

  const localLightboxItems = useMemo(
    () => images.map((img) => ({ url: pubUrl(img.url), title: img.name || 'image', rawPath: img.url })),
    [images],
  );
  const [localOpen, setLocalOpen] = useState(false);
  const [localIndex, setLocalIndex] = useState(0);

  return (
    <div className="mt-2 space-y-2">
      {localOpen && !onOpenImage && localLightboxItems.length > 0 && (
        <UploadFileLightbox
          items={localLightboxItems}
          index={localIndex}
          onIndexChange={setLocalIndex}
          onClose={() => setLocalOpen(false)}
        />
      )}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, ii) => {
            const href = pubUrl(img.url);
            return (
              <button
                key={ii}
                type="button"
                className="block"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onOpenImage) return onOpenImage(href, { title: img.name || 'image', rawPath: img.url });
                  setLocalIndex(ii);
                  setLocalOpen(true);
                }}
              >
                <img
                  src={href}
                  alt={img.name || 'image'}
                  className="max-h-48 max-w-xs rounded-lg border border-[#e4e6eb] object-cover hover:opacity-90 transition-opacity"
                />
              </button>
            );
          })}
        </div>
      )}
      {otherFiles.length > 0 && (
        <div className="space-y-2">
          {otherFiles.map((f, fi) => {
            const href = pubUrl(f.url);
            const v = fileVisual(f.name, f.mime);
            const sizeText = humanFileSize(f.size);
            return (
              <button
                key={fi}
                type="button"
                className={[
                  'w-full text-left flex items-center gap-3 rounded-2xl',
                  'bg-white px-3 py-2.5',
                  'border border-[#e4e6eb]',
                  'shadow-sm',
                  'hover:shadow-md hover:-translate-y-[1px]',
                  'hover:border-[#cbd5e1]',
                  'transition-[transform,box-shadow,border-color] duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1877f2]/30',
                ].join(' ')}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  downloadUploadFile(f.url, f.name || 'tai-lieu').catch((err) => {
                    alert(err?.message || 'Không tải được file');
                  });
                }}
              >
                <span className={`shrink-0 h-11 w-11 rounded-xl ring-1 ${v.bg} ${v.ring} flex items-center justify-center`}>
                  <v.Icon className={`h-6 w-6 ${v.fg}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block min-w-0 truncate text-[13px] font-semibold text-[#111827]">
                    {f.name}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[11px] text-[#6b7280]">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 ring-1 ${v.bg} ${v.ring} ${v.fg} font-bold uppercase tracking-wide`}>
                      {v.label}
                    </span>
                    {sizeText ? <span className="tabular-nums">{sizeText}</span> : null}
                  </span>
                </span>
                <span className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#1877f2] px-3 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-[#166fe5] transition-colors">
                  <Download className="h-4 w-4 text-white" />
                  Tải xuống
                </span>
              </button>
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

function useLeadCommentSocket(leadId, onEvent, onRead) {
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
    const onReadEvt = (payload) => {
      if (String(payload?.lead_id) !== String(leadId)) return;
      onRead?.(payload);
    };
    socket.on('lead:comment', handler);
    if (onRead) socket.on('lead:comment:read', onReadEvt);

    return () => {
      socket.off('connect', join);
      socket.emit('leave:lead', leadId);
      socket.off('lead:comment', handler);
      if (onRead) socket.off('lead:comment:read', onReadEvt);
    };
  }, [leadId, socket, onEvent, onRead]);
}

function memberDisplayName(userId, members) {
  const mem = (members || []).find((m) => String(m.user_id || m.id) === String(userId));
  return mem?.user?.full_name || mem?.full_name || mem?.user?.email || mem?.email || '';
}

function getSeenByUsersForComment(comment, readReceipts, excludeUserId, audienceMembers = []) {
  if (!comment?.created_at || !readReceipts || readReceipts.size === 0) return [];
  const ts = new Date(comment.created_at).getTime();
  if (!Number.isFinite(ts)) return [];
  const excludeStr = String(excludeUserId || '');
  const audienceIds = new Set(
    (audienceMembers || []).map((m) => String(m.user_id || m.id || '')).filter(Boolean),
  );
  const out = [];
  for (const [userId, lastReadAt] of readReceipts) {
    if (String(userId) === excludeStr) continue;
    if (audienceIds.size && !audienceIds.has(String(userId))) continue;
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
  const seenBy = getSeenByUsersForComment(comment, readReceipts, excludeUid, members);
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
  threadScrollRef,
  onThreadScroll,
  newCommentCount = 0,
  onScrollToNewComments,
  quickReplyTemplates = [],
}) {
  const selfUid = user?.userId || user?.id;
  const commentsByParent = useMemo(() => groupByParent(comments), [comments]);

  const threadImageItems = useMemo(() => {
    const out = [];
    const seen = new Set();

    for (const c of comments || []) {
      const rawBody = getBody?.(c) || '';
      if (isSystemComment(rawBody)) {
        const fileLink = extractSystemFileLink(rawBody);
        const hasImagePreview = fileLink && isImageFileName(fileLink.label);
        if (hasImagePreview) {
          const rawPath = fileLink.url;
          const url = pubUrl(rawPath);
          const key = `sys:${rawPath}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ url, title: fileLink.label, rawPath });
          }
        }
      }

      for (const att of commentAttachmentList(c.attachments)) {
        if (!isCommentImage(att)) continue;
        const rawPath = att.url;
        const url = pubUrl(rawPath);
        const key = `att:${rawPath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ url, title: att.name || 'image', rawPath });
      }
    }
    return out;
  }, [comments, getBody]);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxItems, setLightboxItems] = useState([]);

  const openLightboxByUrl = useCallback((url, meta) => {
    if (!url) return;
    const idx = threadImageItems.findIndex((x) => x.url === url);
    if (idx >= 0) {
      setLightboxItems(threadImageItems);
      setLightboxIndex(idx);
    } else {
      setLightboxItems([{ url, title: meta?.title || 'image', rawPath: meta?.rawPath || null }]);
      setLightboxIndex(0);
    }
    setLightboxOpen(true);
  }, [threadImageItems]);

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
              <button
                type="button"
                className="block mt-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openLightboxByUrl(pubUrl(fileLink.url));
                }}
              >
                <img
                  src={pubUrl(fileLink.url)}
                  alt={fileLink.label}
                  className="max-h-40 max-w-[260px] rounded-lg border border-[#e4e6eb] object-cover hover:opacity-90 transition-opacity"
                />
              </button>
            )}
            {fileLink && !hasImagePreview && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  downloadUploadFile(fileLink.url, fileLink.label || 'tai-lieu').catch((err) => {
                    alert(err?.message || 'Không tải được file');
                  });
                }}
                className="inline-flex items-center gap-1.5 mt-0.5 px-2.5 py-1 rounded-lg border border-[#e4e6eb] bg-white hover:bg-gray-50 transition-colors text-[12px] text-blue-600"
              >
                <Paperclip size={13} className="text-[#65676b]" />
                <span className="truncate max-w-[200px]">{fileLink.label}</span>
                <Download size={14} className="ml-1 text-[#65676b]" />
              </button>
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
                      <CommentAttachmentsBlock attachments={c.attachments} onOpenImage={openLightboxByUrl} />
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
      {lightboxOpen && (
        <UploadFileLightbox
          items={(lightboxItems && lightboxItems.length ? lightboxItems : threadImageItems)}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      <div
        ref={threadScrollRef}
        onScroll={onThreadScroll}
        className="relative min-h-[320px] max-h-[min(720px,75vh)] overflow-y-auto px-2 py-3 scroll-smooth"
      >
        {loading && <p className="py-8 text-center text-sm text-[#65676b]">Đang tải…</p>}
        {!loading && loadError && (
          <p className="py-8 text-center text-sm text-red-600 px-4">{loadError}</p>
        )}
        {!loading && !loadError && !(comments || []).length && (
          <p className="py-8 text-center text-sm text-[#65676b]">Chưa có bình luận. Hãy là người đầu tiên!</p>
        )}
        {!loading && !loadError && renderBranch('__root__', 0)}
        <CommentNewNotice count={newCommentCount} onScrollToNew={onScrollToNewComments} />
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
            quickReplyTemplates={quickReplyTemplates}
            onQuickReply={(text) => setBody(text)}
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
export function CrmLeadCommentsPanel({
  leadId,
  onCountChange,
  onUnreadCountChange,
  quickReplyTemplates = [],
  forModule = null,
}) {
  const showOnScreen = useCommentShowOnScreenEnabled();
  const { user } = useAuth();
  const selfUid = user?.userId || user?.id;
  const activeLeadId = showOnScreen ? leadId : null;
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
  const [readReceipts, setReadReceipts] = useState(() => new Map());
  const [readDetailId, setReadDetailId] = useState(null);

  const applyReadReceipt = useCallback((payload) => {
    if (!payload?.user_id || !payload?.last_read_at) return;
    setReadReceipts((prev) => {
      const next = new Map(prev);
      next.set(String(payload.user_id), payload.last_read_at);
      return next;
    });
  }, []);

  const loadReadMeta = useCallback(async () => {
    if (!activeLeadId) return;
    try {
      const r = await api.get(`/crm/leads/${activeLeadId}/comments/read-receipts`);
      const next = new Map();
      for (const row of r.data?.receipts || []) {
        if (row?.user_id && row?.last_read_at) next.set(String(row.user_id), row.last_read_at);
      }
      setReadReceipts(next);
      const apiMembers = Array.isArray(r.data?.members) ? r.data.members : [];
      setMembers(apiMembers);
    } catch {
      setReadReceipts(new Map());
    }
  }, [activeLeadId]);

  const markCommentsRead = useCallback(async () => {
    if (!activeLeadId || !selfUid) return;
    try {
      const r = await api.patch(`/crm/leads/${activeLeadId}/comments/read`);
      if (r.data?.last_read_at) {
        applyReadReceipt({ user_id: selfUid, last_read_at: r.data.last_read_at });
      }
    } catch { /* bảng chưa migrate — bỏ qua */ }
  }, [activeLeadId, selfUid, applyReadReceipt]);

  const {
    scrollRef,
    unreadCount,
    handleIncomingComment,
    scrollToLatest,
    onScroll,
  } = useCommentThreadLive({
    expanded: true,
    comments,
    loading,
    currentUserId: selfUid,
  });

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const load = useCallback(async () => {
    if (!activeLeadId) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = forModule ? { for_module: forModule } : undefined;
      const r = await api.get(`/crm/leads/${activeLeadId}/comments`, { params });
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
  }, [activeLeadId, forModule, onCountChange]);

  useEffect(() => {
    if (!showOnScreen) {
      setComments([]);
      setLoading(false);
      setLoadError('');
      onCountChange?.(0);
      onUnreadCountChange?.(0);
      return;
    }
    void load();
    void loadReadMeta();
  }, [showOnScreen, load, loadReadMeta, onCountChange, onUnreadCountChange]);

  useEffect(() => {
    if (!showOnScreen || loading) return;
    void markCommentsRead();
  }, [showOnScreen, loading, comments.length, markCommentsRead]);

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
    // SX: ẩn bình luận hoạt động Báo giá / Hợp đồng (VPT & Phúc Đạt — khớp API for_module)
    if (
      String(forModule || '').toLowerCase() === 'production'
      && isQuoteContractActivityComment(row.body)
    ) {
      return;
    }
    if (action === 'updated') {
      setComments((prev) => replaceComment(prev, row));
      return;
    }
    setComments((prev) => {
      const next = upsertComment(prev, row);
      if (next.length !== (prev || []).length) onCountChange?.(next.length);
      return next;
    });
    handleIncomingComment(row);
  }, [forModule, onCountChange, handleIncomingComment]);

  useLeadCommentSocket(activeLeadId, handleLeadCommentEvent, applyReadReceipt);

  const submit = useCallback(async ({ mention_user_ids, attachmentList } = {}) => {
    const v = body.trim();
    const files = attachmentList ?? pendingFiles;
    if (!activeLeadId || (!v && !files.length)) return;
    setPosting(true);
    try {
      const payload = { body: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      if (mention_user_ids?.length) payload.mention_user_ids = mention_user_ids;
      if (files.length) payload.attachments = files;
      const r = await api.post(`/crm/leads/${activeLeadId}/comments`, payload);
      const row = r.data || {};
      setComments((prev) => {
        const next = upsertComment(prev, row);
        if (next.length !== (prev || []).length) onCountChange?.(next.length);
        return next;
      });
      handleIncomingComment(row, { isOwnPost: true });
      setBody('');
      setPendingFiles([]);
      setReplyTo(null);
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi gửi bình luận');
    } finally {
      setPosting(false);
    }
  }, [body, pendingFiles, activeLeadId, replyTo, onCountChange, handleIncomingComment]);

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

  if (!showOnScreen) return <CommentDisplayHiddenBanner />;

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
      threadScrollRef={scrollRef}
      onThreadScroll={onScroll}
      newCommentCount={unreadCount}
      onScrollToNewComments={scrollToLatest}
      quickReplyTemplates={quickReplyTemplates}
      showReadStatus
      readReceipts={readReceipts}
      commentMembers={members}
      readDetailId={readDetailId}
      onOpenReadDetail={setReadDetailId}
    />
  );
}

/** Bình luận dự án sản xuất — realtime qua socket `project:comment` */
export function ProjectCommentsPanel({ projectId, onCountChange }) {
  const showOnScreen = useCommentShowOnScreenEnabled();
  const { user } = useAuth();
  const activeProjectId = showOnScreen ? projectId : null;
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
    if (!activeProjectId) return;
    try {
      const r = await api.get(`/projects/${activeProjectId}/comments/read-receipts`);
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
  }, [activeProjectId]);

  const markCommentsRead = useCallback(async () => {
    if (!activeProjectId || !selfUid) return;
    try {
      const r = await api.patch(`/projects/${activeProjectId}/comments/read`);
      if (r.data?.last_read_at) {
        applyReadReceipt({ user_id: selfUid, last_read_at: r.data.last_read_at });
      }
    } catch { /* bảng chưa migrate — bỏ qua */ }
  }, [activeProjectId, selfUid, applyReadReceipt]);

  const load = useCallback(async () => {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const r = await api.get(`/projects/${activeProjectId}/comments`);
      const rows = Array.isArray(r.data?.comments) ? r.data.comments : [];
      setComments(rows.map((c) => ({ ...c, reactions: c.reactions || { summary: [], mine: null } })));
      onCountChange?.(rows.length);
    } catch {
      setComments([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, onCountChange]);

  useEffect(() => {
    if (!showOnScreen) {
      setComments([]);
      setLoading(false);
      onCountChange?.(0);
      return;
    }
    void load();
    void loadReadMeta();
  }, [showOnScreen, load, loadReadMeta, onCountChange]);

  useEffect(() => {
    if (!showOnScreen || loading) return;
    void markCommentsRead();
  }, [showOnScreen, loading, comments.length, markCommentsRead]);

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

  useProjectCommentSocket(activeProjectId, handleProjectCommentEvent, applyReadReceipt);

  const submit = useCallback(async (attachmentList) => {
    const v = body.trim();
    const files = attachmentList ?? pendingFiles;
    if (!activeProjectId || (!v && !files.length)) return;
    setPosting(true);
    try {
      const payload = { content: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      if (files.length) payload.attachments = files;
      const r = await api.post(`/projects/${activeProjectId}/comments`, payload);
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
  }, [body, pendingFiles, activeProjectId, replyTo, onCountChange, load]);

  const handleFilesUploaded = useCallback((files) => {
    const uploaded = (files || []).filter((f) => f?.file_url || f?.url);
    if (!uploaded.length) return;
    setPendingFiles((prev) => [...prev, ...uploaded]);
  }, []);

  const { handlePasteFiles, uploadingPaste, pasteProgress } = useCommentPasteUpload(handleFilesUploaded);

  const saveEdit = async () => {
    const v = editingBody.trim();
    if (!v || !activeProjectId) return;
    try {
      const r = await api.patch(`/projects/${activeProjectId}/comments/${editingId}`, { content: v });
      const row = r.data || {};
      setComments((prev) => replaceComment(prev, { ...row, id: editingId }));
      setEditingId(null);
      setEditingBody('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi sửa');
    }
  };

  const removeComment = async (c) => {
    if (!activeProjectId || !window.confirm('Xóa bình luận này?')) return;
    try {
      await api.delete(`/projects/${activeProjectId}/comments/${c.id}`);
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
    if (!activeProjectId || reactionBusy != null) return;
    setReactionBusy(c.id);
    try {
      const r = await api.put(`/projects/${activeProjectId}/comments/${c.id}/reaction`, { emoji });
      const reactions = r.data || { summary: [], mine: null };
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, reactions } : x)));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi cảm xúc');
    } finally {
      setReactionBusy(null);
    }
  };

  if (!showOnScreen) return <CommentDisplayHiddenBanner />;

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
