import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Sparkles,
  Search,
  UserPlus,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { isAdminLike } from '../lib/adminRole';
import { getUserPresence } from '../lib/userPresenceDisplay';
import OnlineStatusDot from './OnlineStatusDot';
import { publicFileUrl } from '../lib/publicFileUrl';

const GROUP_NAME_MAX = 100;

function PickAvatar({ user, size = 'md' }) {
  const name = user?.full_name || user?.email || '?';
  const sz = size === 'sm' ? 'h-9 w-9 text-xs' : 'h-10 w-10 text-sm';
  const url = user?.avatar ? publicFileUrl(user.avatar) : '';
  if (url) {
    return (
      <img src={url} alt="" className={`${sz} shrink-0 rounded-full object-cover bg-slate-200 ring-2 ring-white`} />
    );
  }
  return (
    <div
      className={`${sz} shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white font-bold flex items-center justify-center ring-2 ring-white`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function userSubtitle(u) {
  if (u?.position) return u.position;
  if (u?.department?.name) return u.department.name;
  const role = String(u?.role || '').toLowerCase();
  if (role === 'admin' || role === 'sales_admin') return 'Quản trị viên';
  if (role === 'manager') return 'Quản lý';
  return 'Nhân viên';
}

export default function MessengerCreateGroupModal({
  open,
  onClose,
  groupName,
  onGroupNameChange,
  createCompanyId,
  onCompanyChange,
  companies = [],
  allUsers = [],
  picks = [],
  onPicksChange,
  userPickQ,
  onUserPickQChange,
  presenceByUser = {},
  onPresenceUpdate,
  uid,
  creating = false,
  selectingCompanyMembers = false,
  onSelectAllCompany,
  onCreate,
}) {
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [searchHits, setSearchHits] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [aiBot, setAiBot] = useState(null);
  const [nameFocused, setNameFocused] = useState(false);
  const onPresenceUpdateRef = useRef(onPresenceUpdate);
  onPresenceUpdateRef.current = onPresenceUpdate;
  const searchTimerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    api
      .get('/ai-chat-bot/bot')
      .then((r) => setAiBot(r.data || null))
      .catch(() => setAiBot(null));
  }, [open]);

  useEffect(() => {
    if (!open || !createCompanyId) {
      setCompanyUsers([]);
      return;
    }
    let cancelled = false;
    setLoadingUsers(true);
    api
      .get('/users', { params: { company_id: createCompanyId } })
      .then((r) => {
        if (cancelled) return;
        const users = (r.data?.users || []).filter((u) => String(u.id || u.user_id) !== String(uid));
        setCompanyUsers(users);
        const ids = users.map((u) => u.id || u.user_id).filter(Boolean);
        if (ids.length) {
          api
            .post('/users/presence', { user_ids: ids })
            .then((pr) => onPresenceUpdateRef.current?.(pr.data?.presence || {}))
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setCompanyUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, createCompanyId, uid]);

  /** Tìm theo tên toàn hệ thống (không khóa công ty) khi gõ ô tìm. */
  useEffect(() => {
    if (!open) {
      setSearchHits([]);
      return undefined;
    }
    const term = (userPickQ || '').trim();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (term.length < 1) {
      setSearchHits([]);
      setSearchingUsers(false);
      return undefined;
    }
    let cancelled = false;
    setSearchingUsers(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/messenger/users/search', { params: { q: term, limit: 40 } });
        if (cancelled) return;
        const users = (data?.users || []).filter((u) => String(u.id || u.user_id) !== String(uid));
        setSearchHits(users);
        const ids = users.map((u) => u.id || u.user_id).filter(Boolean);
        if (ids.length) {
          api
            .post('/users/presence', { user_ids: ids })
            .then((pr) => onPresenceUpdateRef.current?.(pr.data?.presence || {}))
            .catch(() => {});
        }
      } catch {
        if (!cancelled) setSearchHits([]);
      } finally {
        if (!cancelled) setSearchingUsers(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [open, userPickQ, uid]);

  const pickIdSet = useMemo(() => new Set(picks.map((p) => String(p.user_id))), [picks]);

  const candidateUsers = useMemo(() => {
    const q = userPickQ.trim();
    // Khi đang gõ tên → ưu tiên kết quả search không khóa công ty.
    const base = q
      ? searchHits
      : (createCompanyId ? companyUsers : (allUsers || []).filter((u) => String(u.id || u.user_id) !== String(uid)));
    return base
      .filter((u) => {
        if (!onlineOnly) return true;
        const pres = getUserPresence(presenceByUser, u.id || u.user_id);
        return !!pres?.online;
      })
      .slice(0, 80);
  }, [createCompanyId, companyUsers, allUsers, searchHits, userPickQ, onlineOnly, presenceByUser, uid]);

  const togglePick = useCallback(
    (u) => {
      const id = u.id || u.user_id;
      if (!id) return;
      if (pickIdSet.has(String(id))) {
        onPicksChange(picks.filter((p) => String(p.user_id) !== String(id)));
      } else {
        onPicksChange([
          ...picks,
          { user_id: id, role: 'member', name: u.full_name || u.email || id, user: u },
        ]);
      }
    },
    [pickIdSet, picks, onPicksChange],
  );

  const removePick = useCallback(
    (userId) => {
      onPicksChange(picks.filter((p) => String(p.user_id) !== String(userId)));
    },
    [picks, onPicksChange],
  );

  const addAiBot = useCallback(() => {
    if (!aiBot?.id || pickIdSet.has(String(aiBot.id))) return;
    onPicksChange([
      ...picks,
      {
        user_id: aiBot.id,
        role: 'member',
        name: aiBot.full_name || 'AI Assistant',
        user: { ...aiBot, is_bot: true },
      },
    ]);
  }, [aiBot, pickIdSet, picks, onPicksChange]);

  const findUser = useCallback(
    (userId) => {
      const hit =
        picks.find((p) => String(p.user_id) === String(userId))?.user
        || candidateUsers.find((u) => String(u.id || u.user_id) === String(userId))
        || (allUsers || []).find((u) => String(u.id || u.user_id) === String(userId));
      return hit || { full_name: picks.find((p) => String(p.user_id) === String(userId))?.name };
    },
    [picks, candidateUsers, allUsers],
  );

  if (!open) return null;

  const nameLen = groupName.length;
  const canCreate = groupName.trim().length > 0 && !creating;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-2 sm:p-4">
      <div className="flex h-[94vh] max-h-[780px] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-black/5">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">Tạo nhóm chat mới</h2>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Tạo nhóm nội bộ để trao đổi công việc hiệu quả
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white hover:text-slate-700 transition"
            onClick={onClose}
            disabled={creating || selectingCompanyMembers}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — two columns */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_260px] lg:divide-x divide-slate-100">
          {/* Left — form cuộn riêng + danh sách nhân viên luôn giữ chiều cao */}
          <div className="grid min-h-0 grid-rows-[auto_minmax(220px,1fr)] gap-2 overflow-hidden p-3 sm:p-4 lg:p-5">
            <div className="min-h-0 max-h-[300px] max-h-[36vh] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
              <p className="text-[13px] font-bold text-slate-800 mb-2 sticky top-0 z-[1] bg-white/95 backdrop-blur-sm pb-1">
                Thông tin nhóm
              </p>

              <div className="space-y-2 pr-0.5">
            {/* Group name — highlighted */}
            <div
              className={`rounded-xl border-2 p-2.5 transition ${
                nameFocused
                  ? 'border-violet-400 bg-violet-50/60 shadow-[0_0_0_3px_rgba(139,92,246,0.12)]'
                  : 'border-violet-200 bg-violet-50/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="text-[12px] font-semibold text-slate-700">
                  Tên nhóm <span className="text-rose-500">*</span>
                </label>
                <span className={`text-[11px] tabular-nums ${nameLen > GROUP_NAME_MAX ? 'text-rose-600' : 'text-slate-400'}`}>
                  {nameLen}/{GROUP_NAME_MAX}
                </span>
              </div>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500" />
                <input
                  value={groupName}
                  onChange={(e) => onGroupNameChange(e.target.value.slice(0, GROUP_NAME_MAX))}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setNameFocused(false)}
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-violet-200/80 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                  placeholder="VD: Nhóm dự án A"
                  disabled={creating}
                />
              </div>
            </div>

            {/* Company — highlighted */}
            <div className="rounded-xl border-2 border-sky-200 bg-sky-50/50 p-2.5">
              <label className="text-[12px] font-semibold text-slate-700 mb-1.5 block">Chọn công ty</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-600 pointer-events-none" />
                <select
                  value={createCompanyId}
                  onChange={(e) => onCompanyChange(e.target.value)}
                  disabled={creating || selectingCompanyMembers}
                  className="w-full h-10 appearance-none pl-9 pr-9 rounded-lg border border-sky-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                >
                  <option value="">— Chọn công ty —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.short_name || c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Actions row */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={creating || selectingCompanyMembers || !createCompanyId}
                onClick={() => void onSelectAllCompany?.({ replace: true })}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-sky-600 text-white text-[12px] font-semibold hover:bg-sky-700 disabled:opacity-50 transition"
              >
                {selectingCompanyMembers ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Chọn tất cả
              </button>
              <button
                type="button"
                onClick={() => setOnlineOnly((v) => !v)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold border transition ${
                  onlineOnly
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-200'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${onlineOnly ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                Nhân viên đang online
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={userPickQ}
                onChange={(e) => onUserPickQChange(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50/80 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300/50 focus:border-violet-300"
                placeholder="Tìm nhân viên theo tên, email…"
                disabled={creating}
              />
            </div>

            {/* AI promo */}
            {aiBot?.id ? (
              <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/70 px-2.5 py-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-violet-900">AI Assistant</p>
                  <p className="text-[11px] text-violet-700/90 leading-snug">
                    Hỗ trợ trả lời, tóm tắt và tìm kiếm thông tin
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addAiBot}
                  disabled={creating || pickIdSet.has(String(aiBot.id))}
                  className="shrink-0 h-8 px-3 rounded-lg border-2 border-violet-400 bg-white text-[12px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition"
                >
                  {pickIdSet.has(String(aiBot.id)) ? 'Đã thêm' : 'Thêm AI'}
                </button>
              </div>
            ) : null}
              </div>
            </div>

            {/* Member list — hàng grid thứ 2, luôn có tối thiểu ~220px kể cả zoom 110%+ */}
            <div className="flex min-h-0 flex-col overflow-hidden">
              <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                Danh sách nhân viên
                {candidateUsers.length > 0 ? ` · ${candidateUsers.length}` : ''}
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white [scrollbar-width:thin]">
              {loadingUsers || searchingUsers ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang tải nhân viên…
                </div>
              ) : candidateUsers.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12px] text-slate-500 leading-relaxed">
                  {!userPickQ.trim() && !createCompanyId
                    ? 'Gõ tên/email để tìm mọi nhân viên, hoặc chọn công ty để duyệt danh sách.'
                    : onlineOnly
                      ? 'Không có nhân viên online phù hợp.'
                      : 'Không tìm thấy nhân viên.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {candidateUsers.map((u) => {
                    const id = u.id || u.user_id;
                    const checked = pickIdSet.has(String(id));
                    const pres = getUserPresence(presenceByUser, id);
                    const admin = isAdminLike(u);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => togglePick(u)}
                          disabled={creating}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-violet-50/60 ${
                            checked ? 'bg-violet-50/80' : ''
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked
                                ? 'border-violet-600 bg-violet-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                          </span>
                          <PickAvatar user={u} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[13px] font-semibold text-slate-900 truncate">
                                {u.full_name || u.email}
                              </span>
                              {admin ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700">
                                  Quản trị viên
                                </span>
                              ) : null}
                              {u.is_bot ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                                  AI
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">{userSubtitle(u)}</p>
                          </div>
                          <OnlineStatusDot presence={pres} size="md" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              </div>
            </div>
          </div>

          {/* Right — selected members */}
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 overflow-hidden border-t border-slate-100 bg-slate-50/60 p-3 sm:p-4 lg:border-t-0">
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <h3 className="text-[13px] font-bold text-slate-800">Thành viên đã chọn</h3>
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-bold text-white">
                {picks.length}
              </span>
            </div>

            <div className="min-h-0 overflow-y-auto space-y-2 [scrollbar-width:thin]">
              {picks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-8 text-center">
                  <UsersRound className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-[12px] text-slate-500">Chưa chọn thành viên nào</p>
                </div>
              ) : (
                picks.map((p) => {
                  const u = findUser(p.user_id);
                  return (
                    <div
                      key={p.user_id}
                      className="flex items-center gap-2.5 rounded-xl border border-white bg-white px-2.5 py-2 shadow-sm"
                    >
                      <PickAvatar user={u} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-slate-900 truncate">
                          {p.name || u?.full_name || 'Thành viên'}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">{userSubtitle(u)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePick(p.user_id)}
                        disabled={creating}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="rounded-xl border border-violet-100 bg-violet-50/80 px-3 py-2 flex gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-violet-500 mt-0.5" />
              <p className="text-[11px] text-violet-800/90 leading-relaxed">
                <span className="font-semibold">Mẹo:</span> Bạn có thể chọn nhiều thành viên cùng lúc bằng{' '}
                <strong>Chọn tất cả</strong> hoặc lọc <strong>đang online</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2 sm:px-5 sm:py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <UsersRound className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-800">
                Đã chọn {picks.length} thành viên
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {picks.length <= 5
                  ? 'Nhóm vừa phải, dễ dàng trao đổi và quản lý.'
                  : 'Nhóm lớn — cân nhắc thêm phó nhóm để quản lý hiệu quả.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={creating || selectingCompanyMembers}
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              type="button"
              className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 inline-flex items-center gap-2 shadow-md shadow-violet-500/20"
              disabled={!canCreate || selectingCompanyMembers}
              onClick={() => void onCreate?.()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Tạo nhóm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
