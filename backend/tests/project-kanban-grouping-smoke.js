/**
 * Smoke test: cách nhóm cột Kanban /projects phía SERVER phải KHỚP TUYỆT ĐỐI với logic
 * client (lib/projectDeliveryStages.js → resolveProjectKanbanStageId).
 * Run: node tests/project-kanban-grouping-smoke.js
 *
 * Đây là guard quan trọng nhất của việc chuyển Kanban sang phân trang phía server: hàm
 * client có 4 MỨC FALLBACK (current_stage_id → slug của stage đó → map từ status → cột đầu).
 * Sai một mức là thẻ nhảy sang cột khác so với trước. Test đọc TOÀN BỘ dự án (không chỉ 1
 * trang) rồi so số đếm từng cột giữa hai bên.
 *
 * CHỈ ĐỌC dữ liệu, không ghi gì.
 */

require('dotenv').config({ quiet: true });
const { supabase } = require('../src/config/supabase');

// Bản sao NGUYÊN VĂN logic frontend (lib/projectDeliveryStages.js) để đối chiếu
const STATUS_TO_SLUG = {
  consulting: 'order', designing: 'design', quoting: 'design', contract_signed: 'order',
  producing: 'production', shipping: 'delivery', installing: 'installation',
  completed: 'acceptance', warranty: 'warranty', on_hold: 'order', new: 'order',
};
const stageSlugForProjectStatus = (s) => STATUS_TO_SLUG[String(s || '').trim().toLowerCase()] || 'order';

function resolveProjectKanbanStageId(project, stages) {
  if (!project || !Array.isArray(stages) || !stages.length) return null;
  if (project.current_stage_id) {
    const hit = stages.find((st) => String(st.id) === String(project.current_stage_id));
    if (hit) return hit.id;
  }
  if (project.current_stage?.slug) {
    const bySlug = stages.find((st) => st.slug === project.current_stage.slug);
    if (bySlug) return bySlug.id;
  }
  const mapped = stageSlugForProjectStatus(project.status);
  const byMapped = stages.find((st) => st.slug === mapped);
  if (byMapped) return byMapped.id;
  return stages[0]?.id || null;
}

(async () => {
  // Cột đang hiện — khớp isProjectDeliveryStage()
  const { data: raw } = await supabase.from('workflow_stages')
    .select('id, slug, name, order_index, is_active, company_id')
    .eq('is_active', true).is('company_id', null).order('order_index', { ascending: true });
  const stages = (raw || []).filter((s) => !String(s.slug || '').startsWith('sx-sample-'));
  const stageIds = stages.map((s) => s.id);

  // Đọc HẾT dự án kèm current_stage (như cách cũ làm với limit=500, nhưng đủ 100%)
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('projects')
      .select('id, status, current_stage_id, current_stage:workflow_stages(id,slug)')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  // Nhóm theo logic CLIENT
  const clientCounts = {};
  for (const p of all) {
    const sid = resolveProjectKanbanStageId(p, stages) || stageIds[0];
    clientCounts[String(sid)] = (clientCounts[String(sid)] || 0) + 1;
  }

  // Nhóm theo RPC (SERVER)
  const { data: board, error: rErr } = await supabase.rpc('project_kanban_board', {
    p_stage_ids: stageIds,
  });
  if (rErr) throw rErr;
  const serverCounts = board.counts || {};

  console.log(`Tổng dự án: ${all.length}   ·   RPC total: ${board.total}`);
  console.log('\nCột                          CLIENT   SERVER');
  const keys = [...new Set([...Object.keys(clientCounts), ...Object.keys(serverCounts)])];
  let diff = 0;
  for (const k of keys) {
    const a = clientCounts[k] || 0;
    const b = serverCounts[k] || 0;
    const st = stages.find((s) => String(s.id) === k);
    const flag = a !== b ? '   ← LỆCH' : '';
    if (a !== b) diff += 1;
    console.log(`${(st?.name || k.slice(0, 8)).padEnd(28)} ${String(a).padStart(6)}   ${String(b).padStart(6)}${flag}`);
  }
  console.log(`\nSố cột lệch: ${diff}`);
  console.log(diff === 0 ? '=> NHÓM CỘT KHỚP HOÀN TOÀN' : '=> CÓ LỆCH!');
  process.exit(diff ? 1 : 0);
})();
