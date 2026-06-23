/**
 * Quét trùng ghi âm: cùng tên + dung lượng + SĐT + thời gian cuộc gọi + thời lượng.
 * Hỗ trợ chế độ legacy (chỉ tên + size) khi client chưa gửi đủ metadata.
 */

const { digitsOnly } = require('./phoneCrmLink');

function normalizeVoiceFileNameForDedup(raw) {
  if (raw == null) return '';
  let s = String(raw).trim().slice(0, 256);
  if (!s) return '';
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
  try {
    for (let i = 0; i < 2; i += 1) {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    }
  } catch {
    /* keep */
  }
  return s.slice(0, 256);
}

function positiveIntSize(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function normalizeVoicePhoneForDedup(phone) {
  const d = digitsOnly(phone);
  if (d.length < 9) return '';
  return d.slice(-9);
}

/** Gom thời điểm cuộc gọi / tạo file theo phút (UTC) để so khớp lệch vài giây. */
function normalizeVoiceCallTimeForDedup(isoOrMs) {
  if (isoOrMs == null || isoOrMs === '') return '';
  let ms;
  if (typeof isoOrMs === 'number') ms = isoOrMs;
  else {
    const t = new Date(isoOrMs).getTime();
    if (!Number.isFinite(t)) return '';
    ms = t;
  }
  return String(Math.floor(ms / 60_000));
}

function normalizeVoiceDurationForDedup(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n));
}

/** Client gửi đủ 4 trường phụ (size, phone, time, duration) → so khớp chặt. */
function hasExtendedVoiceFingerprint(item) {
  if (!item || typeof item !== 'object') return false;
  return (
    positiveIntSize(item.file_size) > 0
    && !!normalizeVoicePhoneForDedup(item.phone_number)
    && !!normalizeVoiceCallTimeForDedup(item.call_started_at ?? item.created_at)
    && !!normalizeVoiceDurationForDedup(item.duration_sec)
  );
}

/**
 * Khóa nhóm trùng trên server (đủ metadata) hoặc name|size (legacy).
 */
function buildVoiceDedupGroupKey(row) {
  const name = normalizeVoiceFileNameForDedup(row?.file_name);
  if (!name) return null;
  const size = positiveIntSize(row?.file_size);
  const phone = normalizeVoicePhoneForDedup(row?.phone_number);
  const callT = normalizeVoiceCallTimeForDedup(row?.call_started_at ?? row?.created_at);
  const dur = normalizeVoiceDurationForDedup(row?.duration_sec);
  if (size && phone && callT && dur) {
    return `full|${name}|${size}|${phone}|${callT}|${dur}`;
  }
  if (size) return `basic|${name}|${size}`;
  return `name|${name}`;
}

function isVoiceRecordingDuplicate(clientItem, serverRow) {
  const cName = normalizeVoiceFileNameForDedup(clientItem?.file_name);
  const sName = normalizeVoiceFileNameForDedup(serverRow?.file_name);
  if (!cName || !sName || cName !== sName) return false;

  if (hasExtendedVoiceFingerprint(clientItem)) {
    const cSize = positiveIntSize(clientItem.file_size);
    const sSize = positiveIntSize(serverRow.file_size);
    if (!cSize || !sSize || cSize !== sSize) return false;

    const cPh = normalizeVoicePhoneForDedup(clientItem.phone_number);
    const sPh = normalizeVoicePhoneForDedup(serverRow.phone_number);
    if (!cPh || !sPh || cPh !== sPh) return false;

    const cT = normalizeVoiceCallTimeForDedup(clientItem.call_started_at ?? clientItem.created_at);
    const sT = normalizeVoiceCallTimeForDedup(serverRow.call_started_at ?? serverRow.created_at);
    if (!cT || !sT || cT !== sT) return false;

    const cD = normalizeVoiceDurationForDedup(clientItem.duration_sec);
    const sD = normalizeVoiceDurationForDedup(serverRow.duration_sec);
    if (!cD || !sD || cD !== sD) return false;

    return true;
  }

  const cSize = positiveIntSize(clientItem?.file_size);
  const sSize = positiveIntSize(serverRow?.file_size);
  return cSize > 0 && cSize === sSize;
}

function pickBestDuplicateRow(rows) {
  if (!rows?.length) return null;
  return [...rows].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return tb - ta;
  })[0];
}

function groupVoiceRecordingDuplicates(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = buildVoiceDedupGroupKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const duplicateGroups = [];
  for (const [key, members] of groups.entries()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );
    duplicateGroups.push({
      key,
      count: sorted.length,
      keep_id: sorted[0].id,
      members: sorted.map((m) => ({
        id: m.id,
        file_name: m.file_name,
        file_size: m.file_size,
        phone_number: m.phone_number,
        duration_sec: m.duration_sec,
        call_started_at: m.call_started_at,
        created_at: m.created_at,
        lead_id: m.lead_id,
        customer_id: m.customer_id,
      })),
    });
  }
  duplicateGroups.sort((a, b) => b.count - a.count);
  return duplicateGroups;
}

module.exports = {
  normalizeVoiceFileNameForDedup,
  normalizeVoicePhoneForDedup,
  normalizeVoiceCallTimeForDedup,
  normalizeVoiceDurationForDedup,
  hasExtendedVoiceFingerprint,
  buildVoiceDedupGroupKey,
  isVoiceRecordingDuplicate,
  pickBestDuplicateRow,
  groupVoiceRecordingDuplicates,
};
