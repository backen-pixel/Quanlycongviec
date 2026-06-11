import { createContext, useContext, useEffect, useMemo } from 'react';
import { useAuth } from '../../lib/auth';
import { useReleaseNotesUnread } from '../../hooks/useReleaseNotesUnread';
import { useCrmAssignmentsUnread } from '../../hooks/useCrmAssignmentsUnread';
import { useInternalSocialUnread } from '../../hooks/useInternalSocialUnread';
import { BADGE_CHANNELS, dispatchBadgeRefresh } from '../lib/badgeEvents';

const UnreadBadgesContext = createContext(null);

export function UnreadBadgesProvider({ children }) {
  const { socket } = useAuth();
  const release = useReleaseNotesUnread();
  const assignmentsCrm = useCrmAssignmentsUnread('crm');
  const assignmentsSx = useCrmAssignmentsUnread('production');
  const social = useInternalSocialUnread();

  useEffect(() => {
    const handlers = {
      social: () => { void social.refresh?.(); },
      assignments: () => { void assignmentsCrm.refresh?.(); void assignmentsSx.refresh?.(); },
      updates: () => { void release.refresh?.(); },
      events: () => { void release.refresh?.(); },
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
  }, [social, assignmentsCrm, assignmentsSx, release]);

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

  const value = useMemo(
    () => ({
      updates: release.total,
      updatesDetail: release,
      assignments: assignmentsCrm.unread,
      assignmentsDetail: assignmentsCrm,
      sxAssignments: assignmentsSx.unread,
      sxAssignmentsDetail: assignmentsSx,
      social: social.unread,
      socialDetail: social,
      refreshAll: async () => {
        await Promise.all([
          release.refresh?.(),
          assignmentsCrm.refresh?.(),
          assignmentsSx.refresh?.(),
          social.refresh?.(),
        ]);
      },
      refreshSocial: social.refresh,
      refreshAssignments: assignmentsCrm.refresh,
      refreshSxAssignments: assignmentsSx.refresh,
      refreshUpdates: release.refresh,
    }),
    [release, assignmentsCrm, assignmentsSx, social],
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
    socialUnread: b.social,
  };
}
