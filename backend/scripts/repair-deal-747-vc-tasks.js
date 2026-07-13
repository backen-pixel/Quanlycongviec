/**
 * Sửa nhiệm vụ VC/LĐ cho DEAL-2026-747 (TB-2026-367):
 * - Gán phụ trách từ default_assignee_id bộ mẫu
 * - Sắp xếp order_index theo bộ mẫu
 * - Bổ sung checklist từ template items
 *
 * Usage: node scripts/repair-deal-747-vc-tasks.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const PROJECT_ID = 'e4a7986d-7572-4dc8-a46a-062b5c96fc22';
const TEMPLATE_ID = 'ea0e6c8f-e21a-457d-af8e-938baec13441';

function normalizeChecklist(checklist) {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map((c, i) => {
      if (typeof c === 'string' && c.trim()) return { title: c.trim(), order_index: i };
      if (c && typeof c === 'object' && (c.label || c.title || c.text)) {
        return {
          title: String(c.label || c.title || c.text).trim(),
          order_index: c.order_index ?? i,
        };
      }
      return null;
    })
    .filter(Boolean);
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.PRIMARY_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PRIMARY_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const { data: tasks, error: te } = await supabase
    .from('tasks')
    .select('id, title, metadata, assignee_id, order_index')
    .eq('project_id', PROJECT_ID)
    .eq('metadata->>workshop_area', 'logistics')
    .eq('metadata->>workshop_template_id', TEMPLATE_ID);
  if (te) throw te;
  if (!tasks?.length) {
    console.log('Không có nhiệm vụ logistics trên dự án.');
    return;
  }

  const itemIds = [...new Set(tasks.map((t) => t.metadata?.workshop_template_item_id).filter(Boolean))];
  const { data: items, error: ie } = await supabase
    .from('workshop_task_template_items')
    .select('id, title, order_index, default_assignee_id, checklist')
    .in('id', itemIds);
  if (ie) throw ie;
  const itemById = new Map((items || []).map((i) => [String(i.id), i]));

  let updated = 0;
  let checklistsAdded = 0;

  for (const task of tasks) {
    const itemId = task.metadata?.workshop_template_item_id;
    const item = itemId ? itemById.get(String(itemId)) : null;
    if (!item) continue;

    const patch = {
      assignee_id: item.default_assignee_id || null,
      order_index: item.order_index ?? task.order_index,
    };
    const { error: ue } = await supabase.from('tasks').update(patch).eq('id', task.id);
    if (ue) {
      console.warn('Update task', task.id, ue.message);
    } else {
      updated += 1;
    }

    const { count } = await supabase
      .from('task_checklists')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', task.id);
    if ((count || 0) > 0) continue;

    const rows = normalizeChecklist(item.checklist).map((row, ci) => ({
      task_id: task.id,
      title: row.title,
      order_index: row.order_index ?? ci,
      is_completed: false,
    }));
    if (!rows.length) continue;
    const { error: ce } = await supabase.from('task_checklists').insert(rows);
    if (ce) {
      console.warn('Checklist', task.id, ce.message);
    } else {
      checklistsAdded += rows.length;
    }
  }

  console.log(`DEAL-2026-747 / TB-2026-367: cập nhật ${updated}/${tasks.length} nhiệm vụ VC, thêm ${checklistsAdded} dòng checklist.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
