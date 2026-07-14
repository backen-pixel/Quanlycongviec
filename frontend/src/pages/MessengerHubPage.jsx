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
  Phone,
  Video,
  Loader2,
  X,
  Check,
  PhoneCall,
  MoreHorizontal,
  SlidersHorizontal,
} from 'lucide-react';
import { useMessengerDock } from '../context/MessengerDockContext';
import { useCall } from '../calling';
import GroupCallMemberPickerModal from '../components/GroupCallMemberPickerModal';
import MessengerConversationDetailPanel from '../components/MessengerConversationDetailPanel';
import MessengerCreateGroupModal from '../components/MessengerCreateGroupModal';
import { MessengerGroupChatTab } from '../components/LeadChatTabs';
import { useAuth } from '../lib/auth';
import { messengerThreadKey } from '../lib/messengerHubStorage';
import { publicFileUrl } from '../lib/publicFileUrl';
import {
  buildMessengerMessagePreview,
  normalizeMessengerPreviewText,
  previewFromMessengerMessages,
  pickNewestMessengerPreview,
  resolveThreadPreviewLabel,
} from '../lib/messengerPreview';
import { isMessengerCallLogMessage } from '../lib/messengerCallLog';
import {
  isMessengerMessageHidden,
  loadMessengerHiddenConfig,
} from '../lib/messengerHiddenHistory';
import {
  formatChatHeaderPresenceLabel,
  formatLastActiveShort,
  formatPresenceDotTitle,
  getUserPresence,
} from '../lib/userPresenceDisplay';
import { useRelativeTimeTick } from '../hooks/useRelativeTimeTick';

const URL_IN_TEXT = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;

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
  if (!t?.is_direct && t?.avatar) return t.avatar;
  return null;
}

