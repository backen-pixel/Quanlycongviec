import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import {
  Search,
  MessageCircle,
  Users,
  Pin,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  UserPlus,
  Building2,
  UsersRound,
  Image as ImageIcon,
  FileText,
  Link2,
  Phone,
  Video,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useMessengerDock } from '../context/MessengerDockContext';
import { MessengerGroupChatTab } from '../components/LeadChatTabs';
import { useAuth } from '../lib/auth';
import { messengerThreadKey } from '../lib/messengerHubStorage';
import { resolveMediaUrl, BROKEN_MEDIA_PLACEHOLDER } from '../lib/mediaUrl';

const URL_IN_TEXT = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;

function previewFromMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m.is_system) continue;
    const t = (m.content || '').trim();
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    if (atts.length) {
      const a0 = atts[0];
      if (a0.type?.startsWith('image/')) return '📷 Ảnh';
      if (a0.type?.startsWith('video/')) return '🎬 Video';
      if (a0.type?.startsWith('audio/')) return '🎤 Âm thanh';
      return `📎 ${a0.name || 'Tệp'}`;
    }
    if (t) return t.length > 48 ? `${t.slice(0, 48)}…` : t;
  }
  return 'Chưa có tin nhắn';
}

function collectMediaAndFiles(messages) {
  const images = [];
  const videos = [];
  const files = [];
  const links = new Map();

  const pushLink = (url, label) => {
    if (!url || links.has(url)) return;
    links.set(url, { url, label: label || url });
  };

  (messages || []).forEach((m) => {
    if (m.is_system) return;
    const items = Array.isArray(m.attachments) && m.attachments.length
      ? m.attachments
      : m.attachment_url
        ? [{ url: m.attachment_url, name: m.attachment_name, type: m.attachment_mime, size: m.attachment_size }]
        : [];
    items.forEach((att) => {
      const u = att.url;
      if (!u) return;
      if (att.type?.startsWith('image/')) images.push({ ...att, messageId: m.id });
      else if (att.type?.startsWith('video/')) videos.push({ ...att, messageId: m.id });
      else if (!att.type?.startsWith('audio/')) files.push({ ...att, messageId: m.id });
    });
    const text = m.content || '';
    const matches = text.match(URL_IN_TEXT);
    if (matches) matches.forEach((u) => pushLink(u, u));
  });

  return {
    images,
    videos,
    files,
    links: [...links.values()],
  };
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

const ROLE_UI = [
  { value: 'responsible', label: 'Trưởng nhóm' },
  { value: 'supervisor', label: 'Phó / giám sát' },
  { value: 'member', label: 'Thành viên' },
];

function threadRowKey(t) {
  return `g:${t.groupId}`;
}

/** Gộp API /messenger/groups với preview local; ghim lấy từ DB (pinnedGroupIds). */
function buildMessengerThreads(apiList, lsMessengerRows, pinnedGroupIds) {
  const pinSet = new Set(pinnedGroupIds || []);
  const lsByGid = new Map((lsMessengerRows || []).filter((t) => t.groupId).map((t) => [t.groupId, t]));
  const groups = Array.isArray(apiList) ? apiList : [];
  const mergedMessenger = groups.map((g) => {
    const hit = lsByGid.get(g.id);
    return {
      kind: 'messenger',
      groupId: g.id,
      leadId: null,
      title: g.name,
      is_direct: !!g.is_direct,
      peer_id: g.peer_id || null,
      code: '',
      type: 'group',
      pinned: pinSet.has(g.id),
      lastPreview: hit?.lastPreview,
      messageCount: typeof g.message_count === 'number' ? g.message_count : 0,
      lastMessageAt: g.last_message_at || g.created_at,
      updatedAt: hit?.updatedAt || g.last_message_at || g.created_at,
    };
  });
  const gidSet = new Set(groups.map((g) => g.id));
  const orphanMessenger = (lsMessengerRows || [])
    .filter((t) => t.groupId && !gidSet.has(t.groupId))
    .map((t) => ({
      ...t,
      pinned: pinSet.has(t.groupId),
    }));
  return [...mergedMessenger, ...orphanMessenger];
}

export default function MessengerHubPage() {
  const { user, socket } = useAuth();
  const uid = user?.userId || user?.id;
  const { openMessengerGroupChat, markGroupRead, syncHubThreadLeadIds, syncHubMessengerGroupIds, unreadByGroupId } =
    useMessengerDock();
  const [searchParams] = useSearchParams();

  const [threads, setThreads] = useState([]);
  const [listTab, setListTab] = useState('all');
  const [threadFilter, setThreadFilter] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(() => searchParams.get('openGroup') || null);
  const [messages, setMessages] = useState([]);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightSection, setRightSection] = useState('media');
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [createCompanyId, setCreateCompanyId] = useState('');
  const [selectingCompanyMembers, setSelectingCompanyMembers] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [userPickQ, setUserPickQ] = useState('');
  const [picks, setPicks] = useState([]);
  const [creating, setCreating] = useState(false);
  const [staffListQ, setStaffListQ] = useState('');
  const staffListQRef = useRef(staffListQ);
  staffListQRef.current = staffListQ;
  const [directLoadingId, setDirectLoadingId] = useState(null);
  const [staffPanelOpen, setStaffPanelOpen] = useState(false);
  const [staffCompanyId, setStaffCompanyId] = useState('');
  const [staffDepartmentId, setStaffDepartmentId] = useState('');
  const [staffRows, setStaffRows] = useState([]);
  const [staffListLoaded, setStaffListLoaded] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [presenceByUser, setPresenceByUser] = useState({});

  const reloadMessengerThreads = useCallback(() => {
    let lsMessenger = [];
    try {
      const raw = localStorage.getItem(messengerThreadKey(uid));
      const ls = raw ? JSON.parse(raw) : [];
      lsMessenger = (Array.isArray(ls) ? ls : []).filter((t) => t.kind === 'messenger' && t.groupId);
    } catch {
      lsMessenger = [];
    }
    return Promise.all([
      api.get('/messenger/groups').catch(() => ({ data: [] })),
      api.get('/messenger/pins').catch(() => ({ data: { group_ids: [] } })),
    ])
      .then(([{ data: apiList }, { data: pinPayload }]) => {
        const pinnedIds = pinPayload?.group_ids || [];
        setThreads(buildMessengerThreads(apiList, lsMessenger, pinnedIds));
      })
      .catch(() => setThreads(buildMessengerThreads([], lsMessenger, [])));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    void reloadMessengerThreads();
  }, [uid, reloadMessengerThreads]);

  // Khi mở từ bong bóng chat (overlay WebView) với ?openGroup=ID
  useEffect(() => {
    const targetId = searchParams.get('openGroup');
    if (!targetId || !threads.length) return;
    const found = threads.find((t) => t.kind === 'messenger' && String(t.groupId) === String(targetId));
    if (found) setSelectedGroupId(targetId);
  }, [searchParams, threads]);

  useEffect(() => {
    const onLeft = (e) => {
      const gid = e.detail?.groupId;
      if (!gid) return;
      setSelectedGroupId((cur) => (String(cur) === String(gid) ? null : cur));
      void reloadMessengerThreads();
    };
    window.addEventListener('messenger:left-group', onLeft);
    return () => window.removeEventListener('messenger:left-group', onLeft);
  }, [reloadMessengerThreads]);

  useEffect(() => {
    try {
      const onlyMessenger = (threads || [])
        .filter((t) => t.kind === 'messenger' && t.groupId)
        .map(({ pinned: _p, ...rest }) => rest);
      localStorage.setItem(messengerThreadKey(uid), JSON.stringify(onlyMessenger));
    } catch {
      /* ignore */
    }
  }, [threads, uid]);

  useEffect(() => {
    syncHubThreadLeadIds([]);
    const ids = new Set(threads.filter((t) => t.kind === 'messenger' && t.groupId).map((t) => t.groupId));
    if (selectedGroupId) ids.add(selectedGroupId);
    syncHubMessengerGroupIds([...ids]);
  }, [threads, selectedGroupId, syncHubThreadLeadIds, syncHubMessengerGroupIds]);

  useEffect(() => {
    let reloadT;
    const onGroupActivity = (e) => {
      const { groupId, created_at } = e.detail || {};
      if (!groupId || !created_at) return;
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.kind === 'messenger' && t.groupId === groupId);
        if (idx === -1) return prev;
        return prev.map((t) => {
          if (t.kind !== 'messenger' || t.groupId !== groupId) return t;
          const nextTs = new Date(created_at).getTime();
          const curTs = new Date(t.lastMessageAt || t.updatedAt || 0).getTime();
          const bumpTime = nextTs >= curTs ? created_at : t.lastMessageAt;
          return {
            ...t,
            updatedAt: bumpTime || t.updatedAt,
            lastMessageAt: bumpTime || t.lastMessageAt,
          };
        });
      });
      clearTimeout(reloadT);
      reloadT = setTimeout(() => void reloadMessengerThreads(), 700);
    };
    window.addEventListener('messenger:group-chat-activity', onGroupActivity);
    return () => {
      clearTimeout(reloadT);
      window.removeEventListener('messenger:group-chat-activity', onGroupActivity);
    };
  }, [reloadMessengerThreads]);

  useEffect(() => {
    api.get('/users').then((r) => setAllUsers(r.data?.users || r.data || [])).catch(() => setAllUsers([]));
  }, []);

  useEffect(() => {
    if (!createOpen && !staffPanelOpen) return;
    api.get('/companies').then((r) => setCompanies(r.data?.companies || [])).catch(() => setCompanies([]));
    api
      .get('/users/departments/list')
      .then((r) => setDepartmentsList(r.data?.departments || []))
      .catch(() => setDepartmentsList([]));
  }, [createOpen, staffPanelOpen]);

  const departmentsForCompany = useMemo(() => {
    if (!staffCompanyId) return departmentsList;
    return departmentsList.filter((d) => String(d.company_id || '') === String(staffCompanyId));
  }, [departmentsList, staffCompanyId]);

  const loadStaffList = useCallback(async () => {
    setStaffLoading(true);
    try {
      const params = {};
      if (staffDepartmentId) params.department_id = staffDepartmentId;
      else if (staffCompanyId) params.company_id = staffCompanyId;
      const q = staffListQRef.current.trim();
      if (q) params.search = q;
      const { data } = await api.get('/users', { params });
      const users = data?.users || [];
      setStaffRows(Array.isArray(users) ? users : []);
      setStaffListLoaded(true);
      const ids = users.map((u) => u.id || u.user_id).filter(Boolean);
      if (ids.length) {
        const pr = await api.post('/users/presence', { user_ids: ids }).catch(() => ({ data: { presence: {} } }));
        setPresenceByUser(pr.data?.presence || {});
      } else setPresenceByUser({});
    } catch {
      setStaffRows([]);
      setPresenceByUser({});
    }
    setStaffLoading(false);
  }, [staffCompanyId, staffDepartmentId]);

  /** Tự tải danh sách khi đã chọn công ty hoặc phòng ban (không cần bấm thêm). */
  useEffect(() => {
    if (!staffPanelOpen) return;
    if (!staffCompanyId && !staffDepartmentId) {
      setStaffRows([]);
      setStaffListLoaded(false);
      setPresenceByUser({});
      return;
    }
    void loadStaffList();
  }, [staffPanelOpen, staffCompanyId, staffDepartmentId, loadStaffList]);

  useEffect(() => {
    if (!staffPanelOpen || !staffListLoaded || staffRows.length === 0) return undefined;
    const ids = staffRows.map((u) => u.id || u.user_id).filter(Boolean);
    const tick = () => {
      if (document.hidden) return;
      api.post('/users/presence', { user_ids: ids }).then((r) => setPresenceByUser(r.data?.presence || {})).catch(() => {});
    };
    const id = setInterval(tick, 120 * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [staffPanelOpen, staffListLoaded, staffRows]);

  const onMessagesChange = useCallback(
    (msgs) => {
      setMessages(msgs);
      const preview = previewFromMessages(msgs);
      const meaningful = (msgs || []).filter((m) => !m.is_system);
      const lastAt = meaningful.length ? meaningful[meaningful.length - 1].created_at : null;
      if (!selectedGroupId) return;
      setThreads((prev) =>
        prev.map((t) =>
          t.kind === 'messenger' && t.groupId === selectedGroupId
            ? {
                ...t,
                lastPreview: preview,
                updatedAt: lastAt || t.updatedAt,
                lastMessageAt: lastAt || t.lastMessageAt,
              }
            : t,
        ),
      );
    },
    [selectedGroupId],
  );

  const selected = useMemo(
    () => threads.find((t) => t.kind === 'messenger' && t.groupId === selectedGroupId) || null,
    [threads, selectedGroupId],
  );

  const filteredThreads = useMemo(() => {
    const f = threadFilter.trim().toLowerCase();
    let list = threads;
    if (listTab === 'pinned') list = list.filter((t) => t.pinned);
    if (f) {
      list = list.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(f) ||
          (t.lastPreview || '').toLowerCase().includes(f) ||
          (String(t.peer_id || '').toLowerCase().includes(f)),
      );
    }
    const lastTs = (t) => new Date(t.lastMessageAt || t.updatedAt || 0).getTime();
    const byActivity = (a, b) => lastTs(b) - lastTs(a);
    return [...list].sort((a, b) => {
      if (a.pinned && b.pinned) return byActivity(a, b);
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return byActivity(a, b);
    });
  }, [threads, listTab, threadFilter]);

  const mediaBundle = useMemo(() => collectMediaAndFiles(messages), [messages]);

  const openMessengerThread = (t) => {
    if (!t.groupId) return;
    markGroupRead(t.groupId);
    setSelectedGroupId(t.groupId);
  };

  const startChatWithEmployee = async (emp) => {
    const peerId = emp.id || emp.user_id;
    if (!peerId || String(peerId) === String(uid)) return;
    setDirectLoadingId(peerId);
    try {
      const { data: group } = await api.post('/messenger/direct', { peer_user_id: peerId });
      markGroupRead(group.id);
      setSelectedGroupId(group.id);
      await reloadMessengerThreads();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không mở được chat');
    }
    setDirectLoadingId(null);
  };

  const togglePin = async (t, e) => {
    e.stopPropagation();
    if (!t.groupId) return;
    const next = !t.pinned;
    try {
      await api.put(`/messenger/pins/${t.groupId}`, { pinned: next });
      setThreads((prev) =>
        prev.map((row) =>
          row.kind === 'messenger' && row.groupId === t.groupId ? { ...row, pinned: next } : row,
        ),
      );
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Không cập nhật được ghim');
    }
  };

  const filteredUsersForPick = useMemo(() => {
    const q = userPickQ.trim().toLowerCase();
    return (allUsers || [])
      .filter((u) => (u.id || u.user_id) !== uid)
      .filter((u) => {
        if (!q) return true;
        const name = (u.full_name || '').toLowerCase();
        const mail = (u.email || '').toLowerCase();
        return name.includes(q) || mail.includes(q);
      })
      .slice(0, 40);
  }, [allUsers, userPickQ, uid]);

  const addPick = (u) => {
    const id = u.id || u.user_id;
    if (!id || picks.some((p) => p.user_id === id)) return;
    setPicks((p) => [...p, { user_id: id, role: 'member', name: u.full_name || u.email }]);
  };

  const closeCreateModal = () => {
    if (creating || selectingCompanyMembers) return;
    setCreateOpen(false);
    setGroupName('');
    setPicks([]);
    setUserPickQ('');
    setCreateCompanyId('');
  };

  /** Lấy toàn bộ NV active của công ty vào danh sách mời (merge hoặc thay thế). */
  const selectAllCompanyEmployees = async ({ replace = false } = {}) => {
    if (!createCompanyId) {
      alert('Chọn công ty trước.');
      return;
    }
    setSelectingCompanyMembers(true);
    try {
      const { data } = await api.get('/users', { params: { company_id: createCompanyId } });
      const users = (data?.users || []).filter((u) => {
        const id = u.id || u.user_id;
        return id && String(id) !== String(uid);
      });
      if (!users.length) {
        alert('Công ty này chưa có nhân viên active trong hệ thống.');
        return;
      }
      const fromCompany = users.map((u) => ({
        user_id: u.id || u.user_id,
        role: 'member',
        name: u.full_name || u.email || u.id,
      }));
      if (replace) {
        setPicks(fromCompany);
      } else {
        setPicks((prev) => {
          const seen = new Set(prev.map((p) => String(p.user_id)));
          const merged = [...prev];
          for (const row of fromCompany) {
            if (!seen.has(String(row.user_id))) {
              seen.add(String(row.user_id));
              merged.push(row);
            }
          }
          return merged;
        });
      }
      const co = companies.find((c) => String(c.id) === String(createCompanyId));
      if (!groupName.trim() && co) {
        setGroupName(`Nhóm ${co.short_name || co.name}`);
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không tải được danh sách nhân viên');
    } finally {
      setSelectingCompanyMembers(false);
    }
  };

  const createChatGroup = async () => {
    const name = groupName.trim();
    if (!name) {
      alert('Nhập tên nhóm');
      return;
    }
    setCreating(true);
    try {
      const members = picks
        .filter((p) => String(p.user_id) !== String(uid))
        .map((p) => ({ user_id: p.user_id, role: p.role || 'member' }));
      const { data: group } = await api.post('/messenger/groups', { name, members });
      closeCreateModal();
      await reloadMessengerThreads();
      if (group?.id) {
        markGroupRead(group.id);
        setSelectedGroupId(group.id);
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không tạo được nhóm');
    }
    setCreating(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#e8eef5] text-slate-800">
      <div className="flex min-h-0 flex-1 border-t border-slate-200/80">
        {!leftOpen && (
          <div className="flex w-[52px] shrink-0 flex-col border-r border-slate-200 bg-white shadow-sm z-[1]">
            <div className="flex shrink-0 justify-center border-b border-slate-100 py-2">
              <button
                type="button"
                title="Mở danh sách đầy đủ"
                onClick={() => setLeftOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-200 hover:bg-sky-50"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-1.5 py-2">
              {filteredThreads.map((t) => {
                const isSel = t.groupId && selectedGroupId === t.groupId;
                const unread = t.groupId ? unreadByGroupId[t.groupId] || 0 : 0;
                return (
                  <button
                    key={threadRowKey(t)}
                    type="button"
                    title={t.title || 'Hội thoại'}
                    onClick={() => openMessengerThread(t)}
                    className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-cyan-600 text-sm font-bold text-white shadow-sm ring-2 ring-offset-1 ring-offset-white transition hover:opacity-95 ${
                      isSel ? 'ring-sky-500' : 'ring-transparent'
                    }`}
                  >
                    {(t.title || '?').slice(0, 1)}
                    {unread > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-0.5 text-[9px] font-bold text-white">
                        {unread > 99 ? '…' : unread}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* —— Cột trái: danh sách —— */}
        {leftOpen && (
        <aside className="w-[300px] shrink-0 flex flex-col bg-white border-r border-slate-200 shadow-sm">
          <div className="p-2.5 border-b border-slate-100 flex gap-1.5">
            <button
              type="button"
              title="Thu gọn danh sách hội thoại"
              onClick={() => setLeftOpen(false)}
              className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={threadFilter}
                onChange={(e) => setThreadFilter(e.target.value)}
                placeholder="Tìm hội thoại…"
                className="w-full h-9 pl-8 pr-2 rounded-lg bg-slate-100 border-0 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-sky-400"
              />
            </div>
            <button
              type="button"
              title="Tạo nhóm chat"
              onClick={() => setCreateOpen(true)}
              className="h-9 w-9 shrink-0 rounded-lg bg-sky-500 text-white flex items-center justify-center hover:bg-sky-600"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex px-2 gap-1 border-b border-slate-100">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'pinned', label: 'Ưu tiên' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setListTab(t.id)}
                className={`flex-1 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition ${
                  listTab === t.id ? 'border-sky-500 text-sky-700 bg-sky-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="px-2 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
            {!staffPanelOpen ? (
              <button
                type="button"
                onClick={() => setStaffPanelOpen(true)}
                className="w-full h-8 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5"
              >
                <Search className="h-3.5 w-3.5 text-sky-600" />
                Tìm nhân viên
              </button>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Nhân viên</p>
                  <button
                    type="button"
                    className="text-[10px] text-sky-600 font-medium hover:underline"
                    onClick={() => {
                      setStaffPanelOpen(false);
                      setStaffListLoaded(false);
                      setStaffRows([]);
                      setStaffCompanyId('');
                      setStaffDepartmentId('');
                      setStaffListQ('');
                    }}
                  >
                    Thu gọn
                  </button>
                </div>
                <select
                  value={staffCompanyId}
                  onChange={(e) => {
                    setStaffCompanyId(e.target.value);
                    setStaffDepartmentId('');
                  }}
                  className="w-full h-7 px-1.5 rounded-md border border-slate-200 text-[10px] bg-white"
                >
                  <option value="">Tất cả công ty</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={staffDepartmentId}
                  onChange={(e) => {
                    setStaffDepartmentId(e.target.value);
                  }}
                  className="w-full h-7 px-1.5 rounded-md border border-slate-200 text-[10px] bg-white"
                >
                  <option value="">{staffCompanyId ? 'Tất cả phòng ban (theo công ty)' : 'Tất cả phòng ban'}</option>
                  {departmentsForCompany.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  value={staffListQ}
                  onChange={(e) => setStaffListQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (staffCompanyId || staffDepartmentId) && void loadStaffList()}
                  placeholder="Lọc thêm: tên / email / SĐT (Enter)"
                  className="w-full h-7 px-2 rounded-md border border-slate-200 text-[11px] bg-white"
                />
                {!staffCompanyId && !staffDepartmentId ? (
                  <p className="text-[10px] text-slate-500 text-center py-1">Chọn công ty hoặc phòng ban để hiện danh sách.</p>
                ) : staffLoading ? (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={staffLoading || (!staffCompanyId && !staffDepartmentId)}
                  onClick={() => void loadStaffList()}
                  className="w-full h-7 rounded-md border border-slate-200 bg-white text-slate-600 text-[10px] font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  Làm mới danh sách
                </button>
                {staffListLoaded && (
                  <div className="max-h-36 overflow-y-auto space-y-1 pt-0.5 border-t border-slate-200/80">
                    {staffRows.length === 0 ? (
                      <p className="text-[10px] text-slate-400 py-2 text-center">Không có nhân viên.</p>
                    ) : (
                      staffRows.map((u) => {
                        const id = u.id || u.user_id;
                        const isSelf = String(id) === String(uid);
                        const pres = presenceByUser[id] || presenceByUser[String(id)];
                        const online = !!pres?.online;
                        return (
                          <div
                            key={id}
                            className="flex items-center gap-1.5 px-1 py-1 rounded-md text-[11px] hover:bg-white text-slate-700"
                          >
                            <span className="relative shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 text-white flex items-center justify-center text-[9px] font-bold">
                              {(u.full_name || u.email || '?')[0].toUpperCase()}
                              <span
                                className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white ${
                                  online ? 'bg-emerald-500' : 'bg-slate-300'
                                }`}
                                title={online ? 'Đang hoạt động' : 'Offline (>2 phút không ping)'}
                              />
                            </span>
                            <span className="flex-1 min-w-0 truncate font-medium">{u.full_name || u.email}</span>
                            {!isSelf ? (
                              <button
                                type="button"
                                title="Mở chat Messenger"
                                disabled={directLoadingId === id}
                                onClick={() => void startChatWithEmployee(u)}
                                className="shrink-0 px-1.5 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-semibold hover:bg-sky-700 disabled:opacity-60 flex items-center gap-0.5"
                              >
                                {directLoadingId === id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <MessageCircle className="h-3 w-3" />
                                    Chat
                                  </>
                                )}
                              </button>
                            ) : (
                              <span className="text-[9px] text-slate-400 shrink-0">Bạn</span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredThreads.length === 0 && (
              <p className="p-4 text-xs text-slate-400 text-center">
                Chưa có nhóm hoặc chat trực tiếp. Dùng nút Chat cạnh tên nhân viên hoặc tạo nhóm.
              </p>
            )}
            {filteredThreads.map((t) => {
              const isSel = t.groupId && selectedGroupId === t.groupId;
              const unread = t.groupId ? unreadByGroupId[t.groupId] || 0 : 0;
              return (
                <div
                  key={threadRowKey(t)}
                  role="presentation"
                  onClick={() => openMessengerThread(t)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left border-b border-slate-50 hover:bg-slate-50 cursor-pointer ${
                    isSel ? 'bg-sky-50/80' : ''
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-400 to-cyan-600 text-white flex items-center justify-center text-sm font-bold">
                      {(t.title || '?').slice(0, 1)}
                    </div>
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800 truncate">{t.title}</span>
                      {t.is_direct ? (
                        <span className="text-[9px] font-semibold px-1 py-0 rounded bg-emerald-100 text-emerald-800 shrink-0">
                          Trực tiếp
                        </span>
                      ) : (
                        <span className="text-[9px] font-semibold px-1 py-0 rounded bg-violet-100 text-violet-800 shrink-0">
                          Nhóm
                        </span>
                      )}
                      {t.pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0 fill-amber-500" />}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{t.lastPreview || '—'}</p>
                    {typeof t.messageCount === 'number' && t.messageCount > 0 ? (
                      <p className="text-[10px] text-slate-400">{t.messageCount} tin nhắn</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-slate-400">
                      {formatRelativeTime(t.lastMessageAt || t.updatedAt)}
                    </span>
                    <button
                      type="button"
                      className="p-0.5 rounded text-slate-400 hover:text-amber-600"
                      title={t.pinned ? 'Bỏ ghim' : 'Ghim'}
                      onClick={(e) => void togglePin(t, e)}
                    >
                      <Pin className={`h-3.5 w-3.5 ${t.pinned ? 'fill-amber-500 text-amber-600' : ''}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
        )}

        {/* —— Giữa: chat —— */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#eef2f8]">
          {!selectedGroupId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-slate-400">
              <MessageCircle className="h-14 w-14 mb-3 opacity-40" />
              <p className="text-sm font-medium text-slate-600">Chọn một cuộc trò chuyện</p>
              <p className="text-xs mt-1 text-center max-w-xs">
                Trang này chỉ dành cho nhóm và chat trực tiếp giữa nhân viên. Chat Lead/Deal nằm trong CRM.
              </p>
            </div>
          ) : (
            <>
              <header className="h-12 shrink-0 flex items-center gap-2 px-3 bg-white border-b border-slate-200 shadow-sm">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 text-white flex items-center justify-center text-xs font-bold">
                  {(selected?.title || '?').slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{selected?.title}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {selected?.is_direct ? 'Chat trực tiếp (Messenger)' : 'Nhóm chat nội bộ (Messenger)'}
                  </p>
                </div>
                <button type="button" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Gọi (sắp có)">
                  <Phone className="h-4 w-4" />
                </button>
                <button type="button" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Video (sắp có)">
                  <Video className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                  title={rightOpen ? 'Ẩn bảng phải' : 'Thông tin hội thoại'}
                  onClick={() => setRightOpen((v) => !v)}
                >
                  {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openMessengerGroupChat({ id: selectedGroupId, name: selected?.title })
                  }
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700"
                >
                  Chat nổi
                </button>
              </header>
              <div className="flex min-h-0 flex-1">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
                  <MessengerGroupChatTab
                    groupId={selectedGroupId}
                    socket={socket}
                    fillParent
                    onMessagesChange={onMessagesChange}
                  />
                </div>
                {rightOpen && (
                  <aside className="flex w-[272px] shrink-0 flex-col border-l border-slate-200 bg-white shadow-sm">
                    <div className="p-3 border-b border-slate-100 text-center">
                      <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 text-white flex items-center justify-center text-lg font-bold mb-2">
                        {(selected?.title || '?').slice(0, 1)}
                      </div>
                      <p className="text-sm font-semibold text-slate-800 truncate px-1">{selected?.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {selected?.is_direct ? 'Chat trực tiếp' : 'Nhóm Messenger'}
                      </p>
                      <p className="text-[10px] text-slate-500 px-2 mt-3 text-center">
                        Hội thoại nội bộ, không gắn Lead/Deal trên CRM.
                      </p>
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase px-3 py-1.5 bg-slate-50 border-y border-slate-100">Thông tin hội thoại</p>
                    <div className="flex border-b border-slate-100 text-[11px] font-semibold">
                      {[
                        { id: 'media', label: 'Ảnh/Video', Icon: ImageIcon },
                        { id: 'files', label: 'Tệp', Icon: FileText },
                        { id: 'links', label: 'Link', Icon: Link2 },
                      ].map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setRightSection(id)}
                          className={`flex-1 py-2 flex items-center justify-center gap-1 border-b-2 transition ${
                            rightSection === id ? 'border-sky-500 text-sky-700' : 'border-transparent text-slate-500'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 text-xs">
                      {rightSection === 'media' && (
                        <div className="space-y-2">
                          <p className="text-[10px] text-slate-400 px-1">Ảnh & video đã gửi trong hội thoại</p>
                          <div className="grid grid-cols-3 gap-1">
                            {[...mediaBundle.images, ...mediaBundle.videos].slice(0, 18).map((att, i) => {
                              const u = resolveMediaUrl(att.url);
                              return (
                                <a
                                  key={`${att.url}-${i}`}
                                  href={u}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aspect-square rounded-md overflow-hidden bg-slate-100 border border-slate-200"
                                >
                                  {att.type?.startsWith('video/') ? (
                                    <video src={u} className="w-full h-full object-cover" muted playsInline />
                                  ) : (
                                    <img
                                      src={u}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = BROKEN_MEDIA_PLACEHOLDER;
                                      }}
                                    />
                                  )}
                                </a>
                              );
                            })}
                          </div>
                          {[...mediaBundle.images, ...mediaBundle.videos].length === 0 && (
                            <p className="text-slate-400 text-center py-6">Chưa có ảnh/video</p>
                          )}
                        </div>
                      )}
                      {rightSection === 'files' && (
                        <ul className="space-y-1">
                          {mediaBundle.files.map((f, i) => (
                            <li key={`${f.url}-${i}`}>
                              <a
                                href={resolveMediaUrl(f.url)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50"
                              >
                                <FileText className="h-4 w-4 text-sky-600 shrink-0" />
                                <span className="truncate text-slate-700">{f.name || 'Tệp'}</span>
                              </a>
                            </li>
                          ))}
                          {mediaBundle.files.length === 0 && <p className="text-slate-400 text-center py-6">Chưa có tệp</p>}
                        </ul>
                      )}
                      {rightSection === 'links' && (
                        <ul className="space-y-1">
                          {mediaBundle.links.map((l) => (
                            <li key={l.url}>
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 text-sky-700"
                              >
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span className="break-all">{l.label}</span>
                              </a>
                            </li>
                          ))}
                          {mediaBundle.links.length === 0 && <p className="text-slate-400 text-center py-6">Chưa có link trong tin nhắn</p>}
                        </ul>
                      )}
                    </div>
                  </aside>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Modal tạo nhóm */}
      {createOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-600" />
                Tạo nhóm chat
              </h2>
              <button type="button" className="text-slate-500 text-lg leading-none px-1" onClick={closeCreateModal}>
                ×
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="rounded-xl border border-sky-100 bg-sky-50/80 p-3 space-y-2">
                <p className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Nhóm chat theo công ty
                </p>
                <p className="text-[11px] text-sky-800/90 leading-relaxed">
                  Chọn công ty rồi bấm <strong>Chọn tất cả NV</strong> để mời mọi nhân viên đang active của công ty đó.
                </p>
                <select
                  value={createCompanyId}
                  onChange={(e) => setCreateCompanyId(e.target.value)}
                  disabled={creating || selectingCompanyMembers}
                  className="w-full h-9 px-2 rounded-lg border border-sky-200 bg-white text-sm"
                >
                  <option value="">— Chọn công ty —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.short_name || c.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={creating || selectingCompanyMembers || !createCompanyId}
                    onClick={() => void selectAllCompanyEmployees({ replace: true })}
                    className="h-8 px-2.5 rounded-lg bg-sky-600 text-white text-[11px] font-semibold hover:bg-sky-700 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {selectingCompanyMembers ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UsersRound className="h-3.5 w-3.5" />
                    )}
                    Chọn tất cả NV
                  </button>
                  <button
                    type="button"
                    disabled={creating || selectingCompanyMembers || !createCompanyId}
                    onClick={() => void selectAllCompanyEmployees({ replace: false })}
                    className="h-8 px-2.5 rounded-lg border border-sky-300 bg-white text-sky-800 text-[11px] font-semibold hover:bg-sky-50 disabled:opacity-50"
                  >
                    Thêm vào danh sách
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Tên nhóm</label>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                  placeholder="VD: Nhóm dự án A"
                  disabled={creating}
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Tạo <strong>nhóm Messenger</strong> (không tạo Lead/Deal trên CRM). Bạn được thêm tự động là{' '}
                <span className="text-rose-600 font-medium">trưởng nhóm</span>. Các người bạn chọn bên dưới được mời
                vào nhóm; vai trò phó / thành viên áp dụng cho họ.
              </p>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Thêm người{picks.length > 0 ? ` (${picks.length} đã chọn)` : ''}
                </label>
                <input
                  value={userPickQ}
                  onChange={(e) => setUserPickQ(e.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-200 text-xs"
                  placeholder="Gõ tên hoặc email…"
                  disabled={creating}
                />
                <ul className="mt-1 max-h-28 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
                  {filteredUsersForPick.map((u) => (
                    <li key={u.id || u.user_id || u.email}>
                      <button
                        type="button"
                        className="w-full px-2 py-1.5 text-left text-xs hover:bg-sky-50 flex justify-between"
                        onClick={() => addPick(u)}
                        disabled={creating}
                      >
                        <span>{u.full_name || u.email}</span>
                        <span className="text-slate-400">+</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {picks.length > 0 && (
                <ul className="space-y-1.5">
                  {picks.map((p) => (
                    <li key={p.user_id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-100">
                      <span className="flex-1 truncate font-medium">{p.name}</span>
                      <select
                        value={p.role}
                        onChange={(e) => setPicks((prev) => prev.map((x) => (x.user_id === p.user_id ? { ...x, role: e.target.value } : x)))}
                        className="text-[11px] border border-slate-200 rounded-md px-1 py-0.5 bg-white"
                        disabled={creating}
                      >
                        {ROLE_UI.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="text-rose-600 px-1" onClick={() => setPicks((prev) => prev.filter((x) => x.user_id !== p.user_id))}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
              <button type="button" className="h-9 px-4 rounded-lg border border-slate-200 text-sm" disabled={creating} onClick={closeCreateModal}>
                Hủy
              </button>
              <button
                type="button"
                className="h-9 px-4 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
                disabled={creating}
                onClick={() => void createChatGroup()}
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Tạo nhóm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
