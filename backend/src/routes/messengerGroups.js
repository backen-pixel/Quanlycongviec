const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Router } = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { pgQuery, pgSessionQuery } = require('../config/db');
const config = require('../config');
const { notifyMultiple } = require('../helpers/notifications');
const { isAdminLike } = require('../helpers/adminRole');
const { handleIncomingMessage } = require('../helpers/aiConversation');
const { responseCache, invalidateTags: rcInvalidateTagsMessenger } = require('../middleware/responseCache');

/** Bucket Supabase Storage (mặc định giống upload CRM). */
const MESSENGER_STORAGE_BUCKET = process.env.SUPABASE_MESSENGER_BUCKET || 'attachments';
/** Thư mục trong bucket, mặc định `messenger` — có thể set `messsenger` trong .env nếu đã tạo đúng tên đó. */
const MESSENGER_STORAGE_FOLDER = (process.env.SUPABASE_MESSENGER_FOLDER || 'messenger').replace(/^\/+|\/+$/g, '');

const MESSENGER_CHAT_UPLOAD = path.join(__dirname, '../../uploads/messenger-chat');
try {
  fs.mkdirSync(MESSENGER_CHAT_UPLOAD, { recursive: true });
} catch {
  /* ignore */
}

function supabaseMessengerStorageEnabled() {
  return !!(config.supabaseUrl && config.supabaseServiceKey);
}

function logMessengerAction(payload) {
  try {
    console.log('[messenger-action]', JSON.stringify({ t: new Date().toISOString(), ...payload }));
  } catch {
    /* ignore */
  }
}

function isMessageRecalled(msg) {
  return !!(msg?.recalled_at || msg?.is_recalled);
}

/** Lấy 1 tin trong nhóm — fallback select tối thiểu nếu schema cache chưa có cột recall. */
async function fetchGroupMessageForAction(gid, mid) {
  const fullSelect = 'id, group_id, user_id, created_at, recalled_at, is_recalled, is_system';
  let { data, error } = await supabase
    .from('messenger_group_messages')
    .select(fullSelect)
    .eq('id', mid)
    .eq('group_id', gid)
    .maybeSingle();
  if (error && /recalled_at|is_recalled|schema cache/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('messenger_group_messages')
      .select('id, group_id, user_id, created_at, is_system')
      .eq('id', mid)
      .eq('group_id', gid)
      .maybeSingle());
  }
  if (error) throw error;
  return data;
}

async function markMessageRecalled(mid, uid, recalled_at) {
  const pg = await pgSessionQuery(
    `UPDATE messenger_group_messages
     SET recalled_at = $1::timestamptz, recalled_by = $2::uuid, is_recalled = true
     WHERE id = $3::uuid`,
    [recalled_at, uid, mid],
  );
  if (pg) return;
  const { error } = await supabase
    .from('messenger_group_messages')
    .update({ recalled_at, recalled_by: uid, is_recalled: true })
    .eq('id', mid);
  if (error) throw error;
}

async function upsertMessageReaction(mid, uid, emoji) {
  const existingPg = await pgSessionQuery(
    `SELECT id, emoji FROM messenger_message_reactions
     WHERE message_id = $1::uuid AND user_id = $2::uuid`,
    [mid, uid],
  );
  if (existingPg) {
    const row = existingPg.rows?.[0];
    if (row?.emoji === emoji) {
      await pgSessionQuery(
        `DELETE FROM messenger_message_reactions WHERE message_id = $1::uuid AND user_id = $2::uuid`,
        [mid, uid],
      );
    } else if (row) {
      await pgSessionQuery(
        `UPDATE messenger_message_reactions SET emoji = $3
         WHERE message_id = $1::uuid AND user_id = $2::uuid`,
        [mid, uid, emoji],
      );
    } else {
      await pgSessionQuery(
        `INSERT INTO messenger_message_reactions (message_id, user_id, emoji)
         VALUES ($1::uuid, $2::uuid, $3)`,
        [mid, uid, emoji],
      );
    }
    return;
  }

  const { data: existing } = await supabase
    .from('messenger_message_reactions')
    .select('id, emoji')
    .eq('message_id', mid)
    .eq('user_id', uid)
    .maybeSingle();

  if (existing?.emoji === emoji) {
    await supabase.from('messenger_message_reactions').delete().eq('id', existing.id);
  } else if (existing) {
    await supabase.from('messenger_message_reactions').update({ emoji }).eq('id', existing.id);
  } else {
    await supabase.from('messenger_message_reactions').insert({ message_id: mid, user_id: uid, emoji });
  }
}

async function fetchReactionsForMessagePg(messageId) {
  const r = await pgQuery(
    `SELECT message_id, user_id, emoji, created_at
     FROM messenger_message_reactions WHERE message_id = $1::uuid`,
    [messageId],
  );
  return r?.rows || null;
}

/**
 * Dựng chuỗi preview ngắn cho một message để hiển thị trong sidebar Messenger.
 * Ưu tiên content; nếu rỗng, fallback theo tệp đính kèm. Trả null nếu cả 2 đều rỗng.
 */
function buildMessagePreviewNode(m, opts = {}) {
  if (!m) return null;
  const { forUserId } = opts;
  if (m.recalled_at || m.is_recalled) {
    const mine = forUserId && String(m.recalled_by || m.user_id) === String(forUserId);
    return mine ? 'Đã thu hồi tin nhắn' : 'Tin nhắn bị thu hồi';
  }
  const raw = (m.content == null ? '' : String(m.content)).trim();
  if (raw) {
    if (raw.startsWith(':sticker:')) {
      const emoji = raw.slice(':sticker:'.length).trim();
      return emoji ? `🏷️ ${emoji}` : '🏷️ Nhãn dán';
    }
    if (/https?:\/\//i.test(raw)) {
      const onlyUrl = raw.replace(/https?:\/\/[^\s]+/gi, '').trim();
      if (!onlyUrl) return '🔗 Link';
    }
    return raw.length > 120 ? raw.slice(0, 120) : raw;
  }
  const mime = (m.attachment_mime || '').toLowerCase();
  if (mime.startsWith('image/')) return '📷 Ảnh';
  if (mime.startsWith('video/')) return '🎬 Video';
  if (mime.startsWith('audio/')) return '🎤 Âm thanh';
  if (mime) return `📎 ${m.attachment_name || 'Tệp đính kèm'}`;
  const arr = Array.isArray(m.attachments) ? m.attachments : null;
  if (arr && arr.length) {
    const a0 = arr[0] || {};
    const t = (a0.type || '').toLowerCase();
    if (t.startsWith('image/')) return '📷 Ảnh';
    if (t.startsWith('video/')) return '🎬 Video';
    if (t.startsWith('audio/')) return '🎤 Âm thanh';
    return `📎 ${a0.name || 'Tệp đính kèm'}`;
  }
  return null;
}

