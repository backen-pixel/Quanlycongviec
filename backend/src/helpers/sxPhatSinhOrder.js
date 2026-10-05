/**
 * Đơn phát sinh: project con, giữ khách và ngày lắp của đơn gốc, không tạo deal CRM.
 */
const { supabase } = require('../config/supabase');
const { nextTbProjectCode, isPostgresUniqueViolation } = require('./projectCode');

function childName(sourceName) {
  const base = String(sourceName || '').trim() || 'Dự án';
  const suffix = ' (phát sinh)';
  if (base.endsWith(suffix)) return base;
  return `${base}${suffix}`.slice(0, 240);
}

async function createPhatSinhProject(source, { columnId, userId }) {
  if (!source?.id) {
    const err = new Error('Không thấy dự án gốc');
    err.status = 404;
    throw err;
  }
  if (!columnId) {
    const err = new Error('Chưa có cột Phát sinh cho phân loại này. Bật cờ trên pipeline sản xuất.');
    err.status = 400;
    throw err;
  }
  const year = new Date().getFullYear();
  const rowBase = {
    name: childName(source.name),
    description: source.code
      ? `Đơn phát sinh từ ${source.code}`
      : 'Đơn phát sinh',
    customer_id: source.customer_id || null,
    company_id: source.company_id || null,
    workshop_type_id: source.workshop_type_id || null,
    install_date: source.install_date || null,
    delivery_date: source.delivery_date || null,
    install_address: source.install_address || null,
    priority: source.priority || 'medium',
    status: 'producing',
    current_stage_id: null,
    sx_kanban_column_id: columnId,
    sx_pipeline_stage_entered_at: new Date().toISOString(),
    source_project_id: source.id,
    sales_person_id: source.sales_person_id || userId || null,
    production_person_id: source.production_person_id || null,
    created_from_sx: true,
  };

  let project = null;
  let lastErr = null;
  let omitSource = false;
  let omitCreated = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = await nextTbProjectCode(supabase, year);
    const row = { ...rowBase, code };
    if (omitSource) delete row.source_project_id;
    if (omitCreated) delete row.created_from_sx;
    const { data, error } = await supabase.from('projects').insert(row).select('id, code, name, source_project_id, sx_kanban_column_id, company_id, workshop_type_id').single();
    if (!error) {
      project = data;
      break;
    }
    lastErr = error;
    const msg = String(error.message || '');
    if (msg.includes('source_project_id') && !omitSource) {
      const err = new Error('Chưa có cột source_project_id. Chạy database/648_sx_phat_sinh_order.sql');
      err.status = 503;
      throw err;
    }
    if (msg.includes('created_from_sx') && !omitCreated) {
      omitCreated = true;
      continue;
    }
    if (isPostgresUniqueViolation(error)) continue;
    throw error;
  }
  if (!project) throw lastErr || new Error('Không tạo được đơn phát sinh');
  return project;
}

module.exports = { createPhatSinhProject, childName };
