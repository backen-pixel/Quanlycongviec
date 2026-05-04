import React, { useMemo, Fragment } from 'react';
import { formatVND } from '../lib/utils';

function formatNum(n) {
  if (n === '' || n === null || n === undefined || Number.isNaN(n)) return '';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (Number.isNaN(num)) return '';
  if (num === 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(num);
}

function deriveRow(item) {
  if (item.row_type === 'section' || item.notes === '__SECTION__') {
    return { isSection: true, sectionTitle: item.name || item.title || 'Phần' };
  }
  const factor = parseFloat(item.spec_factor) || 0;
  const qty = item.quantity || 0;
  const price = item.unit_price || 0;
  const lengthVal = parseFloat(item.length) || 0;
  const widthVal = parseFloat(item.width) || 0;
  const heightVal = parseFloat(item.height) || 0;
  const standardArea = parseFloat(item.standard_area) || 0;
  const actualArea = lengthVal > 0 && heightVal > 0 ? lengthVal * heightVal : 0;
  let areaRatio = 0;
  let grossAmount = 0;
  if (standardArea > 0 && actualArea > 0) {
    areaRatio = actualArea / standardArea;
    grossAmount = areaRatio * qty * price;
  } else if (factor > 0) {
    grossAmount = factor * qty * price;
  } else {
    grossAmount = qty * price;
  }
  const discountAmount = item.discount_amount != null
    ? Number(item.discount_amount)
    : grossAmount * (item.discount_percent || 0) / 100;
  const amount = item.amount != null ? Number(item.amount) : (grossAmount - discountAmount);
  const vatRate = item.vat_rate || 0;
  const vatAmount = item.vat_amount != null
    ? Number(item.vat_amount)
    : amount * vatRate / 100;
  const lineTotal = item.total != null ? Number(item.total) : amount + vatAmount;

  return {
    isSection: false,
    grossAmount,
    amount,
    discountAmount,
    vatAmount,
    lineTotal,
    actualArea,
    areaRatio,
    standardArea,
    lengthVal,
    widthVal,
    heightVal,
    factor,
  };
}

const ACCENT = {
  emerald: 'text-emerald-600',
  purple: 'text-purple-600',
  blue: 'text-blue-600',
};

/**
 * Bảng chi tiết + tổng (cùng cột / logic hiển thị như QuotationForm).
 */
export default function CrmLineItemsReadonly({ items = [], document: doc, accent = 'emerald', extraTotalsFooter = null }) {
  const totalClass = ACCENT[accent] || ACCENT.emerald;

  const { bodyRows, groupOrder, groupDetails, calcs } = useMemo(() => {
    const raw = items || [];
    const derived = raw.map((item) => ({ item, d: deriveRow(item) }));
    const groupDetails = {};
    const groupOrder = [];
    derived.forEach(({ item, d }) => {
      if (d.isSection) return;
      const g = item.group_name || '';
      if (!g) return;
      if (!groupDetails[g]) {
        groupDetails[g] = { afterDiscount: 0, vatTotal: 0 };
        groupOrder.push(g);
      }
      groupDetails[g].afterDiscount += d.amount || 0;
      groupDetails[g].vatTotal += d.vatAmount || 0;
    });
    const calced = derived.filter((x) => !x.d.isSection).map((x) => x.d);
    const subtotal = calced.reduce((s, d) => s + (d.amount || 0), 0);
    const totalVat = calced.reduce((s, d) => s + (d.vatAmount || 0), 0);
    return { bodyRows: derived, groupOrder, groupDetails, calcs: { subtotal, totalVat } };
  }, [items]);

  const discountLabel = doc?.discount_type === 'percent'
    ? `Chiết khấu (${doc.discount_value ?? 0}%)`
    : 'Chiết khấu';

  let itemNo = 0;

  return (
    <div className="bg-white rounded-xl border p-3">
      <h2 className="text-sm font-bold text-gray-900 mb-4">Chi tiết hàng hóa / dịch vụ</h2>
      <div className="overflow-x-auto overflow-y-auto border rounded-lg" style={{ maxHeight: 'min(65vh, 720px)' }}>
        <table className="min-w-[2200px] w-full text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
              <th className="py-2.5 px-1.5 text-left w-9">STT</th>
              <th className="py-2.5 px-1.5 text-left w-[100px]">Mã HH</th>
              <th className="py-2.5 px-1.5 text-left min-w-[180px]">Tên hàng hóa</th>
              <th className="py-2.5 px-1.5 text-left w-[140px]">Diễn giải</th>
              <th className="py-2.5 px-1.5 text-center w-[50px]">ĐVT</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[65px]" title="Ngang (mm)">Ngang</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[60px]" title="Sâu (mm)">Sâu</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[60px]" title="Cao (mm)">Cao</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[85px]" title="mm²">DT Chuẩn</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[85px]" title="Ngang × Cao">DT Thực</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[60px]">HS QC</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[50px]">SL</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[120px]">Đơn giá</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[120px]">Thành tiền</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[50px]">CK%</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[100px]">Tiền CK</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[50px]">%VAT</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[100px]">Tiền thuế</th>
              <th className="py-2.5 px-1.5 text-right whitespace-nowrap w-[130px]">Tổng tiền</th>
              <th className="py-2.5 px-1.5 text-left w-[80px]">CTKM</th>
              <th className="py-2.5 px-1.5 text-center w-9">KM</th>
            </tr>
          </thead>
          <tbody>
            {bodyRows.length === 0 && (
              <tr>
                <td colSpan={21} className="py-10 px-4 text-center text-sm text-gray-500 bg-gray-50/80">
                  Chưa có dòng hàng hóa trên chứng từ này.
                  {doc?.quotation_id ? ' Kiểm tra lại liên kết báo giá hoặc đồng bộ dòng từ báo giá.' : ''}
                </td>
              </tr>
            )}
            {bodyRows.map(({ item, d }, idx) => {
              if (d.isSection) {
                return (
                  <tr key={`sec-${idx}`} className="bg-indigo-50 border-b border-indigo-200">
                    <td colSpan={21} className="py-1.5 px-2 text-xs font-bold text-indigo-800">
                      {d.sectionTitle}
                    </td>
                  </tr>
                );
              }
              const prevData = (() => {
                for (let j = idx - 1; j >= 0; j--) {
                  if (!bodyRows[j].d.isSection) return bodyRows[j].item;
                }
                return null;
              })();
              const prevGroup = prevData ? (prevData.group_name || '') : '';
              const curGroup = item.group_name || '';
              const showGroupHeader = curGroup && curGroup !== prevGroup;

              itemNo++;
              const isFreebie = item.is_promo || item.notes === 'HỖ TRỢ';

              return (
                <Fragment key={item.id || `row-${idx}`}>
                  {showGroupHeader && (
                    <tr className="bg-indigo-50">
                      <td colSpan={21} className="py-2 px-3">
                        <span className="font-bold text-indigo-800 text-sm">{curGroup}</span>
                      </td>
                    </tr>
                  )}
                  <tr className={`border-b hover:bg-blue-50/30 ${isFreebie ? 'bg-amber-50/40' : ''}`}>
                    <td className="py-1 px-1 text-gray-400">{itemNo}</td>
                    <td className="py-1 px-1 text-gray-600">{item.product_code || '—'}</td>
                    <td className="py-1 px-1 font-medium text-gray-900">{item.name}</td>
                    <td className="py-1 px-1 text-gray-600 max-w-[200px] truncate" title={item.description || ''}>{item.description || '—'}</td>
                    <td className="py-1 px-1 text-center text-gray-600">{item.unit || '—'}</td>
                    <td className="py-1 px-1 text-right tabular-nums">{d.lengthVal ? formatNum(d.lengthVal) : '—'}</td>
                    <td className="py-1 px-1 text-right tabular-nums">{d.widthVal ? formatNum(d.widthVal) : '—'}</td>
                    <td className="py-1 px-1 text-right tabular-nums">{d.heightVal ? formatNum(d.heightVal) : '—'}</td>
                    <td className="py-1 px-1 text-right tabular-nums text-teal-700">{d.standardArea > 0 ? formatNum(d.standardArea) : '—'}</td>
                    <td className="py-1 px-1 text-right tabular-nums">
                      {d.actualArea > 0 ? (
                        <span>
                          {formatNum(d.actualArea)}
                          {d.areaRatio > 0 && (
                            <span className={`block text-[10px] ${d.areaRatio > 1 ? 'text-orange-500' : 'text-teal-600'}`}>
                              ×{d.areaRatio.toFixed(2)}
                            </span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-1 px-1 text-right">{d.factor ? formatNum(d.factor) : '—'}</td>
                    <td className="py-1 px-1 text-right">{item.quantity ?? '—'}</td>
                    <td className="py-1 px-1 text-right whitespace-nowrap">{formatVND(item.unit_price)}</td>
                    <td className="py-1 px-1 text-right font-medium whitespace-nowrap">{formatVND(d.amount)}</td>
                    <td className="py-1 px-1 text-right text-gray-600">{item.discount_percent ?? 0}%</td>
                    <td className="py-1 px-1 text-right text-orange-600 whitespace-nowrap">{formatVND(d.discountAmount)}</td>
                    <td className="py-1 px-1 text-right text-gray-600">{item.vat_rate ?? 0}%</td>
                    <td className="py-1 px-1 text-right text-gray-700 whitespace-nowrap">{formatVND(d.vatAmount)}</td>
                    <td className="py-1 px-1 text-right font-bold text-blue-700 whitespace-nowrap">{formatVND(d.lineTotal)}</td>
                    <td className="py-1 px-1 text-gray-600">{item.promo_code || '—'}</td>
                    <td className="py-1 px-1 text-center">{item.is_promo ? '🎁' : '—'}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end mt-4">
        <div className="w-[420px] space-y-2">
          {groupOrder.length > 0 && groupOrder.map((g) => (
            <div key={g} className="flex justify-between text-xs text-indigo-700">
              <span className="truncate max-w-[260px]" title={g}>📂 {g.length > 42 ? `${g.slice(0, 42)}…` : g}</span>
              <span className="font-medium">{formatVND(groupDetails[g]?.afterDiscount || 0)}</span>
            </div>
          ))}
          {groupOrder.length > 0 && <div className="border-t border-gray-200" />}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Tổng tiền hàng</span>
            <span className="font-medium">{formatVND(doc?.subtotal ?? calcs.subtotal)}</span>
          </div>
          {doc != null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{discountLabel}</span>
              <span className="font-medium text-red-600">−{formatVND(doc.discount_amount || 0)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Cộng sau CK</span>
            <span className="font-medium">{formatVND((doc?.subtotal ?? calcs.subtotal) - (doc?.discount_amount || 0))}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Thuế GTGT</span>
            <span className="font-medium">{formatVND(doc?.tax_amount ?? calcs.totalVat)}</span>
          </div>
          <div className={`flex justify-between text-base font-bold border-t pt-2 mt-2 ${totalClass}`}>
            <span>TỔNG CỘNG</span>
            <span>{formatVND(doc?.total)}</span>
          </div>
          {extraTotalsFooter}
        </div>
      </div>
    </div>
  );
}
