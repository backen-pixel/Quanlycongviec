import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';

const DEFAULTS = {
  voiceCaptureEnabled: true,
  autoLinkVoiceByPhone: true,
  backgroundRealtimeEnabled: true,
  autoToolsEnabled: false,
  facebookAutoTool: false,
  contactsAutoTool: false,
};

/** Đồng bộ với app CRM Android: GET/PUT /api/users/crm-app-prefs */
export default function CrmAppChannelPrefsBanner() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users/crm-app-prefs');
      setPrefs({ ...DEFAULTS, ...(data && typeof data === 'object' ? data : {}) });
    } catch {
      setPrefs({ ...DEFAULTS });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next) => {
    setSaving(true);
    try {
      const { data } = await api.put('/users/crm-app-prefs', next);
      setPrefs({ ...DEFAULTS, ...(data && typeof data === 'object' ? data : next) });
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs) {
    return (
      <div className="px-6 py-2 text-xs text-gray-400 border-b bg-amber-50/40">
        Đang tải cài đặt kênh (đồng bộ mobile)…
      </div>
    );
  }

  const masterOff = !prefs.autoToolsEnabled;

  return (
    <div className="px-6 py-2 border-b bg-amber-50/50 flex flex-wrap items-center gap-3 text-xs">
      <span className="font-semibold text-amber-900 shrink-0">Công cụ tự động (đồng bộ app)</span>
      {saving ? <span className="text-amber-700">Đang lưu…</span> : null}
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={!!prefs.autoToolsEnabled}
          onChange={(e) =>
            void save({
              ...prefs,
              autoToolsEnabled: e.target.checked,
              ...(e.target.checked ? {} : { facebookAutoTool: false, contactsAutoTool: false }),
            })
          }
        />
        <span>Tổng</span>
      </label>
      <label className={`flex items-center gap-1.5 ${masterOff ? 'opacity-40' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          disabled={masterOff}
          checked={!!prefs.facebookAutoTool && !!prefs.autoToolsEnabled}
          onChange={(e) =>
            void save({
              ...prefs,
              facebookAutoTool: e.target.checked,
              ...(e.target.checked ? { autoToolsEnabled: true } : {}),
            })
          }
        />
        <span>Facebook</span>
      </label>
      <label className={`flex items-center gap-1.5 ${masterOff ? 'opacity-40' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          disabled={masterOff}
          checked={!!prefs.contactsAutoTool && !!prefs.autoToolsEnabled}
          onChange={(e) =>
            void save({
              ...prefs,
              contactsAutoTool: e.target.checked,
              ...(e.target.checked ? { autoToolsEnabled: true } : {}),
            })
          }
        />
        <span>Danh bạ</span>
      </label>
    </div>
  );
}
