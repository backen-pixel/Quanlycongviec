import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';

function pad(n) { return String(n).padStart(2, '0'); }

function toLocalInputValue(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CrmVcBookingModal({
  open,
  deal,
  targetStageId,
  initialValues = null,
  onClose,
  onSuccess,
}) {
  const [companies, setCompanies] = useState([]);
  const [deliveryTeams, setDeliveryTeams] = useState([]);
  const [installationTeams, setInstallationTeams] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [deliveryTeamId, setDeliveryTeamId] = useState('');
  const [installationTeamId, setInstallationTeamId] = useState('');
  const [pickupAt, setPickupAt] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const minPickup = useMemo(() => toLocalInputValue(new Date()), [open]);
  const defaultPickup = useMemo(() => {
    const d = new Date(Date.now() + 2 * 3600 * 1000);
    d.setMinutes(0, 0, 0);
    return toLocalInputValue(d);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setSaving(false);
    setCompanyId(initialValues?.logistics_company_id ? String(initialValues.logistics_company_id) : '');
    setDeliveryTeamId(initialValues?.delivery_team_id ? String(initialValues.delivery_team_id) : '');
    setInstallationTeamId(initialValues?.installation_team_id ? String(initialValues.installation_team_id) : '');
    setNotes(initialValues?.pickup_notes || '');
    if (initialValues?.pickup_at) {
      const d = new Date(initialValues.pickup_at);
      if (!Number.isNaN(d.getTime())) setPickupAt(toLocalInputValue(d));
      else setPickupAt(defaultPickup);
    } else {
      setPickupAt(defaultPickup);
    }
  }, [open, initialValues, defaultPickup]);

  useEffect(() => {
    if (!open) return;
    api.get('/companies', { params: { for_module: 'logistics' } })
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        const arr = Array.isArray(list) ? list : [];
        setCompanies(arr);
        if (!companyId && arr.length === 1) setCompanyId(String(arr[0].id));
      })
      .catch(() => setCompanies([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !companyId) {
      setDeliveryTeams([]); setInstallationTeams([]);
      return;
    }
    const params = { company_id: companyId };
    Promise.all([
      api.get('/workshop-teams', { params: { ...params, type: 'delivery' } }).catch(() => ({ data: [] })),
      api.get('/workshop-teams', { params: { ...params, type: 'installation' } }).catch(() => ({ data: [] })),
    ]).then(([d, i]) => {
      const dArr = Array.isArray(d.data) ? d.data : [];
      const iArr = Array.isArray(i.data) ? i.data : [];
      setDeliveryTeams(dArr);
      setInstallationTeams(iArr);
      if (!deliveryTeamId && dArr.length === 1) setDeliveryTeamId(String(dArr[0].id));
      if (!installationTeamId && iArr.length === 1) setInstallationTeamId(String(iArr[0].id));
    });
  }, [open, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const submit = async () => {
    setErr('');
    if (!companyId) return setErr('Vui lòng chọn công ty lắp đặt.');
    if (!deliveryTeamId) return setErr('Vui lòng chọn đội vận chuyển.');
    if (!installationTeamId) return setErr('Vui lòng chọn đội lắp đặt.');
    if (!pickupAt) return setErr('Vui lòng chọn thời gian đi lấy hàng.');
    const pickup = new Date(pickupAt);
    if (Number.isNaN(pickup.getTime())) return setErr('Thời gian đi lấy không hợp lệ.');

    setSaving(true);
    try {
      const { data } = await api.patch(`/crm/leads/${deal.id}/vc-booking`, {
        logistics_company_id: companyId,
        delivery_team_id: deliveryTeamId,
        installation_team_id: installationTeamId,
        pickup_at: pickup.toISOString(),
        pickup_notes: notes.trim() || null,
        target_stage_id: targetStageId || null,
      });
      if (typeof onSuccess === 'function') onSuccess(data);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Không đặt được vận chuyển.');
      setSaving(false);
    }
  };

  const dealLabel = deal?.code || deal?.title || 'Deal';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onClick={saving ? undefined : onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[95%] max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">🚚 Đặt vận chuyển & lắp đặt</h3>
            <p className="text-xs text-gray-500 mt-0.5">{dealLabel} — hàng đã đóng gói xong ở xưởng.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none disabled:opacity-50"
          >×</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              Công ty lắp đặt <span className="text-red-500">*</span>
            </label>
            <select
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setDeliveryTeamId(''); setInstallationTeamId(''); }}
              className="w-full h-9 px-2 border rounded-lg text-sm bg-white"
              disabled={saving}
            >
              <option value="">— Chọn công ty —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                Đội vận chuyển <span className="text-red-500">*</span>
              </label>
              <select
                value={deliveryTeamId}
                onChange={(e) => setDeliveryTeamId(e.target.value)}
                className="w-full h-9 px-2 border rounded-lg text-sm bg-white"
                disabled={saving || !companyId}
              >
                <option value="">— Chọn đội —</option>
                {deliveryTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {companyId && deliveryTeams.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">Công ty chưa có đội vận chuyển — cần tạo tại trang Đội xưởng.</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                Đội lắp đặt <span className="text-red-500">*</span>
              </label>
              <select
                value={installationTeamId}
                onChange={(e) => setInstallationTeamId(e.target.value)}
                className="w-full h-9 px-2 border rounded-lg text-sm bg-white"
                disabled={saving || !companyId}
              >
                <option value="">— Chọn đội —</option>
                {installationTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {companyId && installationTeams.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">Công ty chưa có đội lắp đặt.</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">
              Thời gian đi lấy hàng <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={pickupAt}
              min={minPickup}
              onChange={(e) => setPickupAt(e.target.value)}
              className="w-full h-9 px-2 border rounded-lg text-sm bg-white"
              disabled={saving}
            />
            <p className="text-[10px] text-gray-500 mt-1">Thời điểm đội vận chuyển tới xưởng lấy hàng.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Ghi chú (tùy chọn)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white resize-none"
              placeholder="Địa chỉ giao, số điện thoại tài xế, lưu ý hàng dễ vỡ…"
              disabled={saving}
            />
          </div>

          {err && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 px-4 rounded-lg text-sm border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-9 px-4 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Đang lưu…' : 'Đặt vận chuyển'}
          </button>
        </div>
      </div>
    </div>
  );
}
