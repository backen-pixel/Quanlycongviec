/**
 * Anh Tám (TB-2026-767) đang nhầm Cửa Phúc Đạt.
 * Đặt lại Tủ bếp tại Hucabi từ dự án nguồn Metalla TB-2026-740, rồi hủy bản Phúc Đạt.
 *
 *   node scripts/reclassify-anh-tam-to-hcb-tu.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { supabase } = require('../src/config/supabase');
const { placeProjectAtWorkshops } = require('../src/helpers/placeProjectAtWorkshops');

const SOURCE_PROJECT_ID = '85602d39-72f1-4f77-9ba2-e2b9cf07dd23'; // TB-2026-740 Metalla
const PHUCDAT_PROJECT_ID = '7955c600-23d5-4e11-a462-00fea010866d'; // TB-2026-767
const PHUCDAT_DEAL_ID = '126cda84-8799-4b51-bd6a-a2b137e12654'; // DEAL-2026-1401
const HCB_COMPANY_ID = '18c2563f-3495-498d-8199-23200c9f420e';
const HCB_TU_TYPE_ID = '8814095f-f5c7-411e-b83e-aa01a1d7718c';
const PHUCDAT_LOST_STAGE_ID = 'f8a238c8-63d6-4e6e-8a00-26f687af7b65'; // Thua.
const ADMIN_ID = '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e';
const LOST_REASON = 'Chuyển lại Tủ bếp Hucabi — không phải Cửa Phúc Đạt (TB-2026-767)';

const APPLY = process.argv.includes('--apply');

async function main() {
  const { data: source, error: srcErr } = await supabase
    .from('projects')
    .select('id, code, name, company_id, status, delivery_date, production_finish_date, install_date')
    .eq('id', SOURCE_PROJECT_ID)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (!source) throw new Error('Không thấy dự án nguồn TB-2026-740');

  const { data: phucdat } = await supabase
    .from('projects')
    .select('id, code, name, company_id, status, workshop_type_id')
    .eq('id', PHUCDAT_PROJECT_ID)
    .maybeSingle();
  if (!phucdat) throw new Error('Không thấy TB-2026-767');

  const { data: existing } = await supabase
    .from('project_workshop_placements')
    .select('id, target_project_id, target_company_id, workshop_type_id')
    .eq('source_project_id', SOURCE_PROJECT_ID);

  const alreadyHcbTu = (existing || []).some(
    (r) => String(r.target_company_id) === HCB_COMPANY_ID
      && String(r.workshop_type_id) === HCB_TU_TYPE_ID,
  );
  const phucdatPlacement = (existing || []).find(
    (r) => String(r.target_project_id) === PHUCDAT_PROJECT_ID,
  );

  console.log(JSON.stringify({
    apply: APPLY,
    source: { code: source.code, status: source.status, delivery_date: source.delivery_date },
    phucdat: { code: phucdat.code, status: phucdat.status },
    alreadyHcbTu,
    phucdatPlacementId: phucdatPlacement?.id || null,
  }, null, 2));

  if (!APPLY) {
    console.log('Dry-run. Chạy lại với --apply để ghi.');
    return;
  }
  if (alreadyHcbTu) {
    console.log('Đã có Hucabi · Tủ bếp — bỏ qua bước đặt xưởng.');
  } else {
    const result = await placeProjectAtWorkshops({
      req: { user: { userId: ADMIN_ID, id: ADMIN_ID, role: 'admin', company_id: null } },
      user: { userId: ADMIN_ID, id: ADMIN_ID, role: 'admin', company_id: null },
      sourceProjectId: SOURCE_PROJECT_ID,
      targets: [{
        production_company_id: HCB_COMPANY_ID,
        workshop_type_id: HCB_TU_TYPE_ID,
        delivery_date: source.delivery_date,
        production_finish_date: source.production_finish_date,
        install_date: source.install_date,
      }],
    });
    console.log('place-at-workshops:', JSON.stringify({
      ok: result.ok,
      created: (result.created || []).map((r) => ({
        project_code: r.project_code,
        project_id: r.project_id,
        deal_code: r.deal_code,
        company_name: r.company_name,
      })),
      errors: result.errors,
      error: result.error,
    }, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
      return;
    }
  }

  if (phucdatPlacement?.id) {
    const { error: delPlaceErr } = await supabase
      .from('project_workshop_placements')
      .delete()
      .eq('id', phucdatPlacement.id);
    if (delPlaceErr) throw delPlaceErr;
    console.log('Đã gỡ liên kết đặt xưởng Phúc Đạt', phucdatPlacement.id);
  }

  if (phucdat.status !== 'cancelled') {
    const { error: cancelErr } = await supabase
      .from('projects')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', PHUCDAT_PROJECT_ID);
    if (cancelErr) throw cancelErr;
    console.log('Đã hủy TB-2026-767');
  }

  const { error: lostErr } = await supabase
    .from('crm_leads')
    .update({
      stage_id: PHUCDAT_LOST_STAGE_ID,
      lost_reason: LOST_REASON,
      updated_at: new Date().toISOString(),
    })
    .eq('id', PHUCDAT_DEAL_ID);
  if (lostErr) throw lostErr;
  console.log('Deal Phúc Đạt DEAL-2026-1401 → Thua.');

  await supabase.from('project_comments').insert({
    project_id: SOURCE_PROJECT_ID,
    user_id: ADMIN_ID,
    content: 'Đã chuyển phần tủ từ Cửa Phúc Đạt (TB-2026-767, đã hủy) sang Hucabi · Tủ bếp. Giữ Cánh kính HCB và Data đầu ra Metalla.',
  });

  await new Promise((r) => setTimeout(r, 2500));

  const { data: placed } = await supabase
    .from('project_workshop_placements')
    .select(`
      target_project_id,
      workshop_type_id,
      target_project:projects!project_workshop_placements_target_project_id_fkey(code, name, status, production_person_id),
      target_company:companies!project_workshop_placements_target_company_id_fkey(name),
      workshop_type:workshop_project_types!project_workshop_placements_workshop_type_id_fkey(name)
    `)
    .eq('source_project_id', SOURCE_PROJECT_ID);

  const { data: cancelled } = await supabase
    .from('projects')
    .select('code, status')
    .eq('id', PHUCDAT_PROJECT_ID)
    .maybeSingle();

  console.log('placements:', JSON.stringify(placed, null, 2));
  console.log('phucdat after:', cancelled);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
