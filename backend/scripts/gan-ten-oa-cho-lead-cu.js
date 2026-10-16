/**
 * Gắn tên OA vào tên các lead Zalo cũ:  "[Zalo Lead] Trần Văn Nam" → "… - OA Phúc Đạt"
 *
 * Truy OA qua zalo_contacts.oa_id (KHÔNG theo nguồn/tên) nên không đụng
 * các lead nhập tay cũng mang nguồn "Zalo".
 * Giữ nguyên phần tên hiện có, chỉ nối thêm đuôi OA. Lead đã có đuôi thì bỏ qua.
 *
 * Mặc định CHỈ THỬ. Thêm --ghi để cập nhật thật (có file lùi trong backend/uploads/).
 * Chạy: cd backend && node scripts/gan-ten-oa-cho-lead-cu.js [--ghi]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');
const { tenKemOa } = require('../src/helpers/zaloBatchTools');

const GHI = process.argv.includes('--ghi');

(async () => {
  const { data: oas } = await supabase.from('zalo_oa_accounts').select('oa_id, oa_name');
  console.log(GHI ? '*** CHẾ ĐỘ GHI ***\n' : '*** CHỈ THỬ — thêm --ghi để cập nhật thật ***\n');

  const canSua = [];
  const boQua = { daCoDuoi: 0, khongThayLead: 0, oaChuaDatTen: 0 };

  for (const oa of oas || []) {
    if (!oa.oa_name) {
      const { count } = await supabase.from('zalo_contacts')
        .select('*', { count: 'exact', head: true }).eq('oa_id', oa.oa_id).not('lead_id', 'is', null);
      boQua.oaChuaDatTen += count || 0;
      console.log(`⚠️  OA ${oa.oa_id} chưa đặt tên — bỏ qua ${count || 0} lead\n`);
      continue;
    }

    const { data: ct } = await supabase.from('zalo_contacts')
      .select('lead_id').eq('oa_id', oa.oa_id).not('lead_id', 'is', null);
    const ids = [...new Set((ct || []).map((c) => c.lead_id))];
    console.log(`=== ${oa.oa_name}: ${ids.length} lead ===`);

    for (let i = 0; i < ids.length; i += 100) {
      const lo = ids.slice(i, i + 100);
      const { data: leads } = await supabase.from('crm_leads').select('id, code, title').in('id', lo);
      for (const l of leads || []) {
        const moi = tenKemOa(l.title, oa.oa_name);
        if (moi === l.title) { boQua.daCoDuoi += 1; continue; }
        canSua.push({ id: l.id, code: l.code, cu: l.title, moi });
      }
      boQua.khongThayLead += lo.length - (leads || []).length;
    }
  }

  console.log(`\n=== TỔNG KẾT ===`);
  console.log(`  cần sửa        : ${canSua.length}`);
  console.log(`  đã có đuôi OA  : ${boQua.daCoDuoi}`);
  console.log(`  lead không thấy: ${boQua.khongThayLead}`);
  console.log(`  OA chưa đặt tên: ${boQua.oaChuaDatTen}`);

  console.log(`\n=== 8 VÍ DỤ ĐẦU ===`);
  for (const r of canSua.slice(0, 8)) console.log(`  ${r.code}\n    cũ : ${r.cu}\n    mới: ${r.moi}`);

  if (!GHI) { console.log('\n→ Chưa ghi gì. Thêm --ghi để cập nhật thật.'); return; }
  if (!canSua.length) { console.log('\n→ Không có gì để sửa.'); return; }

  const fLui = path.join(__dirname, '../uploads', `_rollback_ten_lead_oa_${Date.now()}.json`);
  fs.writeFileSync(fLui, JSON.stringify(canSua, null, 2), 'utf8');
  console.log(`\nĐã ghi file lùi: ${fLui}`);

  let ok = 0; let loi = 0;
  const nowIso = new Date().toISOString();
  for (const r of canSua) {
    const { error } = await supabase.from('crm_leads')
      .update({ title: r.moi, updated_at: nowIso }).eq('id', r.id);
    if (error) { loi += 1; console.log(`  ❌ ${r.code}: ${error.message}`); } else { ok += 1; }
    if (ok % 50 === 0 && ok) console.log(`  … ${ok}/${canSua.length}`);
  }
  console.log(`\n✅ Xong: ${ok} cập nhật, ${loi} lỗi`);
})().catch((e) => console.log('NGOẠI LỆ:', e.message));
