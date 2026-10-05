/**
 * Đồng bộ Facebook Marketing API định kỳ — 6 giờ/lần.
 * Kéo tên chiến dịch + chi tiêu về. Tắt bằng env FB_MARKETING_CRON_DISABLED=1
 *
 * Chu kỳ dài hơn phân tích (60 phút) vì tên chiến dịch đổi rất hiếm,
 * còn chi tiêu thì Facebook cũng chỉ chốt số theo ngày.
 */
const { dongBoTatCa } = require('../helpers/fbMarketingSync');
const work = require('../helpers/processWork').createProcessWork({ scope: 'MARKETING_SYNC_THIS_PROCESS' });
const { runIfLeader } = require('../helpers/cronLeader');

const PHUT = 60 * 1000;
const CHU_KY_MS = 6 * 60 * PHUT;

let timer = null, bootTimer = null;
let dangChay = false;

function runOnce() {
  return work.run(() => runOnceInner());
}

async function runOnceInner() {
  if (dangChay) return { skip: 'dang_chay' };
  dangChay = true;
  const t0 = Date.now();
  try {
    const kq = await dongBoTatCa({ ngay: 30 });
    if (!kq.so_tai_khoan) {
      console.log('[dong-bo-qc] Chua khai bao tai khoan quang cao nao, bo qua');
      return kq;
    }
    const ok = kq.ket_qua.filter((x) => x.ok).length;
    const soAd = kq.ket_qua.reduce((s, x) => s + (x.so_ad || 0), 0);
    console.log(`[dong-bo-qc] ${ok}/${kq.so_tai_khoan} tai khoan OK, ${soAd} quang cao, `
      + `${Math.round((Date.now() - t0) / 1000)}s`);
    return kq;
  } catch (e) {
    console.error('[dong-bo-qc] loi:', e.message);
    return { loi: e.message };
  } finally {
    dangChay = false;
  }
}

function start() {
  if (work.isStopped()) return;
  if (process.env.FB_MARKETING_CRON_DISABLED === '1') {
    console.log('[dong-bo-qc] Tat theo env');
    return;
  }
  if (timer) return;
  const chay = () => {
    return runIfLeader('fb-marketing-sync', runOnce).catch((e) => console.warn('[dong-bo-qc] leader:', e.message));
  };
  bootTimer = work.timeout(chay, 5 * PHUT);
  timer = work.interval(chay, CHU_KY_MS);
  if (timer.unref) timer.unref();
  console.log('[dong-bo-qc] Da bat, chu ky 6 gio');
}

function stop() {
  if (timer) { work.cancel(timer); timer = null; }
  if (bootTimer) { work.cancel(bootTimer); bootTimer = null; }
}

module.exports = { start, stop, runOnce, shutdown: work };
