import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Camera, Image as ImageIcon, Loader2, Pencil,
  Building2, ArrowLeft, Calendar, Mail, Phone, Trash2,
  FileText, Video as VideoIcon, X, ChevronLeft, ChevronRight as ChevRight,
  Play, Award, ShieldCheck, Hash, Trophy,
  User as UserIcon, Info as InfoIcon, BadgeCheck, Sparkles,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { getInitials, timeAgo } from '../lib/utils';
import SocialProfileFullCard from '../components/SocialProfileFullCard';
import SocialPostEditComposer from '../components/SocialPostEditComposer';
import EditMyNameModal from '../components/EditMyNameModal';
import { normalizeSocialPost } from '../lib/internalSocialPost';

const UPLOAD_STREAM_BYTES = 48 * 1024 * 1024;

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
    if (!u.hostname.replace(/^www\./, '').endsWith('vimeo.com')) return null;
    const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

function getEmbedInfo(url) {
  const yt = youtubeEmbedId(url);
  if (yt) return { provider: 'youtube', id: yt, thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` };
  const vm = vimeoEmbedId(url);
  if (vm) return { provider: 'vimeo', id: vm, thumb: null };
  return null;
}

function uploadSocialFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const useStream = file.size > UPLOAD_STREAM_BYTES || String(file.type || '').startsWith('video/');
  const url = useStream ? '/upload/internal-social-stream' : '/upload/internal-social';
  const timeout = useStream ? 600000 : 120000;
  return api.post(url, fd, { timeout });
}

function ProfileAvatar({ profile, size = 'lg' }) {
  const dim = size === 'lg' ? 'h-40 w-40 text-3xl' : 'h-12 w-12 text-sm';
  const name = profile?.full_name || profile?.email || '?';
  if (profile?.avatar) {
    return (
      <img
        src={profile.avatar}
        alt={name}
        className={`${dim} shrink-0 rounded-full border-4 border-white object-cover shadow-md bg-gray-100`}
      />
    );
  }
  return (
    <div
      className={`${dim} shrink-0 flex items-center justify-center rounded-full border-4 border-white bg-blue-600 font-semibold text-white shadow-md`}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

function EditBioModal({ open, initial, onClose, onSave, saving }) {
  const [val, setVal] = useState(initial || '');
  useEffect(() => { if (open) setVal(initial || ''); }, [open, initial]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="px-4 pt-4 pb-2 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Cập nhật tiểu sử</h3>
        </div>
        <div className="p-4 space-y-2">
          <textarea
            rows={5}
            maxLength={500}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Vài dòng giới thiệu về bạn…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none"
          />
          <p className="text-[11px] text-gray-500 text-right">{val.length}/500</p>
        </div>
        <div className="px-4 pb-4 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >Huỷ</button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(val.trim())}
            className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
          >{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
}

function MediaLightbox({ items, index, onClose, onPrev, onNext }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  if (index == null || index < 0 || !items[index]) return null;
  const cur = items[index];

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/90 flex flex-col"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white text-sm" onClick={(e) => e.stopPropagation()}>
        <span>{index + 1} / {items.length}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
          aria-label="Đóng"
        >
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
          {cur.kind === 'video' ? (() => {
            const embed = getEmbedInfo(cur.url);
            if (embed?.provider === 'youtube') {
              return (
                <div className="aspect-video w-[min(92vw,1400px)] max-h-[88vh] bg-black rounded-lg overflow-hidden">
                  <iframe
                    key={cur.url}
                    title="YouTube"
                    src={`https://www.youtube-nocookie.com/embed/${embed.id}?autoplay=1`}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              );
            }
            if (embed?.provider === 'vimeo') {
              return (
                <div className="aspect-video w-[min(92vw,1400px)] max-h-[88vh] bg-black rounded-lg overflow-hidden">
                  <iframe
                    key={cur.url}
                    title="Vimeo"
                    src={`https://player.vimeo.com/video/${embed.id}?autoplay=1`}
                    className="h-full w-full"
                    allowFullScreen
                  />
                </div>
              );
            }
            return (
              <video
                key={cur.url}
                src={cur.url}
                controls
                autoPlay
                className="max-h-[88vh] max-w-[92vw] rounded-lg bg-black"
              />
            );
          })() : (
            <img
              key={cur.url}
              src={cur.url}
              alt=""
              className="max-h-[88vh] max-w-[92vw] object-contain rounded-lg"
            />
          )}
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

