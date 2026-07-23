import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  ThumbsUp, MessageCircle, FileText, Loader2, Send, X,
  ChevronLeft, ChevronRight as ChevRight, Heart, MoreHorizontal,
  Pencil, Share2, EyeOff, Trash2,
} from 'lucide-react';
import api from '../lib/api';
import { getInitials, timeAgo } from '../lib/utils';

const MODERATOR_ROLES = new Set([
  'admin', 'manager', 'director', 'supervisor',
  'superadmin', 'super_admin', 'administrator', 'region_admin',
]);

function isModerator(role) {
  return MODERATOR_ROLES.has(String(role || '').toLowerCase());
}

const BODY_PREVIEW = 280;

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

const REACTION_TEXT_COLOR = {
  like: 'text-[#1877f2]',
  love: 'text-rose-600',
  care: 'text-amber-600',
  haha: 'text-amber-600',
  wow: 'text-amber-600',
  sad: 'text-amber-600',
  angry: 'text-orange-700',
};

/** Icon tròn kiểu Facebook (đồng bộ với bảng tin) */
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

function youtubeEmbedId(url) {
  try {
    const u = new URL(String(url).trim());
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^[\w-]{11}$/.test(id)) return id;
    }
    if (h.endsWith('youtube.com') || h.endsWith('youtube-nocookie.com')) {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v');
        if (v && /^[\w-]{11}$/.test(v)) return v;
      }
      const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[2];
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
    }
  } catch { /* */ }
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

function getEmbedInfo(url) {
  const yt = youtubeEmbedId(url);
  if (yt) return { provider: 'youtube', id: yt, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` };
  const vm = vimeoEmbedId(url);
  if (vm) return { provider: 'vimeo', id: vm, thumb: null };
  return null;
}

function inferKindFromUrl(url) {
  const u = String(url || '').toLowerCase();
  if (youtubeEmbedId(url) || vimeoEmbedId(url)) return 'video';
  if (/\.(mp4|webm|ogg|mov|m4v|avi|mkv)(\?|#|$)/.test(u)) return 'video';
  return 'image';
}

function isScheduled(post) {
  if (!post?.published_at) return false;
  return new Date(post.published_at).getTime() > Date.now();
}

function Avatar({ user, size = 'md' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';
  const name = user?.full_name || user?.email || '?';
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={name}
        title={name}
        className={`${dim} shrink-0 rounded-full object-cover border border-gray-200 bg-gray-100`}
      />
    );
  }
  return (
    <div
      className={`${dim} shrink-0 flex items-center justify-center rounded-full bg-blue-600 font-semibold text-white`}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

function AuthorLink({ user, className = '', children }) {
  const label = children ?? (user?.full_name || user?.email || 'Thành viên');
  if (!user?.id) return <span className={className}>{label}</span>;
  return (
    <Link to={`/social/u/${user.id}`} className={`hover:underline ${className}`}>
      {label}
    </Link>
  );
}

function FeedVideoFromUrl({ url }) {
  const embed = getEmbedInfo(url);
  if (embed?.provider === 'youtube') {
    return (
      <div className="relative w-full overflow-hidden rounded-lg border border-gray-100 bg-black">
        <div className="relative w-full aspect-video">
          <iframe
            title="YouTube"
            src={`https://www.youtube-nocookie.com/embed/${embed.id}`}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    );
  }
  if (embed?.provider === 'vimeo') {
    return (
      <div className="relative w-full overflow-hidden rounded-lg border border-gray-100 bg-black">
        <div className="relative w-full aspect-video">
          <iframe
            title="Vimeo"
            src={`https://player.vimeo.com/video/${embed.id}`}
            className="absolute inset-0 h-full w-full"
            allowFullScreen
          />
        </div>
      </div>
    );
  }
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-gray-100 bg-black">
      <div className="relative w-full aspect-video">
        <video src={url} controls className="absolute inset-0 h-full w-full object-contain" playsInline preload="metadata" />
      </div>
    </div>
  );
}

