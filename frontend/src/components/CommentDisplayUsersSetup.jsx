import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, Users } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { setNotificationPrefsCache } from '../lib/notificationPrefsCache';
import { formatStaffDisplayName, getStaffInitials, staffNameMatchesQuery } from '../lib/utils';

/**
 * Setup admin: chọn nhân viên được hiện thread bình luận trên màn hình.
 * User thường: chỉ xem trạng thái của mình.
 */
export default function CommentDisplayUsersSetup({ enabledSelfPref, onSelfPrefSynced }) {
  const { user } = useAuth();
  const canManage = isAdminLike(user);
  const ownCompanyId = user?.company_id ? String(user.company_id) : null;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(ownCompanyId || '');
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [initialSelected, setInitialSelected] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedHint, setSavedHint] = useState('');

  const loadUsers = useCallback(async (cid) => {
    if (!cid) {
      setUsers([]);
      setSelected(new Set());
      setInitialSelected(new Set());
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/push/comment-display-users', { params: { company_id: cid } });
      const list = Array.isArray(data?.users) ? data.users : [];
      setUsers(list);
      const onIds = new Set(list.filter((u) => u.comment_show_on_screen !== false).map((u) => String(u.id)));
      setSelected(onIds);
      setInitialSelected(new Set(onIds));
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Không tải được danh sách');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) return;
    if (ownCompanyId) {
      setCompanyId(ownCompanyId);
      void loadUsers(ownCompanyId);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/companies');
        const list = Array.isArray(data?.companies) ? data.companies : (Array.isArray(data) ? data : []);
        if (cancelled) return;
        setCompanies(list);
        const first = list[0]?.id ? String(list[0].id) : '';
        setCompanyId(first);
        if (first) void loadUsers(first);
      } catch {
        if (!cancelled) setError('Không tải được danh sách công ty');
      }
    })();
    return () => { cancelled = true; };
  }, [canManage, ownCompanyId, loadUsers]);

  const filtered = useMemo(() => {
    return users.filter((u) => staffNameMatchesQuery(u.full_name, search) || staffNameMatchesQuery(u.email, search));
  }, [users, search]);

  const dirty = useMemo(() => {
    if (selected.size !== initialSelected.size) return true;
    for (const id of selected) {
      if (!initialSelected.has(id)) return true;
    }
    return false;
  }, [selected, initialSelected]);

  const toggleUser = (id) => {
    const key = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSavedHint('');
  };

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const u of filtered) next.add(String(u.id));
      return next;
    });
    setSavedHint('');
  };

  const clearAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const u of filtered) next.delete(String(u.id));
      return next;
    });
    setSavedHint('');
  };

  const save = async () => {
    if (!companyId || saving) return;
    setSaving(true);
    setError('');
    setSavedHint('');
    try {
      const { data } = await api.put('/push/comment-display-users', {
        company_id: companyId,
        user_ids: [...selected],
      });
      const enabled = new Set((data?.user_ids || [...selected]).map(String));
      setSelected(enabled);
      setInitialSelected(new Set(enabled));
      setUsers((prev) => prev.map((u) => ({
        ...u,
        comment_show_on_screen: enabled.has(String(u.id)),
      })));
      const selfOn = enabled.has(String(user?.id));
      if (typeof onSelfPrefSynced === 'function') {
        onSelfPrefSynced(selfOn);
      } else {
        setNotificationPrefsCache({ comment_show_on_screen: selfOn });
      }
      setSavedHint(`Đã lưu · ${enabled.size} người được hiện bình luận trên màn hình`);
      setTimeout(() => setSavedHint(''), 3500);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    const on = enabledSelfPref !== false;
    return (
      <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-3">
        <div className="flex items-start gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-sky-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Hiện bình luận trên màn hình</p>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
              Quản trị viên chọn ai được xem thread bình luận trên deal / dự án / task.
              Bạn vẫn nhận bình luận trong chuông thông báo.
            </p>
            <span
              className={`inline-flex mt-2 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {on ? 'Bạn đang được hiện trên màn hình' : 'Bạn chỉ xem qua thông báo'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50/90 to-white px-3 py-3 space-y-2.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
          <Users className="h-4 w-4 text-indigo-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Ai được hiện bình luận trên màn hình?</p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            Tick nhân viên → họ thấy thread trên deal / dự án / task.
            Không tick → chỉ còn trong chuông thông báo (bình luận vẫn lưu).
          </p>
        </div>
      </div>

      {!ownCompanyId && companies.length > 0 ? (
        <label className="block">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Công ty</span>
          <select
            value={companyId}
            onChange={(e) => {
              const v = e.target.value;
              setCompanyId(v);
              void loadUsers(v);
            }}
            className="mt-1 w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.code || c.id}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm tên hoặc email…"
          className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={selectAllFiltered}
          disabled={loading || !filtered.length}
          className="h-7 px-2.5 rounded-md text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          Chọn tất cả{search ? ' (đang lọc)' : ''}
        </button>
        <button
          type="button"
          onClick={clearAllFiltered}
          disabled={loading || !filtered.length}
          className="h-7 px-2.5 rounded-md text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          Bỏ chọn
        </button>
        <span className="ml-auto text-[11px] font-semibold text-indigo-700 tabular-nums">
          {selected.size}/{users.length} người
        </span>
      </div>

      <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            {users.length ? 'Không khớp tìm kiếm' : 'Chưa có nhân viên trong công ty'}
          </p>
        ) : (
          filtered.map((u) => {
            const id = String(u.id);
            const on = selected.has(id);
            const label = formatStaffDisplayName(u.full_name) || u.full_name || u.email || '—';
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleUser(id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left cursor-pointer transition ${
                  on ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${
                    on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                </span>
                <span className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center justify-center shrink-0 overflow-hidden">
                  {u.avatar ? (
                    <img src={u.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    getStaffInitials(u.full_name) || '?'
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 truncate">{label}</span>
                  {u.email ? (
                    <span className="block text-[10px] text-slate-500 truncate">{u.email}</span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>

      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      {savedHint ? <p className="text-xs font-medium text-emerald-600">{savedHint}</p> : null}

      <button
        type="button"
        disabled={!dirty || saving || loading || !companyId}
        onClick={() => void save()}
        className={`w-full h-10 rounded-xl text-sm font-bold transition cursor-pointer ${
          dirty && !saving
            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
            : 'bg-slate-200 text-slate-500 cursor-not-allowed'
        }`}
      >
        {saving ? 'Đang lưu…' : dirty ? 'Lưu danh sách' : 'Đã lưu'}
      </button>
    </div>
  );
}
