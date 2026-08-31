/** Dự án đã bàn giao / đang trong module Lắp đặt — Lắp đặt.
 * Chỉ dựa liên kết VC thật (cột Kanban VC hoặc công ty VC) —
 * không dùng projects.status vì cột SX slug delivery/customer-care cũng set shipping/warranty.
 */
export const LOGISTICS_PROJECT_STATUSES = ['shipping', 'installing', 'warranty', 'completed'];

/** Thẻ ở cột lắp đặt tạm bị khoá chuyển cột tới khi xưởng bàn giao + Sale CRM xác nhận. */
export const VC_TEMP_LOCK_MSG = 'Dự án đang ở cột lắp đặt tạm (badge TẠM) — chờ xưởng SX bàn giao và Sale CRM xác nhận lại thông tin VC/LĐ thì mới chuyển cột được.';

/** Khoá kéo khi còn TẠM và chưa sang lắp/bảo hành (chưa bàn giao thật). */
export function isVcTempColumnLocked(project) {
  if (!project?.vc_temp_staged) return false;
  const st = String(project.status || '');
  if (st === 'installing' || st === 'warranty' || st === 'completed' || st === 'shipping') return false;
  return true;
}

export function isProjectAlreadyInLogistics(project) {
  if (!project) return false;
  // Đang ở cột «lắp đặt tạm» (setup kế hoạch SX/VC) → chưa bàn giao thật từ xưởng.
  if (project.vc_temp_staged) return false;
  if (project.vc_kanban_column_id) return true;
  if (project.logistics_company_id) return true;
  return false;
}

function foldViProgressName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/** Cột Kanban VC/LĐ đã xong (Hoàn thiện / Hoàn thành). */
export function isLogisticsProgressCompleted(stage) {
  if (!stage) return false;
  const slug = String(stage.bucket_slug || stage.slug || '').toLowerCase().trim();
  if (slug === 'completed' || slug === 'done' || slug === 'install_completed') return true;
  const name = foldViProgressName(stage.name);
  return name === 'hoan thanh' || name === 'hoan thien'
    || name.startsWith('hoan thanh ') || name.startsWith('hoan thien ');
}

/**
 * Nhãn tiến độ VC/LĐ trên thẻ SX — ưu tiên cột Kanban VC hiện tại, không dùng status cũ.
 * @returns {{ label: string, done: boolean, color: string|null } | null}
 */
export function sxCardLogisticsProgress(item) {
  if (!item) return null;
  const stage = item.vc_stage;
  if (stage?.name) {
    const done = isLogisticsProgressCompleted(stage);
    return {
      label: stage.name,
      done,
      color: stage.color || (done ? '#16a34a' : null),
    };
  }
  if (!isProjectAlreadyInLogistics(item)
    && item.status !== 'shipping'
    && item.status !== 'installing'
    && item.status !== 'warranty'
    && item.status !== 'completed') {
    return null;
  }
  const st = String(item.status || '');
  if (st === 'completed') return { label: 'Hoàn thành', done: true, color: '#16a34a' };
  if (st === 'installing') return { label: 'Đang lắp đặt', done: false, color: null };
  if (st === 'warranty') return { label: 'Bảo hành', done: false, color: null };
  if (st === 'shipping') return { label: 'Đang vận chuyển', done: false, color: null };
  if (isProjectAlreadyInLogistics(item)) return { label: 'Đã bàn giao VC', done: false, color: null };
  return null;
}
