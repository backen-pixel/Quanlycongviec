/**
 * Worker nền: STT ghi âm Lead tiềm năng (prospect_lead + stt_status=pending).
 *
 * start() trong server.js
 * Tắt: VOICE_STT_CRON_DISABLED=1
 * Cần OPENAI_API_KEY
 * Env: VOICE_STT_POLL_MS (mặc định 30000), VOICE_STT_BATCH (mặc định 3), VOICE_STT_MAX_ATTEMPTS (3)
 */
const { supabase } = require('../config/supabase');
const { runIfLeader } = require('../helpers/cronLeader');
const { transcribeVoiceRecordingRow } = require('../helpers/voiceSttOpenAi');

let timer = null;
let running = false;

function pollMs() {
  const n = parseInt(String(process.env.VOICE_STT_POLL_MS || '30000'), 10);
  return Number.isFinite(n) && n >= 5000 ? n : 30000;
}

function batchSize() {
  const n = parseInt(String(process.env.VOICE_STT_BATCH || '3'), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 3;
}

function maxAttempts() {
  const n = parseInt(String(process.env.VOICE_STT_MAX_ATTEMPTS || '3'), 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

async function claimPendingRow(rowId) {
  const { data, error } = await supabase
    .from('voice_recordings')
    .update({ stt_status: 'processing' })
    .eq('id', rowId)
    .eq('stt_status', 'pending')
    .eq('prospect_class', 'prospect_lead')
    .select(
      'id, storage_path, file_name, mime_type, file_size, duration_sec, stt_attempts, transcript_language',
    )
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function markDone(rowId, { text, model, language }) {
  const { error } = await supabase
    .from('voice_recordings')
    .update({
      transcript: text,
      transcript_language: language || 'vi',
      stt_status: 'done',
      stt_error: null,
      stt_model: model,
      transcribed_at: new Date().toISOString(),
    })
    .eq('id', rowId);
  if (error) throw error;
}

async function markFailOrRetry(rowId, attempts, message) {
  const nextAttempts = (Number(attempts) || 0) + 1;
  const max = maxAttempts();
  const patch =
    nextAttempts < max
      ? {
          stt_status: 'pending',
          stt_attempts: nextAttempts,
          stt_error: String(message || 'STT lỗi').slice(0, 1000),
        }
      : {
          stt_status: 'failed',
          stt_attempts: nextAttempts,
          stt_error: String(message || 'STT lỗi').slice(0, 1000),
        };
  const { error } = await supabase.from('voice_recordings').update(patch).eq('id', rowId);
  if (error) throw error;
}

async function processOne(row) {
  try {
    const result = await transcribeVoiceRecordingRow(supabase, row);
    await markDone(row.id, result);
    console.log(`[voice-stt] done ${row.id} (${(result.text || '').length} chars)`);
  } catch (e) {
    console.warn(`[voice-stt] fail ${row.id}:`, e.message);
    await markFailOrRetry(row.id, row.stt_attempts, e.message);
  }
}

async function tick() {
  if (running) return;
  if (process.env.VOICE_STT_CRON_DISABLED === '1') return;
  if (!process.env.OPENAI_API_KEY) {
    return;
  }

  running = true;
  try {
    await runIfLeader(
      'voice-stt-worker',
      async () => {
        const { data: pending, error } = await supabase
          .from('voice_recordings')
          .select('id')
          .eq('stt_status', 'pending')
          .eq('prospect_class', 'prospect_lead')
          .order('created_at', { ascending: true })
          .limit(batchSize());
        if (error) throw error;
        if (!pending?.length) return;

        for (const p of pending) {
          const claimed = await claimPendingRow(p.id);
          if (!claimed) continue;
          await processOne(claimed);
        }
      },
      { ttlSec: Math.max(60, Math.ceil(pollMs() / 1000) + 30) },
    );
  } catch (e) {
    console.warn('[voice-stt] tick error:', e.message);
  } finally {
    running = false;
  }
}

function start() {
  if (process.env.VOICE_STT_CRON_DISABLED === '1') {
    console.log('[voice-stt] disabled (VOICE_STT_CRON_DISABLED=1)');
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.log('[voice-stt] bỏ qua start: chưa có OPENAI_API_KEY (sẽ poll khi có key ở lần deploy sau)');
  }
  const ms = pollMs();
  console.log(`[voice-stt] worker mỗi ${ms}ms, batch=${batchSize()}`);
  void tick();
  timer = setInterval(() => void tick(), ms);
  if (typeof timer.unref === 'function') timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
