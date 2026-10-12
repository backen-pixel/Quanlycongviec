#!/usr/bin/env node
/**
 * Doi nguoi nhan cua cac nhiem vu CONG NO ve dung phu trach cot «Thu tien».
 *
 *   node backend/scripts/doi-nguoi-nhan-cong-no-ve-kim-vy.js          # thu, khong ghi
 *   node backend/scripts/doi-nguoi-nhan-cong-no-ve-kim-vy.js --ghi    # ghi that
 *
 * BOI CANH
 * Bo mau «Cong no va thu tien» [Tu bep] truoc day khong gan production_stage_id, nen khi
 * sinh nhiem vu, nguoi nhan roi ve «phu trach chinh cua phan loai xuong».
 * Ngay 28/09/2026 co nguoi khai 19 nhan su vao phan loai Tu bep va dat Sang Thiet Ke VPT 1
 * lam CHINH — tu do moi nhiem vu cong no deu ve Sang, du cot «Thu tien» van khai Kim Vy.
 *
 * Bo mau da duoc gan cot (xem gan-cot-bo-mau-xuong-hcb.js) nen nhiem vu SINH RA TU GIO da
 * dung. Script nay xu ly cac nhiem vu DA TAO truoc do.
 *
 * Chi dung den nhiem vu CHUA XONG. Viec da hoan thanh giu nguyen nguoi lam that —
 * sua lai se lam sai lich su.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { supabase } = require('../src/config/supabase');

const GHI = process.argv.includes('--ghi');
const HCB = '18c2563f-3495-498d-8199-23200c9f420e';
const TEN_BO_MAU = 'Công nợ và thu tiền';

async function tenNguoi(id) {
  if (!id) return '(trong)';
  const { data } = await supabase.from('users').select('full_name').eq('id', id).maybeSingle();
  return data?.full_name || String(id).slice(0, 8);
}

async function main() {
  console.log(`\nDoi nguoi nhan nhiem vu «${TEN_BO_MAU}»`);
  console.log(GHI ? '   CHE DO: GHI THAT\n' : '   CHE DO: THU (khong ghi) — them --ghi de chay that\n');

  // 1. Bộ mẫu + cột + người phụ trách cột
  const { data: tpls } = await supabase
    .from('workshop_task_templates')
    .select('id, name, production_stage_id, workshop_type_id')
    .eq('company_id', HCB)
    .eq('name', TEN_BO_MAU);
  if (!tpls?.length) { console.log('Khong tim thay bo mau.'); return; }

  const dichTheoTpl = new Map();
  for (const t of tpls) {
    if (!t.production_stage_id) {
      console.log(`!! bo mau ${t.id} chua gan cot — bo qua`);
      continue;
    }
    const { data: cot } = await supabase
      .from('production_pipeline_stages').select('name').eq('id', t.production_stage_id).maybeSingle();
    const { data: st } = await supabase
      .from('production_pipeline_stage_default_staff')
      .select('user_id')
      .eq('production_pipeline_stage_id', t.production_stage_id)
      .eq('is_primary', true)
      .order('order_index', { ascending: true })
      .limit(1);
    const uid = st?.[0]?.user_id || null;
    if (!uid) { console.log(`!! cot «${cot?.name}» chua khai nguoi — bo qua`); continue; }
    dichTheoTpl.set(String(t.id), uid);
    console.log(`Bo mau ${t.id} -> cot «${cot?.name}» -> ${await tenNguoi(uid)}`);
  }
  if (!dichTheoTpl.size) { console.log('\nKhong co bo mau nao dung duoc.'); return; }

  // 2. Nhiệm vụ chưa xong sinh từ các bộ mẫu đó
  const canDoi = [];
  for (const tplId of dichTheoTpl.keys()) {
    const { data: ts, error } = await supabase
      .from('tasks')
      .select('id, title, assignee_id, project_id, status')
      .neq('status', 'done')
      .contains('metadata', { workshop_template_id: tplId })
      .limit(2000);
    if (error) { console.log(`!! doc nhiem vu: ${error.message}`); continue; }
    const dich = dichTheoTpl.get(tplId);
    (ts || []).forEach((t) => {
      if (String(t.assignee_id || '') === String(dich)) return;   // da dung
      canDoi.push({ ...t, dich });
    });
  }

  console.log(`\nNhiem vu chua xong can doi nguoi: ${canDoi.length}`);
  if (!canDoi.length) { console.log('Khong co gi de doi.'); return; }

  // Thống kê người đang giữ
  const dem = {};
  for (const t of canDoi) {
    const k = await tenNguoi(t.assignee_id);
    dem[k] = (dem[k] || 0) + 1;
  }
  console.log('Dang thuoc ve:');
  Object.entries(dem).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   ${k}: ${v}`));

  if (!GHI) {
    console.log('\nChua ghi gi. Them --ghi de chay that.');
    return;
  }

  let ok = 0;
  let loi = 0;
  for (let i = 0; i < canDoi.length; i += 100) {
    const lo = canDoi.slice(i, i + 100);
    const theoDich = new Map();
    lo.forEach((t) => {
      const k = String(t.dich);
      if (!theoDich.has(k)) theoDich.set(k, []);
      theoDich.get(k).push(t.id);
    });
    for (const [uid, ids] of theoDich) {
      const { error } = await supabase
        .from('tasks')
        .update({ assignee_id: uid, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) { console.log(`   LOI: ${error.message}`); loi += ids.length; continue; }
      ok += ids.length;
    }
  }
  console.log(`\nDa doi: ${ok} nhiem vu | loi: ${loi}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\nLoi:', e.message);
  process.exit(1);
});
