#!/usr/bin/env node
/**
 * Ra soat: nhiem vu SX co dung nguoi phu trach theo cot cong doan chua.
 *
 *   node backend/scripts/ra-soat-nguoi-nhan-nhiem-vu-sx.js
 *   node backend/scripts/ra-soat-nguoi-nhan-nhiem-vu-sx.js --cong-ty=<uuid>
 *
 * CHI DOC, khong ghi gi.
 *
 * Doi chieu assignee_id cua nhiem vu chua xong voi nguoi phu trach CHINH cua cot ma bo
 * mau sinh ra no da gan. Lech thi liet ke ra.
 *
 * Bo mau khong gan cot thi khong co chuan de doi chieu — gom rieng, vi do moi la goc
 * cua chuyen «mot nguoi om het»: khong gan cot thi nguoi nhan roi ve phu trach chinh
 * cua phan loai xuong.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { supabase } = require('../src/config/supabase');

const argCty = (process.argv.find((a) => a.startsWith('--cong-ty=')) || '').split('=')[1];
const HCB = '18c2563f-3495-498d-8199-23200c9f420e';
const CTY = argCty || HCB;

const tenCache = new Map();
async function tenNguoi(id) {
  if (!id) return '(trong)';
  const k = String(id);
  if (!tenCache.has(k)) {
    const { data } = await supabase.from('users').select('full_name').eq('id', id).maybeSingle();
    tenCache.set(k, data?.full_name || k.slice(0, 8));
  }
  return tenCache.get(k);
}

async function main() {
  console.log('\nRa soat nguoi nhan nhiem vu SX — CHI DOC\n');

  const { data: tpls } = await supabase
    .from('workshop_task_templates')
    .select('id, name, production_stage_id, workshop_type_id')
    .eq('company_id', CTY)
    .eq('workshop_area', 'production')
    .eq('is_active', true);

  const { data: loai } = await supabase
    .from('workshop_project_types').select('id, name').eq('company_id', CTY);
  const tenLoai = new Map((loai || []).map((l) => [String(l.id), l.name]));

  // Người phụ trách chính của từng cột
  const phuTrachCot = new Map();
  const tenCot = new Map();
  const cotIds = [...new Set((tpls || []).map((t) => t.production_stage_id).filter(Boolean))];
  for (const cid of cotIds) {
    const { data: c } = await supabase
      .from('production_pipeline_stages').select('name').eq('id', cid).maybeSingle();
    tenCot.set(String(cid), c?.name || '?');
    const { data: st } = await supabase
      .from('production_pipeline_stage_default_staff')
      .select('user_id').eq('production_pipeline_stage_id', cid)
      .eq('is_primary', true).order('order_index', { ascending: true }).limit(1);
    if (st?.[0]?.user_id) phuTrachCot.set(String(cid), String(st[0].user_id));
  }

  const lech = [];
  const khongChuan = [];
  let dung = 0;
  let tong = 0;

  for (const t of tpls || []) {
    const { data: ts } = await supabase
      .from('tasks')
      .select('id, title, assignee_id, project_id')
      .neq('status', 'done')
      .contains('metadata', { workshop_template_id: String(t.id) })
      .limit(3000);
    if (!ts?.length) continue;
    tong += ts.length;

    const nhan = t.production_stage_id ? phuTrachCot.get(String(t.production_stage_id)) : null;
    const nhanBo = {
      boMau: t.name,
      loai: tenLoai.get(String(t.workshop_type_id)) || 'KHONG PHAN LOAI',
      cot: t.production_stage_id ? tenCot.get(String(t.production_stage_id)) : null,
      so: ts.length,
    };

    if (!t.production_stage_id) { khongChuan.push({ ...nhanBo, ly_do: 'bo mau chua gan cot' }); continue; }
    if (!nhan) { khongChuan.push({ ...nhanBo, ly_do: 'cot chua khai nguoi phu trach' }); continue; }

    const sai = ts.filter((x) => String(x.assignee_id || '') !== String(nhan));
    dung += ts.length - sai.length;
    if (sai.length) {
      const dem = {};
      for (const x of sai) {
        const k = await tenNguoi(x.assignee_id);
        dem[k] = (dem[k] || 0) + 1;
      }
      lech.push({ ...nhanBo, dung: await tenNguoi(nhan), sai: sai.length, dangGiu: dem });
    }
  }

  console.log(`Tong nhiem vu chua xong (sinh tu bo mau): ${tong}`);
  console.log(`   dung nguoi theo cot : ${dung}`);
  console.log(`   LECH                : ${lech.reduce((n, x) => n + x.sai, 0)}`);
  console.log(`   khong doi chieu duoc: ${khongChuan.reduce((n, x) => n + x.so, 0)}`);

  if (lech.length) {
    console.log('\n--- LECH NGUOI ---');
    lech.sort((a, b) => b.sai - a.sai).forEach((x) => {
      console.log(`\n[${x.loai}] ${x.boMau}  (cot «${x.cot}»)`);
      console.log(`   dung ra phai la: ${x.dung}  |  lech ${x.sai}/${x.so}`);
      Object.entries(x.dangGiu).sort((a, b) => b[1] - a[1])
        .forEach(([k, v]) => console.log(`      dang o: ${k} — ${v}`));
    });
  }

  if (khongChuan.length) {
    console.log('\n--- KHONG CO CHUAN DE DOI CHIEU ---');
    khongChuan.sort((a, b) => b.so - a.so).forEach((x) => {
      console.log(`   [${x.loai}] ${x.boMau}  — ${x.so} nhiem vu — ${x.ly_do}`);
    });
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\nLoi:', e.message);
  process.exit(1);
});