function MediaTile({ item, onOpen }) {
  const embed = item.kind === 'video' ? getEmbedInfo(item.url) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
      title={item.kind === 'video' ? 'Video' : 'Ảnh'}
    >
      {item.kind === 'video' ? (
        <>
          {embed?.thumb ? (
            <img
              src={embed.thumb}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : embed ? (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
          ) : (
            <video
              src={item.url}
              className="absolute inset-0 h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow">
              <Play className="h-4 w-4 fill-current" />
            </span>
          </span>
          {embed?.provider === 'youtube' && (
            <span className="absolute bottom-1 left-1 rounded bg-red-600/95 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">YouTube</span>
          )}
          {embed?.provider === 'vimeo' && (
            <span className="absolute bottom-1 left-1 rounded bg-sky-600/95 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">Vimeo</span>
          )}
        </>
      ) : (
        <img
          src={item.url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
        />
      )}
    </button>
  );
}

export default function SocialProfilePage() {
  const { userId } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [editingPost, setEditingPost] = useState(null);
  const composerRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [tab, setTab] = useState('posts');

  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsErr, setPostsErr] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const [media, setMedia] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaErr, setMediaErr] = useState(null);
  const [mediaHasMore, setMediaHasMore] = useState(false);
  const [mediaNextOffset, setMediaNextOffset] = useState(0);
  const [mediaLoadingMore, setMediaLoadingMore] = useState(false);

  const [certs, setCerts] = useState([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [certsErr, setCertsErr] = useState(null);
  const [certsLoaded, setCertsLoaded] = useState(false);

  const [lightboxIdx, setLightboxIdx] = useState(null);

  const isOwner = !!profile && !!user && String(profile.id) === String(user.id);

  const avatarInput = useRef(null);
  const coverInput = useRef(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get(`/internal-social/profile/${userId}`);
      setProfile(data?.profile || null);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadPosts = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setPostsLoading(true);
    setPostsErr(null);
    try {
      const { data } = await api.get(`/internal-social/profile/${userId}/posts`, {
        params: { limit: 12, offset },
      });
      const arr = Array.isArray(data?.posts) ? data.posts : [];
      setPosts((prev) => (append ? [...prev, ...arr] : arr));
      setHasMore(!!data?.has_more);
      setNextOffset(Number(data?.next_offset) || 0);
    } catch (e) {
      setPostsErr(e.response?.data?.error || e.message);
    } finally {
      setPostsLoading(false);
      setLoadingMore(false);
    }
  }, [userId]);

  const loadMedia = useCallback(async (offset = 0, append = false, kind = 'all') => {
    if (append) setMediaLoadingMore(true);
    else setMediaLoading(true);
    setMediaErr(null);
    try {
      const { data } = await api.get(`/internal-social/profile/${userId}/media`, {
        params: { limit: 60, offset, kind },
      });
      const arr = Array.isArray(data?.items) ? data.items : [];
      setMedia((prev) => (append ? [...prev, ...arr] : arr));
      setMediaHasMore(!!data?.has_more);
      setMediaNextOffset(Number(data?.next_offset) || 0);
    } catch (e) {
      setMediaErr(e.response?.data?.error || e.message);
    } finally {
      setMediaLoading(false);
      setMediaLoadingMore(false);
    }
  }, [userId]);

  const loadCerts = useCallback(async () => {
    setCertsLoading(true);
    setCertsErr(null);
    try {
      const { data } = await api.get(`/knowledge/users/${userId}/certificates`);
      setCerts(Array.isArray(data?.certificates) ? data.certificates : []);
      setCertsLoaded(true);
    } catch (e) {
      setCertsErr(e.response?.data?.error || e.message);
    } finally {
      setCertsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
    loadPosts(0, false);
    loadCerts();
  }, [loadProfile, loadPosts, loadCerts]);

  const beginEditPost = useCallback((post) => {
    setTab('posts');
    setEditingPost(post);
  }, []);

  useEffect(() => {
    if (!editingPost) return;
    const frame = requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [editingPost?.id]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/internal-social/posts/${editId}`);
        if (cancelled || !data?.post) return;
        beginEditPost(normalizeSocialPost(data.post));
      } catch {
        /* ignore */
      } finally {
        setSearchParams((sp) => {
          const next = new URLSearchParams(sp);
          next.delete('edit');
          return next;
        }, { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, setSearchParams, beginEditPost]);

  useEffect(() => {
    if (tab === 'photos') loadMedia(0, false, 'image');
    else if (tab === 'videos') loadMedia(0, false, 'video');
    else if (tab === 'certificates' && !certsLoaded) loadCerts();
  }, [tab, loadMedia, loadCerts, certsLoaded]);

  const handleAvatarPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Vui lòng chọn ảnh.'); return; }
    setSavingAvatar(true);
    try {
      const up = await uploadSocialFile(file);
      const url = up.data?.file_url;
      if (!url) throw new Error('Upload thất bại');
      const { data } = await api.patch('/internal-social/profile/me', { avatar: url });
      setProfile((p) => (p ? { ...p, avatar: data?.profile?.avatar || url } : p));
    } catch (er) {
      alert(er.response?.data?.error || er.message || 'Không đổi được ảnh đại diện');
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleCoverPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Vui lòng chọn ảnh.'); return; }
    setSavingCover(true);
    try {
      const up = await uploadSocialFile(file);
      const url = up.data?.file_url;
      if (!url) throw new Error('Upload thất bại');
      const { data } = await api.patch('/internal-social/profile/me', { cover_url: url });
      setProfile((p) => (p ? { ...p, cover_url: data?.profile?.cover_url || url } : p));
    } catch (er) {
      alert(er.response?.data?.error || er.message || 'Không đổi được ảnh bìa');
    } finally {
      setSavingCover(false);
    }
  };

  const handleRemoveCover = async () => {
    if (!confirm('Gỡ ảnh bìa khỏi trang cá nhân?')) return;
    setSavingCover(true);
    try {
      await api.patch('/internal-social/profile/me', { cover_url: null });
      setProfile((p) => (p ? { ...p, cover_url: null } : p));
    } catch (er) {
      alert(er.response?.data?.error || er.message || 'Không gỡ được ảnh bìa');
    } finally {
      setSavingCover(false);
    }
  };

  const handleSaveBio = async (val) => {
    setSavingBio(true);
    try {
      const { data } = await api.patch('/internal-social/profile/me', { bio: val || null });
      setProfile((p) => (p ? { ...p, bio: data?.profile?.bio ?? (val || null) } : p));
      setBioOpen(false);
    } catch (er) {
      alert(er.response?.data?.error || er.message || 'Không lưu được tiểu sử');
    } finally {
      setSavingBio(false);
    }
  };

  const headerName = profile?.full_name || profile?.email || 'Thành viên';
  const subTitle = useMemo(() => {
    const parts = [];
    if (profile?.position) parts.push(profile.position);
    if (profile?.role) parts.push(profile.role);
    if (profile?.department?.name) parts.push(profile.department.name);
    return parts.join(' · ');
  }, [profile]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }
  if (err || !profile) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
        <p className="text-gray-700 mb-3">{err || 'Không tìm thấy người dùng.'}</p>
        <Link to="/social" className="text-sm text-blue-600 hover:underline">← Về bảng tin</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-4 sm:pt-6">

        {/* ──────────── HERO COVER ────────────
            z-0: Ảnh bìa (lớp dưới cùng)
            z-10: Avatar + Tên + Badge (lớp trên cùng) */}
        <div className="relative rounded-3xl overflow-hidden shadow-[0_20px_60px_-15px_rgba(76,29,149,0.35)]">
          <div
            className="relative w-full aspect-[16/6] min-h-[16rem] sm:min-h-[18rem] max-h-[26rem] bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400"
            style={profile.cover_url ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            {/* Overlay tối dần xuống dưới để chữ trắng dễ đọc */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/10 pointer-events-none" aria-hidden />

            {/* Top-left: nút quay lại */}
            <button
              type="button"
              onClick={() => navigate('/social')}
              className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur px-3 py-1.5 text-xs font-semibold text-gray-800 shadow hover:bg-white transition-colors"
              title="Quay lại bảng tin"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Bảng tin
            </button>

            {/* Top-right: nút sửa / xoá ảnh bìa */}
            {isOwner && (
              <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverPick}
                />
                <button
                  type="button"
                  disabled={savingCover}
                  onClick={() => coverInput.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur px-3 py-1.5 text-xs font-semibold text-gray-800 shadow hover:bg-white disabled:opacity-60"
                >
                  {savingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  {profile.cover_url ? 'Đổi ảnh bìa' : 'Thêm ảnh bìa'}
                </button>
                {profile.cover_url && (
                  <button
                    type="button"
                    disabled={savingCover}
                    onClick={handleRemoveCover}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-white/90 backdrop-blur text-rose-600 shadow hover:bg-white disabled:opacity-60"
                    title="Gỡ ảnh bìa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Lớp trên cùng: Avatar + Tên + Badge + Tagline — bottom-left overlay */}
          <div className="absolute inset-0 z-10 flex items-end p-5 sm:p-7 pointer-events-none">
            <div className="flex items-end gap-4 sm:gap-6 w-full">
              {/* Avatar lớn với ring trắng */}
              <div className="relative shrink-0 pointer-events-auto">
                <div className="rounded-full ring-4 ring-white/85 shadow-2xl">
                  <ProfileAvatar profile={profile} />
                </div>
                {isOwner && (
                  <>
                    <input
                      ref={avatarInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarPick}
                    />
                    <button
                      type="button"
                      disabled={savingAvatar}
                      onClick={() => avatarInput.current?.click()}
                      className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg ring-2 ring-white hover:bg-gray-100 hover:text-indigo-600 disabled:opacity-60 transition-colors"
                      title="Đổi ảnh đại diện"
                    >
                      {savingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </button>
                  </>
                )}
              </div>

              {/* Tên + verified icon + Badge + Bio ngắn — chữ trắng có drop-shadow */}
              <div className="flex-1 min-w-0 pb-2 pointer-events-auto">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-force-white text-2xl sm:text-4xl font-extrabold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" style={{ color: '#ffffff' }}>
                    {headerName}
                  </h1>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setNameOpen(true)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 backdrop-blur"
                      title="Đổi tên"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <BadgeCheck className="h-6 w-6 sm:h-7 sm:w-7 text-sky-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" aria-label="Verified" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {subTitle && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-md ring-1 ring-white/50 animate-fade-in">
                      <ShieldCheck className="h-3.5 w-3.5 text-white drop-shadow" />
                      <span className="text-xs font-bold uppercase tracking-wider text-white drop-shadow">
                        {subTitle}
                      </span>
                    </div>
                  )}
                  {profile.company?.name && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/25 backdrop-blur border border-white/40 text-white text-xs font-semibold drop-shadow">
                      <Building2 className="h-3.5 w-3.5" /> {profile.company.name}
                    </span>
                  )}
                </div>
                {profile.bio && (
                  <div className="mt-3 inline-flex items-start gap-2 max-w-2xl rounded-xl bg-white/15 backdrop-blur-md border border-white/30 px-3 py-1.5 shadow-md">
                    <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-amber-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]" aria-hidden />
                    <p
                      className="text-force-white text-sm sm:text-[15px] font-medium italic line-clamp-2 leading-relaxed drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
                      style={{ color: '#ffffff' }}
                    >
                      “{profile.bio}”
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ──────────── 2 CARDS: GIỚI THIỆU + THÔNG TIN ──────────── */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Giới thiệu */}
          <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-white/60 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center border border-indigo-200">
                <UserIcon className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-base font-bold text-gray-900">Giới thiệu</h3>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setBioOpen(true)}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Sửa
                    </button>
                  )}
                </div>
                {profile.bio ? (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
                ) : (
                  <p className="text-xs text-gray-500 italic">
                    {isOwner ? 'Bạn chưa thêm giới thiệu. Nhấn "Sửa" để thêm.' : 'Chưa có giới thiệu.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Thông tin */}
          <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-white/60 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-purple-100 to-pink-50 flex items-center justify-center border border-purple-200">
                <InfoIcon className="h-5 w-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <h3 className="text-base font-bold text-gray-900 mb-1.5">Thông tin</h3>
                {profile.email && (
                  <p className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{profile.email}</span>
                  </p>
                )}
                {profile.phone && (
                  <p className="flex items-center gap-2 text-sm text-gray-700">
                    <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" /> {profile.phone}
                  </p>
                )}
                {profile.created_at && (
                  <p className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" /> Tham gia: {new Date(profile.created_at).toLocaleDateString('vi-VN')}
                  </p>
                )}
                <p className="flex items-center gap-2 text-sm text-gray-600">
                  <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" /> Tổng bài đăng: <strong className="text-gray-900">{profile.post_count || 0}</strong>
                </p>
                {certs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTab('certificates')}
                    className="mt-2 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 hover:from-amber-100 hover:to-orange-100 transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-800">
                        {certs.length} chứng nhận
                      </span>
                    </span>
                    <span className="text-[10px] text-amber-600 font-semibold">Xem →</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-8 py-6 space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-1 inline-flex gap-1 sticky top-2 z-10 shadow-sm flex-wrap">
          {[
            { key: 'posts', label: 'Bài đăng', icon: FileText },
            { key: 'photos', label: 'Ảnh', icon: ImageIcon },
            { key: 'videos', label: 'Video', icon: VideoIcon },
            { key: 'certificates', label: 'Chứng nhận', icon: Award, count: certs.length },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            const isCert = t.key === 'certificates';
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active
                  ? (isCert ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow' : 'bg-blue-600 text-white shadow')
                  : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {t.count > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-bold ${active ? 'bg-white/25' : 'bg-amber-100 text-amber-700'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === 'posts' && (
          <>
            {postsLoading && (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>
            )}
            {postsErr && !postsLoading && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{postsErr}</div>
            )}
            {!postsLoading && !postsErr && posts.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                Chưa có bài nào được hiển thị cho bạn.
              </div>
            )}
            <div className="mx-auto max-w-[816px] space-y-4">
              {editingPost && (
                <SocialPostEditComposer
                  ref={composerRef}
                  post={editingPost}
                  user={user}
                  onClose={() => setEditingPost(null)}
                  onSaved={(next) => {
                    setPosts((prev) => prev.map((x) => (String(x.id) === String(next.id) ? { ...x, ...next } : x)));
                    setEditingPost(null);
                  }}
                />
              )}
              {posts.map((p) => (
                <SocialProfileFullCard
                  key={p.id}
                  post={p}
                  currentUserId={user?.id}
                  currentRole={user?.role}
                  onEdit={beginEditPost}
                  onChange={(next) => setPosts((prev) => prev.map((x) => (x.id === next.id ? { ...x, ...next } : x)))}
                  onDelete={(id) => {
                    setPosts((prev) => prev.filter((x) => String(x.id) !== String(id)));
                    setProfile((p) => (p ? { ...p, post_count: Math.max(0, (Number(p.post_count) || 1) - 1) } : p));
                  }}
                />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-3">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => loadPosts(nextOffset, true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Tải thêm
                </button>
              </div>
            )}
          </>
        )}

        {(tab === 'photos' || tab === 'videos') && (
          <>
            {mediaLoading && (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>
            )}
            {mediaErr && !mediaLoading && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{mediaErr}</div>
            )}
            {!mediaLoading && !mediaErr && media.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                {tab === 'photos' ? 'Chưa có ảnh nào được hiển thị cho bạn.' : 'Chưa có video nào được hiển thị cho bạn.'}
              </div>
            )}
            {media.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {media.map((m, i) => (
                  <MediaTile key={`${m.url}-${i}`} item={m} onOpen={() => setLightboxIdx(i)} />
                ))}
              </div>
            )}
            {mediaHasMore && (
              <div className="flex justify-center pt-3">
                <button
                  type="button"
                  disabled={mediaLoadingMore}
                  onClick={() => loadMedia(mediaNextOffset, true, tab === 'photos' ? 'image' : 'video')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {mediaLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Tải thêm
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'certificates' && (
          <>
            {certsLoading && (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-amber-500" /></div>
            )}
            {certsErr && !certsLoading && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{certsErr}</div>
            )}
            {!certsLoading && !certsErr && certs.length === 0 && (
              <div className="rounded-xl border border-dashed border-amber-200 bg-gradient-to-br from-amber-50/50 to-orange-50/30 p-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 flex items-center justify-center mb-3">
                  <Award className="h-8 w-8 text-amber-400" />
                </div>
                <p className="text-sm text-gray-600 font-medium">
                  {isOwner ? 'Bạn chưa có chứng nhận nào' : 'Thành viên chưa có chứng nhận'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {isOwner
                    ? 'Hoàn thành các khoá học và bài tập trong Thư viện kiến thức để được cấp chứng nhận.'
                    : 'Khi thành viên đạt chứng nhận, sẽ hiển thị tại đây.'}
                </p>
                {isOwner && (
                  <Link to="/knowledge" className="inline-flex items-center gap-1 mt-3 text-amber-600 text-sm hover:underline">
                    <Trophy className="h-4 w-4" /> Đi học ngay →
                  </Link>
                )}
              </div>
            )}
            {certs.length > 0 && (
              <>
                <div className="rounded-xl bg-gradient-to-r from-amber-500/95 via-orange-500/95 to-rose-500/95 text-white px-5 py-4 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                      <Trophy className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider opacity-90">Bộ sưu tập chứng nhận</p>
                      <p className="text-2xl font-bold leading-tight">{certs.length} chứng nhận</p>
                    </div>
                  </div>
                  {isOwner && (
                    <Link
                      to="/knowledge/certificates"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-medium backdrop-blur-sm"
                    >
                      Xem tất cả →
                    </Link>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                  {certs.map((c) => {
                    const badgeUrl = c.badge_image_url || c.category?.badge_image_url;
                    return (
                      <Link
                        key={c.id}
                        to={`/knowledge/certificates/${c.id}`}
                        className="group relative overflow-hidden rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 hover:border-amber-400 hover:shadow-lg transition-all"
                      >
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-200/40 rounded-full blur-2xl" />
                        <div className="relative p-4">
                          <div className="flex items-start justify-between gap-2">
                            {badgeUrl ? (
                              <img
                                src={badgeUrl}
                                alt="Huy chương"
                                className="w-14 h-14 object-contain drop-shadow group-hover:scale-110 transition-transform shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-md shrink-0">
                                <Award className="h-6 w-6" />
                              </div>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                              <ShieldCheck className="h-3 w-3" /> Xác thực
                            </span>
                          </div>
                          <p className="mt-3 text-[10px] font-bold text-amber-700 uppercase tracking-wider">Chứng nhận</p>
                          <h3 className="text-sm font-bold text-gray-900 line-clamp-2 mt-0.5">
                            {!badgeUrl && c.category?.icon} {c.category?.name || 'Khoá học'}
                          </h3>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-amber-200/60">
                            <span className="font-mono">{c.certificate_number}</span>
                            <span>{new Date(c.issued_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <MediaLightbox
        items={media}
        index={lightboxIdx}
        onClose={() => setLightboxIdx(null)}
        onPrev={() => setLightboxIdx((i) => (i == null || i <= 0 ? i : i - 1))}
        onNext={() => setLightboxIdx((i) => (i == null || i >= media.length - 1 ? i : i + 1))}
      />

      <EditBioModal
        open={bioOpen && isOwner}
        initial={profile.bio || ''}
        onClose={() => setBioOpen(false)}
        onSave={handleSaveBio}
        saving={savingBio}
      />

      <EditMyNameModal
        open={nameOpen && isOwner}
        initialName={profile?.full_name || ''}
        onClose={() => setNameOpen(false)}
        onSaved={async (saved) => {
          const nextName = saved?.full_name;
          if (nextName) {
            setProfile((p) => (p ? { ...p, full_name: nextName } : p));
          }
          await refreshUser();
        }}
      />
    </div>
  );
}
