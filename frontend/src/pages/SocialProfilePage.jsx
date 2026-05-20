import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Camera, Image as ImageIcon, Loader2, Pencil,
  Building2, ArrowLeft, Calendar, Mail, Phone, Trash2,
  FileText, Video as VideoIcon, X, ChevronLeft, ChevronRight as ChevRight,
  Play,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { getInitials } from '../lib/utils';
import SocialProfileFullCard from '../components/SocialProfileFullCard';

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

function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'Vừa xong';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const { user } = useAuth();
  const navigate = useNavigate();

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

  const [lightboxIdx, setLightboxIdx] = useState(null);

  const isOwner = !!profile && !!user && String(profile.id) === String(user.id);

  const avatarInput = useRef(null);
  const coverInput = useRef(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [savingBio, setSavingBio] = useState(false);

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

  useEffect(() => {
    loadProfile();
    loadPosts(0, false);
  }, [loadProfile, loadPosts]);

  useEffect(() => {
    if (tab === 'photos') loadMedia(0, false, 'image');
    else if (tab === 'videos') loadMedia(0, false, 'video');
  }, [tab, loadMedia]);

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
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-5xl">
          <div
            className="relative h-56 sm:h-72 w-full bg-gradient-to-r from-blue-200 via-indigo-200 to-purple-200"
            style={profile.cover_url ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            <button
              type="button"
              onClick={() => navigate('/social')}
              className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1.5 text-xs font-medium text-gray-800 shadow hover:bg-white"
              title="Quay lại bảng tin"
            >
              <ArrowLeft className="h-4 w-4" /> Bảng tin
            </button>
            {isOwner && (
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
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
                  className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-800 shadow hover:bg-white disabled:opacity-60"
                >
                  {savingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  {profile.cover_url ? 'Đổi ảnh bìa' : 'Thêm ảnh bìa'}
                </button>
                {profile.cover_url && (
                  <button
                    type="button"
                    disabled={savingCover}
                    onClick={handleRemoveCover}
                    className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1.5 text-xs font-medium text-rose-700 shadow hover:bg-white disabled:opacity-60"
                    title="Gỡ ảnh bìa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="px-4 sm:px-8 pb-6">
            <div className="-mt-20 sm:-mt-24 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="relative">
                  <ProfileAvatar profile={profile} />
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
                        className="absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-800 shadow hover:bg-gray-300 disabled:opacity-60"
                        title="Đổi ảnh đại diện"
                      >
                        {savingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      </button>
                    </>
                  )}
                </div>
                <div className="sm:pb-2">
                  <h1 className="text-2xl font-bold text-gray-900">{headerName}</h1>
                  {subTitle && <p className="text-sm text-gray-600 mt-0.5">{subTitle}</p>}
                  {profile.company?.name && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                      <Building2 className="h-3.5 w-3.5" /> {profile.company.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-800">Giới thiệu</h3>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setBioOpen(true)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Sửa
                    </button>
                  )}
                </div>
                {profile.bio ? (
                  <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
                ) : (
                  <p className="mt-2 text-xs text-gray-500 italic">
                    {isOwner ? 'Bạn chưa thêm giới thiệu. Nhấn "Sửa" để thêm.' : 'Chưa có giới thiệu.'}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2 text-sm text-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 mb-1">Thông tin</h3>
                {profile.email && (
                  <p className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-500" /> <span className="truncate">{profile.email}</span></p>
                )}
                {profile.phone && (
                  <p className="inline-flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-500" /> {profile.phone}</p>
                )}
                {profile.created_at && (
                  <p className="inline-flex items-center gap-2 text-xs text-gray-500">
                    <Calendar className="h-3.5 w-3.5" /> Tham gia: {new Date(profile.created_at).toLocaleDateString('vi-VN')}
                  </p>
                )}
                <p className="text-xs text-gray-500 pt-1">Tổng bài đăng: <strong className="text-gray-800">{profile.post_count || 0}</strong></p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-8 py-6 space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-1 inline-flex gap-1 sticky top-2 z-10 shadow-sm">
          {[
            { key: 'posts', label: 'Bài đăng', icon: FileText },
            { key: 'photos', label: 'Ảnh', icon: ImageIcon },
            { key: 'videos', label: 'Video', icon: VideoIcon },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
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
              {posts.map((p) => (
                <SocialProfileFullCard
                  key={p.id}
                  post={p}
                  currentUserId={user?.id}
                  currentRole={user?.role}
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
    </div>
  );
}
