import { useMemo } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import EventsFeedPage from './EventsFeedPage';

/**
 * Sự kiện riêng của module tùy chỉnh — cùng UX CRM/SX/VC,
 * khóa filter module = app_modules.module_key.
 */
export default function CustomModuleEventsPage() {
  const { moduleKey: paramKey } = useParams();
  const ctx = useOutletContext() || {};
  const moduleKey = String(ctx.moduleKey || paramKey || '').trim().toLowerCase();
  const modName = ctx.mod?.name || moduleKey || 'Module';

  const locked = useMemo(() => moduleKey, [moduleKey]);

  if (!locked) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Không xác định được module.
      </div>
    );
  }

  return (
    <EventsFeedPage
      lockedModule={locked}
      lockedModuleLabel={modName}
    />
  );
}
