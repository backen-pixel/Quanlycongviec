/**
 * Hoàn thành khoá Kiến thức cho 1 user (bài học + bài tập + chứng nhận).
 *
 * Usage:
 *   node backend/scripts/complete-knowledge-course.js --email admin@tubep.vn --category lead
 *
 * category: lead | deal | guide (slug prefix)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { supabase } = require('../src/config/supabase');

const CATEGORY_MAP = {
  lead: 'd2000001-0000-0000-0000-000000000001',
  deal: 'd2000002-0000-0000-0000-000000000001',
  guide: 'd2000003-0000-0000-0000-000000000001',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { email: 'admin@tubep.vn', category: 'lead' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) out.email = args[++i];
    if (args[i] === '--category' && args[i + 1]) out.category = args[++i];
  }
  return out;
}

async function main() {
  const { email, category: catKey } = parseArgs();
  const categoryId = CATEGORY_MAP[catKey];
  if (!categoryId) {
    console.error('category không hợp lệ. Dùng: lead | deal | guide');
    process.exit(1);
  }

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, full_name, email, role, company_id')
    .eq('email', email)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!user) {
    console.error('Không tìm thấy user:', email);
    process.exit(1);
  }

  const { data: lessons, error: lesErr } = await supabase
    .from('knowledge_lessons')
    .select('id, sort_order')
    .eq('category_id', categoryId)
    .eq('is_published', true)
    .order('sort_order');
  if (lesErr) throw lesErr;

  const lessonIds = (lessons || []).map((l) => l.id);
  const now = new Date().toISOString();

  for (const lessonId of lessonIds) {
    const { error } = await supabase.from('knowledge_lesson_progress').upsert(
      {
        user_id: user.id,
        lesson_id: lessonId,
        status: 'completed',
        started_at: now,
        completed_at: now,
        last_viewed_at: now,
      },
      { onConflict: 'user_id,lesson_id' },
    );
    if (error) throw error;
  }
  console.log(`✓ ${lessonIds.length} bài học → completed`);

  const { data: exercises, error: exErr } = await supabase
    .from('knowledge_exercises')
    .select('id, lesson_id, type, passing_score')
    .in('lesson_id', lessonIds);
  if (exErr) throw exErr;

  const exIds = (exercises || []).map((e) => e.id);
  if (exIds.length) {
    await supabase.from('knowledge_exercise_submissions').delete().eq('user_id', user.id).in('exercise_id', exIds);

    const rows = (exercises || []).map((e) => ({
      exercise_id: e.id,
      user_id: user.id,
      answers:
        e.type === 'essay'
          ? { essay: `Hoàn thành khoá ${catKey} — backfill script.` }
          : e.type === 'checklist'
            ? { items: {} }
            : {},
      score: Math.max(Number(e.passing_score) || 70, 100),
      status: 'passed',
      attempt_number: 1,
      submitted_at: now,
    }));

    const { error: insErr } = await supabase.from('knowledge_exercise_submissions').insert(rows);
    if (insErr) throw insErr;
  }
  console.log(`✓ ${exIds.length} bài tập → passed`);

  const { data: existing } = await supabase
    .from('knowledge_certificates')
    .select('id, certificate_number')
    .eq('user_id', user.id)
    .eq('category_id', categoryId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('knowledge_certificates')
      .update({
        total_lessons: lessonIds.length,
        completed_lessons: lessonIds.length,
        passed_exercises: exIds.length,
        total_exercises: exIds.length,
        avg_exercise_score: 100,
        status: 'issued',
        revoked_at: null,
      })
      .eq('id', existing.id);
    console.log(`✓ Chứng nhận đã có: ${existing.certificate_number}`);
  } else {
    const { data: certNum } = await supabase.rpc('knowledge_next_certificate_number');
    const { data: verifyCode } = await supabase.rpc('knowledge_random_verify_code');
    const { data: cat } = await supabase.from('knowledge_categories').select('name').eq('id', categoryId).single();

    const { data: cert, error: certErr } = await supabase
      .from('knowledge_certificates')
      .insert({
        user_id: user.id,
        category_id: categoryId,
        certificate_number: certNum || `CN-${new Date().getFullYear()}-ADMIN`,
        verify_code: verifyCode || 'ADMINLEAD01',
        total_lessons: lessonIds.length,
        completed_lessons: lessonIds.length,
        avg_exercise_score: 100,
        passed_exercises: exIds.length,
        total_exercises: exIds.length,
        metadata: {
          full_name: user.full_name,
          email: user.email,
          role: user.role,
          company_id: user.company_id,
          category_name: cat?.name,
          backfill: true,
        },
        status: 'issued',
      })
      .select('certificate_number')
      .single();
    if (certErr) throw certErr;
    console.log(`✓ Cấp chứng nhận mới: ${cert.certificate_number}`);
  }

  console.log(`\nHoàn tất khoá "${catKey}" cho ${user.full_name} <${user.email}>`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