/** Gộp API /messenger/groups với preview local; ghim lấy từ DB (pinnedGroupIds). */
function buildMessengerThreads(apiList, lsMessengerRows, pinnedGroupIds, prevByGid = new Map()) {
  const pinSet = new Set(pinnedGroupIds || []);
  const lsByGid = new Map((lsMessengerRows || []).filter((t) => t.groupId).map((t) => [t.groupId, t]));
  const groups = Array.isArray(apiList) ? apiList : [];
  const mergedMessenger = groups.map((g) => {
    const hit = lsByGid.get(g.id);
    const prev = prevByGid.get(g.id);
    const { preview, lastMessageAt } = pickNewestMessengerPreview([
      { preview: g.last_message, at: g.last_message_at || g.created_at },
      { preview: hit?.lastPreview, at: hit?.lastMessageAt || hit?.updatedAt },
      { preview: prev?.lastPreview, at: prev?.lastMessageAt || prev?.updatedAt },
    ]);
    return {
      kind: 'messenger',
      groupId: g.id,
      leadId: null,
      title: g.name,
      is_direct: !!g.is_direct,
      peer_id: g.peer_id || null,
      peer_avatar: g.peer_avatar || null,
      peer_full_name: g.peer_full_name || null,
      avatar: g.avatar || null,
      code: '',
      type: 'group',
      pinned: pinSet.has(g.id),
      lastPreview: preview,
      messageCount: typeof g.message_count === 'number' ? g.message_count : 0,
      lastMessageAt: lastMessageAt || g.last_message_at || g.created_at,
      updatedAt: lastMessageAt || hit?.updatedAt || g.last_message_at || g.created_at,
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
  const { markGroupRead, syncHubThreadLeadIds, syncHubMessengerGroupIds, syncUnreadFromGroups, unreadByGroupId, pinnedGroupIds, syncPinnedGroupIds, setMessengerGroupPin, toggleMessengerGroupPin } =
    useMessengerDock();
  const { startCall, startGroupCall, joinGroupCall, status: callStatus, callId: currentCallId } = useCall();
  /** Modal chọn thành viên trước khi bắt đầu cuộc gọi nhóm. */
  const [groupCallPicker, setGroupCallPicker] = useState(null); // null | { kind: 'audio'|'video' }
  /** Map<groupId, { callId, kind, hostName, hostId, groupName, startedAt }> — các cuộc gọi nhóm đang diễn ra. */
  const [activeCallByGroup, setActiveCallByGroup] = useState({});
  const [searchParams] = useSearchParams();

  const [threads, setThreads] = useState([]);
  const [listTab, setListTab] = useState('all');
  const [threadFilter, setThreadFilter] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(() => searchParams.get('openGroup') || null);
  const [messages, setMessages] = useState([]);
  const [hiddenHistoryVersion, setHiddenHistoryVersion] = useState(0);
  /** Nhóm đang mở chat nhưng tin chưa load xong — tránh flash "Chưa có tin nhắn". */
  const [chatLoadingGroupId, setChatLoadingGroupId] = useState(null);
  const [rightOpen, setRightOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const detailPanelClosedByUserRef = useRef(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightSection, setRightSection] = useState('members');
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
  const [groupDetail, setGroupDetail] = useState(null);     // { id, created_by, is_direct, ... }
  const [groupMembers, setGroupMembers] = useState([]);     // [{ user_id, role, user: {full_name, avatar} }]
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberPicks, setAddMemberPicks] = useState([]); // [{ user_id, role }]
  const [addMemberQ, setAddMemberQ] = useState('');
  const [busyMember, setBusyMember] = useState(null);       // user_id đang xử lý
  const [busyAvatar, setBusyAvatar] = useState(false);      // đang upload avatar nhóm
  const groupAvatarInputRef = useRef(null);

  const pinSet = useMemo(() => new Set(pinnedGroupIds.map(String)), [pinnedGroupIds]);

  const threadsWithPin = useMemo(
    () =>
      threads.map((t) =>
        t.kind === 'messenger' && t.groupId ? { ...t, pinned: pinSet.has(String(t.groupId)) } : t,
      ),
    [threads, pinSet],
  );

  useRelativeTimeTick();

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
        syncPinnedGroupIds(pinnedIds);
        syncUnreadFromGroups(apiList);
        setThreads((prev) => {
          const prevByGid = new Map(
            (prev || []).filter((t) => t.kind === 'messenger' && t.groupId).map((t) => [t.groupId, t]),
          );
          return buildMessengerThreads(apiList, lsMessenger, pinnedIds, prevByGid);
        });
      })
      .catch(() =>
        setThreads((prev) => {
          const prevByGid = new Map(
            (prev || []).filter((t) => t.kind === 'messenger' && t.groupId).map((t) => [t.groupId, t]),
          );
          return buildMessengerThreads([], lsMessenger, [], prevByGid);
        }),
      );
  }, [uid, syncUnreadFromGroups, syncPinnedGroupIds]);

  useEffect(() => {
    if (!uid) return;
    void reloadMessengerThreads();
  }, [uid, reloadMessengerThreads]);

  // Mở hội thoại từ bong bóng chat / URL ?openGroup=
  useEffect(() => {
    const targetId = searchParams.get('openGroup');
    if (!targetId) return;
    setSelectedGroupId(targetId);
  }, [searchParams]);

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
      const {
        groupId,
        created_at,
        content,
        attachments,
        message_type,
        is_self,
        sender_name,
        user_id,
        recalled_at,
        is_recalled,
      } = e.detail || {};
      if (!groupId || !created_at) return;
      const body = buildMessengerMessagePreview(
        {
          content,
          attachments,
          message_type,
          user_id,
          recalled_at,
          is_recalled: !!(recalled_at || is_recalled),
        },
        { forUserId: uid, maxLen: 80 },
      );
      const isCallLog = isMessengerCallLogMessage({ content, message_type, attachments });
      const prefix = isCallLog ? '' : is_self ? 'Bạn: ' : sender_name ? `${sender_name}: ` : '';
      const livePreview = body ? normalizeMessengerPreviewText(isCallLog ? body : `${prefix}${body}`) : '';
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.kind === 'messenger' && t.groupId === groupId);
        if (idx === -1) return prev;
        return prev.map((t) => {
          if (t.kind !== 'messenger' || t.groupId !== groupId) return t;
          const nextTs = new Date(created_at).getTime();
          const curTs = new Date(t.lastMessageAt || t.updatedAt || 0).getTime();
          if (nextTs < curTs) return t;
          return {
            ...t,
            updatedAt: created_at,
            lastMessageAt: created_at,
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
    if (!socket) return undefined;
    let recallReloadT;
    const onRecalled = () => {
      clearTimeout(recallReloadT);
      recallReloadT = setTimeout(() => void reloadMessengerThreads(), 400);
    };
    socket.on('messenger_group:recalled', onRecalled);
    return () => {
      clearTimeout(recallReloadT);
      socket.off('messenger_group:recalled', onRecalled);
    };
  }, [socket, reloadMessengerThreads]);

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

  // Presence thành viên nhóm (panel chi tiết — hiển thị offline bao lâu).
  useEffect(() => {
    const memberIds = [...new Set(groupMembers.map((m) => m.user_id).filter(Boolean).map(String))];
    if (!memberIds.length) return undefined;
    let cancelled = false;
    const fetchPresence = () => {
      if (document.hidden) return;
      api
        .post('/users/presence', { user_ids: memberIds })
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
  }, [groupMembers]);

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

  useEffect(() => {
    if (!selectedGroupId) {
      setChatLoadingGroupId(null);
      return;
    }
    const row = threads.find((t) => t.kind === 'messenger' && t.groupId === selectedGroupId);
    const hasPreview = !!normalizeMessengerPreviewText(row?.lastPreview);
    setChatLoadingGroupId(hasPreview ? null : selectedGroupId);
  }, [selectedGroupId, threads]);

  const onMessagesChange = useCallback(
    (msgs, meta) => {
      setMessages(msgs);
      if (!meta?.loaded) return;
      if (selectedGroupId) setChatLoadingGroupId(null);

      const hiddenConfig = selectedGroupId ? loadMessengerHiddenConfig(selectedGroupId) : null;
      const visible = hiddenConfig
        ? (msgs || []).filter((m) => !isMessengerMessageHidden(m, hiddenConfig))
        : msgs || [];
      const preview = previewFromMessengerMessages(visible, { forUserId: uid, maxLen: 80 });
      const lastMsg = visible.length ? visible[visible.length - 1] : null;
      const lastAt = lastMsg?.created_at || null;
      if (!selectedGroupId) return;

      setThreads((prev) =>
        prev.map((t) => {
          if (t.kind !== 'messenger' || t.groupId !== selectedGroupId) return t;
          const nextPreview =
            preview ||
            (meta.loaded && !visible?.length ? 'Chưa có tin nhắn' : t.lastPreview);
          return {
            ...t,
            lastPreview: nextPreview,
            updatedAt: lastAt || t.updatedAt,
            lastMessageAt: lastAt || t.lastMessageAt,
            messageCount: visible?.length || t.messageCount,
          };
        }),
      );
    },
    [selectedGroupId, uid],
  );

  useEffect(() => {
    const onHiddenUpdated = (e) => {
      const gid = e.detail?.groupId;
      if (!gid) return;
      setHiddenHistoryVersion((v) => v + 1);
      if (String(gid) !== String(selectedGroupId)) return;
      const hiddenConfig = loadMessengerHiddenConfig(gid);
      const visible = messages.filter((m) => !isMessengerMessageHidden(m, hiddenConfig));
      const preview = previewFromMessengerMessages(visible, { forUserId: uid, maxLen: 80 });
      setThreads((prev) =>
        prev.map((t) => {
          if (t.kind !== 'messenger' || String(t.groupId) !== String(gid)) return t;
          return {
            ...t,
            lastPreview: preview || 'Chưa có tin nhắn',
            messageCount: visible.length,
          };
        }),
      );
    };
    window.addEventListener('messenger:hidden-updated', onHiddenUpdated);
    return () => window.removeEventListener('messenger:hidden-updated', onHiddenUpdated);
  }, [messages, selectedGroupId, uid]);

  const selected = useMemo(
    () => threadsWithPin.find((t) => t.kind === 'messenger' && t.groupId === selectedGroupId) || null,
    [threadsWithPin, selectedGroupId],
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

  /** Mở panel chi tiết (thành viên / ảnh / tệp / link) khi chọn hội thoại — trừ khi user vừa đóng thủ công. */
  useEffect(() => {
    if (!selectedGroupId) {
      setRightOpen(false);
      return;
    }
    detailPanelClosedByUserRef.current = false;
    setRightSection('media');
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setRightOpen(true);
    }
  }, [selectedGroupId, selected?.is_direct]);

  // Đổi sang chat trực tiếp mà đang ở tab 'members' → fallback về 'media'
  useEffect(() => {
    if (selected?.is_direct && rightSection === 'members') {
      setRightSection('media');
    }
  }, [selected?.is_direct, rightSection]);

  // Realtime: ai đó thêm/xóa thành viên → reload; nhóm đổi avatar → cập nhật threads + group detail
  useEffect(() => {
    if (!socket) return undefined;
    const onMembers = (payload) => {
      if (payload?.group_id && String(payload.group_id) === String(selectedGroupId)) {
        void reloadGroupMembers(selectedGroupId);
      }
    };
    const onUpdated = (payload) => {
      const gid = payload?.group_id;
      if (!gid) return;
      setThreads((cur) => cur.map((t) => (
        t.kind === 'messenger' && String(t.groupId) === String(gid)
          ? { ...t, avatar: payload.avatar ?? null, title: payload.name ?? t.title }
          : t
      )));
      if (String(gid) === String(selectedGroupId)) {
        setGroupDetail((cur) => (cur ? { ...cur, avatar: payload.avatar ?? cur.avatar, name: payload.name ?? cur.name } : cur));
      }
    };
    socket.on('messenger_group:members', onMembers);
    socket.on('messenger_group:updated', onUpdated);
    return () => {
      socket.off('messenger_group:members', onMembers);
      socket.off('messenger_group:updated', onUpdated);
    };
  }, [socket, selectedGroupId, reloadGroupMembers]);

  /* ── Cuộc gọi nhóm đang diễn ra: lắng nghe broadcast + query khi mở 1 nhóm. ── */
  useEffect(() => {
    if (!socket) return undefined;
    const onStarted = (info) => {
      if (!info?.groupId || !info?.callId) return;
      setActiveCallByGroup((cur) => ({ ...cur, [String(info.groupId)]: info }));
    };
    const onEnded = ({ groupId, callId }) => {
      if (!groupId && !callId) return;
      setActiveCallByGroup((cur) => {
        const next = { ...cur };
        if (groupId) {
          const existing = next[String(groupId)];
          if (!existing || !callId || existing.callId === callId) delete next[String(groupId)];
        } else if (callId) {
          for (const [gid, info] of Object.entries(next)) {
            if (info.callId === callId) delete next[gid];
          }
        }
        return next;
      });
    };
    socket.on('call:group_room_started', onStarted);
    socket.on('call:group_room_ended', onEnded);
    return () => {
      socket.off('call:group_room_started', onStarted);
      socket.off('call:group_room_ended', onEnded);
    };
  }, [socket]);

  // Khi mở 1 nhóm → hỏi backend có cuộc gọi đang diễn ra không.
  useEffect(() => {
    if (!socket || !selectedGroupId) return;
    socket.emit('call:group_room_query', { groupId: selectedGroupId });
  }, [socket, selectedGroupId]);

  /** Upload file ảnh làm avatar nhóm. Cần leader/deputy/admin. */
  const onChangeGroupAvatar = useCallback(async (file) => {
    if (!file || !selectedGroupId) return;
    if (!/^image\//i.test(file.type)) {
      alert('Vui lòng chọn file ảnh');
      return;
    }
    try {
      setBusyAvatar(true);
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.patch(`/messenger/groups/${selectedGroupId}/avatar`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newAvatar = data?.avatar || null;
      setThreads((cur) => cur.map((t) => (
        t.kind === 'messenger' && String(t.groupId) === String(selectedGroupId)
          ? { ...t, avatar: newAvatar }
          : t
      )));
      setGroupDetail((cur) => (cur ? { ...cur, avatar: newAvatar } : cur));
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Không đổi được avatar');
    } finally {
      setBusyAvatar(false);
      if (groupAvatarInputRef.current) groupAvatarInputRef.current.value = '';
    }
  }, [selectedGroupId]);

  const onRemoveGroupAvatar = useCallback(async () => {
    if (!selectedGroupId) return;
    if (!confirm('Xoá avatar nhóm?')) return;
    try {
      setBusyAvatar(true);
      await api.delete(`/messenger/groups/${selectedGroupId}/avatar`);
      setThreads((cur) => cur.map((t) => (
        t.kind === 'messenger' && String(t.groupId) === String(selectedGroupId)
          ? { ...t, avatar: null }
          : t
      )));
      setGroupDetail((cur) => (cur ? { ...cur, avatar: null } : cur));
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Không xoá được avatar');
    } finally {
      setBusyAvatar(false);
    }
  }, [selectedGroupId]);

  /* Quyền quản trị nhóm: trưởng/phó hoặc người tạo nhóm (không dùng role admin hệ thống). */
  const myMember = useMemo(
    () => groupMembers.find((m) => String(m.user_id) === String(uid)) || null,
    [groupMembers, uid],
  );
  const canManageGroup = useMemo(() => {
    if (!groupDetail || groupDetail.is_direct) return false;
    if (groupDetail.created_by && String(groupDetail.created_by) === String(uid)) return true;
    const r = String(myMember?.role || '').toLowerCase();
    return r === 'leader' || r === 'deputy';
  }, [groupDetail, myMember, uid]);

  const totalUnreadCount = useMemo(() => {
    const visibleGroupIds = new Set(
      threads.filter((t) => t.kind === 'messenger' && t.groupId).map((t) => String(t.groupId)),
    );
    return Object.entries(unreadByGroupId || {}).reduce((sum, [gid, n]) => {
      if (visibleGroupIds.size > 0 && !visibleGroupIds.has(String(gid))) return sum;
      return sum + (Number(n) || 0);
    }, 0);
  }, [unreadByGroupId, threads]);

  const filteredThreads = useMemo(() => {
    const f = threadFilter.trim().toLowerCase();
    let list = threadsWithPin;
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
  }, [threadsWithPin, listTab, threadFilter, unreadByGroupId]);

  const mediaBundle = useMemo(() => {
    if (!selectedGroupId) return collectMediaAndFiles([]);
    const hiddenConfig = loadMessengerHiddenConfig(selectedGroupId);
    const visible = messages.filter((m) => !isMessengerMessageHidden(m, hiddenConfig));
    return collectMediaAndFiles(visible);
  }, [messages, selectedGroupId, hiddenHistoryVersion]);

  const callCapabilities = useMemo(() => {
    const isIdle = callStatus === 'idle';
    const isDirect = !!selected?.is_direct && !!selected?.peer_id;
    const otherMembers = !isDirect
      ? groupMembers.filter((m) => String(m.user_id) !== String(uid))
      : [];
    const isGroupCallable = !isDirect && !!selectedGroupId && otherMembers.length > 0;
    return {
      isDirect,
      canCall: isIdle && (isDirect || isGroupCallable),
      canVideo: isIdle && (isDirect || isGroupCallable),
    };
  }, [callStatus, selected, groupMembers, selectedGroupId, uid]);

  const openAddMemberModal = () => {
    setAddMemberOpen(true);
    setAddMemberPicks([]);
    setAddMemberQ('');
  };

  const renameGroup = async (name) => {
    if (!selectedGroupId) return;
    await api.patch(`/messenger/groups/${selectedGroupId}`, { name });
    setThreads((cur) =>
      cur.map((t) =>
        t.kind === 'messenger' && String(t.groupId) === String(selectedGroupId) ? { ...t, title: name } : t,
      ),
    );
    setGroupDetail((cur) => (cur ? { ...cur, name } : cur));
  };

  const leaveSelectedGroup = async () => {
    if (!selectedGroupId || selected?.is_direct) return;
    if (!window.confirm('Rời khỏi nhóm? Bạn sẽ không nhận tin nhắn từ nhóm này nữa.')) return;
    try {
      await api.post(`/messenger/groups/${selectedGroupId}/leave`);
      setSelectedGroupId(null);
      setRightOpen(false);
      await reloadMessengerThreads();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không rời được nhóm');
    }
  };

  const setPinnedForSelected = async (nextPinned) => {
    if (!selected?.groupId) return;
    const currentlyPinned = pinSet.has(String(selected.groupId));
    if (currentlyPinned === nextPinned) return;
    await setMessengerGroupPin(selected.groupId, nextPinned);
  };

  const openDetailPanel = (section) => {
    detailPanelClosedByUserRef.current = false;
    setRightSection(section || 'media');
    setRightOpen(true);
  };

  const closeDetailPanel = () => {
    detailPanelClosedByUserRef.current = true;
    setRightOpen(false);
  };

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
    await toggleMessengerGroupPin(t.groupId, pinSet.has(String(t.groupId)), e);
  };

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

  const saveContactNickname = async (targetUserId, nickname) => {
    const trimmed = String(nickname || '').trim();
    try {
      let displayName = trimmed;
      const groupPayload = selectedGroupId ? { group_id: selectedGroupId } : {};
      if (!trimmed) {
        const { data } = await api.delete(`/messenger/nicknames/${targetUserId}`, { data: groupPayload });
        displayName = data?.display_name || '';
      } else {
        const { data } = await api.put(`/messenger/nicknames/${targetUserId}`, {
          nickname: trimmed,
          ...groupPayload,
        });
        displayName = data?.display_name || trimmed;
      }
      const patchMemberUser = (m) => {
        if (String(m.user_id) !== String(targetUserId)) return m;
        const u = m.user || {};
        return {
          ...m,
          user: {
            ...u,
            nickname: trimmed || null,
            contact_nickname: trimmed || null,
            display_name: displayName || u.full_name || u.email,
          },
        };
      };
      setGroupMembers((prev) => prev.map(patchMemberUser));
      if (selected?.is_direct && String(selected.peer_id) === String(targetUserId)) {
        const fallback = selected.peer_full_name || displayName;
        setThreads((prev) =>
          prev.map((t) =>
            t.groupId === selectedGroupId
              ? { ...t, title: trimmed || fallback }
              : t,
          ),
        );
      }
      window.dispatchEvent(
        new CustomEvent('messenger:nicknames-changed', {
          detail: { scope: 'contact', targetUserId, groupId: selectedGroupId || null },
        }),
      );
      await reloadMessengerThreads();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Không lưu được biệt danh');
      throw e;
    }
  };

  const saveGroupMemberNickname = async (targetUserId, nickname) => {
    if (!selectedGroupId || selected?.is_direct) return;
    const trimmed = String(nickname || '').trim();
    try {
      let displayName = trimmed;
      if (!trimmed) {
        const { data } = await api.delete(`/messenger/groups/${selectedGroupId}/nicknames/${targetUserId}`);
        displayName = data?.display_name || '';
      } else {
        const { data } = await api.put(`/messenger/groups/${selectedGroupId}/nicknames/${targetUserId}`, {
          nickname: trimmed,
        });
        displayName = data?.display_name || trimmed;
      }
      const patchMemberUser = (m) => {
        if (String(m.user_id) !== String(targetUserId)) return m;
        const u = m.user || {};
        return {
          ...m,
          user: {
            ...u,
            group_nickname: trimmed || null,
            nickname: trimmed || null,
            display_name: displayName || u.full_name || u.email,
          },
        };
      };
      setGroupMembers((prev) => prev.map(patchMemberUser));
      window.dispatchEvent(
        new CustomEvent('messenger:nicknames-changed', {
          detail: { scope: 'group', groupId: selectedGroupId, targetUserId },
        }),
      );
      await reloadMessengerThreads();
    } catch (e) {
      alert(e?.response?.data?.error || e.message || 'Không lưu được biệt danh trong nhóm');
      throw e;
    }
  };

  const onSaveNickname = async (targetUserId, nickname) => {
    if (selected?.is_direct) {
      await saveContactNickname(targetUserId, nickname);
      return;
    }
    await saveGroupMemberNickname(targetUserId, nickname);
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
    <div className="flex h-full min-h-0 flex-1 flex-col text-slate-800 bg-slate-50/80">
      <div className="relative flex min-h-0 flex-1 border-t border-slate-200/80">
        {!leftOpen && (
          <div className="flex w-[56px] shrink-0 flex-col border-r border-slate-200 bg-white z-[1]">
            <div className="flex shrink-0 justify-center border-b border-slate-100 py-2">
              <button
                type="button"
                title="Mở danh sách đầy đủ"
                onClick={() => setLeftOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition shadow-sm"
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
                    className={`relative flex h-11 w-11 shrink-0 items-center justify-center transition hover:scale-105 ${
                      isSel ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-white rounded-2xl' : ''
                    }`}
                  >
                    <HubAvatar
                      src={threadAvatarSrc(t)}
                      name={t.title}
                      className="h-11 w-11"
                      textClass="text-[13px]"
                      rounded="rounded-2xl"
                      ringClass={isSel ? 'ring-2 ring-violet-500' : 'ring-2 ring-transparent'}
                    />
                    {unread > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-violet-600 px-0.5 text-[9px] font-bold text-white shadow">
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
        <aside className="w-[320px] shrink-0 flex flex-col bg-white border-r border-slate-200 shadow-sm">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 bg-white">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-[17px] font-bold leading-none flex items-center gap-2 text-slate-900">
                  Tin nhắn
                  {totalUnreadCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-violet-600 text-white text-[11px] font-bold shadow-sm">
                      {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                    </span>
                  )}
                </h1>
                <p className="text-[11px] text-slate-500 mt-1">{filteredThreads.length} hội thoại</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Tạo nhóm chat"
                  onClick={() => setCreateOpen(true)}
                  className="h-9 w-9 shrink-0 rounded-full bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 shadow-md transition"
                >
                  <UserPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Thu gọn danh sách hội thoại"
                  onClick={() => setLeftOpen(false)}
                  className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 flex items-center justify-center transition"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={threadFilter}
                  onChange={(e) => setThreadFilter(e.target.value)}
                  placeholder="Tìm hội thoại, tên hoặc số điện thoại…"
                  className="w-full h-10 pl-9 pr-3 rounded-full bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300/70 focus:border-violet-300 focus:bg-white transition"
                />
              </div>
              <button
                type="button"
                title="Lọc / tìm nhân viên"
                onClick={() => setStaffPanelOpen((v) => !v)}
                className={`h-10 w-10 shrink-0 rounded-full border flex items-center justify-center transition ${
                  staffPanelOpen
                    ? 'border-violet-300 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex border-b border-slate-200 px-2 bg-white shrink-0">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'pinned', label: 'Ưu tiên' },
              { id: 'unread', label: 'Chưa đọc' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setListTab(t.id)}
                className={`flex-1 py-2.5 text-[13px] font-semibold border-b-2 transition -mb-px ${
                  listTab === t.id
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {staffPanelOpen ? (
          <div className="px-3 py-2 border-b border-slate-100 bg-violet-50/40 shrink-0">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">Tìm nhân viên</p>
                  <button
                    type="button"
                    className="text-[10px] text-violet-600 font-medium hover:underline"
                    onClick={() => {
                      setStaffPanelOpen(false);
                      setStaffListLoaded(false);
                      setStaffRows([]);
                      setStaffCompanyId('');
                      setStaffDepartmentId('');
                      setStaffListQ('');
                    }}
                  >
                    Đóng
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
                    <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
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
                        const pres = getUserPresence(presenceByUser, id);
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
                                title={formatPresenceDotTitle(pres)}
                              />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block truncate font-medium">{u.full_name || u.email}</span>
                              {!online && (
                                <span className="block truncate text-[10px] text-slate-400">
                                  {formatLastActiveShort(pres?.last_ping_at)}
                                </span>
                              )}
                            </span>
                            {!isSelf ? (
                              <button
                                type="button"
                                title="Mở chat Messenger"
                                disabled={directLoadingId === id}
                                onClick={() => void startChatWithEmployee(u)}
                                className="shrink-0 px-1.5 py-0.5 rounded-md bg-violet-600 text-white text-[10px] font-semibold hover:bg-violet-700 disabled:opacity-60 flex items-center gap-0.5"
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
          </div>
          ) : null}
          <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {filteredThreads.length === 0 && (
              <div className="p-8 text-center">
                <div className="mx-auto w-14 h-14 mb-3 rounded-2xl bg-violet-100 flex items-center justify-center">
                  <MessageCircle className="h-7 w-7 text-violet-600" />
                </div>
                <p className="text-sm font-semibold text-slate-800">Chưa có hội thoại</p>
                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                  Bấm <strong className="text-violet-700">+</strong> để tạo nhóm hoặc dùng bộ lọc để tìm nhân viên.
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
                  className={`group w-full flex items-start gap-3 px-3 py-3 rounded-xl mb-0.5 text-left cursor-pointer transition-all border-l-[4px] ${
                    isSel
                      ? 'bg-violet-100/95 border-violet-700 shadow-md shadow-violet-200/50 ring-1 ring-violet-300/70'
                      : unread > 0
                        ? 'bg-violet-50/40 border-transparent hover:bg-violet-50/70'
                        : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className="relative shrink-0">
                    <HubAvatar
                      src={threadAvatarSrc(t)}
                      name={t.title}
                      className="w-12 h-12"
                      textClass="text-sm"
                      rounded="rounded-full"
                    />
                    {t.is_direct && t.peer_id && (() => {
                      const pres = getUserPresence(presenceByUser, t.peer_id);
                      const online = !!pres?.online;
                      return (
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                            online ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                          title={formatPresenceDotTitle(pres)}
                        />
                      );
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[14px] truncate ${
                          isSel
                            ? 'font-bold text-violet-950'
                            : unread > 0
                              ? 'font-bold text-slate-900'
                              : 'font-semibold text-slate-800'
                        }`}
                      >
                        {t.title}
                      </span>
                      {!t.is_direct && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-600 text-white shrink-0 shadow-sm">
                          Nhóm
                        </span>
                      )}
                      {t.pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0 fill-amber-500" />}
                    </div>
                    {(() => {
                      const previewLabel = resolveThreadPreviewLabel(t, {
                        loadingGroupId: chatLoadingGroupId,
                        forUserId: uid,
                      }) || '—';
                      const hasPreview = previewLabel && previewLabel !== '—' && previewLabel !== 'Chưa có tin nhắn';
                      return (
                        <p
                          className={`text-[12px] truncate mt-1 px-2 py-1 rounded-lg border transition-colors ${
                            isSel
                              ? 'font-semibold text-violet-900 bg-violet-200/55 border-violet-300/80'
                              : unread > 0
                                ? 'font-semibold text-violet-900 bg-violet-100/90 border-violet-200/80 shadow-sm'
                                : hasPreview
                                  ? 'font-medium text-slate-700 bg-slate-50 border-slate-100'
                                  : 'text-slate-500 border-transparent px-0 py-0 bg-transparent'
                          }`}
                          title={previewLabel}
                        >
                          {previewLabel}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0 min-w-[44px]">
                    <span
                      className={`text-[11px] whitespace-nowrap ${
                        isSel ? 'text-violet-800 font-bold' : unread > 0 ? 'text-violet-700 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {formatRelativeTime(t.lastMessageAt || t.updatedAt)}
                    </span>
                    {unread > 0 ? (
                      <span className="inline-flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-violet-600 text-white text-[10px] font-bold shadow-sm">
                        {unread > 99 ? '99+' : unread}
                      </span>
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
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          {!selectedGroupId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 bg-slate-50/50">
              <div className="relative w-28 h-24 mb-6">
                <div className="absolute left-3 top-1 w-16 h-16 rounded-2xl bg-violet-600 shadow-lg rotate-[-10deg] flex items-center justify-center">
                  <MessageCircle className="h-8 w-8 text-white/90" />
                </div>
                <div className="absolute right-2 bottom-0 w-16 h-16 rounded-2xl bg-white border-2 border-violet-200 shadow-md rotate-[8deg] flex items-center justify-center">
                  <MessageCircle className="h-8 w-8 text-violet-400" />
                </div>
              </div>
              <p className="text-lg font-bold text-slate-900">Chọn một cuộc trò chuyện</p>
              <p className="text-sm mt-2 text-center max-w-md text-slate-500 leading-relaxed">
                Trang này dành cho <strong className="text-violet-700">nhóm chat nội bộ</strong> và{' '}
                <strong className="text-violet-700">chat 1-1</strong> giữa nhân viên.
                Chat Lead/Deal sẽ nằm trong CRM.
              </p>
            </div>
          ) : (
            <>
              <header className="h-[60px] shrink-0 flex items-center gap-3 px-4 bg-white border-b border-slate-200">
                <div className="relative shrink-0">
                  <HubAvatar
                    src={threadAvatarSrc(selected)}
                    name={selected?.title}
                    className="w-11 h-11"
                    textClass="text-sm"
                    rounded="rounded-full"
                  />
                  {selected?.is_direct && selected?.peer_id && (() => {
                    const pres = getUserPresence(presenceByUser, selected.peer_id);
                    const online = !!pres?.online;
                    return (
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                          online ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                        title={formatPresenceDotTitle(pres)}
                      />
                    );
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[16px] font-bold truncate text-slate-900">{selected?.title}</p>
                    {!selected?.is_direct && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-600 text-white shrink-0">Nhóm</span>
                    )}
                  </div>
                  <p className="text-[12px] truncate flex items-center gap-1.5 mt-0.5">
                    {selected?.is_direct ? (() => {
                      const pres = getUserPresence(presenceByUser, selected.peer_id);
                      const online = !!pres?.online;
                      return (
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <span className={online ? 'text-emerald-600 font-semibold' : 'text-slate-500 font-medium'}>
                            {formatChatHeaderPresenceLabel(pres)}
                          </span>
                        </span>
                      );
                    })() : (
                      <span className="text-slate-500 font-medium inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-violet-500" />
                        {groupMembers.length || '—'} thành viên
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {(() => {
                    const isIdle = callStatus === 'idle';
                    const isDirect = !!selected?.is_direct && !!selected?.peer_id;
                    const otherMembers = !isDirect
                      ? groupMembers.filter((m) => String(m.user_id) !== String(uid))
                      : [];
                    const isGroupCallable = !isDirect && !!selectedGroupId && otherMembers.length > 0;
                    const canCall = isIdle && (isDirect || isGroupCallable);
                    const disabledReason = !isIdle
                      ? 'Đang có cuộc gọi khác'
                      : (!isDirect && !isGroupCallable)
                        ? 'Nhóm chưa có thành viên khác'
                        : isDirect
                          ? 'Gọi thoại'
                          : 'Gọi nhóm';
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!canCall) return;
                          if (isDirect) {
                            startCall({
                              id: selected.peer_id,
                              name: selected.title,
                              avatar: selected.peer_avatar,
                            }, { groupId: selectedGroupId });
                          } else {
                            // Nhóm → mở modal chọn thành viên trước
                            setGroupCallPicker({ kind: 'audio' });
                          }
                        }}
                        disabled={!canCall}
                        className={`w-9 h-9 rounded-full transition flex items-center justify-center ${
                          canCall
                            ? 'text-violet-700 bg-violet-50 hover:bg-violet-100'
                            : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                        }`}
                        title={disabledReason}
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                    );
                  })()}
                  {(() => {
                    const isIdle = callStatus === 'idle';
                    const isDirect = !!selected?.is_direct && !!selected?.peer_id;
                    const otherMembers = !isDirect
                      ? groupMembers.filter((m) => String(m.user_id) !== String(uid))
                      : [];
                    const isGroupCallable = !isDirect && !!selectedGroupId && otherMembers.length > 0;
                    const canVideo = isIdle && (isDirect || isGroupCallable);
                    const disabledReason = !isIdle
                      ? 'Đang có cuộc gọi khác'
                      : (!isDirect && !isGroupCallable)
                        ? 'Nhóm chưa có thành viên khác'
                        : isDirect
                          ? 'Gọi video'
                          : 'Gọi video nhóm';
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (!canVideo) return;
                          if (isDirect) {
                            startCall({
                              id: selected.peer_id,
                              name: selected.title,
                              avatar: selected.peer_avatar,
                            }, { video: true, groupId: selectedGroupId });
                          } else {
                            // Nhóm → mở modal chọn thành viên trước
                            setGroupCallPicker({ kind: 'video' });
                          }
                        }}
                        disabled={!canVideo}
                        className={`w-9 h-9 rounded-full transition flex items-center justify-center ${
                          canVideo
                            ? 'text-violet-700 bg-violet-50 hover:bg-violet-100'
                            : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                        }`}
                        title={disabledReason}
                      >
                        <Video className="h-4 w-4" />
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => (rightOpen ? closeDetailPanel() : openDetailPanel())}
                    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-semibold transition shrink-0 ${
                      rightOpen
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200'
                    }`}
                    title="Thành viên, ảnh/video, tệp, link trong hội thoại"
                  >
                    {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                    Chi tiết
                  </button>
                </div>
              </header>
              {/* Banner: có cuộc gọi nhóm đang diễn ra → cho phép user tham gia */}
              {!selected?.is_direct && selectedGroupId && activeCallByGroup[String(selectedGroupId)] && (() => {
                const info = activeCallByGroup[String(selectedGroupId)];
                // Đã trong cuộc gọi này (status active/connecting) → ẩn banner
                if (currentCallId === info.callId && callStatus !== 'outgoing') return null;
                const isVideo = info.kind === 'video';
                const isWaiting = currentCallId === info.callId && callStatus === 'outgoing';
                const isBusy = !isWaiting && callStatus !== 'idle';
                return (
                  <div className={`shrink-0 flex items-center gap-3 px-4 py-2.5 border-b ${
                    isVideo ? 'bg-gradient-to-r from-sky-500/10 to-indigo-500/10 border-sky-200' : 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-200'
                  }`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm ${
                      isVideo ? 'bg-sky-600' : 'bg-emerald-600'
                    }`}>
                      {isVideo ? <Video className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">
                        {isWaiting
                          ? 'Đang chờ chủ phòng duyệt…'
                          : `Cuộc gọi ${isVideo ? 'video' : 'thoại'} đang diễn ra`}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {isWaiting
                          ? `${info.hostName || 'Chủ phòng'} đang xem xét yêu cầu tham gia của bạn`
                          : info.hostName
                            ? `${info.hostName} đã bắt đầu cuộc gọi`
                            : 'Có cuộc gọi đang diễn ra trong nhóm'}
                      </p>
                    </div>
                    {isWaiting ? (
                      <span className="shrink-0 inline-flex items-center gap-1.5 px-4 h-9 rounded-full bg-amber-100 text-amber-700 text-[12px] font-semibold">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Đang chờ
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => joinGroupCall(info)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-4 h-9 rounded-full text-white text-[12px] font-semibold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed ${
                          isVideo ? 'bg-sky-600 hover:bg-sky-700' : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                        title={isBusy ? 'Đang có cuộc gọi khác' : 'Yêu cầu tham gia (chủ phòng duyệt)'}
                      >
                        {isVideo ? <Video className="h-3.5 w-3.5" /> : <PhoneCall className="h-3.5 w-3.5" />}
                        Xin tham gia
                      </button>
                    )}
                  </div>
                );
              })()}
              <div className="flex min-h-0 flex-1">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/40">
                  <MessengerGroupChatTab
                    groupId={selectedGroupId}
                    socket={socket}
                    fillParent
                    groupTitle={selected?.title || ''}
                    onMessagesChange={onMessagesChange}
                  />
                </div>
                {rightOpen && (
                  <MessengerConversationDetailPanel
                    selected={selected}
                    groupDetail={groupDetail}
                    groupMembers={groupMembers}
                    mediaBundle={mediaBundle}
                    messages={messages}
                    selectedGroupId={selectedGroupId}
                    uid={uid}
                    rightSection={rightSection}
                    onSectionChange={setRightSection}
                    canManageGroup={canManageGroup}
                    presenceByUser={presenceByUser}
                    pinned={!!selected?.pinned}
                    busyAvatar={busyAvatar}
                    busyMember={busyMember}
                    avatarSrc={threadAvatarSrc(selected)}
                    groupAvatarInputRef={groupAvatarInputRef}
                    onAddMember={openAddMemberModal}
                    onRemoveMember={onRemoveMember}
                    onChangeMemberRole={onChangeMemberRole}
                    onChangeGroupAvatar={onChangeGroupAvatar}
                    onRenameGroup={renameGroup}
                    onSaveNickname={onSaveNickname}
                    onTogglePin={setPinnedForSelected}
                    onLeaveGroup={() => void leaveSelectedGroup()}
                    onGroupCall={(kind) => setGroupCallPicker({ kind })}
                    canCall={callCapabilities.canCall}
                    canVideo={callCapabilities.canVideo}
                    onDirectCall={() => {
                      if (!callCapabilities.canCall || !selected?.peer_id) return;
                      startCall(
                        { id: selected.peer_id, name: selected.title, avatar: selected.peer_avatar },
                        { groupId: selectedGroupId },
                      );
                    }}
                    onDirectVideo={() => {
                      if (!callCapabilities.canVideo || !selected?.peer_id) return;
                      startCall(
                        { id: selected.peer_id, name: selected.title, avatar: selected.peer_avatar },
                        { video: true, groupId: selectedGroupId },
                      );
                    }}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <MessengerCreateGroupModal
        open={createOpen}
        onClose={closeCreateModal}
        groupName={groupName}
        onGroupNameChange={setGroupName}
        createCompanyId={createCompanyId}
        onCompanyChange={setCreateCompanyId}
        companies={companies}
        allUsers={allUsers}
        picks={picks}
        onPicksChange={setPicks}
        userPickQ={userPickQ}
        onUserPickQChange={setUserPickQ}
        presenceByUser={presenceByUser}
        onPresenceUpdate={(patch) => setPresenceByUser((prev) => ({ ...prev, ...patch }))}
        uid={uid}
        creating={creating}
        selectingCompanyMembers={selectingCompanyMembers}
        onSelectAllCompany={selectAllCompanyEmployees}
        onCreate={createChatGroup}
      />

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

      {/* Modal chọn thành viên trước khi gọi nhóm */}
      <GroupCallMemberPickerModal
        open={!!groupCallPicker}
        kind={groupCallPicker?.kind || 'audio'}
        groupName={selected?.title || 'Nhóm chat'}
        members={groupMembers
          .filter((m) => String(m.user_id) !== String(uid))
          .map((m) => ({
            id: m.user_id,
            name: m.user?.full_name || m.user?.fullName || 'Thành viên',
            avatar: m.user?.avatar || null,
          }))}
        onCancel={() => setGroupCallPicker(null)}
        onConfirm={(pickedMembers) => {
          const opts = groupCallPicker?.kind === 'video' ? { video: true } : {};
          setGroupCallPicker(null);
          startGroupCall({
            id: selectedGroupId,
            name: selected?.title || 'Nhóm chat',
            members: pickedMembers,
          }, opts);
        }}
      />
    </div>
  );
}
