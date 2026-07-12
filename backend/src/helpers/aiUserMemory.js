/**
 * AI User Memory — Persistent facts học từ user_activity_log.
 *
 * Luồng:
 *   1. Cron đêm (aiUserMemoryNightly) → rebuildUserMemory(userId) cho user có hoạt động
 *   2. Mỗi chat → loadUserFactsForPrompt → inject vào system prompt
 *   3. Tool get_user_learned_facts (on-demand)
 */

const { supabase } = require('../config/supabase');
const { summarizeUserActivity } = require('./aiReportTools');

const SOURCE_DERIVED = 'derived_from_activity';
const SOURCE_GPT = 'gpt_derived';
const MAX_FACTS_STORE = 12;
const MAX_FACTS_PROMPT = 8;
const MIN_ACTIONS_TO_LEARN = 5;
const MIN_ACTIONS_FOR_GPT = 15;

const MODULE_LABELS = {
  crm: 'CRM',
  tasks: 'Công việc',
  projects: 'Dự án',
  kpi: 'KPI',
  reports: 'Báo cáo',
  messenger: 'Messenger',
  dashboard: 'Dashboard',
  admin: 'Quản trị',
};

function moduleLabel(m) {
  return MODULE_LABELS[m] || m || 'hệ thống';
}

/** Tổng hợp activity + histogram giờ VN */
async function buildActivityDigest(userId, days = 7) {
  const summary = await summarizeUserActivity({ user_id: userId, days });
  if (summary.error) return { error: summary.error, facts: [] };

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('user_activity_log')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .gte('importance', 1)
    .limit(500);

  if (error && !/relation .* does not exist/i.test(error.message || '')) {
    return { error: error.message, facts: [] };
  }

  const hourCounts = Array(24).fill(0);
  for (const r of rows || []) {
    const h = parseInt(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: 'numeric',
        hour12: false,
      }).format(new Date(r.created_at)),
      10,
    );
    if (h >= 0 && h < 24) hourCounts[h] += 1;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const peakCount = hourCounts[peakHour] || 0;

  return {
    ...summary,
    peak_hour_vn: peakCount > 0 ? peakHour : null,
    peak_hour_count: peakCount,
  };
}

/** Rút fact bằng rule (không tốn OpenAI) */
function deriveFactsRuleBased(digest) {
  const facts = [];
  if (!digest || digest.total_actions < MIN_ACTIONS_TO_LEARN) return facts;

  const total = digest.total_actions || 1;
  const topMod = digest.top_modules?.[0];
  if (topMod && topMod.module && topMod.module !== '_none_') {
    const share = topMod.count / total;
    if (share >= 0.25) {
      facts.push({
        fact_type: 'habit',
        fact: `Hay dùng ${moduleLabel(topMod.module)} (${topMod.count}/${total} thao tác ${digest.days} ngày qua)`,
        confidence: Math.min(0.92, 0.55 + share * 0.35),
        source: SOURCE_DERIVED,
        evidence: { top_module: topMod },
      });
    }
  }

  for (const f of (digest.top_filters || []).slice(0, 4)) {
    if (f.count >= 2 && f.label) {
      facts.push({
        fact_type: 'preference',
        fact: `Thường lọc: ${f.label}`,
        confidence: Math.min(0.88, 0.45 + f.count / 12),
        source: SOURCE_DERIVED,
        evidence: { filter: f },
      });
    }
  }

  if (digest.peak_hour_vn != null && digest.peak_hour_count >= 3) {
    const h = digest.peak_hour_vn;
    const slot = h < 12 ? `sáng (~${h}h)` : h < 17 ? `chiều (~${h}h)` : `tối (~${h}h)`;
    facts.push({
      fact_type: 'habit',
      fact: `Thường thao tác CRM vào buổi ${slot}`,
      confidence: Math.min(0.75, 0.4 + digest.peak_hour_count / 20),
      source: SOURCE_DERIVED,
      evidence: { peak_hour_vn: h, count: digest.peak_hour_count },
    });
  }

  const last = digest.last_action;
  if (last?.label) {
    const ageMs = Date.now() - new Date(last.at).getTime();
    if (ageMs < 48 * 3600 * 1000) {
      facts.push({
        fact_type: 'context',
        fact: `Vừa thao tác gần nhất: ${last.label}`,
        confidence: 0.65,
        source: SOURCE_DERIVED,
        evidence: { last_action: last },
      });
    }
  }

  return facts.slice(0, MAX_FACTS_STORE);
}

