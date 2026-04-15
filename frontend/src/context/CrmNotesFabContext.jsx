import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import CrmChatNotesPanel from '../components/CrmChatNotesPanel';

const CrmNotesFabContext = createContext(null);

/**
 * Ngữ cảnh ghi chú nổi: trang chi tiết lead/deal (hoặc dự án xưởng có CRM) đẩy anchor;
 * FAB luôn nằm trong layout để hiện mọi màn hình.
 */
export function CrmNotesFabProvider({ children }) {
  const [anchor, setAnchorState] = useState(null);

  const setCrmNotesAnchor = useCallback((next) => {
    setAnchorState(next);
  }, []);

  const value = useMemo(() => ({ anchor, setCrmNotesAnchor }), [anchor, setCrmNotesAnchor]);

  return <CrmNotesFabContext.Provider value={value}>{children}</CrmNotesFabContext.Provider>;
}

export function useCrmNotesFab() {
  const ctx = useContext(CrmNotesFabContext);
  if (!ctx) {
    throw new Error('useCrmNotesFab must be used within CrmNotesFabProvider');
  }
  return ctx;
}

export function GlobalCrmChatNotesFab() {
  const { user } = useAuth();
  const { anchor } = useCrmNotesFab();

  if (!user) return null;

  return (
    <CrmChatNotesPanel
      variant="floating"
      leadId={anchor?.leadId ?? null}
      notes={anchor?.notes ?? []}
      onPosted={anchor?.onPosted}
      currentUserId={user?.id || user?.userId}
      canEditAnyNote={user?.role === 'admin' || user?.role === 'manager'}
      contextLine={anchor?.contextLine ?? ''}
      contextBadge={anchor?.contextBadge ?? ''}
    />
  );
}
