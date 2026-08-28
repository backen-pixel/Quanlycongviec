import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { Upload, FileSpreadsheet, X, AlertTriangle, Loader2, Eye, ChevronDown, ChevronUp, FileEdit, Briefcase } from 'lucide-react';
import LeadDealPicker from './LeadDealPicker';
import QuotationSourceExcelLink, { uploadQuotationSourceExcel } from './QuotationSourceExcelLink';
import { fetchUploadArrayBuffer } from '../lib/publicFileUrl';

/** Dùng chung với QuotationForm (đọc draft khi from_excel=1) */
export const QUOTATION_EXCEL_DRAFT_KEY = 'quotation_excel_draft_v1';
export const ORDER_EXCEL_DRAFT_KEY = 'order_excel_draft_v1';
export const INVOICE_EXCEL_DRAFT_KEY = 'invoice_excel_draft_v1';

const DOC_TYPE_CONFIG = {
  quotation: {
    title: 'Import báo giá từ Excel',
    subtitle: 'Upload .xlsx → Xem trước → Áp dụng vào form báo giá → Chỉnh sửa → Lưu',
    entityLabel: 'báo giá',
    applyLabel: 'Áp dụng vào báo giá',
    draftKey: QUOTATION_EXCEL_DRAFT_KEY,
    navigatePath: '/crm/quotations/new',
    titlePrefix: 'Báo giá',
    dealAttachHint: 'Báo giá nên gắn vào deal để phân loại theo công ty / khu vực / nhân viên.',
    dealAttachedLabel: 'Báo giá gắn vào deal hiện tại',
  },
  order: {
    title: 'Import đơn hàng từ Excel',
    subtitle: 'Upload .xlsx → Xem trước → Áp dụng vào form đơn hàng → Chỉnh sửa → Lưu',
    entityLabel: 'đơn hàng',
    applyLabel: 'Áp dụng vào đơn hàng',
    draftKey: ORDER_EXCEL_DRAFT_KEY,
    navigatePath: '/crm/orders/new',
    titlePrefix: 'Đơn hàng',
    dealAttachHint: 'Đơn hàng nên gắn vào deal để theo dõi công nợ và sản xuất.',
    dealAttachedLabel: 'Đơn hàng gắn vào deal hiện tại',
  },
  invoice: {
    title: 'Import hóa đơn từ Excel',
    subtitle: 'Upload .xlsx → Xem trước → Áp dụng vào form hóa đơn → Chỉnh sửa → Lưu',
    entityLabel: 'hóa đơn',
    applyLabel: 'Áp dụng vào hóa đơn',
    draftKey: INVOICE_EXCEL_DRAFT_KEY,
    navigatePath: '/crm/invoices/new',
    titlePrefix: 'Hóa đơn',
    dealAttachHint: 'Hóa đơn nên gắn vào deal để đối soát thanh toán.',
    dealAttachedLabel: 'Hóa đơn gắn vào deal hiện tại',
  },
};

/**
 * % chiết khấu hiệu lực của 1 dòng preview — ưu tiên đọc THẲNG từ cột riêng trong Excel
 * (% CHIẾT KHẤU hoặc SỐ TIỀN CHIẾT KHẤU theo dòng), chỉ suy luận từ CK% header nhóm khi
 * Excel không có cột chiết khấu riêng cho dòng đó. Dùng chung cho preview & apply-to-form.
 */
function resolveEffectiveDiscountPercent(item) {
  // Parser (backend/src/helpers/quotationExcelParser.js) đã chốt sẵn CK theo đúng Excel —
  // preview và apply-to-form đều dùng chung số này, không nơi nào suy luận lại nữa.
  if (typeof item.resolved_discount_percent === 'number') return item.resolved_discount_percent;
  if (item.is_freebie) return 0;
  const rowPct = item.row_discount_percent || 0;
  if (rowPct > 0) return rowPct;
  const qty = item.quantity || 1;
  const price = item.unit_price || 0;
  const rowAmt = item.row_discount_amount || 0;
  if (rowAmt > 0 && qty > 0 && price > 0) {
    return Math.round((rowAmt / (qty * price)) * 100000) / 1000;
  }
  const headerCK = item.group_discount_percent || 0;
  const amt = item.amount || 0;
  if (headerCK > 0 && price > 0 && qty > 0 && amt > 0 && amt / (qty * price) < 0.995) {
    return headerCK;
  }
  return 0;
}

