/**
 * Backfill production_stage_id cho 5.851 task chưa có
 *
 * Cách chạy:
 * cd backend && node scripts/backfill-production-stage-ids.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { supabase } = require('../src/config/supabase');

const CHUNK_SIZE = 100;

function chunk(arr, size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log('🚀 Bắt đầu backfill production_stage_id cho task\n');

  try {
    // Bước 1: Lấy tất cả task chưa có production_stage_id
    console.log('1️⃣ Đang lấy task chưa có production_stage_id...');
    const { data: tasks, error: taskErr, count } = await supabase
      .from('tasks')
      .select('id, project_id', { count: 'exact' })
      .is('production_stage_id', null)
      .limit(10000);

    if (taskErr) throw taskErr;
    if (!tasks || !tasks.length) {
      console.log('   ✅ Không có task cần backfill');
      process.exit(0);
    }

    console.log(`   ✅ Tìm được ${tasks.length} task (trong tổng ${count})\n`);

    // Bước 2: Nhóm task theo project_id
    console.log('2️⃣ Đang nhóm task theo project...');
    const tasksByProject = {};
    const projectsNeedStage = new Set();

    tasks.forEach(t => {
      if (!t.project_id) return; // Bỏ qua task không có project
      if (!tasksByProject[t.project_id]) tasksByProject[t.project_id] = [];
      tasksByProject[t.project_id].push(t.id);
      projectsNeedStage.add(t.project_id);
    });

    const projectIds = Array.from(projectsNeedStage);
    console.log(`   ✅ Nhóm thành ${projectIds.length} dự án\n`);

    // Bước 3: Lấy sx_kanban_column_id của từng project
    console.log('3️⃣ Đang lấy sx_kanban_column_id của các dự án...');
    const { data: projects, error: projErr } = await supabase
      .from('projects')
      .select('id, code, sx_kanban_column_id')
      .in('id', projectIds);

    if (projErr) throw projErr;

    const stageByProject = {};
    let projectsWithStage = 0;
    projects.forEach(p => {
      if (p.sx_kanban_column_id) {
        stageByProject[p.id] = p.sx_kanban_column_id;
        projectsWithStage++;
      }
    });

    console.log(`   ✅ ${projectsWithStage}/${projectIds.length} dự án có sx_kanban_column_id`);
    console.log(`   ⚠️ ${projectIds.length - projectsWithStage} dự án không có cột SX (sẽ bỏ qua)\n`);

    // Bước 4: Backfill từng project
    console.log('4️⃣ Đang backfill task...');
    let totalUpdated = 0;
    let totalFailed = 0;
    const updateByStage = {};

    for (const [projectId, stageId] of Object.entries(stageByProject)) {
      const taskIds = tasksByProject[projectId] || [];
      if (!taskIds.length) continue;

      // Batch update
      const chunks = chunk(taskIds);
      for (const taskChunk of chunks) {
        const { error: updateErr, count: updatedCount } = await supabase
          .from('tasks')
          .update({ production_stage_id: stageId, updated_at: new Date().toISOString() })
          .in('id', taskChunk);

        if (updateErr) {
          console.log(`   ❌ Project ${projectId}: ${updateErr.message}`);
          totalFailed += taskChunk.length;
        } else {
          totalUpdated += taskChunk.length;
          updateByStage[stageId] = (updateByStage[stageId] || 0) + taskChunk.length;
        }
      }
    }

    console.log(`   ✅ Backfill xong: ${totalUpdated} task`);
    if (totalFailed) console.log(`   ⚠️ Thất bại: ${totalFailed} task\n`);

    // Bước 5: Thống kê
    console.log('📊 ════════════════════════════════════════════════════════');
    console.log('📊 KẾT QUẢ BACKFILL');
    console.log('📊 ════════════════════════════════════════════════════════\n');

    console.log(`✅ Tổng task cập nhật: ${totalUpdated}`);
    console.log(`❌ Tổng task thất bại:  ${totalFailed}`);
    console.log(`⏭️ Task chưa cập nhật:  ${tasks.length - totalUpdated - totalFailed}`);
    console.log(`\n📈 Phân bổ theo stage:`);

    for (const [stageId, count] of Object.entries(updateByStage).sort((a, b) => b[1] - a[1])) {
      console.log(`   Stage ${stageId.substring(0, 8)}: ${count} task`);
    }

    console.log('\n✅ Backfill hoàn tất!');
    console.log('\n🎯 Tiếp theo: Khi cập nhật install_date, deadline sẽ được tính chính xác\n');

    process.exit(0);
  } catch (e) {
    console.error('\n❌ LỖI:', e.message);
    console.error('\nChitiết:', e);
    process.exit(1);
  }
}

main();
