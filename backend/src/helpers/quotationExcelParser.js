/**
 * Parse Excel báo giá — dùng chung cho API /quotations/parse-excel và auto ghi chú Drive.
 */
const XLSX = require('xlsx');
const { parseVietnameseMoney, parseVietnameseMeasure, parseExcelMoneyFromMappedColumn } = require('./excelVnNumbers');

/** Quét ô «ĐÃ NHẬN» / «CHƯA NHẬN» trên dòng Cọc (mẫu báo giá Phúc Đạt). */
function parseExcelDepositReceivedFromRow(row) {
  const blob = (row || []).map((c) => String(c ?? '').trim()).filter(Boolean).join(' ');
  if (/\bĐÃ\s*(NHẬN|THU|ĐÓNG)\b/i.test(blob)) return true;
  if (/\bCHƯA\s*(NHẬN|THU|ĐÓNG)\b/i.test(blob)) return false;
  return null;
}

/** Dòng tiền Cọc / Còn lại — không có chữ TỔNG/CỘNG (tránh trùng với dòng tổng hạng mục). */
function isExcelDepositOrRemainSummaryRow(name, stt, fullRowText) {
  const bundle = `${name || ''} ${stt || ''} ${fullRowText || ''}`.trim();
  if (!bundle) return false;
  const u = bundle.toUpperCase();
  if (/\bTỔNG\b/.test(u) || /\bCỘNG\b/.test(u)) return false;
  return /\bCỌC\b/.test(u) || /\bCÒN\s*LẠI\b/.test(u);
}

/**
 * Nhận diện ô/dòng Excel là thông tin liên hệ NVKD — KT… (không gán SĐT này vào khách hàng).
 * Tránh nhầm khi mẫu có "SĐT" / "Số điện thoại" gắn với phụ trách.
 */
function excelHeaderTextIsStaffContactContext(upper) {
  const u = String(upper || '').trim().toUpperCase();
  if (!u) return false;
  if (/KHÁCH\s*HÀNG|KHACH\s*HANG|SĐT\s*KH\b|SDT\s*KH\b|LIÊN\s*HỆ\s*KH|LIÊN\s*LẠC\s*KH/i.test(u)) return false;
  if (u.includes('NVKD') || u.includes('NV KD') || u.includes('PHỤ TRÁCH KD')) return true;
  if (u.includes('KT PHỤ TRÁCH') || u.includes('KỸ THUẬT PHỤ TRÁCH') || u.includes('KĨ THUẬT PHỤ TRÁCH')) return true;
  if (u.includes('NGƯỜI PHỤ TRÁCH') || u.includes('NGUOI PHU TRACH')) return true;
  if (u.includes('LIÊN HỆ NV') || u.includes('LIEN HE NV')) return true;
  if (/^SĐT\s*(NVKD|NV|KD|KT)\b/i.test(u) || /^SDT\s*(NVKD|NV|KD|KT)\b/i.test(u)) return true;
  if (/SỐ\s*ĐIỆN\s*THOẠI/i.test(u) && (u.includes('NVKD') || u.includes('PHỤ TRÁCH') || u.includes('KỸ THUẬT') || u.includes('KĨ THUẬT'))) return true;
  return false;
}

function excelRowLooksLikeStaffPhoneContext(rowArr) {
  const blob = (rowArr || []).map((c) => String(c ?? '').trim().toUpperCase()).filter(Boolean).join(' | ');
  return excelHeaderTextIsStaffContactContext(blob);
}

/** Nhận diện mẫu Excel báo giá Bao Bì NextGo (cột QUY CÁCH SẢN PHẨM / header công ty NextGo). */
function excelDetectNextGoQuotationFormat(rows, headerIdx) {
  if (headerIdx >= 0) {
    const hdr = (rows[headerIdx] || []).map((c) => String(c || '').trim().toUpperCase()).join(' ');
    if (hdr.includes('QUY CÁCH') || hdr.includes('QUY CACH')) return true;
  }
  const scanUntil = headerIdx >= 0 ? headerIdx : Math.min(rows.length, 15);
  for (let i = 0; i < scanUntil; i++) {
    const blob = (rows[i] || []).map((c) => String(c || '').trim().toUpperCase()).join(' ');
    if (blob.includes('NEXTGO') || blob.includes('BAO BÌ NEXTGO') || blob.includes('BAO BI NEXTGO')) return true;
  }
  return false;
}

/** Row có giống header báo giá (STT + HẠNG MỤC / TÊN HÀNG) — dùng cho excel-sheets + parse-excel. */
function excelLooksLikeHeaderRow(rowArr) {
  const upper = (rowArr || []).map((c) => String(c || '').trim().toUpperCase());
  const hasStt = upper.some((c) => c === 'STT' || c === 'TT');
  const hasName = upper.some(
    (c) =>
      (c.includes('HẠNG MỤC') || c.includes('TÊN HÀNG') || c.includes('TÊN SẢN PHẨM') ||
        c.includes('NỘI DUNG') || c.includes('MÃ HÀNG'))
      && !c.includes('DIỄN GIẢI'),
  );
  return hasStt && hasName;
}

