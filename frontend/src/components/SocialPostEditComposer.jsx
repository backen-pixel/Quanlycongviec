import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe, ImagePlus, Image as ImageIcon, Link2, Loader2, MapPin, MoreHorizontal,
  Smile, Video, X,
} from 'lucide-react';
import api from '../lib/api';
import { getInitials } from '../lib/utils';
import { isSystemAdmin as checkSystemAdmin } from '../lib/adminRole';
import {
  MAX_SOCIAL_ATTACHMENTS,
  attachSlotsFromPost,
  composerFromPost,
  isScheduledPost,
  normalizeSocialPost,
  uploadSocialFile,
} from '../lib/internalSocialPost';

function ComposerAvatar({ user }) {
  const name = user?.full_name || user?.email || '?';
  const pic = typeof user?.avatar === 'string' && user.avatar.trim();
  if (pic) {
    return (
      <img
        src={pic}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full border border-gray-200/90 object-cover"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
      {getInitials(name)}
    </div>
  );
}

const SocialPostEditComposer = forwardRef(function SocialPostEditComposer(
  { post, user, onClose, onSaved },
  ref,
) {
  const [composer, setComposer] = useState(() => composerFromPost(post));
  const [attachSlots, setAttachSlots] = useState(() => attachSlotsFromPost(post));
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [audienceSearch, setAudienceSearch] = useState('');
  const [userSuggest, setUserSuggest] = useState([]);
  const audienceSearchTimer = useRef(null);
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const isSystemAdmin = checkSystemAdmin(user);
  const effectiveCompanyId = String(post?.company_id || user?.company_id || '');
  const composerFirstName = (user?.full_name || 'Bạn').split(' ').slice(-1)[0] || 'Bạn';

  useEffect(() => {
    setComposer(composerFromPost(post));
    setAttachSlots(attachSlotsFromPost(post));
    setAudienceSearch('');
    setErr(null);
  }, [post?.id]);

  useEffect(() => {
    let cancelled = false;
    api.get('/companies', { params: { for_module: 'crm' } })
      .then((r) => {
        if (!cancelled) setCompanies(r.data?.companies || r.data || []);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (composer.visibility !== 'selected_users' || !effectiveCompanyId) {
      setUserSuggest([]);
      return undefined;
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
  }, [composer.visibility, effectiveCompanyId, audienceSearch]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPickFiles = (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    if (!picked.length) return;
    setAttachSlots((current) => {
      const room = Math.max(0, MAX_SOCIAL_ATTACHMENTS - current.length);
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
          } catch (uploadErr) {
            const msg = uploadErr.response?.data?.error || uploadErr.message || 'Lỗi upload';
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

  const canSubmit = useMemo(() => {
    if (posting || attachSlots.some((s) => s.uploading)) return false;
    const body = (composer.body ?? '').trim();
    const hasContent = body
      || attachSlots.some((s) => s.result?.file_url)
      || (composer.link_url ?? '').trim()
      || (composer.image_url ?? '').trim()
      || (composer.video_url ?? '').trim();
    if (!hasContent) return false;
    if (composer.visibility === 'selected_users' && !(composer.audienceUserIds || []).length) return false;
    if (composer.visibility === 'selected_companies') {
      const extra = (composer.audienceCompanyIds || [])
        .filter((cid) => cid && cid !== String(effectiveCompanyId));
      if (!extra.length) return false;
    }
    if (composer.publishMode === 'scheduled' && !(composer.scheduledAt || '').trim()) return false;
    return true;
  }, [posting, attachSlots, composer, effectiveCompanyId]);

  const handleSave = async () => {
    const body = (composer.body ?? '').trim();
    const linkUrl = (composer.link_url ?? '').trim();
    const linkTitle = (composer.link_title ?? '').trim();
    const imageUrl = (composer.image_url ?? '').trim();
    const videoUrl = (composer.video_url ?? '').trim();
    const attachments = attachSlots
      .filter((s) => s.result?.file_url)
      .map((s, i) => ({
        file_url: s.result.file_url,
        file_name: s.result.file_name || s.fileName,
        mime_type: s.result.mime_type || null,
        file_size: s.result.file_size || null,
        sort_index: i,
      }));
    const visibility = composer.visibility === 'selected_users'
      ? 'selected_users'
      : (composer.visibility === 'selected_companies' ? 'selected_companies' : 'company');
    const extraCompanyIds = (composer.audienceCompanyIds || [])
      .map(String)
      .filter((cid) => cid && cid !== String(effectiveCompanyId));

    setPosting(true);
    setErr(null);
    try {
      const payload = {
        body: body || '',
        link_url: linkUrl || null,
        link_title: linkTitle || null,
        image_url: imageUrl || null,
        video_url: videoUrl || null,
        attachments,
        visibility,
        audience_user_ids: visibility === 'selected_users' ? composer.audienceUserIds : [],
        audience_company_ids: visibility === 'selected_companies' ? extraCompanyIds : [],
        blocked_company_ids: composer.blockedCompanyIds || [],
      };
      if (composer.publishMode === 'scheduled' && (composer.scheduledAt || '').trim()) {
        payload.published_at = new Date(composer.scheduledAt).toISOString();
      } else if (composer.publishMode === 'now' && isScheduledPost(post)) {
        payload.published_at = new Date().toISOString();
      }
      const { data } = await api.put(`/internal-social/posts/${post.id}`, payload);
      onSaved?.(normalizeSocialPost(data.post));
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      ref={ref}
      id="social-composer"
      role="region"
      aria-labelledby="social-profile-composer-title"
      className="w-full rounded-2xl bg-white shadow-xl border border-gray-200 flex flex-col overflow-hidden ring-1 ring-slate-200/60 scroll-mt-24 mb-4"
    >
      <div className="relative flex items-center justify-center px-14 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50/70 via-white to-indigo-50/70 shrink-0">
        <h2 id="social-profile-composer-title" className="text-xl font-bold text-slate-900">
          Sửa bài viết
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full text-slate-500 hover:bg-slate-200/70 transition-colors"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 sm:px-7 py-5 space-y-4">
        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
        )}

        <div className="flex items-start gap-4">
          <ComposerAvatar user={user} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 text-base">{user?.full_name || user?.email || 'Thành viên'}</p>
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-700">
              <Globe className="w-4 h-4 text-gray-600" />
              Nội bộ công ty
            </span>
          </div>
        </div>

        <textarea
          value={composer.body}
          onChange={(e) => setComposer((c) => ({ ...c, body: e.target.value }))}
          placeholder={`${composerFirstName} ơi, bạn đang nghĩ gì thế?`}
          rows={8}
          className="w-full resize-y min-h-[220px] border border-slate-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-200/60 text-[18px] leading-relaxed text-gray-900 placeholder:text-gray-400 px-4 py-3"
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
          <ul className="flex flex-col gap-2">
            {attachSlots.map((s) => (
              <li
                key={s.localId}
                className="flex items-center gap-2 text-sm rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <span className="truncate flex-1 text-gray-800">{s.fileName}</span>
                {s.uploading && <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                {s.error && <span className="text-xs text-red-600 truncate max-w-[200px] sm:max-w-[280px]" title={s.error}>{s.error}</span>}
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

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium text-gray-600">Thêm vào bài viết của bạn</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Ảnh / file"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachSlots.length >= MAX_SOCIAL_ATTACHMENTS || attachSlots.some((s) => s.uploading)}
              className="p-2.5 rounded-full hover:bg-white text-green-600 disabled:opacity-40"
            >
              <ImagePlus className="w-6 h-6" />
            </button>
            <button
              type="button"
              title="Video"
              onClick={() => videoInputRef.current?.click()}
              disabled={attachSlots.length >= MAX_SOCIAL_ATTACHMENTS || attachSlots.some((s) => s.uploading)}
              className="p-2.5 rounded-full hover:bg-white text-red-500 disabled:opacity-40"
            >
              <Video className="w-6 h-6" />
            </button>
            <button type="button" className="p-2.5 rounded-full hover:bg-white text-amber-500 opacity-60" title="Cảm xúc (sắp có)" onClick={(e) => e.preventDefault()}>
              <Smile className="w-6 h-6" />
            </button>
            <button type="button" className="p-2.5 rounded-full hover:bg-white text-blue-600 opacity-50" title="Địa điểm (sắp có)" onClick={(e) => e.preventDefault()}>
              <MapPin className="w-6 h-6" />
            </button>
            <button type="button" className="p-2.5 rounded-full hover:bg-white text-gray-500 opacity-50" title="Thêm (sắp có)" onClick={(e) => e.preventDefault()}>
              <MoreHorizontal className="w-6 h-6" />
            </button>
          </div>
        </div>

        <details className="group rounded-xl border border-gray-100 bg-white text-sm">
          <summary className="cursor-pointer px-4 py-3 font-medium text-gray-600 hover:bg-gray-50 rounded-xl list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
            <Link2 className="w-4 h-4" />
            Liên kết / URL ảnh hoặc video ngoài
          </summary>
          <div className="p-4 pt-0 space-y-2 border-t border-gray-100">
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={composer.link_url}
                onChange={(e) => setComposer((c) => ({ ...c, link_url: e.target.value }))}
                className="w-full pl-9 pr-3 py-2 border rounded-lg"
                placeholder="URL liên kết"
              />
            </div>
            <input
              value={composer.link_title}
              onChange={(e) => setComposer((c) => ({ ...c, link_title: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Tiêu đề hiển thị"
            />
            <div className="relative">
              <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={composer.image_url}
                onChange={(e) => setComposer((c) => ({ ...c, image_url: e.target.value }))}
                className="w-full pl-9 pr-3 py-2 border rounded-lg"
                placeholder="URL ảnh (tuỳ chọn)"
              />
            </div>
            <div className="relative">
              <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={composer.video_url}
                onChange={(e) => setComposer((c) => ({ ...c, video_url: e.target.value }))}
                className="w-full pl-9 pr-3 py-2 border rounded-lg"
                placeholder="URL video trực tiếp (.mp4, .webm…)"
              />
            </div>
          </div>
        </details>

        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Thời điểm đăng</p>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="profile-publish-mode"
                  checked={composer.publishMode === 'now'}
                  onChange={() => setComposer((c) => ({ ...c, publishMode: 'now' }))}
                />
                <span>Đăng ngay</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="profile-publish-mode"
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
                className="mt-2 w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Ai được xem</p>
            <select
              value={composer.visibility}
              onChange={(e) => {
                const v = e.target.value === 'selected_users'
                  ? 'selected_users'
                  : (e.target.value === 'selected_companies' ? 'selected_companies' : 'company');
                setComposer((c) => ({
                  ...c,
                  visibility: v,
                  audienceUserIds: v === 'selected_users' ? c.audienceUserIds : [],
                  audienceCompanyIds: v === 'selected_companies' ? c.audienceCompanyIds : [],
                }));
              }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="company">Cả công ty</option>
              <option value="selected_users">Chỉ nhân viên được chọn</option>
              {isSystemAdmin && (
                <option value="selected_companies">Nhiều công ty</option>
              )}
            </select>
            {composer.visibility === 'selected_companies' && (
              <div className="mt-3 space-y-2">
                {(composer.audienceCompanyIds || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(composer.audienceCompanyIds || []).map((id) => {
                      const c = companies.find((x) => String(x.id) === String(id));
                      const label = c?.name || c?.short_name || `${String(id).slice(0, 8)}…`;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 max-w-[220px]"
                        >
                          <span className="truncate">{label}</span>
                          <button
                            type="button"
                            className="shrink-0 text-emerald-700 hover:text-emerald-950"
                            onClick={() => setComposer((cur) => ({
                              ...cur,
                              audienceCompanyIds: (cur.audienceCompanyIds || []).filter((x) => x !== id),
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
                <ul className="max-h-52 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 text-sm">
                  {companies
                    .filter((c) => String(c.id) !== String(effectiveCompanyId))
                    .map((c) => {
                      const id = String(c.id);
                      const picked = (composer.audienceCompanyIds || []).includes(id);
                      return (
                        <li key={id}>
                          <label className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={picked}
                              onChange={() => setComposer((cur) => ({
                                ...cur,
                                audienceCompanyIds: picked
                                  ? (cur.audienceCompanyIds || []).filter((x) => x !== id)
                                  : [...(cur.audienceCompanyIds || []), id],
                              }))}
                            />
                            <span className="truncate">{c.name || c.short_name || id}</span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
            {composer.visibility === 'selected_users' && (
              <div className="mt-3 space-y-2">
                <input
                  type="search"
                  value={audienceSearch}
                  onChange={(e) => setAudienceSearch(e.target.value)}
                  placeholder="Tìm theo tên hoặc email…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                {(composer.audienceUserIds || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(composer.audienceUserIds || []).map((id) => {
                      const fromSuggest = userSuggest.find((u) => String(u.id) === String(id));
                      const fromAudience = (post?.audience_users || []).find((u) => String(u.id) === String(id));
                      const label = fromAudience?.full_name || fromAudience?.email
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
                  <ul className="max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 text-sm">
                    {userSuggest.map((u) => {
                      const id = String(u.id);
                      const picked = (composer.audienceUserIds || []).includes(id);
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            disabled={picked}
                            className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white disabled:opacity-50"
                            onClick={() => {
                              if (picked) return;
                              setComposer((c) => ({
                                ...c,
                                audienceUserIds: [...(c.audienceUserIds || []), id],
                              }));
                            }}
                          >
                            <span className="truncate">{u.full_name || u.email}</span>
                            <span className="text-xs text-gray-500 truncate max-w-[160px]">{u.email}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600 mb-2">Chặn công ty không được xem</p>
              {(composer.blockedCompanyIds || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {(composer.blockedCompanyIds || []).map((id) => {
                    const c = companies.find((x) => String(x.id) === String(id));
                    const label = c?.name || c?.short_name || `${String(id).slice(0, 8)}…`;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-900 max-w-[220px]"
                      >
                        <span className="truncate">{label}</span>
                        <button
                          type="button"
                          className="shrink-0 text-rose-700 hover:text-rose-950"
                          onClick={() => setComposer((cur) => ({
                            ...cur,
                            blockedCompanyIds: (cur.blockedCompanyIds || []).filter((x) => x !== id),
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
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 text-sm">
                {companies.map((c) => {
                  const id = String(c.id);
                  const picked = (composer.blockedCompanyIds || []).includes(id);
                  return (
                    <li key={id}>
                      <label className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => setComposer((cur) => ({
                            ...cur,
                            blockedCompanyIds: picked
                              ? (cur.blockedCompanyIds || []).filter((x) => x !== id)
                              : [...(cur.blockedCompanyIds || []), id],
                          }))}
                        />
                        <span className="truncate">{c.name || c.short_name || id}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 px-5 sm:px-7 py-4 bg-gradient-to-r from-slate-50 via-white to-slate-50">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSave}
          className="w-full py-3 rounded-xl text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
        >
          {posting ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  );
});

export default SocialPostEditComposer;
