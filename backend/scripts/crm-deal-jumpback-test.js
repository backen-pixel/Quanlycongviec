/**
 * Test các case "deal bị nhảy ngược lại" trên Kanban CRM.
 *
 * Chạy:
 *   node scripts/crm-deal-jumpback-test.js                     # dùng deal test mặc định
 *   node scripts/crm-deal-jumpback-test.js --lead <uuid>       # deal khác
 *   node scripts/crm-deal-jumpback-test.js --base http://localhost:4000
 *
 * Yêu cầu: backend đang chạy (npm run dev) + .env có JWT_SECRET/SUPABASE keys.
 *
 * Script kéo deal thật qua nhiều cột rồi TRẢ VỀ cột ban đầu ở cuối (kể cả khi lỗi).
 * Mỗi case kiểm tra 3 lớp: HTTP status → stage_id trong response → stage_id trong DB.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { supabase } = require('../src/config/supabase');
const { syncCrmLeadSxPipelineFromProject } = require('../src/helpers/workshopKanban');

const DEFAULT_LEAD_ID = '5d3b90e3-f838-421b-9a41-d023f26bc834'; // DEAL-2026-899 "test vc"
const ADMIN = {
  userId: '22258459-349e-4018-b526-135ad3e92a8b',
  email: 'backen@gmail.com',
  role: 'admin',
  fullName: 'Khoa IT',
  company_id: null,
  tenant_id: null,
  department_id: null,
  crm_region_ids: [],
};

function parseArgs() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith('--')) out[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[i += 1] : true;
  }
  return out;
}
const args = parseArgs();
const BASE = args.base || 'http://localhost:4000';
const LEAD_ID = args.lead || DEFAULT_LEAD_ID;
const TOKEN = args.token || jwt.sign(ADMIN, config.jwtSecret);

let passed = 0;
let failed = 0;
const failures = [];
const c = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

function ok(msg) { passed += 1; console.log(`  ${c.g}PASS${c.x} ${msg}`); }
function fail(msg) { failed += 1; failures.push(msg); console.log(`  ${c.r}FAIL${c.x} ${msg}`); }
function info(msg) { console.log(`  ${c.d}··   ${msg}${c.x}`); }
function warn(msg) { console.log(`  ${c.y}WARN${c.x} ${msg}`); }
function head(msg) { console.log(`\n${c.b}${msg}${c.x}`); }

async function apiFetch(method, path, { body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* non-json */ }
  return { status: res.status, json, raw, headers: res.headers };
}

/**
 * GET mô phỏng HTTP cache của trình duyệt: tôn trọng `Cache-Control: max-age`.
 * Chrome/Edge trả thẳng response cũ trong TTL mà KHÔNG hỏi server — đây là
 * cơ chế làm thẻ Kanban nhảy về cột cũ dù DB đã đúng.
 */
const browserCache = new Map();
async function browserGet(path) {
  const hit = browserCache.get(path);
  if (hit && Date.now() - hit.storedAt < hit.maxAgeMs) {
    return { ...hit.res, fromBrowserCache: true, ageMs: Date.now() - hit.storedAt };
  }
  const res = await apiFetch('GET', path);
  const cc = res.headers.get('cache-control') || '';
  const m = /max-age=(\d+)/.exec(cc);
  if (m && !/no-store|no-cache/.test(cc)) {
    browserCache.set(path, { res, storedAt: Date.now(), maxAgeMs: Number(m[1]) * 1000 });
  }
  return { ...res, fromBrowserCache: false, cacheControl: cc };
}

const FE_ROOT = path.resolve(__dirname, '../../frontend');
const readFe = (rel) => fs.readFileSync(path.join(FE_ROOT, rel), 'utf8');
/** frontend là ESM ("type": "module") → import động để test hàm thuần. */
const importFe = (rel) => import(pathToFileURL(path.join(FE_ROOT, rel)).href);

async function dbLead() {
  const { data } = await supabase
    .from('crm_leads')
    .select('id, code, title, type, stage_id, project_id, pipeline_id, company_id, sx_handover_at, actual_close_date, sx_pipeline_stage_id')
    .eq('id', LEAD_ID)
    .single();
  return data;
}

async function moveStage(stageId, extra = {}) {
  return apiFetch('PATCH', `/api/crm/leads/${LEAD_ID}/stage`, { body: { stage_id: stageId, ...extra } });
}