/** GPT bổ sung fact (optional, user có nhiều activity) */
async function deriveFactsWithGpt(digest, userName, apiKey) {
  if (!apiKey || digest.total_actions < MIN_ACTIONS_FOR_GPT) return [];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Bạn phân tích nhật ký UI CRM. Trả JSON: {"facts":[{"fact_type":"habit|preference|context","fact":"...","confidence":0.0-1.0}]}. '
            + 'Tối đa 4 fact, tiếng Việt, ngắn, CHỈ dựa trên data, không bịa.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            user_name: userName || 'User',
            days: digest.days,
            digest,
          }),
        },
      ],
    }),
  });

  if (!res.ok) return [];
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed.facts) ? parsed.facts : [];
    return list
      .filter((f) => f.fact && ['habit', 'preference', 'context'].includes(f.fact_type))
      .map((f) => ({
        fact_type: f.fact_type,
        fact: String(f.fact).slice(0, 400),
        confidence: Math.min(1, Math.max(0.3, Number(f.confidence) || 0.6)),
        source: SOURCE_GPT,
        evidence: { gpt: true },
      }))
      .slice(0, 4);
  } catch {
    return [];
  }
}

function dedupeFacts(facts) {
  const seen = new Set();
  const out = [];
  for (const f of facts) {
    const key = `${f.fact_type}:${f.fact.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, MAX_FACTS_STORE);
}

/** Xóa fact derived cũ + ghi batch mới */
async function persistUserFacts(userId, facts) {
  const sourcesToReplace = [SOURCE_DERIVED, SOURCE_GPT];
  await supabase
    .from('ai_chat_bot_user_facts')
    .delete()
    .eq('user_id', userId)
    .in('source', sourcesToReplace);

  if (!facts.length) return { inserted: 0 };

  const rows = facts.map((f) => ({
    user_id: userId,
    fact_type: f.fact_type,
    fact: f.fact,
    confidence: f.confidence,
    source: f.source || SOURCE_DERIVED,
    evidence: f.evidence || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('ai_chat_bot_user_facts').insert(rows);
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { error: 'Chưa migrate 236_ai_chat_bot_user_facts.sql', inserted: 0 };
    }
    throw new Error(error.message);
  }
  return { inserted: rows.length };
}

/** Rebuild memory cho 1 user */
async function rebuildUserMemory(userId, opts = {}) {
  const { days = 7, useGpt = true } = opts;
  const apiKey = process.env.OPENAI_API_KEY;

  const { data: user } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('id', userId)
    .maybeSingle();

  const digest = await buildActivityDigest(userId, days);
  if (digest.error) return { user_id: userId, ok: false, error: digest.error };

  let facts = deriveFactsRuleBased(digest);
  if (useGpt && apiKey) {
    const gptFacts = await deriveFactsWithGpt(digest, user?.full_name, apiKey);
    facts = dedupeFacts([...facts, ...gptFacts]);
  } else {
    facts = dedupeFacts(facts);
  }

  const persist = await persistUserFacts(userId, facts);
  return {
    user_id: userId,
    ok: !persist.error,
    total_actions: digest.total_actions,
    facts_count: facts.length,
    inserted: persist.inserted,
    error: persist.error,
  };
}

/** User có activity trong N ngày */
async function listActiveUserIds(days = 7, minActions = MIN_ACTIONS_TO_LEARN) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('user_activity_log')
    .select('user_id')
    .gte('created_at', since)
    .gte('importance', 1)
    .not('user_id', 'is', null)
    .limit(10000);

  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) return [];
    throw new Error(error.message);
  }

  const counts = {};
  for (const r of data || []) {
    const id = r.user_id;
    counts[id] = (counts[id] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, c]) => c >= minActions)
    .map(([id]) => id);
}

async function rebuildAllActiveUsers(opts = {}) {
  const userIds = await listActiveUserIds(opts.days || 7, opts.minActions || MIN_ACTIONS_TO_LEARN);
  const results = [];
  for (const uid of userIds) {
    try {
      const r = await rebuildUserMemory(uid, opts);
      results.push(r);
    } catch (e) {
      results.push({ user_id: uid, ok: false, error: e.message });
    }
  }
  return {
    processed: results.length,
    ok: results.filter((r) => r.ok).length,
    results,
  };
}

/** Load facts cho prompt (ưu tiên confidence, correction luôn giữ) */
async function loadUserFactsForPrompt(userId, limit = MAX_FACTS_PROMPT) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('ai_chat_bot_user_facts')
    .select('id, fact_type, fact, confidence, source, hits, updated_at')
    .eq('user_id', userId)
    .order('confidence', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit + 5);

  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) return [];
    return [];
  }

  const rows = data || [];
  const corrections = rows.filter((r) => r.fact_type === 'correction');
  const rest = rows.filter((r) => r.fact_type !== 'correction');
  return [...corrections, ...rest].slice(0, limit);
}

function formatFactsForPrompt(facts) {
  if (!facts?.length) return '';
  const lines = facts.map((f, i) => `${i + 1}. [${f.fact_type}] ${f.fact}`);
  return `SỞ THÍCH / THÓI QUEN ĐÃ HỌC (từ hành vi UI ${facts[0]?.source === 'user_taught' ? '+ user dạy' : '7–30 ngày qua'} — dùng để cá nhân hoá, KHÔNG bịa thêm):\n${lines.join('\n')}`;
}

async function markFactsUsed(factIds) {
  if (!factIds?.length) return;
  const now = new Date().toISOString();
  for (const id of factIds) {
    const { data: row } = await supabase
      .from('ai_chat_bot_user_facts')
      .select('hits')
      .eq('id', id)
      .maybeSingle();
    await supabase
      .from('ai_chat_bot_user_facts')
      .update({ hits: (row?.hits || 0) + 1, last_used_at: now })
      .eq('id', id);
  }
}

/** Ghi fact user dạy trực tiếp (nấc 4 sau này) */
async function teachUserFact(userId, fact, factType = 'correction') {
  const row = {
    user_id: userId,
    fact_type: factType,
    fact: String(fact).slice(0, 400),
    confidence: 0.95,
    source: 'user_taught',
    evidence: { taught_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('ai_chat_bot_user_facts').upsert(row, {
    onConflict: 'user_id,source,fact',
  });
  if (error) throw new Error(error.message);
  return row;
}

async function getUserLearnedFacts(userId) {
  const facts = await loadUserFactsForPrompt(userId, 20);
  return {
    user_id: userId,
    count: facts.length,
    facts: facts.map((f) => ({
      id: f.id,
      type: f.fact_type,
      fact: f.fact,
      confidence: f.confidence,
      source: f.source,
      hits: f.hits,
      last_used_at: f.last_used_at,
      updated_at: f.updated_at,
    })),
  };
}

/** Admin: liệt kê fact (có thể lọc user) */
async function listAllUserFacts({ user_id: userId, limit = 150 } = {}) {
  let q = supabase
    .from('ai_chat_bot_user_facts')
    .select('id, user_id, fact_type, fact, confidence, source, hits, last_used_at, created_at, updated_at, user:users(id, full_name, email)')
    .order('updated_at', { ascending: false })
    .limit(Math.min(limit, 300));
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { facts: [], total: 0, hint: 'Chạy migration 236_ai_chat_bot_user_facts.sql' };
    }
    throw new Error(error.message);
  }
  return { facts: data || [], total: (data || []).length };
}

async function deleteUserFact(factId) {
  const { error } = await supabase.from('ai_chat_bot_user_facts').delete().eq('id', factId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

module.exports = {
  rebuildUserMemory,
  rebuildAllActiveUsers,
  loadUserFactsForPrompt,
  formatFactsForPrompt,
  markFactsUsed,
  teachUserFact,
  getUserLearnedFacts,
  listAllUserFacts,
  deleteUserFact,
  buildActivityDigest,
  MIN_ACTIONS_TO_LEARN,
};
