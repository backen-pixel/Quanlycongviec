import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Crown,
  ExternalLink,
  FileText,
  Download,
  Image as ImageIcon,
  Link2,
  Loader2,
  LogOut,
  MoreVertical,
  Pencil,
  Phone,
  Pin,
  Plus,
  Shield,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { resolveMediaUrl, BROKEN_MEDIA_PLACEHOLDER } from '../lib/mediaUrl';
import { publicFileUrl } from '../lib/publicFileUrl';
import { displayMessengerFilename, downloadMessengerFile, openMessengerFile } from '../lib/messengerMessageActions';
import { messengerDisplayName } from '../lib/messengerDisplayName';
import GroupSenderName from './GroupSenderName';
import { dispatchMessengerClearHistory } from '../lib/messengerHiddenHistory';
import UploadFileLightbox, { collectUploadLightboxItems, findUploadLightboxIndex } from './UploadFileLightbox';
import {
  formatChatHeaderPresenceLabel,
  formatLastActiveAgo,
  formatPresenceDotTitle,
  getUserPresence,
} from '../lib/userPresenceDisplay';
import { useRelativeTimeTick } from '../hooks/useRelativeTimeTick';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #f43f5e, #ec4899)',
  'linear-gradient(135deg, #8b5cf6, #6366f1)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
  'linear-gradient(135deg, #14b8a6, #0d9488)',
];

function avatarGradientFor(name) {
  const s = String(name || '?');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function DetailAvatar({ src, name, className = 'w-11 h-11', textClass = 'text-sm', rounded = 'rounded-full' }) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = src && !imgFailed ? publicFileUrl(src) : '';
  const base = `relative shrink-0 overflow-hidden flex items-center justify-center font-bold text-white ${rounded} ${className}`;
  if (url) {
    return (
      <div className={base} style={{ background: '#e2e8f0' }}>
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setImgFailed(true)} />
      </div>
    );
  }
  return (
    <div className={base} style={{ background: avatarGradientFor(name) }}>
      <span className={textClass}>{(name || '?').slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition shrink-0 disabled:opacity-40 ${
        checked ? 'bg-violet-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function QuickAction({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 disabled:opacity-40"
    >
      <span className="w-11 h-11 rounded-full bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 hover:bg-violet-100 transition">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] font-medium text-violet-700">{label}</span>
    </button>
  );
}

function memberRoleLabel(m, groupDetail) {
  const isCreator = groupDetail?.created_by && String(groupDetail.created_by) === String(m.user_id);
  const isLeader = m.role === 'leader' || isCreator;
  const isDeputy = m.role === 'deputy';
  if (isLeader) return 'Trưởng nhóm';
  if (isDeputy) return 'Phó nhóm';
  return 'Thành viên';
}