function MediaGallery({ videos, images, onOpenImage }) {
  if (!videos?.length && !images?.length) return null;
  const max = Math.min(images.length, 4);
  const slice = images.slice(0, max);
  const extra = images.length - max;
  const gridCls = max === 1
    ? 'grid-cols-1'
    : 'grid-cols-2';

  return (
    <div className="space-y-1">
      {videos.map((it) => (
        <FeedVideoFromUrl key={it.url} url={it.url} />
      ))}
      {slice.length > 0 && (
        <div className={`grid ${gridCls} gap-1 rounded-lg overflow-hidden`}>
          {slice.map((it, i) => (
            <button
              key={`${it.url}-${i}`}
              type="button"
              onClick={() => onOpenImage(i)}
              className="relative block w-full overflow-hidden bg-gray-100 group"
              style={{ aspectRatio: max === 1 ? '16/9' : '1/1' }}
            >
              <img
                src={it.url}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              {i === max - 1 && extra > 0 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white text-lg font-semibold">
                  +{extra}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaLightbox({ items, index, onClose, onPrev, onNext }) {
  useEffect(() => {
    if (index == null) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, onClose, onPrev, onNext]);
  if (index == null || index < 0 || !items[index]) return null;
  const cur = items[index];
  return (
    <div className="fixed inset-0 z-[80] bg-black/90 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white text-sm" onClick={(e) => e.stopPropagation()}>
        <span>{index + 1} / {items.length}</span>
        <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label="Đóng">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 relative flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {items.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Trước"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <div className="max-h-[88vh] max-w-[92vw] flex items-center justify-center">
          <img key={cur.url} src={cur.url} alt="" className="max-h-[88vh] max-w-[92vw] object-contain rounded-lg" />
        </div>
        {items.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Sau"
          >
            <ChevRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}

function ReactionSummary({ post }) {
  const total = Number(post.like_count) || 0;
  const rc = post.reaction_counts || {};
  const topKeys = Object.keys(rc).filter((k) => rc[k] > 0)
    .sort((a, b) => (rc[b] || 0) - (rc[a] || 0))
    .slice(0, 3);
  if (!total) return null;
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span className="flex items-center -space-x-1">
        {topKeys.map((k, i) => (
          <span key={k} className="relative inline-flex" style={{ zIndex: topKeys.length - i }}>
            <ReactionCircle reactionKey={k} size="sm" />
          </span>
        ))}
      </span>
      <span className="tabular-nums font-medium">{total}</span>
    </div>
  );
}

function CommentItem({ c }) {
  return (
    <div className="flex gap-2">
      {c.author?.id ? (
        <Link to={`/social/u/${c.author.id}`} className="shrink-0">
          <Avatar user={c.author} size="sm" />
        </Link>
      ) : (
        <Avatar user={c.author} size="sm" />
      )}
      <div className="min-w-0">
        <div className="inline-block max-w-full rounded-2xl bg-gray-100 px-3 py-2">
          <AuthorLink user={c.author} className="block text-xs font-semibold text-gray-900" />
          <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{c.body}</p>
        </div>
        <p className="mt-0.5 pl-3 text-[11px] text-gray-500">{timeAgo(c.created_at)}</p>
      </div>
    </div>
  );
}

export default function SocialProfileFullCard({ post, currentUserId, currentRole, onChange, onDelete, onEdit }) {
  const author = post.author || {};
  const navigate = useNavigate();
  const isAuthor = !!currentUserId && String(author.id || '') === String(currentUserId);
  const canMod = isModerator(currentRole);
  const showEdit = isAuthor || canMod;
  const showDelete = isAuthor || canMod;
  const menuBtnRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRect, setMenuRect] = useState(null);
  const closeMenu = () => setMenuOpen(false);
  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    if (menuBtnRef.current) setMenuRect(menuBtnRef.current.getBoundingClientRect());
    setMenuOpen(true);
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => closeMenu();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [rxOpen, setRxOpen] = useState(false);
  const rxTimer = useRef(null);
  const rxAnchorRef = useRef(null);
  const [rxAnchorRect, setRxAnchorRect] = useState(null);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [localPost, setLocalPost] = useState(post);

  useEffect(() => { setLocalPost(post); }, [post]);

  const openRx = () => {
    if (rxTimer.current) clearTimeout(rxTimer.current);
    if (rxAnchorRef.current) setRxAnchorRect(rxAnchorRef.current.getBoundingClientRect());
    setRxOpen(true);
  };
  const scheduleCloseRx = () => {
    if (rxTimer.current) clearTimeout(rxTimer.current);
    rxTimer.current = setTimeout(() => setRxOpen(false), 220);
  };
  useEffect(() => {
    if (!rxOpen) return undefined;
    const update = () => {
      if (rxAnchorRef.current) setRxAnchorRect(rxAnchorRef.current.getBoundingClientRect());
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [rxOpen]);

  const longBody = (localPost.body || '').length > BODY_PREVIEW;
  const bodyDisplay = !bodyExpanded && longBody
    ? `${(localPost.body || '').slice(0, BODY_PREVIEW)}…`
    : (localPost.body || '');

  const bodyVideoEmbed = useMemo(() => {
    const t = String(localPost.body || '').trim();
    if (!t || /\s/.test(t)) return null;
    if (!/^https?:\/\//i.test(t)) return null;
    return getEmbedInfo(t) ? t : null;
  }, [localPost.body]);

  const linkVideoUrl = useMemo(() => {
    const url = String(localPost.link_url || '').trim();
    if (!url) return null;
    return getEmbedInfo(url) ? url : null;
  }, [localPost.link_url]);

  const { videoItems, imageItems } = useMemo(() => {
    const videos = [];
    const images = [];
    const seen = new Set();
    const push = (url, kind) => {
      const u = String(url || '').trim();
      if (!u || seen.has(u)) return;
      seen.add(u);
      const k = kind || inferKindFromUrl(u);
      if (k === 'video') videos.push({ url: u, kind: 'video' });
      else images.push({ url: u, kind: 'image' });
    };
    if (localPost.image_url) push(localPost.image_url, 'image');
    if (localPost.video_url) push(localPost.video_url, 'video');
    if (linkVideoUrl) push(linkVideoUrl, 'video');
    if (bodyVideoEmbed) push(bodyVideoEmbed, 'video');
    const atts = [...(localPost.attachments || [])].sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
    for (const a of atts) {
      const mt = String(a.mime_type || '').toLowerCase();
      if (mt.startsWith('image/')) push(a.file_url, 'image');
      else if (mt.startsWith('video/')) push(a.file_url, 'video');
    }
    return { videoItems: videos, imageItems: images };
  }, [localPost, linkVideoUrl, bodyVideoEmbed]);

  const fileAttachments = useMemo(
    () => (localPost.attachments || []).filter((a) => {
      const mt = String(a.mime_type || '').toLowerCase();
      return !mt.startsWith('image/') && !mt.startsWith('video/');
    }),
    [localPost.attachments],
  );

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const { data } = await api.get(`/internal-social/posts/${localPost.id}/comments`);
      setComments(Array.isArray(data?.comments) ? data.comments : []);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [localPost.id]);

  const toggleComments = useCallback(() => {
    setShowComments((v) => {
      const next = !v;
      if (next && comments.length === 0) loadComments();
      return next;
    });
  }, [comments.length, loadComments]);

  const sendComment = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/internal-social/posts/${localPost.id}/comments`, { body: text });
      const c = data?.comment;
      if (c) setComments((prev) => [...prev, c]);
      setDraft('');
      setLocalPost((p) => {
        const next = { ...p, comment_count: (Number(p.comment_count) || 0) + 1 };
        onChange?.(next);
        return next;
      });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không gửi được bình luận');
    } finally {
      setSending(false);
    }
  };

  const handleEdit = () => {
    closeMenu();
    if (onEdit) {
      onEdit(localPost);
      return;
    }
    const authorId = localPost.author?.id;
    if (authorId) {
      navigate(`/social/u/${authorId}?edit=${localPost.id}`);
      return;
    }
    navigate(`/social?edit=${localPost.id}`);
  };

  const handleShare = async () => {
    closeMenu();
    const url = `${window.location.origin}/social?post=${localPost.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast('Đã sao chép liên kết bài viết');
    } catch {
      setToast(url);
    }
  };

  const handleHideForMe = async () => {
    closeMenu();
    if (!confirm('Ẩn bài viết này khỏi bảng tin của bạn?')) return;
    try {
      await api.post(`/internal-social/posts/${localPost.id}/hide-for-me`);
      onDelete?.(localPost.id);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không ẩn được bài');
    }
  };

  const handleHideCompany = async () => {
    closeMenu();
    if (!confirm('Ẩn bài viết này khỏi cả công ty?')) return;
    try {
      await api.post(`/internal-social/posts/${localPost.id}/hide-company`);
      setLocalPost((p) => {
        const next = { ...p, hidden_at: new Date().toISOString() };
        onChange?.(next);
        return next;
      });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không ẩn được bài');
    }
  };

  const handleUnhideCompany = async () => {
    closeMenu();
    try {
      await api.delete(`/internal-social/posts/${localPost.id}/hide-company`);
      setLocalPost((p) => {
        const next = { ...p, hidden_at: null };
        onChange?.(next);
        return next;
      });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không hiện lại được bài');
    }
  };

  const handleDelete = async () => {
    closeMenu();
    if (!confirm('Xóa bài viết này? Hành động không thể hoàn tác.')) return;
    try {
      await api.delete(`/internal-social/posts/${localPost.id}`);
      onDelete?.(localPost.id);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không xóa được bài');
    }
  };

  const sendReaction = async (key) => {
    try {
      const { data } = await api.post(`/internal-social/posts/${localPost.id}/like`, { reaction: key });
      setLocalPost((p) => {
        const next = {
          ...p,
          like_count: Number(data?.like_count ?? p.like_count) || 0,
          liked_by_me: !!data?.liked_by_me,
          my_reaction: data?.my_reaction ?? null,
          reaction_counts: data?.reaction_counts || p.reaction_counts || {},
        };
        onChange?.(next);
        return next;
      });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không thả được cảm xúc');
    }
  };

  const myRx = localPost.my_reaction && REACTION_EMOJI[localPost.my_reaction] ? localPost.my_reaction : null;
  const likeLabel = myRx ? (REACTION_OPTIONS.find((o) => o.key === myRx)?.label || 'Thích') : 'Thích';

  return (
    <article className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <header className="px-4 pt-3 pb-2 flex items-start gap-3">
        {author.id ? (
          <Link to={`/social/u/${author.id}`} className="shrink-0 rounded-full hover:opacity-90" title="Xem trang cá nhân">
            <Avatar user={author} />
          </Link>
        ) : (
          <Avatar user={author} />
        )}
        <div className="min-w-0 flex-1">
          <AuthorLink user={author} className="font-semibold text-gray-900 text-[15px] leading-tight" />
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title="Nội bộ" />
            {timeAgo(localPost.created_at)}
            {author.role && <span className="text-gray-400"> · {author.role}</span>}
          </p>
        </div>
        <button
          ref={menuBtnRef}
          type="button"
          className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
          title="Tuỳ chọn bài viết"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={toggleMenu}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && menuRect && typeof document !== 'undefined' && createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: 99998 }} onClick={closeMenu} aria-hidden />
            <div
              role="menu"
              style={{
                position: 'fixed',
                top: menuRect.bottom + 4,
                left: Math.max(8, Math.min(menuRect.right - 224, window.innerWidth - 232)),
                zIndex: 99999,
              }}
              className="w-56 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {showEdit && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                  onClick={handleEdit}
                >
                  <Pencil className="h-4 w-4 shrink-0 text-gray-500" />
                  Sửa bài viết
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4 shrink-0 text-gray-500" />
                Sao chép liên kết
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-800 hover:bg-gray-50"
                onClick={handleHideForMe}
              >
                <EyeOff className="h-4 w-4 shrink-0 text-gray-500" />
                Ẩn khỏi bảng tin của tôi
              </button>
              {(isAuthor || canMod) && !localPost.hidden_at && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-amber-800 hover:bg-amber-50"
                  onClick={handleHideCompany}
                >
                  <EyeOff className="h-4 w-4 shrink-0" />
                  Ẩn khỏi cả công ty
                </button>
              )}
              {(isAuthor || canMod) && localPost.hidden_at && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-emerald-800 hover:bg-emerald-50"
                  onClick={handleUnhideCompany}
                >
                  <EyeOff className="h-4 w-4 shrink-0" />
                  Hiện lại với công ty
                </button>
              )}
              {showDelete && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-red-700 hover:bg-red-50"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Xóa bài viết
                </button>
              )}
            </div>
          </>,
          document.body,
        )}
      </header>

      {(isAuthor || canMod) && isScheduled(localPost) && (
        <div className="px-4 pb-1 flex flex-wrap gap-1.5">
          <span className="text-[11px] font-medium rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
            Lên lịch: {new Date(localPost.published_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        </div>
      )}

      {bodyDisplay && !bodyVideoEmbed && (
        <div className="px-4 pb-2">
          <p className="text-[15px] text-gray-800 whitespace-pre-wrap leading-relaxed">{bodyDisplay}</p>
          {longBody && (
            <button
              type="button"
              className="text-sm font-medium text-blue-600 hover:underline mt-1"
              onClick={() => setBodyExpanded((v) => !v)}
            >
              {bodyExpanded ? 'Thu gọn' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}

      {localPost.link_url && !linkVideoUrl && !localPost.image_url && (
        <a
          href={localPost.link_url}
          target="_blank"
          rel="noreferrer"
          className="mx-4 mb-2 block rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-blue-700 hover:bg-gray-100 truncate"
        >
          {localPost.link_title || localPost.link_url}
        </a>
      )}

      {(videoItems.length > 0 || imageItems.length > 0) && (
        <div className="px-2 pb-2">
          <MediaGallery
            videos={videoItems}
            images={imageItems}
            onOpenImage={(i) => setLightboxIdx(i)}
          />
        </div>
      )}

      {fileAttachments.length > 0 && (
        <div className="px-4 pb-2 space-y-1.5">
          {fileAttachments.map((a) => (
            <a
              key={a.id || a.file_url}
              href={a.file_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
            >
              <FileText className="h-4 w-4 text-gray-500 shrink-0" />
              <span className="truncate flex-1">{a.file_name || 'Tệp đính kèm'}</span>
              {a.file_size ? (
                <span className="text-xs text-gray-500 shrink-0">{Math.round((a.file_size || 0) / 1024)} KB</span>
              ) : null}
            </a>
          ))}
        </div>
      )}

      {(Number(localPost.like_count) > 0 || Number(localPost.comment_count) > 0) && (
        <div className="px-4 py-1.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
          <ReactionSummary post={localPost} />
          {Number(localPost.comment_count) > 0 && (
            <button
              type="button"
              onClick={toggleComments}
              className="hover:underline"
            >
              {localPost.comment_count} bình luận
            </button>
          )}
        </div>
      )}

      <div className="px-2 py-1 border-t border-gray-100 grid grid-cols-2 text-sm font-medium text-gray-600">
        <div
          ref={rxAnchorRef}
          className="relative"
          onMouseEnter={openRx}
          onMouseLeave={scheduleCloseRx}
        >
          {rxOpen && rxAnchorRect && createPortal(
            <div
              role="menu"
              style={{
                position: 'fixed',
                top: Math.max(8, rxAnchorRect.top - 12 - 58),
                left: Math.min(
                  Math.max(8, rxAnchorRect.left + rxAnchorRect.width / 2 - 169),
                  Math.max(8, window.innerWidth - 8 - 338),
                ),
                zIndex: 60,
              }}
              className="flex items-center gap-0.5 rounded-full border border-gray-200/90 bg-white/95 px-2 py-1.5 shadow-[0_2px_16px_rgba(0,0,0,0.18)] backdrop-blur-sm"
              onMouseEnter={openRx}
              onMouseLeave={scheduleCloseRx}
            >
              {REACTION_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  title={opt.label}
                  className="rounded-full p-0.5 transition-transform hover:scale-125 hover:z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
                  onClick={() => { setRxOpen(false); sendReaction(opt.key); }}
                >
                  <ReactionCircle reactionKey={opt.key} size="lg" />
                </button>
              ))}
            </div>,
            document.body,
          )}
          <button
            type="button"
            onClick={() => sendReaction(myRx || 'like')}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded-md hover:bg-gray-100 ${myRx ? (REACTION_TEXT_COLOR[myRx] || 'text-[#1877f2]') : ''}`}
          >
            {myRx ? <ReactionCircle reactionKey={myRx} size="sm" /> : <ThumbsUp className="h-4 w-4" />}
            <span>{likeLabel}</span>
          </button>
        </div>
        <button
          type="button"
          onClick={toggleComments}
          className="flex items-center justify-center gap-2 py-2 rounded-md hover:bg-gray-100"
        >
          <MessageCircle className="h-4 w-4" />
          Bình luận
        </button>
      </div>

      {showComments && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-3 space-y-3">
          {commentsLoading ? (
            <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-gray-500" /></div>
          ) : (
            <div className="space-y-2">
              {comments.length === 0 && (
                <p className="text-xs text-gray-500 text-center">Chưa có bình luận. Hãy là người đầu tiên.</p>
              )}
              {comments.map((c) => (
                <CommentItem key={c.id} c={c} />
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Avatar user={{ id: currentUserId }} size="sm" />
            <div className="flex-1 flex items-end gap-1.5 rounded-2xl bg-white border border-gray-200 px-3 py-1.5">
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendComment();
                  }
                }}
                placeholder="Viết bình luận…"
                className="flex-1 resize-none bg-transparent text-sm focus:outline-none min-h-[1.5rem] max-h-32"
              />
              <button
                type="button"
                disabled={sending || !draft.trim()}
                onClick={sendComment}
                className="rounded-full p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Gửi"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      <MediaLightbox
        items={imageItems}
        index={lightboxIdx}
        onClose={() => setLightboxIdx(null)}
        onPrev={() => setLightboxIdx((i) => (i == null || i <= 0 ? i : i - 1))}
        onNext={() => setLightboxIdx((i) => (i == null || i >= imageItems.length - 1 ? i : i + 1))}
      />
      {toast && createPortal(
        <div className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>,
        document.body,
      )}
    </article>
  );
}
