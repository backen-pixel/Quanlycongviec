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
  Crown,
  Shield,
  X,
  Check,
} from 'lucide-react';
import { useMessengerDock } from '../context/MessengerDockContext';
import { useCall } from '../context/CallContext';
import { MessengerGroupChatTab } from '../components/LeadChatTabs';
import { useAuth } from '../lib/auth';
import { messengerThreadKey } from '../lib/messengerHubStorage';
import { resolveMediaUrl, BROKEN_MEDIA_PLACEHOLDER } from '../lib/mediaUrl';
import { publicFileUrl } from '../lib/publicFileUrl';

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

/** Sinh gradient màu avatar nhất quán theo tên (tạo cảm giác đa dạng cho danh sách hội thoại). */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #0ea5e9, #0891b2)',
  'linear-gradient(135deg, #8b5cf6, #6366f1)',
  'linear-gradient(135deg, #f43f5e, #ec4899)',
  'linear-gradient(135deg, #22c55e, #16a34a)',
  'linear-gradient(135deg, #f59e0b, #ea580c)',
  'linear-gradient(135deg, #14b8a6, #0d9488)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
  'linear-gradient(135deg, #a855f7, #7c3aed)',
];
function avatarGradientFor(name) {
  const s = String(name || '?');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

/** Avatar hội thoại / thành viên — ảnh thật nếu có, fallback gradient + chữ cái. */
function HubAvatar({
  src,
  name,
  className = 'w-11 h-11',
  textClass = 'text-sm',
  rounded = 'rounded-2xl',
  ringClass = 'ring-2 ring-white/70',
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = src && !imgFailed ? publicFileUrl(src) : '';
  const gradient = avatarGradientFor(name);
  const initial = (name || '?').slice(0, 1).toUpperCase();
  const base = `relative shrink-0 overflow-hidden flex items-center justify-center font-bold text-white shadow-md ${rounded} ${ringClass} ${className}`;

  if (url) {
    return (
      <div className={base} style={{ background: '#e2e8f0' }}>
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }
  return (
    <div className={base} style={{ background: gradient }}>
      <span className={textClass}>{initial}</span>
    </div>
  );
}

function threadAvatarSrc(t) {
  if (t?.is_direct && t?.peer_avatar) return t.peer_avatar;
  return null;
}

/** Chuẩn hóa preview tin nhắn cuối: cắt ngắn + thay placeholder khi nội dung trống. */
function normalizeMessengerPreview(text) {
  let raw = (text || '').toString().trim();
  if (!raw) return '';
  // Tin sticker được lưu dạng `:sticker:<emoji>` → preview hiển thị "Sticker <emoji>"
  if (raw.startsWith(':sticker:')) {
    const emoji = raw.slice(':sticker:'.length).trim();
    raw = emoji ? `Sticker ${emoji}` : 'Sticker';
  }
  const oneLine = raw.replace(/\s+/g, ' ');
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}

/** Gộp API /messenger/groups với preview local; ghim lấy từ DB (pinnedGroupIds). */
function buildMessengerThreads(apiList, lsMessengerRows, pinnedGroupIds) {
  const pinSet = new Set(pinnedGroupIds || []);
  const lsByGid = new Map((lsMessengerRows || []).filter((t) => t.groupId).map((t) => [t.groupId, t]));
  const groups = Array.isArray(apiList) ? apiList : [];
  const mergedMessenger = groups.map((g) => {
    const hit = lsByGid.get(g.id);
    // Ưu tiên preview API (đến từ RPC v2 — `last_message`), fallback localStorage cuối cùng dùng placeholder.
    const apiPreview = normalizeMessengerPreview(g.last_message);
    const lsPreview = normalizeMessengerPreview(hit?.lastPreview);
    const preview = apiPreview || lsPreview || '';
    return {
      kind: 'messenger',
      groupId: g.id,
      leadId: null,
      title: g.name,
      is_direct: !!g.is_direct,
      peer_id: g.peer_id || null,
      peer_avatar: g.peer_avatar || null,
      code: '',
      type: 'group',
      pinned: pinSet.has(g.id),
      lastPreview: preview,
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
  const { markGroupRead, syncHubThreadLeadIds, syncHubMessengerGroupIds, unreadByGroupId } =
    useMessengerDock();
  const { startCall, status: callStatus } = useCall();
  const [searchParams] = useSearchParams();

  const [threads, setThreads] = useState([]);
  const [listTab, setListTab] = useState('all');
  const [threadFilter, setThreadFilter] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(() => searchParams.get('openGroup') || null);
  const [messages, setMessages] = useState([]);
  const [rightOpen, setRightOpen] = useState(false);
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

  /* ── Quản lý thành viên nhóm (right panel tab) ── */
  const [groupDetail, setGroupDetail] = useState(null);     // { id, created_by, is_direct, ... }
  const [groupMembers, setGroupMembers] = useState([]);     // [{ user_id, role, user: {full_name, avatar} }]
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberPicks, setAddMemberPicks] = useState([]); // [{ user_id, role }]
  const [addMemberQ, setAddMemberQ] = useState('');
  const [busyMember, setBusyMember] = useState(null);       // user_id đang xử lý

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
      const { groupId, created_at, content, attachments, is_self, sender_name } = e.detail || {};
      if (!groupId || !created_at) return;
      // Tự dựng preview tức thì (không chờ reload API)
      const rawPreview = (content || '').toString().trim()
        || (Array.isArray(attachments) && attachments.length ? '[Tệp đính kèm]' : '');
      const prefix = is_self ? 'Bạn: ' : (sender_name ? `${sender_name}: ` : '');
      const livePreview = rawPreview ? normalizeMessengerPreview(`${prefix}${rawPreview}`) : '';
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
            lastPreview: livePreview || t.lastPreview,
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
        setPresenceByUser((prev) => ({ ...prev, ...(pr.data?.presence || {}) }));
      }
    } catch {
      setStaffRows([]);
    }
    setStaffLoading(false);
  }, [staffCompanyId, staffDepartmentId]);

  /** Tự tải danh sách khi đã chọn công ty hoặc phòng ban (không cần bấm thêm). */
  useEffect(() => {
    if (!staffPanelOpen) return;
    if (!staffCompanyId && !staffDepartmentId) {
      setStaffRows([]);
      setStaffListLoaded(false);
      return;
    }
    void loadStaffList();
  }, [staffPanelOpen, staffCompanyId, staffDepartmentId, loadStaffList]);

  // Fetch + poll presence cho tất cả peer của chat 1-1 trong sidebar — hiển thị chấm Online/Offline.
  useEffect(() => {
    const directPeerIds = [...new Set(
      (threads || [])
        .filter((t) => t.kind === 'messenger' && t.is_direct && t.peer_id)
        .map((t) => String(t.peer_id)),
    )];
    if (directPeerIds.length === 0) return undefined;
    let cancelled = false;
    const fetchPresence = () => {
      if (document.hidden) return;
      api
        .post('/users/presence', { user_ids: directPeerIds })
        .then((r) => {
          if (cancelled) return;
          setPresenceByUser((prev) => ({ ...prev, ...(r.data?.presence || {}) }));
        })
        .catch(() => {});
    };
    fetchPresence();
    const intervalId = setInterval(fetchPresence, 45 * 1000);
    document.addEventListener('visibilitychange', fetchPresence);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', fetchPresence);
    };
  }, [threads]);

  useEffect(() => {
    if (!staffPanelOpen || !staffListLoaded || staffRows.length === 0) return undefined;
    const ids = staffRows.map((u) => u.id || u.user_id).filter(Boolean);
    const tick = () => {
      if (document.hidden) return;
      api.post('/users/presence', { user_ids: ids }).then((r) => setPresenceByUser((prev) => ({ ...prev, ...(r.data?.presence || {}) }))).catch(() => {});
    };
    const id = setInterval(tick, 45 * 1000);
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

  /* ── Load group detail + members khi đổi group đang xem ── */
  const reloadGroupMembers = useCallback(async (gid) => {
    if (!gid) {
      setGroupDetail(null);
      setGroupMembers([]);
      return;
    }
    try {
      const { data: g } = await api.get(`/messenger/groups/${gid}`);
      setGroupDetail(g || null);
      setGroupMembers(Array.isArray(g?.members) ? g.members : []);
    } catch {
      setGroupDetail(null);
      setGroupMembers([]);
    }
  }, []);

  useEffect(() => {
    void reloadGroupMembers(selectedGroupId);
  }, [selectedGroupId, reloadGroupMembers]);

  // Đổi sang chat trực tiếp mà đang ở tab 'members' → fallback về 'media'
  useEffect(() => {
    if (selected?.is_direct && rightSection === 'members') {
      setRightSection('media');
    }
  }, [selected?.is_direct, rightSection]);

  // Realtime: ai đó thêm/xóa thành viên → reload
  useEffect(() => {
    if (!socket || !selectedGroupId) return undefined;
    const onMembers = (payload) => {
      if (payload?.group_id && String(payload.group_id) === String(selectedGroupId)) {
        void reloadGroupMembers(selectedGroupId);
      }
    };
    socket.on('messenger_group:members', onMembers);
    return () => {
      socket.off('messenger_group:members', onMembers);
    };
  }, [socket, selectedGroupId, reloadGroupMembers]);

  /* Quyền quản trị nhóm: leader/deputy hoặc admin hệ thống */
  const myMember = useMemo(
    () => groupMembers.find((m) => String(m.user_id) === String(uid)) || null,
    [groupMembers, uid],
  );
  const canManageGroup = useMemo(() => {
    if (!groupDetail || groupDetail.is_direct) return false;
    const role = String(user?.role || '').toLowerCase();
    if (role === 'admin' || role === 'sales_admin') return true;
    return myMember && (myMember.role === 'leader' || myMember.role === 'deputy');
  }, [groupDetail, myMember, user?.role]);

  const totalUnreadCount = useMemo(
    () => Object.values(unreadByGroupId || {}).reduce((a, b) => a + (Number(b) || 0), 0),
    [unreadByGroupId],
  );

  const filteredThreads = useMemo(() => {
    const f = threadFilter.trim().toLowerCase();
    let list = threads;
    if (listTab === 'pinned') list = list.filter((t) => t.pinned);
    else if (listTab === 'unread') list = list.filter((t) => (t.groupId ? (unreadByGroupId[t.groupId] || 0) > 0 : false));
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
  }, [threads, listTab, threadFilter, unreadByGroupId]);

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

  /* ── Member management actions ── */
  const onAddMembers = async () => {
    if (!selectedGroupId || !addMemberPicks.length) return;
    try {
      await api.post(`/messenger/groups/${selectedGroupId}/members`, {
        members: addMemberPicks.map((p) => ({ user_id: p.user_id, role: p.role || 'member' })),
      });
      setAddMemberOpen(false);
      setAddMemberPicks([]);
      setAddMemberQ('');
      void reloadGroupMembers(selectedGroupId);
    } catch (e) {
      alert(e?.response?.data?.error || 'Không thêm được thành viên');
    }
  };

  const onRemoveMember = async (member) => {
    if (!selectedGroupId) return;
    const name = member.user?.full_name || 'thành viên này';
    if (!confirm(`Xoá ${name} khỏi nhóm?`)) return;
    try {
      setBusyMember(member.user_id);
      await api.delete(`/messenger/groups/${selectedGroupId}/members/${member.user_id}`);
      void reloadGroupMembers(selectedGroupId);
    } catch (e) {
      alert(e?.response?.data?.error || 'Không xoá được');
    } finally {
      setBusyMember(null);
    }
  };

  const onChangeMemberRole = async (member, role) => {
    if (!selectedGroupId) return;
    try {
      setBusyMember(member.user_id);
      await api.patch(`/messenger/groups/${selectedGroupId}/members/${member.user_id}/role`, { role });
      void reloadGroupMembers(selectedGroupId);
    } catch (e) {
      alert(e?.response?.data?.error || 'Không đổi được vai trò');
    } finally {
      setBusyMember(null);
    }
  };

  const filteredAddCandidates = useMemo(() => {
    const memberIdSet = new Set(groupMembers.map((m) => String(m.user_id)));
    const q = addMemberQ.trim().toLowerCase();
    return (allUsers || [])
      .filter((u) => !memberIdSet.has(String(u.id || u.user_id)))
      .filter((u) => {
        if (!q) return true;
        const name = (u.full_name || '').toLowerCase();
        const mail = (u.email || '').toLowerCase();
        return name.includes(q) || mail.includes(q);
      })
      .slice(0, 30);
  }, [allUsers, addMemberQ, groupMembers]);

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
    <div className="flex h-full min-h-0 flex-1 flex-col text-slate-800 relative">
      {/* gradient backdrop trên nền page-bg để cảm giác có chiều sâu */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top left, rgba(14,165,233,0.10), transparent 55%), radial-gradient(ellipse at bottom right, rgba(168,85,247,0.10), transparent 55%)',
        }}
      />
      <div className="relative flex min-h-0 flex-1 border-t border-white/30">
        {!leftOpen && (
          <div className="flex w-[56px] shrink-0 flex-col border-r border-white/30 bg-white/55 backdrop-blur-xl shadow-sm z-[1]">
            <div className="flex shrink-0 justify-center border-b border-white/30 py-2">
              <button
                type="button"
                title="Mở danh sách đầy đủ"
                onClick={() => setLeftOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/60 bg-white/70 backdrop-blur text-slate-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 transition shadow-sm"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-1.5 py-3 [scrollbar-width:thin]">
              {filteredThreads.map((t) => {
                const isSel = t.groupId && selectedGroupId === t.groupId;
                const unread = t.groupId ? unreadByGroupId[t.groupId] || 0 : 0;
                return (
                  <button
                    key={threadRowKey(t)}
                    type="button"
                    title={t.title || 'Hội thoại'}
                    onClick={() => openMessengerThread(t)}
                    className={`relative flex h-11 w-11 shrink-0 items-center justify-center transition hover:scale-105 hover:shadow-lg ${
                      isSel ? 'ring-2 ring-sky-500 ring-offset-2 ring-offset-white/40 rounded-2xl' : ''
                    }`}
                  >
                    <HubAvatar
                      src={threadAvatarSrc(t)}
                      name={t.title}
                      className="h-11 w-11"
                      textClass="text-[13px]"
                      rounded="rounded-2xl"
                      ringClass={isSel ? 'ring-2 ring-sky-500' : 'ring-2 ring-transparent'}
                    />
                    {unread > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-rose-500 px-0.5 text-[9px] font-bold text-white shadow">
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
        <aside className="w-[320px] shrink-0 flex flex-col bg-white/65 backdrop-blur-xl border-r border-white/30 shadow-sm">
          {/* Hero header — Messenger title + tổng quan */}
          <div className="px-3.5 pt-3 pb-2 bg-gradient-to-r from-sky-50/70 via-white/30 to-violet-50/70 border-b border-white/40">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-500 to-violet-600 text-white flex items-center justify-center shadow-md ring-2 ring-white/70">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div>
                  <h1 className="text-[15px] font-bold leading-none flex items-center gap-1.5" style={{ color: '#0f172a' }}>
                    Tin nhắn
                    {totalUnreadCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">
                        {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                      </span>
                    )}
                  </h1>
                  <p className="text-[10px] text-slate-500 mt-0.5">{filteredThreads.length} hội thoại</p>
                </div>
              </div>
              <button
                type="button"
                title="Thu gọn danh sách hội thoại"
                onClick={() => setLeftOpen(false)}
                className="h-8 w-8 shrink-0 rounded-lg border border-white/60 bg-white/70 backdrop-blur text-slate-600 hover:bg-white hover:text-slate-800 hover:shadow-sm flex items-center justify-center transition"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1.5 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={threadFilter}
                  onChange={(e) => setThreadFilter(e.target.value)}
                  placeholder="Tìm hội thoại…"
                  className="w-full h-9 pl-9 pr-3 rounded-full bg-white/80 backdrop-blur border border-white/70 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60 focus:bg-white shadow-sm transition"
                />
              </div>
              <button
                type="button"
                title="Tạo nhóm chat"
                onClick={() => setCreateOpen(true)}
                className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 text-white flex items-center justify-center hover:from-sky-600 hover:to-cyan-700 hover:shadow-lg shadow-md transition"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Tabs — segmented control glass */}
          <div className="px-3 pt-2 pb-1 border-b border-white/40">
            <div className="flex gap-1 p-1 rounded-xl bg-white/55 backdrop-blur border border-white/60">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'pinned', label: 'Ưu tiên' },
                { id: 'unread', label: 'Chưa đọc' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setListTab(t.id)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    listTab === t.id
                      ? 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-200'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-white/60'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-2.5 py-2 border-b border-white/40 bg-white/30 shrink-0">
            {!staffPanelOpen ? (
              <button
                type="button"
                onClick={() => setStaffPanelOpen(true)}
                className="w-full h-9 rounded-xl border border-white/70 bg-white/75 backdrop-blur text-[11px] font-semibold text-slate-700 hover:bg-white hover:shadow-sm flex items-center justify-center gap-1.5 transition"
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
                            <span className="relative shrink-0">
                              <HubAvatar
                                src={u.avatar}
                                name={u.full_name || u.email}
                                className="w-6 h-6"
                                textClass="text-[9px]"
                                rounded="rounded-full"
                                ringClass=""
                              />
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
          <div className="flex-1 overflow-y-auto px-1.5 py-1 [scrollbar-width:thin]">
            {filteredThreads.length === 0 && (
              <div className="p-6 text-center">
                <div className="mx-auto w-12 h-12 mb-2 rounded-full bg-gradient-to-br from-sky-100 to-violet-100 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-sky-500" />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Chưa có nhóm hoặc chat trực tiếp.<br/>
                  Bấm <strong>+</strong> ở trên hoặc tìm nhân viên để bắt đầu.
                </p>
              </div>
            )}
            {filteredThreads.map((t) => {
              const isSel = t.groupId && selectedGroupId === t.groupId;
              const unread = t.groupId ? unreadByGroupId[t.groupId] || 0 : 0;
              return (
                <div
                  key={threadRowKey(t)}
                  role="presentation"
                  onClick={() => openMessengerThread(t)}
                  className={`group w-full flex items-start gap-2.5 px-2.5 py-2.5 rounded-xl mb-1 text-left cursor-pointer transition-all ${
                    isSel
                      ? 'bg-gradient-to-r from-sky-100/90 to-cyan-50/90 shadow-sm ring-1 ring-sky-200'
                      : 'hover:bg-white/85'
                  }`}
                >
                  <div className="relative shrink-0">
                    <HubAvatar
                      src={threadAvatarSrc(t)}
                      name={t.title}
                      className="w-11 h-11"
                      textClass="text-sm"
                    />
                    {t.is_direct && t.peer_id && (() => {
                      const pres = presenceByUser[t.peer_id] || presenceByUser[String(t.peer_id)];
                      const online = !!pres?.online;
                      return (
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                            online ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                          title={online ? 'Đang hoạt động' : 'Không hoạt động'}
                        />
                      );
                    })()}
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[13px] truncate ${unread > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{t.title}</span>
                      {!t.is_direct && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 shrink-0">Nhóm</span>
                      )}
                      {t.pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0 fill-amber-500" />}
                    </div>
                    <p className={`text-[12px] truncate mt-0.5 ${unread > 0 ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>{t.lastPreview || '—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {formatRelativeTime(t.lastMessageAt || t.updatedAt)}
                    </span>
                    {unread > 0 ? (
                      <span className="w-2 h-2 rounded-full bg-violet-500" title={`${unread} tin chưa đọc`} />
                    ) : (
                      <button
                        type="button"
                        className={`p-1 rounded-md transition ${
                          t.pinned ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500 opacity-0 group-hover:opacity-100'
                        }`}
                        title={t.pinned ? 'Bỏ ghim' : 'Ghim'}
                        onClick={(e) => void togglePin(t, e)}
                      >
                        <Pin className={`h-3.5 w-3.5 ${t.pinned ? 'fill-amber-500' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
        )}

        {/* —— Giữa: chat —— */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-transparent">
          {!selectedGroupId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-slate-400">
              <div className="w-20 h-20 mb-4 rounded-full bg-gradient-to-br from-sky-100 via-cyan-100 to-violet-100 backdrop-blur flex items-center justify-center shadow-md ring-4 ring-white/40">
                <MessageCircle className="h-10 w-10 text-sky-500" />
              </div>
              <p className="text-base font-bold" style={{ color: '#0f172a' }}>Chọn một cuộc trò chuyện</p>
              <p className="text-sm mt-2 text-center max-w-sm text-slate-500 leading-relaxed">
                Trang này dành cho <strong>nhóm chat nội bộ</strong> và <strong>chat 1-1</strong> giữa nhân viên.
                Chat Lead/Deal sẽ nằm trong CRM.
              </p>
            </div>
          ) : (
            <>
              <header className="h-16 shrink-0 flex items-center gap-3 px-4 bg-white/80 backdrop-blur-xl border-b border-white/40 shadow-sm">
                <div className="relative shrink-0">
                  <HubAvatar
                    src={threadAvatarSrc(selected)}
                    name={selected?.title}
                    className="w-11 h-11"
                    textClass="text-sm"
                  />
                  {selected?.is_direct && selected?.peer_id && (() => {
                    const pres = presenceByUser[selected.peer_id] || presenceByUser[String(selected.peer_id)];
                    const online = !!pres?.online;
                    return (
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                          online ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                        title={online ? 'Đang hoạt động' : 'Không hoạt động'}
                      />
                    );
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold truncate" style={{ color: '#0f172a' }}>{selected?.title}</p>
                  <p className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                    {selected?.is_direct ? (() => {
                      const pres = presenceByUser[selected.peer_id] || presenceByUser[String(selected.peer_id)];
                      const online = !!pres?.online;
                      return (
                        <span className="inline-flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <span className={online ? 'text-emerald-600 font-medium' : 'text-slate-500 font-medium'}>
                            {online ? 'Đang hoạt động' : 'Không hoạt động'}
                          </span>
                        </span>
                      );
                    })() : (
                      <><Users className="h-3 w-3" /> Nhóm chat · {groupMembers.length || '—'} thành viên</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(() => {
                    const canCall = !!selected?.is_direct && !!selected?.peer_id && callStatus === 'idle';
                    const disabledReason = !selected?.is_direct
                      ? 'Chỉ gọi được trong hội thoại 1-1'
                      : callStatus !== 'idle'
                        ? 'Đang có cuộc gọi khác'
                        : 'Gọi thoại';
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!canCall) return;
                          startCall({
                            id: selected.peer_id,
                            name: selected.title,
                            avatar: selected.peer_avatar,
                          });
                        }}
                        disabled={!canCall}
                        className={`w-9 h-9 rounded-full transition flex items-center justify-center ${
                          canCall
                            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            : 'text-slate-400 bg-slate-100/80 cursor-not-allowed'
                        }`}
                        title={disabledReason}
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                    );
                  })()}
                  <button type="button" className="w-9 h-9 rounded-full text-slate-400 bg-slate-100/80 cursor-not-allowed flex items-center justify-center" title="Gọi video (sắp có)" disabled>
                    <Video className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full text-slate-600 bg-slate-100/80 hover:bg-violet-100 hover:text-violet-700 transition flex items-center justify-center"
                    title={rightOpen ? 'Ẩn bảng phải' : 'Thông tin hội thoại'}
                    onClick={() => setRightOpen((v) => !v)}
                  >
                    {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </button>
                  {!selected?.is_direct && (
                    <button
                      type="button"
                      onClick={() => { setRightOpen(true); setRightSection('members'); }}
                      className="text-xs font-semibold px-3 h-9 rounded-full bg-white/70 backdrop-blur border border-slate-200 text-slate-700 hover:bg-white hover:shadow-sm inline-flex items-center gap-1.5 transition"
                      title="Quản lý thành viên"
                    >
                      <Users className="h-3.5 w-3.5" />
                      Thành viên
                      {groupMembers.length > 0 && (
                        <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sky-100 px-1 text-[10px] font-bold text-sky-700">
                          {groupMembers.length}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </header>
              <div className="flex min-h-0 flex-1">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white/50 backdrop-blur-sm">
                  <MessengerGroupChatTab
                    groupId={selectedGroupId}
                    socket={socket}
                    fillParent
                    onMessagesChange={onMessagesChange}
                  />
                </div>
                {rightOpen && (
                  <aside className="flex w-[288px] shrink-0 flex-col border-l border-white/40 bg-white/65 backdrop-blur-xl shadow-sm">
                    <div className="p-4 border-b border-white/40 text-center bg-gradient-to-b from-sky-50/60 to-transparent">
                      <HubAvatar
                        src={threadAvatarSrc(selected)}
                        name={selected?.title}
                        className="w-20 h-20 mx-auto mb-2"
                        textClass="text-2xl"
                        rounded="rounded-3xl"
                        ringClass="ring-4 ring-white/70"
                      />
                      <p className="text-sm font-bold truncate px-1" style={{ color: '#0f172a' }}>{selected?.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 inline-flex items-center gap-1 justify-center">
                        {selected?.is_direct ? (
                          <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Chat trực tiếp</>
                        ) : (
                          <><Users className="h-3 w-3" /> Nhóm Messenger</>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-500 px-2 mt-3 text-center leading-relaxed">
                        Hội thoại nội bộ, không gắn Lead/Deal trên CRM.
                      </p>
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 py-1.5 bg-white/40 border-y border-white/40">Thông tin hội thoại</p>
                    <div className="flex border-b border-white/40 text-[11px] font-semibold bg-white/30">
                      {[
                        !selected?.is_direct && {
                          id: 'members',
                          label: `Thành viên${groupMembers.length ? ` (${groupMembers.length})` : ''}`,
                          Icon: Users,
                        },
                        { id: 'media', label: 'Ảnh/Video', Icon: ImageIcon },
                        { id: 'files', label: 'Tệp', Icon: FileText },
                        { id: 'links', label: 'Link', Icon: Link2 },
                      ].filter(Boolean).map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setRightSection(id)}
                          className={`flex-1 py-2 flex items-center justify-center gap-1 border-b-2 transition ${
                            rightSection === id ? 'border-sky-500 text-sky-700 bg-white/60' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/40'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 text-xs">
                      {rightSection === 'members' && !selected?.is_direct && (
                        <div className="space-y-2">
                          {canManageGroup && (
                            <button
                              type="button"
                              onClick={() => {
                                setAddMemberOpen(true);
                                setAddMemberPicks([]);
                                setAddMemberQ('');
                              }}
                              className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 text-white text-[12px] font-semibold hover:bg-sky-700"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Thêm thành viên
                            </button>
                          )}
                          <ul className="space-y-1">
                            {groupMembers.map((m) => {
                              const u = m.user || {};
                              const isCreator =
                                groupDetail?.created_by && String(groupDetail.created_by) === String(m.user_id);
                              const isLeader = m.role === 'leader' || isCreator;
                              const isDeputy = m.role === 'deputy';
                              const isMe = String(m.user_id) === String(uid);
                              const busy = busyMember === m.user_id;
                              return (
                                <li
                                  key={m.user_id}
                                  className="flex items-center gap-2 rounded-xl border border-white/60 p-2 bg-white/70 backdrop-blur hover:bg-white hover:shadow-sm transition"
                                >
                                  <HubAvatar
                                    src={u.avatar}
                                    name={u.full_name || u.email}
                                    className="h-9 w-9"
                                    textClass="text-[12px]"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[12px] font-semibold text-slate-800 truncate flex items-center gap-1">
                                      {u.full_name || 'Người dùng'}
                                      {isMe && <span className="text-[9px] text-slate-400">(bạn)</span>}
                                    </p>
                                    <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                                      {isLeader && <Crown className="h-3 w-3 text-amber-500" />}
                                      {isDeputy && <Shield className="h-3 w-3 text-indigo-500" />}
                                      {isLeader
                                        ? 'Trưởng nhóm'
                                        : isDeputy
                                        ? 'Phó nhóm'
                                        : 'Thành viên'}
                                    </p>
                                  </div>
                                  {canManageGroup && !isCreator && !isMe && (
                                    <div className="flex items-center gap-1">
                                      <select
                                        disabled={busy}
                                        value={isDeputy ? 'deputy' : 'member'}
                                        onChange={(e) => onChangeMemberRole(m, e.target.value)}
                                        className="h-7 px-1 rounded border border-slate-200 text-[10px] bg-white"
                                        title="Đổi vai trò"
                                      >
                                        <option value="member">Thành viên</option>
                                        <option value="deputy">Phó nhóm</option>
                                      </select>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => onRemoveMember(m)}
                                        title="Xoá khỏi nhóm"
                                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                      >
                                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                      </button>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                            {groupMembers.length === 0 && (
                              <li className="text-slate-400 text-center py-6">Chưa có thành viên</li>
                            )}
                          </ul>
                        </div>
                      )}
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
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white/95 backdrop-blur-xl shadow-2xl border border-white/60 overflow-hidden ring-1 ring-black/5">
            <div className="px-4 py-3 border-b border-white/60 flex items-center justify-between bg-gradient-to-r from-sky-50 via-cyan-50 to-violet-50">
              <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: '#0f172a' }}>
                <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white flex items-center justify-center shadow-md">
                  <Users className="h-3.5 w-3.5" />
                </div>
                Tạo nhóm chat mới
              </h2>
              <button type="button" className="h-8 w-8 rounded-lg hover:bg-white/70 text-slate-500 hover:text-slate-700 flex items-center justify-center transition" onClick={closeCreateModal}>
                <X className="h-4 w-4" />
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

      {/* Modal thêm thành viên */}
      {addMemberOpen && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-sky-600" />
                Thêm thành viên vào nhóm
              </h2>
              <button
                type="button"
                className="text-slate-500 text-lg leading-none px-1"
                onClick={() => setAddMemberOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={addMemberQ}
                  onChange={(e) => setAddMemberQ(e.target.value)}
                  placeholder="Tìm nhân viên theo tên / email…"
                  className="w-full h-9 pl-8 pr-2 rounded-lg bg-slate-100 border-0 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-sky-400"
                />
              </div>
              {addMemberPicks.length > 0 && (
                <div className="rounded-lg border border-sky-100 bg-sky-50/60 p-2">
                  <p className="text-[10px] font-bold text-sky-900 uppercase mb-1">
                    Đã chọn ({addMemberPicks.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {addMemberPicks.map((p) => {
                      const u = (allUsers || []).find((x) => String(x.id) === String(p.user_id));
                      return (
                        <span
                          key={p.user_id}
                          className="inline-flex items-center gap-1 rounded-full bg-white border border-sky-200 px-2 py-0.5 text-[11px] text-sky-800"
                        >
                          {u?.full_name || 'NV'}
                          <button
                            type="button"
                            onClick={() =>
                              setAddMemberPicks((prev) => prev.filter((x) => x.user_id !== p.user_id))
                            }
                            className="text-sky-700 hover:text-rose-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <ul className="space-y-1">
                {filteredAddCandidates.map((u) => {
                  const id = u.id || u.user_id;
                  const picked = addMemberPicks.some((p) => String(p.user_id) === String(id));
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (picked) {
                            setAddMemberPicks((prev) => prev.filter((x) => String(x.user_id) !== String(id)));
                          } else {
                            setAddMemberPicks((prev) => [...prev, { user_id: id, role: 'member' }]);
                          }
                        }}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg border text-left ${
                          picked
                            ? 'border-sky-300 bg-sky-50'
                            : 'border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <HubAvatar
                          src={u.avatar}
                          name={u.full_name || u.email}
                          className="h-8 w-8"
                          textClass="text-[11px]"
                          rounded="rounded-full"
                          ringClass=""
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-slate-800 truncate">{u.full_name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                        </div>
                        {picked && <Check className="h-4 w-4 text-sky-600 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
                {filteredAddCandidates.length === 0 && (
                  <li className="text-slate-400 text-center py-6 text-xs">Không còn ai để mời</li>
                )}
              </ul>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
              <button
                type="button"
                className="h-9 px-4 rounded-lg border border-slate-200 text-sm"
                onClick={() => setAddMemberOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!addMemberPicks.length}
                className="h-9 px-4 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 inline-flex items-center gap-2"
                onClick={() => void onAddMembers()}
              >
                <UserPlus className="h-4 w-4" />
                Thêm vào nhóm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
