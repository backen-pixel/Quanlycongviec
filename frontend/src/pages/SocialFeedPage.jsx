import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { getInitials } from '../lib/utils';
import {
  ThumbsUp, MessageCircle,   Trash2, Send, Loader2, Building2,
  Image as ImageIcon, Link2, RefreshCw, Heart, FileText, X,
  Video, Smile, MapPin, ImagePlus, Globe, MoreHorizontal,
  ChevronLeft, ChevronRight, Maximize2, Pencil, Share2, EyeOff,
} from 'lucide-react';

const LS_SOCIAL_COMPANY = 'internal_social_filter_company_id';
const BODY_PREVIEW = 280;
/** File lớn hơn ngưỡng → upload stream (disk) trên server */
const UPLOAD_STREAM_BYTES = 48 * 1024 * 1024;
const MAX_ATTACHMENTS = 12;

/** Cảm xúc (đồng bộ backend `internal_social_likes.reaction`) */
const REACTION_OPTIONS = [
  { key: 'like', emoji: '👍', label: 'Thích' },
  { key: 'love', emoji: '❤️', label: 'Yêu thích' },
  { key: 'care', emoji: '🤗', label: 'Thương thương' },
  { key: 'haha', emoji: '😆', label: 'Haha' },
  { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'sad', emoji: '😢', label: 'Buồn' },
  { key: 'angry', emoji: '😠', label: 'Phẫn nộ' },
];

const REACTION_EMOJI = Object.fromEntries(REACTION_OPTIONS.map((o) => [o.key, o.emoji]));

/** Icon tròn kiểu Facebook (picker + tóm tắt) */
function ReactionCircle({ reactionKey, size = 'lg' }) {
  const wrap =
    size === 'lg'
      ? 'h-10 w-10 min-h-[2.5rem] min-w-[2.5rem]'
      : size === 'md'
        ? 'h-7 w-7 min-h-7 min-w-7'
        : 'h-[18px] w-[18px] min-h-[18px] min-w-[18px]';
  const thumb =
    size === 'lg' ? 'h-[22px] w-[22px]' : size === 'md' ? 'h-4 w-4' : 'h-2.5 w-2.5';
  const heart = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5';
  const em =
    size === 'lg' ? 'text-[22px] leading-none' : size === 'md' ? 'text-sm leading-none' : 'text-[10px] leading-none';
  const ring = size === 'sm' ? 'border border-white shadow-sm' : 'border-2 border-white shadow-md';
  const base = `flex ${wrap} shrink-0 items-center justify-center rounded-full ${ring}`;

  switch (reactionKey) {
    case 'like':
      return (
        <span className={`${base} bg-[#1877f2]`} aria-hidden>
          <ThumbsUp className={`${thumb} text-white`} strokeWidth={2.2} fill="currentColor" />
        </span>
      );
    case 'love':
      return (
        <span className={`${base} bg-gradient-to-br from-pink-500 to-red-600`} aria-hidden>
          <Heart className={`${heart} text-white`} fill="currentColor" stroke="none" />
        </span>
      );
    case 'care':
      return (
        <span className={`${base} bg-amber-100 ${em}`} aria-hidden>
          {REACTION_EMOJI.care}
        </span>
      );
    case 'haha':
      return (
        <span className={`${base} bg-amber-300 ${em}`} aria-hidden>
          {REACTION_EMOJI.haha}
        </span>
      );
    case 'wow':
      return (
        <span className={`${base} bg-amber-300 ${em}`} aria-hidden>
          {REACTION_EMOJI.wow}
        </span>
      );
    case 'sad':
      return (
        <span className={`${base} bg-amber-300 ${em}`} aria-hidden>
          {REACTION_EMOJI.sad}
        </span>
      );
    case 'angry':
      return (
        <span className={`${base} bg-gradient-to-b from-orange-500 to-red-700 ${em}`} aria-hidden>
          {REACTION_EMOJI.angry}
        </span>
      );
    default:
      return (
        <span className={`${base} bg-[#1877f2]`} aria-hidden>
          <ThumbsUp className={`${thumb} text-white`} strokeWidth={2.2} fill="currentColor" />
        </span>
      );
  }
}

function normalizeSocialPost(p) {
  if (!p || typeof p !== 'object') return p;
  const rc = p.reaction_counts;
  const reaction_counts = rc && typeof rc === 'object' && !Array.isArray(rc) ? { ...rc } : {};
  return {
    ...p,
    reaction_counts,
    like_count: Number(p.like_count) || 0,
    comment_count: Number(p.comment_count) || 0,
    liked_by_me: !!p.liked_by_me,
    my_reaction: typeof p.my_reaction === 'string' ? p.my_reaction : null,
    video_url: typeof p.video_url === 'string' ? p.video_url : (p.video_url || null),
    visibility: p.visibility === 'selected_users' ? 'selected_users' : 'company',
    published_at: p.published_at || null,
    hidden_at: p.hidden_at || null,
    audience_users: Array.isArray(p.audience_users) ? p.audience_users : [],
  };
}

function isoToDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isScheduledPost(post) {
  if (!post?.published_at) return false;
  return new Date(post.published_at).getTime() > Date.now();
}

function emptyComposerFields() {
  return {
    body: '',
    link_url: '',
    link_title: '',
    image_url: '',
    video_url: '',
    publishMode: 'now',
    scheduledAt: '',
    visibility: 'company',
    audienceUserIds: [],
  };
}

function looksLikeSingleImageUrl(s) {
  const t = String(s || '').trim();
  return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?$/i.test(t);
}

function uploadSocialFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const isVideo = String(file.type || '').startsWith('video/');
  const useStream = isVideo || file.size > UPLOAD_STREAM_BYTES;
  const url = useStream ? '/upload/internal-social-stream' : '/upload/internal-social';
  const timeout = useStream || file.size > UPLOAD_STREAM_BYTES ? 600000 : 120000;
  return api.post(url, fd, { timeout });
}

function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'Vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 604800) return `${Math.floor(s / 86400)} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function canModerate(role) {
  const r = String(role || '').toLowerCase();
  return ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator', 'region_admin'].includes(r);
}

function Avatar({ user }) {
  const name = user?.full_name || user?.email || '?';
  const initials = getInitials(name);
  const pic = typeof user?.avatar === 'string' && user.avatar.trim();
  if (pic) {
    return (
      <img
        src={pic}
        alt=""
        title={name}
        className="h-10 w-10 shrink-0 rounded-full border border-gray-200/90 object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
      title={name}
    >
      {initials}
    </div>
  );
}

function normalizeComment(c) {
  if (!c || typeof c !== 'object') return c;
  const rc = c.reaction_counts;
  return {
    ...c,
    parent_id: c.parent_id ?? null,
    reaction_counts: rc && typeof rc === 'object' && !Array.isArray(rc) ? { ...rc } : {},
    reaction_count: Number(c.reaction_count) || 0,
    liked_by_me: !!c.liked_by_me,
    my_reaction: typeof c.my_reaction === 'string' ? c.my_reaction : null,
  };
}

function nestComments(flat) {
  if (!flat?.length) return [];
  const byId = new Map(flat.map((c) => [c.id, { ...c, replies: [] }]));
  const roots = [];
  for (const c of flat) {
    const node = byId.get(c.id);
    const pid = c.parent_id;
    if (pid && byId.has(pid)) byId.get(pid).replies.push(node);
    else roots.push(node);
  }
  const sortCh = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  roots.sort(sortCh);
  for (const n of byId.values()) n.replies.sort(sortCh);
  return roots;
}

function youtubeEmbedId(url) {
  try {
    const u = new URL(String(url).trim());
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtu.be') {
      return u.pathname.replace(/^\//, '').split(/[/?#]/)[0] || null;
    }
    if (h.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
      const v = u.searchParams.get('v');
      if (v) return v;
    }
  } catch {
    /* */
  }
  return null;
}

function vimeoEmbedId(url) {
  try {
    const u = new URL(String(url).trim());
    const h = u.hostname.replace(/^www\./, '');
    if (!h.endsWith('vimeo.com')) return null;
    const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function looksLikeSingleVideoUrl(s) {
  const t = String(s || '').trim();
  if (!t.startsWith('http')) return false;
  if (youtubeEmbedId(t) || vimeoEmbedId(t)) return true;
  return /^https?:\/\/.+\.(mp4|webm|mov|ogv|m4v|avi|mkv)(\?[^\s]*)?$/i.test(t);
}

function inferMediaKindFromUrl(url) {
  const low = String(url || '').toLowerCase();
  if (youtubeEmbedId(url) || vimeoEmbedId(url)) return 'video';
  if (/\.(mp4|webm|mov|ogv|ogg|m4v|avi|mkv)(\?|$)/i.test(low)) return 'video';
  return 'image';
}

/** Video trực tiếp (.mp4…) hoặc YouTube / Vimeo — khung 16:9 */
function FeedVideoFromUrl({ url, onExpand }) {
  const yt = youtubeEmbedId(url);
  const vm = vimeoEmbedId(url);
  const expandBtn = onExpand && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onExpand(url);
      }}
      className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white hover:bg-black/80"
      title="Toàn màn hình"
    >
      <Maximize2 className="h-3.5 w-3.5" />
      Toàn màn hình
    </button>
  );
  if (yt) {
    return (
      <div className="relative w-full overflow-hidden rounded-lg border border-gray-100 bg-black">
        <div className="relative w-full aspect-video">
          <iframe
            title="YouTube"
            src={`https://www.youtube-nocookie.com/embed/${yt}`}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
          {expandBtn}
        </div>
      </div>
    );
  }
  if (vm) {
    return (
      <div className="relative w-full overflow-hidden rounded-lg border border-gray-100 bg-black">
        <div className="relative w-full aspect-video">
          <iframe
            title="Vimeo"
            src={`https://player.vimeo.com/video/${vm}`}
            className="absolute inset-0 h-full w-full"
            allowFullScreen
          />
          {expandBtn}
        </div>
      </div>
    );
  }
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-gray-100 bg-black">
      <div className="relative w-full aspect-video">
        <video src={url} controls className="absolute inset-0 h-full w-full object-contain" playsInline preload="metadata" />
        {expandBtn}
      </div>
    </div>
  );
}