/**
 * 1 case = kéo thẻ sang `target` rồi kiểm tra thẻ có nằm đúng chỗ ở cả 3 lớp.
 * `alsoRunSxSync`: chạy thêm sync SX→CRM để bắt case nhảy ngược trễ (xưởng chạm project).
 */
async function caseMove(label, target, stageName, {
  alsoRunSxSync = false,
  projectId = null,
  syncExpectStageId = null,
  syncExpectNote = '',
} = {}) {
  const res = await moveStage(target);
  if (res.status !== 200) {
    fail(`${label}: HTTP ${res.status} — ${res.json?.error || res.raw?.slice(0, 200)}`);
    if (res.json?.code) info(`code=${res.json.code} (gate chặn → FE rollback thẻ về cột cũ)`);
    return false;
  }
  const respStage = res.json?.stage_id || null;
  if (String(respStage) === String(target)) {
    ok(`${label}: response.stage_id = «${stageName}»`);
  } else {
    fail(`${label}: response.stage_id KHÁC cột đã kéo → FE merge xong thẻ nhảy về «${await stageNameOf(respStage)}»`);
  }
  const after = await dbLead();
  if (String(after.stage_id) === String(target)) {
    ok(`${label}: DB giữ «${stageName}»`);
  } else {
    fail(`${label}: DB = «${await stageNameOf(after.stage_id)}» (bị ghi đè ngay trong request)`);
  }
  if (alsoRunSxSync && projectId) {
    await syncCrmLeadSxPipelineFromProject(projectId);
    const afterSync = await dbLead();
    const expected = syncExpectStageId || target;
    const expectedName = await stageNameOf(expected);
    const suffix = syncExpectStageId ? ` (${syncExpectNote})` : '';
    if (String(afterSync.stage_id) === String(expected)) {
      ok(`${label}: sau khi xưởng chạm project (sync SX→CRM) → «${expectedName}»${suffix}`);
    } else {
      fail(`${label}: sync SX→CRM đưa thẻ về «${await stageNameOf(afterSync.stage_id)}», mong đợi «${expectedName}»`);
    }
  }
  return true;
}

const stageNameCache = new Map();
async function stageNameOf(stageId) {
  if (!stageId) return '(null)';
  const k = String(stageId);
  if (stageNameCache.has(k)) return stageNameCache.get(k);
  const { data } = await supabase.from('crm_pipeline_stages').select('name').eq('id', k).maybeSingle();
  const n = data?.name || k;
  stageNameCache.set(k, n);
  return n;
}

