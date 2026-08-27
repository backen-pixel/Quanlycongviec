/**
 * Sau khi cron chốt Phần I (08:00) / Phần II (16:45):
 *   - Xuất Excel đúng bảng "Tổng hợp theo từng mục I–IV" (cột = nhân viên)
 *   - Gửi tin nhắn DM + thông báo cho admin hệ thống
 */
const XLSX = require('xlsx');
const { supabase } = require('../config/supabase');
const { getSystemAdminUserIds, dispatchNotificationToUser } = require('./notifications');
const { uploadBufferToStorage } = require('./storageUpload');
const { loadTeamDailyReportMatrix } = require('./dailyReportTeamMatrix');
const {
  AI_BOT_USER_ID,
  ensureDmGroupWithBot,
} = require('./aiBotSender');

function fmtDmy(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function phaseMeta(phase) {
  const isPlan = phase === 'plan';
  return {
    isPlan,
    code: isPlan ? 'I' : 'II',
    title: isPlan ? 'I. Kế hoạch' : 'II. Kết quả',
    slot: isPlan ? '08:00' : '16:45',
    sectionKey: isPlan ? 'plan' : 'result',
  };
}

function sheetName(raw) {
  const s = String(raw || 'Sheet')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (s || 'Sheet').slice(0, 31);
}

function shortCompany(c) {
  const short = String(c?.short_name || '').trim();
  if (short) return short;
  const name = String(c?.name || '').trim();
  if (!name) return 'Công ty';
  return name.replace(/^Công ty\s+(TNHH|CP|Nhôm Kính)?\s*/i, '').slice(0, 24) || name.slice(0, 24);
}

function shortRole(g) {
  const name = String(g.template_name || g.role_key || '').trim();
  if (/sale.?admin|sale admin/i.test(name) || g.role_key === 'sale_admin') return 'Sale Admin';
  if (/sale.?deal|deal/i.test(name) || g.role_key === 'sale_deal' || g.role_key === 'deal_admin') return 'Sale-Deal';
  if (/survey|khảo sát|khao sat/i.test(name) || g.role_key === 'design_survey') return 'KS';
  // Mẫu lạ (ngoài 3 loại chuẩn ở trên) — giữ đủ tên mẫu (không cắt còn 14 ký tự như cũ) để không
  // bị trùng nhãn giữa 2 mẫu khác nhau khi tên gốc hơi dài.
  return name.slice(0, 20) || 'Mẫu';
}

function safeFilePart(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'bc';
}

function cellVal(row, empId) {
  if (!row?.values) return null;
  const id = String(empId);
  if (Object.prototype.hasOwnProperty.call(row.values, id)) return row.values[id];
  if (Object.prototype.hasOwnProperty.call(row.values, empId)) return row.values[empId];
  return null;
}

function asNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' ? n : null;
}

function displayCell(v) {
  if (v == null || v === '') return '—';
  const n = asNumber(v);
  return n != null ? n : String(v);
}

/** Excel gửi admin hệ thống: chỉ Phúc Đạt + Vạn Phú Thành (VPT). */
const ADMIN_EXPORT_COMPANY_IDS = new Set([
  '29677f68-967e-4256-92fd-492bb580e888', // Công ty Nhôm Kính Phúc Đạt
  '991dc79d-cbf5-49f9-a364-35227cb47635', // Công ty TNHH Bếp Vạn Phú Thành
]);

function isAdminExportCompany(id, company) {
  if (ADMIN_EXPORT_COMPANY_IDS.has(String(id || ''))) return true;
  const blob = `${company?.name || ''} ${company?.short_name || ''}`.toLowerCase();
  if (/phúc đạt|phuc dat/.test(blob)) return true;
  if (/vạn phú thành|van phu thanh|\bvpt\b/.test(blob)) return true;
  return false;
}

function filterAdminExportCompanyIds(ids, companyMap) {
  return [...new Set((ids || []).map(String).filter(Boolean))]
    .filter((id) => isAdminExportCompany(id, companyMap.get(id)));
}

async function loadCompanyMap(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .in('id', unique);
  if (error) throw error;
  return new Map((data || []).map((c) => [String(c.id), c]));
}

function uniqueSheetName(used, raw) {
  let name = sheetName(raw);
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let i = 2;
  while (used.has(sheetName(`${name.slice(0, 28)} ${i}`))) i += 1;
  name = sheetName(`${name.slice(0, 28)} ${i}`);
  used.add(name);
  return name;
}