/**
 * Từ kết quả parse-excel → payload nội bộ (form + dòng hàng) để đổ vào trang sửa báo giá.
 * (Logic giữ đồng bộ với tính spec_factor / CK / freebie như bản tạo trực tiếp cũ.)
 */
export function buildQuotationDraftFromPreview(preview, file, user, leadId, sourceFile = null, docType = 'quotation') {
  const itemsPayload = preview.items
    .filter((i) => !i.is_group)
    .map((i) => {
      let specFactor = 0;
      let itemDiscount = 0;
      let qty = i.quantity || 1;
      let price = i.unit_price || 0;
      const excelAmount = i.amount || 0;
      const headerCK = i.group_discount_percent || 0;
      // Đọc thẳng từ cột riêng của Excel (nếu mẫu có % CHIẾT KHẤU / SỐ TIỀN CHIẾT KHẤU theo dòng)
      const rowPct = i.row_discount_percent || 0;
      const rowAmt = i.row_discount_amount || 0;
      const hasExplicitDiscountCol = rowPct > 0 || rowAmt > 0;
      const lengthVal = parseFloat(i.length) || 0;

      if (i.is_freebie) {
        itemDiscount = 0;
        specFactor = 0;
        price = 0;
      } else if (typeof i.resolved_discount_percent === 'number') {
        // ── Nguồn sự thật duy nhất: parser đã đọc thẳng CK từ Excel và tách phần chênh lệch
        // định lượng (m² / mét dài / SL lẻ) ra spec_factor. Không suy luận CK từ tỉ lệ nữa —
        // đó chính là chỗ đẻ ra CK ảo kiểu 0,35md → "chiết khấu 65%".
        qty = i.resolved_quantity || qty;
        specFactor = i.resolved_spec_factor || 0;
        itemDiscount = i.resolved_discount_percent;
      } else if (hasExplicitDiscountCol) {
        // Excel có cột % CHIẾT KHẤU / SỐ TIỀN CHIẾT KHẤU riêng cho dòng này → đọc & lấy nguyên,
        // KHÔNG suy luận/tính lại từ tỉ lệ Thành tiền (đúng yêu cầu: import lấy kết quả 100%).
        itemDiscount = resolveEffectiveDiscountPercent(i);
        specFactor = 0;
      } else if (lengthVal > 0 && price > 0 && excelAmount > 0
        && Math.abs(excelAmount - lengthVal * price) / Math.max(excelAmount, lengthVal * price) < 0.015) {
        // Mẫu Md/mét dài: Thành tiền = Dài × Đơn giá (kể cả khi Dài < 1 → không suy thành CK%)
        qty = lengthVal;
        itemDiscount = 0;
        specFactor = 0;
      } else if (price > 0 && qty > 0 && excelAmount > 0) {
        // Không có cột chiết khấu riêng theo dòng → fallback: suy luận từ tỉ lệ Thành tiền / (SL × Đơn giá)
        const rawRatio = excelAmount / (qty * price);
        if (rawRatio > 1.005) {
          specFactor = Math.round(rawRatio * 1000) / 1000;
        } else if (rawRatio >= 0.995) {
          specFactor = 0;
        } else {
          const impliedCK = Math.round((1 - rawRatio) * 100000) / 1000;
          if (headerCK > 0 && Math.abs(impliedCK - headerCK) < 1) {
            itemDiscount = headerCK;
          } else {
            itemDiscount = impliedCK;
          }
          specFactor = 0;
        }
      }

      // ── Khoá amount theo đúng giá trị Excel — tránh recompute làm sai số làm tròn.
      // Khi user chỉnh qty/price/discount_percent/spec_factor trong form, lock sẽ tự bị gỡ
      // (xem updateItem trong QuotationForm). Backend cũng honor lock qua lock_amount.
      const lockedAmount = i.is_freebie ? 0 : (excelAmount > 0 ? excelAmount : null);
      // ── Khoá LUÔN số tiền chiết khấu nếu Excel có cột "SỐ TIỀN CHIẾT KHẤU" riêng —
      // tránh backend tự suy (grossAmount - amount) bị sai khi SL không đúng 1:1 với Thành tiền.
      const lockedDiscountAmount = !i.is_freebie && rowAmt > 0 ? rowAmt : null;

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
        // ── Excel fidelity: giữ NGUYÊN số tiền Excel ──
        imported_amount: lockedAmount,
        lock_amount: lockedAmount !== null,
        imported_discount_amount: lockedDiscountAmount,
        _group_summary_discount_percent: i.group_summary_discount_percent || 0,
      };
    });

  // CK nhóm từ dòng summary Excel (vd. "CHIẾT KHẤU KHÁCH 7%") — áp vào dòng nếu chưa có CK dòng
  // để footer nhóm hiện đúng số tiền CK và cho phép chỉnh sửa.
  {
    const byGroup = new Map();
    itemsPayload.forEach((it, idx) => {
      const g = it.group_name || '';
      if (!g || it.is_freebie) return;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(idx);
    });
    byGroup.forEach((idxs) => {
      const gsd = idxs.map((i) => itemsPayload[i]._group_summary_discount_percent || 0).find((v) => v > 0) || 0;
      if (!(gsd > 0)) return;
      const hasLineCk = idxs.some((i) => (itemsPayload[i].discount_percent || 0) > 0 || (itemsPayload[i].imported_discount_amount || 0) > 0);
      if (hasLineCk) return;
      idxs.forEach((i) => {
        const it = itemsPayload[i];
        itemsPayload[i] = {
          ...it,
          discount_percent: gsd,
          lock_amount: false,
          imported_amount: undefined,
          imported_discount_amount: undefined,
        };
      });
    });
    itemsPayload.forEach((it) => { delete it._group_summary_discount_percent; });
  }

  // Khi locked, itemsGrossTotal = Σ imported_amount (đúng bằng tổng Excel) → discount_value tổng = 0
  const itemsGrossTotal = itemsPayload.reduce((s, i) => {
    if (i.lock_amount && typeof i.imported_amount === 'number') return s + i.imported_amount;
    const f = parseFloat(i.spec_factor) || 0;
    const gross =
      f > 0 ? f * (i.quantity || 1) * (i.unit_price || 0) : (i.quantity || 1) * (i.unit_price || 0);
    const ck = gross * (i.discount_percent || 0) / 100;
    return s + (gross - ck);
  }, 0);
  const excelGrandTotal = preview.summary?.total || 0;
  // Nếu items đã khớp grand total Excel thì KHÔNG cần thêm CK tổng — giữ nguyên 0.
  // (CK nhóm summary đã áp vào dòng ở trên → không cộng lại vào discount_value chứng từ.)
  const computedDiscount =
    excelGrandTotal > 0 && Math.abs(itemsGrossTotal - excelGrandTotal) > 1
      ? Math.round(itemsGrossTotal - excelGrandTotal)
      : 0;

  const notesParts = [];
  if (preview.kts_info) notesParts.push(`KT Phụ trách: ${preview.kts_info}`);
  if (preview.notes) notesParts.push(preview.notes);
  const sum = preview.summary;
  if (sum?.deposit_amount > 0) {
    const rs =
      sum.deposit_received === true ? 'Đã nhận' :
      sum.deposit_received === false ? 'Chưa nhận' : '';
    notesParts.push(
      `Cọc: ${formatVND(sum.deposit_amount)}${rs ? ` — ${rs}` : ''}${sum.deposit_label ? `\n${sum.deposit_label}` : ''}`,
    );
  }
  if (sum?.remaining_note || (sum?.remaining_amount != null && sum.remaining_amount > 0)) {
    notesParts.push(
      `Còn lại: ${sum.remaining_note || '—'}${sum.remaining_amount > 0 ? ` (${formatVND(sum.remaining_amount)})` : ''}`,
    );
  }

  const fileTitle = file?.name?.replace(/\.[^.]+$/, '').trim() || '';
  const cfg = DOC_TYPE_CONFIG[docType] || DOC_TYPE_CONFIG.quotation;

  const todayISO = new Date().toISOString().slice(0, 10);
  const isInvoice = docType === 'invoice';

  return {
    form: {
      title: preview.title || fileTitle || `${cfg.titlePrefix} ${preview.customer_name || ''}`.trim(),
      customer_name: preview.customer_name || '',
      customer_phone: preview.customer_phone || '',
      customer_address: preview.customer_address || '',
      lead_id: leadId || '',
      ...(isInvoice ? { due_date: todayISO } : { valid_until: todayISO }),
      discount_type: 'amount',
      discount_value: computedDiscount,
      notes: notesParts.join('\n\n'),
      payment_terms: 'Thanh toán 40% khi ký HĐ, Thanh toán 60% khi bàn giao',
      approved_by: user?.id || '',
      deposit_amount: sum?.deposit_amount > 0 ? sum.deposit_amount : null,
      deposit_received: sum?.deposit_received === true || sum?.deposit_received === false ? sum.deposit_received : null,
      deposit_label: sum?.deposit_label || '',
      deposit_installments: Array.isArray(sum?.deposit_installments) && sum.deposit_installments.length
        ? sum.deposit_installments
        : (sum?.deposit_amount > 0 || sum?.deposit_label
          ? [{
              amount: sum?.deposit_amount > 0 ? sum.deposit_amount : null,
              received: sum?.deposit_received === true || sum?.deposit_received === false ? sum.deposit_received : null,
              label: sum?.deposit_label || '',
            }]
          : undefined),
      remaining_amount: sum?.remaining_amount > 0 ? sum.remaining_amount : null,
      remaining_note: sum?.remaining_note || '',
      source_excel_file_url: sourceFile?.file_url || '',
      source_excel_file_name: sourceFile?.file_name || file?.name || '',
    },
    items: itemsPayload,
    meta: {
      fileName: file?.name || '',
      sourceFile: sourceFile || null,
      importedAt: new Date().toISOString(),
      requireReviewConfirm: true,
      docType,
    },
  };
}