function DetailPanelFileRow({ file }) {
  const [busy, setBusy] = useState(false);
  const name = displayMessengerFilename(file);
  const fileUrl = resolveMediaUrl(file?.url);

  const handleDownload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!file?.url || busy) return;
    setBusy(true);
    try {
      await downloadMessengerFile(file.url, name);
    } catch (err) {
      alert(err?.message || 'Không tải được tệp');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <div className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50">
        <FileText className="h-4 w-4 text-violet-600 shrink-0" />
        <a
          href={fileUrl}
          onClick={(e) => {
            e.preventDefault();
            if (file?.url) void openMessengerFile(file.url, name);
          }}
          className="flex-1 min-w-0 truncate text-sm text-slate-700 hover:text-violet-700 cursor-pointer"
          title={name}
        >
          {name}
        </a>
        <button
          type="button"
          onClick={(e) => void handleDownload(e)}
          disabled={!fileUrl || busy}
          className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-violet-50 hover:text-violet-700 text-slate-500 flex items-center justify-center transition disabled:opacity-40"
          title="Tải xuống"
          aria-label={`Tải xuống ${name}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}

export default function MessengerConversationDetailPanel({
  selected,
  groupDetail,
  groupMembers = [],
  mediaBundle,
  selectedGroupId,
  uid,
  rightSection,
  onSectionChange,
  canManageGroup,
  presenceByUser = {},
  pinned = false,
  busyAvatar = false,
  busyMember = null,
  messages = [],
  avatarSrc,
  onAddMember,
  onRemoveMember,
  onChangeMemberRole,
  onChangeGroupAvatar,
  onRenameGroup,
  onSaveNickname,
  onTogglePin,
  onLeaveGroup,
  onGroupCall,
  onDirectCall,
  onDirectVideo,
  canCall = false,
  canVideo = false,
  groupAvatarInputRef,
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [nicknamingUserId, setNicknamingUserId] = useState(null);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [memberMenuId, setMemberMenuId] = useState(null);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [mediaLightboxIndex, setMediaLightboxIndex] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const memberMenuRef = useRef(null);
  const membersSectionRef = useRef(null);

  const isDirect = !!selected?.is_direct;
  const title = selected?.title || groupDetail?.name || 'Hội thoại';
  const peerMember = isDirect ? groupMembers.find((m) => String(m.user_id) !== String(uid)) : null;
  const peerUser = peerMember?.user || null;
  const peerLegalName = peerUser?.full_name || peerUser?.email || selected?.peer_full_name || '';
  const memberCount = groupMembers.length;

  const mediaCount = (mediaBundle?.images?.length || 0) + (mediaBundle?.videos?.length || 0);
  const fileCount = mediaBundle?.files?.length || 0;
  const linkCount = mediaBundle?.links?.length || 0;

  const notifyKey = selectedGroupId ? `messenger_notify_${selectedGroupId}` : '';
  const [notifyOn, setNotifyOn] = useState(true);

  useRelativeTimeTick();

  useEffect(() => {
    if (!notifyKey) return;
    try {
      setNotifyOn(localStorage.getItem(notifyKey) !== '0');
    } catch {
      setNotifyOn(true);
    }
  }, [notifyKey]);

  useEffect(() => {
    if (!memberMenuId) return undefined;
    const onDown = (e) => {
      if (memberMenuRef.current?.contains(e.target)) return;
      setMemberMenuId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [memberMenuId]);

  const onlineLabel = useMemo(() => {
    if (isDirect && selected?.peer_id) {
      const pres = getUserPresence(presenceByUser, selected.peer_id);
      return formatChatHeaderPresenceLabel(pres);
    }
    const onlineCount = groupMembers.filter((m) => {
      const pres = getUserPresence(presenceByUser, m.user_id);
      return !!pres?.online;
    }).length;
    if (onlineCount > 0) return `${onlineCount} đang hoạt động`;
    return `${groupMembers.length} thành viên`;
  }, [isDirect, selected?.peer_id, groupMembers, presenceByUser]);

  const previewMembers = groupMembers.slice(0, 4);
  const extraMembers = Math.max(0, memberCount - previewMembers.length);

  const tabs = [
    { id: 'media', label: 'Ảnh/Video', count: mediaCount, Icon: ImageIcon },
    { id: 'files', label: 'Tệp', count: fileCount, Icon: FileText },
    { id: 'links', label: 'Link', count: linkCount, Icon: Link2 },
  ];

  const imageGallery = useMemo(
    () => collectUploadLightboxItems(mediaBundle?.images || []),
    [mediaBundle?.images],
  );

  const mediaGridItems = useMemo(
    () => [...(mediaBundle?.images || []), ...(mediaBundle?.videos || [])],
    [mediaBundle?.images, mediaBundle?.videos],
  );

  useEffect(() => {
    setMembersExpanded(false);
  }, [selectedGroupId]);

  useEffect(() => {
    if (rightSection !== 'members' || isDirect) return;
    setMembersExpanded(true);
    const t = window.setTimeout(() => {
      membersSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [rightSection, isDirect]);

  const startRename = () => {
    setRenameDraft(title);
    setRenaming(true);
  };

  const saveRename = async () => {
    const next = renameDraft.trim();
    if (!next || next === title) {
      setRenaming(false);
      return;
    }
    await onRenameGroup?.(next);
    setRenaming(false);
  };

  const startNicknameEdit = (targetUserId, currentNickname = '') => {
    setNicknamingUserId(targetUserId);
    setNicknameDraft(currentNickname);
    setMemberMenuId(null);
  };

  const saveNickname = async () => {
    if (!nicknamingUserId) return;
    await onSaveNickname?.(nicknamingUserId, nicknameDraft);
    setNicknamingUserId(null);
    setNicknameDraft('');
  };

  const clearNickname = async () => {
    if (!nicknamingUserId) return;
    await onSaveNickname?.(nicknamingUserId, '');
    setNicknamingUserId(null);
    setNicknameDraft('');
  };

  const onNotifyToggle = (v) => {
    setNotifyOn(v);
    if (notifyKey) {
      try {
        localStorage.setItem(notifyKey, v ? '1' : '0');
      } catch {
        /* ignore */
      }
    }
  };

  const onClearHistory = () => {
    if (!selectedGroupId) return;
    if (!window.confirm('Ẩn toàn bộ lịch sử hội thoại chỉ ở phía bạn?')) return;
    dispatchMessengerClearHistory(selectedGroupId);
  };

  return (
    <>
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-slate-200 bg-slate-100/80 min-h-0 h-full overflow-y-auto [scrollbar-width:thin]">
      {/* Header gradient */}
      <div className="relative px-4 pt-8 pb-5 bg-gradient-to-br from-rose-500 via-fuchsia-600 to-indigo-700 text-white text-center">
        <div className="relative mx-auto w-[88px] h-[88px] rounded-full p-[3px] bg-white/95 shadow-lg mb-3">
          <DetailAvatar
            src={avatarSrc || groupDetail?.avatar || selected?.avatar}
            name={title}
            className="w-full h-full"
            textClass="text-3xl"
            rounded="rounded-full"
          />
          {canManageGroup && !isDirect && (
            <button
              type="button"
              disabled={busyAvatar}
              onClick={() => groupAvatarInputRef?.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-violet-600 text-white shadow-lg flex items-center justify-center ring-2 ring-white disabled:opacity-50"
              title="Đổi ảnh nhóm"
            >
              {busyAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          )}
          <input
            ref={groupAvatarInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onChangeGroupAvatar?.(f);
              e.target.value = '';
            }}
          />
        </div>

        {renaming ? (
          <div className="flex items-center gap-1 max-w-full px-1">
            <input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="flex-1 min-w-0 h-9 px-2 rounded-lg text-slate-900 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
            />
            <button type="button" onClick={() => void saveRename()} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30">
              <Check className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : nicknamingUserId && isDirect ? (
          <div className="px-2 space-y-2">
            <input
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              placeholder={isDirect ? 'Nhập biệt danh cá nhân' : 'Nhập biệt danh trong nhóm'}
              maxLength={80}
              className="w-full h-9 px-2 rounded-lg text-slate-900 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveNickname();
                if (e.key === 'Escape') setNicknamingUserId(null);
              }}
            />
            <div className="flex items-center justify-center gap-2">
              <button type="button" onClick={() => void saveNickname()} className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[12px] font-semibold">
                Lưu
              </button>
              {peerUser?.nickname ? (
                <button type="button" onClick={() => void clearNickname()} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[12px]">
                  Xóa biệt danh
                </button>
              ) : null}
              <button type="button" onClick={() => setNicknamingUserId(null)} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 px-2">
            <h2 className="text-lg font-bold truncate">{title}</h2>
            {canManageGroup && !isDirect && (
              <button type="button" onClick={startRename} className="p-1 rounded-md hover:bg-white/15 shrink-0" title="Đổi tên nhóm">
                <Pencil className="h-3.5 w-3.5 opacity-90" />
              </button>
            )}
            {isDirect && selected?.peer_id ? (
              <button
                type="button"
                onClick={() => startNicknameEdit(selected.peer_id, peerUser?.nickname || title)}
                className="p-1 rounded-md hover:bg-white/15 shrink-0"
                title="Đặt biệt danh cá nhân"
              >
                <Pencil className="h-3.5 w-3.5 opacity-90" />
              </button>
            ) : null}
          </div>
        )}

        <p className="text-[12px] text-white/90 mt-1">
          {isDirect ? (
            peerUser?.nickname && peerLegalName ? (
              <span className="block truncate opacity-90">{peerLegalName}</span>
            ) : (
              'Chat trực tiếp'
            )
          ) : (
            `Nhóm chat • ${memberCount} thành viên`
          )}
        </p>
        {isDirect && peerUser?.nickname && peerLegalName ? (
          <p className="text-[11px] text-white/75">Chat trực tiếp</p>
        ) : null}
        <p className="text-[11px] text-white/80 mt-0.5 inline-flex items-center gap-1.5 justify-center">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />
          {onlineLabel}
        </p>

        {!isDirect && memberCount > 0 ? (
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {previewMembers.map((m) => (
              <DetailAvatar
                key={m.user_id}
                src={m.user?.avatar}
                name={messengerDisplayName(m.user)}
                className="w-9 h-9 ring-2 ring-white/80"
                textClass="text-[11px]"
              />
            ))}
            {extraMembers > 0 ? (
              <span className="w-9 h-9 rounded-full bg-white/20 ring-2 ring-white/60 text-[11px] font-bold flex items-center justify-center">
                +{extraMembers}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-1 px-3 py-3 bg-white border-b border-slate-100">
        {!isDirect ? (
          <QuickAction icon={Plus} label="Thêm" onClick={onAddMember} disabled={!canManageGroup} />
        ) : (
          <QuickAction icon={Phone} label="Gọi" onClick={onDirectCall} disabled={!canCall} />
        )}
        {!isDirect ? (
          <QuickAction icon={Phone} label="Gọi nhóm" onClick={() => onGroupCall?.('audio')} disabled={!canCall} />
        ) : (
          <QuickAction icon={Video} label="Video" onClick={onDirectVideo} disabled={!canVideo} />
        )}
        <QuickAction icon={Bell} label="Thông báo" onClick={() => onNotifyToggle(!notifyOn)} />
      </div>

      <div className="mx-3 my-3 space-y-3 pb-3">
      {!isDirect ? (
        <div
          ref={membersSectionRef}
          className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setMembersExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-3 border-b border-slate-100 bg-violet-50/50 hover:bg-violet-50 transition text-left"
          >
            <span className="inline-flex items-center gap-2 text-[13px] font-bold text-violet-900">
              <Users className="h-4 w-4 text-violet-600" />
              Thành viên
              {memberCount > 0 ? (
                <span className="text-[11px] font-semibold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-full">
                  {memberCount}
                </span>
              ) : null}
            </span>
            {membersExpanded ? (
              <ChevronUp className="h-4 w-4 text-violet-500 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-violet-500 shrink-0" />
            )}
          </button>

          {membersExpanded ? (
            <>
              <ul className="p-2 text-xs space-y-0.5">
                {groupMembers.map((m) => {
                  const u = m.user || {};
                  const displayName = messengerDisplayName(u);
                  const isCreator = groupDetail?.created_by && String(groupDetail.created_by) === String(m.user_id);
                  const isLeader = m.role === 'leader' || isCreator;
                  const isDeputy = m.role === 'deputy';
                  const isMe = String(m.user_id) === String(uid);
                  const busy = busyMember === m.user_id;
                  const pres = getUserPresence(presenceByUser, m.user_id);
                  const online = !!pres?.online;
                  const editingNickname = nicknamingUserId === m.user_id;
                  return (
                    <li
                      key={m.user_id}
                      className="flex items-center gap-2.5 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition relative"
                    >
                      <div className="relative shrink-0">
                        <DetailAvatar src={u.avatar} name={displayName} className="w-10 h-10" textClass="text-sm" />
                        <span
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                            online ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                          title={formatPresenceDotTitle(pres)}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        {editingNickname ? (
                          <div className="flex items-center gap-1">
                            <input
                              value={nicknameDraft}
                              onChange={(e) => setNicknameDraft(e.target.value)}
                              maxLength={80}
                              className="flex-1 min-w-0 h-8 px-2 rounded-lg border border-slate-200 text-[12px]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveNickname();
                                if (e.key === 'Escape') setNicknamingUserId(null);
                              }}
                            />
                            <button type="button" onClick={() => void saveNickname()} className="p-1 text-violet-600">
                              <Check className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setNicknamingUserId(null)} className="p-1 text-slate-400">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-[13px] font-semibold text-slate-900 truncate flex items-center gap-1">
                            {!isDirect ? (
                              <GroupSenderName
                                userId={m.user_id}
                                name={displayName}
                                isGroupChat
                                className="text-[13px]"
                              />
                            ) : (
                              displayName
                            )}
                            {isMe && <span className="text-[10px] font-normal text-slate-400">(bạn)</span>}
                            {isLeader && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                            {isDeputy && !isLeader && <Shield className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-500">
                          {(u.group_nickname || u.nickname) && (u.full_name || u.email) ? (
                            <span className="block truncate text-slate-400">{u.full_name || u.email}</span>
                          ) : null}
                          {u.contact_nickname && !isDirect ? (
                            <span className="block truncate text-slate-400">
                              Biệt danh cá nhân: {u.contact_nickname}
                            </span>
                          ) : null}
                          <span>
                            {memberRoleLabel(m, groupDetail)}
                            {online ? (
                              <span className="text-emerald-600"> · Đang hoạt động</span>
                            ) : (
                              <span> · {formatLastActiveAgo(pres?.last_ping_at)}</span>
                            )}
                          </span>
                        </p>
                      </div>
                      {!isMe && !editingNickname ? (
                        <div className="relative shrink-0" ref={memberMenuId === m.user_id ? memberMenuRef : null}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setMemberMenuId((id) => (id === m.user_id ? null : m.user_id))}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                          </button>
                          {memberMenuId === m.user_id ? (
                            <div className="absolute right-0 top-full mt-1 z-20 w-44 py-1 rounded-xl bg-white border border-slate-200 shadow-xl text-[12px]">
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left hover:bg-violet-50"
                                onClick={() => startNicknameEdit(m.user_id, u.group_nickname || u.nickname || displayName)}
                              >
                                Biệt danh trong nhóm
                              </button>
                              {(u.group_nickname || u.nickname) ? (
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-slate-600 hover:bg-slate-50"
                                  onClick={() => {
                                    setMemberMenuId(null);
                                    void onSaveNickname?.(m.user_id, '');
                                  }}
                                >
                                  Xóa biệt danh nhóm
                                </button>
                              ) : null}
                              {canManageGroup && !isCreator ? (
                                <>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left hover:bg-violet-50"
                                    onClick={() => {
                                      onChangeMemberRole?.(m, isDeputy ? 'member' : 'deputy');
                                      setMemberMenuId(null);
                                    }}
                                  >
                                    {isDeputy ? 'Hạ xuống thành viên' : 'Đặt làm phó nhóm'}
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50"
                                    onClick={() => {
                                      setMemberMenuId(null);
                                      onRemoveMember?.(m);
                                    }}
                                  >
                                    Xóa khỏi nhóm
                                  </button>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        !editingNickname ? <MoreVertical className="h-4 w-4 text-slate-200 shrink-0" /> : null
                      )}
                    </li>
                  );
                })}
                {groupMembers.length === 0 && (
                  <li className="text-slate-400 text-center py-8">Chưa có thành viên</li>
                )}
              </ul>

              {canManageGroup ? (
                <div className="shrink-0 p-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onAddMember}
                    className="w-full py-2.5 text-[13px] font-semibold text-violet-700 hover:bg-violet-50 rounded-xl transition inline-flex items-center justify-center gap-1"
                  >
                    <UserPlus className="h-4 w-4" />
                    Thêm thành viên
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <p className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Ảnh, tệp & link
        </p>
        <div className="flex border-b border-slate-100 text-[11px] font-semibold shrink-0 overflow-x-auto [scrollbar-width:none]">
          {tabs.map(({ id, label, count, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSectionChange?.(id)}
              className={`flex-1 min-w-0 px-1 py-2.5 flex flex-col items-center gap-0.5 border-b-2 transition ${
                (rightSection === id || (rightSection === 'members' && id === 'media'))
                  ? 'border-violet-600 text-violet-700 bg-violet-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate w-full text-center leading-tight">
                {label}
                {count > 0 ? ` (${count})` : ''}
              </span>
            </button>
          ))}
        </div>

        <div className="p-2 text-xs">
          {(rightSection === 'media' || rightSection === 'members') && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {mediaGridItems.slice(0, 48).map((att, i) => {
                  const u = resolveMediaUrl(att.url);
                  const isVideo = att.type?.startsWith('video/');
                  if (isVideo) {
                    return (
                      <button
                        key={`${att.url}-${i}`}
                        type="button"
                        onClick={() => setVideoPreview({ ...att, url: u })}
                        className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200 relative"
                      >
                        <video src={u} className="w-full h-full object-cover pointer-events-none" muted playsInline />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white text-lg">▶</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={`${att.url}-${i}`}
                      type="button"
                      onClick={() => {
                        const idx = findUploadLightboxIndex(imageGallery, att.url);
                        if (idx >= 0) setMediaLightboxIndex(idx);
                      }}
                      className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hover:ring-2 hover:ring-violet-300 transition"
                    >
                      <img
                        src={u}
                        alt={displayMessengerFilename(att)}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = BROKEN_MEDIA_PLACEHOLDER;
                        }}
                      />
                    </button>
                  );
                })}
              </div>
              {mediaCount === 0 && <p className="text-slate-400 text-center py-8">Chưa có ảnh/video</p>}
            </div>
          )}

          {rightSection === 'files' && (
            <ul className="space-y-1">
              {(mediaBundle?.files || []).map((f, i) => (
                <DetailPanelFileRow key={`${f.url}-${i}`} file={f} />
              ))}
              {fileCount === 0 && <p className="text-slate-400 text-center py-8">Chưa có tệp</p>}
            </ul>
          )}

          {rightSection === 'links' && (
            <ul className="space-y-1">
              {(mediaBundle?.links || []).map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 p-2.5 rounded-xl hover:bg-slate-50 text-violet-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span className="break-all">{l.label}</span>
                  </a>
                </li>
              ))}
              {linkCount === 0 && <p className="text-slate-400 text-center py-8">Chưa có link</p>}
            </ul>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[13px] font-bold text-slate-900 mb-3">Cài đặt hội thoại</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[13px] text-slate-700">
              <Bell className="h-4 w-4 text-violet-500" />
              Thông báo
            </span>
            <ToggleSwitch checked={notifyOn} onChange={onNotifyToggle} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[13px] text-slate-700">
              <Pin className="h-4 w-4 text-violet-500" />
              Ghim hội thoại
            </span>
            <ToggleSwitch checked={pinned} onChange={(v) => onTogglePin?.(v)} />
          </div>
          <button
            type="button"
            onClick={onClearHistory}
            className="w-full flex items-center gap-2 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 rounded-xl px-1 transition"
          >
            <Trash2 className="h-4 w-4" />
            Xóa lịch sử hội thoại
          </button>
          {!isDirect ? (
            <button
              type="button"
              onClick={onLeaveGroup}
              className="w-full flex items-center gap-2 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 rounded-xl px-1 transition"
            >
              <LogOut className="h-4 w-4" />
              Rời khỏi nhóm
            </button>
          ) : null}
        </div>
      </div>
      </div>
    </aside>

    {mediaLightboxIndex != null && imageGallery.length > 0 ? (
      <UploadFileLightbox
        items={imageGallery}
        index={mediaLightboxIndex}
        onIndexChange={setMediaLightboxIndex}
        onClose={() => setMediaLightboxIndex(null)}
      />
    ) : null}

    {videoPreview ? (
      <div className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4">
        <button
          type="button"
          onClick={() => setVideoPreview(null)}
          className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"
        >
          <X className="h-6 w-6" />
        </button>
        <video
          src={videoPreview.url}
          controls
          autoPlay
          className="max-h-[85vh] max-w-full rounded-lg"
        />
      </div>
    ) : null}
    </>
  );
}