function writeMessengerBufferLocal(buffer, originalName) {
  fs.mkdirSync(MESSENGER_CHAT_UPLOAD, { recursive: true });
  const ext = path.extname(originalName || '') || '';
  const base = path
    .basename(originalName || 'file', ext)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  const fname = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${base}${ext}`;
  const full = path.join(MESSENGER_CHAT_UPLOAD, fname);
  fs.writeFileSync(full, buffer);
  return `/uploads/messenger-chat/${fname}`;
}

/**
 * Lưu file chat nhóm: ưu tiên Supabase Storage (`{folder}/{groupId}/…`), fallback thư mục uploads khi lỗi hoặc chưa cấu hình.
 * @param {string} groupId
 * @param {{ buffer: Buffer, mimetype: string, originalname: string, size: number }} file
 */
async function storeMessengerUploadedFile(groupId, file) {
  const mime = file.mimetype || 'application/octet-stream';
  const original = file.originalname || 'file';
  const ext = path.extname(original) || '';
  const safeBase = path
    .basename(original, ext)
    .replace(/[^a-zA-Z0-9.\u00C0-\u024F_\s-]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100);

  if (supabaseMessengerStorageEnabled()) {
    const prefix = `${MESSENGER_STORAGE_FOLDER}/${groupId}`.replace(/\/+/g, '/');
    const objectPath = `${prefix}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeBase}${ext}`.replace(/^\//, '');
    const { error } = await supabase.storage.from(MESSENGER_STORAGE_BUCKET).upload(objectPath, file.buffer, {
      contentType: mime,
      upsert: false,
    });
    if (error) {
      console.error('[messenger] Supabase storage upload failed:', error.message);
      const url = writeMessengerBufferLocal(file.buffer, original);
      return { name: original, url, type: mime, size: file.size };
    }
    const { data: urlData } = supabase.storage.from(MESSENGER_STORAGE_BUCKET).getPublicUrl(objectPath);
    return { name: original, url: urlData.publicUrl, type: mime, size: file.size };
  }

  const url = writeMessengerBufferLocal(file.buffer, original);
  return { name: original, url, type: mime, size: file.size };
}

const messengerMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const r = Router();
r.use(auth);

r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function messengerInvalidate(body) {
    if (res.statusCode < 400) void rcInvalidateTagsMessenger(['messenger']);
    return origJson(body);
  };
  next();
});

/** JWT có thể chỉ có `id` — mọi chỗ trước dùng userId; thống nhất authUserId */
r.use((req, res, next) => {
  const id = req.user?.userId ?? req.user?.id;
  if (id == null || String(id).trim() === '') {
    return res.status(401).json({ error: 'Token thiếu user — đăng nhập lại.' });
  }
  req.authUserId = String(id).trim();
  next();
});

function mapIncomingRole(role) {
  if (role === 'responsible' || role === 'leader') return 'leader';
  if (role === 'supervisor' || role === 'deputy') return 'deputy';
  return 'member';
}

async function assertGroupMember(groupId, userId) {
  const { data } = await supabase
    .from('messenger_group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

/**
 * Thông báo + socket cho thành viên khác (tin user, không gồm system) — badge / toast mobile.
 */
async function notifyMessengerGroupChatRecipients(req, groupId, senderId, msgRow, groupName) {
  if (!msgRow || msgRow.is_system) return;
  const { data: members } = await supabase
    .from('messenger_group_members')
    .select('user_id')
    .eq('group_id', groupId);
  const sid = String(senderId);
  const targets = (members || []).map((m) => String(m.user_id)).filter((id) => id && id !== sid);
  if (!targets.length) return;

  const senderName = msgRow.user?.full_name || 'Đồng nghiệp';

  let preview = typeof msgRow.content === 'string' ? msgRow.content.trim() : '';
  if (!preview) {
    if (Array.isArray(msgRow.attachments) && msgRow.attachments.length) preview = '📎 Tệp đính kèm';
    else if (msgRow.message_type === 'image') preview = '🖼️ Hình ảnh';
    else if (msgRow.message_type === 'video') preview = '🎬 Video';
    else if (msgRow.message_type === 'audio') preview = '🎙️ Ghi âm';
    else if (msgRow.message_type === 'file' || msgRow.attachment_url) preview = '📎 Tệp đính kèm';
    else preview = '[Tin nhắn]';
  }
  if (preview.length > 140) preview = `${preview.slice(0, 137)}…`;

  const titleBase = groupName ? `Messenger · ${groupName}` : 'Tin nhắn Messenger';

  await notifyMultiple(
    req,
    targets,
    'messenger_chat',
    titleBase,
    `${senderName}: ${preview}`,
    'messenger_group',
    groupId,
    {
      group_name: groupName || null,
      sender_name: senderName,
      sender_avatar: msgRow.user?.avatar || null,
      group_avatar: null,
      // Phase 1 (mobile): cho native FCM build heads-up notif + bubble wake
      bubble_key: String(groupId),
      bubble_wake: true,
      message_id: msgRow?.id ? String(msgRow.id) : '',
      sender_id: sid,
      message_type: msgRow?.message_type || 'text',
    },
  );
}

const MSG_USER_SELECT = '*, user:users!messenger_group_messages_user_id_fkey(id, full_name, avatar, is_bot)';

/**
 * Hydrate parent message (cho tin nhắn reply). Dùng query riêng thay vì
 * join FK self-reference vì Supabase đôi khi không nhận diện được constraint
 * name của self-FK (`messenger_group_messages_reply_to_fkey`), khiến cả query
 * fail và rơi xuống fallback không có `reply_to_message`.
 *
 * @param {Array<object>} rows  Danh sách message đã có `reply_to`.
 * @returns {Promise<Array<object>>}
 */
async function attachReplyParents(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const ids = [...new Set(
    rows.map((m) => m?.reply_to).filter(Boolean).map((x) => String(x))
  )];
  if (!ids.length) return rows;
  const { data: parents, error } = await supabase
    .from('messenger_group_messages')
    .select('id, content, message_type, attachment_name, attachment_url, user_id')
    .in('id', ids);
  if (error || !parents?.length) return rows;
  const userIds = [...new Set(parents.map((p) => p.user_id).filter(Boolean).map(String))];
  let userMap = new Map();
  if (userIds.length) {
    const users = await fetchUsersByIdsForMessenger(userIds);
    userMap = new Map(users.map((u) => [String(u.id), u]));
  }
  const parentMap = new Map(
    parents.map((p) => [String(p.id), { ...p, user: userMap.get(String(p.user_id)) || null }])
  );
  return rows.map((m) => {
    if (!m?.reply_to) return m;
    const parent = parentMap.get(String(m.reply_to)) || null;
    return parent ? { ...m, reply_to_message: parent } : m;
  });
}

/** Gắn reactions[] vào từng message (batch query). */
async function attachReactionsToMessages(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const ids = [...new Set(rows.map((m) => m?.id).filter(Boolean))];
  if (!ids.length) return rows;
  const { data: rxRows, error } = await supabase
    .from('messenger_message_reactions')
    .select('message_id, user_id, emoji, created_at')
    .in('message_id', ids);
  if (error) {
    console.warn('[messenger] attachReactionsToMessages:', error.message);
    return rows.map((m) => ({ ...m, reactions: m.reactions || [] }));
  }
  const byMsg = new Map();
  for (const rx of rxRows || []) {
    const mid = String(rx.message_id);
    if (!byMsg.has(mid)) byMsg.set(mid, []);
    byMsg.get(mid).push(rx);
  }
  return rows.map((m) => ({ ...m, reactions: byMsg.get(String(m.id)) || [] }));
}

async function fetchReactionsForMessage(messageId) {
  const pgRows = await fetchReactionsForMessagePg(messageId);
  if (pgRows) return pgRows;
  const { data, error } = await supabase
    .from('messenger_message_reactions')
    .select('message_id, user_id, emoji, created_at')
    .eq('message_id', messageId);
  if (error) throw error;
  return data || [];
}

async function fetchMessengerMessageById(id) {
  const { data, error } = await supabase.from('messenger_group_messages').select(MSG_USER_SELECT).eq('id', id).single();
  if (error || !data) return null;
  const [hydrated] = await attachReplyParents([data]);
  return hydrated || data;
}

/** Fire-and-forget: kích hoạt AI conversation (báo cáo công ty) sau tin user gửi. */
function triggerAiHookIfNeeded(messageRow, groupId, io) {
  if (!messageRow || messageRow.is_system || messageRow.message_type === 'system') return;
  handleIncomingMessage({
    messageRow,
    channelKind: 'group',
    channelId: groupId,
    io,
  }).catch((err) => console.warn('[ai-conv] hook err:', err.message));
}

/** .in('id', …) + map UUID — tránh lệch khóa string/UUID khi join profile */
async function fetchUsersByIdsForMessenger(idList) {
  const ids = [...new Set((idList || []).filter(Boolean).map((x) => String(x)))];
  const rows = [];
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const { data, error } = await supabase.from('users').select('id, full_name, email, avatar, is_bot').in('id', slice);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

function parseMentionUserIds(body) {
  let raw = body?.mention_user_ids;
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(Boolean).map(String))].slice(0, 40);
}

function directPairKey(userIdA, userIdB) {
  const a = String(userIdA);
  const b = String(userIdB);
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Bổ sung peer_id / display_name / peer_avatar cho chat 1-1 (header dock hiển thị đúng người). */
async function enrichDirectGroupResponse(group, authUserId) {
  if (!group?.id || !group.is_direct) return group;
  const { data: mems, error: mErr } = await supabase
    .from('messenger_group_members')
    .select('user_id')
    .eq('group_id', group.id);
  if (mErr) throw mErr;
  const other = (mems || [])
    .map((m) => m.user_id)
    .find((id) => String(id) !== String(authUserId));
  if (!other) {
    return { ...group, peer_id: null, display_name: group.name, peer_avatar: null };
  }
  const { data: pu } = await supabase
    .from('users')
    .select('id, full_name, email, avatar')
    .eq('id', other)
    .maybeSingle();
  return {
    ...group,
    peer_id: other,
    display_name: pu?.full_name || pu?.email || 'Đồng nghiệp',
    peer_avatar: pu?.avatar || null,
  };
}

function parseUuidParam(s) {
  if (s == null || typeof s !== 'string') return null;
  const t = String(s).trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      t,
    )
  ) {
    return null;
  }
  return t;
}

function isDuplicateKeyError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate') || msg.includes('unique');
}

async function userCanEnsureLeadMessenger(uid, leadId) {
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('assigned_to, lead_owner_id, created_by')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return false;
  const u = String(uid);
  if ([lead.assigned_to, lead.lead_owner_id, lead.created_by].filter(Boolean).map(String).includes(u)) {
    return true;
  }
  const { data: lm } = await supabase.from('lead_members').select('id').eq('lead_id', leadId).eq('user_id', uid).limit(1).maybeSingle();
  if (lm) return true;
  const { data: usr } = await supabase.from('users').select('role').eq('id', uid).maybeSingle();
  return isAdminLike(usr);
}

/** Một nhóm chat nội bộ gắn lead/deal (get-or-create); thêm thành viên theo team lead. */
r.post('/leads/:leadId/ensure-internal-chat', async (req, res) => {
  try {
    const leadId = parseUuidParam(req.params.leadId);
    if (!leadId) return res.status(400).json({ error: 'Lead/deal không hợp lệ' });
    const uid = req.authUserId;
    const { data: lead, error: lErr } = await supabase
      .from('crm_leads')
      .select('id, code, title, assigned_to, lead_owner_id, created_by')
      .eq('id', leadId)
      .maybeSingle();
    if (lErr || !lead) return res.status(404).json({ error: 'Lead/deal không tồn tại' });
    const allowed = await userCanEnsureLeadMessenger(uid, leadId);
    if (!allowed) return res.status(403).json({ error: 'Bạn không thuộc team lead/deal này' });

    const { data: existing } = await supabase.from('messenger_groups').select('id,name').eq('crm_lead_id', leadId).maybeSingle();
    if (existing?.id) {
      let ok = await assertGroupMember(existing.id, uid);
      if (!ok) {
        const { error: addErr } = await supabase.from('messenger_group_members').insert({
          group_id: existing.id,
          user_id: uid,
          role: 'member',
          added_by: uid,
        });
        if (!addErr || isDuplicateKeyError(addErr)) ok = true;
      }
      if (!ok) return res.status(403).json({ error: 'Không thể tham gia nhóm chat nội bộ của lead/deal này' });
      return res.json({ group_id: existing.id, name: existing.name, created: false });
    }

    const titlePart = String(lead.title || '').slice(0, 60);
    const name = `Nội bộ · ${lead.code || leadId.slice(0, 8)}${titlePart ? ` — ${titlePart}` : ''}`;
    const memberIds = new Set([uid]);
    if (lead.assigned_to) memberIds.add(String(lead.assigned_to));
    if (lead.lead_owner_id) memberIds.add(String(lead.lead_owner_id));
    if (lead.created_by) memberIds.add(String(lead.created_by));
    const { data: memRows } = await supabase.from('lead_members').select('user_id').eq('lead_id', leadId);
    (memRows || []).forEach((m) => {
      if (m.user_id) memberIds.add(String(m.user_id));
    });

    const { data: group, error: gErr } = await supabase
      .from('messenger_groups')
      .insert({ name, created_by: uid, crm_lead_id: leadId })
      .select('*')
      .single();
    if (gErr) {
      const code = String(gErr.code || '');
      const msg = String(gErr.message || '').toLowerCase();
      if (code === '23505' || msg.includes('unique') || msg.includes('duplicate')) {
        const { data: ex2 } = await supabase.from('messenger_groups').select('id,name').eq('crm_lead_id', leadId).maybeSingle();
        if (ex2?.id) {
          const ok2 = await assertGroupMember(ex2.id, uid);
          if (!ok2) {
            const { error: addEx } = await supabase.from('messenger_group_members').insert({
              group_id: ex2.id,
              user_id: uid,
              role: 'member',
              added_by: uid,
            });
            if (addEx && !isDuplicateKeyError(addEx)) {
              return res.status(403).json({ error: 'Không thể tham gia nhóm chat nội bộ của lead/deal này' });
            }
          }
          return res.json({ group_id: ex2.id, name: ex2.name, created: false });
        }
      }
      return res.status(400).json({ error: gErr.message });
    }

    const memberRows = [];
    for (const mid of memberIds) {
      const role = String(mid) === String(uid) ? 'leader' : 'member';
      memberRows.push({ group_id: group.id, user_id: mid, role, added_by: uid });
    }
    const { error: mErr } = await supabase.from('messenger_group_members').insert(memberRows);
    if (mErr) {
      await supabase.from('messenger_groups').delete().eq('id', group.id);
      return res.status(400).json({ error: mErr.message });
    }

    const { data: creator } = await supabase.from('users').select('full_name').eq('id', uid).single();
    await supabase.from('messenger_group_messages').insert({
      group_id: group.id,
      user_id: uid,
      content: `${creator?.full_name || 'Ai đó'} đã tạo nhóm nội bộ cho lead/deal «${name}»`,
      message_type: 'system',
      is_system: true,
    });

    res.status(201).json({ group_id: group.id, name: group.name, created: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Chat 1–1 giữa hai nhân viên (một hàng messenger_groups, is_direct = true) */
r.post('/direct', async (req, res) => {
  try {
    const peer = req.body.peer_user_id;
    if (!peer) return res.status(400).json({ error: 'Thiếu peer_user_id' });
    if (String(peer) === String(req.authUserId)) return res.status(400).json({ error: 'Không thể chat với chính mình' });
    const key = directPairKey(req.authUserId, peer);
    const { data: existing } = await supabase.from('messenger_groups').select('*').eq('direct_pair_key', key).maybeSingle();
    if (existing?.id) {
      return res.status(200).json(await enrichDirectGroupResponse(existing, req.authUserId));
    }

    const { data: me } = await supabase.from('users').select('full_name').eq('id', req.authUserId).single();
    const { data: them } = await supabase.from('users').select('full_name').eq('id', peer).single();
    const name = `Trò chuyện: ${me?.full_name || 'Bạn'} — ${them?.full_name || 'Đồng nghiệp'}`;

    const { data: group, error: gErr } = await supabase
      .from('messenger_groups')
      .insert({
        name,
        created_by: req.authUserId,
        is_direct: true,
        direct_pair_key: key,
      })
      .select('*')
      .single();
    if (gErr) return res.status(400).json({ error: gErr.message });

    const { error: mErr } = await supabase.from('messenger_group_members').insert([
      { group_id: group.id, user_id: req.authUserId, role: 'member', added_by: req.authUserId },
      { group_id: group.id, user_id: peer, role: 'member', added_by: req.authUserId },
    ]);
    if (mErr) {
      await supabase.from('messenger_groups').delete().eq('id', group.id);
      return res.status(400).json({ error: mErr.message });
    }

    await supabase.from('messenger_group_messages').insert({
      group_id: group.id,
      user_id: req.authUserId,
      content: 'Bắt đầu trò chuyện',
      message_type: 'system',
      is_system: true,
    });

    res.status(201).json(await enrichDirectGroupResponse(group, req.authUserId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Danh sách nhóm mà user là thành viên */
r.get('/groups', responseCache({ ttl: 30, scope: 'user', tags: ['messenger'] }), async (req, res) => {
  try {
    const uid = req.authUserId;
    const { data: rows, error } = await supabase.from('messenger_group_members').select('group_id, role').eq('user_id', uid);
    if (error) throw error;
    const roleByGid = new Map((rows || []).map((r) => [r.group_id, r.role]));
    const ids = [...roleByGid.keys()];
    if (!ids.length) return res.json([]);
    const { data: groups, error: gErr } = await supabase.from('messenger_groups').select('*').in('id', ids);
    if (gErr) throw gErr;

    const leadQ = req.query.crm_lead_id != null ? String(req.query.crm_lead_id).trim() : '';
    const leadFilter = leadQ ? parseUuidParam(leadQ) : null;

    const groupsFiltered =
      leadFilter && Array.isArray(groups) ? groups.filter((g) => String(g.crm_lead_id || '') === leadFilter) : groups || [];

    const { data: allMems } = await supabase
      .from('messenger_group_members')
      .select('group_id, user_id')
      .in('group_id', ids);
    const membersByG = new Map();
    for (const m of allMems || []) {
      if (!membersByG.has(m.group_id)) membersByG.set(m.group_id, []);
      membersByG.get(m.group_id).push(m.user_id);
    }
    const peerIds = [];
    for (const g of groupsFiltered || []) {
      if (!g.is_direct) continue;
      const mems = membersByG.get(g.id) || [];
      const other = mems.find((id) => String(id) !== String(uid));
      if (other) peerIds.push(other);
    }
    const uniquePeers = [...new Set(peerIds)];
    let peerMap = new Map();
    if (uniquePeers.length) {
      const { data: peerUsers } = await supabase.from('users').select('id, full_name, avatar').in('id', uniquePeers);
      (peerUsers || []).forEach((u) => peerMap.set(u.id, u));
    }

    let statsMap = new Map();
    if (ids.length) {
      // Thử v3 (có preview theo tệp đính kèm + last_user_id) → v2 → v1.
      const { data: statRowsV3, error: errV3 } = await supabase.rpc('messenger_group_list_stats_v3', {
        p_group_ids: ids,
        p_user_id: uid,
      });
      if (!errV3 && Array.isArray(statRowsV3)) {
        for (const row of statRowsV3) {
          statsMap.set(row.group_id, {
            message_count: Number(row.message_count) || 0,
            last_message_at: row.last_message_at,
            last_message: row.last_message || null,
            last_user_id: row.last_user_id || null,
            unread_count: Number(row.unread_count) || 0,
          });
        }
      } else {
        const { data: statRows, error: statErr } = await supabase.rpc('messenger_group_list_stats_v2', {
          p_group_ids: ids,
          p_user_id: uid,
        });
        if (!statErr && Array.isArray(statRows)) {
          for (const row of statRows) {
            statsMap.set(row.group_id, {
              message_count: Number(row.message_count) || 0,
              last_message_at: row.last_message_at,
              last_message: row.last_message || null,
              last_user_id: null,
              unread_count: Number(row.unread_count) || 0,
            });
          }
        } else {
          const { data: statRowsV1 } = await supabase.rpc('messenger_group_list_stats', { p_group_ids: ids });
          for (const row of statRowsV1 || []) {
            statsMap.set(row.group_id, {
              message_count: Number(row.message_count) || 0,
              last_message_at: row.last_message_at,
              last_message: null,
              last_user_id: null,
              unread_count: 0,
            });
          }
        }
      }

      // Fallback Node: với mọi nhóm thiếu preview (do RPC chưa migrate, hoặc tin cuối chỉ có
      // tệp đính kèm), tự truy vấn tin cuối và dựng preview ngay tại Node — đảm bảo MỌI đoạn
      // chat đều có dòng "tin mới nhất".
      try {
        const missing = ids.filter((gid) => {
          const s = statsMap.get(gid);
          return !s || !s.last_message;
        });
        if (missing.length) {
          const { data: recentRows } = await supabase
            .from('messenger_group_messages')
            .select('group_id, user_id, content, attachment_mime, attachment_name, attachments, is_system, created_at')
            .in('group_id', missing)
            .order('created_at', { ascending: false })
            .limit(Math.min(missing.length * 5, 250));
          const picked = new Map();
          for (const m of recentRows || []) {
            if (m.is_system) continue;
            if (!picked.has(m.group_id)) picked.set(m.group_id, m);
            if (picked.size === missing.length) break;
          }
          for (const [gid, m] of picked) {
            const prev = statsMap.get(gid) || {
              message_count: 0,
              last_message_at: m.created_at,
              last_message: null,
              last_user_id: null,
              unread_count: 0,
            };
            const preview = buildMessagePreviewNode(m, { forUserId: uid });
            if (preview) {
              statsMap.set(gid, {
                ...prev,
                last_message: preview,
                last_user_id: prev.last_user_id || m.user_id || null,
                last_message_at: prev.last_message_at || m.created_at,
              });
            }
          }
        }
      } catch (_) {
        /* best-effort, bỏ qua nếu lỗi */
      }
    }

    const list = (groupsFiltered || []).map((g) => {
      let display_name = g.name;
      let peer_id = null;
      let peer_avatar = null;
      if (g.is_direct) {
        const mems = membersByG.get(g.id) || [];
        const other = mems.find((id) => String(id) !== String(uid));
        if (other) {
          peer_id = other;
          const pu = peerMap.get(other);
          if (pu?.full_name) display_name = pu.full_name;
          if (pu?.avatar) peer_avatar = pu.avatar;
        }
      }
      const st = statsMap.get(g.id);
      return {
        id: g.id,
        name: display_name,
        raw_name: g.name,
        avatar: g.avatar || null,
        is_direct: !!g.is_direct,
        peer_id,
        peer_avatar,
        created_by: g.created_by,
        created_at: g.created_at,
        crm_lead_id: g.crm_lead_id || null,
        my_role: roleByGid.get(g.id),
        message_count: st?.message_count ?? 0,
        last_message_at: st?.last_message_at || g.created_at,
        last_message: st?.last_message ?? null,
        last_user_id: st?.last_user_id ?? null,
        unread_count: st?.unread_count ?? 0,
      };
    });
    list.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Ghim hội thoại Messenger theo từng user (lưu DB) */
r.get('/pins', async (req, res) => {
  try {
    const uid = req.authUserId;
    const { data, error } = await supabase.from('messenger_user_pins').select('group_id').eq('user_id', uid);
    if (error) throw error;
    res.json({ group_ids: (data || []).map((x) => x.group_id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/pins/:groupId', async (req, res) => {
  try {
    const uid = req.authUserId;
    const gid = req.params.groupId;
    const pinned = !!req.body?.pinned;
    const ok = await assertGroupMember(gid, uid);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    if (pinned) {
      const { error } = await supabase.from('messenger_user_pins').upsert(
        { user_id: uid, group_id: gid, pinned_at: new Date().toISOString() },
        { onConflict: 'user_id,group_id' },
      );
      if (error) return res.status(400).json({ error: error.message });
    } else {
      await supabase.from('messenger_user_pins').delete().eq('user_id', uid).eq('group_id', gid);
    }
    res.json({ ok: true, pinned });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Rời nhóm (chỉ nhóm đặt tên, không áp dụng chat trực tiếp 1–1) */
r.post('/groups/:id/leave', async (req, res) => {
  try {
    const gid = req.params.id;
    const uid = req.authUserId;
    const { data: group, error: gErr } = await supabase.from('messenger_groups').select('id,is_direct').eq('id', gid).single();
    if (gErr || !group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    if (group.is_direct) return res.status(400).json({ error: 'Không dùng rời nhóm cho chat trực tiếp' });
    const ok = await assertGroupMember(gid, uid);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const { data: who } = await supabase.from('users').select('full_name').eq('id', uid).single();
    await supabase.from('messenger_group_members').delete().eq('group_id', gid).eq('user_id', uid);
    const { data: inserted, error: insErr } = await supabase
      .from('messenger_group_messages')
      .insert({
        group_id: gid,
        user_id: uid,
        content: `${who?.full_name || 'Thành viên'} đã rời khỏi nhóm`,
        message_type: 'system',
        is_system: true,
      })
      .select('id')
      .single();
    const io = req.app.get('io');
    if (!insErr && inserted?.id) {
      const full = await fetchMessengerMessageById(inserted.id);
      if (io && full) io.to(`messenger_group:${gid}`).emit('messenger_group:chat', full);
    }
    if (io) io.to(`messenger_group:${gid}`).emit('messenger_group:members', { group_id: gid });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Đánh dấu đã đọc: cập nhật messenger_read_receipts cho user+group,
 *  đồng thời đánh dấu các notification messenger_chat thuộc nhóm này là đã đọc
 *  (để badge "Tin nhắn" trên bottom tab giảm đúng số chưa đọc). */
r.patch('/groups/:id/read', async (req, res) => {
  try {
    const uid = req.authUserId;
    const gid = req.params.id;
    const ok = await assertGroupMember(gid, uid);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const last_read_at = new Date().toISOString();
    const { error } = await supabase.from('messenger_read_receipts').upsert(
      { group_id: gid, user_id: uid, last_read_at },
      { onConflict: 'group_id,user_id' },
    );
    if (error) throw error;

    // Mark related notifications as read (best-effort, không throw nếu lỗi)
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', uid)
        .eq('is_read', false)
        .eq('type', 'messenger_chat')
        .eq('entity_type', 'messenger_group')
        .eq('entity_id', gid);
    } catch {
      /* ignore — chỉ tốt-nice-to-have */
    }

    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${gid}`).emit('messenger_group:read', { group_id: gid, user_id: uid, last_read_at });
    res.json({ ok: true, last_read_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Danh sách read receipts của nhóm — dùng để hiển thị Đã gửi / Đã xem cho từng tin nhắn */
r.get('/groups/:id/read-receipts', async (req, res) => {
  try {
    const ok = await assertGroupMember(req.params.id, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const { data, error } = await supabase
      .from('messenger_read_receipts')
      .select('user_id, last_read_at')
      .eq('group_id', req.params.id);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Đổi avatar nhóm — yêu cầu là leader/deputy (hoặc admin hệ thống).
 * Upload qua multipart `file`; lưu vào Supabase Storage hoặc /uploads.
 * Trả về `{ avatar }` URL public mới và emit socket `messenger_group:updated`.
 */
r.patch('/groups/:id/avatar', messengerMemoryUpload.single('file'), async (req, res) => {
  try {
    const gid = req.params.id;
    const ok = await assertGroupLeader(gid, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Chỉ trưởng/phó nhóm mới được đổi avatar' });
    if (!req.file) return res.status(400).json({ error: 'Thiếu file ảnh' });
    const mime = (req.file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) return res.status(400).json({ error: 'Chỉ chấp nhận file ảnh' });

    const stored = await storeMessengerUploadedFile(gid, req.file);
    const avatarUrl = stored.url;

    const { error: uErr } = await supabase
      .from('messenger_groups')
      .update({ avatar: avatarUrl })
      .eq('id', gid);
    if (uErr) return res.status(400).json({ error: uErr.message });

    const io = req.app.get('io');
    if (io) {
      io.to(`messenger_group:${gid}`).emit('messenger_group:updated', { group_id: gid, avatar: avatarUrl });
    }
    res.json({ avatar: avatarUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Đổi tên nhóm — chỉ leader/deputy mới được đổi. Cấm đổi tên chat 1-1
 * (vì 1-1 tự sinh tên từ tên đối tác). Emit socket để các thiết bị khác
 * cập nhật.
 */
r.patch('/groups/:id', async (req, res) => {
  try {
    const gid = req.params.id;
    const ok = await assertGroupLeader(gid, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Chỉ trưởng/phó nhóm mới được đổi tên' });

    const { data: group, error: gErr } = await supabase
      .from('messenger_groups')
      .select('id, is_direct')
      .eq('id', gid)
      .single();
    if (gErr || !group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    if (group.is_direct) return res.status(400).json({ error: 'Không thể đổi tên chat 1–1' });

    const raw = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!raw) return res.status(400).json({ error: 'Tên nhóm không được để trống' });
    if (raw.length > 120) return res.status(400).json({ error: 'Tên nhóm tối đa 120 ký tự' });

    const { error: uErr } = await supabase
      .from('messenger_groups')
      .update({ name: raw })
      .eq('id', gid);
    if (uErr) return res.status(400).json({ error: uErr.message });

    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${gid}`).emit('messenger_group:updated', { group_id: gid, name: raw });
    res.json({ id: gid, name: raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Xoá avatar nhóm — set NULL. */
r.delete('/groups/:id/avatar', async (req, res) => {
  try {
    const gid = req.params.id;
    const ok = await assertGroupLeader(gid, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Chỉ trưởng/phó nhóm mới được đổi avatar' });
    const { error: uErr } = await supabase.from('messenger_groups').update({ avatar: null }).eq('id', gid);
    if (uErr) return res.status(400).json({ error: uErr.message });
    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${gid}`).emit('messenger_group:updated', { group_id: gid, avatar: null });
    res.json({ avatar: null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Chi tiết nhóm + thành viên */
r.get('/groups/:id', async (req, res) => {
  try {
    const ok = await assertGroupMember(req.params.id, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const { data: group, error: gErr } = await supabase.from('messenger_groups').select('*').eq('id', req.params.id).single();
    if (gErr || !group) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    const { data: memberRows } = await supabase
      .from('messenger_group_members')
      .select('id, group_id, user_id, role, added_by, created_at')
      .eq('group_id', req.params.id)
      .order('created_at');
    const uids = [...new Set((memberRows || []).map((m) => m.user_id).filter(Boolean))];
    const userMap = new Map();
    if (uids.length) {
      const users = await fetchUsersByIdsForMessenger(uids);
      users.forEach((u) => userMap.set(String(u.id), u));
    }
    const members = (memberRows || []).map((m) => ({ ...m, user: userMap.get(String(m.user_id)) || null }));
    res.json({ ...group, members });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Tạo nhóm — không tạo Lead/Deal.
 * Người tạo luôn được thêm với role leader (kể cả khi client không gửi trong members[]).
 */
r.post('/groups', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nhập tên nhóm' });
    const creatorId = req.authUserId;
    const rawMembers = Array.isArray(req.body.members) ? req.body.members : [];

    let crmLeadId = null;
    if (req.body.crm_lead_id != null && String(req.body.crm_lead_id).trim() !== '') {
      crmLeadId = parseUuidParam(String(req.body.crm_lead_id));
      if (!crmLeadId) return res.status(400).json({ error: 'crm_lead_id không hợp lệ' });
    }

    const insertRow = { name, created_by: creatorId };
    if (crmLeadId) insertRow.crm_lead_id = crmLeadId;

    const { data: group, error: gErr } = await supabase
      .from('messenger_groups')
      .insert(insertRow)
      .select('*')
      .single();
    if (gErr) return res.status(400).json({ error: gErr.message });

    const memberRows = [{ group_id: group.id, user_id: creatorId, role: 'leader', added_by: creatorId }];
    const seen = new Set([String(creatorId)]);

    for (const m of rawMembers) {
      const uid = m.user_id || m.userId;
      if (!uid || seen.has(String(uid))) continue;
      seen.add(String(uid));
      let role = mapIncomingRole(m.role);
      if (role === 'leader') role = 'member';
      memberRows.push({ group_id: group.id, user_id: uid, role, added_by: creatorId });
    }

    const { error: mErr } = await supabase.from('messenger_group_members').insert(memberRows);
    if (mErr) {
      await supabase.from('messenger_groups').delete().eq('id', group.id);
      return res.status(400).json({ error: mErr.message });
    }

    const { data: creator } = await supabase.from('users').select('full_name').eq('id', creatorId).single();
    await supabase.from('messenger_group_messages').insert({
      group_id: group.id,
      user_id: creatorId,
      content: `${creator?.full_name || 'Ai đó'} đã tạo nhóm «${name}»`,
      message_type: 'system',
      is_system: true,
    });

    res.status(201).json(group);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Kiểm tra user có vai trò leader/deputy trong nhóm không (để cho phép quản trị nhóm).
 * Admin hệ thống (admin / sales_admin) cũng được tính như leader.
 */
async function assertGroupLeader(groupId, userId) {
  const { data: u } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  if (isAdminLike(u)) return true;
  const { data } = await supabase
    .from('messenger_group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data && (data.role === 'leader' || data.role === 'deputy');
}

/** Danh sách thành viên + thông tin user của 1 nhóm (mọi thành viên xem được). */
r.get('/groups/:id/members', async (req, res) => {
  try {
    const ok = await assertGroupMember(req.params.id, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const { data: memberRows } = await supabase
      .from('messenger_group_members')
      .select('id, group_id, user_id, role, added_by, created_at')
      .eq('group_id', req.params.id)
      .order('created_at');
    const uids = [...new Set((memberRows || []).map((m) => m.user_id).filter(Boolean))];
    let userMap = new Map();
    if (uids.length) {
      const users = await fetchUsersByIdsForMessenger(uids);
      userMap = new Map(users.map((u) => [String(u.id), u]));
    }
    const members = (memberRows || []).map((m) => ({ ...m, user: userMap.get(String(m.user_id)) || null }));
    res.json({ members });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Xoá thành viên khỏi nhóm — chỉ leader/deputy hoặc admin hệ thống.
 * Không cho xoá chính creator của nhóm (giữ cấu trúc).
 */
r.delete('/groups/:id/members/:userId', async (req, res) => {
  try {
    const gid = req.params.id;
    const targetId = req.params.userId;
    const isLeader = await assertGroupLeader(gid, req.authUserId);
    if (!isLeader) return res.status(403).json({ error: 'Chỉ leader/deputy mới được xoá thành viên' });

    // Không cho xoá creator nhóm
    const { data: grp } = await supabase
      .from('messenger_groups')
      .select('id, is_direct, created_by')
      .eq('id', gid)
      .maybeSingle();
    if (!grp) return res.status(404).json({ error: 'Nhóm không tồn tại' });
    if (grp.is_direct) return res.status(400).json({ error: 'Không quản lý thành viên cho chat trực tiếp' });
    if (String(grp.created_by) === String(targetId)) {
      return res.status(400).json({ error: 'Không thể xoá người tạo nhóm' });
    }

    const { data: target } = await supabase.from('users').select('full_name').eq('id', targetId).single();
    const { data: actor } = await supabase.from('users').select('full_name').eq('id', req.authUserId).single();

    const { error } = await supabase
      .from('messenger_group_members')
      .delete()
      .eq('group_id', gid)
      .eq('user_id', targetId);
    if (error) return res.status(400).json({ error: error.message });

    const io = req.app.get('io');
    const { data: ins } = await supabase
      .from('messenger_group_messages')
      .insert({
        group_id: gid,
        user_id: req.authUserId,
        content: `${actor?.full_name || 'Quản trị viên'} đã xoá ${target?.full_name || 'thành viên'} khỏi nhóm`,
        message_type: 'system',
        is_system: true,
      })
      .select('id')
      .single();
    if (io && ins?.id) {
      const full = await fetchMessengerMessageById(ins.id);
      if (full) io.to(`messenger_group:${gid}`).emit('messenger_group:chat', full);
      io.to(`messenger_group:${gid}`).emit('messenger_group:members', { group_id: gid });
    }

    // Push mobile + socket notification cho user bị xoá
    try {
      const { data: grpInfo } = await supabase
        .from('messenger_groups')
        .select('name')
        .eq('id', gid)
        .maybeSingle();
      const grpName = grpInfo?.name || 'Nhóm chat';
      await notifyMultiple(
        req,
        [targetId],
        'messenger_chat',
        'Bạn đã bị xoá khỏi nhóm',
        `${actor?.full_name || 'Quản trị viên'} đã xoá bạn khỏi nhóm «${grpName}»`,
        'messenger_group',
        gid,
        {
          group_name: grpName,
          sender_name: actor?.full_name || 'Quản trị viên',
          sender_id: req.authUserId,
          bubble_key: String(gid),
          message_type: 'system',
          event: 'member_removed',
        },
      );
    } catch (e) {
      console.warn('[messengerGroups] notify remove-member lỗi:', e.message || e);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Đổi vai trò thành viên (member ↔ deputy). Không cho gán/huỷ leader để tránh tranh chấp;
 * leader cố định = người tạo nhóm.
 */
r.patch('/groups/:id/members/:userId/role', async (req, res) => {
  try {
    const gid = req.params.id;
    const targetId = req.params.userId;
    const isLeader = await assertGroupLeader(gid, req.authUserId);
    if (!isLeader) return res.status(403).json({ error: 'Chỉ leader/deputy mới được đổi vai trò' });

    let role = mapIncomingRole(req.body?.role);
    if (role === 'leader') role = 'deputy'; // không cho promote leader

    const { data: grp } = await supabase
      .from('messenger_groups')
      .select('id, created_by')
      .eq('id', gid)
      .maybeSingle();
    if (!grp) return res.status(404).json({ error: 'Nhóm không tồn tại' });
    if (String(grp.created_by) === String(targetId)) {
      return res.status(400).json({ error: 'Người tạo nhóm luôn là leader' });
    }

    const { data, error } = await supabase
      .from('messenger_group_members')
      .update({ role })
      .eq('group_id', gid)
      .eq('user_id', targetId)
      .select('id, group_id, user_id, role')
      .single();
    if (error) return res.status(400).json({ error: error.message });

    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${gid}`).emit('messenger_group:members', { group_id: gid });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Thêm thành viên — leader/deputy hoặc admin hệ thống. Nhiều thành viên cùng lúc qua members[]. */
r.post('/groups/:id/members', async (req, res) => {
  try {
    const isLeader = await assertGroupLeader(req.params.id, req.authUserId);
    if (!isLeader) {
      // Fallback: vẫn cho member thường thêm (giữ tương thích với UI cũ)
      const ok = await assertGroupMember(req.params.id, req.authUserId);
      if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    }
    const batch = Array.isArray(req.body.members) ? req.body.members : [];
    const user_id = req.body.user_id;
    const toAdd = batch.length ? batch : user_id ? [{ user_id, role: req.body.role || 'member' }] : [];
    if (!toAdd.length) return res.status(400).json({ error: 'Thiếu members' });

    const { data: adder } = await supabase.from('users').select('full_name').eq('id', req.authUserId).single();
    const io = req.app.get('io');
    const gid = req.params.id;
    const results = [];
    for (const item of toAdd) {
      let role = mapIncomingRole(item.role);
      if (role === 'leader') role = 'member';
      const { data: existed } = await supabase
        .from('messenger_group_members')
        .select('id')
        .eq('group_id', gid)
        .eq('user_id', item.user_id)
        .maybeSingle();
      const { data, error } = await supabase
        .from('messenger_group_members')
        .upsert({ group_id: gid, user_id: item.user_id, role, added_by: req.authUserId }, { onConflict: 'group_id,user_id' })
        .select('id, group_id, user_id, role, created_at')
        .single();
      if (error) continue;
      results.push(data);
      if (!existed) {
        const { data: addedU } = await supabase.from('users').select('full_name').eq('id', item.user_id).single();
        const memberName = addedU?.full_name || 'Thành viên';
        const { data: ins, error: msgErr } = await supabase
          .from('messenger_group_messages')
          .insert({
            group_id: gid,
            user_id: req.authUserId,
            content: `${adder?.full_name || 'Ai đó'} đã thêm ${memberName} vào nhóm`,
            message_type: 'system',
            is_system: true,
          })
          .select('id')
          .single();
        if (!msgErr && ins?.id) {
          const full = await fetchMessengerMessageById(ins.id);
          if (io && full) io.to(`messenger_group:${gid}`).emit('messenger_group:chat', full);
        }

        // Push mobile + socket notification cho user vừa được thêm
        try {
          const { data: grpInfo } = await supabase
            .from('messenger_groups')
            .select('name')
            .eq('id', gid)
            .maybeSingle();
          const grpName = grpInfo?.name || 'Nhóm chat';
          await notifyMultiple(
            req,
            [item.user_id],
            'messenger_chat',
            `Bạn đã được thêm vào nhóm`,
            `${adder?.full_name || 'Ai đó'} đã thêm bạn vào «${grpName}»`,
            'messenger_group',
            gid,
            {
              group_name: grpName,
              sender_name: adder?.full_name || 'Quản trị viên',
              sender_id: req.authUserId,
              bubble_key: String(gid),
              bubble_wake: true,
              message_type: 'system',
              event: 'member_added',
            },
          );
        } catch (e) {
          console.warn('[messengerGroups] notify add-member lỗi:', e.message || e);
        }
      }
    }

    if (io) io.to(`messenger_group:${gid}`).emit('messenger_group:members', { group_id: gid });

    res.json(results.length === 1 ? results[0] : results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/groups/:id/chat', async (req, res) => {
  try {
    const ok = await assertGroupMember(req.params.id, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const { data, error } = await supabase
      .from('messenger_group_messages')
      .select(MSG_USER_SELECT)
      .eq('group_id', req.params.id)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    let rows = data || [];
    const missingIds = [...new Set(rows.filter((m) => m.user_id && !m.user).map((m) => String(m.user_id)))];
    if (missingIds.length) {
      const users = await fetchUsersByIdsForMessenger(missingIds);
      const um = new Map(users.map((u) => [String(u.id), u]));
      rows = rows.map((m) => {
        if (m.user || !m.user_id) return m;
        return { ...m, user: um.get(String(m.user_id)) || null };
      });
    }
    rows = await attachReplyParents(rows);
    rows = await attachReactionsToMessages(rows);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Text-only từ axios JSON (mobile) — không đi qua multer */
function messengerChatJsonOrMultipart(req, res, next) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json')) return next();
  return messengerMemoryUpload.array('files', 20)(req, res, next);
}

r.post('/groups/:id/chat', messengerChatJsonOrMultipart, async (req, res) => {
  try {
    const ok = await assertGroupMember(req.params.id, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const { content, reply_to } = req.body;
    const files = req.files || [];
    const attachments = [];
    for (const f of files) {
      attachments.push(await storeMessengerUploadedFile(req.params.id, f));
    }
    if (!content && !attachments.length) return res.status(400).json({ error: 'Thiếu nội dung' });
    const mentionIds = parseMentionUserIds(req.body);
    const insertRow = {
      group_id: req.params.id,
      user_id: req.authUserId,
      content: content || '',
      attachments: attachments.length ? attachments : null,
      reply_to: reply_to || null,
    };
    if (mentionIds.length) insertRow.mention_user_ids = mentionIds;
    const { data: inserted, error } = await supabase
      .from('messenger_group_messages')
      .insert(insertRow)
      .select('id')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    const data = (await fetchMessengerMessageById(inserted.id)) || inserted;
    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${req.params.id}`).emit('messenger_group:chat', data);
    const { data: grpRow } = await supabase.from('messenger_groups').select('name').eq('id', req.params.id).maybeSingle();
    await notifyMessengerGroupChatRecipients(req, req.params.id, req.authUserId, data, grpRow?.name || '');
    triggerAiHookIfNeeded(data, req.params.id, io);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/groups/:id/chat/upload', messengerMemoryUpload.single('file'), async (req, res) => {
  try {
    const ok = await assertGroupMember(req.params.id, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const mime = req.file.mimetype;
    let message_type = 'file';
    if (mime.startsWith('image/')) message_type = 'image';
    else if (mime.startsWith('video/')) message_type = 'video';
    else if (mime.startsWith('audio/')) message_type = 'audio';
    const stored = await storeMessengerUploadedFile(req.params.id, req.file);
    const attachment_url = stored.url;
    const mentionIds = parseMentionUserIds(req.body);
    const insertRow = {
      group_id: req.params.id,
      user_id: req.authUserId,
      content: req.body.content || '',
      message_type,
      attachment_url,
      attachment_name: req.file.originalname,
      attachment_size: req.file.size,
      attachment_mime: mime,
      reply_to: req.body.reply_to || null,
    };
    if (mentionIds.length) insertRow.mention_user_ids = mentionIds;
    const { data: inserted, error } = await supabase
      .from('messenger_group_messages')
      .insert(insertRow)
      .select('id')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    const data = (await fetchMessengerMessageById(inserted.id)) || inserted;
    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${req.params.id}`).emit('messenger_group:chat', data);
    const { data: grpRow } = await supabase.from('messenger_groups').select('name').eq('id', req.params.id).maybeSingle();
    await notifyMessengerGroupChatRecipients(req, req.params.id, req.authUserId, data, grpRow?.name || '');
    triggerAiHookIfNeeded(data, req.params.id, io);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Toggle / đặt cảm xúc cho 1 tin — mỗi user tối đa 1 emoji / tin (đổi hoặc bỏ). */
async function handleMessageReaction(req, res) {
  try {
    const { gid, mid } = req.params;
    const uid = req.authUserId;
    const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';
    logMessengerAction({ action: 'reaction-request', gid, mid, uid, method: req.method });
    if (!emoji || emoji.length > 16) return res.status(400).json({ error: 'Emoji không hợp lệ' });

    const ok = await assertGroupMember(gid, uid);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });

    const msg = await fetchGroupMessageForAction(gid, mid);
    if (!msg) {
      logMessengerAction({ action: 'reaction-not-found', gid, mid });
      return res.status(404).json({ error: 'Không tìm thấy tin nhắn' });
    }
    if (isMessageRecalled(msg)) return res.status(400).json({ error: 'Không thể react tin đã thu hồi' });

    await upsertMessageReaction(mid, uid, emoji);

    const reactions = await fetchReactionsForMessage(mid);
    const io = req.app.get('io');
    if (io) {
      io.to(`messenger_group:${gid}`).emit('messenger_group:reaction', {
        group_id: gid,
        message_id: mid,
        reactions,
      });
    }
    logMessengerAction({ action: 'reaction-ok', gid, mid, count: reactions.length });
    res.json({ message_id: mid, reactions });
  } catch (e) {
    logMessengerAction({ action: 'reaction-failed', gid: req.params.gid, mid: req.params.mid, err: e.message });
    res.status(500).json({ error: e.message });
  }
}

r.put('/groups/:gid/chat/:mid/reaction', handleMessageReaction);
r.post('/groups/:gid/chat/:mid/reaction', handleMessageReaction);

/** Thu hồi tin nhắn — chỉ người gửi, trong vòng 24h. */
r.post('/groups/:gid/chat/:mid/recall', async (req, res) => {
  try {
    const { gid, mid } = req.params;
    const uid = req.authUserId;
    logMessengerAction({ action: 'recall-request', gid, mid, uid, method: req.method });

    const ok = await assertGroupMember(gid, uid);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });

    const msg = await fetchGroupMessageForAction(gid, mid);
    if (!msg) return res.status(404).json({ error: 'Không tìm thấy tin nhắn' });
    if (msg.is_system) return res.status(400).json({ error: 'Không thể thu hồi tin hệ thống' });
    if (isMessageRecalled(msg)) return res.status(400).json({ error: 'Tin đã được thu hồi' });
    if (String(msg.user_id) !== String(uid)) {
      return res.status(403).json({ error: 'Chỉ người gửi mới thu hồi được tin này' });
    }

    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    if (!Number.isFinite(ageMs) || ageMs > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Chỉ thu hồi được trong 24 giờ' });
    }

    const recalled_at = new Date().toISOString();
    try {
      await markMessageRecalled(mid, uid, recalled_at);
    } catch (uErr) {
      logMessengerAction({ action: 'recall-update-failed', gid, mid, err: uErr.message });
      throw uErr;
    }

    const full = (await fetchMessengerMessageById(mid)) || {
      ...msg,
      recalled_at,
      recalled_by: uid,
      is_recalled: true,
    };
    full.reactions = await fetchReactionsForMessage(mid);

    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${gid}`).emit('messenger_group:chat', full);

    logMessengerAction({ action: 'recall-ok', gid, mid });
    res.json(full);
  } catch (e) {
    logMessengerAction({ action: 'recall-failed', gid: req.params.gid, mid: req.params.mid, err: e.message });
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
