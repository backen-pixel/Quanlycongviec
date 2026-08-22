/** @mention trong bình luận lead/deal — đồng bộ logic với frontend crmCommentMentions.js */

const MENTION_ALL_LABEL = 'Tất cả';
/** Không dùng \\b — chữ Việt không phải word-char ASCII nên @Tất cả sẽ không khớp. */
const MENTION_ALL_RE = /@(tất\s*cả|tat\s*ca|all)(?=$|[\s.,!?;:…])/i;

function normalizeMentionSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function memberDisplayName(mem) {
  return (mem?.user?.full_name || mem?.user?.email || '').trim();
}

function contentHasMentionAll(content) {
  return MENTION_ALL_RE.test(String(content || ''));
}

function parseMentionUserIds(body) {
  let raw = body?.mention_user_ids;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(Boolean).map(String))].slice(0, 500);
}

function memberMatchesQuery(mem, queryRaw) {
  const q = normalizeMentionSearch(queryRaw);
  if (!q) return true;
  const name = memberDisplayName(mem);
  if (!name) return false;
  const nNorm = normalizeMentionSearch(name);
  if (nNorm.includes(q)) return true;
  return name
    .split(/\s+/)
    .some((part) => normalizeMentionSearch(part).startsWith(q) || normalizeMentionSearch(part).includes(q));
}

/** Quét @ trong nội dung, khớp tên đầy đủ (có dấu, nhiều từ). */
function resolveMentionIdsFromContent(content, members, { excludeUserId } = {}) {
  const ids = [];
  if (!content?.trim() || !members?.length) return ids;
  const ex = excludeUserId != null ? String(excludeUserId) : '';

  if (contentHasMentionAll(content)) {
    for (const mem of members) {
      const id = mem.user_id;
      if (String(mem.role || '') === 'viewer') continue;
      if (id && String(id) !== ex && !ids.includes(String(id))) ids.push(String(id));
    }
  }

  const sorted = [...members].sort(
    (a, b) => memberDisplayName(b).length - memberDisplayName(a).length,
  );

  const text = String(content);
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '@') {
      i += 1;
      continue;
    }
    const rest = text.slice(i + 1);
    const allMatch = rest.match(/^(tất\s*cả|tat\s*ca|all)(?=$|[\s.,!?;:…])/i);
    if (allMatch) {
      i += 1 + allMatch[0].length;
      continue;
    }

    let matched = false;
    for (const mem of sorted) {
      const name = memberDisplayName(mem);
      if (!name) continue;
      const restNorm = normalizeMentionSearch(rest);
      const nameNorm = normalizeMentionSearch(name);
      if (!restNorm.startsWith(nameNorm)) continue;
      const after = rest.slice(name.length);
      if (after.length > 0 && after[0] !== ' ' && after[0] !== '\n') continue;
      const id = mem.user_id;
      if (id && String(id) !== ex && !ids.includes(String(id))) ids.push(String(id));
      i += 1 + name.length;
      matched = true;
      break;
    }
    if (!matched) i += 1;
  }
  return ids;
}

/**
 * Danh sách người có thể @: lead_members + người phụ trách/chủ lead nếu chưa có trong nhóm.
 */
async function fetchLeadMentionMembers(supabase, leadId) {
  const { data: rows } = await supabase
    .from('lead_members')
    .select('user_id, user:users!lead_members_user_id_fkey(id, full_name, email, avatar, role, company_id, drive_module)')
    .eq('lead_id', leadId);

  const map = new Map();
  for (const r of rows || []) {
    if (r?.user_id) map.set(String(r.user_id), r);
  }

  const { data: lead } = await supabase
    .from('crm_leads')
    .select('assigned_to, lead_owner_id')
    .eq('id', leadId)
    .maybeSingle();

  const extraIds = [...new Set(
    [lead?.assigned_to, lead?.lead_owner_id].filter(Boolean).map(String),
  )];

  const missing = extraIds.filter((id) => !map.has(id));
  if (missing.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email, avatar, role, company_id, drive_module')
      .in('id', missing);
    for (const u of users || []) {
      map.set(String(u.id), { user_id: u.id, user: u, role: 'member' });
    }
  }

  return [...map.values()];
}

function resolveLeadCommentMentionIds(body, content, members, senderId) {
  const memberSet = new Set((members || []).map((m) => String(m.user_id)).filter(Boolean));
  const fromBody = parseMentionUserIds(body).filter((id) => memberSet.has(id));
  const fromText = resolveMentionIdsFromContent(content, members, { excludeUserId: senderId });
  return [...new Set([...fromBody, ...fromText])].filter((id) => String(id) !== String(senderId));
}

function resolveMentionedNames(mentionIds, members) {
  return (mentionIds || []).map((id) => {
    const mem = (members || []).find((m) => String(m.user_id) === String(id));
    return memberDisplayName(mem) || 'Thành viên';
  });
}

/** Ghi hoạt động lead/deal khi bình luận có @ — hiển thị ở tab Hoạt động. */
async function logLeadCommentMentionActivity(supabase, {
  leadId,
  senderId,
  commentRow,
  mentionIds,
  members,
}) {
  if (!leadId || !mentionIds?.length) return null;

  const senderName = commentRow?.user?.full_name || 'Ai đó';
  const mentionedNames = resolveMentionedNames(mentionIds, members);
  const bodyText = String(commentRow?.body || '').trim();
  const title = `💬 ${senderName} nhắc ${mentionedNames.join(', ')}`.slice(0, 500);
  const outcome = `Đã gửi thông báo tới ${mentionedNames.join(', ')}`.slice(0, 500);

  const { data, error } = await supabase
    .from('crm_activities')
    .insert({
      lead_id: leadId,
      type: 'comment',
      title,
      description: bodyText || null,
      outcome,
      created_by: senderId,
      activity_date: new Date().toISOString(),
    })
    .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
    .single();

  if (error) {
    console.warn('[logLeadCommentMentionActivity]', error.message);
    return null;
  }

  try {
    await supabase
      .from('crm_leads')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', leadId);
  } catch { /* ignore */ }

  return data;
}

module.exports = {
  MENTION_ALL_LABEL,
  normalizeMentionSearch,
  memberDisplayName,
  memberMatchesQuery,
  contentHasMentionAll,
  parseMentionUserIds,
  resolveMentionIdsFromContent,
  fetchLeadMentionMembers,
  resolveLeadCommentMentionIds,
  resolveMentionedNames,
  logLeadCommentMentionActivity,
};
