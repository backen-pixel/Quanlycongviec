// Bảng "Chi tiết hàng hóa / dịch vụ" dùng chung cho Báo giá / Đơn hàng / Hóa đơn.
// Trước đây khối này bị copy-paste trong QuotationForm / OrderForm / InvoiceForm.
import React, { useState } from 'react';
import { Plus, Trash2, Search, AlignLeft } from 'lucide-react';
import ProductAutocompleteCell from './ProductAutocompleteCell';
import {
  formatVND, formatNum, parseNumber,
  applyItemFieldUpdate, makeEmptyItem, makeSectionRow,
  productPatchForItem, updateGroupDiscountItems, getGroupDiscountPercentOf,
} from '../lib/commercialItems';

// Component input số — hiển thị formatted khi blur, raw khi focus
export function NumericInput({ value, onChange, placeholder, title, className, allowEmpty }) {
  const [localVal, setLocalVal] = useState('');
  const [focused, setFocused] = useState(false);

  const displayValue = (() => {
    if (allowEmpty && (value === '' || value === null || value === undefined)) return '';
    if (value === 0 || value === '0') return '0';
    if (!value) return '';
    return formatNum(value);
  })();

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? localVal : displayValue}
      placeholder={placeholder || '0'}
      title={title}
      className={className}
      onFocus={(e) => {
        setFocused(true);
        const raw = (value === 0 || value === '0') ? '' : String(value ?? '');
        setLocalVal(raw);
        setTimeout(() => e.target.select(), 0);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.,-]/g, '');
        setLocalVal(raw);
        const num = parseNumber(raw);
        onChange(allowEmpty && raw === '' ? '' : num);
      }}
      onBlur={() => {
        setFocused(false);
        const num = parseNumber(localVal);
        onChange(allowEmpty && localVal === '' ? '' : num);
      }}
    />
  );
}

// Literal đầy đủ để Tailwind JIT nhận diện class (không ghép chuỗi động)
const THEMES = {
  invoice: {
    focus: 'focus:border-purple-500 focus:ring-1 focus:ring-purple-500',
    rowHover: 'hover:bg-purple-50/30',
    totalText: 'text-purple-700',
    addProductBtn: 'bg-purple-600 hover:bg-purple-700',
  },
  order: {
    focus: 'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
    rowHover: 'hover:bg-blue-50/30',
    totalText: 'text-emerald-700',
    addProductBtn: 'bg-emerald-600 hover:bg-emerald-700',
  },
  quotation: {
    focus: 'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
    rowHover: 'hover:bg-blue-50/30',
    totalText: 'text-blue-700',
    addProductBtn: 'bg-emerald-600 hover:bg-emerald-700',
  },
};

/**
 * Card "Chi tiết hàng hóa / dịch vụ": toolbar + bảng items (section, nhóm, CK nhóm, khoá thành tiền).
 * `children` render bên dưới bảng (khối tổng tiền của từng form).
 */
