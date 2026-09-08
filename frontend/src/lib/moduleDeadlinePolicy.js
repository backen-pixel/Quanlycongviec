/**
 * Adapter deadline chung cho CRM, SX và VC/LĐ.
 * Ưu tiên dữ liệu dẫn xuất từ backend; fallback giữ cùng thứ tự khi API cũ chưa trả field.
 */

import { companyWorkEndMsFromRaw } from './companyDeadlineClock';
import { effectivePipelineStageSlaDays } from './crmPipelineSla';
import { endOfVnCalendarDayAfterEntered } from './vnDate';

export const DEADLINE_MODULE = Object.freeze({
  CRM: 'crm',
  PRODUCTION: 'production',
  LOGISTICS: 'logistics',
});

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function foldVi(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .trim();
}

function tsOf(raw, item) {
  if (raw == null || raw === '') return null;
  const ts = companyWorkEndMsFromRaw(raw, item) ?? new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function result(raw, source, item) {
  const deadlineTs = tsOf(raw, item);
  if (deadlineTs == null) return null;
  return { raw, source, deadlineTs, deadlineAt: new Date(deadlineTs).toISOString() };
}

function crmTerminal(stage) {
  if (!stage) return false;
  if (stage.is_won || stage.is_lost || stage.counts_as_completed_revenue) return true;
  const slug = String(stage.canonical_slug || stage.slug || '').toLowerCase();
  return ['won', 'lost', 'completed', 'done'].includes(slug)
    || ['won', 'lost'].includes(String(stage.deal_report_bucket || '').toLowerCase());
}

function hasPhone(item) {
  return [item?.display_phone, item?.phone, item?.customer?.phone]
    .some((v) => v != null && String(v).trim());
}

function sxDone(stage) {
  if (!stage) return false;
  if (stage.counts_as_completed_revenue || stage.counts_as_collected_revenue) return true;
  const slug = String(stage.bucket_slug || stage.slug || '').toLowerCase();
  const name = foldVi(stage.name);
  return ['delivered', 'delivery_done', 'completed', 'done'].includes(slug)
    || name.includes('da giao')
    || name.includes('giao xong');
}

function sxShipped(item) {
  if (item?.logistics_company_id || item?.logistics_company?.id || item?.vc_kanban_column_id) return true;
  return ['installing', 'warranty', 'completed'].includes(String(item?.status || ''));
}

function logisticsDone(item, stage) {
  if (item?.status === 'completed') return true;
  const slug = String(stage?.bucket_slug || stage?.slug || '').toLowerCase();
  const name = foldVi(stage?.name);
  return ['completed', 'done', 'install_completed'].includes(slug)
    || name === 'hoan thanh'
    || name === 'hoan thien'
    || name.startsWith('hoan thanh ')
    || name.startsWith('hoan thien ');
}

function fromBackend(item, moduleKey) {
  if (!hasOwn(item, 'effective_deadline_at')) return null;
  if (item.effective_deadline_module
    && String(item.effective_deadline_module) !== String(moduleKey)) {
    return null;
  }
  const picked = result(item.effective_deadline_at, item.effective_deadline_source || null, item);
  return picked || { raw: null, source: null, deadlineTs: null, deadlineAt: null };
}

export function resolveEffectiveModuleDeadline(moduleKey, item, stage = null) {
  const backend = fromBackend(item, moduleKey);
  if (backend) return backend;
  const key = String(moduleKey || '').toLowerCase();

  if (key === DEADLINE_MODULE.CRM) {
    if (!item || item.deadline_disabled_at || item.is_interacted || !hasPhone(item) || crmTerminal(stage)) {
      return { raw: null, source: null, deadlineTs: null, deadlineAt: null };
    }
    const direct = result(item.crm_next_open_task_deadline, 'task', item)
      || result(item.kanban_deadline_at, 'kanban', item);
    if (direct) return direct;
    const slaDays = effectivePipelineStageSlaDays(stage?.sla_days);
    if (item.stage_entered_at && slaDays != null) {
      const slaAt = endOfVnCalendarDayAfterEntered(
        item.stage_entered_at,
        slaDays,
        item.company_id || item.company,
      );
      const sla = result(slaAt?.toISOString(), 'sla', item);
      if (sla) return sla;
    }
    return result(item.expected_close_date, 'expected_close', item)
      || { raw: null, source: null, deadlineTs: null, deadlineAt: null };
  }

  if (key === DEADLINE_MODULE.PRODUCTION) {
    if (!item || item.status === 'completed' || sxDone(stage) || stage?.sla_days === 0
      || stage?.sla_days === '0' || sxShipped(item)) {
      return { raw: null, source: null, deadlineTs: null, deadlineAt: null };
    }
    return result(item.sx_kanban_deadline_at, 'sx_kanban', item)
      || result(item.production_finish_date, 'production_finish', item)
      || result(item.production_deadline, 'production', item)
      || result(item.delivery_date, 'delivery', item)
      || result(item.deadline, 'project', item)
      || { raw: null, source: null, deadlineTs: null, deadlineAt: null };
  }

  if (key === DEADLINE_MODULE.LOGISTICS) {
    if (!item || logisticsDone(item, stage)) {
      return { raw: null, source: null, deadlineTs: null, deadlineAt: null };
    }
    return result(item.install_date, 'install', item)
      || result(item.delivery_date, 'delivery', item)
      || result(item.deadline, 'project', item)
      || { raw: null, source: null, deadlineTs: null, deadlineAt: null };
  }

  return { raw: null, source: null, deadlineTs: null, deadlineAt: null };
}

export function deadlineStateFromTs(deadlineTs, nowMs = Date.now()) {
  if (deadlineTs == null || !Number.isFinite(deadlineTs)) return { level: 'none', remainingMs: null };
  const remainingMs = deadlineTs - nowMs;
  if (remainingMs < 0) return { level: 'overdue', remainingMs };
  if (remainingMs <= 86400000) return { level: 'soon', remainingMs };
  if (remainingMs <= 3 * 86400000) return { level: 'warning', remainingMs };
  return { level: 'ok', remainingMs };
}

