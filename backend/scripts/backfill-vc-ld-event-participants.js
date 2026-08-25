/**
 * Quét sự kiện VC/LĐ (+ hoàn thiện SX) còn thiếu thành viên dự án → bổ sung participant.
 *
 *   node scripts/backfill-vc-ld-event-participants.js
 *   node scripts/backfill-vc-ld-event-participants.js --apply
 */
require('dotenv').config();
const { supabase } = require('../src/config/supabase');
const { collectProjectEventParticipantIds } = require('../src/helpers/dealModuleResponsibleUsers');

const APPLY = process.argv.includes('--apply');
const TYPES = ['pickup', 'installation', 'delivery', 'production_finish'];

async function loadEvents() {
  const { data, error } = await supabase
    .from('crm_events')
    .select('id, title, event_type, module, status, lead_id, project_id')
    .in('event_type', TYPES)
    .neq('status', 'cancelled')
    .limit(2000);
  if (error) throw error;
  return (data || []).filter((e) => e.lead_id || e.project_id);
}

async function loadExistingParticipantIds(eventId) {
  const { data, error } = await supabase
    .from('crm_event_participants')
    .select('user_id')
    .eq('event_id', eventId);
  if (error) throw error;
  return new Set((data || []).map((r) => String(r.user_id)));
}

async function main() {
  console.log(APPLY ? 'MODE: APPLY' : 'MODE: dry-run (thêm --apply để ghi)');
  const events = await loadEvents();
  console.log(`Sự kiện VC/LĐ + hoàn thiện (có deal/dự án): ${events.length}`);

  const peopleCache = new Map();
  let patched = 0;
  let missingTotal = 0;
  const samples = [];

  for (const ev of events) {
    const cacheKey = `${ev.lead_id || ''}|${ev.project_id || ''}`;
    let people = peopleCache.get(cacheKey);
    if (!people) {
      people = await collectProjectEventParticipantIds({
        leadId: ev.lead_id,
        projectId: ev.project_id,
      });
      peopleCache.set(cacheKey, people);
    }
    const wanted = people.userIds || [];
    if (!wanted.length) continue;

    const have = await loadExistingParticipantIds(ev.id);
    const missing = wanted.filter((uid) => !have.has(String(uid)));
    if (!missing.length) continue;

    missingTotal += missing.length;
    patched += 1;
    if (samples.length < 12) {
      samples.push({
        id: ev.id,
        type: ev.event_type,
        title: ev.title,
        have: have.size,
        add: missing.length,
        want: wanted.length,
      });
    }

    if (APPLY) {
      const { error } = await supabase.from('crm_event_participants').upsert(
        missing.map((uid) => ({
          event_id: ev.id,
          user_id: uid,
          status: 'confirmed',
        })),
        { onConflict: 'event_id,user_id' },
      );
      if (error) {
        console.warn('upsert fail', ev.id, error.message);
      }
    }
  }

  console.log(`Sự kiện thiếu thành viên: ${patched}`);
  console.log(`Participant sẽ thêm: ${missingTotal}`);
  for (const s of samples) {
    console.log(`  [${s.type}] ${s.title} | đang ${s.have} → +${s.add} (đủ ${s.want})`);
  }
  if (!APPLY && patched) console.log('Chạy lại với --apply để ghi.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
