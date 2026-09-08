/**
 * Panel bình luận (thread + reactions) dùng chung cho chi tiết CRM và Sản xuất.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Images,
  Link2,
  Ban,
  Loader2,
  Package,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pencil,
  Truck,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { FbCrmAvatar, FbCrmCommentComposer, formatCrmCommentFullDateTime, formatCrmFbRelativeTime } from './crmFbCommentUi';
import { CrmCommentMentionComposer, renderCrmCommentBody } from './crmCommentMentionUi';
import { contentHasMentionAll } from '../lib/crmCommentMentions';
import { FilePreview, FileUploadButton, uploadFilesBatch } from './FileUpload';
import UploadProgressBubble from './UploadProgressBubble';
import UploadFileLightbox from './UploadFileLightbox';
import CopyableImage, { CommentBubbleContextMenu, copyImageWithToast, copyImagesSequentiallyWithToast, copyImagesWithToast } from './ImageCopyContextMenu';
import { downloadUploadFile, downloadUploadFilesAsZip, publicFileUrl as pubUrl } from '../lib/publicFileUrl';
import { showCopyToast } from '../lib/copyToast';
import { handleCommentFilePaste } from '../lib/chatClipboard';
import { CommentNewNotice, useCommentThreadLive } from './commentThreadLiveUx';
import { isQuoteContractActivityComment, shouldHideQuoteContractComments } from '../lib/hideQuoteContractFromProduction';
import CommentDisplayHiddenBanner, { useCommentShowOnScreenEnabled } from './CommentDisplayHiddenBanner';
import VcHandoverEventsPopup from './VcHandoverEventsPopup';
import MultiDayDatePicker, { formatYmdListVi } from './MultiDayDatePicker';

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

const SYSTEM_FILE_HIDDEN_PREFIX = 'hidden:';

/** File đang hiện (có URL tải) trong tin hệ thống. */
function extractSystemFileLink(text) {
  if (!text) return null;
  const m = text.match(/«([^»|]+)\|([^»]+)»/);
  if (!m) return null;
  const url = m[2];
  if (String(url).startsWith(SYSTEM_FILE_HIDDEN_PREFIX)) return null;
  return { label: m[1], url };
}

/** File đã ẩn nhưng còn URL để hiện lại. */
function extractHiddenSystemFileLink(text) {
  if (!text) return null;
  const m = text.match(/«([^»|]+)\|hidden:([^»]+)»/);
  if (!m) return null;
  return { label: m[1], url: m[2] };
}

/** Ẩn link tải — giữ URL dạng «tên|hidden:url» để hiện lại được. */
function hideSystemFileLinksInBody(text) {
  if (!text) return text;
  return String(text)
    .replace(/«([^»|]+)\|(?!hidden:)([^»]+)»/g, `«$1|${SYSTEM_FILE_HIDDEN_PREFIX}$2»`)
    .trim();
}

/** Hiện lại link tải từ «tên|hidden:url». */
function unhideSystemFileLinksInBody(text) {
  if (!text) return text;
  return String(text)
    .replace(/«([^»|]+)\|hidden:([^»]+)»/g, '«$1|$2»')
    .trim();
}

function isCommentOwner(comment, user) {
  const uid = user?.userId || user?.id;
  if (!uid || !comment) return false;
  return String(comment.user_id || '') === String(uid);
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
      if (String(url).startsWith(SYSTEM_FILE_HIDDEN_PREFIX)) {
        parts.push(
          <strong key={m.index} className="font-semibold text-[#65676b]">
            {`«${label}»`}
            <span className="font-normal text-[11px]"> (đã ẩn)</span>
          </strong>,
        );
      } else {
        const href = pubUrl(url);
        if (isImageFileName(label)) {
          parts.push(
            <a key={m.index} href={href} target="_blank" rel="noopener noreferrer"
              className="font-semibold text-blue-600 hover:underline">
              {`«${label}»`}
            </a>,
          );
        } else {
          parts.push(
            <button
              key={m.index}
              type="button"
              className="font-semibold text-blue-600 hover:underline inline p-0 m-0 bg-transparent border-0 cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                downloadUploadFile(url, label || 'tai-lieu').catch((err) => {
                  alert(err?.message || 'Không tải được file');
                });
              }}
            >
              {`«${label}»`}
            </button>,
          );
        }
      }
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

function commentImageUrls(comment) {
  return commentAttachmentList(comment?.attachments)
    .filter(isCommentImage)
    .map((img) => img.url)
    .filter(Boolean);
}

function isCommentVideo(att) {
  const mime = att.mime || '';
  const name = att.name || '';
  return mime.startsWith('video/') || /\.(mp4|mov|mkv|avi|webm)$/i.test(name);
}

const COMMENT_URL_IN_TEXT = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;

/** Gom ảnh/video, tệp, link từ toàn bộ thread bình luận (giống panel chi tiết Messenger). */
function collectCommentMediaBundle(comments, getBody) {
  const images = [];
  const videos = [];
  const files = [];
  const links = new Map();
  const seenAtt = new Set();

  const pushLink = (url, label) => {
    if (!url || links.has(url)) return;
    links.set(url, { url, label: label || url });
  };

  for (const c of comments || []) {
    const rawBody = typeof getBody === 'function' ? (getBody(c) || '') : (c?.body || '');

    if (isSystemComment(rawBody)) {
      const fileLink = extractSystemFileLink(rawBody);
      if (fileLink?.url) {
        const key = `sys:${fileLink.url}`;
        if (!seenAtt.has(key)) {
          seenAtt.add(key);
          const att = { url: fileLink.url, name: fileLink.label, mime: '' };
          if (isImageFileName(fileLink.label)) images.push(att);
          else if (/\.(mp4|mov|mkv|avi|webm)$/i.test(fileLink.label || '')) videos.push(att);
          else files.push(att);
        }
      }
    } else {
      const matches = String(rawBody).match(COMMENT_URL_IN_TEXT);
      if (matches) matches.forEach((u) => pushLink(u, u));
    }

    for (const att of commentAttachmentList(c.attachments)) {
      const key = `att:${att.url}`;
      if (seenAtt.has(key)) continue;
      seenAtt.add(key);
      if (isCommentImage(att)) images.push(att);
      else if (isCommentVideo(att)) videos.push(att);
      else if (!(att.mime || '').startsWith('audio/')) files.push(att);
    }
  }

  return {
    images,
    videos,
    files,
    links: [...links.values()],
  };
}

