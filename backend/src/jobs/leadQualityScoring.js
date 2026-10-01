/**
 * Chấm điểm chất lượng lead định kỳ.
 *
 *   - Mỗi 30 phút: chấm lại lead có thay đổi trong 24h và lead chưa từng chấm.
 *   - 03:00 mỗi Chủ nhật: chấm lại toàn bộ.
 *
 * Tích hợp: require('./jobs/leadQualityScoring').start()
 * Tắt bằng env LEAD_QUALITY_CRON_DISABLED=1
 */
const { supabase } = require('../config/supabase');
const { chamVaLuu } = require('../helpers/leadQuality');
const { runIfLeader } = require('../helpers/cronLeader');

const PHUT = 60 * 1000;
const CHU_KY_MS = 30 * PHUT;
const LO = 500;
const TRAN_MOI_LUOT = 5000;

let timer = null;
let dangChay = false;

/** Lead cần chấm lại: mới cập nhật, hoặc chưa có điểm. */
async function layLeadCanCham(toanBo = false) {
  if (toanBo) {
    const { data } = await supabase
      .from('crm_leads')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(20000);
    return (data || []).map((r) => r.id);
  }

  const tu = new Date(Date.now() - 24 * 60 * PHUT).toISOString();
  const [moiSua, chuaCham] = await Promise.all([
    supabase.from('crm_leads').select('id').gte('updated_at', tu).limit(TRAN_MOI_LUOT)
      .then((r) => (r.data || []).map((x) => x.id), () => []),
    supabase.from('crm_leads').select('id, lead_quality_scores!left(lead_id)')
      .is('lead_quality_scores.lead_id', null).limit(TRAN_MOI_LUOT)
      .then((r) => (r.data || []).map((x) => x.id), () => []),
  ]);
  return [...new Set([...moiSua, ...chuaCham])].slice(0, TRAN_MOI_LUOT);
}

async function runOnce({ toanBo = false } = {}) {
  if (dangChay) return { skip: 'dang_chay' };
  dangChay = true;
  const batDau = Date.now();
  try {
    const ids = await layLeadCanCham(toanBo);
    if (!ids.length) {
      console.log('[cham-diem-lead] Khong co lead nao can cham');
      return { da_cham: 0 };
    }

    let tongCham = 0;
    let tongGhi = 0;
    for (let i = 0; i < ids.length; i += LO) {
      const lo = ids.slice(i, i + LO);
      try {
        const kq = await chamVaLuu(lo);
        tongCham += kq.da_cham || 0;
        tongGhi += kq.da_ghi || 0;
      } catch (e) {
        console.warn('[cham-diem-lead] lo', i, ':', e.message);
      }
    }
    const giay = Math.round((Date.now() - batDau) / 1000);
    console.log(`[cham-diem-lead] ${toanBo ? 'Toan bo' : 'Tang dan'}: cham ${tongCham}, ghi ${tongGhi}, ${giay}s`);
    return { da_cham: tongCham, da_ghi: tongGhi, giay };
  } catch (e) {
    console.error('[cham-diem-lead] loi:', e.message);
    return { loi: e.message };
  } finally {
    dangChay = false;
  }
}

function laGioChamToanBo() {
  const d = new Date();
  return d.getDay() === 0 && d.getHours() === 3;
}

function start() {
  if (process.env.LEAD_QUALITY_CRON_DISABLED === '1') {
    console.log('[cham-diem-lead] Tat theo env');
    return;
  }
  if (timer) return;

  const chay = () => {
    runIfLeader('lead-quality-scoring', () => runOnce({ toanBo: laGioChamToanBo() }))
      .catch((e) => console.warn('[cham-diem-lead] leader:', e.message));
  };

  // Chờ 2 phút sau khi khởi động để không đua với các job khác
  setTimeout(chay, 2 * PHUT);
  timer = setInterval(chay, CHU_KY_MS);
  if (timer.unref) timer.unref();
  console.log('[cham-diem-lead] Da bat, chu ky 30 phut');
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, runOnce, layLeadCanCham };
