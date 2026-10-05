/**
 * Phân tích quảng cáo Facebook định kỳ — 60 phút/lần.
 * Tắt bằng env AD_ANALYSIS_CRON_DISABLED=1
 */
const { chayPhanTich } = require('../helpers/adInsights');
const { runIfLeader } = require('../helpers/cronLeader');

const PHUT = 60 * 1000;
const CHU_KY_MS = 60 * PHUT;

let timer = null;
let dangChay = false;

async function runOnce() {
  if (dangChay) return { skip: 'dang_chay' };
  dangChay = true;
  const t0 = Date.now();
  try {
    const kq = await chayPhanTich({ ngay: 90 });
    console.log(`[phan-tich-qc] Da phan tich ${kq.da_phan_tich} quang cao, ${Math.round((Date.now() - t0) / 1000)}s`);
    return kq;
  } catch (e) {
    console.error('[phan-tich-qc] loi:', e.message);
    return { loi: e.message };
  } finally {
    dangChay = false;
  }
}

function start() {
  if (process.env.AD_ANALYSIS_CRON_DISABLED === '1') {
    console.log('[phan-tich-qc] Tat theo env');
    return;
  }
  if (timer) return;
  const chay = () => {
    runIfLeader('ad-analysis', runOnce).catch((e) => console.warn('[phan-tich-qc] leader:', e.message));
  };
  setTimeout(chay, 3 * PHUT);
  timer = setInterval(chay, CHU_KY_MS);
  if (timer.unref) timer.unref();
  console.log('[phan-tich-qc] Da bat, chu ky 60 phut');
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, runOnce };
