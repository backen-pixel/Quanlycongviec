/**
 * Gửi thông báo mời nhân viên HCB học khoá "Quy trình vận hành module sản xuất - phát sinh".
 *
 * Mặc định CHỈ THỬ — in ra danh sách sẽ nhận và nội dung, KHÔNG ghi gì.
 * Thêm --ghi để gửi thật (có file lùi trong backend/uploads/).
 *
 * Nhân viên HCB giải theo HAI đường: users.company_id, và departments.company_id
 * (nhiều tài khoản để trống company_id — xem resolveCompanyIdForUser).
 *
 * Chạy: cd backend && node scripts/thong-bao-khoa-hoc-hcb.js [--ghi]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');

const GHI = process.argv.includes('--ghi');
const HCB = '18c2563f-3495-498d-8199-23200c9f420e';
const TEN_KHOA = 'Quy trình vận hành module sản xuất - phát sinh';

(async () => {
  const { data: cat } = await supabase.from('knowledge_categories')
    .select('id, name').eq('name', TEN_KHOA).maybeSingle();
  if (!cat) { console.log(`Không tìm thấy khoá "${TEN_KHOA}"`); return; }

  const { data: ls } = await supabase.from('knowledge_lessons')
    .select('id, title').eq('category_id', cat.id).order('created_at');
  console.log(`=== KHOÁ "${cat.name}" — ${(ls || []).length} bài ===`);

  // Phòng ban thuộc HCB
  const { data: dps } = await supabase.from('departments').select('id, name').eq('company_id', HCB);
  const dpIds = (dps || []).map((d) => d.id);
  console.log(`  phòng ban HCB: ${dpIds.length}`);

  const nv = new Map();
  const { data: a } = await supabase.from('users')
    .select('id, full_name, email, role, is_active, company_id, department_id').eq('company_id', HCB);
  for (const u of a || []) nv.set(String(u.id), u);
  for (let i = 0; i < dpIds.length; i += 40) {
    const { data: b } = await supabase.from('users')
      .select('id, full_name, email, role, is_active, company_id, department_id')
      .in('department_id', dpIds.slice(i, i + 40));
    for (const u of b || []) nv.set(String(u.id), u);
  }

  const dsHoatDong = [...nv.values()].filter((u) => u.is_active !== false);
  const dsTat = [...nv.values()].filter((u) => u.is_active === false);
  console.log(`  nhân viên HCB: ${nv.size}  (đang hoạt động ${dsHoatDong.length} · đã tắt ${dsTat.length})`);

  // Ai đã học rồi thì không mời lại
  const daHoc = new Set();
  for (const l of ls || []) {
    const { data: pg } = await supabase.from('knowledge_lesson_progress')
      .select('user_id').eq('lesson_id', l.id);
    for (const p of pg || []) if (p.user_id) daHoc.add(String(p.user_id));
  }
  const nhan = dsHoatDong.filter((u) => !daHoc.has(String(u.id)));
  console.log(`  đã từng mở khoá này: ${dsHoatDong.filter((u) => daHoc.has(String(u.id))).length}`);
  console.log(`  ⇒ SẼ GỬI CHO: ${nhan.length} người\n`);

  const theoVai = {};
  for (const u of nhan) theoVai[u.role || '—'] = (theoVai[u.role || '—'] || 0) + 1;
  console.log('  theo vai trò: ' + Object.entries(theoVai).map(([k, v]) => `${k}=${v}`).join(' · '));
  console.log('\n  danh sách:');
  for (const u of nhan) console.log(`    ${(u.full_name || u.email || u.id).padEnd(30)} ${u.role || '—'}`);

  const tieuDe = '📚 Khoá học bắt buộc: Quy trình vận hành module sản xuất';
  const noiDung = `Mời bạn hoàn thành khoá "${cat.name}" — ${(ls || []).length} bài, gồm 2 bài kiểm tra.`
    + ' Khoá hướng dẫn cách dùng trang quản lý nhiệm vụ, công việc và xử lý phát sinh tại xưởng.';

  console.log(`\n=== NỘI DUNG THÔNG BÁO ===`);
  console.log(`  tiêu đề : ${tieuDe}`);
  console.log(`  nội dung: ${noiDung}`);
  console.log(`  dẫn tới : knowledge_category ${cat.id}`);

  if (!GHI) { console.log('\n*** CHỈ THỬ — chưa gửi gì. Thêm --ghi để gửi thật ***'); return; }
  if (!nhan.length) { console.log('\n→ Không có ai để gửi.'); return; }

  const rows = nhan.map((u) => ({
    user_id: u.id,
    type: 'knowledge_course_assigned',
    title: tieuDe,
    message: noiDung,
    entity_type: 'knowledge_category',
    entity_id: cat.id,
    is_read: false,
    metadata: { category_id: cat.id, category_name: cat.name, lesson_count: (ls || []).length, link: `/knowledge?category=${cat.id}` },
  }));

  const f = path.join(__dirname, '../uploads', `_rollback_thongbao_khoahoc_${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify({ gui_cho: nhan.map((u) => ({ id: u.id, ten: u.full_name || u.email })), rows }, null, 2), 'utf8');
  console.log(`\nĐã ghi file lùi: ${f}`);

  const { data: ins, error } = await supabase.from('notifications').insert(rows).select('id');
  if (error) { console.log(`❌ LỖI: ${error.message}`); return; }
  console.log(`✅ Đã gửi ${(ins || []).length} thông báo.`);
})().catch((e) => console.log('NGOẠI LỆ:', e.message));
