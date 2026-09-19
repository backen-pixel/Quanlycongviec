import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../lib/api';

/** Modal cập nhật họ tên và số điện thoại của chính mình. */
export default function EditMyNameModal({
  open,
  initialName = '',
  initialPhone = '',
  onClose,
  onSaved,
}) {
  const [val, setVal] = useState(initialName || '');
  const [phone, setPhone] = useState(initialPhone || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (open) {
      setVal(initialName || '');
      setPhone(initialPhone || '');
      setErr(null);
    }
  }, [open, initialName, initialPhone]);

  if (!open) return null;

  const save = async () => {
    const name = val.trim();
    if (!name) {
      setErr('Vui lòng nhập họ tên');
      return;
    }
    if (name.length > 120) {
      setErr('Họ tên tối đa 120 ký tự');
      return;
    }
    const compactPhone = String(phone || '').trim().replace(/[\s.\-()]/g, '');
    if (compactPhone && !/^\+?[0-9]{8,15}$/.test(compactPhone)) {
      setErr('Số điện thoại không hợp lệ (8–15 chữ số)');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const { data } = await api.patch('/internal-social/profile/me', {
        full_name: name,
        phone: compactPhone || null,
      });
      onSaved?.(data?.profile || { full_name: name, phone: compactPhone || null });
      onClose?.();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Không lưu được thông tin');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="px-4 pt-4 pb-2 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Cập nhật thông tin cá nhân</h3>
          <p className="text-xs text-gray-500 mt-0.5">Họ tên và số điện thoại hiển thị trên hệ thống, chat và trang cá nhân.</p>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Họ và tên</span>
            <input
              type="text"
              maxLength={120}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="Họ và tên"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape') onClose?.();
              }}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Số điện thoại</span>
            <input
              type="tel"
              inputMode="tel"
              maxLength={20}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="0901234567"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape') onClose?.();
              }}
            />
          </label>
          {err ? <p className="text-xs text-rose-600">{err}</p> : null}
        </div>
        <div className="px-4 pb-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