export default function CommercialItemsTable({
  theme = 'quotation',
  items,
  setItems,
  rows,
  groupDetails,
  products,
  onOpenProductPicker,
  onOpenDescription, // optional: (idx, item) => void — nút xem mô tả dài (Báo giá)
  children,
}) {
  const t = THEMES[theme] || THEMES.quotation;
  const cellCls = `w-full px-1.5 py-1 border border-gray-200 hover:border-gray-400 ${t.focus} rounded text-xs outline-none bg-transparent`;

  const updateItem = (idx, field, val) => setItems(prev => prev.map((item, i) => (i === idx ? applyItemFieldUpdate(item, field, val) : item)));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addRow = () => setItems(prev => [...prev, makeEmptyItem()]);
  const addSection = () => setItems(prev => [...prev, makeSectionRow()]);
  const updateGroupDiscount = (groupName, percent) => setItems(prev => updateGroupDiscountItems(prev, groupName, percent));
  const getGroupDiscountPercent = (groupName) => getGroupDiscountPercentOf(items, groupName);

  return (
    <div className="bg-white rounded-xl border p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold" style={{ color: '#000000' }}>Chi tiết hàng hóa / dịch vụ</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onOpenProductPicker} className={`h-9 px-3 ${t.addProductBtn} text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer`}>
            <Search className="h-3.5 w-3.5" /> Tìm & thêm sản phẩm
          </button>
          <button onClick={addSection} className="h-9 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer border border-indigo-200">
            <AlignLeft className="h-3.5 w-3.5" /> Thêm tiêu đề phần
          </button>
          <button onClick={addRow} className="h-9 px-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Thêm dòng trống
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg" style={{ maxHeight: '65vh' }}>
        <table className="min-w-[2320px] w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wider">
              <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{width:36}}>STT</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{width:100}}>Mã HH</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{minWidth:180}}>Tên hàng hóa</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{width:140}}>Diễn giải</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-center align-bottom" style={{width:50}}>ĐVT</th>
              <th colSpan={3} className="py-1.5 px-1.5 text-center border-b border-gray-200" style={{width:185}}>Quy cách</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:85}} title="Diện tích chuẩn (mm²)">DT Chuẩn</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:85}} title="Diện tích thực tế = Ngang × Cao">DT Thực</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:50}}>SL</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:120}}>Đơn giá</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:50}}>% Chiết Khấu</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:120}} title="Đơn giá đã trừ %CK — chỉ để đối chiếu">Đơn Giá Sau CK</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:100}}>Số Tiền CK</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:120}}>Thành Tiền</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:50}}>%VAT</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:100}}>Tiền thuế</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-right align-bottom whitespace-nowrap" style={{width:130}}>Tổng tiền</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-left align-bottom" style={{width:80}}>CTKM</th>
              <th rowSpan={2} className="py-2.5 px-1.5 text-center align-bottom" style={{width:36}}>KM</th>
              <th rowSpan={2} className="py-2.5 px-1.5 align-bottom" style={{width:36}}></th>
            </tr>
            <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wider">
              <th className="py-1.5 px-1.5 text-right whitespace-nowrap" style={{width:60}} title="Cao (mm)">Cao</th>
              <th className="py-1.5 px-1.5 text-right whitespace-nowrap" style={{width:65}} title="Ngang (mm)">Ngang</th>
              <th className="py-1.5 px-1.5 text-right whitespace-nowrap" style={{width:60}} title="Sâu (mm)">Sâu</th>
            </tr>
          </thead>
          <tbody>
            {(() => { let itemNo = 0; return items.map((item, idx) => {
              if (item.row_type === 'section') return (
                <React.Fragment key={idx}>
                  <tr className="bg-indigo-50 border-b border-indigo-200">
                    <td colSpan={21} className="py-1.5 px-2">
                      <input
                        value={item.name}
                        onChange={e => updateItem(idx, 'name', e.target.value)}
                        className="w-full bg-transparent text-xs font-bold text-indigo-800 outline-none placeholder-indigo-300"
                        placeholder="Tên tiêu đề phần..."
                      />
                    </td>
                    <td className="py-1 px-1 text-center">
                      <button onClick={() => removeItem(idx)} className="p-0.5 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                </React.Fragment>
              );
              const row = rows[idx] || {};
              itemNo++;
              const prevGroupName = idx > 0 ? (items[idx - 1].row_type !== 'section' ? items[idx - 1].group_name || '' : '') : '';
              const currentGroupName = item.group_name || '';
              const showGroupHeader = currentGroupName && currentGroupName !== prevGroupName;
              const nextGroupName = idx < items.length - 1 ? (items[idx + 1].group_name || '') : '';
              const isLastInGroup = currentGroupName && currentGroupName !== nextGroupName;
              const gd = currentGroupName ? groupDetails[currentGroupName] : null;
              return (
                <React.Fragment key={idx}>
                {showGroupHeader && (() => {
                  const curGroupCK = getGroupDiscountPercent(currentGroupName);
                  const isMixed = curGroupCK === null;
                  return (
                    <tr className="bg-indigo-50">
                      <td colSpan={22} className="py-2 px-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="font-bold text-indigo-800 text-sm">{currentGroupName}</span>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-indigo-700 font-medium">CK nhóm:</span>
                            <NumericInput
                              value={isMixed ? '' : (curGroupCK || '')}
                              onChange={(v) => updateGroupDiscount(currentGroupName, v)}
                              placeholder={isMixed ? 'Lệch' : '0'}
                              title={isMixed
                                ? 'Các dòng trong nhóm đang có CK% khác nhau — nhập 1 giá trị mới sẽ áp đồng loạt'
                                : 'Nhập CK% áp cho TẤT CẢ dòng trong nhóm (HỖ TRỢ được bỏ qua)'}
                              allowEmpty
                              className={`w-16 h-7 px-2 border rounded text-xs text-right outline-none ${
                                isMixed
                                  ? 'border-amber-300 bg-amber-50 text-amber-700 placeholder-amber-500'
                                  : (curGroupCK > 0)
                                    ? 'border-orange-300 bg-orange-50 text-orange-700 font-semibold'
                                    : 'border-indigo-200 bg-white'
                              }`}
                            />
                            <span className="text-indigo-700">%</span>
                            {isMixed && (
                              <span className="text-[10px] text-amber-600 italic">(các dòng đang lệch CK)</span>
                            )}
                            {!isMixed && curGroupCK > 0 && (
                              <button
                                type="button"
                                onClick={() => updateGroupDiscount(currentGroupName, 0)}
                                className="text-[10px] text-red-500 hover:text-red-700 underline cursor-pointer"
                                title="Xoá CK nhóm"
                              >
                                Xoá CK
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })()}
                <tr className={`border-b ${t.rowHover}`}>
                  <td className="py-1 px-1 text-gray-400 text-xs">{itemNo}</td>
                  <td className="py-1 px-1"><input value={item.product_code || ''} onChange={e => updateItem(idx, 'product_code', e.target.value)} placeholder="Mã" className={cellCls} /></td>
                  <td className="py-1 px-1">
                    <ProductAutocompleteCell
                      value={item.name}
                      products={products}
                      onChange={(val) => updateItem(idx, 'name', val)}
                      onSelectProduct={(p) => {
                        setItems(prev => prev.map((it, i) => i === idx ? productPatchForItem(p, it) : it));
                      }}
                      placeholder="Gõ tên SP..."
                    />
                  </td>
                  <td className="py-1 px-1">
                    {onOpenDescription ? (
                      <div className="flex items-center gap-1">
                        <input value={item.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Mô tả" className={`${cellCls} truncate`} title={item.description || ''} />
                        {item.description && item.description.length > 20 && (
                          <button onClick={() => onOpenDescription(idx, item)} className="flex-shrink-0 p-1 text-blue-400 hover:text-blue-600 cursor-pointer" title="Xem chi tiết"><Search className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    ) : (
                      <input value={item.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Mô tả" className={cellCls} />
                    )}
                  </td>
                  <td className="py-1 px-1"><input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className={`${cellCls} text-center`} /></td>
                  <td className="py-1 px-1"><NumericInput value={item.height || ''} onChange={v => updateItem(idx, 'height', v)} placeholder="mm" title="Cao (mm)" allowEmpty className={`${cellCls} text-right`} /></td>
                  <td className="py-1 px-1"><NumericInput value={item.length || ''} onChange={v => updateItem(idx, 'length', v)} placeholder="mm" title="Ngang (mm)" allowEmpty className={`${cellCls} text-right`} /></td>
                  <td className="py-1 px-1"><NumericInput value={item.width || ''} onChange={v => updateItem(idx, 'width', v)} placeholder="mm" title="Sâu (mm)" allowEmpty className={`${cellCls} text-right`} /></td>
                  <td className="py-1 px-1">
                    <NumericInput value={item.standard_area || ''} onChange={v => updateItem(idx, 'standard_area', v)} placeholder="0" title={item.standard_area ? `DT Chuẩn: ${formatNum(item.standard_area)} mm²` : 'Diện tích chuẩn (mm²)'} allowEmpty className={`${cellCls} text-right ${parseFloat(item.standard_area) > 0 ? 'text-teal-700 font-semibold' : ''}`} />
                  </td>
                  <td className="py-1 px-1 text-right text-xs whitespace-nowrap">
                    {row.actual_area > 0 ? (
                      <span className={`font-medium ${row.area_ratio > 0 ? (row.area_ratio > 1 ? 'text-orange-600' : 'text-teal-700') : 'text-gray-600'}`} title={`${formatNum(row.actual_area)} mm²${row.area_ratio > 0 ? ` | Tỷ lệ: ×${row.area_ratio.toFixed(3)}` : ''}`}>
                        {formatNum(row.actual_area)}
                        {row.area_ratio > 0 && <span className={`text-[10px] block ${row.area_ratio > 1 ? 'text-orange-500' : 'text-teal-500'}`}>×{row.area_ratio.toFixed(2)}</span>}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="py-1 px-1"><NumericInput value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} placeholder="1" className={`${cellCls} text-right`} /></td>
                  <td className="py-1 px-1"><NumericInput value={item.unit_price} onChange={v => updateItem(idx, 'unit_price', v)} placeholder="0" className={`${cellCls} text-right`} /></td>
                  <td className="py-1 px-1"><NumericInput value={item.discount_percent || 0} onChange={v => updateItem(idx, 'discount_percent', v)} className={`${cellCls} text-right`} /></td>
                  <td className="py-1 px-1 text-right text-xs text-gray-500 whitespace-nowrap" title="Đơn giá đã trừ %CK — chỉ để đối chiếu, không dùng để tính Thành tiền">
                    {item.is_freebie || item.notes === 'HỖ TRỢ' ? <span className="text-gray-300">—</span> : formatVND(row.unit_price_after_discount || 0)}
                  </td>
                  <td className="py-1 px-1">
                    {item.is_freebie || item.notes === 'HỖ TRỢ' ? (
                      <span className="block text-right text-xs text-green-600 font-bold">—</span>
                    ) : (
                      <NumericInput
                        value={Math.round(row.discount_amount || 0) || ''}
                        onChange={(v) => {
                          const gross = row.gross_amount || 0;
                          const amt = parseFloat(v) || 0;
                          if (gross > 0) {
                            const pct = Math.max(0, Math.min(100, Math.round((amt / gross) * 10000) / 100));
                            updateItem(idx, 'discount_percent', pct);
                          } else if (amt === 0) {
                            updateItem(idx, 'discount_percent', 0);
                          }
                        }}
                        placeholder="0"
                        allowEmpty
                        title="Số tiền CK (đ) — gõ vào sẽ tự tính lại % CK theo Thành tiền gốc"
                        className="w-full px-1.5 py-1 border border-gray-200 hover:border-orange-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-300 rounded text-xs outline-none bg-transparent text-right text-orange-700 font-medium"
                      />
                    )}
                  </td>
                  <td className="py-1 px-1 text-right text-xs font-medium whitespace-nowrap text-gray-900">
                    {item.is_freebie || item.notes === 'HỖ TRỢ' ? (
                      <span className="text-green-600 font-bold">HỖ TRỢ</span>
                    ) : (
                      <NumericInput
                        value={Math.round((item.lock_amount && typeof item.imported_amount === 'number' ? item.imported_amount : row.gross_amount) || 0) || ''}
                        onChange={(v) => {
                          const amt = v === '' || v === null ? null : (parseFloat(v) || 0);
                          if (amt === null) {
                            setItems(prev => prev.map((it, i) => i === idx ? { ...it, lock_amount: false, imported_amount: undefined } : it));
                            return;
                          }
                          // Khoá thành tiền: calcs dùng imported_amount thay công thức,
                          // tự tính ngược discount_amount = max(0, gross - amount).
                          setItems(prev => prev.map((it, i) => i === idx ? {
                            ...it,
                            lock_amount: true,
                            imported_amount: amt,
                          } : it));
                        }}
                        placeholder="0"
                        allowEmpty
                        title={item.lock_amount ? 'Thành tiền đã khoá (sửa qty/đơn giá/CK sẽ tự gỡ khoá)' : 'Sửa số để khoá Thành tiền theo giá trị mong muốn'}
                        className={`w-full px-1.5 py-1 border ${item.lock_amount ? 'border-emerald-400 text-emerald-700 font-semibold' : 'border-gray-200 hover:border-gray-400'} ${t.focus} rounded text-xs outline-none bg-transparent text-right`}
                      />
                    )}
                  </td>
                  <td className="py-1 px-1"><NumericInput value={item.vat_rate || 0} onChange={v => updateItem(idx, 'vat_rate', v)} className={`${cellCls} text-right`} /></td>
                  <td className="py-1 px-1 text-right text-xs text-gray-600 whitespace-nowrap">{formatVND(row.tax_amount || 0)}</td>
                  <td className={`py-1 px-1 text-right text-xs font-bold whitespace-nowrap ${t.totalText}`}>{formatVND(row.total || 0)}</td>
                  <td className="py-1 px-1"><input value={item.promo_code || ''} onChange={e => updateItem(idx, 'promo_code', e.target.value)} placeholder="" className={cellCls} /></td>
                  <td className="py-1 px-1 text-center"><input type="checkbox" checked={item.is_promo || false} onChange={e => updateItem(idx, 'is_promo', e.target.checked)} className="h-4 w-4 rounded cursor-pointer" /></td>
                  <td className="py-1 px-1"><button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
                {/* Group summary rows after last item in group */}
                {isLastInGroup && gd && (
                  <>
                    <tr className="bg-indigo-50/70">
                      <td colSpan={15} className="py-2 px-3 text-right text-sm font-bold text-indigo-800">
                        Tổng {currentGroupName.replace(/^[IVXLCDM]+\.\s*/, '').split(/\s*[-–]\s*/)[0]}:
                      </td>
                      <td className="py-2 px-2 text-right text-sm font-bold text-indigo-800">{formatVND(gd.subtotal)}</td>
                      <td colSpan={6}></td>
                    </tr>
                    {gd.discountTotal > 0 && (
                      <tr className="bg-indigo-50/70">
                        <td colSpan={15} className="py-2 px-3 text-right text-sm font-bold text-red-600">
                          Chiết khấu nhóm:
                        </td>
                        <td className="py-2 px-2 text-right text-sm font-bold text-red-600">-{formatVND(gd.discountTotal)}</td>
                        <td colSpan={6}></td>
                      </tr>
                    )}
                    {gd.discountTotal > 0 && (
                      <tr className="bg-indigo-100/60">
                        <td colSpan={15} className="py-2 px-3 text-right text-sm font-bold text-indigo-900">
                          Tổng sau CK:
                        </td>
                        <td className="py-2 px-2 text-right text-sm font-bold text-indigo-900">{formatVND(gd.afterDiscount)}</td>
                        <td colSpan={6}></td>
                      </tr>
                    )}
                  </>
                )}
                </React.Fragment>
              );
            }); })()}
          </tbody>
        </table>
      </div>

      {children}
    </div>
  );
}

/** Khối tổng tiền đơn giản (Hóa đơn / Đơn hàng): CK tổng %/VNĐ + VAT + tổng cộng. */
export function SimpleTotalsSummary({ calcs, discountType, discountValue, onDiscountTypeChange, onDiscountValueChange, totalClass = 'text-blue-600' }) {
  return (
    <div className="flex justify-end mt-4">
      <div className="w-80 space-y-2">
        {/* Per-group after-CK totals */}
        {calcs.groupOrder.length > 0 && calcs.groupOrder.map(group => {
          const gd = calcs.groupDetails[group];
          return (
            <div key={group} className="flex justify-between text-xs text-indigo-700">
              <span className="truncate max-w-[260px]" title={group}>📂 {group.length > 40 ? group.slice(0, 40) + '...' : group}:</span>
              <span className="font-medium">{formatVND(gd.afterDiscount)}</span>
            </div>
          );
        })}
        {calcs.groupOrder.length > 0 && <div className="border-t border-gray-200" />}
        <div className="flex justify-between text-sm"><span className="text-gray-500">Tổng tiền hàng:</span><span className="font-medium">{formatVND(calcs.subtotal)}</span></div>
        <div className="flex items-center justify-between text-sm gap-2">
          <span className="text-gray-500">Chiết khấu:</span>
          <div className="flex items-center gap-1">
            <select value={discountType} onChange={e => onDiscountTypeChange(e.target.value)} className="h-7 px-1 border rounded text-xs">
              <option value="percent">%</option><option value="amount">VNĐ</option>
            </select>
            <input type="number" value={discountValue} onChange={e => onDiscountValueChange(parseFloat(e.target.value) || 0)} className="w-20 h-7 px-2 border rounded text-xs text-right" />
          </div>
          <span className="font-medium text-red-600">-{formatVND(calcs.discountAmt)}</span>
        </div>
        <div className="flex justify-between text-sm"><span className="text-gray-500">Thuế GTGT:</span><span className="font-medium">{formatVND(calcs.totalVat)}</span></div>
        <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
          <span>TỔNG CỘNG:</span>
          <span className={totalClass}>{formatVND(calcs.total)}</span>
        </div>
      </div>
    </div>
  );
}