function resolveExcelWorksheet(wb, sheetName) {
  const names = wb.SheetNames || [];
  if (!names.length) return { sheetName: null, ws: null };
  const requested = String(sheetName || '').trim();
  const resolved = requested && names.includes(requested) ? requested : names[0];
  return { sheetName: resolved, ws: wb.Sheets[resolved] };
}

function listQuotationExcelSheets(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false });
  const names = wb.SheetNames || [];
  if (!names.length) throw new Error('File không có sheet');
  const sheets = names.map((name) => {
    const ws = wb.Sheets[name];
    const rows = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) : [];
    const rowCount = rows.length;
    const isQuotation = rows.slice(0, 30).some((r) => excelLooksLikeHeaderRow(r || []));
    return { name, rowCount, isQuotation };
  });
  const defaultSheet = sheets.find((s) => s.isQuotation)?.name || sheets[0]?.name || null;
  return { sheets, defaultSheet, totalSheets: sheets.length };
}

async function parseQuotationExcelBuffer(buffer, options = {}) {
  try {
    if (!buffer || !Buffer.isBuffer(buffer)) throw new Error('Chưa có buffer file');

    // cellFormula:false → chỉ đọc cached value, không parse/tính lại công thức Excel
    const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false });
    const { sheetName: parsedSheetName, ws } = resolveExcelWorksheet(wb, options.sheetName || options.sheet_name);
    if (!ws) throw new Error('File không có sheet');
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

    if (!rows.length) throw new Error('File rỗng');

    // ── 1. Detect header row ──
    // Helper: từ 1 row (đã upper-cased) build colMap; row2 (nếu có) là sub-header (merge cell "Quy Cách"…).
    // Format mới (Vạn Phú Thành): có thêm DIỄN GIẢI HẠNG MỤC, ĐƠN GIÁ SAU CHIẾT KHẤU, SỐ TIỀN CHIẾT KHẤU,
    // % CHIẾT KHẤU per-row, MÃ HÀNG, SỐ LƯỢNG. Phải tránh ghi đè name bằng "DIỄN GIẢI HẠNG MỤC".
    function buildColMap(headerRow, subRow) {
      const cm = {};
      const upper = headerRow.map(c => String(c || '').trim().toUpperCase());
      // Pass thứ tự ưu tiên: description → name → các cột khác (để DIỄN GIẢI HẠNG MỤC không match name)
      upper.forEach((label, ci) => {
        if (!label) return;
        if (
          label.includes('DIỄN GIẢI') || label.includes('MÔ TẢ') || label.includes('CHI TIẾT') ||
          label.includes('QUY CÁCH') || label.includes('QUY CACH')
        ) {
          if (cm.description === undefined) cm.description = ci;
        }
      });
      upper.forEach((label, ci) => {
        if (!label) return;
        if (label === 'STT' || label === 'TT') {
          if (cm.stt === undefined) cm.stt = ci;
        } else if (
          (label.includes('HẠNG MỤC') || label.includes('TÊN HÀNG') ||
           label.includes('TÊN SẢN PHẨM') || label === 'TÊN SP' || label.includes('NỘI DUNG'))
          && !label.includes('DIỄN GIẢI') && !label.includes('MÔ TẢ') && !label.includes('CHI TIẾT')
        ) {
          if (cm.name === undefined) cm.name = ci;
        } else if (label.includes('MÃ HÀNG') || label === 'MÃ SP' || label.includes('MÃ SẢN PHẨM')) {
          if (cm.sku === undefined) cm.sku = ci;
        } else if (label === 'ĐVT' || label.includes('ĐƠN VỊ')) {
          if (cm.unit === undefined) cm.unit = ci;
        } else if (label.includes('KHỐI LƯỢNG') || label.includes('SỐ LƯỢNG') || label === 'SL' || label === 'KL') {
          if (cm.quantity === undefined) cm.quantity = ci;
        } else if (label.includes('NGANG') || (label.includes('DÀI') && !label.includes('BẢO'))) {
          if (cm.length === undefined) cm.length = ci;
        } else if (label.includes('SÂU') || label.includes('RỘNG')) {
          if (cm.width === undefined) cm.width = ci;
        } else if (label.includes('CAO') && !label.includes('CHIẾT') && !label.includes('CK')) {
          if (cm.height === undefined) cm.height = ci;
        } else if (
          label.includes('% CHIẾT KHẤU') || label.includes('%CHIẾT KHẤU') ||
          (label.includes('CHIẾT KHẤU') && (label.includes('%') || label === 'CK%')) ||
          label === '%CK' || label === '% CK'
        ) {
          if (cm.discount_percent === undefined) cm.discount_percent = ci;
        } else if (
          label.includes('ĐƠN GIÁ') &&
          !label.includes('SAU') && !label.includes('SỐ TIỀN') && !label.includes('CHIẾT KHẤU')
        ) {
          if (cm.unit_price === undefined) cm.unit_price = ci;
        } else if (label.includes('THÀNH TIỀN') || label.includes('T.TIỀN') || label.includes('TT (VNĐ)')) {
          if (cm.amount === undefined) cm.amount = ci;
        } else if (label.includes('GHI CHÚ') || label.includes('NOTE')) {
          if (cm.notes === undefined) cm.notes = ci;
        } else if (label.includes('VAT') || label.includes('THUẾ')) {
          if (cm.vat_rate === undefined) cm.vat_rate = ci;
        }
      });

      // Sub-header (merge cell QUY CÁCH → NGANG/SÂU/CAO). Cho phép override length nếu super-header
      // chỉ là "DÀI (m)" đơn lẻ và sub-row có cả NGANG: ưu tiên NGANG.
      let subAdvance = false;
      if (subRow && subRow.length) {
        const subUpper = subRow.map(c => String(c || '').trim().toUpperCase());
        subUpper.forEach((label, ci) => {
          if (!label) return;
          if (label.includes('NGANG')) {
            cm.length = ci; subAdvance = true;
          } else if (label.includes('SÂU') || label.includes('RỘNG')) {
            if (cm.width === undefined || cm.width === ci) cm.width = ci;
            subAdvance = true;
          } else if (label.includes('CAO') && !label.includes('CHIẾT') && !label.includes('CK')) {
            if (cm.height === undefined || cm.height === ci) cm.height = ci;
            subAdvance = true;
          } else if ((label.includes('KHỐI LƯỢNG') || label.includes('SỐ LƯỢNG') || label === 'SL' || label === 'KL') && cm.quantity === undefined) {
            cm.quantity = ci; subAdvance = true;
          } else if ((label.includes('% CHIẾT KHẤU') || label === 'CK%' || label === '%CK') && cm.discount_percent === undefined) {
            cm.discount_percent = ci; subAdvance = true;
          }
        });
      }
      return { cm, subAdvance };
    }

    let headerIdx = -1;
    let colMap = {};
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      if (!excelLooksLikeHeaderRow(rows[i] || [])) continue;
      const { cm, subAdvance } = buildColMap(rows[i], rows[i + 1] || []);
      colMap = cm;
      headerIdx = subAdvance ? i + 1 : i;
      break;
    }
    if (headerIdx < 0) return res.status(400).json({ error: 'Không tìm thấy dòng tiêu đề (cần có STT + HẠNG MỤC)' });
    const isNextGoFormat = excelDetectNextGoQuotationFormat(rows, headerIdx);
    console.log('[parse-excel] sheet:', parsedSheetName, 'headerIdx:', headerIdx, 'format:', isNextGoFormat ? 'nextgo' : 'default', 'colMap:', JSON.stringify(colMap));

    // ── Fill merged cells trong cột DIỄN GIẢI / GHI CHÚ / TÊN SP / STT ──
    // Excel cho phép 1 ô mô tả gộp nhiều dòng sản phẩm. `sheet_to_json` chỉ giữ
    // giá trị ô đầu, các ô dưới rỗng → fan-out giá trị xuống các dòng con để mỗi
    // sản phẩm đều mang theo mô tả/ghi chú/tên nhóm (mẫu NextGo: STT + Tên SP merge dọc).
    const wsMerges = Array.isArray(ws['!merges']) ? ws['!merges'] : [];
    const mergeFanOutCols = [];
    if (colMap.description !== undefined) mergeFanOutCols.push(colMap.description);
    if (colMap.notes !== undefined) mergeFanOutCols.push(colMap.notes);
    if (colMap.name !== undefined) mergeFanOutCols.push(colMap.name);
    if (colMap.stt !== undefined) mergeFanOutCols.push(colMap.stt);
    if (wsMerges.length && mergeFanOutCols.length) {
      let filledDesc = 0;
      for (const m of wsMerges) {
        if (!m || !m.s || !m.e) continue;
        if (m.s.r === m.e.r) continue; // chỉ xử lý merge dọc
        if (m.e.r <= headerIdx) continue; // bỏ qua merge ở vùng header/khách hàng
        const col = m.s.c;
        if (!mergeFanOutCols.includes(col)) continue;
        const topRow = rows[m.s.r];
        if (!topRow) continue;
        const val = topRow[col];
        if (val === undefined || val === null || String(val).trim() === '') continue;
        for (let rr = Math.max(m.s.r + 1, headerIdx + 1); rr <= m.e.r; rr++) {
          if (!rows[rr]) continue;
          const cur = rows[rr][col];
          if (cur === undefined || cur === null || String(cur).trim() === '') {
            rows[rr][col] = val;
            filledDesc += 1;
          }
        }
      }
      if (filledDesc > 0) console.log('[parse-excel] merged-cell fan-out:', filledDesc, 'cell(s)');
    }

    // ── 2. Extract customer info — parse each cell separately ──
    let customer_name = '', customer_phone = '', customer_address = '', kts_info = '', title = '';
    for (let i = 0; i < headerIdx; i++) {
      // Check each cell individually for better parsing
      for (let ci = 0; ci < (rows[i]?.length || 0); ci++) {
        const cell = String(rows[i][ci] || '').trim();
        if (!cell) continue;
        const cellUpper = cell.toUpperCase();

        // Skip company headers
        if (cellUpper.includes('CÔNG TY') || cellUpper.includes('HOTLINE') || cellUpper.includes('MST') || cellUpper.includes('WEBSITE') || cellUpper.includes('WWW.')) continue;

        // KT Phụ trách (detect before customer to avoid mixing).
        // "PHỤ TRÁCH KD" (format Vạn Phú Thành) cũng rơi vào nhánh này.
        if (cellUpper.includes('KT PHỤ TRÁCH') || cellUpper.includes('KỸ THUẬT PHỤ TRÁCH') ||
            cellUpper.includes('KĨ THUẬT PHỤ TRÁCH') || cellUpper.includes('NVKD') ||
            cellUpper.includes('PHỤ TRÁCH KD')) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) kts_info = match[1].replace(/[-–]\s*(0\d{8,10})/, ' - $1').trim();
          else kts_info = cell;
          continue;
        }
        if (excelHeaderTextIsStaffContactContext(cellUpper)) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) kts_info = match[1].replace(/[-–]\s*(0\d{8,10})/, ' - $1').trim();
          else kts_info = cell;
          continue;
        }

        // Customer name — label "Khách hàng:" / "Tên khách hàng;" (Vạn Phú Thành dùng `;`)
        // NextGo: "Kính gửi:" cũng chứa tên khách
        if (
          cellUpper.includes('KHÁCH HÀNG') || cellUpper.includes('KHACH HANG') ||
          cellUpper.includes('KÍNH GỬI') || cellUpper.includes('KINH GUI')
        ) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) {
            let namePart = match[1].trim();
            // Bỏ đoạn NVKD / phụ trách / … (tránh lấy SĐT nhân viên làm SĐT khách)
            namePart = namePart.replace(
              /\s*(;|,|[-–])\s*(NVKD|NV\s*KD|PHỤ\s*TRÁCH\s*KD|PHỤ\s*TRÁCH\s*(NV|KINH\s*DOANH)|KT\s*(PHỤ\s*TRÁCH)?|KĨ?\s*THUẬT|NGƯỜI\s*PHỤ\s*TRÁCH|LIÊN\s*HỆ\s*NV)\s*[:;]?\s*.*$/i,
              '',
            ).trim();
            // Remove KT info if embedded
            namePart = namePart.replace(/\s*[-–]?\s*(Kĩ|Kỹ|KT)\s*(Thuật|thuật)?\s*(Phụ|phụ)\s*(Trách|trách)\s*[:]\s*.*/i, '').trim();
            // Extract phone from name
            const phoneMatch = namePart.match(/(0\d{8,10})/);
            if (phoneMatch) {
              customer_phone = phoneMatch[1];
              customer_name = namePart.replace(phoneMatch[0], '').replace(/[-–\s]+$/, '').trim();
            } else {
              customer_name = namePart;
            }
          }
          continue;
        }

        // Address
        if (cellUpper.includes('ĐỊA CHỈ') || cellUpper.includes('ĐC:')) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) {
            let addr = match[1].trim();
            // Remove phone if embedded in address
            addr = addr.replace(/\s*(SĐT|SDT|ĐT)\s*[:;]\s*0\d{8,10}/i, '').trim();
            customer_address = addr;
          }
          continue;
        }

        // SĐT standalone cell — chỉ gán khách khi nhãn không phải SĐT NVKD / phụ trách…
        if (cellUpper.includes('SĐT') || cellUpper.includes('SDT') || cellUpper.includes('ĐT:')) {
          const phoneMatch = cell.match(/(0\d{8,10})/);
          if (phoneMatch) {
            if (excelHeaderTextIsStaffContactContext(cellUpper)) {
              const tail = cell.replace(/^\s*(SỐ\s*ĐIỆN\s*THOẠI|SĐT|SDT|ĐT)\s*[:;]?\s*/i, '').trim();
              if (kts_info && !kts_info.includes(phoneMatch[1])) kts_info += ` — ${tail || phoneMatch[1]}`;
              else if (!kts_info) kts_info = tail || phoneMatch[1];
            } else if (!customer_phone) {
              customer_phone = phoneMatch[1];
            } else if (phoneMatch[1] !== customer_phone && !kts_info.includes(phoneMatch[1])) {
              if (kts_info) kts_info += ` — ${phoneMatch[1]}`;
              else kts_info = phoneMatch[1];
            }
          }
          continue;
        }

        // Phone in cell (not company phone) — nếu cùng dòng có nhãn NVKD/Phụ trách thì gắn vào KT/NVKD
        if (/^0\d{8,10}$/.test(cell)) {
          if (!customer_phone && excelRowLooksLikeStaffPhoneContext(rows[i])) {
            if (kts_info && !kts_info.includes(cell)) kts_info += ` — ${cell}`;
            else if (!kts_info) kts_info = cell;
          } else if (!customer_phone) {
            customer_phone = cell;
          }
          continue;
        }

        // Title (BÁO GIÁ...)
        if (cellUpper.includes('BÁO GIÁ') && !title) {
          title = cell;
          continue;
        }
      }
    }

    // ── 3. Parse items — stop at GHI CHÚ / notes section ──
    const items = [];
    let currentGroup = '';
    let currentProductName = ''; // NextGo: tên SP merge dọc — dòng con kế thừa
    let lastProductDesc = ''; // NextGo: quy cách ở dòng đầu, các dòng SL khác kế thừa
    let currentGroupDiscount = 0; // CK% từ header nhóm
    let summaryRows = []; // collect all TỔNG/CK rows
    let reachedNotes = false;
    let notesText = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => !c && c !== 0)) continue;

      // ── Mini-header lặp lại trong body (vd. format Vạn Phú Thành: row 17 cho section II,
      // row 23 cho section III có "MÃ HÀNG / Số Lượng"). Strategy:
      //   1) override các role trong newCm,
      //   2) clear bất kỳ role cũ nào đang trỏ vào col index đã được newCm gán role khác
      //      (vd. section III col E = "Số Lượng" → role length cũ ở col 4 phải bị xoá).
      if (excelLooksLikeHeaderRow(row)) {
        const { cm: newCm, subAdvance: newSub } = buildColMap(row, rows[i + 1] || []);
        const merged = { ...colMap, ...newCm };
        const newColsByIdx = {};
        for (const [role, idx] of Object.entries(newCm)) {
          if (typeof idx === 'number') newColsByIdx[idx] = role;
        }
        for (const role of Object.keys(merged)) {
          const idx = merged[role];
          if (typeof idx === 'number' && newColsByIdx[idx] && newColsByIdx[idx] !== role) {
            delete merged[role];
          }
        }
        colMap = merged;
        if (newSub) i += 1;
        console.log('[parse-excel] re-detected mini-header at row', i, 'colMap:', JSON.stringify(colMap));
        continue;
      }

      const stt = colMap.stt !== undefined ? String(row[colMap.stt] || '').trim() : '';
      const nameRaw = colMap.name !== undefined ? String(row[colMap.name] || '').trim() : '';
      const skuRaw = colMap.sku !== undefined ? String(row[colMap.sku] || '').trim() : '';
      const descEarly = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';
      if (nameRaw) {
        if (nameRaw !== currentProductName) lastProductDesc = '';
        currentProductName = nameRaw;
      }
      // Nếu có cả MÃ HÀNG + TÊN SẢN PHẨM (section III) → name = TÊN, prefix mã vào notes/description bên dưới.
      const name = nameRaw || (isNextGoFormat && currentProductName ? currentProductName : '') || skuRaw;
      const nameUpper = name.toUpperCase();

      // Collect all text from this row
      const fullRowText = row.map(c => String(c || '').trim()).filter(Boolean).join(' ');

      // Debug first 25 data rows
      if (i - headerIdx <= 25) {
        console.log(`[parse-excel] row ${i}: stt=[${stt}] name=[${name?.slice(0,30)}] cells=`, JSON.stringify(row.slice(0, 10)));
      }
      const fullRowUpper = fullRowText.toUpperCase();

      // Detect "GHI CHÚ" / notes section → stop parsing items, collect notes
      const isNotesSection = nameUpper === 'GHI CHÚ' || nameUpper.startsWith('GHI CHÚ:') || 
        fullRowUpper === 'GHI CHÚ' || stt.toUpperCase().startsWith('GHI CHÚ') ||
        fullRowUpper.startsWith('GHI CHÚ') || fullRowUpper.startsWith('LƯU Ý') ||
        fullRowUpper.startsWith('ĐIỀU KHOẢN') || fullRowUpper.startsWith('QUY ĐỊNH');
      if (isNotesSection) {
        reachedNotes = true;
        // Include this row's text as first note line (if has content beyond "GHI CHÚ")
        const noteContent = fullRowText.replace(/^GHI\s*CHÚ:?\s*/i, '').trim();
        if (noteContent) notesText.push(noteContent);
        continue;
      }
      if (reachedNotes) {
        if (fullRowText) notesText.push(fullRowText);
        continue;
      }

      // ── IMPORTANT: Detect GROUP HEADERS before summary rows ──
      // Group headers like "II. PHỤ KIỆN - CHIẾT KHẤU 35%" contain "CHIẾT KHẤU"
      // which would wrongly match summary detection. Check Roman numeral first.
      const sttUpper = stt.toUpperCase();
      const sttIsNumber = /^\d/.test(stt);
      const workingNameEarly = name || (!sttIsNumber && stt ? stt : '') || '';
      const isRomanGroupEarly = /^[IVX]+[\.\)\s]/.test(workingNameEarly) || /^[IVX]+[\.\)\s]/.test(fullRowText.trim());
      const hasUnitEarly = colMap.unit !== undefined && String(row[colMap.unit] || '').trim();
      const hasPriceEarly = parseExcelMoneyFromMappedColumn(row, colMap.unit_price) > 0;

      if (isRomanGroupEarly && !hasPriceEarly) {
        const groupName = workingNameEarly || fullRowText.trim();
        currentGroup = groupName;
        const ckMatch = groupName.match(/(?:CHIẾT\s*KHẤU|CK)\s*(\d+)\s*%/i);
        currentGroupDiscount = ckMatch ? parseFloat(ckMatch[1]) : 0;
        items.push({
          is_group: true, group_name: groupName, name: groupName,
          description: '', unit: '', quantity: 0, unit_price: 0, amount: 0,
          height: null, width: null, length: null, notes: '',
          group_discount_percent: currentGroupDiscount,
        });
        console.log('[parse-excel] GROUP:', groupName.slice(0, 50), 'CK:', currentGroupDiscount);
        continue;
      }

      // Detect summary rows: TỔNG TỦ, TỔNG PHỤ KIỆN, TỔNG 2 HẠNG MỤC, CHIẾT KHẤU, TỔNG SAU CK
      // Check both name column and full row text (summary rows often span merged cells)
      const isSummary = nameUpper.includes('TỔNG') || nameUpper.includes('CỘNG') ||
        nameUpper.includes('CHIẾT KHẤU') || nameUpper.includes('PHẦN TỪ') ||
        fullRowUpper.includes('TỔNG') || fullRowUpper.includes('CHIẾT KHẤU');
      // Summary rows: no STT number, OR STT contains summary text itself (merged cells)
      const sttIsSummary = sttUpper.includes('TỔNG') || sttUpper.includes('CHIẾT KHẤU') || sttUpper.includes('PHẦN TỦ') || sttUpper.includes('PHẦN TỪ');
      if (isSummary && (!stt || sttIsSummary || !sttIsNumber)) {
        // Find amount: try amount column, then scan row for largest number
        let amt = colMap.amount !== undefined ? parseVietnameseMoney(row[colMap.amount]) : 0;
        if (amt === 0) {
          // Scan all cells for a number (summary amount might be in unexpected column)
          for (let ci = 0; ci < row.length; ci++) {
            const cellVal = parseVietnameseMoney(row[ci]);
            if (cellVal > 1000 && cellVal > amt) amt = cellVal;
          }
        }
        const summaryLabel = name || stt || fullRowText;
        summaryRows.push({ label: summaryLabel, amount: amt });
        console.log('[parse-excel] summary row:', { label: summaryLabel.slice(0,40), amt, stt, rawAmtCell: row[colMap.amount] });
        continue;
      }

      // ── Dòng Cọc / Còn lại (khối tiền cuối báo giá — có thể có «ĐÃ NHẬN» ở cột phụ) ──
      if (isExcelDepositOrRemainSummaryRow(name, stt, fullRowText)) {
        let amt = colMap.amount !== undefined ? parseVietnameseMoney(row[colMap.amount]) : 0;
        if (amt === 0) {
          for (let ci = 0; ci < row.length; ci++) {
            const cellVal = parseVietnameseMoney(row[ci]);
            if (cellVal >= 1000 && cellVal > amt) amt = cellVal;
          }
        }
        const summaryLabel = name || stt || fullRowText;
        const labelU = summaryLabel.toUpperCase();
        const rowKind = labelU.includes('CÒN LẠI') ? 'remaining' : 'deposit';
        const deposit_received = rowKind === 'deposit' ? parseExcelDepositReceivedFromRow(row) : null;
        summaryRows.push({
          label: summaryLabel,
          amount: amt,
          row_kind: rowKind,
          deposit_received,
        });
        console.log('[parse-excel] deposit/remain row:', {
          label: summaryLabel.slice(0, 48),
          amt,
          rowKind,
          deposit_received,
        });
        continue;
      }

      // Skip truly empty rows (no text at all)
      // Note: don't skip if name is empty but STT has text (merged cells)
      const effectiveName = name || (sttIsNumber ? '' : stt) || '';
      const rowUnitPrice = parseExcelMoneyFromMappedColumn(row, colMap.unit_price);
      const rowAmount = parseExcelMoneyFromMappedColumn(row, colMap.amount);
      if (!effectiveName && !name && !descEarly && rowUnitPrice <= 0 && rowAmount <= 0) continue;

      // Detect group title: has name but no STT number AND no unit_price
      const sttNum = parseInt(stt);
      const hasUnit = colMap.unit !== undefined && String(row[colMap.unit] || '').trim();
      const hasPrice = rowUnitPrice > 0;
      const workingName = effectiveName || name;
      const isGroupRow = (isNaN(sttNum) || !stt || sttIsSummary) && !hasPrice && workingName.length > 5;

      // Also check Roman numeral pattern: I., II., III., IV. at start
      const isRomanGroup = /^[IVX]+[\.\)\s]/.test(workingName);

      if ((isGroupRow && !hasUnit) || isRomanGroup) {
        currentGroup = workingName;
        // Parse chiết khấu % từ header nhóm: "PHỤ KIỆN BẾP (CHIẾT KHẤU 35%)" hoặc "CK 35%"
        const ckMatch = workingName.match(/(?:CHIẾT\s*KHẤU|CK)\s*(\d+)\s*%/i);
        currentGroupDiscount = ckMatch ? parseFloat(ckMatch[1]) : 0;
        items.push({
          is_group: true, group_name: workingName, name: workingName,
          description: '', unit: '', quantity: 0, unit_price: 0, amount: 0,
          height: null, width: null, length: null, notes: '',
          group_discount_percent: currentGroupDiscount,
        });
        continue;
      }

      // Normal item row — must have unit_price or amount
      if (!hasPrice && rowAmount <= 0) continue;

      // Detect "HỖ TRỢ" / "MIỄN PHÍ" / "TẶNG" in amount column → freebie item (CK 100%)
      const rawAmountCell = colMap.amount !== undefined ? String(row[colMap.amount] || '').trim() : '';
      const parsedAmount = rowAmount;
      const isFreebieText = /HỖ\s*TRỢ|MIỄN\s*PHÍ|TẶNG|FREE|KM|KHUYẾN/i.test(rawAmountCell);
      const isFreebie = isFreebieText && parsedAmount === 0;

      const descCell = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';
      const notesCell = colMap.notes !== undefined ? String(row[colMap.notes] || '').trim() : '';
      if (descCell) lastProductDesc = descCell;
      const effectiveDescCell = descCell || (isNextGoFormat ? lastProductDesc : '');
      const itemName = name || (isNextGoFormat && effectiveDescCell ? currentProductName || effectiveDescCell.split('\n')[0].slice(0, 120) : '') || skuRaw;
      // Nếu có MÃ HÀNG riêng (section III VPT): prefix vào description để khỏi mất thông tin.
      const skuPrefix = (skuRaw && skuRaw !== name) ? `[${skuRaw}] ` : '';
      const mergedDescription = [
        skuPrefix ? `${skuPrefix.trim()}` : '',
        effectiveDescCell,
        notesCell,
      ].filter(Boolean).join('\n\n');

      // % CHIẾT KHẤU per-row: hỗ trợ "35%", "0.35", "0,35"
      let rowDiscount = 0;
      if (colMap.discount_percent !== undefined) {
        const raw = row[colMap.discount_percent];
        if (raw != null && raw !== '') {
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace('%', '').replace(',', '.'));
          if (!isNaN(n) && n > 0) rowDiscount = n <= 1 ? n * 100 : n;
        }
      }
      const effectiveGroupCK = rowDiscount > 0 ? rowDiscount : currentGroupDiscount;

      items.push({
        is_group: false,
        group_name: currentGroup,
        group_discount_percent: effectiveGroupCK,
        sku: skuRaw || null,
        name: itemName,
        description: mergedDescription,
        unit: colMap.unit !== undefined ? String(row[colMap.unit] || '').trim() : 'bộ',
        length: colMap.length !== undefined ? (parseVietnameseMeasure(row[colMap.length]) ?? null) : null,
        width: colMap.width !== undefined ? (parseVietnameseMeasure(row[colMap.width]) ?? null) : null,
        height: colMap.height !== undefined ? (parseVietnameseMeasure(row[colMap.height]) ?? null) : null,
        quantity: colMap.quantity !== undefined ? (parseVietnameseMeasure(row[colMap.quantity]) ?? 1) : 1,
        unit_price: rowUnitPrice,
        amount: parsedAmount,
        vat_rate: colMap.vat_rate !== undefined ? parseFloat(row[colMap.vat_rate]) || 0 : 0,
        notes: notesCell,
        is_freebie: isFreebie,
      });
    }

    // ── 4. Calculate totals from summary rows ──
    // Priority: "TỔNG 2 HẠNG MỤC" or "TỔNG SAU CHIẾT KHẤU" > last TỔNG row
    let grandTotal = 0, subtotalBeforeDiscount = 0, discountAmount = 0;

    // Track group subtotals + discount amounts for CK% calculation
    // Strategy: assign TỔNG/CK rows to groups in order (simpler than name matching)
    const groupTotals = {}; // { groupName: subtotal }
    const groupDiscounts = {}; // { groupName: discountAmount }
    const groupNamesOrdered = items.filter(i => i.is_group).map(g => g.name);
    const groupsWithoutHeaderCK = items.filter(i => i.is_group && !i.group_discount_percent).map(g => g.name);
    let nextTotalGroupIdx = 0;

    for (const sr of summaryRows) {
      const label = sr.label.toUpperCase();
      if (label.includes('TỔNG') && label.includes('HẠNG MỤC')) {
        grandTotal = sr.amount; // "TỔNG 2 HẠNG MỤC" = final total
      } else if (label.includes('SAU') && (label.includes('CHIẾT KHẤU') || label.includes('CK'))) {
        // "TỔNG TỦ SAU CHIẾT KHẤU" — skip for group calc, use as grandTotal fallback
        if (!grandTotal) grandTotal = sr.amount;
      } else if (label.includes('CHIẾT KHẤU') || label.includes('PHẦN TỪ') || label.includes('PHẦN TỦ')) {
        discountAmount += sr.amount;
        // Assign discount to first group without header CK that doesn't have discount yet
        const target = groupsWithoutHeaderCK.find(gn => !groupDiscounts[gn]);
        if (target) groupDiscounts[target] = (groupDiscounts[target] || 0) + sr.amount;
      } else if (label.includes('TỔNG')) {
        subtotalBeforeDiscount += sr.amount;
        // Assign to groups in file order
        if (nextTotalGroupIdx < groupNamesOrdered.length) {
          groupTotals[groupNamesOrdered[nextTotalGroupIdx]] = sr.amount;
          nextTotalGroupIdx++;
        }
      }
    }
    console.log('[parse-excel] summaryRows:', JSON.stringify(summaryRows.map(s => ({ l: s.label.slice(0,35), a: s.amount }))));
    console.log('[parse-excel] groupTotals:', JSON.stringify(groupTotals));
    console.log('[parse-excel] groupDiscounts:', JSON.stringify(groupDiscounts));

    // ── 5. Calculate CK% for groups that don't have it from header ──
    // E.g. "PHẦN TỦ CHIẾT KHẤU 1,998,101" + "TỔNG TỦ 66,603,375" → CK% = 1998101/66603375 ≈ 3%
    // NOTE: CK from summary = applied to GROUP TOTAL (Thành tiền items are BEFORE discount)
    //       CK from header = applied PER ITEM (Thành tiền already includes discount)
    // → Mark differently: group_summary_discount_percent (not applied per-item in Thành tiền)
    console.log('[parse-excel] groupTotals:', JSON.stringify(groupTotals));
    console.log('[parse-excel] groupDiscounts:', JSON.stringify(groupDiscounts));
    console.log('[parse-excel] groups:', items.filter(i => i.is_group).map(g => ({ name: g.name.slice(0,30), gdk: g.group_discount_percent })));
    for (const groupItem of items.filter(i => i.is_group && !i.group_discount_percent)) {
      const gTotal = groupTotals[groupItem.name];
      const gDiscount = groupDiscounts[groupItem.name];
      console.log('[parse-excel] checking group:', groupItem.name.slice(0,30), 'gTotal:', gTotal, 'gDiscount:', gDiscount);
      if (gTotal > 0 && gDiscount > 0) {
        const ckPercent = Math.round((gDiscount / gTotal) * 10000) / 100; // round 2 decimal
        groupItem.group_summary_discount_percent = ckPercent;
        // Apply to child items as summary-level discount (NOT already in Thành tiền)
        let applied = 0;
        items.forEach(i => {
          if (!i.is_group && i.group_name === groupItem.name) {
            i.group_summary_discount_percent = ckPercent;
            applied++;
          }
        });
        console.log('[parse-excel] applied summaryCK', ckPercent, '% to', applied, 'items in group:', groupItem.name.slice(0,30));
      }
    }

    // If no grand total found, sum item amounts
    const itemsTotal = items.filter(i => !i.is_group).reduce((s, i) => s + (i.amount || i.quantity * i.unit_price), 0);
    if (!grandTotal) grandTotal = itemsTotal - discountAmount;
    if (!subtotalBeforeDiscount) subtotalBeforeDiscount = itemsTotal;

    let deposit_amount = null;
    let deposit_received = null;
    let deposit_label = '';
    let remaining_amount = null;
    let remaining_note = '';
    for (const sr of summaryRows) {
      if (sr.row_kind === 'deposit') {
        if (sr.amount > 0) deposit_amount = sr.amount;
        deposit_label = sr.label || deposit_label;
        if (sr.deposit_received === true || sr.deposit_received === false) deposit_received = sr.deposit_received;
      }
      if (sr.row_kind === 'remaining') {
        remaining_amount = sr.amount > 0 ? sr.amount : remaining_amount;
        remaining_note = sr.label || remaining_note;
      }
    }

    return {
      customer_name,
      customer_phone,
      customer_address,
      kts_info,
      title,
      items,
      notes: notesText.join('\n'),
      summary: {
        subtotal: subtotalBeforeDiscount,
        discount_amount: discountAmount,
        total: grandTotal,
        summary_rows: summaryRows,
        deposit_amount,
        deposit_received,
        deposit_label,
        remaining_amount,
        remaining_note,
      },
      columns_detected: colMap,
      header_row: headerIdx,
      total_rows: rows.length,
      excel_format: isNextGoFormat ? 'nextgo' : 'default',
    };
  } catch (e) {
    console.error('[parse-excel]', e);
    throw new Error('Lỗi đọc file Excel: ' + e.message);
  }
}

module.exports = {
  parseQuotationExcelBuffer,
  listQuotationExcelSheets,
  excelLooksLikeHeaderRow,
  resolveExcelWorksheet,
};