function buildMatrixSheetAoa({ title, subtitle, note, employees, rows }) {
  const emps = employees || [];
  const metrics = rows || [];
  const aoa = [
    [title],
    [subtitle],
    [note],
    ['', 'Phòng', ...emps.map((e) => e.department_name || ''), ''],
    ['STT', 'Hạng mục', ...emps.map((e) => e.full_name || e.email || '—'), 'Tổng'],
  ];
  const colTotals = emps.map(() => 0);
  let grand = 0;
  metrics.forEach((row, ri) => {
    let lineSum = 0;
    let lineHasNum = false;
    const cells = emps.map((emp, ci) => {
      const raw = cellVal(row, emp.id);
      const n = asNumber(raw);
      if (n == null) return displayCell(raw);
      lineSum += n;
      lineHasNum = true;
      colTotals[ci] += n;
      grand += n;
      return n;
    });
    aoa.push([ri + 1, row.label || '—', ...cells, lineHasNum ? lineSum : '—']);
  });
  aoa.push(['TỔNG CỘT', '', ...colTotals, grand]);
  return aoa;
}

function buildWorkbookBuffer({ reportDate, phase, slot, packs }) {
  const meta = phaseMeta(phase);
  const wb = XLSX.utils.book_new();
  const used = new Set();

  const overview = [
    [`BÁO CÁO HẰNG NGÀY — ${meta.title}`],
    [`Ngày ${fmtDmy(reportDate)}  ·  Chốt lúc ${slot} VN`],
    ['Nguồn: tab Tổng hợp theo từng mục I–IV (cột = nhân viên) trên /crm/daily-reports'],
    [],
    ['Công ty', 'Mẫu', 'Nhân viên', 'Có phiếu', 'Đã chốt KQ'],
  ];
  for (const pack of packs) {
    const companyName = pack.company?.name || shortCompany(pack.company) || pack.companyId;
    for (const g of pack.matrix?.groups || []) {
      overview.push([
        companyName,
        g.template_name || g.role_key || '',
        g.summary?.total ?? (g.employees || []).length,
        g.summary?.with_report ?? 0,
        g.summary?.result_ok ?? 0,
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), uniqueSheetName(used, 'Tổng quan'));

  const sectionNote = meta.isPlan
    ? 'I. Kế hoạch = Deadline Lead/Deal, cột Quá hạn + Hôm nay (đúng màn Tổng hợp I–IV).'
    : 'II. Kết quả = số CRM đúng ngày phiếu trên bộ lọc (đúng màn Tổng hợp I–IV).';

  for (const pack of packs) {
    const companyName = pack.company?.name || shortCompany(pack.company) || 'Công ty';
    const coShort = shortCompany(pack.company);
    for (const g of pack.matrix?.groups || []) {
      const section = (g.sections || []).find((s) => s.key === meta.sectionKey);
      if (!section) continue;
      const emps = g.employees || [];
      const role = shortRole(g);
      const aoa = buildMatrixSheetAoa({
        title: `${section.title || meta.title} — ${g.template_name || role}`,
        subtitle: `${companyName}  ·  ${emps.length} nhân viên  ·  ${fmtDmy(reportDate)}  ·  ${slot} VN`,
        note: sectionNote,
        employees: emps,
        rows: section.rows || [],
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 6 }, { wch: 32 }, ...emps.map(() => ({ wch: 14 })), { wch: 10 }];
      XLSX.utils.book_append_sheet(
        wb,
        ws,
        uniqueSheetName(used, `${meta.code}.${coShort} · ${role}`),
      );
    }
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildSummaryText({ reportDate, phase, slot, packs }) {
  const meta = phaseMeta(phase);
  const lines = [
    `Báo cáo hằng ngày ${fmtDmy(reportDate)} — ${meta.title} (${slot} VN).`,
    'Đúng bảng Tổng hợp theo từng mục I–IV trên /crm/daily-reports (cột = nhân viên).',
    '',
  ];
  for (const pack of packs) {
    const name = pack.company?.name || shortCompany(pack.company) || pack.companyId;
    const s = pack.matrix?.summary || {};
    lines.push(`• ${name}: ${s.total || 0} NV · có phiếu ${s.with_report || 0} · chốt KQ ${s.result_ok || 0}`);
  }
  lines.push('', 'File Excel đính kèm: mỗi sheet = 1 mẫu (Sale Admin / Sale-Deal…) × công ty.');
  return lines.join('\n');
}

async function sendAdminDmWithFile({ io, adminId, content, file }) {
  const groupId = await ensureDmGroupWithBot(adminId);
  if (!groupId) throw new Error('Không tạo được DM với admin');

  const { data, error } = await supabase
    .from('messenger_group_messages')
    .insert({
      group_id: groupId,
      user_id: AI_BOT_USER_ID,
      content,
      message_type: 'file',
      is_system: false,
      attachment_url: file.file_url,
      attachment_name: file.file_name,
      attachment_size: file.file_size || null,
      attachment_mime: file.mime_type,
    })
    .select('*, user:users!messenger_group_messages_user_id_fkey(id, full_name, avatar, is_bot)')
    .single();
  if (error) throw new Error(`insert DM file: ${error.message}`);

  if (io) io.to(`messenger_group:${groupId}`).emit('messenger_group:chat', data);
  return data;
}

/**
 * @param {{ summary: object, phase: 'plan'|'result', io?: object }} opts
 */
async function notifyAdminsAfterDailyReportBatch({ summary, phase, io } = {}) {
  const date = summary?.report_date;
  if (!date) {
    console.log('[daily-report-notify] Thiếu ngày phiếu — bỏ qua');
    return { sent: 0, skipped: true };
  }

  const meta = phaseMeta(phase || summary.phase);
  let companyIds = [...new Set((summary.results || []).map((r) => String(r.company_id || '')).filter(Boolean))];
  if (!companyIds.length) {
    const { data: rows } = await supabase
      .from('crm_daily_reports')
      .select('company_id')
      .eq('report_date', date)
      .limit(2000);
    companyIds = [...new Set((rows || []).map((r) => String(r.company_id || '')).filter(Boolean))];
  }
  if (!companyIds.length) {
    console.log('[daily-report-notify] Không có công ty — bỏ qua gửi admin');
    return { sent: 0, skipped: true, reason: 'no_companies' };
  }

  const [companyMap, adminIds] = await Promise.all([
    loadCompanyMap(companyIds),
    getSystemAdminUserIds({ activeOnly: true }),
  ]);

  companyIds = filterAdminExportCompanyIds(companyIds, companyMap);
  if (!companyIds.length) {
    console.log('[daily-report-notify] Không có Phúc Đạt / VPT — bỏ qua gửi admin');
    return { sent: 0, skipped: true, reason: 'not_phucdat_vpt' };
  }

  if (!adminIds.length) {
    console.warn('[daily-report-notify] Không có admin hệ thống để gửi');
    return { sent: 0, skipped: true, reason: 'no_admins' };
  }

  const packs = [];
  for (const cid of companyIds) {
    try {
      const matrix = await loadTeamDailyReportMatrix({ date, companyId: cid });
      if (!(matrix.groups || []).length) continue;
      packs.push({
        companyId: cid,
        company: companyMap.get(cid) || null,
        matrix,
      });
    } catch (e) {
      console.warn('[daily-report-notify] matrix', cid, e.message || e);
    }
  }

  if (!packs.length) {
    console.log('[daily-report-notify] Không có bảng tổng hợp I–IV — bỏ qua');
    return { sent: 0, skipped: true, reason: 'empty_matrix' };
  }

  const buffer = buildWorkbookBuffer({
    reportDate: date,
    phase: meta.isPlan ? 'plan' : 'result',
    slot: meta.slot,
    packs,
  });

  const fileName = `Tong_hop_I_IV_${safeFilePart(meta.code + '_' + meta.slot)}_${date}.xlsx`;
  const stored = await uploadBufferToStorage(buffer, {
    originalName: fileName,
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    entityType: 'daily_report',
    folderPrefix: `daily-reports/${date}`,
  });

  const text = buildSummaryText({
    reportDate: date,
    phase: meta.isPlan ? 'plan' : 'result',
    slot: meta.slot,
    packs,
  });

  let sent = 0;
  const errors = [];
  for (const adminId of adminIds) {
    try {
      await sendAdminDmWithFile({ io, adminId, content: text, file: stored });

      const { data: notif, error: nErr } = await supabase
        .from('notifications')
        .insert({
          user_id: adminId,
          type: 'daily_report',
          title: `Tổng hợp I–IV ${fmtDmy(date)} — ${meta.title}`,
          message: `${meta.title} lúc ${meta.slot}. File giống tab Tổng hợp theo từng mục trên Báo cáo hằng ngày.`,
          entity_type: 'crm_daily_report',
          entity_id: date,
          metadata: {
            ecosystem_module_key: 'crm',
            nav_url: '/crm/daily-reports',
            file_url: stored.file_url,
            file_name: stored.file_name,
            phase: meta.isPlan ? 'plan' : 'result',
            slot: meta.slot,
            report_date: date,
            is_direct: true,
            peer_id: AI_BOT_USER_ID,
          },
        })
        .select()
        .single();
      if (!nErr && notif) await dispatchNotificationToUser(io, adminId, notif);
      else if (nErr) console.warn('[daily-report-notify] notification:', nErr.message);
      sent += 1;
    } catch (e) {
      errors.push(`${adminId}: ${e.message || e}`);
      console.warn('[daily-report-notify] gửi admin lỗi:', adminId, e.message || e);
    }
  }

  console.log(`[daily-report-notify] Đã gửi ${sent}/${adminIds.length} admin · file=${stored.file_name} · công ty=${packs.length}`);
  return { sent, admins: adminIds.length, file_url: stored.file_url, companies: packs.length, errors };
}

module.exports = {
  notifyAdminsAfterDailyReportBatch,
  phaseMeta,
};
