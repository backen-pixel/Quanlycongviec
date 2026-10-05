/**
 * Ngày đặt / giao / hoàn thiện SX trên projects.
 * Quy định:
 * - install_date = deadline VC/LĐ (lắp đặt)
 * - production_finish_date (+ production_deadline) = deadline tổng dự án SX
 *   (= install_date || delivery_date − 2 calendar days)
 */

/** Parse YYYY-MM-DD (hoặc ISO bắt đầu bằng ngày) → { y, m, d } hoặc null. */
function parseDateOnlyParts(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** Cộng/trừ ngày theo lịch (UTC noon tránh lệch DST). Trả YYYY-MM-DD hoặc null. */
function addCalendarDays(dateOnly, deltaDays) {
  const parts = parseDateOnlyParts(dateOnly);
  if (!parts) return null;
  const dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function subtractCalendarDays(dateOnly, days) {
  return addCalendarDays(dateOnly, -Math.abs(Number(days) || 0));
}

/**
 * Khi delivery_date đổi: tính production_finish_date = delivery − 2 (deadline tổng SX).
 * Nếu client gửi tường minh production_finish_date trong cùng request → giữ giá trị đó (chỉnh tay SX).
 * @returns {{ production_finish_date?: string|null, production_deadline?: string|null } | null}
 */
function productionFinishPatchFromDelivery(body) {
  if (!body || body.delivery_date === undefined) return null;
  // Client chỉnh tay finish trong cùng request với delivery → tôn trọng
  if (body.production_finish_date !== undefined) return null;

  const raw = body.delivery_date;
  if (raw === null || raw === '') {
    return { production_finish_date: null, production_deadline: null };
  }
  const finish = subtractCalendarDays(raw, 2);
  if (!finish) return { production_finish_date: null, production_deadline: null };
  return { production_finish_date: finish, production_deadline: finish };
}

/**
 * Ưu tiên install_date (deadline VC/LĐ), không thì delivery_date →
 * production_finish_date + production_deadline = deadline tổng SX (= lắp − 2).
 * Tôn trọng production_finish_date nếu client gửi tường minh.
 */
function productionFinishPatchFromInstallOrDelivery(body) {
  if (!body) return null;
  if (body.production_finish_date !== undefined) {
    // Client gửi finish tường minh — đồng bộ production_deadline nếu chưa gửi
    if (body.production_deadline === undefined && body.production_finish_date) {
      const ymd = String(body.production_finish_date).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        return { production_deadline: ymd };
      }
    }
    return null;
  }

  if (body.install_date !== undefined) {
    const raw = body.install_date;
    if (raw === null || raw === '') {
      // Xóa lắp đặt: nếu cùng request còn delivery → suy từ delivery; không thì không đụng finish
      if (body.delivery_date !== undefined) return productionFinishPatchFromDelivery(body);
      return null;
    }
    const finish = subtractCalendarDays(raw, 2);
    return finish
      ? { production_finish_date: finish, production_deadline: finish }
      : { production_finish_date: null, production_deadline: null };
  }

  return productionFinishPatchFromDelivery(body);
}

function ymdOf(raw) {
  if (raw == null || raw === '') return '';
  const m = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function normalizeOccurrenceYmds(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(
    list
      .map((d) => ymdOf(d))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  )].sort();
}

/**
 * Ô «Ngày lắp» trên SX (delivery_date) và trên VC (install_date) là một mốc.
 * Ngày vừa sửa luôn thay lịch nhiều buổi đang lưu, để hạn thẻ không bám ngày cũ.
 * Request gửi sẵn install_occurrence_dates thì giữ đúng danh sách đó.
 */
function installAnchorPatchFromBody(body) {
  if (!body) return null;
  const hasInstall = body.install_date !== undefined;
  const hasDelivery = body.delivery_date !== undefined;
  const hasOcc = body.install_occurrence_dates !== undefined || body.installOccurrenceDates !== undefined;
  if (!hasInstall && !hasDelivery && !hasOcc) return null;

  if (hasOcc) {
    const raw = body.install_occurrence_dates !== undefined
      ? body.install_occurrence_dates
      : body.installOccurrenceDates;
    const occ = normalizeOccurrenceYmds(raw);
    const patch = { install_occurrence_dates: occ };
    const ymd = occ[0] || '';
    if (ymd) {
      if (!hasInstall) patch.install_date = `${ymd}T14:00:00+07:00`;
      if (!hasDelivery) patch.delivery_date = ymd;
    } else {
      if (hasDelivery && !hasInstall) patch.install_date = null;
      if (hasInstall && !hasDelivery) patch.delivery_date = null;
    }
    return patch;
  }

  const source = (hasInstall && ymdOf(body.install_date))
    ? body.install_date
    : body.delivery_date;
  if (source == null || source === '') {
    const cleared = { install_occurrence_dates: [] };
    if (!hasInstall) cleared.install_date = null;
    if (!hasDelivery) cleared.delivery_date = null;
    return cleared;
  }
  const ymd = ymdOf(source);
  if (!ymd) return null;
  const patch = { install_occurrence_dates: [ymd] };
  if (!hasInstall) patch.install_date = `${ymd}T14:00:00+07:00`;
  if (!hasDelivery) patch.delivery_date = ymd;
  return patch;
}

const COT_GHI_TUY_CHON = [
  'install_occurrence_dates', 'production_finish_date', 'collected_amount', 'deposit_amount',
  'logistics_cost', 'delivery_date', 'order_date', 'vc_notes', 'deadline', 'notes',
];

/**
 * Tên cột thiếu trong thông điệp Postgres/PostgREST.
 * Chỉ nhận cột trong danh sách cho phép. Không nhận ra thì null — người gọi phải ném lỗi.
 */
function cotThieuTuLoi(message) {
  const text = String(message || '');
  if (!text.includes('column')) return null;
  return COT_GHI_TUY_CHON.find((name) => new RegExp(`\\b${name}\\b`).test(text)) || null;
}

/** Cột projects.install_occurrence_dates (DATE[]) đã có từ migration 649 (05/10/2026). Ghi cả lịch nhiều đợt. */
function installAnchorPersistPatch(body) {
  const patch = installAnchorPatchFromBody(body);
  if (!patch) return null;
  const persist = { ...patch };
  return Object.keys(persist).length ? persist : null;
}

module.exports = {
  parseDateOnlyParts,
  addCalendarDays,
  subtractCalendarDays,
  productionFinishPatchFromDelivery,
  productionFinishPatchFromInstallOrDelivery,
  installAnchorPatchFromBody,
  installAnchorPersistPatch,
  normalizeOccurrenceYmds,
  cotThieuTuLoi,
};