/** Gắn file Excel đã upload vào mục Ghi chú & Đính kèm của nhiệm vụ CRM. */
async function attachExcelToTaskNotes(taskId, leadId, uploaded) {
  if (!taskId || !leadId || !uploaded?.file_url) return;
  const baseName = (uploaded.file_name || 'Excel báo giá').replace(/\.[^.]+$/, '');
  await api.post(`/crm/leads/${leadId}/tasks/${taskId}/attachments/bulk`, {
    items: [{
      name: baseName,
      doc_type: 'spreadsheet',
      file_url: uploaded.file_url,
      file_name: uploaded.file_name,
      file_size: uploaded.file_size,
      mime_type: uploaded.mime_type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      notes: 'File Excel báo giá (từ nhiệm vụ)',
    }],
  });
}

export default function ExcelQuotationImport({
  dealId, leadId, taskId, onImportDone, onClose, onSourceAttached,
  docType = 'quotation',
  initialFileUrl, initialFileName, initialSourceFile,
  /** Sau khi lưu form CRM, quay về path này (vd. /ketoan/deals/:id). */
  returnTo,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cfg = DOC_TYPE_CONFIG[docType] || DOC_TYPE_CONFIG.quotation;
  const [file, setFile] = useState(null);
  const [sourceFile, setSourceFile] = useState(initialSourceFile || null);
  const [uploadingSource, setUploadingSource] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [loadingInitialFile, setLoadingInitialFile] = useState(!!initialFileUrl);
  const [sheets, setSheets] = useState([]); // { name, rowCount, isQuotation }[]
  const [selectedSheet, setSelectedSheet] = useState('');
  const [preview, setPreview] = useState(null); // parsed data
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandGroups, setExpandGroups] = useState({});
  const [descPopup, setDescPopup] = useState(null); // { name, description }
  const fileRef = useRef(null);
  const attachedSourceUrlRef = useRef(null);

  /** Deal context từ props (mở từ task/lead detail). Pre-fill picker; user vẫn được đổi. */
  const contextLeadId = dealId || leadId || '';
  const [pickedDeal, setPickedDeal] = useState(null);
  const [contextLoading, setContextLoading] = useState(!!contextLeadId);
  const effectiveLeadId = pickedDeal?.id || contextLeadId || '';

  // Khi có contextLeadId từ props → fetch info deal để pre-fill picker
  useEffect(() => {
    let cancelled = false;
    if (!contextLeadId) { setContextLoading(false); return; }
    setContextLoading(true);
    api.get(`/crm/leads/${contextLeadId}/detail`)
      .then((r) => {
        if (cancelled) return;
        const lead = r.data || {};
        setPickedDeal({
          id: lead.id,
          code: lead.code,
          title: lead.title,
          type: lead.type,
          customer_id: lead.customer_id,
          customer_name: lead.customer?.full_name || lead.contact_name || '',
          customer_phone: lead.customer?.phone || lead.phone || '',
          company_id: lead.company_id,
          company_name: lead.company?.short_name || lead.company?.name || null,
          region_id: lead.region_id,
          region_name: lead.crm_region?.name || lead.region?.name || null,
          assignee_name: lead.assignee?.full_name || null,
        });
      })
      .catch(() => { /* ignore — vẫn cho upload */ })
      .finally(() => { if (!cancelled) setContextLoading(false); });
    return () => { cancelled = true; };
  }, [contextLeadId]);

  /** Reset về deal context ban đầu (nếu user lỡ đổi sang deal khác) */
  const restoreContextDeal = () => {
    if (!contextLeadId) return;
    setContextLoading(true);
    api.get(`/crm/leads/${contextLeadId}/detail`)
      .then((r) => {
        const lead = r.data || {};
        setPickedDeal({
          id: lead.id, code: lead.code, title: lead.title, type: lead.type,
          customer_id: lead.customer_id,
          customer_name: lead.customer?.full_name || lead.contact_name || '',
          customer_phone: lead.customer?.phone || lead.phone || '',
          company_id: lead.company_id,
          company_name: lead.company?.short_name || lead.company?.name || null,
          region_id: lead.region_id,
          region_name: lead.crm_region?.name || lead.region?.name || null,
          assignee_name: lead.assignee?.full_name || null,
        });
      })
      .finally(() => setContextLoading(false));
  };

  /** Cảnh báo: user đã đổi sang deal khác với context (vd. khác deal của task đang import) */
  const dealChangedFromContext = contextLeadId && pickedDeal && pickedDeal.id !== contextLeadId;

  const resetExcelImport = () => {
    setError('');
    setFile(null);
    setPreview(null);
    setSourceFile(null);
    setSheets([]);
    setSelectedSheet('');
    setParsing(false);
    setLoadingSheets(false);
    attachedSourceUrlRef.current = null;
    if (fileRef.current) fileRef.current.value = '';
  };

  const doParseSheet = async (f, sheetName) => {
    if (!f) return;
    setParsing(true);
    setPreview(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      if (sheetName) fd.append('sheet_name', sheetName);
      const { data } = await api.post('/crm/quotations/parse-excel', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data);
      if (!sourceFile) {
        setUploadingSource(true);
        try {
          const uploaded = await uploadQuotationSourceExcel(f, effectiveLeadId || 'import');
          setSourceFile(uploaded);
          if (
            uploaded?.file_url
            && taskId
            && effectiveLeadId
            && attachedSourceUrlRef.current !== uploaded.file_url
          ) {
            try {
              await attachExcelToTaskNotes(taskId, effectiveLeadId, uploaded);
              attachedSourceUrlRef.current = uploaded.file_url;
              onSourceAttached?.(taskId);
            } catch (attachErr) {
              console.warn('[excel-import] attach to task notes:', attachErr);
            }
          }
        } catch (upErr) {
          console.warn('[excel-import] upload source file:', upErr);
        } finally {
          setUploadingSource(false);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi đọc file');
    }
    setParsing(false);
  };

  const processFile = async (f, { keepSourceFile = false } = {}) => {
    if (!f) return;
    if (!f.name.match(/\.(xlsx?|csv)$/i)) {
      setError('Chỉ hỗ trợ file .xlsx, .xls');
      return;
    }
    setFile(f);
    if (!keepSourceFile) setSourceFile(null);
    setError('');
    setPreview(null);
    setSheets([]);
    setSelectedSheet('');
    setLoadingSheets(true);

    try {
      const fd = new FormData();
      fd.append('file', f);
      const { data } = await api.post('/crm/quotations/excel-sheets', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const list = data.sheets || [];
      setSheets(list);
      if ((data.totalSheets || list.length) <= 1) {
        const name = list[0]?.name || data.defaultSheet;
        if (name) await doParseSheet(f, name);
      } else {
        setSelectedSheet(data.defaultSheet || list[0]?.name || '');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Lỗi đọc file');
    }
    setLoadingSheets(false);
  };

  const handleFileSelect = async (e) => {
    const f = e.target.files?.[0];
    if (f) await processFile(f);
  };

  /** Nạp sẵn file Excel đã có trong Tài liệu (không cần chọn lại thủ công). */
  useEffect(() => {
    if (!initialFileUrl) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingInitialFile(true);
        setError('');
        const buf = await fetchUploadArrayBuffer(initialFileUrl);
        if (cancelled) return;
        const name = initialFileName || 'tai-lieu-excel.xlsx';
        const f = new File([buf], name, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        await processFile(f, { keepSourceFile: !!initialSourceFile });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Không tải được file Excel đã chọn');
      } finally {
        if (!cancelled) setLoadingInitialFile(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFileUrl]);

  /** Đưa dữ liệu sang form BG/ĐH/HĐ để chỉnh sửa; chỉ khi bấm Lưu mới tạo bản ghi. */
  const handleApplyToQuotationForm = () => {
    if (!preview) return;
    setSaving(true);
    try {
      const resolvedLead = effectiveLeadId || '';
      const draft = buildQuotationDraftFromPreview(preview, file, user, resolvedLead, sourceFile, docType);
      const payload = { version: 1, ...draft };
      const draftKey = cfg.draftKey;

      // Cách CHÍNH: truyền draft qua history state — in-memory, không đụng quota Storage.
      // sessionStorage chỉ là fallback cho F5; nếu hết quota → bỏ qua, vẫn import được.
      const serialized = JSON.stringify(payload);
      try {
        sessionStorage.removeItem(draftKey);
      } catch (_) { /* ignore */ }
      try {
        sessionStorage.setItem(draftKey, serialized);
      } catch (storageErr) {
        // QuotaExceededError → dọn các key dễ phình, thử lại 1 lần. Vẫn lỗi thì kệ — đã có history state.
        try {
          sessionStorage.removeItem('crm_pipeline_ui_v1');
        } catch (_) { /* ignore */ }
        try {
          sessionStorage.setItem(draftKey, serialized);
        } catch (_) { /* ignore — fallback dùng history state */ }
        console.warn('[excel-import] sessionStorage quota exceeded; using router state fallback', storageErr);
      }

      const q = new URLSearchParams();
      q.set('from_excel', '1');
      if (resolvedLead) q.set('lead_id', resolvedLead);
      if (returnTo && typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        q.set('return_to', returnTo);
      }
      navigate(`${cfg.navigatePath}?${q.toString()}`, { state: { excelDraft: payload } });
      onClose?.();
      if (onImportDone) {
        try {
          onImportDone({ draft_only: true, docType });
        } catch (_) {}
      }
    } catch (e) {
      setError(e?.message || 'Không đưa được dữ liệu sang form');
    }
    setSaving(false);
  };

  const toggleGroup = (name) => {
    setExpandGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const itemCount = preview?.items?.filter(i => !i.is_group).length || 0;
  const groupCount = preview?.items?.filter(i => i.is_group).length || 0;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const modal = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10050] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="excel-import-title"
    >
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 id="excel-import-title" className="text-lg font-bold text-gray-900">{cfg.title}</h2>
              <p className="text-xs text-gray-500">{cfg.subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Block deal liên kết — LUÔN hiện picker; pre-fill từ context (task/lead) nếu có */}
          {!preview && (
            <div className={`rounded-xl p-4 border ${pickedDeal ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${pickedDeal ? 'text-emerald-900' : 'text-amber-900'}`}>
                <Briefcase className="h-4 w-4" />
                {contextLeadId
                  ? (dealChangedFromContext ? 'Bạn đã đổi sang deal khác' : cfg.dealAttachedLabel)
                  : (pickedDeal ? 'Đã chọn deal liên kết' : 'Chọn deal trước khi import')}
              </h3>
              <p className="text-[11px] mt-1 text-gray-700">
                {contextLeadId && !dealChangedFromContext
                  ? `Đang mở từ ${taskId ? 'nhiệm vụ' : 'deal'} hiện tại — ${cfg.entityLabel} sẽ tự gắn deal này. Có thể đổi sang deal khác bên dưới nếu cần.`
                  : `${cfg.dealAttachHint} Có thể bỏ qua nếu thực sự không gắn deal nào (sẽ bị đánh dấu "mồ côi" trong danh sách).`}
              </p>

              <div className="mt-3 space-y-2">
                {contextLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Đang tải thông tin deal hiện tại…
                  </div>
                ) : (
                  <LeadDealPicker
                    value={pickedDeal}
                    onChange={setPickedDeal}
                    type="deal"
                    placeholder="Tìm deal theo mã / tên / SĐT khách..."
                    warnOrphan
                  />
                )}

                {dealChangedFromContext && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-100 border border-amber-300 rounded-lg text-[11px] text-amber-900">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Bạn đang gắn báo giá vào deal khác với deal/nhiệm vụ ban đầu — kiểm tra kỹ trước khi áp dụng.
                    </span>
                    <button
                      type="button"
                      onClick={restoreContextDeal}
                      className="text-[11px] underline text-amber-800 hover:text-amber-950 cursor-pointer font-medium"
                    >
                      ↺ Quay về deal ban đầu
                    </button>
                  </div>
                )}

                {taskId && (
                  <p className="text-[10px] text-gray-500">📌 Liên kết task: <span className="font-mono">{taskId}</span></p>
                )}
              </div>
            </div>
          )}

          {/* Đang tự tải file Excel có sẵn (mở từ Tài liệu deal) */}
          {loadingInitialFile && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mr-3" />
              <p className="text-sm text-gray-600">Đang tải file Excel đã chọn từ tài liệu…</p>
            </div>
          )}

          {/* Upload area */}
          {!loadingInitialFile && !preview && !parsing && !loadingSheets && sheets.length <= 1 && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all"
            >
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">Kéo thả hoặc click để chọn file Excel</p>
              <p className="text-xs text-gray-400 mt-1">Hỗ trợ .xlsx, .xls (tối đa 10MB)</p>
              {file && (
                <p className="text-xs text-blue-600 mt-2 font-medium">📄 {file.name}</p>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            </div>
          )}

          {/* Đang liệt kê sheet */}
          {!loadingInitialFile && loadingSheets && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mr-3" />
              <p className="text-sm text-gray-600">Đang đọc danh sách sheet…</p>
            </div>
          )}

          {/* Chọn sheet (file có nhiều sheet) */}
          {!preview && sheets.length > 1 && !parsing && !loadingSheets && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-800">
                File có {sheets.length} sheet — chọn sheet làm báo giá:
              </p>
              {file && (
                <p className="text-xs text-gray-500">📄 {file.name}</p>
              )}
              <div className="max-h-60 overflow-auto space-y-1">
                {sheets.map((s) => (
                  <label
                    key={s.name}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border ${
                      selectedSheet === s.name
                        ? 'bg-blue-50 border-blue-300'
                        : 'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="excel-sheet"
                      checked={selectedSheet === s.name}
                      onChange={() => setSelectedSheet(s.name)}
                      className="shrink-0"
                    />
                    <span className="flex-1 text-sm font-medium text-gray-900">{s.name}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{s.rowCount} dòng</span>
                    {s.isQuotation && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full shrink-0">
                        Có vẻ là báo giá
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetExcelImport}
                  className="h-9 px-4 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={!selectedSheet || parsing}
                  onClick={() => void doParseSheet(file, selectedSheet)}
                  className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Đọc sheet này
                </button>
              </div>
            </div>
          )}

          {/* Parsing */}
          {parsing && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mr-3" />
              <p className="text-sm text-gray-600">Đang đọc sheet Excel…</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
              <button
                type="button"
                onClick={resetExcelImport}
                className="text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer"
              >
                Thử lại
              </button>
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
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="bg-gray-100 px-3 py-1.5 rounded-full font-medium">📋 {itemCount} sản phẩm</span>
                {groupCount > 0 && <span className="bg-purple-100 text-purple-700 px-3 py-1.5 rounded-full font-medium">📂 {groupCount} nhóm</span>}
                <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full font-medium">💰 {formatVND(preview.summary?.total || preview.summary?.subtotal || 0)}</span>
                {preview.summary?.deposit_amount > 0 && (
                  <span className="bg-rose-100 text-rose-800 px-3 py-1.5 rounded-full font-medium border border-rose-200" title={preview.summary?.deposit_label || ''}>
                    💵 Cọc {formatVND(preview.summary.deposit_amount)}
                    {preview.summary?.deposit_received === true ? ' · Đã nhận' : ''}
                    {preview.summary?.deposit_received === false ? ' · Chưa nhận' : ''}
                  </span>
                )}
                {(preview.summary?.remaining_note || preview.summary?.remaining_amount > 0) && (
                  <span className="bg-slate-100 text-slate-800 px-3 py-1.5 rounded-full font-medium max-w-[min(100%,280px)] truncate" title={preview.summary?.remaining_note || ''}>
                    📌 Còn lại
                    {preview.summary?.remaining_amount > 0 ? `: ${formatVND(preview.summary.remaining_amount)}` : ''}
                  </span>
                )}
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
                            const amt = item.amount || 0;
                            const isFreebie = item.is_freebie;
                            const effectiveCK = resolveEffectiveDiscountPercent(item);
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

              {/* File gốc — mở xem */}
              <div className="flex flex-wrap items-center gap-2">
                {uploadingSource && (
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu file gốc…
                  </span>
                )}
                <QuotationSourceExcelLink
                  fileUrl={sourceFile?.file_url}
                  fileName={sourceFile?.file_name || file?.name}
                />
                {!sourceFile?.file_url && file && !uploadingSource && (
                  <span className="text-[10px] text-amber-700">Chưa lưu được bản sao file — vẫn có thể áp dụng số liệu vào báo giá.</span>
                )}
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
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {!preview
                ? 'Chọn file Excel để bắt đầu'
                : '✅ Sau khi áp dụng, tick xác nhận đã kiểm tra số liệu trên trang chỉnh sửa báo giá rồi mới Lưu'}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {preview && sheets.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="h-9 px-4 border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-medium cursor-pointer transition"
                >
                  Đổi sheet khác
                </button>
              )}
              {preview && (
                <button
                  type="button"
                  onClick={resetExcelImport}
                  className="h-9 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium cursor-pointer transition"
                >
                  🔄 Chọn file khác
                </button>
              )}
              <button onClick={onClose}
                className="h-9 px-4 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium cursor-pointer transition">
                Hủy
              </button>
              {preview && (
                <button
                  type="button"
                  onClick={() => void handleApplyToQuotationForm()}
                  disabled={saving}
                  className="h-9 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileEdit className="h-4 w-4" />}
                  {saving ? 'Đang mở…' : `${cfg.applyLabel} (${itemCount} dòng)`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Description Detail Popup */}
      {descPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10060] p-4" onClick={() => setDescPopup(null)}>
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

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
