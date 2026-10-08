'use strict';
const { supabase } = require('../config/supabase');
const { getActiveTarget, withPrimaryDatabase } = require('../config/supabaseRouter');
const { runIfLeader } = require('../helpers/cronLeader');
const { buildTrialSummary } = require('../modules/marketingAutomation/trialSummary');

const HOUR = 3600000;
let timer = null, firstTimer = null, dangChay = false;
const vnDay = now => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const dayBefore = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) - count * 86400000)
  .toISOString().slice(0, 10);

async function runOnce() {
  if (process.env.VPT_P1_SNAPSHOT_CRON !== '1') return { skip: 'disabled' };
  if (dangChay) return { skip: 'dang_chay' };
  if (getActiveTarget() !== 'primary') return { skip: 'not_primary' };
  dangChay = true;
  try {
    return await withPrimaryDatabase(async () => {
      const now = new Date(), today = vnDay(now), earliestEnd = dayBefore(today, 7);
      let processed = 0;
      for (let offset = 0;; offset += 500) {
        const { data, error } = await supabase.from('p1_trials')
          .select('id,company_id,name,status,start_date,end_date')
          .in('status', ['APPROVED', 'CLOSED']).lte('start_date', today)
          .gte('end_date', earliestEnd).order('id', { ascending: true })
          .range(offset, offset + 499);
        if (error || !Array.isArray(data)) throw Error('TRIAL_SOURCE_UNAVAILABLE');
        for (const trial of data) {
          try {
            const { summary, spendByDay } = await buildTrialSummary({ db: supabase, trial, now });
            const { error: writeError } = await supabase.rpc('p1_trial_snapshot_put_v1', {
              _company_id: trial.company_id, _trial_id: trial.id, _as_of: summary.as_of,
              _summary: summary, _spend_by_day: spendByDay,
              _source_note: summary.spend.status === 'COMPLETE'
                ? 'SPEND_COMPLETE' : `SPEND_DAY_UNPROVEN:${summary.spend.status}`,
            });
            if (writeError) throw Error('SNAPSHOT_WRITE_FAILED');
            processed++;
          } catch { console.warn('[p1-snapshot] TRIAL_FAILED'); }
        }
        if (data.length < 500) break;
      }
      return { processed };
    });
  } catch {
    console.warn('[p1-snapshot] RUN_FAILED');
    return { error: 'RUN_FAILED' };
  } finally { dangChay = false; }
}

function start() {
  if (process.env.VPT_P1_SNAPSHOT_CRON !== '1' || firstTimer || timer) return;
  const tick = () => runIfLeader('p1-trial-snapshot', runOnce, { ttlSec: 3600 })
    .catch(() => console.warn('[p1-snapshot] LEADER_FAILED'));
  firstTimer = setTimeout(() => {
    firstTimer = null;
    timer = setInterval(tick, 6 * HOUR);
    timer.unref?.();
    return tick();
  }, 10 * 60000);
  firstTimer.unref?.();
}
function stop() {
  if (firstTimer) clearTimeout(firstTimer);
  if (timer) clearInterval(timer);
  firstTimer = timer = null;
}
module.exports = { start, stop, runOnce };
