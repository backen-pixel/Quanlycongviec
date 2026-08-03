import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';import { useAuth } from '../../lib/auth';
import { useAppHeartbeat, EMPTY_ASSIGN } from '../../hooks/useAppHeartbeat';
import { builtinUpdateUnreadCount } from '../../lib/releaseNotesRead';
import { BADGE_CHANNELS, dispatchBadgeRefresh } from '../lib/badgeEvents';

const UnreadBadgesContext = createContext(null);

export function UnreadBadgesProvider({ children }) {
  const { user, socket } = useAuth();
  const [assignmentsCrm, setAssignmentsCrm] = useState(EMPTY_ASSIGN);
  const [assignmentsSx, setAssignmentsSx] = useState(EMPTY_ASSIGN);
  const [assignmentsVc, setAssignmentsVc] = useState(EMPTY_ASSIGN);
  const [socialUnread, setSocialUnread] = useState(0);
  const [dbUnread, setDbUnread] = useState(0);
  const [unifiedTasksOpen, setUnifiedTasksOpen] = useState(0);
  const [builtinUnread, setBuiltinUnread] = useState(() => builtinUpdateUnreadCount());

  const resetBadgeState = useCallback(() => {
    setAssignmentsCrm(EMPTY_ASSIGN);
    setAssignmentsSx(EMPTY_ASSIGN);
    setAssignmentsVc(EMPTY_ASSIGN);
    setSocialUnread(0);
    setDbUnread(0);
    setUnifiedTasksOpen(0);
    setBuiltinUnread(0);
  }, []);

  useEffect(() => {
    if (!user) resetBadgeState();
    else setBuiltinUnread(builtinUpdateUnreadCount(user));
  }, [user, resetBadgeState]);

  useEffect(() => {
    const onSessionCleared = () => resetBadgeState();
    window.addEventListener('auth:session-cleared', onSessionCleared);
    return () => window.removeEventListener('auth:session-cleared', onSessionCleared);
  }, [resetBadgeState]);

  const onHeartbeat = useCallback((payload) => {
    if (!payload) return;
    setAssignmentsCrm(payload.assignmentsCrm || EMPTY_ASSIGN);
    setAssignmentsSx(payload.assignmentsProduction || EMPTY_ASSIGN);
    setAssignmentsVc(payload.assignmentsLogistics || EMPTY_ASSIGN);
    setSocialUnread(Number(payload.social) || 0);
    setDbUnread(Number(payload.releaseNotesDb) || 0);
    setUnifiedTasksOpen(Number(payload.unifiedTasks?.open) || 0);
  }, []);

  const { refresh: refreshHeartbeat } = useAppHeartbeat({
    enabled: !!user,
    user,
    onUpdate: onHeartbeat,
  });

  useEffect(() => {
    setBuiltinUnread(builtinUpdateUnreadCount(user));
    const onStorage = (e) => {
      if (e.key === 'release_notes_read_builtin_ids') {
        setBuiltinUnread(builtinUpdateUnreadCount(user));
      }
    };
    window.addEventListener('storage', onStorage);
    const t = setInterval(() => setBuiltinUnread(builtinUpdateUnreadCount(user)), 5000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(t);
    };
  }, [user]);

  const refreshReleaseNotes = useCallback(async () => {
    setBuiltinUnread(builtinUpdateUnreadCount(user));
    await refreshHeartbeat({ fresh: true });
  }, [refreshHeartbeat, user]);

  useEffect(() => {
    const handlers = {
      social: () => { void refreshHeartbeat({ fresh: true }); },
      assignments: () => { void refreshHeartbeat({ fresh: true }); },
      updates: () => { void refreshReleaseNotes(); },
      events: () => { void refreshReleaseNotes(); },
    };

    const onWindow = (e) => {
      const ch = String(e?.type || '').replace(/^badge:refresh:/, '');
      if (handlers[ch]) handlers[ch]();
    };

    for (const ch of BADGE_CHANNELS) {
      window.addEventListener(`badge:refresh:${ch}`, onWindow);
    }

    return () => {
      for (const ch of BADGE_CHANNELS) {
        window.removeEventListener(`badge:refresh:${ch}`, onWindow);
      }
    };
  }, [refreshHeartbeat, refreshReleaseNotes]);

  useEffect(() => {
    if (!socket) return undefined;
    const onBadge = (payload) => {
      const ch = String(payload?.channel || '').toLowerCase();
      dispatchBadgeRefresh(ch);
    };
    socket.on('notify:badge', onBadge);
    return () => {
      socket.off('notify:badge', onBadge);
    };
  }, [socket]);

  const release = useMemo(() => ({
    dbUnread,
    builtinUnread,
    total: dbUnread + builtinUnread,
    refresh: refreshReleaseNotes,
  }), [dbUnread, builtinUnread, refreshReleaseNotes]);

  const value = useMemo(
    () => ({
      updates: release.total,
      updatesDetail: release,
      assignments: assignmentsCrm.unread,
      assignmentsDetail: assignmentsCrm,
      sxAssignments: assignmentsSx.unread,
      sxAssignmentsDetail: assignmentsSx,
      vcAssignments: assignmentsVc.unread,
      vcAssignmentsDetail: assignmentsVc,
      social: socialUnread,
      socialDetail: { unread: socialUnread, refresh: () => refreshHeartbeat({ fresh: true }) },
      unifiedTasksOpen,
      refreshAll: async () => {
        setBuiltinUnread(builtinUpdateUnreadCount(user));
        await refreshHeartbeat({ fresh: true });
      },
      refreshSocial: () => refreshHeartbeat({ fresh: true }),
      refreshAssignments: () => refreshHeartbeat({ fresh: true }),
      refreshSxAssignments: () => refreshHeartbeat({ fresh: true }),
      refreshVcAssignments: () => refreshHeartbeat({ fresh: true }),
      refreshUpdates: refreshReleaseNotes,
    }),
    [release, assignmentsCrm, assignmentsSx, assignmentsVc, socialUnread, unifiedTasksOpen, refreshHeartbeat, refreshReleaseNotes, user],
  );

  return (
    <UnreadBadgesContext.Provider value={value}>
      {children}
    </UnreadBadgesContext.Provider>
  );
}

export function useUnreadBadges() {
  const ctx = useContext(UnreadBadgesContext);
  if (!ctx) {
    return {
      updates: 0,
      assignments: 0,
      social: 0,
      refreshAll: async () => {},
      updatesDetail: { total: 0 },
      assignmentsDetail: { unread: 0 },
      socialDetail: { unread: 0 },
    };
  }
  return ctx;
}

/** Tương thích Sidebar: tên field cũ */
export function useSidebarUnreadBadges() {
  const b = useUnreadBadges();
  return {
    updatesUnread: b.updates,
    assignmentsUnread: b.assignments,
    sxAssignmentsUnread: b.sxAssignments ?? 0,
    vcAssignmentsUnread: b.vcAssignments ?? 0,
    socialUnread: b.social,
    unifiedTasksOpen: b.unifiedTasksOpen ?? 0,
  };
}
