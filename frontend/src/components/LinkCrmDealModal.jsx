import { useEffect, useState } from 'react';
import { Link2, Loader2, X } from 'lucide-react';
import api from '../lib/api';
import LeadDealPicker from './LeadDealPicker';

const DOC_PATH = {
  quotation: (id) => `/crm/quotations/${id}`,
  order: (id) => `/crm/orders/${id}`,
  invoice: (id) => `/crm/invoices/${id}`,
};

/**
 * Gắn báo giá / đơn hàng / hóa đơn vào deal CRM (kể cả chứng từ import Excel mồ côi).
 */
export default function LinkCrmDealModal({
  open,
  onClose,
  docType = 'quotation',
  docId,
  docCode,
  customerId,
  onLinked,
}) {
  const [deal, setDeal] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDeal(null);
  }, [open, docId]);

  if (!open || !docId) return null;

  const label = docType === 'order' ? 'đơn hàng' : docType === 'invoice' ? 'hóa đơn' : 'báo giá';

  const save = async () => {
    if (!deal?.id || saving) return;
    setSaving(true);
    try {
      const { data } = await api.put(DOC_PATH[docType](docId), { lead_id: deal.id });
      onLinked?.(data, deal);
      onClose?.();
    } catch (e) {
      alert(e.response?.data?.error || `Không gắn được ${label} với deal`);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-emerald-600" /> Gắn deal CRM
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {label} {docCode ? <strong className="font-mono text-gray-700">{docCode}</strong> : ''} — chọn deal để theo dõi công nợ / SX.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <LeadDealPicker
            value={deal}
            onChange={setDeal}
            type="deal"
            customerId={customerId || null}
            placeholder="Tìm deal theo mã / tên / SĐT / mã dự án..."
            emptyLabel="Chọn deal CRM để gắn"
            warnOrphan={false}
          />
          <p className="text-[11px] text-gray-500">
            Kế toán có thể gắn deal công ty mình hoặc deal xưởng đã chuyển (Metalla / HCB…) thuộc phạm vi công ty.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-gray-50 rounded-b-xl">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg border text-sm cursor-pointer hover:bg-white">
            Hủy
          </button>
          <button
            type="button"
            disabled={!deal?.id || saving}
            onClick={save}
            className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Gắn deal
          </button>
        </div>
      </div>
    </div>
  );
}