async function main() {
  console.log(`${c.b}=== TEST: deal bị nhảy ngược lại (CRM Kanban) ===${c.x}`);
  console.log(`base=${BASE} lead=${LEAD_ID}`);

  const lead0 = await dbLead();
  if (!lead0) throw new Error(`Không tìm thấy deal ${LEAD_ID}`);
  const { data: stages } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name, order_index, is_won, is_lost, sync_role, requires_deadline')
    .eq('pipeline_id', lead0.pipeline_id)
    .order('order_index');
  for (const s of stages) stageNameCache.set(String(s.id), s.name);

  const wonAnchor = [...stages].filter((s) => s.is_won).sort((a, b) => b.order_index - a.order_index)[0];
  const preWon = [...stages]
    .filter((s) => !s.is_won && !s.is_lost && s.order_index < (wonAnchor?.order_index ?? 99) && !s.requires_deadline)
    .sort((a, b) => b.order_index - a.order_index);
  const sxStage = stages.find((s) => s.sync_role === 'sx_production');
  const vcStage = stages.find((s) => s.sync_role === 'vc_delivery');

  console.log(`deal=${lead0.code} «${lead0.title}» project=${lead0.project_id || '(none)'} sx_handover=${lead0.sx_handover_at ? 'có' : 'không'}`);
  console.log(`cột hiện tại = «${await stageNameOf(lead0.stage_id)}»`);
  console.log(`Thắng(anchor)=«${wonAnchor?.name}» SX=«${sxStage?.name}» VC=«${vcStage?.name}» pre-won mẫu=«${preWon[0]?.name}», «${preWon[1]?.name}»`);
  if (!lead0.project_id) warn('Deal chưa liên kết project — các case liên quan sản xuất sẽ bị bỏ qua');

  const originalStageId = lead0.stage_id;
  let savedProjectColumnId = null;
  try {
    head('CASE 1 — Kéo ngược từ cột sau Thắng về cột bán hàng (đã liên kết sản xuất)');
    info('Kỳ vọng: không bị chặn, thẻ nằm ở cột bán hàng, sync SX không kéo về');
    await caseMove('1a post-won → pre-won', preWon[0].id, preWon[0].name, {
      alsoRunSxSync: true,
      projectId: lead0.project_id,
    });

    head('CASE 2 — Kéo qua lại giữa 2 cột bán hàng');
    await caseMove('2a pre-won → pre-won (tiến)', preWon[1].id, preWon[1].name);
    await caseMove('2b pre-won → pre-won (lùi)', preWon[0].id, preWon[0].name);

    head('CASE 3 — Kéo lại lên cột Thắng khi deal đã có project');
    info('Kỳ vọng: giữ ở Thắng ngay sau khi kéo; sync nền vẫn tự tiến sang cột xưởng (thiết kế)');
    await caseMove('3a pre-won → Thắng', wonAnchor.id, wonAnchor.name, {
      alsoRunSxSync: true,
      projectId: lead0.project_id,
      syncExpectStageId: sxStage?.id || null,
      syncExpectNote: 'Thắng tự tiến sang cột xưởng — đúng thiết kế',
    });
    const afterWon = await dbLead();
    if (String(afterWon.project_id) === String(lead0.project_id)) ok('3b không tạo project trùng (project_id không đổi)');
    else fail(`3b project_id đổi: ${lead0.project_id} → ${afterWon.project_id}`);

    head('CASE 4 — Kéo sang cột Sản xuất (sync_role=sx_production)');
    if (sxStage) {
      await caseMove('4a Thắng → Sản xuất', sxStage.id, sxStage.name, {
        alsoRunSxSync: true,
        projectId: lead0.project_id,
      });
    } else warn('Pipeline không có cột sync_role=sx_production — bỏ qua');

    head('CASE 5 — Kéo giữa 2 cột sau Thắng (Sản xuất → Vận chuyển)');
    info('Kỳ vọng: thẻ ở Vận chuyển; nếu bị auto-sync ghi đè sẽ nhảy về Sản xuất ngay trong request');
    if (vcStage) {
      await caseMove('5a Sản xuất → Vận chuyển', vcStage.id, vcStage.name, {
        alsoRunSxSync: true,
        projectId: lead0.project_id,
      });
    } else warn('Pipeline không có cột sync_role=vc_delivery — bỏ qua');

    head('CASE 6 — Kéo 2 lần liên tiếp: endpoint realtime /crm/kanban-rows vs HTTP cache');
    info('FE gọi URL này mỗi khi nhận socket. Cùng URL trong TTL → trình duyệt trả bản cũ.');
    const rowsQuery = `lead_ids=${LEAD_ID}&lite=1&kanban=1&skip_deadline=1`;
    const rawRowsPath = `/api/crm/kanban-rows?${rowsQuery}`;
    const raw1 = await browserGet(rawRowsPath);
    info(`endpoint trả Cache-Control: ${raw1.cacheControl || '(none)'}`);
    const beforeCacheStage = (await dbLead()).stage_id;
    const otherStage = String(beforeCacheStage) === String(preWon[0].id) ? preWon[1] : preWon[0];
    const mv = await moveStage(otherStage.id);
    if (mv.status !== 200) {
      warn(`không kéo được để test cache (HTTP ${mv.status}) — bỏ qua case 6`);
    } else {
      const raw2 = await browserGet(rawRowsPath);
      const dbStage = (await dbLead()).stage_id;
      if (raw2.fromBrowserCache) {
        info(`URL trần: lần 2 lấy từ cache trình duyệt (age ${Math.round(raw2.ageMs / 1000)}s) → ${
          String(raw2.json?.data?.[0]?.stage_id) === String(dbStage) ? 'trùng DB' : 'CŨ'}`);
      }
      // FE thực tế gửi thêm _ts + x-no-cache → phải luôn khớp DB.
      const feRowsPath = `${rawRowsPath}&_ts=${Date.now()}`;
      const fe = await browserGet(feRowsPath);
      const feStage = fe.json?.data?.[0]?.stage_id || null;
      if (String(feStage) === String(dbStage)) ok('6a request kiểu FE (có _ts) trả stage khớp DB');
      else fail(`6a request kiểu FE trả «${await stageNameOf(feStage)}» còn DB «${await stageNameOf(dbStage)}»`);

      const rtSrc = readFe('src/lib/crmDashboardRealtime.js');
      if (/_ts:\s*Date\.now\(\)/.test(rtSrc) && /x-no-cache/.test(rtSrc)) {
        ok('6b fetchCrmKanbanRowsByIds có cache-bust (_ts + x-no-cache)');
      } else {
        fail('6b fetchCrmKanbanRowsByIds thiếu cache-bust → kéo 2 lần trong 10s sẽ nhảy ngược');
      }
    }

    head('CASE 7 — Danh sách Kanban /crm/leads còn cache 15s → lớp chặn phía FE');
    const listPath = `/api/crm/leads?type=deal&company_id=${lead0.company_id}&limit=200&offset=0`;
    const l1 = await browserGet(listPath);
    info(`endpoint trả Cache-Control: ${l1.cacheControl || '(none)'}`);
    const backTo = String((await dbLead()).stage_id) === String(preWon[0].id) ? preWon[1] : preWon[0];
    const mv2 = await moveStage(backTo.id);
    if (mv2.status !== 200) {
      warn(`không kéo được để test cache (HTTP ${mv2.status}) — bỏ qua case 7`);
    } else {
      const l2 = await browserGet(listPath);
      const rows = Array.isArray(l2.json) ? l2.json : (l2.json?.data || l2.json?.leads || []);
      const row = rows.find((x) => String(x.id) === String(LEAD_ID));
      const dbStage = (await dbLead()).stage_id;
      const staleList = !!row && String(row.stage_id) !== String(dbStage);
      if (l2.fromBrowserCache) info(`lần 2 lấy từ cache trình duyệt (age ${Math.round(l2.ageMs / 1000)}s)`);
      info(`danh sách ${staleList ? `còn CŨ («${await stageNameOf(row.stage_id)}» vs DB «${await stageNameOf(dbStage)}»)` : 'khớp DB'}`);

      // Overlay «cột vừa kéo» phải sửa đúng row cũ đó → thẻ không nhảy ngược.
      const { applyPendingCrmStageMoves } = await importFe('src/lib/crmDashboardRealtime.js');
      const pending = new Map([[String(LEAD_ID), { stageId: String(dbStage), at: Date.now() }]]);
      const fixed = applyPendingCrmStageMoves(rows, pending);
      const fixedRow = fixed.find((x) => String(x.id) === String(LEAD_ID));
      if (fixedRow && String(fixedRow.stage_id) === String(dbStage)) {
        ok('7a overlay đưa thẻ về đúng cột vừa kéo dù danh sách trả bản cũ');
      } else {
        fail('7a overlay không giữ được cột vừa kéo');
      }

      const dashSrc = readFe('src/pages/CRMDashboard.jsx');
      const overlayHooks = (dashSrc.match(/applyPendingCrmStageMoves\(/g) || []).length;
      if (overlayHooks >= 4) ok(`7b CRMDashboard áp overlay ở ${overlayHooks} nguồn list (cache session + load + refresh)`);
      else fail(`7b chỉ ${overlayHooks} nguồn list áp overlay — còn đường nhảy ngược`);
      if (/patchCrmDashboardCacheLeadFields\(lid,\s*\{[\s\S]{0,120}stage_id/.test(dashSrc)) {
        ok('7c cache sessionStorage được cập nhật sau khi kéo (không nhảy ngược khi quay lại tab <30s)');
      } else {
        fail('7c cache sessionStorage chưa được cập nhật sau khi kéo');
      }
    }

    head('CASE 8 — Hồi quy: xưởng đổi cột thì CRM vẫn phải nhảy theo');
    info('Chống nhảy ngược không được làm mất chiều SX → CRM');
    if (!lead0.project_id || !vcStage) {
      warn('thiếu project hoặc cột VC — bỏ qua');
    } else {
      const { data: proj } = await supabase
        .from('projects')
        .select('id, company_id, sx_kanban_column_id')
        .eq('id', lead0.project_id)
        .single();
      const { data: sxCols } = await supabase
        .from('production_pipeline_stages')
        .select('id, name, crm_target_stage_id, order_index')
        .eq('company_id', proj.company_id)
        .not('crm_target_stage_id', 'is', null)
        .order('order_index');
      const nextCol = (sxCols || []).find((x) => String(x.id) !== String(proj.sx_kanban_column_id));
      if (!nextCol) {
        warn('pipeline xưởng không có cột khác đã map cột CRM — bỏ qua');
      } else {
        savedProjectColumnId = proj.sx_kanban_column_id;
        await moveStage(vcStage.id); // Sale đang để deal ở cột Vận chuyển
        // Mô phỏng xưởng kéo project sang cột khác
        await supabase.from('projects').update({ sx_kanban_column_id: nextCol.id }).eq('id', lead0.project_id);
        await syncCrmLeadSxPipelineFromProject(lead0.project_id);
        const afterWorkshop = await dbLead();
        const wantStage = nextCol.crm_target_stage_id;
        if (String(afterWorkshop.stage_id) === String(wantStage)) {
          ok(`8a xưởng kéo sang «${nextCol.name}» → CRM nhảy sang «${await stageNameOf(wantStage)}»`);
        } else {
          fail(`8a xưởng kéo sang «${nextCol.name}» nhưng CRM vẫn ở «${await stageNameOf(afterWorkshop.stage_id)}»`);
        }
        if (String(afterWorkshop.sx_pipeline_stage_id) === String(nextCol.id)) ok('8b badge SX cập nhật theo cột mới');
        else fail(`8b badge SX chưa cập nhật (${afterWorkshop.sx_pipeline_stage_id})`);

        await syncCrmLeadSxPipelineFromProject(lead0.project_id);
        const afterIdempotent = await dbLead();
        if (String(afterIdempotent.stage_id) === String(wantStage)) ok('8c sync chạy lại không đổi kết quả (idempotent)');
        else fail(`8c sync lần 2 đổi cột thành «${await stageNameOf(afterIdempotent.stage_id)}»`);
      }
    }

    head('CASE 9 — Gate "đã liên kết sản xuất"');
    const gateFe = readFe('src/lib/crmDealStageGate.js');
    const gateBe = require('../src/helpers/crmDealStageGate');
    info(`BE CRM_PRODUCTION_LINK_STAGE_GATE = ${gateBe.CRM_PRODUCTION_LINK_STAGE_GATE}`);
    info(`FE CRM_PRODUCTION_LINK_STAGE_GATE = ${/CRM_PRODUCTION_LINK_STAGE_GATE\s*=\s*(\w+)/.exec(gateFe)?.[1]}`);
    if (gateBe.CRM_PRODUCTION_LINK_STAGE_GATE === false) ok('9a gate "đã liên kết sản xuất" đang TẮT ở backend');
    else fail('9a gate sản xuất vẫn BẬT ở backend → kéo bị chặn');
  } finally {
    head('DỌN DẸP — trả deal về cột ban đầu');
    if (savedProjectColumnId) {
      await supabase.from('projects').update({ sx_kanban_column_id: savedProjectColumnId }).eq('id', lead0.project_id);
      await supabase
        .from('crm_leads')
        .update({ sx_pipeline_stage_id: lead0.sx_pipeline_stage_id })
        .eq('id', LEAD_ID);
      console.log(`  ${c.g}OK${c.x} đã trả cột xưởng của project về ${savedProjectColumnId}`);
    }
    const restore = await moveStage(originalStageId);
    const now = await dbLead();
    if (restore.status === 200 && String(now.stage_id) === String(originalStageId)) {
      console.log(`  ${c.g}OK${c.x} đã trả về «${await stageNameOf(originalStageId)}»`);
    } else {
      console.log(`  ${c.r}!!${c.x} chưa trả về được (HTTP ${restore.status}) — hiện ở «${await stageNameOf(now.stage_id)}», cần set tay về «${await stageNameOf(originalStageId)}»`);
    }
  }

  console.log(`\n${c.b}=== KẾT QUẢ: ${passed} pass / ${failed} fail ===${c.x}`);
  if (failures.length) {
    console.log('Các case còn nhảy ngược:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n${c.r}Lỗi chạy test:${c.x}`, e);
  process.exit(2);
});