function CommentMediaDetailPanel({ mediaBundle, section, onSectionChange, onOpenImage, onClose }) {
  const [videoPreview, setVideoPreview] = useState(null);
  const [dlBusyUrl, setDlBusyUrl] = useState(null);

  const mediaCount = (mediaBundle?.images?.length || 0) + (mediaBundle?.videos?.length || 0);
  const fileCount = mediaBundle?.files?.length || 0;
  const linkCount = mediaBundle?.links?.length || 0;
  const mediaGridItems = useMemo(
    () => [...(mediaBundle?.images || []), ...(mediaBundle?.videos || [])],
    [mediaBundle?.images, mediaBundle?.videos],
  );

  const tabs = [
    { id: 'media', label: 'Ảnh/Video', count: mediaCount, Icon: ImageIcon },
    { id: 'files', label: 'Tệp', count: fileCount, Icon: FileText },
    { id: 'links', label: 'Link', count: linkCount, Icon: Link2 },
  ];

  const handleDownload = async (file) => {
    if (!file?.url || dlBusyUrl) return;
    setDlBusyUrl(file.url);
    try {
      await downloadUploadFile(file.url, file.name || 'tai-lieu');
    } catch (err) {
      alert(err?.message || 'Không tải được tệp');
    } finally {
      setDlBusyUrl(null);
    }
  };

  return (
    <>
      {/* Panel phụ "Ảnh, tệp & link" — ẩn dưới lg: 280px cố định sẽ bóp vùng bình luận
          (nội dung chính) trên màn hẹp. */}
      <aside className="hidden lg:flex w-[280px] shrink-0 flex-col border-l border-[#e4e6eb] bg-slate-100/80 min-h-0 max-h-[min(720px,75vh)] overflow-y-auto [scrollbar-width:thin]">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <p className="text-[12px] font-bold text-slate-700 truncate">Ảnh, tệp & link</p>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Đóng"
            aria-label="Đóng cột chi tiết"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-2 my-2 pb-2">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <p className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Ảnh, tệp & link
            </p>
            <div className="flex border-b border-slate-100 text-[11px] font-semibold shrink-0 overflow-x-auto [scrollbar-width:none]">
              {tabs.map(({ id, label, count, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSectionChange?.(id)}
                  className={`flex-1 min-w-0 px-1 py-2.5 flex flex-col items-center gap-0.5 border-b-2 transition ${
                    section === id
                      ? 'border-violet-600 text-violet-700 bg-violet-50/40'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate w-full text-center leading-tight">
                    {label}
                    {count > 0 ? ` (${count})` : ''}
                  </span>
                </button>
              ))}
            </div>

            <div className="p-2 text-xs">
              {section === 'media' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    {mediaGridItems.slice(0, 48).map((att, i) => {
                      const u = pubUrl(att.url);
                      const isVideo = isCommentVideo(att);
                      if (isVideo) {
                        return (
                          <button
                            key={`${att.url}-${i}`}
                            type="button"
                            onClick={() => setVideoPreview({ ...att, resolvedUrl: u })}
                            className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200 relative"
                          >
                            <video src={u} className="w-full h-full object-cover pointer-events-none" muted playsInline />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white text-lg">▶</span>
                          </button>
                        );
                      }
                      return (
                        <CopyableImage
                          key={`${att.url}-${i}`}
                          src={u}
                          copyUrl={u}
                          fileName={att.name || 'anh.jpg'}
                          alt={att.name || 'ảnh'}
                          className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hover:ring-2 hover:ring-violet-300 transition"
                          imgClassName="w-full h-full object-cover"
                          onDownload={(url, name) => downloadUploadFile(url, name || 'anh.jpg')}
                          onClick={() => onOpenImage?.(u, { title: att.name || 'image', rawPath: att.url })}
                        />
                      );
                    })}
                  </div>
                  {mediaCount === 0 && <p className="text-slate-400 text-center py-8">Chưa có ảnh/video</p>}
                </div>
              )}

              {section === 'files' && (
                <ul className="space-y-1">
                  {(mediaBundle?.files || []).map((f, i) => {
                    const busy = dlBusyUrl === f.url;
                    return (
                      <li key={`${f.url}-${i}`}>
                        <div className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50">
                          <FileText className="h-4 w-4 text-violet-600 shrink-0" />
                          <button
                            type="button"
                            onClick={() => void handleDownload(f)}
                            className="flex-1 min-w-0 truncate text-left text-sm text-slate-700 hover:text-violet-700"
                            title={f.name}
                          >
                            {f.name || 'Tệp'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownload(f)}
                            disabled={!f.url || busy}
                            className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-violet-50 hover:text-violet-700 text-slate-500 flex items-center justify-center transition disabled:opacity-40"
                            title="Tải xuống"
                            aria-label={`Tải xuống ${f.name || 'tệp'}`}
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {fileCount === 0 && <p className="text-slate-400 text-center py-8">Chưa có tệp</p>}
                </ul>
              )}

              {section === 'links' && (
                <ul className="space-y-1">
                  {(mediaBundle?.links || []).map((l) => (
                    <li key={l.url}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-start gap-2 p-2.5 rounded-xl hover:bg-slate-50 text-violet-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span className="break-all">{l.label}</span>
                      </a>
                    </li>
                  ))}
                  {linkCount === 0 && <p className="text-slate-400 text-center py-8">Chưa có link</p>}
                </ul>
              )}
            </div>
          </div>
        </div>
      </aside>

      {videoPreview ? (
        <div className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4">
          <button
            type="button"
            onClick={() => setVideoPreview(null)}
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"
          >
            <X className="h-6 w-6" />
          </button>
          <video
            src={videoPreview.resolvedUrl}
            controls
            autoPlay
            className="max-h-[85vh] max-w-full rounded-lg"
          />
        </div>
      ) : null}
    </>
  );
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

function formatShareExpiry(iso) {
  if (!iso) return 'Không giới hạn';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function shareStorageKey(images) {
  const raw = (images || []).map((img) => String(img.url || '')).join('|');
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) h = Math.imul(h ^ raw.charCodeAt(i), 16777619);
  return `qlcv_share_${(h >>> 0).toString(36)}`;
}

const SHARE_EXPIRE_OPTIONS = [
  { id: '1h', label: '1 giờ' },
  { id: '6h', label: '6 giờ' },
  { id: '1d', label: '1 ngày' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'unlimited', label: 'Không giới hạn' },
  { id: 'custom', label: 'Tự chọn thời điểm' },
];

export function CommentAttachmentsBlock({ attachments, onOpenImage }) {
  const items = useMemo(() => commentAttachmentList(attachments), [attachments]);
  const images = useMemo(() => items.filter(isCommentImage), [items]);
  const otherFiles = useMemo(() => items.filter((f) => !isCommentImage(f)), [items]);

  const localLightboxItems = useMemo(
    () => images.map((img) => ({ url: pubUrl(img.url), title: img.name || 'image', rawPath: img.url })),
    [images],
  );
  const [localOpen, setLocalOpen] = useState(false);
  const [localIndex, setLocalIndex] = useState(0);
  const [dlBusy, setDlBusy] = useState(false);
  const [dlAllBusy, setDlAllBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePreset, setSharePreset] = useState('30d');
  const [shareCustomAt, setShareCustomAt] = useState('');
  const [shareInfo, setShareInfo] = useState(null);

  const shareKey = useMemo(() => shareStorageKey(images), [images]);

  useEffect(() => {
    if (!shareKey) return;
    try {
      const raw = sessionStorage.getItem(shareKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.token) setShareInfo(parsed);
    } catch {
      /* ignore */
    }
  }, [shareKey]);

  const persistShareInfo = (info) => {
    setShareInfo(info);
    try {
      if (info?.token) sessionStorage.setItem(shareKey, JSON.stringify(info));
      else sessionStorage.removeItem(shareKey);
    } catch {
      /* ignore */
    }
  };

  const shareExpireBody = () => {
    if (sharePreset === 'custom') {
      if (!shareCustomAt) throw new Error('Chọn thời điểm hết hạn');
      return { expire_preset: 'custom', expires_at: new Date(shareCustomAt).toISOString() };
    }
    return { expire_preset: sharePreset };
  };

  const copyShareUrl = async (info) => {
    const path = info?.path || (info?.token ? `/s/${info.token}` : '');
    if (!path) throw new Error('Không nhận được link');
    const shareUrl = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showCopyToast('Đã copy link xem — gửi Zalo, ai có link xem được');
    } catch {
      window.prompt('Copy link xem (không cần đăng nhập):', shareUrl);
    }
  };

  if (!items.length) return null;

  const handleDownloadOne = async (url, name) => {
    setDlBusy(true);
    try {
      await downloadUploadFile(url, name || 'tai-lieu');
    } catch (err) {
      alert(err?.message || 'Không tải được file');
    } finally {
      setDlBusy(false);
    }
  };

  const handleDownloadAllImages = async () => {
    if (!images.length) return;
    setDlAllBusy(true);
    try {
      if (images.length === 1) {
        await downloadUploadFile(images[0].url, images[0].name || 'anh.jpg');
      } else {
        await downloadUploadFilesAsZip(
          images.map((img, i) => ({
            url: img.url,
            name: img.name || `anh-${i + 1}`,
            mime: img.mime,
          })),
          `anh-binh-luan-${images.length}.zip`,
        );
      }
    } catch (err) {
      alert(err?.message || 'Không tải được ảnh');
    } finally {
      setDlAllBusy(false);
    }
  };

  const handleCopyFirstImage = async () => {
    if (!images.length || copyBusy) return;
    setCopyBusy(true);
    try {
      await copyImageWithToast(pubUrl(images[0].url) || images[0].url);
    } catch (err) {
      alert(err?.message || 'Không sao chép được ảnh');
    } finally {
      setCopyBusy(false);
    }
  };

  const handleCopyAllImages = async () => {
    if (!images.length || copyBusy) return;
    setCopyBusy(true);
    try {
      await copyImagesWithToast(images.map((img) => pubUrl(img.url) || img.url));
    } catch (err) {
      alert(err?.message || 'Không sao chép được ảnh');
    } finally {
      setCopyBusy(false);
    }
  };

  const handleCopySequentialImages = async () => {
    if (!images.length || copyBusy) return;
    setCopyBusy(true);
    try {
      await copyImagesSequentiallyWithToast(images.map((img) => pubUrl(img.url) || img.url));
    } catch (err) {
      alert(err?.message || 'Không sao chép được ảnh');
    } finally {
      setCopyBusy(false);
    }
  };

  const handleShareViewLink = async () => {
    if (!images.length) return;
    setShareOpen((open) => !open);
  };

  const handleCreateShare = async () => {
    if (!images.length || shareBusy) return;
    setShareBusy(true);
    try {
      const { data } = await api.post('/share/comment-images', {
        images: images.map((img) => ({ url: img.url, name: img.name, mime: img.mime })),
        title: images.length > 1 ? `Ảnh chia sẻ (${images.length} ảnh)` : 'Ảnh chia sẻ',
        ...shareExpireBody(),
      });
      persistShareInfo(data);
      await copyShareUrl(data);
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Không tạo được link xem');
    } finally {
      setShareBusy(false);
    }
  };

  const handleUpdateShareExpiry = async (nextPreset, nextCustomAt = shareCustomAt) => {
    if (!shareInfo?.token || shareBusy) return;
    const preset = nextPreset || sharePreset;
    setSharePreset(preset);
    if (preset === 'custom' && !nextCustomAt) return;
    setShareBusy(true);
    try {
      const body = preset === 'custom'
        ? { expire_preset: 'custom', expires_at: new Date(nextCustomAt).toISOString() }
        : { expire_preset: preset };
      const { data } = await api.patch(`/share/${shareInfo.token}`, body);
      persistShareInfo(data);
      showCopyToast(data?.unlimited ? 'Link không giới hạn thời gian' : `Đã đặt hạn: ${formatShareExpiry(data?.expires_at)}`);
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Không đổi được hạn xem');
    } finally {
      setShareBusy(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!shareInfo?.token || shareBusy) return;
    if (!window.confirm('Vô hiệu hóa link này? Ai đang có link sẽ không xem được nữa.')) return;
    setShareBusy(true);
    try {
      const { data } = await api.post(`/share/${shareInfo.token}/revoke`);
      persistShareInfo(data);
      showCopyToast('Đã vô hiệu hóa link');
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Không vô hiệu hóa được link');
    } finally {
      setShareBusy(false);
    }
  };

  const handleRecreateShare = async () => {
    persistShareInfo(null);
    setShareBusy(true);
    try {
      const { data } = await api.post('/share/comment-images', {
        images: images.map((img) => ({ url: img.url, name: img.name, mime: img.mime })),
        title: images.length > 1 ? `Ảnh chia sẻ (${images.length} ảnh)` : 'Ảnh chia sẻ',
        ...shareExpireBody(),
      });
      persistShareInfo(data);
      await copyShareUrl(data);
    } catch (err) {
      alert(err?.response?.data?.error || err?.message || 'Không tạo được link xem');
    } finally {
      setShareBusy(false);
    }
  };

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
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            {images.map((img, ii) => {
              const href = pubUrl(img.url);
              const allHrefs = images.map((x) => pubUrl(x.url) || x.url);
              return (
                <CopyableImage
                  key={ii}
                  src={href}
                  copyUrl={href}
                  allUrls={allHrefs}
                  fileName={img.name || 'anh.jpg'}
                  alt={img.name || 'image'}
                  className="block"
                  imgClassName="max-h-48 max-w-xs rounded-lg border border-[#e4e6eb] object-cover hover:opacity-90 transition-opacity"
                  onDownload={(url, name) => downloadUploadFile(url, name || 'anh.jpg')}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onOpenImage) return onOpenImage(href, { title: img.name || 'image', rawPath: img.url });
                    setLocalIndex(ii);
                    setLocalOpen(true);
                  }}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={copyBusy}
              title="Sao chép ảnh để dán vào Word, Zalo, chat…"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleCopyFirstImage();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e6eb] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1877f2] hover:bg-[#f0f2f5] disabled:opacity-60"
            >
              {copyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              Sao chép ảnh
            </button>
            {images.length > 1 ? (
              <>
              <button
                type="button"
                disabled={copyBusy}
                title="Ghép thành 1 tấm — copy một lần, dán Zalo một lần ra hết"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleCopyAllImages();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e6eb] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1877f2] hover:bg-[#f0f2f5] disabled:opacity-60"
              >
                {copyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                Sao chép hết {images.length} ảnh
              </button>
              <button
                type="button"
                disabled={copyBusy}
                title="Copy lần lượt từng ảnh riêng để dán nhiều tin Zalo"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleCopySequentialImages();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e6eb] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1877f2] hover:bg-[#f0f2f5] disabled:opacity-60"
              >
                {copyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Images className="h-3.5 w-3.5" />}
                Từng ảnh
              </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={dlAllBusy}
              title="Tải ZIP — mỗi ảnh đúng đuôi .png/.jpg để mở được"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleDownloadAllImages();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e6eb] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1877f2] hover:bg-[#f0f2f5] disabled:opacity-60"
            >
              {dlAllBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {images.length > 1 ? `Tải hết ${images.length} ảnh` : 'Tải ảnh'}
            </button>
            <button
              type="button"
              disabled={shareBusy}
              title="Tạo link xem — chọn hạn, copy, hoặc vô hiệu hóa"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleShareViewLink();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e6eb] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1877f2] hover:bg-[#f0f2f5] disabled:opacity-60"
            >
              {shareBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Link xem
            </button>
          </div>
          {shareOpen ? (
            <div className="rounded-xl border border-[#e4e6eb] bg-[#f7f8fa] px-3 py-2.5 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[9.5rem] flex-1">
                  <span className="mb-1 block text-[11px] font-semibold text-[#65676b]">Hạn xem</span>
                  <select
                    value={sharePreset}
                    disabled={shareBusy}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSharePreset(next);
                      if (shareInfo?.token && !shareInfo.revoked_at && next !== 'custom') {
                        void handleUpdateShareExpiry(next);
                      }
                    }}
                    className="w-full rounded-lg border border-[#e4e6eb] bg-white px-2 py-1.5 text-[12px] text-[#050505]"
                  >
                    {SHARE_EXPIRE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                {sharePreset === 'custom' ? (
                  <label className="min-w-[11rem] flex-1">
                    <span className="mb-1 block text-[11px] font-semibold text-[#65676b]">Hết hạn lúc</span>
                    <input
                      type="datetime-local"
                      value={shareCustomAt}
                      disabled={shareBusy}
                      onChange={(e) => {
                        const v = e.target.value;
                        setShareCustomAt(v);
                        if (shareInfo?.token && !shareInfo.revoked_at && v) {
                          void handleUpdateShareExpiry('custom', v);
                        }
                      }}
                      className="w-full rounded-lg border border-[#e4e6eb] bg-white px-2 py-1.5 text-[12px] text-[#050505]"
                    />
                  </label>
                ) : null}
              </div>
              {shareInfo?.token && !shareInfo.revoked_at ? (
                <>
                  <p className="text-[12px] text-[#65676b]">
                    {shareInfo.unlimited || !shareInfo.expires_at
                      ? 'Link đang không giới hạn thời gian.'
                      : `Hết hạn: ${formatShareExpiry(shareInfo.expires_at)}`}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={shareBusy}
                      onClick={() => void copyShareUrl(shareInfo)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#1877f2] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#166fe5] disabled:opacity-60"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy link
                    </button>
                    <a
                      href={shareInfo.path || `/s/${shareInfo.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e6eb] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1877f2] hover:bg-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Mở
                    </a>
                    <button
                      type="button"
                      disabled={shareBusy}
                      onClick={() => void handleRevokeShare()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {shareBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                      Vô hiệu hóa
                    </button>
                  </div>
                </>
              ) : shareInfo?.revoked_at ? (
                <>
                  <p className="text-[12px] text-red-600">Link đã bị vô hiệu hóa. Tạo link mới nếu cần gửi tiếp.</p>
                  <button
                    type="button"
                    disabled={shareBusy}
                    onClick={() => void handleRecreateShare()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1877f2] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#166fe5] disabled:opacity-60"
                  >
                    {shareBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Tạo link mới
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={shareBusy || (sharePreset === 'custom' && !shareCustomAt)}
                  onClick={() => void handleCreateShare()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1877f2] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#166fe5] disabled:opacity-60"
                >
                  {shareBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Tạo & copy link
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}
      {otherFiles.length > 0 && (
        <div className="space-y-2">
          {otherFiles.map((f, fi) => {
            const v = fileVisual(f.name, f.mime);
            const sizeText = humanFileSize(f.size);
            return (
              <button
                key={fi}
                type="button"
                disabled={dlBusy}
                className={[
                  'w-full text-left flex items-center gap-3 rounded-2xl',
                  'bg-white px-3 py-2.5',
                  'border border-[#e4e6eb]',
                  'shadow-sm',
                  'hover:shadow-md hover:-translate-y-[1px]',
                  'hover:border-[#cbd5e1]',
                  'transition-[transform,box-shadow,border-color] duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1877f2]/30',
                  'disabled:opacity-60 disabled:pointer-events-none',
                ].join(' ')}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleDownloadOne(f.url, f.name || 'tai-lieu');
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
                  {dlBusy ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Download className="h-4 w-4 text-white" />}
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
    const files = Array.from(rawFiles || []).filter(Boolean).slice(0, 50);
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

function formatVcDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** ISO / date string → giá trị input datetime-local (local time). */
function toDatetimeLocalValue(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s;
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Bình luận tương tác bàn giao VC/LĐ (chọn công ty + ngày → CRM/Xưởng tự xác nhận, chờ VC/LĐ). */
function VcHandoverCard({ comment, user, onSelect, onSchedule, onConfirm, onReschedule }) {
  const md = comment?.metadata || {};
  const state = md.state || 'awaiting_company';
  const selfUid = String(user?.userId || user?.id || '');
  // Sale CRM phụ trách deal (assigned_to / lead_owner) hoặc admin được chọn công ty + ngày.
  const saleIds = (md.sale_user_ids || []).map(String);
  const canSale = saleIds.includes(selfUid);
  const canAct = canSale || isAdminLike(user);
  // Người chịu trách nhiệm CRM chính (assigned_to) hoặc admin được sửa ngày đề xuất.
  const crmResponsibleId = String(md.crm_responsible_user_id || saleIds[0] || '');
  const canEditAsCrmOwner = (!!crmResponsibleId && selfUid === crmResponsibleId) || isAdminLike(user);
  // Chỉ đúng người cấu hình xác nhận mới được tích (fallback phụ trách dự án).
  const canConfirmProduction = selfUid === String(md.production_confirm_user_id || md.production_person_id || '');
  const canConfirmLogistics = selfUid === String(md.logistics_confirm_user_id || md.logistics_person_id || '');

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [externalName, setExternalName] = useState('');
  const [selectNotes, setSelectNotes] = useState('');
  const [vcNotes, setVcNotes] = useState('');
  const isExternalCompany = companyId === '__external__';
  const skipLogisticsModule = !!md.skip_logistics_module;
  const [pickupAt, setPickupAt] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [vcArriveAt, setVcArriveAt] = useState('');
  const [installDate, setInstallDate] = useState('');
  const [installOccurrenceDates, setInstallOccurrenceDates] = useState([]);
  const [installAddress, setInstallAddress] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [eventsPopupOpen, setEventsPopupOpen] = useState(false);
  const [eventsPopupFocus, setEventsPopupFocus] = useState(null);
  /** null | 'pickup' | 'arrive' | 'install' | 'both' — mở lịch để chọn ngày cho thẻ */
  const [datePickTarget, setDatePickTarget] = useState(null);
  /** true = đang sửa ngày đề xuất sau khi đã bàn giao (awaiting_confirm) */
  const [rescheduleMode, setRescheduleMode] = useState(false);

  const defaultArriveLocal = useCallback((pickupLocal, installLocal) => {
    const day = String(installLocal || pickupLocal || '').slice(0, 10);
    if (!day) return '';
    return `${day}T11:00`;
  }, []);

  const openEventsCalendar = useCallback((dateIso) => {
    setRescheduleMode(false);
    setDatePickTarget(null);
    setEventsPopupFocus(
      dateIso || pickupAt || vcArriveAt || md.pickup_at || md.vc_arrive_at || installDate || md.install_date || null,
    );
    setEventsPopupOpen(true);
  }, [pickupAt, vcArriveAt, installDate, md.pickup_at, md.vc_arrive_at, md.install_date]);

  const openDatePickCalendar = useCallback((target) => {
    setRescheduleMode(false);
    setDatePickTarget(target);
    const focus = target === 'install'
      ? (installDate || vcArriveAt || pickupAt || md.install_date || md.vc_arrive_at || md.pickup_at || null)
      : target === 'arrive'
        ? (vcArriveAt || installDate || pickupAt || md.vc_arrive_at || md.install_date || md.pickup_at || null)
        : (pickupAt || md.pickup_at || vcArriveAt || installDate || md.install_date || null);
    setEventsPopupFocus(focus);
    setEventsPopupOpen(true);
  }, [pickupAt, vcArriveAt, installDate, md.pickup_at, md.vc_arrive_at, md.install_date]);

  const openRescheduleCalendar = useCallback(() => {
    if (md.pickup_at) setPickupAt(toDatetimeLocalValue(md.pickup_at));
    if (md.vc_arrive_at) setVcArriveAt(toDatetimeLocalValue(md.vc_arrive_at));
    const occ = Array.isArray(md.install_occurrence_dates)
      ? md.install_occurrence_dates.map((d) => String(d).slice(0, 10)).filter(Boolean).sort()
      : [];
    if (md.install_date) setInstallDate(toDatetimeLocalValue(md.install_date));
    else if (md.pickup_at) {
      const day = toDatetimeLocalValue(md.pickup_at).slice(0, 10);
      setInstallDate(`${day}T14:00`);
      if (!md.vc_arrive_at) setVcArriveAt(`${day}T11:00`);
    }
    if (occ.length) setInstallOccurrenceDates(occ);
    else {
      const day = toDatetimeLocalValue(md.install_date || md.pickup_at || '').slice(0, 10);
      setInstallOccurrenceDates(day ? [day] : []);
    }
    setRescheduleMode(true);
    setDatePickTarget('both');
    setEventsPopupFocus(md.pickup_at || md.vc_arrive_at || md.install_date || null);
    setEventsPopupOpen(true);
  }, [md.pickup_at, md.vc_arrive_at, md.install_date]);

  const canEditProposedDates = state === 'awaiting_confirm'
    && canEditAsCrmOwner
    && typeof onReschedule === 'function'
    && !(Array.isArray(md.event_ids) && md.event_ids.length > 0)
    && !md.event_id;

  const formatDatetimeLocalLabel = (v) => {
    if (!v) return '';
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return String(v);
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  };

  const timePart = (v) => {
    const m = String(v || '').match(/T(\d{2}:\d{2})/);
    return m ? m[1] : '';
  };
  const setTimeOnLocal = (v, hhmm) => {
    const day = String(v || '').slice(0, 10);
    if (!day || !hhmm) return v;
    return `${day}T${hhmm}`;
  };
  const applyInstallOccurrenceDates = (dates, timeHHmm) => {
    const pickupDay = String(pickupAt || '').slice(0, 10);
    const time = timeHHmm || timePart(installDate) || '14:00';
    const sorted = [...(dates || [])]
      .map((d) => String(d || '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!pickupDay || d >= pickupDay))
      .sort();
    setInstallOccurrenceDates(sorted);
    if (!sorted.length) {
      setInstallDate('');
      return sorted;
    }
    setInstallDate(`${sorted[0]}T${time}`);
    setVcArriveAt((prev) => {
      if (!prev) return defaultArriveLocal(pickupAt, `${sorted[0]}T${time}`);
      const prevDay = String(prev).slice(0, 10);
      if (prevDay > sorted[sorted.length - 1]) return defaultArriveLocal(pickupAt, `${sorted[0]}T${time}`);
      return prev;
    });
    return sorted;
  };
  const resolvedInstallDates = () => {
    if (installOccurrenceDates.length) return [...installOccurrenceDates].sort();
    const day = String(installDate || '').slice(0, 10);
    return day ? [day] : [];
  };

  const eventIdsForPopup = useMemo(() => {
    const ids = [];
    if (Array.isArray(md.event_ids)) ids.push(...md.event_ids);
    if (md.event_id) ids.push(md.event_id);
    if (md.sx_event_id) ids.push(md.sx_event_id);
    if (md.transport_event_id) ids.push(md.transport_event_id);
    if (md.install_event_id) ids.push(md.install_event_id);
    return [...new Set(ids.filter(Boolean).map(String))];
  }, [md.event_ids, md.event_id, md.sx_event_id, md.transport_event_id, md.install_event_id]);

  useEffect(() => {
    if (state !== 'awaiting_company' || !canAct) return;
    let active = true;
    api.get('/companies', { params: { for_module: 'logistics' } })
      .then((r) => {
        if (!active) return;
        const list = r.data?.companies || r.data || [];
        const arr = Array.isArray(list) ? list : [];
        setCompanies(arr);
      })
      .catch(() => { if (active) setCompanies([]); });
    return () => { active = false; };
  }, [state, canAct]);

  // Prefill từ kế hoạch SX & VC/LĐ Sale đã điền trước đó — vẫn cho sửa trước khi bàn giao.
  const planVcNotes = md.plan_vc_notes || md.vc_notes || '';
  const planCompanyId = md.plan_logistics_company_id ? String(md.plan_logistics_company_id) : '';
  const planOccurrenceDates = useMemo(() => (
    Array.isArray(md.plan_install_occurrence_dates)
      ? [...new Set(md.plan_install_occurrence_dates.map((d) => String(d || '').slice(0, 10)).filter(Boolean))].sort()
      : []
  ), [md.plan_install_occurrence_dates]);
  const hasPlanInfo = !!(planCompanyId || planVcNotes || planOccurrenceDates.length);

  useEffect(() => {
    if (state !== 'awaiting_company' || !canAct) return;
    if (planCompanyId) setCompanyId((prev) => (prev ? prev : planCompanyId));
    if (planVcNotes) setVcNotes((prev) => (prev.trim() ? prev : planVcNotes));
    if (planOccurrenceDates.length) {
      setInstallOccurrenceDates((prev) => (prev.length ? prev : planOccurrenceDates));
    }
  }, [state, canAct, planCompanyId, planVcNotes, planOccurrenceDates]);

  // Prefill địa chỉ / lịch từ ĐÚNG project xưởng của thẻ (multi-SX), vẫn cho Sale chỉnh tay.
  useEffect(() => {
    if (state !== 'awaiting_company' || !canAct) return undefined;
    let active = true;
    const pickAddr = (...cands) => {
      for (const c of cands) {
        const s = String(c || '').trim();
        if (s) return s;
      }
      return '';
    };
    const toLocalDay = (raw, hhmm = '14:00') => {
      if (!raw) return '';
      const local = toDatetimeLocalValue(raw);
      if (local) {
        // Ngày thuần (YYYY-MM-DD) → gắn giờ mặc định
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).slice(0, 10)) && !String(raw).includes('T')) {
          return `${String(raw).slice(0, 10)}T${hhmm}`;
        }
        return local;
      }
      const day = String(raw).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T${hhmm}` : '';
    };
    const fill = async () => {
      let nextAddr = pickAddr(md.install_address);
      // Panel SX «Ngày lắp đặt» = delivery_date; «Hoàn thiện» = production_finish_date
      let nextInstall = toLocalDay(md.install_date || md.delivery_date, '14:00');
      let nextPickup = toLocalDay(md.pickup_at || md.production_finish_date, '08:00');
      let nextArrive = '';

      // Ưu tiên fetch đúng project_id của thẻ (không lấy linked_project deal = xưởng chính).
      if (md.project_id) {
        try {
          const pr = await api.get(`/production/projects/${md.project_id}`)
            .catch(() => api.get(`/projects/${md.project_id}`))
            .catch(() => api.get(`/logistics/projects/${md.project_id}`));
          const p = pr.data?.project || pr.data || {};
          nextAddr = pickAddr(
            nextAddr,
            p.install_address,
            p.customer?.address,
            (p.crmDeals || p.crm_deals || [])[0]?.install_address,
            (p.crmDeals || p.crm_deals || [])[0]?.customer?.address,
          );
          if (!nextInstall) {
            nextInstall = toLocalDay(p.install_date || p.delivery_date, '14:00');
          }
          if (!nextPickup) {
            nextPickup = toLocalDay(p.pickup_at || p.production_finish_date, '08:00');
          }
          if (p.logistics_company_id) {
            setCompanyId((prev) => (prev ? prev : String(p.logistics_company_id)));
          }
        } catch { /* sale có thể không có quyền SX */ }
      }

      // Địa chỉ: bổ sung từ deal nếu project chưa có (không lấy ngày từ deal/project chính).
      if (comment?.lead_id && !nextAddr) {
        try {
          const lr = await api.get(`/crm/leads/${comment.lead_id}/detail`);
          const deal = lr.data || {};
          nextAddr = pickAddr(
            nextAddr,
            deal.install_address,
            deal.customer?.address,
            deal.customer_address,
          );
        } catch { /* ignore */ }
      }

      if (nextInstall) {
        const day = String(nextInstall).slice(0, 10);
        nextArrive = day ? `${day}T11:00` : '';
      }

      if (!active) return;
      if (nextAddr) setInstallAddress((prev) => (prev.trim() ? prev : nextAddr));
      if (nextPickup) setPickupAt((prev) => (prev.trim() ? prev : nextPickup));
      if (nextInstall) {
        setInstallDate((prev) => (prev.trim() ? prev : nextInstall));
        setInstallOccurrenceDates((prev) => {
          if (prev.length) return prev;
          const day = String(nextInstall).slice(0, 10);
          return day ? [day] : [];
        });
      }
      if (nextArrive) {
        setVcArriveAt((prev) => (prev.trim() ? prev : nextArrive));
      }
    };
    void fill();
    return () => { active = false; };
  }, [
    state,
    canAct,
    comment?.lead_id,
    md.project_id,
    md.install_address,
    md.install_date,
    md.delivery_date,
    md.pickup_at,
    md.production_finish_date,
  ]);

  // Tự điền ghi chú: «Loại - xưởng» từ deal (phân loại CRM) + xưởng SX của dự án.
  useEffect(() => {
    if (state !== 'awaiting_company' || !canAct) return undefined;
    let active = true;
    const buildNotes = (loai, xuong) => {
      const parts = [loai, xuong].map((s) => String(s || '').trim()).filter(Boolean);
      return parts.length ? parts.join(' - ') : '';
    };
    const fill = async () => {
      let loai = md.lead_type_name || '';
      let xuong = md.workshop_company_name || '';
      if ((!loai || !xuong) && comment?.lead_id) {
        try {
          const lr = await api.get(`/crm/leads/${comment.lead_id}/detail`);
          const deal = lr.data || {};
          if (!loai) loai = deal.lead_type?.name || deal.lead_type_name || '';
          if (!xuong) {
            xuong = deal.sx_pipeline_stage?.company?.short_name
              || deal.sx_pipeline_stage?.company?.name
              || '';
          }
        } catch { /* giữ metadata */ }
      }
      if (!xuong && md.project_id) {
        try {
          const pr = await api.get(`/production/projects/${md.project_id}`);
          const p = pr.data || {};
          xuong = p.company?.short_name || p.company?.name || p.company_name || '';
        } catch { /* sale có thể không có quyền SX */ }
      }
      if (!active) return;
      const next = buildNotes(loai, xuong);
      if (next) setSelectNotes((prev) => (prev.trim() ? prev : next));
    };
    void fill();
    return () => { active = false; };
  }, [
    state,
    canAct,
    comment?.lead_id,
    md.lead_type_name,
    md.workshop_company_name,
    md.project_id,
  ]);

  const run = async (key, fn) => {
    setBusy(key);
    setErr('');
    try {
      await fn();
      return true;
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Có lỗi xảy ra');
      return false;
    } finally {
      setBusy('');
    }
  };

  const projLabel = md.project_name || md.project_code || 'dự án';
  const sxOriginLabel = [md.workshop_company_name, md.workshop_type_name]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="my-2 flex justify-center">
      <div className="w-full max-w-[560px] rounded-2xl border border-orange-200 bg-orange-50/70 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/10 text-orange-600">
            <Truck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-orange-800 leading-tight">
              Bàn giao Lắp đặt
              {sxOriginLabel ? (
                <span className="ml-1.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800 align-middle">
                  {sxOriginLabel}
                </span>
              ) : null}
            </p>
            <p className="text-[11px] text-orange-700/80 leading-tight truncate">Dự án: {projLabel}</p>
          </div>
          <span className="ml-auto shrink-0 text-[10px] text-orange-700/70" title={formatCrmCommentFullDateTime(comment.created_at)}>
            {formatCrmFbRelativeTime(comment.created_at)}
          </span>
        </div>

        {state === 'awaiting_company' && (
          <div className="space-y-2">
            {canAct ? (
              <>
                {hasPlanInfo ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                      Thông tin VC/LĐ đã điền khi lập kế hoạch — CRM chịu trách nhiệm tự xác nhận, bạn vẫn sửa được
                    </p>
                    {md.plan_logistics_company_name ? (
                      <p className="text-[11px] text-emerald-900">
                        Công ty VC/LĐ: <span className="font-semibold">{md.plan_logistics_company_name}</span>
                      </p>
                    ) : null}
                    {planOccurrenceDates.length ? (
                      <p className="text-[11px] text-emerald-900">
                        Ngày lắp dự kiến:{' '}
                        <span className="font-semibold">
                          {planOccurrenceDates.map((d) => d.split('-').reverse().join('/')).join(', ')}
                        </span>
                      </p>
                    ) : null}
                    {planVcNotes ? (
                      <p className="text-[11px] text-emerald-900 whitespace-pre-wrap">
                        Ghi chú cho VC/LĐ: <span className="font-semibold">{planVcNotes}</span>
                      </p>
                    ) : null}
                    <p className="text-[10px] text-emerald-700">
                      Dự án đã nằm ở cột lắp đặt tạm trên bảng VC — bàn giao chỉ chuyển sang cột tiếp nhận, không tạo dự án mới.
                    </p>
                  </div>
                ) : null}
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-600">Công ty VC/LĐ *</span>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="mt-1 w-full h-9 px-2 border border-orange-200 rounded-lg text-[13px] bg-white focus:ring-2 focus:ring-orange-400"
                  >
                    <option value="">— Chọn công ty —</option>
                    <option value="__external__">Công ty lắp đặt bên ngoài (không dùng app)</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                    ))}
                  </select>
                </label>
                {isExternalCompany ? (
                  <div className="space-y-1.5">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-gray-600">Tên công ty thuê ngoài *</span>
                      <input
                        type="text"
                        value={externalName}
                        onChange={(e) => setExternalName(e.target.value)}
                        placeholder="VD: Đội lắp đặt Nguyễn Văn A"
                        className="mt-1 w-full h-9 px-2 border border-amber-300 rounded-lg text-[13px] bg-white focus:ring-2 focus:ring-amber-400"
                      />
                    </label>
                    <p className="text-[11px] text-amber-900/90 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 leading-snug">
                      Không đưa dự án vào bảng Lắp đặt. Sale/xưởng tự cập nhật tiến độ trên lịch sự kiện
                      (Giao hàng xưởng + Lắp đặt) và kanban SX.
                    </p>
                  </div>
                ) : null}
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-600">Ghi chú</span>
                  <textarea
                    value={selectNotes}
                    onChange={(e) => setSelectNotes(e.target.value)}
                    rows={2}
                    placeholder="Loại - xưởng - …"
                    className="mt-1 w-full px-2 py-1.5 border border-orange-200 rounded-lg text-[13px] bg-white focus:ring-2 focus:ring-orange-400 resize-y"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-600">Ghi chú cho bên VC / lắp đặt</span>
                  <textarea
                    value={vcNotes}
                    onChange={(e) => setVcNotes(e.target.value)}
                    rows={2}
                    placeholder="VD: hàng dễ vỡ, gọi trước 30 phút, thang máy nhỏ…"
                    className="mt-1 w-full px-2 py-1.5 border border-orange-200 rounded-lg text-[13px] bg-white focus:ring-2 focus:ring-orange-400 resize-y"
                  />
                </label>
                  <div className="rounded-lg border border-orange-100 bg-white/70 p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-orange-800 flex-1 min-w-0">
                      Thông tin giao / lắp (đồng bộ panel VC + lịch sự kiện)
                    </p>
                    <button
                      type="button"
                      onClick={() => openEventsCalendar(pickupAt || installDate || null)}
                      className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-orange-200 bg-white text-[11px] font-semibold text-orange-700 hover:bg-orange-50"
                      title="Mở lịch sự kiện VC/LĐ"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      Lịch sự kiện
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                    <div className="block min-w-0">
                      <span className="block h-4 text-[11px] font-semibold text-gray-600 leading-4">
                        Ngày nhận hàng *
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openDatePickCalendar('pickup');
                        }}
                        className="mt-1 box-border w-full h-9 px-2 border border-orange-200 rounded-lg text-[13px] leading-9 bg-white text-left hover:border-orange-400 hover:bg-orange-50/50 focus:ring-2 focus:ring-orange-400 inline-flex items-center gap-1.5 cursor-pointer"
                        title="Mở lịch chọn ngày nhận hàng (tự gắn tới nơi LĐ + lắp cùng ngày)"
                      >
                        <Calendar className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                        <span className={`truncate ${pickupAt ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                          {pickupAt ? formatDatetimeLocalLabel(pickupAt) : 'Bấm để mở lịch chọn ngày…'}
                        </span>
                      </button>
                      {pickupAt ? (
                        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-600">
                          <span className="shrink-0">Giờ lấy</span>
                          <input
                            type="time"
                            value={timePart(pickupAt) || '09:00'}
                            onChange={(e) => setPickupAt(setTimeOnLocal(pickupAt, e.target.value))}
                            className="h-7 px-1.5 border border-orange-200 rounded-md bg-white"
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className={`block min-w-0 ${isExternalCompany ? 'opacity-50 pointer-events-none' : ''}`}>
                      <span className="block h-4 text-[11px] font-semibold text-gray-600 leading-4">
                        {isExternalCompany ? 'VC tới nơi LĐ (bỏ qua)' : 'VC tới nơi LĐ'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!pickupAt) {
                            setErr('Chọn ngày nhận hàng trước, rồi mới chọn VC tới nơi LĐ.');
                            return;
                          }
                          openDatePickCalendar('arrive');
                        }}
                        className="mt-1 box-border w-full h-9 px-2 border border-orange-200 rounded-lg text-[13px] leading-9 bg-white text-left hover:border-orange-400 hover:bg-orange-50/50 focus:ring-2 focus:ring-orange-400 inline-flex items-center gap-1.5 cursor-pointer"
                        title="Thời gian xe VC tới địa điểm lắp đặt"
                      >
                        <Calendar className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                        <span className={`truncate ${vcArriveAt ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                          {vcArriveAt ? formatDatetimeLocalLabel(vcArriveAt) : 'Tự điền khi chọn ngày VC'}
                        </span>
                      </button>
                      {vcArriveAt ? (
                        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-600">
                          <span className="shrink-0">Giờ tới</span>
                          <input
                            type="time"
                            value={timePart(vcArriveAt) || '11:00'}
                            onChange={(e) => setVcArriveAt(setTimeOnLocal(vcArriveAt, e.target.value))}
                            className="h-7 px-1.5 border border-orange-200 rounded-md bg-white"
                          />
                        </label>
                      ) : null}
                    </div>
                  </div>
                  <div className={`block min-w-0 ${!pickupAt ? 'opacity-55' : ''}`}>
                      <span className="block h-4 text-[11px] font-semibold text-gray-600 leading-4">
                        Ngày lắp đặt (nhiều ngày)
                      </span>
                      <p className="text-[10px] text-gray-500 mt-0.5 mb-1.5">
                        Bấm chọn từng ngày — liên tiếp (3 ngày) hoặc cách ngày (1, 3, 5). Không trước ngày nhận hàng.
                      </p>
                      <MultiDayDatePicker
                        selectedYmds={installOccurrenceDates}
                        onChange={(dates) => {
                          if (!pickupAt) {
                            setErr('Chọn ngày nhận hàng VC trước, rồi mới chọn ngày lắp đặt.');
                            return;
                          }
                          setErr('');
                          applyInstallOccurrenceDates(dates);
                        }}
                        anchorYmd={installOccurrenceDates[0] || String(installDate || pickupAt || '').slice(0, 10)}
                        minYmd={String(pickupAt || '').slice(0, 10)}
                        hint="Chọn một hoặc nhiều ngày lắp (liên tiếp hoặc ngắt quãng)"
                      />
                      {installOccurrenceDates.length || installDate ? (
                        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-600">
                          <span className="shrink-0">Giờ lắp (mỗi ngày)</span>
                          <input
                            type="time"
                            value={timePart(installDate) || '14:00'}
                            onChange={(e) => {
                              const hhmm = e.target.value;
                              const dates = resolvedInstallDates();
                              if (dates.length) applyInstallOccurrenceDates(dates, hhmm);
                              else setInstallDate(setTimeOnLocal(installDate, hhmm));
                            }}
                            className="h-7 px-1.5 border border-orange-200 rounded-md bg-white"
                          />
                        </label>
                      ) : null}
                  </div>
                  {(pickupAt || installDate || vcArriveAt) ? (
                    <div className="rounded-md border border-orange-100 bg-orange-50/50 px-2 py-1.5 space-y-1">
                      <p className="text-[10px] font-semibold text-orange-800">
                        {isExternalCompany
                          ? 'Thuê ngoài · tạo ngay 2 sự kiện SX (Giao hàng + Lắp đặt), không vào bảng Lắp đặt'
                          : 'Xưởng xác nhận mặc định · 3 sự kiện tạo sau khi VC/LĐ xác nhận'}
                      </p>
                      <div className="space-y-1">
                        <div className="flex items-start gap-1.5 text-[11px] text-gray-800">
                          <span className="shrink-0 mt-0.5 h-4 w-4 rounded bg-violet-100 text-violet-700 text-[9px] font-bold inline-flex items-center justify-center">SX</span>
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight">Giao hàng xưởng</p>
                            <p className="text-[10px] text-gray-500">{pickupAt ? formatDatetimeLocalLabel(pickupAt) : '—'}</p>
                          </div>
                        </div>
                        {!isExternalCompany ? (
                        <div className="flex items-start gap-1.5 text-[11px] text-gray-800">
                          <span className="shrink-0 mt-0.5 h-4 w-4 rounded bg-orange-100 text-orange-700 text-[9px] font-bold inline-flex items-center justify-center">VC</span>
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight">VC tới nơi LĐ</p>
                            <p className="text-[10px] text-gray-500">
                              {vcArriveAt
                                ? formatDatetimeLocalLabel(vcArriveAt)
                                : (pickupAt ? formatDatetimeLocalLabel(pickupAt) : '—')}
                            </p>
                          </div>
                        </div>
                        ) : null}
                        <div className="flex items-start gap-1.5 text-[11px] text-gray-800">
                          <span className="shrink-0 mt-0.5 h-4 w-4 rounded bg-amber-100 text-amber-800 text-[9px] font-bold inline-flex items-center justify-center">LĐ</span>
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight">Lắp đặt</p>
                            <p className="text-[10px] text-gray-500">
                              {resolvedInstallDates().length > 1
                                ? `${resolvedInstallDates().length} ngày: ${formatYmdListVi(resolvedInstallDates())}`
                                : (installDate
                                  ? formatDatetimeLocalLabel(installDate)
                                  : (pickupAt ? formatDatetimeLocalLabel(pickupAt) : '—'))}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <label className="block">
                    <span className="text-[11px] font-semibold text-gray-600">Địa chỉ lắp đặt</span>
                    <textarea
                      value={installAddress}
                      onChange={(e) => setInstallAddress(e.target.value)}
                      rows={2}
                      placeholder="Số nhà, đường, phường…"
                      className="mt-1 w-full px-2 py-1.5 border border-orange-200 rounded-lg text-[13px] bg-white focus:ring-2 focus:ring-orange-400 resize-y"
                    />
                  </label>
                </div>
                {err && <p className="text-[11px] text-red-600">{err}</p>}
                <button
                  type="button"
                  disabled={!companyId || !pickupAt || busy === 'select' || (isExternalCompany && !externalName.trim())}
                  onClick={() => {
                    if (!isExternalCompany && vcArriveAt && pickupAt) {
                      const vcDay = String(pickupAt).slice(0, 10);
                      const arriveDay = String(vcArriveAt).slice(0, 10);
                      if (arriveDay < vcDay) {
                        setErr('VC tới nơi LĐ phải bằng hoặc sau ngày nhận hàng.');
                        return;
                      }
                    }
                    if (!isExternalCompany && vcArriveAt && installDate) {
                      const arriveDay = String(vcArriveAt).slice(0, 10);
                      const installDay = String(installDate).slice(0, 10);
                      if (arriveDay > installDay) {
                        setErr('VC tới nơi LĐ phải bằng hoặc trước ngày lắp đặt.');
                        return;
                      }
                    }
                    const arriveLocal = isExternalCompany
                      ? null
                      : (vcArriveAt || defaultArriveLocal(pickupAt, installDate));
                    const occDates = resolvedInstallDates();
                    run('select', () => onSelect(comment.id, {
                    logistics_company_id: isExternalCompany ? null : companyId,
                    skip_logistics_module: isExternalCompany,
                    external_company_name: isExternalCompany ? externalName.trim() : null,
                    notes: selectNotes.trim() || null,
                    vc_notes: vcNotes.trim() || null,
                    pickup_at: new Date(pickupAt).toISOString(),
                    vc_arrive_at: arriveLocal ? new Date(arriveLocal).toISOString() : null,
                    install_date: installDate ? new Date(installDate).toISOString() : null,
                    install_occurrence_dates: occDates,
                    install_address: installAddress.trim() || null,
                  }));
                  }}
                  className="w-full h-9 rounded-lg bg-orange-600 text-white text-[13px] font-semibold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy === 'select' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  {isExternalCompany ? 'Ghi nhận thuê ngoài' : 'Chọn & bàn giao'}
                </button>
              </>
            ) : (
              <p className="text-[12px] text-orange-700/90">
                Chỉ Sale CRM phụ trách deal hoặc admin mới được chọn công ty VC/LĐ và ngày lấy hàng.
              </p>
            )}
          </div>
        )}

        {state === 'awaiting_date' && (
          <div className="space-y-2">
            <p className="text-[12px] text-gray-700">
              Đã chọn: <strong>{md.logistics_company_name}</strong>
            </p>
            {md.select_notes ? (
              <p className="text-[12px] text-gray-600 bg-white/80 border border-orange-100 rounded-lg px-2 py-1.5">
                <span className="text-gray-500">Ghi chú:</span> {md.select_notes}
              </p>
            ) : null}
            {canAct ? (
              <>
                <div className="block">
                  <span className="text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Ngày lấy hàng *</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openDatePickCalendar('pickup');
                    }}
                    className="mt-1 w-full h-9 px-2 border border-orange-200 rounded-lg text-[13px] bg-white text-left hover:border-orange-400 hover:bg-orange-50/50 focus:ring-2 focus:ring-orange-400 inline-flex items-center gap-1.5 cursor-pointer"
                    title="Mở lịch sự kiện để chọn ngày lấy hàng"
                  >
                    <Calendar className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                    <span className={`truncate ${pickupAt ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                      {pickupAt ? formatDatetimeLocalLabel(pickupAt) : 'Bấm để mở lịch chọn ngày…'}
                    </span>
                  </button>
                </div>
                <input
                  type="text"
                  value={pickupNotes}
                  onChange={(e) => setPickupNotes(e.target.value)}
                  placeholder="Ghi chú (tuỳ chọn)"
                  className="w-full h-9 px-2 border border-orange-200 rounded-lg text-[13px] bg-white focus:ring-2 focus:ring-orange-400"
                />
                {err && <p className="text-[11px] text-red-600">{err}</p>}
                <button
                  type="button"
                  disabled={!pickupAt || busy === 'schedule'}
                  onClick={() => run('schedule', () => onSchedule(comment.id, { pickup_at: new Date(pickupAt).toISOString(), pickup_notes: pickupNotes }))}
                  className="w-full h-9 rounded-lg bg-sky-600 text-white text-[13px] font-semibold hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                  Lưu ngày & chờ xác nhận
                </button>
              </>
            ) : (
              <p className="text-[12px] text-orange-700/90">
                Chỉ Sale CRM phụ trách deal hoặc admin mới được chọn ngày lấy hàng.
              </p>
            )}
          </div>
        )}

        {(state === 'awaiting_confirm' || state === 'done') && (
          <div className="space-y-2">
            <div className="rounded-lg bg-white border border-orange-100 px-3 py-2 text-[12px] text-gray-700 space-y-0.5">
              <p>
                <span className="text-gray-500">Công ty:</span> <strong>{md.logistics_company_name}</strong>
                {skipLogisticsModule ? (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                    Bên ngoài · không vào bảng Lắp đặt
                  </span>
                ) : null}
              </p>
              {md.select_notes ? (
                <p><span className="text-gray-500">Ghi chú:</span> {md.select_notes}</p>
              ) : null}
              {md.vc_notes || md.plan_vc_notes ? (
                <p className="whitespace-pre-wrap">
                  <span className="text-gray-500">Ghi chú cho VC/LĐ:</span>{' '}
                  <strong>{md.vc_notes || md.plan_vc_notes}</strong>
                </p>
              ) : null}
              <p><span className="text-gray-500">Ngày nhận hàng:</span> <strong>{formatVcDateTime(md.pickup_at)}</strong></p>
              {!skipLogisticsModule && md.vc_arrive_at ? (
                <p><span className="text-gray-500">VC tới nơi LĐ:</span> <strong>{formatVcDateTime(md.vc_arrive_at)}</strong></p>
              ) : null}
              {(Array.isArray(md.install_occurrence_dates) && md.install_occurrence_dates.length > 1) ? (
                <p>
                  <span className="text-gray-500">Ngày lắp đặt:</span>{' '}
                  <strong>{md.install_occurrence_dates.length} ngày: {formatYmdListVi(md.install_occurrence_dates)}</strong>
                </p>
              ) : md.install_date ? (
                <p><span className="text-gray-500">Ngày lắp đặt:</span> <strong>{formatVcDateTime(md.install_date)}</strong></p>
              ) : null}
              <p className="text-[11px] text-orange-700/80 pt-0.5">
                {skipLogisticsModule
                  ? 'Đối tác không dùng app. Sale/xưởng tự cập nhật tiến độ trên lịch sự kiện (Giao hàng xưởng + Lắp đặt) và kéo cột kanban SX khi xong.'
                  : 'CRM chịu trách nhiệm và Xưởng đã xác nhận mặc định. Chỉ người cấu hình xác nhận VC/LĐ được bấm.'}
                {!skipLogisticsModule && state === 'awaiting_confirm' && !(Array.isArray(md.event_ids) && md.event_ids.length)
                  ? ' Sau khi VC/LĐ xác nhận, hệ thống mới tạo 3 sự kiện trên lịch.'
                  : null}
              </p>
              <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => openEventsCalendar(md.pickup_at || md.install_date || null)}
                  className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 text-[12px] font-semibold text-orange-800 hover:bg-orange-100"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  {md.events_mode === 'external' || (skipLogisticsModule && Array.isArray(md.event_ids) && md.event_ids.length)
                    ? 'Mở lịch (giao + lắp)'
                    : md.events_mode === 'triple' || (Array.isArray(md.event_ids) && md.event_ids.length >= 3)
                    ? 'Mở lịch (3 sự kiện)'
                    : md.events_mode === 'split'
                      ? 'Mở lịch VC/LĐ'
                      : state === 'awaiting_confirm'
                        ? 'Xem lịch đề xuất'
                        : 'Mở lịch sự kiện'}
                </button>
                {canEditProposedDates ? (
                  <button
                    type="button"
                    disabled={busy === 'reschedule'}
                    onClick={() => openRescheduleCalendar()}
                    className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 text-[12px] font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                    title="Sửa ngày nhận hàng / lắp đặt đề xuất"
                  >
                    {busy === 'reschedule' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                    Sửa ngày
                  </button>
                ) : null}
              </div>
            </div>
            {state === 'done' ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {skipLogisticsModule
                  ? `Đã ghi nhận thuê lắp đặt bên ngoài — ngày ${formatVcDateTime(md.pickup_at)}. Cập nhật tiến độ trên lịch / kanban SX.`
                  : `Đã xác nhận giữa Xưởng và VC/LĐ — ngày ${formatVcDateTime(md.pickup_at)} giao nhận hàng.`}
              </div>
            ) : skipLogisticsModule ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900">
                Thuê ngoài — không chờ xác nhận VC/LĐ. Tự cập nhật tiến độ trên lịch sự kiện và kanban SX.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    side: 'crm',
                    label: 'CRM',
                    personName: md.crm_responsible_user_name,
                    confirmed: md.confirmed_crm || { auto: true },
                    can: false,
                  },
                  {
                    side: 'production',
                    label: 'Xưởng (SX)',
                    personName: md.production_confirm_user_name || md.production_person_name,
                    confirmed: md.confirmed_production,
                    can: canConfirmProduction,
                  },
                  {
                    side: 'logistics',
                    label: 'VC/LĐ',
                    personName: md.logistics_confirm_user_name || md.logistics_person_name,
                    confirmed: md.confirmed_logistics,
                    can: canConfirmLogistics,
                  },
                ].map((s) => (
                  <div
                    key={s.side}
                    className={`rounded-lg border px-2 py-2 text-center ${
                      s.confirmed
                        ? 'border-emerald-300 bg-emerald-100'
                        : 'border-orange-100 bg-white'
                    }`}
                  >
                    <p className={`text-[11px] font-semibold ${s.confirmed ? 'text-emerald-800' : 'text-gray-600'}`}>{s.label}</p>
                    {s.personName ? (
                      <p className={`text-[10px] mb-1 truncate ${s.confirmed ? 'text-emerald-700 font-semibold' : 'text-gray-500'}`} title={s.personName}>{s.personName}</p>
                    ) : (
                      <p className="text-[10px] text-gray-400 mb-1">
                        {s.side === 'crm' ? 'Người chịu trách nhiệm CRM' : 'Chưa gán phụ trách'}
                      </p>
                    )}
                    {s.confirmed ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {s.confirmed?.auto ? 'Đã xác nhận (mặc định)' : 'Đã xác nhận'}
                      </span>
                    ) : s.can ? (
                      <button
                        type="button"
                        disabled={busy === `confirm-${s.side}`}
                        onClick={() => run(`confirm-${s.side}`, () => onConfirm(comment.id, s.side))}
                        className="w-full h-8 rounded-lg bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {busy === `confirm-${s.side}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Xác nhận
                      </button>
                    ) : (
                      <span className="text-[11px] text-gray-400">Chờ xác nhận</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {err && <p className="text-[11px] text-red-600">{err}</p>}
          </div>
        )}
      </div>

      {eventsPopupOpen && (
        <VcHandoverEventsPopup
          leadId={comment?.lead_id || null}
          projectId={md.project_id || null}
          companyId={companyId || md.logistics_company_id || md.company_id || null}
          eventIds={eventIdsForPopup}
          focusDate={eventsPopupFocus || md.pickup_at || md.vc_arrive_at || md.install_date || null}
          pickMode={!!datePickTarget}
          pickTarget={datePickTarget === 'both' || rescheduleMode ? 'both' : (datePickTarget || 'both')}
          anchorPickupAt={
            pickupAt
            || (md.pickup_at ? toDatetimeLocalValue(md.pickup_at) : null)
            || null
          }
          anchorArriveAt={
            vcArriveAt
            || (md.vc_arrive_at ? toDatetimeLocalValue(md.vc_arrive_at) : null)
            || null
          }
          anchorInstallAt={
            installDate
            || (md.install_date ? toDatetimeLocalValue(md.install_date) : null)
            || null
          }
          anchorInstallOccurrenceDates={
            installOccurrenceDates.length
              ? installOccurrenceDates
              : (Array.isArray(md.install_occurrence_dates) ? md.install_occurrence_dates : [])
          }
          onPickDate={(local) => {
            if (rescheduleMode) {
              // Fallback single-date trong chế độ sửa → coi là VC + tới nơi + lắp cùng ngày
              const day = String(local).slice(0, 10);
              const nextPickup = local;
              const nextArrive = `${day}T11:00`;
              const nextInstall = `${day}T14:00`;
              void (async () => {
                const ok = await run('reschedule', () => onReschedule(comment.id, {
                  pickup_at: new Date(nextPickup).toISOString(),
                  vc_arrive_at: new Date(nextArrive).toISOString(),
                  install_date: new Date(nextInstall).toISOString(),
                  install_occurrence_dates: [day],
                }));
                if (!ok) return;
                setPickupAt(nextPickup);
                setVcArriveAt(nextArrive);
                setInstallDate(nextInstall);
                setInstallOccurrenceDates([day]);
                setEventsPopupOpen(false);
                setEventsPopupFocus(null);
                setDatePickTarget(null);
                setRescheduleMode(false);
              })();
              return;
            }
            if (datePickTarget === 'install') {
              const installDay = local ? String(local).slice(0, 10) : null;
              applyInstallOccurrenceDates([installDay], timePart(local) || '14:00');
            } else if (datePickTarget === 'arrive') {
              const vcDay = pickupAt ? String(pickupAt).slice(0, 10) : null;
              const arriveDay = local ? String(local).slice(0, 10) : null;
              const installDay = installDate ? String(installDate).slice(0, 10) : null;
              if (!vcDay) {
                alert('Chọn ngày nhận hàng trước, rồi mới chọn VC tới nơi LĐ.');
                return;
              }
              if (arriveDay && arriveDay < vcDay) {
                alert('VC tới nơi LĐ phải bằng hoặc sau ngày nhận hàng.');
                return;
              }
              if (installDay && arriveDay && arriveDay > installDay) {
                alert('VC tới nơi LĐ phải bằng hoặc trước ngày lắp đặt.');
                return;
              }
              setVcArriveAt(local);
            } else {
              // Fallback: chỉ VC → tự gắn tới nơi 11:00 + lắp 14:00 cùng ngày
              setPickupAt(local);
              const day = String(local).slice(0, 10);
              setVcArriveAt(`${day}T11:00`);
              setInstallDate(`${day}T14:00`);
              setInstallOccurrenceDates([day]);
            }
            setEventsPopupOpen(false);
            setEventsPopupFocus(null);
            setDatePickTarget(null);
            setRescheduleMode(false);
          }}
          onPickDates={({ pickupAt: p, installAt: i, vcArriveAt: a, installOccurrenceDates: occIn }) => {
            const nextArrive = a || defaultArriveLocal(p, i);
            const occ = (Array.isArray(occIn) && occIn.length
              ? occIn
              : (i ? [String(i).slice(0, 10)] : [])
            ).map((d) => String(d).slice(0, 10)).filter(Boolean).sort();
            if (rescheduleMode) {
              if (!p) {
                alert('Chọn ngày nhận hàng VC.');
                return;
              }
              const nextInstall = i || (() => {
                const day = String(p).slice(0, 10);
                return `${day}T14:00`;
              })();
              void (async () => {
                const ok = await run('reschedule', () => onReschedule(comment.id, {
                  pickup_at: new Date(p).toISOString(),
                  vc_arrive_at: nextArrive ? new Date(nextArrive).toISOString() : null,
                  install_date: new Date(nextInstall).toISOString(),
                  install_occurrence_dates: occ.length ? occ : [String(nextInstall).slice(0, 10)],
                }));
                if (!ok) return;
                setPickupAt(p);
                setVcArriveAt(nextArrive);
                setInstallDate(nextInstall);
                setInstallOccurrenceDates(occ.length ? occ : [String(nextInstall).slice(0, 10)]);
                setEventsPopupOpen(false);
                setEventsPopupFocus(null);
                setDatePickTarget(null);
                setRescheduleMode(false);
              })();
              return;
            }
            if (p) {
              setPickupAt(p);
              if (i) {
                setInstallDate(i);
                setInstallOccurrenceDates(occ.length ? occ : [String(i).slice(0, 10)].filter(Boolean));
              } else {
                const day = String(p).slice(0, 10);
                setInstallDate(`${day}T14:00`);
                setInstallOccurrenceDates(occ.length ? occ : [day]);
              }
              setVcArriveAt(nextArrive || defaultArriveLocal(p, i));
            } else if (i) {
              setInstallDate(i);
              setInstallOccurrenceDates(occ.length ? occ : [String(i).slice(0, 10)].filter(Boolean));
              if (a) setVcArriveAt(a);
            } else if (a) {
              setVcArriveAt(a);
            }
            setEventsPopupOpen(false);
            setEventsPopupFocus(null);
            setDatePickTarget(null);
            setRescheduleMode(false);
          }}
          onClose={() => {
            setEventsPopupOpen(false);
            setEventsPopupFocus(null);
            setDatePickTarget(null);
            setRescheduleMode(false);
          }}
        />
      )}
    </div>
  );
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
  onHideSystemDocument,
  onUnhideSystemDocument,
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
  onVcSelect,
  onVcSchedule,
  onVcConfirm,
  onVcReschedule,
}) {
  const selfUid = user?.userId || user?.id;
  const commentsByParent = useMemo(() => groupByParent(comments), [comments]);
  const [rightOpen, setRightOpen] = useState(false);
  const [mediaSection, setMediaSection] = useState('media');

  const mediaBundle = useMemo(
    () => collectCommentMediaBundle(comments, getBody),
    [comments, getBody],
  );

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
  const [commentCtxMenu, setCommentCtxMenu] = useState(null);

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

      if (c.comment_type === 'vc_handover' && depth === 0 && onVcSelect) {
        return (
          <VcHandoverCard
            key={c.id}
            comment={c}
            user={user}
            onSelect={onVcSelect}
            onSchedule={onVcSchedule}
            onConfirm={onVcConfirm}
            onReschedule={onVcReschedule}
          />
        );
      }

      const isSys = isSystemComment(bodyText);

      if (isSys && depth === 0) {
        const fileLink = extractSystemFileLink(bodyText);
        const hiddenFile = extractHiddenSystemFileLink(bodyText);
        const hasImagePreview = fileLink && isImageFileName(fileLink.label);
        const isOwner = isCommentOwner(c, user);
        const canHideDoc = isOwner && !!fileLink && typeof onHideSystemDocument === 'function';
        const canUnhideDoc = isOwner && !!hiddenFile && typeof onUnhideSystemDocument === 'function';
        return (
          <div key={c.id} className="group/sys flex flex-col items-center py-1.5 gap-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e4e6eb]/70 px-3 py-1 max-w-[90%]">
              <span className="text-[12px] leading-relaxed text-[#65676b] text-center break-words whitespace-pre-wrap">
                {renderSystemCommentBody(bodyText)}
              </span>
              <span className="shrink-0 text-[10px] text-[#65676b]/60 ml-1" title={formatCrmCommentFullDateTime(c.created_at)}>
                {formatCrmFbRelativeTime(c.created_at)}
              </span>
              {/* Chỉ ẩn/hiện tài liệu — không xóa tin hệ thống. Đã ẩn: luôn hiện nút Hiện. */}
              {(canHideDoc || canUnhideDoc) && (
                <span
                  className={`shrink-0 inline-flex items-center gap-0.5 ml-0.5 transition-opacity ${
                    canUnhideDoc
                      ? 'opacity-100'
                      : 'opacity-0 pointer-events-none group-hover/sys:opacity-100 group-hover/sys:pointer-events-auto group-focus-within/sys:opacity-100 group-focus-within/sys:pointer-events-auto'
                  }`}
                >
                  {canHideDoc && (
                    <button
                      type="button"
                      title="Ẩn tài liệu — người khác không tải/xem được file trong tin này"
                      className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[#65676b] hover:bg-white hover:text-amber-700"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onHideSystemDocument(c);
                      }}
                    >
                      <EyeOff size={12} strokeWidth={2.4} />
                    </button>
                  )}
                  {canUnhideDoc && (
                    <button
                      type="button"
                      title="Hiện lại tài liệu"
                      className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-[10px] font-bold"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onUnhideSystemDocument(c);
                      }}
                    >
                      <Eye size={12} strokeWidth={2.4} />
                      Hiện
                    </button>
                  )}
                </span>
              )}
            </div>
            {hasImagePreview && (
              <CopyableImage
                src={pubUrl(fileLink.url)}
                copyUrl={pubUrl(fileLink.url)}
                fileName={fileLink.label}
                alt={fileLink.label}
                className="block mt-1"
                imgClassName="max-h-40 max-w-[260px] rounded-lg border border-[#e4e6eb] object-cover hover:opacity-90 transition-opacity"
                onDownload={(url, name) => downloadUploadFile(url, name || 'anh.jpg')}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openLightboxByUrl(pubUrl(fileLink.url));
                }}
              />
            )}
            {fileLink && !hasImagePreview && (
              <div className="inline-flex items-center gap-1.5 mt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    downloadUploadFile(fileLink.url, fileLink.label || 'tai-lieu').catch((err) => {
                      alert(err?.message || 'Không tải được file');
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#e4e6eb] bg-white hover:bg-gray-50 transition-colors text-[12px] text-blue-600"
                >
                  <Paperclip size={13} className="text-[#65676b]" />
                  <span className="truncate max-w-[200px]">{fileLink.label}</span>
                  <Download size={14} className="ml-1 text-[#65676b]" />
                </button>
                {canHideDoc && (
                  <button
                    type="button"
                    title="Ẩn tài liệu"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onHideSystemDocument(c);
                    }}
                  >
                    <EyeOff size={12} />
                    Ẩn tài liệu
                  </button>
                )}
              </div>
            )}
            {canUnhideDoc && !fileLink && (
              <button
                type="button"
                title="Hiện lại tài liệu"
                className="inline-flex items-center gap-1 mt-0.5 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUnhideSystemDocument(c);
                }}
              >
                <Eye size={12} />
                Hiện lại tài liệu
              </button>
            )}
          </div>
        );
      }

      const showCornerRx = editingId !== c.id && (c.reactions?.summary || []).some((s) => s.count > 0);
      const isPrivateComment = c?.metadata?.visibility === 'private';
      const privateAudienceIds = isPrivateComment && Array.isArray(c?.metadata?.visible_user_ids)
        ? c.metadata.visible_user_ids.map(String)
        : [];
      const privateAudienceNames = isPrivateComment
        ? privateAudienceIds
            .map((uid) => {
              const m = (members || []).find((mem) => String(mem?.user?.id || mem?.user_id) === String(uid));
              return m?.user?.full_name || null;
            })
            .filter(Boolean)
        : [];
      const privateTooltip = isPrivateComment
        ? `Bình luận riêng tư — chỉ hiện với: ${privateAudienceNames.join(', ') || '—'}`
        : '';
      return (
        <div key={c.id} className={depth > 0 ? 'ml-5 border-l border-[#ccd0d5] pl-2.5 pt-0.5' : ''}>
          <div className="group/crx flex gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-black/[0.025]">
            <FbCrmAvatar user={c.user} className="h-8 w-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className={`relative inline-block max-w-full ${showCornerRx ? 'mb-2.5' : ''}`}>
                <div
                  className={`max-w-full rounded-2xl border px-3 py-2 shadow-sm ${showCornerRx ? 'pb-2.5' : ''} ${
                  isPrivateComment
                    ? 'border-amber-300 bg-amber-50/70'
                    : contentHasMentionAll(getBody(c))
                      ? 'border-amber-500 bg-amber-200'
                      : 'border-[#e4e6eb]/90 bg-white'
                }`}
                  onContextMenu={(e) => {
                    if (editingId === c.id) return;
                    if (e.target instanceof Element && e.target.closest('textarea, a, button, img')) return;
                    const body = (getBody(c) || '').trim();
                    const rawImages = commentImageUrls(c);
                    const imageUrls = rawImages.map((u) => pubUrl(u) || u);
                    const rawImage = rawImages[0] || null;
                    const imageUrl = imageUrls[0] || null;
                    if (!body && !imageUrl) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setCommentCtxMenu({
                      x: e.clientX,
                      y: e.clientY,
                      body,
                      imageUrl,
                      imageUrls,
                      onDownloadImage: rawImage
                        ? () => downloadUploadFile(rawImage, 'anh.jpg')
                        : null,
                    });
                  }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    <span className="text-[13px] font-semibold text-[#050505]">{c.user?.full_name || 'Thành viên'}</span>
                    {isPrivateComment && (
                      <span
                        title={privateTooltip}
                        className="inline-flex items-center gap-0.5 rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
                      >
                        🔒 Riêng tư
                      </span>
                    )}
                    {!isPrivateComment && contentHasMentionAll(getBody(c)) && (
                      <span className="inline-flex items-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                        @Tất cả
                      </span>
                    )}
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

  const mediaTotal =
    (mediaBundle.images?.length || 0)
    + (mediaBundle.videos?.length || 0)
    + (mediaBundle.files?.length || 0)
    + (mediaBundle.links?.length || 0);

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
      <CommentBubbleContextMenu menu={commentCtxMenu} onClose={() => setCommentCtxMenu(null)} />
      <div className="flex items-center justify-end gap-2 border-b border-[#e4e6eb] bg-white px-2 py-1.5">
        <button
          type="button"
          onClick={() => setRightOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[12px] font-semibold transition shrink-0 ${
            rightOpen
              ? 'bg-violet-600 text-white shadow-sm'
              : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200'
          }`}
          title="Ảnh/video, tệp, link trong bình luận"
        >
          {rightOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          Ảnh & tệp
          {mediaTotal > 0 ? (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              rightOpen ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'
            }`}>
              {mediaTotal}
            </span>
          ) : null}
        </button>
      </div>
      <div className="flex min-h-0">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
        {rightOpen ? (
          <CommentMediaDetailPanel
            mediaBundle={mediaBundle}
            section={mediaSection}
            onSectionChange={setMediaSection}
            onOpenImage={openLightboxByUrl}
            onClose={() => setRightOpen(false)}
          />
        ) : null}
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

  /** @mention: gộp thành viên deal + người đã bình luận (chưa có trong lead_members). */
  const mentionMembers = useMemo(() => {
    const byId = new Map();
    for (const m of members || []) {
      const id = String(m?.user_id || m?.user?.id || '').trim();
      if (!id) continue;
      byId.set(id, {
        ...m,
        user_id: id,
        user: m.user || null,
        role: m.role || 'member',
      });
    }
    // Comments mới hơn → gần đầu danh sách khi mở @
    const ordered = [...(comments || [])].reverse();
    for (const c of ordered) {
      const u = c?.user;
      const id = String(u?.id || c?.user_id || '').trim();
      if (!id || id === String(selfUid || '')) continue;
      if (!byId.has(id)) {
        byId.set(id, {
          user_id: id,
          user: u || { id, full_name: 'Thành viên' },
          role: 'member',
          recentCommenter: true,
        });
      } else {
        const prev = byId.get(id);
        byId.set(id, { ...prev, recentCommenter: true });
      }
    }
    return [...byId.values()];
  }, [members, comments, selfUid]);

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
      const allRows = Array.isArray(r.data) ? r.data : [];
      // Thông báo hệ thống (hoàn thành nhiệm vụ, chuyển giai đoạn...) chuyển sang tab Lịch sử —
      // không hiện lẫn trong luồng Bình luận nữa (xem CrmLeadHistoryPanel bên dưới).
      const rows = allRows.filter((c) => c.comment_type !== 'system');
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
    if (row.comment_type === 'system') return;
    // SX / VC: ẩn bình luận hoạt động Báo giá / Hợp đồng (VPT & Phúc Đạt — khớp API for_module)
    if (
      shouldHideQuoteContractComments(forModule)
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

  const submit = useCallback(async ({ mention_user_ids, attachmentList, visibility, visible_user_ids } = {}) => {
    const v = body.trim();
    const files = attachmentList ?? pendingFiles;
    if (!activeLeadId || (!v && !files.length)) return;
    setPosting(true);
    try {
      const payload = { body: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      if (mention_user_ids?.length) payload.mention_user_ids = mention_user_ids;
      if (files.length) payload.attachments = files;
      if (visibility === 'private') {
        payload.visibility = 'private';
        payload.visible_user_ids = Array.isArray(visible_user_ids) ? visible_user_ids : [];
      }
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

  const hideSystemDocument = async (c) => {
    const raw = c?.body || '';
    if (!extractSystemFileLink(raw)) return;
    if (!window.confirm('Ẩn tài liệu trong tin này? Người khác sẽ không xem/tải được file từ bình luận.')) return;
    const nextBody = hideSystemFileLinksInBody(raw);
    if (!nextBody || nextBody === raw) return;
    try {
      const r = await api.patch(`/crm/lead-comments/${c.id}`, { body: nextBody });
      const row = r.data || {};
      setComments((prev) => replaceComment(prev, { ...row, id: c.id }));
    } catch (e) {
      alert(e?.response?.data?.error || 'Không ẩn được tài liệu');
    }
  };

  const unhideSystemDocument = async (c) => {
    const raw = c?.body || '';
    if (!extractHiddenSystemFileLink(raw)) return;
    const nextBody = unhideSystemFileLinksInBody(raw);
    if (!nextBody || nextBody === raw) return;
    try {
      const r = await api.patch(`/crm/lead-comments/${c.id}`, { body: nextBody });
      const row = r.data || {};
      setComments((prev) => replaceComment(prev, { ...row, id: c.id }));
    } catch (e) {
      alert(e?.response?.data?.error || 'Không hiện lại được tài liệu');
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

  const applyVcRow = useCallback((row) => {
    if (row?.id) setComments((prev) => replaceComment(prev, row));
    return row;
  }, []);

  const vcSelect = useCallback(async (commentId, payload) => {
    const r = await api.patch(`/vc-handover/comments/${commentId}/select`, payload);
    applyVcRow(r.data?.comment);
    const hist = r.data?.history_comment;
    if (hist?.id) {
      setComments((prev) => {
        if (prev.some((c) => String(c.id) === String(hist.id))) return prev;
        return [...prev, { ...hist, reactions: hist.reactions || { summary: [], mine: null } }];
      });
    }
    // Báo board VC/LĐ reload — bỏ qua nếu thuê ngoài (không vào module Lắp đặt).
    if (!payload?.skip_logistics_module && !r.data?.skip_logistics_module) {
      try {
        window.dispatchEvent(new CustomEvent('vc-handover:board-refresh', {
          detail: {
            id: r.data?.project_id || null,
            project_id: r.data?.project_id || null,
            status: 'shipping',
            reason: 'vc_handover',
            logistics_company_id: r.data?.logistics_company_id || payload?.logistics_company_id || null,
            vc_kanban_column_id: r.data?.vc_kanban_column_id || null,
          },
        }));
      } catch (_) { /* ignore */ }
    }
    return r.data?.comment;
  }, [applyVcRow]);

  const vcSchedule = useCallback(async (commentId, payload) => {
    const r = await api.patch(`/vc-handover/comments/${commentId}/schedule`, payload);
    return applyVcRow(r.data?.comment);
  }, [applyVcRow]);

  const vcReschedule = useCallback(async (commentId, payload) => {
    const r = await api.patch(`/vc-handover/comments/${commentId}/reschedule`, payload);
    applyVcRow(r.data?.comment);
    const hist = r.data?.history_comment;
    if (hist?.id) {
      setComments((prev) => {
        if (prev.some((c) => String(c.id) === String(hist.id))) return prev;
        return [...prev, { ...hist, reactions: hist.reactions || { summary: [], mine: null } }];
      });
    }
    return r.data?.comment;
  }, [applyVcRow]);

  const vcConfirm = useCallback(async (commentId, side) => {
    const r = await api.patch(`/vc-handover/comments/${commentId}/confirm`, { side });
    return applyVcRow(r.data?.comment);
  }, [applyVcRow]);

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
      onHideSystemDocument={hideSystemDocument}
      onUnhideSystemDocument={unhideSystemDocument}
      onReply={(c) => { setReplyTo({ id: c.id, name: c.user?.full_name || 'Thành viên' }); setEditingId(null); }}
      onReaction={pickReaction}
      members={mentionMembers}
      enableMentions
      enableAttachments
      pendingFiles={pendingFiles}
      onFilesUploaded={handleFilesUploaded}
      onPasteFiles={handlePasteFiles}
      pasteUploadProgress={pasteProgress}
      onRemovePendingFile={(i) => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
      canSubmit={Boolean(body.trim() || pendingFiles.length)}
      renderBody={(text) => renderCrmCommentBody(text, mentionMembers)}
      threadScrollRef={scrollRef}
      onThreadScroll={onScroll}
      newCommentCount={unreadCount}
      onScrollToNewComments={scrollToLatest}
      quickReplyTemplates={quickReplyTemplates}
      showReadStatus
      readReceipts={readReceipts}
      commentMembers={mentionMembers}
      readDetailId={readDetailId}
      onOpenReadDetail={setReadDetailId}
      onVcSelect={vcSelect}
      onVcSchedule={vcSchedule}
      onVcConfirm={vcConfirm}
      onVcReschedule={vcReschedule}
    />
  );
}

/**
 * Lịch sử hoạt động hệ thống của deal/lead — tách khỏi Bình luận (comment_type='system'):
 * hoàn thành nhiệm vụ, chuyển giai đoạn, đổi hạn chót, bàn giao VC/LĐ, đổi người phụ trách...
 * Chỉ đọc — không có ô soạn/reply, vì đây là log tự động, không phải hội thoại.
 */
export function CrmLeadHistoryPanel({ leadId, forModule = null }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = forModule ? { for_module: forModule } : undefined;
      const r = await api.get(`/crm/leads/${leadId}/comments`, { params });
      const rows = Array.isArray(r.data) ? r.data : [];
      const sys = rows
        .filter((c) => c.comment_type === 'system')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(sys);
    } catch (e) {
      setItems([]);
      setLoadError(e?.response?.data?.error || 'Không tải được lịch sử');
    } finally {
      setLoading(false);
    }
  }, [leadId, forModule]);

  useEffect(() => { load(); }, [load]);

  if (!leadId) {
    return <p className="text-sm text-gray-500 text-center py-8">Chưa có dữ liệu để xem lịch sử.</p>;
  }
  if (loading) {
    return <div className="text-center py-8 text-sm text-gray-400">Đang tải...</div>;
  }
  if (loadError) {
    return <div className="text-center py-8 text-sm text-red-500">{loadError}</div>;
  }
  if (!items.length) {
    return (
      <div className="text-center py-8">
        <Clock className="h-10 w-10 text-gray-200 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Chưa có lịch sử hoạt động nào</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[32rem] overflow-y-auto">
      <div className="relative">
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-teal-300 to-teal-100" />
        {items.map((it) => (
          <div key={it.id} className="p-3 bg-gray-50 rounded-lg border relative z-10 ml-4 mb-2">
            <div className="absolute -left-5 top-4 w-3 h-3 bg-teal-600 rounded-full border-2 border-white" />
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-gray-800 flex-1">{renderCrmCommentBody ? renderCrmCommentBody(it.body) : it.body}</p>
              <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">{formatCrmCommentFullDateTime(it.created_at)}</span>
            </div>
            {it.user?.full_name && <p className="text-[10px] text-gray-400 mt-1">{it.user.full_name}</p>}
          </div>
        ))}
      </div>
    </div>
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

  const hideSystemDocument = async (c) => {
    if (!activeProjectId) return;
    const raw = c?.content || '';
    if (!extractSystemFileLink(raw)) return;
    if (!window.confirm('Ẩn tài liệu trong tin này? Người khác sẽ không xem/tải được file từ bình luận.')) return;
    const nextBody = hideSystemFileLinksInBody(raw);
    if (!nextBody || nextBody === raw) return;
    try {
      const r = await api.patch(`/projects/${activeProjectId}/comments/${c.id}`, { content: nextBody });
      const row = r.data || {};
      setComments((prev) => replaceComment(prev, { ...row, id: c.id }));
    } catch (e) {
      alert(e?.response?.data?.error || 'Không ẩn được tài liệu');
    }
  };

  const unhideSystemDocument = async (c) => {
    if (!activeProjectId) return;
    const raw = c?.content || '';
    if (!extractHiddenSystemFileLink(raw)) return;
    const nextBody = unhideSystemFileLinksInBody(raw);
    if (!nextBody || nextBody === raw) return;
    try {
      const r = await api.patch(`/projects/${activeProjectId}/comments/${c.id}`, { content: nextBody });
      const row = r.data || {};
      setComments((prev) => replaceComment(prev, { ...row, id: c.id }));
    } catch (e) {
      alert(e?.response?.data?.error || 'Không hiện lại được tài liệu');
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
      onHideSystemDocument={hideSystemDocument}
      onUnhideSystemDocument={unhideSystemDocument}
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
