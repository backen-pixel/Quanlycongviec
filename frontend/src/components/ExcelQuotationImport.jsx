import { useState, useRef } from 'react';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { Upload, FileSpreadsheet, X, Check, AlertTriangle, Loader2, Eye, ChevronDown, ChevronUp } from 'lucide-react';

export default function ExcelQuotationImport({ dealId, leadId, taskId, onImportDone, onClose }) {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState(null); // parsed data
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandGroups, setExpandGroups] = useState({});
  const [descPopup, setDescPopup] = useState(null); // { name, description }
  const [confirmed, setConfirmed] = useState(false);
  const fileRef = useRef(null);

  const handleFileSelect = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.match(/\.(xlsx?|csv)$/i)) {
      setError('Chỉ hỗ trợ file .xlsx, .xls');
      return;
    }
    setFile(f);
    setError('');
    setParsing(true);
    setPreview(null);
    setConfirmed(false);

    try {
      const formData = new FormData();
      formData.append('file', f);
      const { data } = await api.post('/crm/quotations/parse-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Lỗi đọc file');
    }
    setParsing(false);
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      // Build quotation payload
      const itemsPayload = preview.items
        .filter(i => !i.is_group)
        .map((i, idx) => {
          // Tính hệ số quy cách + chiết khấu thực tế per-item từ Excel
          let specFactor = 0;
          let itemDiscount = 0;
          const qty = i.quantity || 1;
          let price = i.unit_price || 0;
          const excelAmount = i.amount || 0;
          // group_discount_percent = CK từ header nhóm (đã tính vào Thành tiền per-item)
          // group_summary_discount_percent = CK từ summary rows (chưa tính vào Thành tiền, áp tổng nhóm)
          const headerCK = i.group_discount_percent || 0;
          const summaryCK = i.group_summary_discount_percent || 0;

          // Freebie: item có text "HỖ TRỢ"/"MIỄN PHÍ"/"TẶNG" → giá = 0, KHÔNG tính CK
          if (i.is_freebie) {
            itemDiscount = 0;
            specFactor = 0;
            price = 0; // Hỗ trợ = miễn phí, không phải chiết khấu
          } else if (price > 0 && qty > 0 && excelAmount > 0) {
            const rawRatio = excelAmount / (qty * price);

            if (rawRatio > 1.005) {
              // ratio > 1 → có hệ số quy cách (VD: mét dài tủ)
              specFactor = Math.round(rawRatio * 1000) / 1000;
              // CK nhóm tủ sẽ nằm ở chiết khấu tổng báo giá, KHÔNG áp per-item
            } else if (rawRatio >= 0.995) {
              // ratio ≈ 1 → SL×ĐG = Thành tiền, không CK per-item
              specFactor = 0;
            } else {
              // ratio < 1 → có chiết khấu per-item (Thành tiền đã trừ CK)
              const impliedCK = Math.round((1 - rawRatio) * 10000) / 100;
              if (headerCK > 0 && Math.abs(impliedCK - headerCK) < 1) {
                itemDiscount = headerCK;
              } else {
                itemDiscount = impliedCK;
              }
              specFactor = 0;
            }
          }

          return {
            name: i.name,
            description: i.description || '',
            unit: i.unit || 'bộ',
            quantity: qty,
            unit_price: price,
            spec_factor: specFactor,
            discount_percent: itemDiscount,
            vat_rate: i.vat_rate || 0,
            height: i.height || '',
            width: i.width || '',
            length: i.length || '',
            dimensions: [i.length, i.width, i.height].filter(Boolean).join(' x ') || '',
            group_name: i.group_name || '',
            notes: i.is_freebie ? 'HỖ TRỢ' : (i.notes || ''),
            is_freebie: !!i.is_freebie,
          };
        });

      // Tính discount_value: ưu tiên grandTotal từ Excel, tính ngược CK
      const itemsGrossTotal = itemsPayload.reduce((s, i) => {
        const f = parseFloat(i.spec_factor) || 0;
        const gross = f > 0 ? f * (i.quantity || 1) * (i.unit_price || 0) : (i.quantity || 1) * (i.unit_price || 0);
        const ck = gross * (i.discount_percent || 0) / 100;
        return s + (gross - ck);
      }, 0);
      const excelGrandTotal = preview.summary?.total || 0;
      // Nếu Excel có tổng cộng và nhỏ hơn tổng items → CK = chênh lệch
      const computedDiscount = (excelGrandTotal > 0 && itemsGrossTotal > excelGrandTotal)
        ? Math.round(itemsGrossTotal - excelGrandTotal)
        : (preview.summary?.discount_amount || 0);

        // Build notes: KT phụ trách + notes từ Excel
        const notesParts = [];
        if (preview.kts_info) notesParts.push(`KT Phụ trách: ${preview.kts_info}`);
        if (preview.notes) notesParts.push(preview.notes);

        // Tên file (không extension) làm tên báo giá mặc định
        const fileTitle = file?.name?.replace(/\.[^.]+$/, '').trim() || '';
        const payload = {
          title: preview.title || fileTitle || `Báo giá ${preview.customer_name || ''}`.trim(),
          customer_name: preview.customer_name || '',
          customer_phone: preview.customer_phone || '',
          customer_address: preview.customer_address || '',
          lead_id: dealId || leadId || '',
          items: itemsPayload,
          discount_type: 'amount',
          discount_value: computedDiscount,
          notes: notesParts.join('\n\n'),
          payment_terms: 'Thanh toán 50% khi ký HĐ, 50% khi bàn giao',
          // Lưu nhân viên xác nhận (đã tick checkbox "đã kiểm tra")
          approved_by: user?.id || '',
        };

      const { data } = await api.post('/crm/quotations', payload);
      // Hiển thị thông báo auto-link + auto-complete
      let msg = '';
      if (data.auto_task) {
        msg += `🚀 Tự động:\n• Liên kết báo giá ${data.code} với Deal\n• Hoàn thành nhiệm vụ "${data.auto_task.taskTitle}"\n• File báo giá đã ghi vào ghi chú nhiệm vụ\n`;
      } else if (data.lead_id && !(dealId || leadId)) {
        msg += `🔗 Tự động liên kết báo giá ${data.code} với Deal qua khách hàng\n`;
      }
      if (data.synced_products?.length) {
        const linked = data.synced_products?.length || 0;
        
        msg += linked > 0 ? `📦 ${linked} sản phẩm đã liên kết với danh mục web.\n` : '';
      }
      if (msg) alert(msg);
      if (onImportDone) onImportDone(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Lỗi tạo báo giá');
    }
    setSaving(false);
  };

  const toggleGroup = (name) => {
    setExpandGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const itemCount = preview?.items?.filter(i => !i.is_group).length || 0;
  const groupCount = preview?.items?.filter(i => i.is_group).length || 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Import báo giá từ Excel</h2>
              <p className="text-xs text-gray-500">Upload file .xlsx → Xem trước → Tạo báo giá</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Upload area */}
          {!preview && !parsing && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all"
            >
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">Kéo thả hoặc click để chọn file Excel</p>
              <p className="text-xs text-gray-400 mt-1">Hỗ trợ .xlsx, .xls (tối đa 10MB)</p>
              {file && <p className="text-xs text-blue-600 mt-2 font-medium">📄 {file.name}</p>}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            </div>
          )}

          {/* Parsing */}
          {parsing && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mr-3" />
              <p className="text-sm text-gray-600">Đang đọc file Excel...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
              <button onClick={() => { setError(''); setFile(null); setPreview(null); }}
                className="text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer">Thử lại</button>
            </div>
          )}

          {/* Preview */}
          {preview && (() => {
            // Build grouped structure: groups[] with items, and associate summary_rows per group
            const groups = [];
            let currentGroup = null;
            const summaryRows = preview.summary?.summary_rows || [];

            // Pass 1: collect groups and their items
            const ungroupedItems = [];
            preview.items.forEach((item) => {
              if (item.is_group) {
                currentGroup = { name: item.name, discount_percent: item.group_discount_percent || 0, items: [], summaryRows: [] };
                groups.push(currentGroup);
              } else if (currentGroup) {
                currentGroup.items.push(item);
              } else {
                ungroupedItems.push(item);
              }
            });
            // If no groups found, create a single virtual group with all items
            if (groups.length === 0 && ungroupedItems.length > 0) {
              groups.push({ name: '', discount_percent: 0, items: ungroupedItems, summaryRows: [] });
            } else if (ungroupedItems.length > 0) {
              // Prepend ungrouped items to first group
              groups[0].items = [...ungroupedItems, ...groups[0].items];
            }

            // Pass 2: associate summary_rows to groups by keyword matching
            const grandTotalRows = [];
            summaryRows.forEach(sr => {
              const label = (sr.label || '').toUpperCase();
              // Grand total rows (not per-group)
              if (label.includes('TỔNG CỘNG') || /TỔNG\s*\d+\s*HẠNG\s*MỤC/.test(label)) {
                grandTotalRows.push(sr);
                return;
              }
              // Try to match to a group
              let matched = false;
              for (const g of groups) {
                const gNameUpper = g.name.toUpperCase();
                // Extract short keywords from group name for matching
                // e.g. "I. PHÒNG BẾP" → check if summary mentions "TỦ" (bếp = tủ) or "PHỤ KIỆN"
                const isSubtotal = !label.includes('CHIẾT KHẤU') && !label.includes('SAU');
                const isDiscount = label.includes('CHIẾT KHẤU') && !label.includes('SAU');
                const isAfterDiscount = label.includes('SAU') && label.includes('CHIẾT KHẤU');

                // Match by checking if any significant word from group name appears in the summary label
                // or vice versa, or by order
                const groupWords = gNameUpper.replace(/^[IVXLCDM]+\.\s*/, '').split(/[\s\-–,]+/).filter(w => w.length > 2);
                const labelWords = label.split(/[\s\-–:,]+/).filter(w => w.length > 2);
                const hasOverlap = groupWords.some(gw => labelWords.some(lw => lw.includes(gw) || gw.includes(lw)));

                if (hasOverlap) {
                  if (!g.summaryRows) g.summaryRows = [];
                  g.summaryRows.push({ ...sr, _type: isAfterDiscount ? 'after_discount' : isDiscount ? 'discount' : 'subtotal' });
                  matched = true;
                  break;
                }
              }
              // If not matched by keyword, assign to last group that doesn't have this type yet
              if (!matched && groups.length > 0) {
                const label2 = (sr.label || '').toUpperCase();
                const isDiscount2 = label2.includes('CHIẾT KHẤU') && !label2.includes('SAU');
                const isAfterDiscount2 = label2.includes('SAU') && label2.includes('CHIẾT KHẤU');
                const type = isAfterDiscount2 ? 'after_discount' : isDiscount2 ? 'discount' : 'subtotal';
                // Find last group that doesn't already have this type
                for (let gi = groups.length - 1; gi >= 0; gi--) {
                  if (!groups[gi].summaryRows.some(s => s._type === type)) {
                    groups[gi].summaryRows.push({ ...sr, _type: type });
                    break;
                  }
                }
              }
            });

            let globalStt = 0;

            return (
            <>
              {/* Customer info */}
              <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Thông tin khách hàng (từ Excel)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[10px] text-blue-600 uppercase font-medium">Tên KH</span>
                    <p className="text-sm font-semibold text-gray-900">{preview.customer_name || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-600 uppercase font-medium">SĐT</span>
                    <p className="text-sm font-semibold text-gray-900">{preview.customer_phone || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-600 uppercase font-medium">Địa chỉ</span>
                    <p className="text-sm font-semibold text-gray-900">{preview.customer_address || '—'}</p>
                  </div>
                  {preview.kts_info && (
                    <div>
                      <span className="text-[10px] text-blue-600 uppercase font-medium">KT Phụ trách</span>
                      <p className="text-sm font-semibold text-gray-900">{preview.kts_info}</p>
                    </div>
                  )}
                  {preview.title && (
                    <div className="md:col-span-2">
                      <span className="text-[10px] text-blue-600 uppercase font-medium">Tiêu đề</span>
                      <p className="text-sm font-semibold text-gray-900">{preview.title}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs">
                <span className="bg-gray-100 px-3 py-1.5 rounded-full font-medium">📋 {itemCount} sản phẩm</span>
                {groupCount > 0 && <span className="bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full font-medium">📂 {groupCount} nhóm</span>}
                <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full font-medium">💰 {formatVND(preview.summary?.total || preview.summary?.subtotal || 0)}</span>
              </div>

              {/* Items table - grouped */}
              <div className="border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase">
                        <th className="py-2 px-2 text-left w-10">STT</th>
                        <th className="py-2 px-2 text-left min-w-[200px]">Hạng mục</th>
                        <th className="py-2 px-2 text-left min-w-[150px]">Mô tả</th>
                        <th className="py-2 px-2 text-center w-14">ĐVT</th>
                        <th className="py-2 px-2 text-right w-16">Ngang</th>
                        <th className="py-2 px-2 text-right w-16">Sâu</th>
                        <th className="py-2 px-2 text-right w-16">Cao</th>
                        <th className="py-2 px-2 text-right w-16">SL</th>
                        <th className="py-2 px-2 text-right w-24">Đơn giá</th>
                        <th className="py-2 px-2 text-right w-28">Thành tiền</th>
                        <th className="py-2 px-2 text-right w-14">CK%</th>
                        <th className="py-2 px-2 text-left w-20">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group, gi) => {
                        const isExpanded = !group.name || expandGroups[group.name] !== false; // default expanded
                        // Compute group item total (sum of amounts)
                        const groupItemTotal = group.items.reduce((s, item) => {
                          // Freebie = 0, không tính CK
                          if (item.is_freebie) return s;
                          const headerCK = item.group_discount_percent || 0;
                          const price = item.unit_price || 0;
                          const qty = item.quantity || 1;
                          const amt = item.amount || 0;
                          let effectiveCK = 0;
                          if (headerCK > 0 && price > 0 && qty > 0 && amt > 0) {
                            if (amt / (qty * price) < 0.995) effectiveCK = headerCK;
                          }
                          return s + amt;
                        }, 0);

                        // Find summary rows for this group
                        const subtotalRow = group.summaryRows.find(s => s._type === 'subtotal');
                        const discountRow = group.summaryRows.find(s => s._type === 'discount');
                        const afterDiscountRow = group.summaryRows.find(s => s._type === 'after_discount');

                        return [
                          // Group header (skip for virtual ungrouped)
                          ...(group.name ? [
                          <tr key={`gh-${gi}`} className="bg-indigo-50 cursor-pointer" onClick={() => toggleGroup(group.name)}>
                            <td colSpan={12} className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-indigo-500" /> : <ChevronDown className="h-3.5 w-3.5 text-indigo-500" />}
                                <span className="font-bold text-indigo-800 text-xs">{group.name}</span>
                                {group.discount_percent > 0 && (
                                  <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px] font-medium">CK {group.discount_percent}%</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          ] : []),
                          // Group items (collapsible)
                          ...(isExpanded ? group.items.map((item, ii) => {
                            globalStt++;
                            const headerCK = item.group_discount_percent || 0;
                            const price = item.unit_price || 0;
                            const qty = item.quantity || 1;
                            const amt = item.amount || 0;
                            let effectiveCK = 0;
                            const isFreebie = item.is_freebie;
                            if (!isFreebie && headerCK > 0 && price > 0 && qty > 0 && amt > 0) {
                              if (amt / (qty * price) < 0.995) effectiveCK = headerCK;
                            }
                            const amountAfterCK = isFreebie ? 0 : amt;
                            return (
                              <tr key={`gi-${gi}-${ii}`} className="border-b hover:bg-gray-50/50">
                                <td className="py-1.5 px-2 text-gray-400">{globalStt}</td>
                                <td className="py-1.5 px-2 font-medium text-gray-900">{item.name}</td>
                                <td className="py-1.5 px-2 text-gray-600">
                                  {item.description ? (
                                    <span className="cursor-pointer hover:text-blue-600 truncate block max-w-[150px]" title="Click xem chi tiết" onClick={() => setDescPopup({ name: item.name, description: item.description })}>
                                      {item.description.length > 30 ? item.description.slice(0, 30) + '...' : item.description}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="py-1.5 px-2 text-center">{item.unit}</td>
                                <td className="py-1.5 px-2 text-right text-gray-600">{item.length || '—'}</td>
                                <td className="py-1.5 px-2 text-right text-gray-600">{item.width || '—'}</td>
                                <td className="py-1.5 px-2 text-right text-gray-600">{item.height || '—'}</td>
                                <td className="py-1.5 px-2 text-right">{item.quantity}</td>
                                <td className="py-1.5 px-2 text-right">{formatVND(item.unit_price)}</td>
                                <td className="py-1.5 px-2 text-right font-medium text-blue-700">{isFreebie ? <span className="text-green-600 font-bold">HỖ TRỢ</span> : formatVND(amountAfterCK)}</td>
                                <td className="py-1.5 px-2 text-right text-orange-600">{effectiveCK > 0 ? `${effectiveCK}%` : '—'}</td>
                                <td className="py-1.5 px-2 text-gray-500">{isFreebie ? 'Miễn phí' : (item.notes || '')}</td>
                              </tr>
                            );
                          }) : (() => { globalStt += group.items.length; return []; })()),
                          // Group summary rows (always visible)
                          <tr key={`gs-${gi}-sub`} className="bg-indigo-50/70">
                            <td colSpan={9} className="py-1.5 px-3 text-right text-xs font-bold text-indigo-800">
                              {subtotalRow ? subtotalRow.label : `Tổng ${group.name.replace(/^[IVXLCDM]+\.\s*/, '').split(/\s*[-–]\s*/)[0]}`}:
                            </td>
                            <td className="py-1.5 px-2 text-right text-xs font-bold text-indigo-800">
                              {formatVND(subtotalRow ? subtotalRow.amount : groupItemTotal)}
                            </td>
                            <td colSpan={2}></td>
                          </tr>,
                          ...(discountRow ? [
                            <tr key={`gs-${gi}-ck`} className="bg-indigo-50/70">
                              <td colSpan={9} className="py-1.5 px-3 text-right text-xs font-bold text-red-600">
                                {discountRow.label}:
                              </td>
                              <td className="py-1.5 px-2 text-right text-xs font-bold text-red-600">
                                -{formatVND(Math.abs(discountRow.amount))}
                              </td>
                              <td colSpan={2}></td>
                            </tr>
                          ] : []),
                          ...(afterDiscountRow ? [
                            <tr key={`gs-${gi}-after`} className="bg-indigo-100/60">
                              <td colSpan={9} className="py-1.5 px-3 text-right text-xs font-bold text-indigo-900">
                                {afterDiscountRow.label}:
                              </td>
                              <td className="py-1.5 px-2 text-right text-xs font-bold text-indigo-900">
                                {formatVND(afterDiscountRow.amount)}
                              </td>
                              <td colSpan={2}></td>
                            </tr>
                          ] : []),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Grand Total */}
                <div className="bg-gray-50 border-t px-4 py-3 space-y-1">
                  <div className="flex justify-between text-base font-bold">
                    <span>TỔNG CỘNG:</span>
                    <span className="text-blue-600">{formatVND(preview.summary?.total || 0)}</span>
                  </div>
                </div>
              </div>

              {/* File info */}
              <p className="text-[10px] text-gray-400">
                📄 {file?.name} • Phát hiện header dòng {preview.header_row + 1} / {preview.total_rows} dòng • 
                Cột: {Object.keys(preview.columns_detected || {}).join(', ')}
              </p>

              {/* Notes from Excel */}
              {preview.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <h4 className="text-xs font-bold text-amber-800">📝 Ghi chú & Điều khoản từ Excel</h4>
                  <pre className="text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed">{preview.notes}</pre>
                </div>
              )}
            </>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl space-y-3">
          {preview && (
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 cursor-pointer"
              />
              <span className={`text-sm font-medium transition-colors ${confirmed ? 'text-emerald-700' : 'text-gray-600'}`}>
                {user?.full_name ? (
                  <><span className="font-bold text-blue-700">{user.full_name}</span> đã kiểm tra lại báo giá và xác nhận số liệu chính xác</>
                ) : (
                  'Tôi đã kiểm tra lại báo giá và xác nhận số liệu chính xác'
                )}
              </span>
              {confirmed && <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />}
            </label>
          )}
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {preview ? (confirmed ? '✅ Sẵn sàng tạo báo giá' : '⚠️ Vui lòng kiểm tra và xác nhận trước khi tạo') : 'Chọn file Excel để bắt đầu'}
            </div>
            <div className="flex gap-2">
              {preview && (
                <button onClick={() => { setPreview(null); setFile(null); setConfirmed(false); fileRef.current && (fileRef.current.value = ''); }}
                  className="h-9 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium cursor-pointer transition">
                  🔄 Chọn file khác
                </button>
              )}
              <button onClick={onClose}
                className="h-9 px-4 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium cursor-pointer transition">
                Hủy
              </button>
              {preview && (
                <button onClick={handleConfirm} disabled={saving || !confirmed}
                  className="h-9 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {saving ? 'Đang tạo...' : `✅ Tạo báo giá (${itemCount} SP)`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Description Detail Popup */}
      {descPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={() => setDescPopup(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="text-sm font-bold text-gray-900">📝 Chi tiết mô tả — {descPopup.name}</h3>
              <button onClick={() => setDescPopup(null)} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer"><X className="h-4 w-4 text-gray-500" /></button>
            </div>
            <div className="p-5">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{descPopup.description}</pre>
            </div>
            <div className="px-5 py-3 border-t bg-gray-50 rounded-b-xl flex justify-end">
              <button onClick={() => setDescPopup(null)} className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
