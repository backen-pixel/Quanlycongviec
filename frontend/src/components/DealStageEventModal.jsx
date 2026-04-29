import { useState, useEffect } from 'react';
import { X, Calendar } from 'lucide-react';
import {
  datetimeLocalValueToIso,
  defaultDealEventStartLocalValue,
  isoToDatetimeLocalValue,
} from '../lib/datetimeLocal';

/**
 * Khi chuyển deal: chỉnh giờ bắt đầu/kết thúc; tiêu đề / deal / KH lấy từ deal (read-only).
 */
export default function DealStageEventModal({
  open,
  onClose,
  deal,
  targetStageName,
  initialStartLocal,
  initialEndLocal,
  onConfirm,
  onMoveWithoutEvent,
  submitting,
}) {
  const [startLocal, setStartLocal] = useState('');
  const [endLocal, setEndLocal] = useState('');

  useEffect(() => {
    if (!open) return;
    setStartLocal(
      initialStartLocal || defaultDealEventStartLocalValue(),
    );
    setEndLocal(initialEndLocal ? isoToDatetimeLocalValue(initialEndLocal) : '');
  }, [open, initialStartLocal, initialEndLocal]);

  if (!open || !deal) return null;

  const titlePreview = formatDealAutoEventTitle(deal);
  const descPreview = deal.description || '';
  const locPreview =
    deal.customer?.address ||
    deal.install_address ||
    customerAddressFallback(deal) ||
    '—';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b sticky top-0 bg-white">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Tạo sự kiện khi chuyển deal
          </h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <p className="text-xs text-gray-600">
            Chỉ cần chọn <strong>thời gian</strong>. Các trường khác lấy từ deal (giống form tạo sự kiện).
          </p>

          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2 text-xs">
            {targetStageName && (
              <div>
                <span className="text-gray-500">Giai đoạn đích</span>
                <p className="font-medium text-gray-800 mt-0.5">{targetStageName}</p>
              </div>
            )}
            <div>
              <span className="text-gray-500">Tiêu đề sự kiện</span>
              <p className="font-medium text-gray-900 mt-0.5">{titlePreview}</p>
            </div>
            {descPreview && (
              <div>
                <span className="text-gray-500">Mô tả</span>
                <p className="text-gray-800 mt-0.5 whitespace-pre-wrap max-h-24 overflow-y-auto">{descPreview}</p>
              </div>
            )}
            <div>
              <span className="text-gray-500">Địa điểm (KH / lắp đặt)</span>
              <p className="text-gray-800 mt-0.5">{locPreview}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bắt đầu *</label>
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kết thúc</label>
              <input
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Hủy chuyển giai đoạn
            </button>
            <div className="flex flex-wrap gap-2 justify-end">
              {typeof onMoveWithoutEvent === 'function' && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onMoveWithoutEvent()}
                  className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? 'Đang xử lý…' : 'Chuyển giai đoạn (không tạo sự kiện)'}
                </button>
              )}
              <button
                type="button"
                disabled={submitting || !startLocal}
                onClick={() => {
                  const startIso = datetimeLocalValueToIso(startLocal);
                  const endIso = endLocal ? datetimeLocalValueToIso(endLocal) : null;
                  if (!startIso) return;
                  if (endIso && new Date(endIso) < new Date(startIso)) {
                    alert('Giờ kết thúc phải sau giờ bắt đầu');
                    return;
                  }
                  onConfirm({ startIso, endIso, titlePreview, locPreview });
                }}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Đang xử lý…' : 'Chuyển giai đoạn & tạo sự kiện'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function customerAddressFallback(deal) {
  const c = deal.customer;
  if (!c || typeof c !== 'object') return '';
  return c.address || c.install_address || '';
}

/** Tiêu đề sự kiện tự động: «tên deal - tên khách hàng». */
function customerNameForTitle(deal) {
  const c = deal.customer;
  if (c && typeof c === 'object') {
    const n = (c.full_name || c.name || '').trim();
    if (n) return n;
  }
  const flat = (deal.customer_name || '').trim();
  return flat;
}

function formatDealAutoEventTitle(deal) {
  const dealTitle = (deal.title || '').trim() || (deal.code ? String(deal.code).trim() : '') || 'Deal';
  const cust = customerNameForTitle(deal);
  return cust ? `${dealTitle} - ${cust}` : dealTitle;
}