function collectGalleryItems(post, comments) {
  const items = [];
  const seen = new Set();
  const push = (url, kind) => {
    const x = String(url || '').trim();
    if (!x || seen.has(x)) return;
    seen.add(x);
    const k = kind === 'video' || kind === 'image' ? kind : inferMediaKindFromUrl(x);
    items.push({ url: x, kind: k });
  };
  const atts = [...(post.attachments || [])].sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
  for (const a of atts) {
    if (!a.file_url) continue;
    const mt = String(a.mime_type || '');
    if (mt.startsWith('image/')) push(a.file_url, 'image');
    else if (mt.startsWith('video/')) push(a.file_url, 'video');
    else push(a.file_url, inferMediaKindFromUrl(a.file_url));
  }
  if (post.image_url) push(post.image_url, 'image');
  if (post.video_url) push(post.video_url, 'video');
  for (const c of comments || []) {
    if (looksLikeSingleImageUrl(c.body)) push(c.body.trim(), 'image');
    else if (looksLikeSingleVideoUrl(c.body)) push(c.body.trim(), 'video');
  }
  return items;
}

function isImageAtt(a) {
  return String(a?.mime_type || '').startsWith('image/');
}

/** Gom các ảnh liên tiếp để render một lưới; giữ thứ tự với file khác xen kẽ. */
function groupAttachmentSegments(list) {
  const segments = [];
  let i = 0;
  while (i < list.length) {
    if (isImageAtt(list[i])) {
      let j = i + 1;
      while (j < list.length && isImageAtt(list[j])) j += 1;
      segments.push({ kind: 'images', items: list.slice(i, j) });
      i = j;
    } else {
      segments.push({ kind: 'other', item: list[i] });
      i += 1;
    }
  }
  return segments;
}

/** Lưới ảnh kiểu Facebook: 2 cột; 5 ảnh = 2 trái + 3 phải; 6+ = ô cuối +N */
function ImageCollageGrid({ items, onImageClick }) {
  const n = items.length;
  if (n === 0) return null;

  const more = n > 5 ? n - 5 : 0;
  const display = more ? items.slice(0, 5) : items;

  const cell = (att, idx, opts = {}) => {
    const { overlayText, className = '' } = opts;
    const name = att.file_name || 'Ảnh';
    const inner = (
      <>
        <img src={att.file_url} alt={name} className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
        {overlayText != null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-2xl sm:text-3xl font-bold tracking-tight">
            {overlayText}
          </div>
        )}
      </>
    );
    const cls = `relative block h-full min-h-0 overflow-hidden bg-gray-200 group ${className}${onImageClick ? ' cursor-zoom-in' : ''}`;
    if (onImageClick) {
      return (
        <button
          key={att.id ?? idx}
          type="button"
          onClick={() => onImageClick(att.file_url, name)}
          className={cls}
        >
          {inner}
        </button>
      );
    }
    return (
      <a
        key={att.id ?? idx}
        href={att.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        {inner}
      </a>
    );
  };

  if (display.length === 1) {
    const att0 = display[0];
    const name0 = att0.file_name || '';
    const inner169 = (
      <div className="relative w-full aspect-video bg-gray-100">
        <img
          src={att0.file_url}
          alt={name0}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>
    );
    return (
      <div className="rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
        {onImageClick ? (
          <button
            type="button"
            onClick={() => onImageClick(att0.file_url, name0 || 'Ảnh')}
            className="block w-full text-left cursor-zoom-in"
          >
            {inner169}
          </button>
        ) : (
          <a href={att0.file_url} target="_blank" rel="noopener noreferrer" className="block">
            {inner169}
          </a>
        )}
      </div>
    );
  }

/** Lưới ảnh đính kèm — chiều cao theo bề ngang (tăng ~20% so với trước) */
  const gridH = 'h-[336px] sm:h-[408px]';

  if (display.length === 2) {
    return (
      <div className={`grid grid-cols-2 gap-0.5 rounded-lg overflow-hidden border border-gray-100 ${gridH}`}>
        {display.map((att, i) => cell(att, i))}
      </div>
    );
  }

  if (display.length === 3) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 rounded-lg overflow-hidden border border-gray-100 ${gridH}`}>
        {cell(display[0], 0, { className: 'row-span-2 col-start-1' })}
        {cell(display[1], 1, { className: 'row-start-1 col-start-2' })}
        {cell(display[2], 2, { className: 'row-start-2 col-start-2' })}
      </div>
    );
  }

  if (display.length === 4) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 gap-0.5 rounded-lg overflow-hidden border border-gray-100 ${gridH}`}>
        {display.map((att, i) => cell(att, i))}
      </div>
    );
  }

  // 5+ (hiển thị 5 ô, ô cuối có +more nếu còn ẩn)
  const d = display;
  return (
    <div className={`grid grid-cols-2 grid-rows-3 gap-0.5 rounded-lg overflow-hidden border border-gray-100 ${gridH}`}>
      {cell(d[0], 0, { className: 'row-span-2 row-start-1 col-start-1' })}
      {cell(d[1], 1, { className: 'row-start-3 col-start-1' })}
      {cell(d[2], 2, { className: 'row-start-1 col-start-2' })}
      {cell(d[3], 3, { className: 'row-start-2 col-start-2' })}
      {cell(d[4], 4, { overlayText: more > 0 ? `+${more}` : undefined, className: 'row-start-3 col-start-2' })}
    </div>
  );
}

function PostAttachments({ list, onImageClick }) {
  if (!list?.length) return null;
  const segments = groupAttachmentSegments(list);
  return (
    <div className="px-4 pb-2 space-y-3">
      {segments.map((seg, si) => {
        if (seg.kind === 'images') {
          return <ImageCollageGrid key={`img-${si}-${seg.items[0]?.id}`} items={seg.items} onImageClick={onImageClick} />;
        }
        const a = seg.item;
        const mime = String(a.mime_type || '');
        const name = a.file_name || 'Tệp đính kèm';
        if (mime.startsWith('video/')) {
          return (
            <div key={a.id} className="rounded-lg overflow-hidden border border-gray-100">
              <FeedVideoFromUrl url={a.file_url} onExpand={onImageClick} />
              <p className="text-xs text-gray-500 bg-gray-50 px-2 py-1 truncate border-t border-gray-100">{name}</p>
            </div>
          );
        }
        if (mime.startsWith('audio/')) {
          return (
            <div key={a.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
              <p className="text-xs text-gray-500 truncate mb-1">{name}</p>
              <audio src={a.file_url} controls className="w-full h-9" />
            </div>
          );
        }
        return (
          <a
            key={a.id}
            href={a.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-sm text-gray-800"
          >
            <FileText className="w-5 h-5 text-blue-600 shrink-0" />
            <span className="truncate font-medium">{name}</span>
            {a.file_size > 0 && (
              <span className="text-xs text-gray-400 shrink-0 ml-auto">
                {(a.file_size / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
          </a>
        );
      })}
    </div>
  );
}

function SocialCommentBranch({
  nodes,
  depth,
  postId,
  openLightboxUrl,
  onReply,
  onCommentReact,
}) {
  if (!nodes?.length) return null;
  return (
    <div className={depth ? 'mt-1.5 space-y-2 border-l-2 border-gray-200 pl-3 ml-0.5' : 'space-y-2'}>
      {nodes.map((c) => (
        <SocialCommentItem
          key={c.id}
          c={c}
          depth={depth}
          postId={postId}
          openLightboxUrl={openLightboxUrl}
          onReply={onReply}
          onCommentReact={onCommentReact}
        />
      ))}
    </div>
  );
}

function SocialCommentItem({
  c,
  depth,
  postId,
  openLightboxUrl,
  onReply,
  onCommentReact,
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
    rxCloseTimer.current = setTimeout(() => setRxHover(false), 260);
  };
  useEffect(() => () => clearRxTimer(), []);

  const myRx = c.my_reaction && REACTION_EMOJI[c.my_reaction] ? c.my_reaction : null;
  const rc = c.reaction_counts || {};
  const totalRx = c.reaction_count ?? 0;
  const topKeys = Object.keys(rc)
    .filter((k) => rc[k] > 0)
    .sort((a, b) => (rc[b] || 0) - (rc[a] || 0))
    .slice(0, 3);

  return (
    <div className="flex gap-2 text-sm">
      <div className="shrink-0 scale-90 origin-top-left">
        <Avatar user={c.author} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative inline-block max-w-full align-top">
          <div
            className={`rounded-2xl border border-gray-100 bg-gray-50 px-3 pt-2 ${totalRx > 0 ? 'pb-5' : 'pb-2'}`}
          >
            <p className="font-semibold text-gray-900 text-xs">{c.author?.full_name || c.author?.email}</p>
          {looksLikeSingleImageUrl(c.body) ? (
            <button
              type="button"
              onClick={() => openLightboxUrl(c.body.trim())}
              className="mt-1 block w-full overflow-hidden rounded-lg text-left cursor-zoom-in border border-gray-100"
            >
              <div className="relative w-full aspect-video bg-gray-50">
                <img src={c.body.trim()} alt="" className="absolute inset-0 h-full w-full object-contain" />
              </div>
            </button>
          ) : looksLikeSingleVideoUrl(c.body) ? (
            <div className="mt-1">
              <FeedVideoFromUrl url={c.body.trim()} onExpand={openLightboxUrl} />
            </div>
          ) : (
              <p className="text-gray-800 mt-0.5 whitespace-pre-wrap">{c.body}</p>
            )}
          </div>
          {totalRx > 0 && (
            <div
              className="absolute bottom-0 right-2 z-10 flex translate-y-1/2 items-center gap-1 rounded-full border border-gray-200/95 bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-700 shadow-md"
              aria-label={`${totalRx} cảm xúc`}
            >
              <span className="leading-none">{totalRx}</span>
              <span className="flex items-center pl-0.5 -space-x-1">
                {topKeys.map((k) => (
                  <span
                    key={k}
                    className="relative inline-flex ring-2 ring-white rounded-full bg-white"
                    style={{ zIndex: topKeys.length - i }}
                  >
                    <ReactionCircle reactionKey={k} size="sm" />
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0 pl-0.5 text-[11px] text-gray-500">
          <span>{timeAgo(c.created_at)}</span>
          <div className="relative inline-flex" onMouseEnter={openRx} onMouseLeave={scheduleCloseRx}>
            {rxHover && (
              <div
                role="menu"
                className="absolute bottom-full left-1/2 z-20 mb-1 flex max-w-[min(calc(100vw-1.5rem),22rem)] -translate-x-1/2 flex-nowrap items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-full border border-gray-200/90 bg-white/95 px-1.5 py-1 shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                onMouseEnter={openRx}
                onMouseLeave={scheduleCloseRx}
              >
                {REACTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    title={opt.label}
                    className="shrink-0 rounded-full p-0.5 transition-transform hover:scale-110"
                    onClick={() => {
                      clearRxTimer();
                      setRxHover(false);
                      onCommentReact(postId, c.id, opt.key);
                    }}
                  >
                    <ReactionCircle reactionKey={opt.key} size="md" />
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className={`font-medium ${c.liked_by_me ? 'text-blue-600' : 'hover:text-blue-600'}`}
              onClick={() => onCommentReact(postId, c.id, 'like')}
            >
              {myRx && myRx !== 'like' ? REACTION_OPTIONS.find((o) => o.key === myRx)?.label || 'Thích' : 'Thích'}
            </button>
          </div>
          <button
            type="button"
            className="font-medium text-gray-600 hover:text-blue-600"
            onClick={() => onReply(c.id, c.author?.full_name || c.author?.email || 'Thành viên')}
          >
            Trả lời
          </button>
        </div>
        {c.replies?.length > 0 && (
          <SocialCommentBranch
            nodes={c.replies}
            depth={depth + 1}
            postId={postId}
            openLightboxUrl={openLightboxUrl}
            onReply={onReply}
            onCommentReact={onCommentReact}
          />
        )}
      </div>
    </div>
  );
}

/** Modal danh sách người đã thả cảm xúc (theo tab) */
function PostReactorsModal({ postId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setTab('all');
    setLoading(true);
    setData(null);
    api.get(`/internal-social/posts/${postId}/reactions`)
      .then(({ data: d }) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [postId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const filtered = useMemo(() => {
    if (!data?.reactors) return [];
    if (tab === 'all') return data.reactors;
    return data.reactors.filter((r) => r.reaction === tab);
  }, [data, tab]);

  const tabs = useMemo(() => {
    if (!data) return [{ key: 'all', label: 'Tất cả', count: 0, emoji: null }];
    const reaction_counts = data.reaction_counts || {};
    const total = data.like_count ?? 0;
    const rows = [{ key: 'all', label: 'Tất cả', count: total, emoji: null }];
    for (const opt of REACTION_OPTIONS) {
      const n = reaction_counts[opt.key] || 0;
      if (n > 0) rows.push({ key: opt.key, label: opt.label, count: n, emoji: opt.emoji });
    }
    return rows;
  }, [data]);

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Danh sách cảm xúc"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Cảm xúc về bài viết</h2>
          <button
            type="button"
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Đóng"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="shrink-0 overflow-x-auto border-b border-gray-100 px-2 py-2">
          <div className="flex min-w-min gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? 'bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.key !== 'all' && t.emoji && <span className="text-base leading-none">{t.emoji}</span>}
                {t.key === 'all' && <ThumbsUp className="h-4 w-4 text-gray-600" />}
                <span>{t.label}</span>
                <span className="text-gray-500">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="shrink-0 border-b border-gray-50 px-4 py-2 text-xs text-gray-500 leading-snug">
          Danh sách mọi người đã bày tỏ cảm xúc trên bài viết (theo từng loại khi chọn tab).
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {loading && (
            <div className="flex justify-center py-12 text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          {!loading && !data && (
            <p className="py-8 text-center text-sm text-gray-500">Không tải được danh sách.</p>
          )}
          {!loading && data && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">Chưa có ai trong nhóm này.</p>
          )}
          {!loading && data && filtered.map((r) => (
            <div
              key={String(r.user_id)}
              className="flex items-center gap-3 border-b border-gray-50 px-2 py-2.5 last:border-0"
            >
              <Avatar user={r.user} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {r.user?.full_name || r.user?.email || 'Thành viên'}
                </p>
                {r.user?.email && r.user?.full_name && (
                  <p className="truncate text-xs text-gray-500">{r.user.email}</p>
                )}
              </div>
              <ReactionCircle reactionKey={r.reaction} size="md" />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PostCard({
  post,
  currentUserId,
  currentRole,
  onReaction,
  onOpenLightbox,
  onDelete,
  onEdit,
  onShare,
  onHideCompany,
  onUnhideCompany,
  onHideForMe,
  commentsOpen,
  onToggleComments,
  comments,
  commentsLoading,
  commentText,
  onCommentText,
  onSendComment,
  sendingComment,
  bodyExpanded,
  onToggleBody,
  replyTo,
  onReplyToComment,
  onCancelReplyComment,
  onCommentReact,
  onOpenReactionList,
}) {
  const author = post.author || {};
  const isAuthor = author.id === currentUserId;
  const showDelete = isAuthor || canModerate(currentRole);
  const showEdit = showDelete;
  const canMod = canModerate(currentRole);
  const menuRef = useRef(null);
  const closePostMenu = () => {
    const el = menuRef.current;
    if (el && typeof el.open === 'boolean') el.open = false;
  };
  const longBody = (post.body || '').length > BODY_PREVIEW;
  const bodyDisplay = !bodyExpanded && longBody
    ? `${(post.body || '').slice(0, BODY_PREVIEW)}…`
    : (post.body || '');

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

  const myRx = post.my_reaction && REACTION_EMOJI[post.my_reaction] ? post.my_reaction : null;

  const galleryItems = useMemo(() => collectGalleryItems(post, comments), [post, comments]);
  const nestedComments = useMemo(
    () => nestComments((comments || []).map(normalizeComment)),
    [comments],
  );
  const openLightboxAt = (url) => {
    const u = String(url || '').trim();
    if (!u) return;
    const idx = galleryItems.findIndex((it) => it.url === u);
    const items = galleryItems.length ? galleryItems : [{ url: u, kind: inferMediaKindFromUrl(u) }];
    const i = idx >= 0 ? idx : 0;
    onOpenLightbox(items, i);
  };

  return (
    <article id={`social-post-${post.id}`} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden scroll-mt-20">
      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
        <Avatar user={author} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-[15px] leading-tight">
                {author.full_name || author.email || 'Thành viên'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title="Nội bộ" />
                {timeAgo(post.created_at)}
                {author.role && <span className="text-gray-400"> · {author.role}</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <details ref={menuRef} className="relative">
                <summary className="list-none cursor-pointer p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 [&::-webkit-details-marker]:hidden" title="Tuỳ chọn bài viết">
                  <MoreHorizontal className="w-4 h-4" />
                </summary>
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  {showEdit && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                      onClick={() => {
                        onEdit?.(post);
                        closePostMenu();
                      }}
                    >
                      <Pencil className="h-4 w-4 shrink-0 text-gray-500" />
                      Sửa bài viết
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                    onClick={() => {
                      onShare?.(post);
                      closePostMenu();
                    }}
                  >
                    <Share2 className="h-4 w-4 shrink-0 text-gray-500" />
                    Sao chép liên kết
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                    onClick={() => {
                      onHideForMe?.(post.id);
                      closePostMenu();
                    }}
                  >
                    <EyeOff className="h-4 w-4 shrink-0 text-gray-500" />
                    Ẩn khỏi bảng tin của tôi
                  </button>
                  {(isAuthor || canMod) && !post.hidden_at && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-amber-800 hover:bg-amber-50"
                      onClick={() => {
                        onHideCompany?.(post.id);
                        closePostMenu();
                      }}
                    >
                      <EyeOff className="h-4 w-4 shrink-0" />
                      Ẩn với cả công ty
                    </button>
                  )}
                  {(isAuthor || canMod) && post.hidden_at && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-emerald-800 hover:bg-emerald-50"
                      onClick={() => {
                        onUnhideCompany?.(post.id);
                        closePostMenu();
                      }}
                    >
                      Hiện lại với công ty
                    </button>
                  )}
                  {showDelete && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-red-700 hover:bg-red-50"
                      onClick={() => {
                        closePostMenu();
                        onDelete(post.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      Xóa bài viết
                    </button>
                  )}
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      {(isScheduledPost(post) || post.visibility === 'selected_users' || post.hidden_at) && (
        <div className="px-4 pb-1 flex flex-wrap gap-1.5">
          {isScheduledPost(post) && (
            <span className="text-[11px] font-medium rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
              Lên lịch: {new Date(post.published_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
          {post.visibility === 'selected_users' && (
            <span className="text-[11px] font-medium rounded-full bg-indigo-100 text-indigo-900 px-2 py-0.5">
              Chỉ người được chọn ({post.audience_users?.length || 0})
            </span>
          )}
          {post.hidden_at && (
            <span className="text-[11px] font-medium rounded-full bg-gray-200 text-gray-700 px-2 py-0.5">
              Đã ẩn khỏi công ty
            </span>
          )}
        </div>
      )}

      <div className="px-4 pb-2">
        <p className="text-[15px] text-gray-800 whitespace-pre-wrap leading-relaxed">{bodyDisplay}</p>
        {longBody && (
          <button
            type="button"
            className="text-sm font-medium text-blue-600 hover:underline mt-1"
            onClick={() => onToggleBody(post.id)}
          >
            {bodyExpanded ? 'Thu gọn' : 'Xem thêm'}
          </button>
        )}
      </div>

      <PostAttachments list={post.attachments} onImageClick={(url) => openLightboxAt(url)} />

      {post.image_url && (
        <button
          type="button"
          onClick={() => openLightboxAt(post.image_url)}
          className="block w-full cursor-zoom-in text-left overflow-hidden rounded-lg border border-gray-100"
        >
          <div className="relative w-full aspect-video bg-gray-100">
            <img src={post.image_url} alt="" className="absolute inset-0 h-full w-full object-contain" />
          </div>
        </button>
      )}

      {post.video_url && (
        <FeedVideoFromUrl url={post.video_url} onExpand={(u) => openLightboxAt(u)} />
      )}

      {post.link_url && (
        <div className="mx-4 mb-3 border border-gray-100 rounded-lg overflow-hidden bg-gray-50">
          <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="flex items-stretch gap-3 p-3 hover:bg-gray-100/80">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 truncate">
                {(() => { try { return new URL(post.link_url).hostname; } catch { return 'Liên kết'; } })()}
              </p>
              <p className="font-semibold text-gray-900 text-sm mt-0.5 line-clamp-2">
                {post.link_title || post.link_url}
              </p>
            </div>
            <span className="self-center text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 shrink-0">
              Mở liên kết
            </span>
          </a>
        </div>
      )}

      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between gap-2 text-sm text-gray-600">
        <span className="flex flex-1 items-center gap-3 flex-wrap min-w-0">
          {(() => {
            const total = post.like_count ?? 0;
            if (total <= 0) return null;
            const rc = post.reaction_counts || {};
            const keys = Object.keys(rc)
              .filter((k) => rc[k] > 0)
              .sort((a, b) => (rc[b] || 0) - (rc[a] || 0))
              .slice(0, 3);
            const open = () => onOpenReactionList?.(post.id);
            if (!keys.length) {
              return (
                <button
                  type="button"
                  onClick={open}
                  className="flex items-center gap-1 rounded-lg px-1 py-0.5 text-blue-700 hover:bg-gray-100"
                >
                  <ThumbsUp className="w-4 h-4 fill-current" />
                  <span>{total}</span>
                </button>
              );
            }
            return (
              <button
                type="button"
                onClick={open}
                className="flex max-w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left text-gray-800 hover:bg-gray-100"
              >
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
                <span className="font-medium tabular-nums">{total}</span>
              </button>
            );
          })()}
          {post.comment_count > 0 && (
            <span className="flex items-center gap-1 text-gray-600">
              <MessageCircle className="w-4 h-4 shrink-0 text-gray-500" />
              <span>{post.comment_count}</span>
            </span>
          )}
        </span>
        {(() => {
          const total = post.like_count ?? 0;
          if (total <= 0) return null;
          const rc = post.reaction_counts || {};
          const keys = Object.keys(rc)
            .filter((k) => rc[k] > 0)
            .sort((a, b) => (rc[b] || 0) - (rc[a] || 0))
            .slice(0, 3);
          if (!keys.length) return null;
          return (
            <button
              type="button"
              onClick={() => onOpenReactionList?.(post.id)}
              className="hidden shrink-0 sm:inline-flex -space-x-1 rounded-lg p-1 hover:bg-gray-100"
              aria-label="Xem cảm xúc"
            >
              {keys.map((k, i) => (
                <span key={k} className="relative inline-flex" style={{ zIndex: keys.length - i }}>
                  <ReactionCircle reactionKey={k} size="sm" />
                </span>
              ))}
            </button>
          );
        })()}
      </div>

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
                    onReaction(post.id, opt.key);
                  }}
                >
                  <ReactionCircle reactionKey={opt.key} size="lg" />
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => onReaction(post.id, 'like')}
            className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              post.liked_by_me ? 'text-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {myRx && myRx !== 'like' ? (
              <ReactionCircle reactionKey={myRx} size="md" />
            ) : (
              <ThumbsUp className={`w-5 h-5 ${post.liked_by_me && (!myRx || myRx === 'like') ? 'fill-current' : ''}`} />
            )}
            {myRx && myRx !== 'like' ? REACTION_OPTIONS.find((o) => o.key === myRx)?.label || 'Thích' : 'Thích'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => onToggleComments(post.id)}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-l border-gray-100 ${
            commentsOpen ? 'text-blue-600 bg-blue-50/30' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          Bình luận
        </button>
        <button
          type="button"
          onClick={() => onShare?.(post)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-l border-gray-100 text-gray-600 hover:bg-gray-50"
          title="Chia sẻ hoặc sao chép liên kết bài viết"
        >
          <Share2 className="w-5 h-5" />
          Chia sẻ
        </button>
      </div>

      {commentsOpen && (
        <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-3 space-y-3">
          {commentsLoading ? (
            <div className="flex justify-center py-4 text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
              {(comments || []).length > 0 ? (
                <SocialCommentBranch
                  nodes={nestedComments}
                  depth={0}
                  postId={post.id}
                  openLightboxUrl={openLightboxAt}
                  onReply={(cid, name) => onReplyToComment(post.id, cid, name)}
                  onCommentReact={onCommentReact}
                />
              ) : (
                <p className="text-center text-xs text-gray-400 py-2">Chưa có bình luận.</p>
              )}
            </div>
          )}
          {replyTo?.id && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-1.5 text-xs text-blue-900">
              <span className="truncate">Trả lời <strong>{replyTo.name}</strong></span>
              <button type="button" className="shrink-0 font-medium text-blue-700 hover:underline" onClick={() => onCancelReplyComment(post.id)}>
                Hủy
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => onCommentText(e.target.value)}
              placeholder={replyTo?.id ? `Trả lời ${replyTo.name}…` : 'Viết bình luận…'}
              className="flex-1 px-3 py-2 rounded-full border border-gray-200 text-sm bg-white"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendComment(post.id); } }}
            />
            <button
              type="button"
              disabled={sendingComment || !commentText.trim()}
              onClick={() => onSendComment(post.id)}
              className="p-2 rounded-full bg-blue-600 text-white disabled:opacity-40"
            >
              {sendingComment ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function SocialFeedPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSystemAdmin = user?.role === 'admin' && !(user?.company_id != null && String(user.company_id).trim() !== '');

  const [companies, setCompanies] = useState([]);
  const [filterCompanyId, setFilterCompanyId] = useState(() => {
    try { return localStorage.getItem(LS_SOCIAL_COMPANY) || ''; } catch { return ''; }
  });

  useEffect(() => {
    if (!isSystemAdmin) return;
    api.get('/companies', { params: { for_module: 'crm' } })
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompanies([]));
  }, [isSystemAdmin]);

  useEffect(() => {
    if (!isSystemAdmin) return;
    try {
      if (filterCompanyId) localStorage.setItem(LS_SOCIAL_COMPANY, filterCompanyId);
      else localStorage.removeItem(LS_SOCIAL_COMPANY);
    } catch { /* ignore */ }
  }, [isSystemAdmin, filterCompanyId]);

  const effectiveCompanyId = useMemo(() => {
    if (isSystemAdmin) return filterCompanyId || '';
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    return cid || '';
  }, [isSystemAdmin, filterCompanyId, user?.company_id]);

  const composerFirstName = useMemo(() => {
    const n = user?.full_name?.trim()?.split(/\s+/)?.[0];
    if (n) return n;
    const em = user?.email?.split('@')[0];
    return em || 'Bạn';
  }, [user?.full_name, user?.email]);

  const [posts, setPosts] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState(null);
  const offsetRef = useRef(0);

  const [composer, setComposer] = useState(() => ({ ...emptyComposerFields() }));
  const [posting, setPosting] = useState(false);
  const [attachSlots, setAttachSlots] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [audienceSearch, setAudienceSearch] = useState('');
  const [userSuggest, setUserSuggest] = useState([]);
  const [toast, setToast] = useState(null);
  const audienceSearchTimer = useRef(null);
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const [openComments, setOpenComments] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentLoading, setCommentLoading] = useState({});
  const [commentDraft, setCommentDraft] = useState({});
  const [sendingComment, setSendingComment] = useState({});
  const [replyToByPost, setReplyToByPost] = useState({});

  const [bodyExpanded, setBodyExpanded] = useState({});
  const sentinelRef = useRef(null);

  const fetchFeed = useCallback(async (append) => {
    if (!effectiveCompanyId && isSystemAdmin) {
      setPosts([]);
      setLoading(false);
      setErr(null);
      return;
    }
    if (!effectiveCompanyId) {
      setErr('Tài khoản chưa gắn công ty.');
      setLoading(false);
      return;
    }
    const off = append ? offsetRef.current : 0;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setErr(null);
    try {
      const params = { limit: 20, offset: off };
      if (isSystemAdmin && effectiveCompanyId) params.company_id = effectiveCompanyId;
      const { data } = await api.get('/internal-social/posts', { params });
      const next = data.posts || [];
      setHasMore(!!data.has_more);
      if (!append) offsetRef.current = 0;
      offsetRef.current += next.length;
      const normalized = (next || []).map(normalizeSocialPost);
      setPosts((prev) => (append ? [...prev, ...normalized] : normalized));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      if (!append) setPosts([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [effectiveCompanyId, isSystemAdmin]);

  const markFeedRead = useCallback(async () => {
    if (!effectiveCompanyId) return;
    try {
      await api.post('/internal-social/mark-read', { company_id: effectiveCompanyId });
      window.dispatchEvent(new Event('internal-social-read'));
    } catch { /* ignore */ }
  }, [effectiveCompanyId]);

  const readMarkedCompanyRef = useRef(null);
  useEffect(() => {
    if (loading || err || !effectiveCompanyId) return;
    if (readMarkedCompanyRef.current === effectiveCompanyId) return;
    readMarkedCompanyRef.current = effectiveCompanyId;
    void markFeedRead();
  }, [loading, err, effectiveCompanyId, markFeedRead]);

  useEffect(() => {
    readMarkedCompanyRef.current = null;
  }, [effectiveCompanyId]);

  useEffect(() => {
    offsetRef.current = 0;
    setPosts([]);
    fetchFeed(false);
  }, [effectiveCompanyId, isSystemAdmin, fetchFeed]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchFeed(true);
  }, [hasMore, loadingMore, loading, fetchFeed]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '120px' },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [hasMore, loadMore]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const postId = searchParams.get('post');
    if (!postId) return;
    if (!isSystemAdmin && !effectiveCompanyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/internal-social/posts/${postId}`);
        if (cancelled || !data?.post) return;
        const n = normalizeSocialPost(data.post);
        setPosts((prev) => {
          if (prev.some((p) => String(p.id) === String(n.id))) return prev;
          return [n, ...prev];
        });
        requestAnimationFrame(() => {
          document.getElementById(`social-post-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        setSearchParams((sp) => {
          const next = new URLSearchParams(sp);
          next.delete('post');
          return next;
        }, { replace: true });
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, effectiveCompanyId, isSystemAdmin, setSearchParams]);

  useEffect(() => {
    if (!composerOpen || composer.visibility !== 'selected_users' || !effectiveCompanyId) {
      setUserSuggest([]);
      return;
    }
    let cancelled = false;
    if (audienceSearchTimer.current) clearTimeout(audienceSearchTimer.current);
    audienceSearchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/users', {
          params: { company_id: effectiveCompanyId, search: audienceSearch.trim() || undefined },
        });
        if (!cancelled) setUserSuggest(data.users || []);
      } catch {
        if (!cancelled) setUserSuggest([]);
      }
    }, 280);
    return () => {
      cancelled = true;
      if (audienceSearchTimer.current) clearTimeout(audienceSearchTimer.current);
    };
  }, [composerOpen, composer.visibility, effectiveCompanyId, audienceSearch]);

  const handlePost = async () => {
    if (posting || attachSlots.some((s) => s.uploading)) return;
    const body = (composer.body ?? '').trim();
    const attachments = attachSlots
      .filter((s) => s.result?.file_url)
      .map((s) => ({
        file_url: s.result.file_url,
        file_name: s.result.file_name,
        mime_type: s.result.mime_type,
        file_size: s.result.file_size,
      }));
    const linkUrl = (composer.link_url ?? '').trim();
    const linkTitle = (composer.link_title ?? '').trim();
    const imageUrl = (composer.image_url ?? '').trim();
    const videoUrl = (composer.video_url ?? '').trim();
    const hasLink = !!linkUrl;
    const hasImgUrl = !!imageUrl;
    const hasVideoUrl = !!videoUrl;
    if (!body && !attachments.length && !hasLink && !hasImgUrl && !hasVideoUrl) return;
    const visibility = composer.visibility === 'selected_users' ? 'selected_users' : 'company';
    if (visibility === 'selected_users' && !(composer.audienceUserIds || []).length) {
      setErr('Chọn ít nhất một nhân viên khi giới hạn người xem bài.');
      return;
    }
    if (composer.publishMode === 'scheduled' && !(composer.scheduledAt || '').trim()) {
      setErr('Chọn ngày giờ đăng bài hoặc chuyển về “Đăng ngay”.');
      return;
    }
    if (!editingPost && isSystemAdmin && !effectiveCompanyId) {
      setErr('Chọn công ty (bộ lọc) trước khi đăng bài.');
      return;
    }
    setPosting(true);
    setErr(null);
    try {
      if (editingPost) {
        const payload = {
          body: body || '',
          link_url: linkUrl || null,
          link_title: linkTitle || null,
          image_url: imageUrl || null,
          video_url: videoUrl || null,
          attachments,
          visibility,
          audience_user_ids: visibility === 'selected_users' ? composer.audienceUserIds : [],
          published_at: composer.publishMode === 'scheduled' && (composer.scheduledAt || '').trim()
            ? new Date(composer.scheduledAt).toISOString()
            : new Date().toISOString(),
        };
        const { data } = await api.put(`/internal-social/posts/${editingPost.id}`, payload);
        const next = normalizeSocialPost(data.post);
        setPosts((prev) => prev.map((p) => (p.id === editingPost.id ? next : p)));
      } else {
        const payload = {
          body: body || '',
          ...(linkUrl ? { link_url: linkUrl } : {}),
          ...(linkTitle ? { link_title: linkTitle } : {}),
          ...(imageUrl ? { image_url: imageUrl } : {}),
          ...(videoUrl ? { video_url: videoUrl } : {}),
          ...(attachments.length ? { attachments } : {}),
          visibility,
          audience_user_ids: visibility === 'selected_users' ? composer.audienceUserIds : [],
          ...(composer.publishMode === 'scheduled' && (composer.scheduledAt || '').trim()
            ? { published_at: new Date(composer.scheduledAt).toISOString() }
            : {}),
        };
        if (isSystemAdmin && effectiveCompanyId) payload.company_id = effectiveCompanyId;
        const { data } = await api.post('/internal-social/posts', payload);
        setPosts((prev) => [normalizeSocialPost(data.post), ...prev]);
      }
      setComposer({ ...emptyComposerFields() });
      setAudienceSearch('');
      setAttachSlots([]);
      setEditingPost(null);
      setComposerOpen(false);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setPosting(false);
    }
  };

  const onPickFiles = (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    if (!picked.length) return;
    setAttachSlots((current) => {
      const room = Math.max(0, MAX_ATTACHMENTS - current.length);
      const slice = picked.slice(0, room);
      if (!slice.length) return current;
      const newRows = slice.map((file) => ({
        localId: crypto.randomUUID(),
        fileName: file.name,
        uploading: true,
      }));
      (async () => {
        for (let i = 0; i < slice.length; i += 1) {
          const localId = newRows[i].localId;
          const file = slice[i];
          try {
            const { data } = await uploadSocialFile(file);
            if (!data?.file_url) throw new Error('Thiếu URL file');
            setAttachSlots((prev) => prev.map((s) => (s.localId === localId
              ? { ...s, uploading: false, result: data }
              : s)));
          } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Lỗi upload';
            setAttachSlots((prev) => prev.map((s) => (s.localId === localId
              ? { ...s, uploading: false, error: msg }
              : s)));
          }
        }
      })();
      return [...current, ...newRows];
    });
  };

  const removeAttach = (localId) => {
    setAttachSlots((prev) => prev.filter((s) => s.localId !== localId));
  };

  const [lightbox, setLightbox] = useState(null);
  const [reactionModalPostId, setReactionModalPostId] = useState(null);

  const openLightbox = (items, index) => {
    const seen = new Set();
    const list = [];
    for (const raw of items || []) {
      let url;
      let kind;
      if (typeof raw === 'string') {
        url = String(raw || '').trim();
        kind = inferMediaKindFromUrl(url);
      } else {
        url = String(raw?.url ?? '').trim();
        kind = raw?.kind === 'video' || raw?.kind === 'image' ? raw.kind : inferMediaKindFromUrl(url);
      }
      if (!url || seen.has(url)) continue;
      seen.add(url);
      list.push({ url, kind });
    }
    if (!list.length) return;
    const i = Math.min(Math.max(0, Number(index) || 0), list.length - 1);
    setLightbox({ items: list, index: i });
  };

  const handleReaction = async (postId, reaction = 'like') => {
    try {
      const { data } = await api.post(`/internal-social/posts/${postId}/like`, { reaction });
      setPosts((prev) => prev.map((p) => (p.id === postId
        ? {
          ...p,
          liked_by_me: data.liked_by_me ?? data.liked,
          like_count: data.like_count,
          my_reaction: data.my_reaction ?? null,
          reaction_counts: data.reaction_counts || {},
        }
        : p)));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowLeft' && lightbox.items?.length > 1) {
        e.preventDefault();
        setLightbox((lb) => {
          if (!lb?.items?.length) return lb;
          const n = lb.items.length;
          return { ...lb, index: (lb.index - 1 + n) % n };
        });
      }
      if (e.key === 'ArrowRight' && lightbox.items?.length > 1) {
        e.preventDefault();
        setLightbox((lb) => {
          if (!lb?.items?.length) return lb;
          const n = lb.items.length;
          return { ...lb, index: (lb.index + 1) % n };
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  useEffect(() => {
    if (!lightbox) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lightbox]);

  const handleDelete = async (postId) => {
    if (!window.confirm('Xóa bài viết này?')) return;
    try {
      await api.delete(`/internal-social/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const handleSharePost = async (post) => {
    const url = `${window.location.origin}/social?post=${post.id}`;
    const snippet = String(post.body || '').trim().slice(0, 120);
    const shareTitle = snippet || 'Bài viết bảng tin nội bộ';
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: shareTitle, text: snippet || shareTitle, url });
        setToast('Đã chia sẻ bài viết.');
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast('Đã sao chép liên kết bài viết.');
    } catch {
      setToast(url);
    }
  };

  const handleHideCompany = async (postId) => {
    if (!window.confirm('Ẩn bài này với toàn bộ công ty? Người khác sẽ không thấy trên bảng tin.')) return;
    try {
      await api.post(`/internal-social/posts/${postId}/hide-company`);
      setPosts((prev) => prev.map((p) => (String(p.id) === String(postId)
        ? { ...p, hidden_at: new Date().toISOString() }
        : p)));
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const handleUnhideCompany = async (postId) => {
    try {
      await api.delete(`/internal-social/posts/${postId}/hide-company`);
      setPosts((prev) => prev.map((p) => (String(p.id) === String(postId) ? { ...p, hidden_at: null } : p)));
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const handleHideForMe = async (postId) => {
    try {
      await api.post(`/internal-social/posts/${postId}/hide-for-me`);
      setPosts((prev) => prev.filter((p) => String(p.id) !== String(postId)));
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const toggleComments = async (postId) => {
    const nextOpen = !openComments[postId];
    setOpenComments((prev) => ({ ...prev, [postId]: nextOpen }));
    if (!nextOpen) return;
    setCommentLoading((c) => ({ ...c, [postId]: true }));
    try {
      const { data } = await api.get(`/internal-social/posts/${postId}/comments`);
      setCommentsByPost((c) => ({ ...c, [postId]: (data.comments || []).map(normalizeComment) }));
    } catch {
      setCommentsByPost((c) => ({ ...c, [postId]: [] }));
    } finally {
      setCommentLoading((c) => ({ ...c, [postId]: false }));
    }
  };

  const sendComment = async (postId) => {
    const text = (commentDraft[postId] || '').trim();
    if (!text) return;
    setSendingComment((s) => ({ ...s, [postId]: true }));
    try {
      const rep = replyToByPost[postId];
      const payload = { body: text, ...(rep?.id ? { parent_id: rep.id } : {}) };
      const { data } = await api.post(`/internal-social/posts/${postId}/comments`, payload);
      setCommentsByPost((c) => ({
        ...c,
        [postId]: [...(c[postId] || []), normalizeComment(data.comment)],
      }));
      setCommentDraft((d) => ({ ...d, [postId]: '' }));
      setReplyToByPost((m) => {
        const n = { ...m };
        delete n[postId];
        return n;
      });
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comment_count: data.comment_count } : p)));
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setSendingComment((s) => ({ ...s, [postId]: false }));
    }
  };

  const handleReplyToComment = (postId, commentId, name) => {
    setReplyToByPost((m) => ({ ...m, [postId]: { id: commentId, name: name || 'Thành viên' } }));
  };

  const handleCancelReplyComment = (postId) => {
    setReplyToByPost((m) => {
      const n = { ...m };
      delete n[postId];
      return n;
    });
  };

  const handleCommentReaction = async (postId, commentId, reaction) => {
    try {
      const { data } = await api.post(`/internal-social/posts/${postId}/comments/${commentId}/reaction`, { reaction });
      const patch = {
        reaction_counts: data.reaction_counts || {},
        my_reaction: data.my_reaction ?? null,
        liked_by_me: data.liked_by_me ?? false,
        reaction_count: data.reaction_count ?? 0,
      };
      setCommentsByPost((ch) => {
        const list = ch[postId] || [];
        return {
          ...ch,
          [postId]: list.map((x) => (x.id === commentId ? { ...x, ...patch } : x)),
        };
      });
    } catch { /* ignore */ }
  };

  const toggleBody = (postId) => {
    setBodyExpanded((b) => ({ ...b, [postId]: !b[postId] }));
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditingPost(null);
    setComposer({ ...emptyComposerFields() });
    setAudienceSearch('');
  };

  useEffect(() => {
    if (!composerOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeComposer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [composerOpen]);

  useEffect(() => {
    if (!composerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [composerOpen]);

  const openComposerModal = () => {
    if (!effectiveCompanyId) return;
    setEditingPost(null);
    setComposer({ ...emptyComposerFields() });
    setAudienceSearch('');
    setAttachSlots([]);
    setComposerOpen(true);
  };

  const openComposerAndPickFiles = () => {
    if (!effectiveCompanyId) return;
    setEditingPost(null);
    setComposer({ ...emptyComposerFields() });
    setAudienceSearch('');
    setAttachSlots([]);
    setComposerOpen(true);
    requestAnimationFrame(() => {
      fileInputRef.current?.click();
    });
  };

  const beginEditPost = (post) => {
    setEditingPost(post);
    setComposer({
      ...emptyComposerFields(),
      body: post.body || '',
      link_url: post.link_url || '',
      link_title: post.link_title || '',
      image_url: post.image_url || '',
      video_url: post.video_url || '',
      publishMode: isScheduledPost(post) ? 'scheduled' : 'now',
      scheduledAt: post.published_at ? isoToDatetimeLocalValue(post.published_at) : '',
      visibility: post.visibility === 'selected_users' ? 'selected_users' : 'company',
      audienceUserIds: (post.audience_users || []).map((u) => String(u.id)).filter(Boolean),
    });
    setAudienceSearch('');
    setAttachSlots(
      (post.attachments || []).map((a) => ({
        localId: String(a.id != null ? a.id : crypto.randomUUID()),
        fileName: a.file_name || 'Tệp',
        uploading: false,
        result: {
          file_url: a.file_url,
          file_name: a.file_name,
          mime_type: a.mime_type,
          file_size: a.file_size,
        },
      })),
    );
    setComposerOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
      <div className="max-w-[816px] mx-auto px-3 py-4 md:py-6 space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
              <Heart className="w-5 h-5 text-white fill-white/20" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Bảng tin nội bộ</h1>
              <p className="text-xs text-gray-500">Chia sẻ nội dung, ảnh/video/file — upload lên kho của công ty.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { offsetRef.current = 0; fetchFeed(false); }}
            className="self-start flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </header>

        {isSystemAdmin && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm">
            <Building2 className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="text-amber-900 shrink-0">Công ty:</span>
            <select
              value={filterCompanyId}
              onChange={(e) => setFilterCompanyId(e.target.value)}
              className="flex-1 min-w-0 border border-amber-200 rounded-lg px-2 py-1.5 bg-white text-sm"
            >
              <option value="">— Chọn công ty —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
          </div>
        )}

        {err && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3">
            {err}
          </div>
        )}

        {/* Thanh kích hoạt + modal tạo bài (kiểu Facebook) */}
        {effectiveCompanyId && (
          <>
            <div className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-gray-200 p-3">
              <Avatar user={user} />
              <button
                type="button"
                onClick={openComposerModal}
                className="flex-1 min-w-0 text-left rounded-full border border-blue-200 bg-gray-50 hover:bg-gray-100 px-4 py-2.5 text-[15px] text-gray-500 transition-colors"
              >
                {composerFirstName} ơi, bạn đang nghĩ gì thế?
              </button>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  title="Video / ảnh"
                  onClick={(e) => { e.preventDefault(); openComposerAndPickFiles(); }}
                  className="p-2 rounded-full hover:bg-gray-100 text-red-500"
                >
                  <Video className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  title="Ảnh hoặc file"
                  onClick={(e) => { e.preventDefault(); openComposerAndPickFiles(); }}
                  className="p-2 rounded-full hover:bg-gray-100 text-green-600"
                >
                  <ImagePlus className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  title="Mở soạn thảo"
                  onClick={(e) => { e.preventDefault(); openComposerModal(); }}
                  className="p-2 rounded-full hover:bg-gray-100 text-amber-500"
                >
                  <Smile className="w-6 h-6" />
                </button>
              </div>
            </div>

            {composerOpen && createPortal(
              (
                <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 pt-8 sm:pt-14">
                  <button
                    type="button"
                    className="fixed inset-0 bg-black/50"
                    aria-label="Đóng"
                    onClick={closeComposer}
                  />
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="social-composer-title"
                    className="relative z-10 my-auto w-full max-w-lg rounded-xl bg-white shadow-2xl border border-gray-200 flex flex-col max-h-[min(90vh,720px)]"
                  >
                    <div className="relative flex items-center justify-center px-12 py-3 border-b border-gray-200 shrink-0">
                      <h2 id="social-composer-title" className="text-lg font-bold text-gray-900">
                        {editingPost ? 'Sửa bài viết' : 'Tạo bài viết'}
                      </h2>
                      <button
                        type="button"
                        onClick={closeComposer}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-gray-500 hover:bg-gray-100"
                        aria-label="Đóng"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
                      <div className="flex items-start gap-3">
                        <Avatar user={user} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900">{user?.full_name || user?.email || 'Thành viên'}</p>
                          <button
                            type="button"
                            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                          >
                            <Globe className="w-3.5 h-3.5 text-gray-600" />
                            Nội bộ công ty
                          </button>
                        </div>
                      </div>

                      <textarea
                        value={composer.body}
                        onChange={(e) => setComposer((c) => ({ ...c, body: e.target.value }))}
                        placeholder={`${composerFirstName} ơi, bạn đang nghĩ gì thế?`}
                        rows={5}
                        className="w-full resize-y min-h-[120px] border-0 focus:ring-0 text-[17px] text-gray-900 placeholder:text-gray-400 p-0"
                        autoFocus
                      />

                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.dwg,.dxf"
                        onChange={onPickFiles}
                      />
                      <input
                        ref={videoInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        accept="video/*"
                        onChange={onPickFiles}
                      />

                      {attachSlots.length > 0 && (
                        <ul className="flex flex-col gap-1.5">
                          {attachSlots.map((s) => (
                            <li
                              key={s.localId}
                              className="flex items-center gap-2 text-sm rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5"
                            >
                              <span className="truncate flex-1 text-gray-800">{s.fileName}</span>
                              {s.uploading && <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                              {s.error && <span className="text-xs text-red-600 truncate max-w-[140px] sm:max-w-[180px]" title={s.error}>{s.error}</span>}
                              {s.result?.file_url && <span className="text-xs text-emerald-600 shrink-0">Đã tải lên</span>}
                              <button
                                type="button"
                                onClick={() => removeAttach(s.localId)}
                                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                                title="Bỏ"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-600">Thêm vào bài viết của bạn</span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            title="Ảnh / file"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={attachSlots.length >= MAX_ATTACHMENTS || attachSlots.some((s) => s.uploading)}
                            className="p-2 rounded-full hover:bg-white text-green-600 disabled:opacity-40"
                          >
                            <ImagePlus className="w-6 h-6" />
                          </button>
                          <button
                            type="button"
                            title="Video"
                            onClick={() => videoInputRef.current?.click()}
                            disabled={attachSlots.length >= MAX_ATTACHMENTS || attachSlots.some((s) => s.uploading)}
                            className="p-2 rounded-full hover:bg-white text-red-500 disabled:opacity-40"
                          >
                            <Video className="w-6 h-6" />
                          </button>
                          <button type="button" className="p-2 rounded-full hover:bg-white text-amber-500 opacity-60" title="Cảm xúc (sắp có)" onClick={(e) => e.preventDefault()}>
                            <Smile className="w-6 h-6" />
                          </button>
                          <button type="button" className="p-2 rounded-full hover:bg-white text-blue-600 opacity-50" title="Địa điểm (sắp có)" onClick={(e) => e.preventDefault()}>
                            <MapPin className="w-6 h-6" />
                          </button>
                          <button type="button" className="p-2 rounded-full hover:bg-white text-gray-500 opacity-50" title="Thêm (sắp có)" onClick={(e) => e.preventDefault()}>
                            <MoreHorizontal className="w-6 h-6" />
                          </button>
                        </div>
                      </div>

                      <details className="group rounded-lg border border-gray-100 bg-white text-sm">
                        <summary className="cursor-pointer px-3 py-2 font-medium text-gray-600 hover:bg-gray-50 rounded-lg list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                          <Link2 className="w-4 h-4" />
                          Liên kết / URL ảnh hoặc video ngoài
                        </summary>
                        <div className="p-3 pt-0 space-y-2 border-t border-gray-100">
                          <div className="relative">
                            <Link2 className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              value={composer.link_url}
                              onChange={(e) => setComposer((c) => ({ ...c, link_url: e.target.value }))}
                              className="w-full pl-8 pr-2 py-1.5 border rounded-lg"
                              placeholder="URL liên kết"
                            />
                          </div>
                          <input
                            value={composer.link_title}
                            onChange={(e) => setComposer((c) => ({ ...c, link_title: e.target.value }))}
                            className="w-full px-2 py-1.5 border rounded-lg"
                            placeholder="Tiêu đề hiển thị"
                          />
                          <div className="relative">
                            <ImageIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              value={composer.image_url}
                              onChange={(e) => setComposer((c) => ({ ...c, image_url: e.target.value }))}
                              className="w-full pl-8 pr-2 py-1.5 border rounded-lg"
                              placeholder="URL ảnh (tuỳ chọn)"
                            />
                          </div>
                          <div className="relative">
                            <Video className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              value={composer.video_url}
                              onChange={(e) => setComposer((c) => ({ ...c, video_url: e.target.value }))}
                              className="w-full pl-8 pr-2 py-1.5 border rounded-lg"
                              placeholder="URL video trực tiếp (.mp4, .webm…)"
                            />
                          </div>
                        </div>
                      </details>

                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 space-y-3 text-sm">
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5">Thời điểm đăng</p>
                          <div className="flex flex-wrap gap-3">
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="publish-mode"
                                checked={composer.publishMode === 'now'}
                                onChange={() => setComposer((c) => ({ ...c, publishMode: 'now' }))}
                              />
                              <span>Đăng ngay</span>
                            </label>
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="publish-mode"
                                checked={composer.publishMode === 'scheduled'}
                                onChange={() => setComposer((c) => ({ ...c, publishMode: 'scheduled' }))}
                              />
                              <span>Hẹn giờ</span>
                            </label>
                          </div>
                          {composer.publishMode === 'scheduled' && (
                            <input
                              type="datetime-local"
                              value={composer.scheduledAt}
                              onChange={(e) => setComposer((c) => ({ ...c, scheduledAt: e.target.value }))}
                              className="mt-2 w-full max-w-xs rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                            />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5">Ai được xem</p>
                          <select
                            value={composer.visibility}
                            onChange={(e) => setComposer((c) => ({
                              ...c,
                              visibility: e.target.value === 'selected_users' ? 'selected_users' : 'company',
                              audienceUserIds: e.target.value === 'selected_users' ? c.audienceUserIds : [],
                            }))}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          >
                            <option value="company">Cả công ty</option>
                            <option value="selected_users">Chỉ nhân viên được chọn</option>
                          </select>
                          {composer.visibility === 'selected_users' && (
                            <div className="mt-2 space-y-2">
                              <input
                                type="search"
                                value={audienceSearch}
                                onChange={(e) => setAudienceSearch(e.target.value)}
                                placeholder="Tìm theo tên hoặc email…"
                                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                              />
                              {(composer.audienceUserIds || []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(composer.audienceUserIds || []).map((id) => {
                                    const fromSuggest = userSuggest.find((u) => String(u.id) === String(id));
                                    const label = fromPost?.full_name || fromPost?.email
                                      || fromSuggest?.full_name || fromSuggest?.email
                                      || `${String(id).slice(0, 8)}…`;
                                    return (
                                      <span
                                        key={id}
                                        className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-900 max-w-[200px]"
                                      >
                                        <span className="truncate">{label}</span>
                                        <button
                                          type="button"
                                          className="shrink-0 text-indigo-700 hover:text-indigo-950"
                                          onClick={() => setComposer((c) => ({
                                            ...c,
                                            audienceUserIds: (c.audienceUserIds || []).filter((x) => x !== id),
                                          }))}
                                          aria-label="Bỏ"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {userSuggest.length > 0 && (
                                <ul className="max-h-36 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 text-sm">
                                  {userSuggest.map((u) => {
                                    const id = String(u.id);
                                    const picked = (composer.audienceUserIds || []).includes(id);
                                    return (
                                      <li key={id}>
                                        <button
                                          type="button"
                                          disabled={picked}
                                          className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-white disabled:opacity-50"
                                          onClick={() => {
                                            if (picked) return;
                                            setComposer((c) => ({
                                              ...c,
                                              audienceUserIds: [...(c.audienceUserIds || []), id],
                                            }));
                                          }}
                                        >
                                          <span className="truncate">{u.full_name || u.email}</span>
                                          <span className="text-xs text-gray-500 truncate max-w-[120px]">{u.email}</span>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-gray-400">
                        Tối đa {MAX_ATTACHMENTS} tệp · file lớn (&gt;48MB) dùng upload tạm đĩa trên server.
                      </p>
                    </div>

                    <div className="shrink-0 border-t border-gray-200 p-3 bg-gray-50">
                      <button
                        type="button"
                        disabled={
                          posting
                          || attachSlots.some((s) => s.uploading)
                          || (!(composer.body ?? '').trim()
                            && !attachSlots.some((s) => s.result?.file_url)
                            && !(composer.link_url ?? '').trim()
                            && !(composer.image_url ?? '').trim()
                            && !(composer.video_url ?? '').trim())
                          || (composer.visibility === 'selected_users' && !(composer.audienceUserIds || []).length)
                          || (composer.publishMode === 'scheduled' && !(composer.scheduledAt || '').trim())
                        }
                        onClick={handlePost}
                        className="w-full py-2.5 rounded-lg text-[15px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                      >
                        {posting
                          ? (editingPost ? 'Đang lưu…' : 'Đang đăng…')
                          : (editingPost ? 'Lưu' : 'Đăng')}
                      </button>
                    </div>
                  </div>
                </div>
              ),
              document.body,
            )}
          </>
        )}

        {loading && !posts.length ? (
          <div className="flex justify-center py-20 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={user?.id || user?.userId}
                currentRole={user?.role}
                onReaction={handleReaction}
                onOpenLightbox={openLightbox}
                onDelete={handleDelete}
                onEdit={beginEditPost}
                onShare={handleSharePost}
                onHideCompany={handleHideCompany}
                onUnhideCompany={handleUnhideCompany}
                onHideForMe={handleHideForMe}
                commentsOpen={!!openComments[post.id]}
                onToggleComments={toggleComments}
                comments={commentsByPost[post.id]}
                commentsLoading={!!commentLoading[post.id]}
                commentText={commentDraft[post.id] || ''}
                onCommentText={(v) => setCommentDraft((d) => ({ ...d, [post.id]: v }))}
                onSendComment={sendComment}
                sendingComment={!!sendingComment[post.id]}
                bodyExpanded={!!bodyExpanded[post.id]}
                onToggleBody={toggleBody}
                replyTo={replyToByPost[post.id] || null}
                onReplyToComment={handleReplyToComment}
                onCancelReplyComment={handleCancelReplyComment}
                onCommentReact={handleCommentReaction}
                onOpenReactionList={(id) => setReactionModalPostId(id)}
              />
            ))}
            {!posts.length && !loading && effectiveCompanyId && (
              <div className="text-center py-16 text-gray-500 text-sm bg-white rounded-xl border border-dashed border-gray-200">
                Chưa có bài viết. Hãy là người đầu tiên đăng lên bảng tin.
              </div>
            )}
            <div ref={sentinelRef} className="h-4" />
            {loadingMore && (
              <div className="flex justify-center py-4 text-gray-400 text-sm">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
      {reactionModalPostId && (
        <PostReactorsModal postId={reactionModalPostId} onClose={() => setReactionModalPostId(null)} />
      )}
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh hoặc video"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            aria-label="Đóng"
          >
            <X className="h-6 w-6" />
          </button>
          {lightbox.items.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white hover:bg-white/25 md:left-4"
                aria-label="Mục trước"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) => {
                    if (!lb?.items?.length) return lb;
                    const n = lb.items.length;
                    return { ...lb, index: (lb.index - 1 + n) % n };
                  });
                }}
              >
                <ChevronLeft className="h-8 w-8 md:h-10 md:w-10" />
              </button>
              <button
                type="button"
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white hover:bg-white/25 md:right-4"
                aria-label="Mục sau"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) => {
                    if (!lb?.items?.length) return lb;
                    const n = lb.items.length;
                    return { ...lb, index: (lb.index + 1) % n };
                  });
                }}
              >
                <ChevronRight className="h-8 w-8 md:h-10 md:w-10" />
              </button>
              <div
                className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white"
                aria-hidden
              >
                {lightbox.index + 1} / {lightbox.items.length}
              </div>
            </>
          )}
          <div className="max-h-[92vh] max-w-full" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const cur = lightbox.items[lightbox.index];
              if (!cur?.url) return null;
              if (cur.kind === 'video') {
                const ytLb = youtubeEmbedId(cur.url);
                const vmLb = vimeoEmbedId(cur.url);
                if (ytLb) {
                  return (
                    <div
                      key={`${lightbox.index}-yt`}
                      className="relative w-[min(92vw,1200px)] aspect-video max-h-[92vh]"
                    >
                      <iframe
                        title="YouTube"
                        src={`https://www.youtube-nocookie.com/embed/${ytLb}`}
                        className="absolute inset-0 h-full w-full rounded-sm"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  );
                }
                if (vmLb) {
                  return (
                    <div
                      key={`${lightbox.index}-vm`}
                      className="relative w-[min(92vw,1200px)] aspect-video max-h-[92vh]"
                    >
                      <iframe
                        title="Vimeo"
                        src={`https://player.vimeo.com/video/${vmLb}`}
                        className="absolute inset-0 h-full w-full rounded-sm"
                        allowFullScreen
                      />
                    </div>
                  );
                }
                return (
                  <video
                    key={`${lightbox.index}-${cur.url}`}
                    src={cur.url}
                    controls
                    playsInline
                    className="max-h-[92vh] max-w-full"
                  />
                );
              }
              return (
                <img
                  src={cur.url}
                  alt=""
                  className="max-h-[92vh] max-w-full object-contain"
                />
              );
            })()}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
