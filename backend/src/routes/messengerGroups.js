const { Router } = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { pgQuery, pgQuerySafe, pgSessionQuery, pgSessionQuerySafe } = require('../config/db');
const { MESSENGER_MAX_UPLOAD_MB, MESSENGER_MAX_FILE_BYTES } = require('../config/messengerUpload');
const { notifyMultiple } = require('../helpers/notifications');
const { isAdminLike } = require('../helpers/adminRole');
const { addTenantFilter } = require('../helpers/tenantScope');
const { handleIncomingMessage } = require('../helpers/aiConversation');
const {
  extractCallLogPayloadFromRow,
  hydrateMessengerCallLogRow,
  formatCallLogLine,
  parseCallLogPayload,
} = require('../helpers/messengerCallLog');

function sanitizeStatsLastMessagePreview(text, forUserId) {
  const raw = text == null ? '' : String(text).trim();
  if (!raw) return null;
  if (raw.startsWith(':call_log:')) {
    return formatCallLogLine(parseCallLogPayload(raw), forUserId) || '📞 Cuộc gọi';
  }
  return text;
}
const { responseCache, invalidateTags: rcInvalidateTagsMessenger } = require('../middleware/responseCache');

async function ensureMessengerGroupAvatarColumn() {
  try {
    await pgSessionQuery('ALTER TABLE messenger_groups ADD COLUMN IF NOT EXISTS avatar TEXT');
    return true;
  } catch {
    return false;
  }
}

async function updateGroupAvatar(gid, avatarUrl) {
  let { error } = await supabase.from('messenger_groups').update({ avatar: avatarUrl }).eq('id', gid);
  if (error && String(error.message || '').includes('avatar')) {
    const ensured = await ensureMessengerGroupAvatarColumn();
    if (ensured) {
      ({ error } = await supabase.from('messenger_groups').update({ avatar: avatarUrl }).eq('id', gid));
    }
  }
  return error;
}

/** Nhóm chat: avatar có thể chưa có trên DB / schema cache PostgREST. */
async function fetchMessengerGroupsLite(ids) {
  if (!ids.length) return [];
  const withAvatar = 'id, name, avatar, is_direct';
  const withoutAvatar = 'id, name, is_direct';
  let { data, error } = await supabase.from('messenger_groups').select(withAvatar).in('id', ids);
  if (error && /avatar/i.test(String(error.message || ''))) {
    await ensureMessengerGroupAvatarColumn();
    ({ data, error } = await supabase.from('messenger_groups').select(withAvatar).in('id', ids));
  }
  if (error && /avatar/i.test(String(error.message || ''))) {
    ({ data, error } = await supabase.from('messenger_groups').select(withoutAvatar).in('id', ids));
  }
  if (error) throw error;
  return data || [];
}

/** Bucket Supabase Storage (mặc định giống upload CRM). */
const { uploadBufferToStorage } = require('../helpers/storageUpload');
const MESSENGER_STORAGE_BUCKET = process.env.SUPABASE_MESSENGER_BUCKET || 'attachments';
/** Thư mục trong bucket, mặc định `messenger` — có thể set `messsenger` trong .env nếu đã tạo đúng tên đó. */
const MESSENGER_STORAGE_FOLDER = (process.env.SUPABASE_MESSENGER_FOLDER || 'messenger').replace(/^\/+|\/+$/g, '');

function supabaseMessengerStorageEnabled() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
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
  const fullSelect = 'id, group_id, user_id, created_at, recalled_at, is_system';
  let { data, error } = await supabase
    .from('messenger_group_messages')
    .select(fullSelect)
    .eq('id', mid)
    .eq('group_id', gid)
    .maybeSingle();
  if (error && /recalled_at|schema cache/i.test(error.message || '')) {
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

/**
 * Thu hồi: xóa nội dung/file khỏi DB, giữ dòng tin (tombstone) để UI hiện "Đã thu hồi…".
 */
async function purgeAndRecallMessage(mid, uid, recalled_at) {
  const purgeReactionsSql =
    'DELETE FROM messenger_message_reactions WHERE message_id = $1::uuid';
  const purgeSql =
    `UPDATE messenger_group_messages
     SET recalled_at = $1::timestamptz,
         recalled_by = $2::uuid,
         is_recalled = true,
         content = NULL,
         attachments = NULL,
         attachment_url = NULL,
         attachment_name = NULL,
         attachment_size = NULL,
         attachment_mime = NULL
     WHERE id = $3::uuid`;
  const params = [recalled_at, uid, mid];

  const pgRecall = (await pgSessionQuerySafe(purgeSql, params)) ?? (await pgQuerySafe(purgeSql, params));
  if (pgRecall) {
    if ((pgRecall.rowCount ?? 0) < 1) throw new Error('Không tìm thấy tin nhắn');
    await pgSessionQuerySafe(purgeReactionsSql, [mid]) ?? await pgQuerySafe(purgeReactionsSql, [mid]);
    return;
  }

  await supabase.from('messenger_message_reactions').delete().eq('message_id', mid);

  const { data: updated, error } = await supabase
    .from('messenger_group_messages')
    .update({
      recalled_at,
      recalled_by: uid,
      is_recalled: true,
      content: null,
      attachments: null,
      attachment_url: null,
      attachment_name: null,
      attachment_size: null,
      attachment_mime: null,
    })
    .eq('id', mid)
    .select('id')
    .maybeSingle();
  if (error) {
    if (/schema cache|recalled_at|is_recalled/i.test(error.message || '')) {
      throw new Error(
        'Supabase schema cache chưa cập nhật cột recall. '
          + 'Chạy migration 39_messenger_recall_and_reactions.sql và NOTIFY pgrst, \'reload schema\';',
      );
    }
    throw error;
  }
  if (!updated?.id) throw new Error('Không tìm thấy tin nhắn');
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
  if (!r) return null;
  return r.rows || [];
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
    const callPayload = extractCallLogPayloadFromRow(m);
    if (callPayload || m.message_type === 'call') {
      const line = formatCallLogLine(callPayload, forUserId);
      if (line) return line.length > 120 ? line.slice(0, 120) : line;
    }
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

const LAST_MSG_PREVIEW_SELECT =
  'group_id, user_id, content, message_type, attachment_mime, attachment_name, attachments, is_system, created_at, recalled_at, is_recalled, recalled_by';

function isStatsPreviewMissing(stats) {
  if (!stats) return true;
  return !String(stats.last_message ?? '').trim();
}

/** Lấy tin nhắn cuối (một row / nhóm) để dựng preview sidebar — không dùng LIMIT chung toàn bảng. */
async function fetchLastMessagesForGroupPreviews(groupIds, forUserId) {
  const out = new Map();
  if (!Array.isArray(groupIds) || !groupIds.length) return out;

  const pg = await pgQuery(
    `SELECT DISTINCT ON (m.group_id)
      m.group_id,
      m.user_id,
      m.content,
      m.message_type,
      m.attachment_mime,
      m.attachment_name,
      m.attachments,
      m.is_system,
      m.created_at,
      m.recalled_at,
      m.is_recalled,
      m.recalled_by
    FROM messenger_group_messages m
    WHERE m.group_id = ANY($1::uuid[])
      AND (
        COALESCE(m.is_system, false) = false
        OR m.message_type = 'call'
        OR BTRIM(COALESCE(m.content, '')) LIKE ':call_log:%'
      )
    ORDER BY m.group_id, m.created_at DESC`,
    [groupIds],
  );
  if (pg?.rows?.length) {
    for (const m of pg.rows) {
      const preview = buildMessagePreviewNode(m, { forUserId });
      if (preview) {
        out.set(m.group_id, { preview, user_id: m.user_id, created_at: m.created_at });
      }
    }
    return out;
  }

  const BATCH = 6;
  for (let i = 0; i < groupIds.length; i += BATCH) {
    const chunk = groupIds.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (gid) => {
        try {
          const { data: recent } = await supabase
            .from('messenger_group_messages')
            .select(LAST_MSG_PREVIEW_SELECT)
            .eq('group_id', gid)
            .order('created_at', { ascending: false })
            .limit(8);
          const m = (recent || []).find((row) => buildMessagePreviewNode(row, { forUserId }));
          if (!m) return;
          const preview = buildMessagePreviewNode(m, { forUserId });
          if (preview) {
            out.set(gid, { preview, user_id: m.user_id, created_at: m.created_at });
          }
        } catch {
          /* best-effort */
        }
      }),
    );
  }
  return out;
}

function formatGroupListPreview(preview, { isDirect, lastUserId, viewerId, userNameById, senderName }) {
  const text = String(preview ?? '').trim();
  if (!text || isDirect) return text || null;
  if (!lastUserId) return text;
  if (String(lastUserId) === String(viewerId)) return `Bạn: ${text}`;
  const name =
    senderName
    ?? userNameById?.get(lastUserId)
    ?? userNameById?.get(String(lastUserId));
  return name ? `${name}: ${text}` : text;
}

function fixUploadFilename(originalname) {
  if (!originalname) return 'file';
  const s = String(originalname);
  if (/[\u1E00-\u1EFF]/.test(s) && !/Ã|Æ|Ä|á»|Ð/.test(s)) return s;
  try {
    const buf = Buffer.from(s, 'latin1');
    const utf8Name = buf.toString('utf8');
    if (utf8Name && !utf8Name.includes('\uFFFD') && utf8Name !== s) return utf8Name;
  } catch {
    /* ignore */
  }
  return s;
}

/**
 * Lưu file chat nhóm lên Supabase Storage (`{folder}/{groupId}/…`).
 * Không fallback local để tránh mất file sau deploy/restart.
 * @param {string} groupId
 * @param {{ buffer: Buffer, mimetype: string, originalname: string, size: number }} file
 */
async function storeMessengerUploadedFile(groupId, file) {
  const mime = file.mimetype || 'application/octet-stream';
  const original = fixUploadFilename(file.originalname || 'file');

  if (!supabaseMessengerStorageEnabled()) {
    throw new Error('Upload chat cần Supabase Storage — thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên server');
  }

  const folder = `${MESSENGER_STORAGE_FOLDER}/${groupId}`.replace(/\/+/g, '/');
  try {
    const stored = await uploadBufferToStorage(file.buffer, {
      originalName: original,
      mimetype: mime,
      size: file.size,
      bucket: MESSENGER_STORAGE_BUCKET,
      folderPrefix: folder,
    });
    return {
      name: original,
      url: stored.file_url,
      type: mime,
      size: file.size,
      storage_path: stored.storage_path,
    };
  } catch (e) {
    console.error('[messenger] Supabase storage upload failed:', e.message);
    throw new Error(`Không lưu được file lên Storage: ${e.message}`);
  }
}

const messengerMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MESSENGER_MAX_FILE_BYTES },
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

/** Tải file chat đã lưu local (/uploads/messenger-chat/...) — có auth, UTF-8 filename. */
r.get('/files/download', async (req, res) => {
  try {
    const { resolveUploadDownloadSource, sendUploadDownloadResponse } = require('../helpers/localUploadServe');
    const rawPath = String(req.query.path || '').trim();
    if (!rawPath) return res.status(400).json({ error: 'Thiếu path' });
    const resolved = await resolveUploadDownloadSource(rawPath);
    if (!resolved) {
      return res.status(404).json({
        error: 'Không tìm thấy file — file có thể đã mất sau deploy (chưa lưu Storage). Hãy gửi lại file.',
      });
    }
    const downloadName = fixUploadFilename(String(req.query.name || '').trim()) || resolved.basename;
    return sendUploadDownloadResponse(res, resolved, downloadName);
  } catch (e) {
    console.error('GET /messenger/files/download:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi tải file' });
  }
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
async function notifyMessengerGroupChatRecipients(req, groupId, senderId, msgRow, groupName, extraMentionIds = []) {
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
  const mentionSet = new Set(
    [
      ...(Array.isArray(msgRow.mention_user_ids) ? msgRow.mention_user_ids : []),
      ...(Array.isArray(extraMentionIds) ? extraMentionIds : []),
    ].map(String),
  );
  const mentionedTargets = mentionSet.size ? targets.filter((id) => mentionSet.has(id)) : [];
  const otherTargets = mentionSet.size ? targets.filter((id) => !mentionSet.has(id)) : targets;

  const baseMeta = {
    group_name: groupName || null,
    sender_name: senderName,
    sender_avatar: msgRow.user?.avatar || null,
    group_avatar: null,
    bubble_key: String(groupId),
    bubble_wake: true,
    message_id: msgRow?.id ? String(msgRow.id) : '',
    sender_id: sid,
    message_type: msgRow?.message_type || 'text',
  };

  if (mentionedTargets.length) {
    await notifyMultiple(
      req,
      mentionedTargets,
      'messenger_chat',
      `${titleBase} · Nhắc bạn`,
      `${senderName} đã nhắc bạn: ${preview}`,
      'messenger_group',
      groupId,
      { ...baseMeta, mentioned: true },
    );
  }
  if (otherTargets.length) {
    await notifyMultiple(
      req,
      otherTargets,
      'messenger_chat',
      titleBase,
      `${senderName}: ${preview}`,
      'messenger_group',
      groupId,
      baseMeta,
    );
  }
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

  let rxRows = null;
  const { data, error } = await supabase
    .from('messenger_message_reactions')
    .select('message_id, user_id, emoji, created_at')
    .in('message_id', ids);
  if (!error && data) {
    rxRows = data;
  } else if (error) {
    console.warn('[messenger] attachReactionsToMessages supabase:', error.message);
    const pg = await pgQuery(
      `SELECT message_id, user_id, emoji, created_at
       FROM messenger_message_reactions
       WHERE message_id = ANY($1::uuid[])`,
      [ids],
    );
    rxRows = pg?.rows || [];
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
  if (pgRows !== null) return pgRows;
  const { data, error } = await supabase
    .from('messenger_message_reactions')
    .select('message_id, user_id, emoji, created_at')
    .eq('message_id', messageId);
  if (error) throw error;
  return data || [];
}

function emitMessengerGroupEvent(io, gid, event, payload) {
  if (!io || !gid) return;
  io.to(`messenger_group:${gid}`).emit(event, payload);
}

function buildRecalledMessagePayload(base, { gid, mid, uid, recalled_at }) {
  return {
    ...(base || {}),
    id: mid,
    group_id: gid,
    recalled_at,
    recalled_by: uid,
    is_recalled: true,
  };
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

let _messengerNicknamesTableReady = null;

async function ensureMessengerNicknamesTable() {
  if (_messengerNicknamesTableReady === true) return true;
  if (_messengerNicknamesTableReady === false) return false;
  try {
    await pgSessionQuery(`
      CREATE TABLE IF NOT EXISTS messenger_contact_nicknames (
        viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nickname TEXT NOT NULL CHECK (char_length(trim(nickname)) BETWEEN 1 AND 80),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (viewer_user_id, target_user_id),
        CHECK (viewer_user_id <> target_user_id)
      )
    `);
    await pgSessionQuery(`
      CREATE INDEX IF NOT EXISTS idx_messenger_contact_nicknames_viewer
        ON messenger_contact_nicknames (viewer_user_id)
    `);
    _messengerNicknamesTableReady = true;
    return true;
  } catch {
    _messengerNicknamesTableReady = false;
    return false;
  }
}

function isMissingNicknamesTableError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    code === '42P01'
    || code === 'PGRST205'
    || msg.includes('messenger_contact_nicknames')
    || (msg.includes('relation') && msg.includes('does not exist'))
  );
}

/** Map target_user_id → nickname cho viewer hiện tại. */
async function fetchMessengerNicknameMap(viewerUserId, targetUserIds = null) {
  const map = new Map();
  if (!viewerUserId) return map;
  const ready = await ensureMessengerNicknamesTable();
  if (!ready) return map;
  try {
    let q = supabase
      .from('messenger_contact_nicknames')
      .select('target_user_id, nickname')
      .eq('viewer_user_id', viewerUserId);
    if (Array.isArray(targetUserIds) && targetUserIds.length) {
      q = q.in('target_user_id', [...new Set(targetUserIds.map(String))]);
    }
    const { data, error } = await q;
    if (error) {
      if (isMissingNicknamesTableError(error)) return map;
      throw error;
    }
    for (const row of data || []) {
      const nick = String(row.nickname || '').trim();
      if (nick) map.set(String(row.target_user_id), nick);
    }
  } catch (e) {
    if (!isMissingNicknamesTableError(e)) console.warn('[messenger] nicknames load:', e.message);
  }
  return map;
}

let _messengerGroupNicknamesTableReady = null;

async function ensureMessengerGroupMemberNicknamesTable() {
  if (_messengerGroupNicknamesTableReady === true) return true;
  if (_messengerGroupNicknamesTableReady === false) return false;
  try {
    await pgSessionQuery(`
      CREATE TABLE IF NOT EXISTS messenger_group_member_nicknames (
        viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id UUID NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
        target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nickname TEXT NOT NULL CHECK (char_length(trim(nickname)) BETWEEN 1 AND 80),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (viewer_user_id, group_id, target_user_id),
        CHECK (viewer_user_id <> target_user_id)
      )
    `);
    await pgSessionQuery(`
      CREATE INDEX IF NOT EXISTS idx_messenger_group_member_nicknames_viewer_group
        ON messenger_group_member_nicknames (viewer_user_id, group_id)
    `);
    _messengerGroupNicknamesTableReady = true;
    return true;
  } catch {
    _messengerGroupNicknamesTableReady = false;
    return false;
  }
}

function isMissingGroupNicknamesTableError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    code === '42P01'
    || code === 'PGRST205'
    || msg.includes('messenger_group_member_nicknames')
    || (msg.includes('relation') && msg.includes('does not exist'))
  );
}

/** Map target_user_id → nickname trong một nhóm (chỉ viewer hiện tại). */
async function fetchMessengerGroupNicknameMap(viewerUserId, groupId, targetUserIds = null) {
  const map = new Map();
  if (!viewerUserId || !groupId) return map;
  const ready = await ensureMessengerGroupMemberNicknamesTable();
  if (!ready) return map;
  try {
    let q = supabase
      .from('messenger_group_member_nicknames')
      .select('target_user_id, nickname')
      .eq('viewer_user_id', viewerUserId)
      .eq('group_id', groupId);
    if (Array.isArray(targetUserIds) && targetUserIds.length) {
      q = q.in('target_user_id', [...new Set(targetUserIds.map(String))]);
    }
    const { data, error } = await q;
    if (error) {
      if (isMissingGroupNicknamesTableError(error)) return map;
      throw error;
    }
    for (const row of data || []) {
      const nick = String(row.nickname || '').trim();
      if (nick) map.set(String(row.target_user_id), nick);
    }
  } catch (e) {
    if (!isMissingGroupNicknamesTableError(e)) console.warn('[messenger] group nicknames load:', e.message);
  }
  return map;
}

/** Lấy nickname trong nhóm cho nhiều nhóm (preview danh sách hội thoại). */
async function fetchMessengerGroupNicknameMapsByGroup(viewerUserId, groupIds, targetUserIds = null) {
  const byGroup = new Map();
  if (!viewerUserId || !Array.isArray(groupIds) || !groupIds.length) return byGroup;
  const ready = await ensureMessengerGroupMemberNicknamesTable();
  if (!ready) return byGroup;
  const gids = [...new Set(groupIds.map(String))];
  try {
    let q = supabase
      .from('messenger_group_member_nicknames')
      .select('group_id, target_user_id, nickname')
      .eq('viewer_user_id', viewerUserId)
      .in('group_id', gids);
    if (Array.isArray(targetUserIds) && targetUserIds.length) {
      q = q.in('target_user_id', [...new Set(targetUserIds.map(String))]);
    }
    const { data, error } = await q;
    if (error) {
      if (isMissingGroupNicknamesTableError(error)) return byGroup;
      throw error;
    }
    for (const row of data || []) {
      const nick = String(row.nickname || '').trim();
      if (!nick) continue;
      const gid = String(row.group_id);
      const tid = String(row.target_user_id);
      if (!byGroup.has(gid)) byGroup.set(gid, new Map());
      byGroup.get(gid).set(tid, nick);
    }
  } catch (e) {
    if (!isMissingGroupNicknamesTableError(e)) console.warn('[messenger] group nicknames batch load:', e.message);
  }
  return byGroup;
}

function resolveMessengerDisplayName(user, nickMap, fallback = 'Đồng nghiệp') {
  if (!user) return fallback;
  const id = user.id || user.user_id;
  const nick = id && nickMap?.get?.(String(id));
  if (nick) return nick;
  return user.full_name || user.email || fallback;
}

function attachContactDisplayNameToUser(user, nickMap) {
  if (!user) return user;
  const id = user.id || user.user_id;
  const nick = id ? nickMap?.get?.(String(id)) || null : null;
  return {
    ...user,
    nickname: nick,
    contact_nickname: nick,
    display_name: resolveMessengerDisplayName(user, nickMap),
  };
}

function attachGroupDisplayNameToUser(user, groupNickMap, contactNickMap = null) {
  if (!user) return user;
  const id = user.id || user.user_id;
  const groupNick = id ? groupNickMap?.get?.(String(id)) || null : null;
  const contactNick = id && contactNickMap ? contactNickMap?.get?.(String(id)) || null : null;
  return {
    ...user,
    group_nickname: groupNick,
    contact_nickname: contactNick,
    nickname: groupNick,
    display_name: groupNick || user.full_name || user.email || 'Đồng nghiệp',
  };
}

function attachDisplayNameToUser(user, nickMap) {
  return attachContactDisplayNameToUser(user, nickMap);
}

function attachGroupDisplayNamesToMessages(rows, groupNickMap, contactNickMap = null) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  return rows.map((m) => {
    if (!m?.user) return m;
    return { ...m, user: attachGroupDisplayNameToUser(m.user, groupNickMap, contactNickMap) };
  });
}

function attachDisplayNamesToMessages(rows, nickMap) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  return rows.map((m) => {
    if (!m?.user) return m;
    return { ...m, user: attachDisplayNameToUser(m.user, nickMap) };
  });
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
  return [...new Set(raw.filter(Boolean).map(String))].slice(0, 500);
}

function contentHasMentionAll(content) {
  return /@(tất\s*cả|tat\s*ca|all)\b/i.test(String(content || ''));
}

/** @mention chỉ áp dụng nhóm (không chat 1-1); hỗ trợ @Tất cả. */
async function resolveGroupMentionIds(groupId, senderId, body) {
  const { data: grp } = await supabase.from('messenger_groups').select('is_direct').eq('id', groupId).maybeSingle();
  if (grp?.is_direct) return [];

  let ids = parseMentionUserIds(body);
  const content = String(body?.content ?? '');
  if (contentHasMentionAll(content)) {
    const { data: mems } = await supabase
      .from('messenger_group_members')
      .select('user_id')
      .eq('group_id', groupId);
    for (const m of mems || []) {
      const id = String(m.user_id);
      if (id && id !== String(senderId) && !ids.includes(id)) ids.push(id);
    }
  }
  return ids.slice(0, 500);
}

function isMentionColumnSchemaError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('mention_user_ids') &&
    (msg.includes('schema cache') || msg.includes('could not find') || msg.includes('does not exist'))
  );
}

let mentionColumnAvailable = null;

async function tryEnsureMentionColumn() {
  const r = await pgQuery(
    `ALTER TABLE messenger_group_messages
     ADD COLUMN IF NOT EXISTS mention_user_ids uuid[] NOT NULL DEFAULT '{}'`,
  );
  if (r) mentionColumnAvailable = true;
  return !!r;
}

/**
 * Insert tin nhắn nhóm — tự thử thêm cột mention (PG) hoặc gửi không mention nếu schema chưa migrate.
 * @returns {{ id: string, mentionIds: string[] }}
 */
async function insertMessengerGroupMessage(row, { mentionIds = [] } = {}) {
  const payload = { ...row };
  const ids = [...new Set((mentionIds || []).filter(Boolean).map(String))].slice(0, 500);

  const insertOnce = async (includeMention) => {
    const body = { ...payload };
    if (includeMention && ids.length) body.mention_user_ids = ids;
    return supabase.from('messenger_group_messages').insert(body).select('id').single();
  };

  if (!ids.length || mentionColumnAvailable === false) {
    const { data, error } = await insertOnce(false);
    if (error) throw error;
    return { id: data.id, mentionIds: [] };
  }

  let { data, error } = await insertOnce(true);
  if (!error) {
    mentionColumnAvailable = true;
    return { id: data.id, mentionIds: ids };
  }
  if (!isMentionColumnSchemaError(error)) throw error;

  if (mentionColumnAvailable !== false) await tryEnsureMentionColumn();
  if (mentionColumnAvailable === true) {
    ({ data, error } = await insertOnce(true));
    if (!error) return { id: data.id, mentionIds: ids };
    if (!isMentionColumnSchemaError(error)) throw error;
  }

  mentionColumnAvailable = false;
  ({ data, error } = await insertOnce(false));
  if (error) throw error;
  return { id: data.id, mentionIds: [] };
}

function directPairKey(userIdA, userIdB) {
  const a = String(userIdA);
  const b = String(userIdB);
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Bổ sung peer_id / display_name / peer_avatar cho chat 1-1 (header dock hiển thị đúng người). */
async function enrichDirectGroupResponse(group, authUserId, nickMap = null) {
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
  const map = nickMap || await fetchMessengerNicknameMap(authUserId, [other]);
  const peerNick = other ? (map.get(String(other)) || null) : null;
  const display_name = peerNick || pu?.full_name || pu?.email || group.name;
  return {
    ...group,
    peer_id: other,
    display_name,
    peer_avatar: pu?.avatar || null,
    peer_full_name: pu?.full_name || pu?.email || null,
    peer_nickname: peerNick,
    nickname: peerNick,
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

/**
 * GET /messenger/users/search?q=...
 * Tìm nhân viên để mở chat / chuyển tiếp — theo tên/email/SĐT, không khóa theo công ty.
 * Vẫn giới hạn theo tenant (SaaS) nếu user có tenant_id.
 */
r.get('/users/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ users: [] });
    const escaped = q.replace(/[%_,]/g, (m) => `\\${m}`);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 50);

    const colsWithDept =
      'id, full_name, email, phone, avatar, role, position, department_id, company_id, department:departments!users_department_id_fkey(id,name,color,company_id)';
    const colsBasic = 'id, full_name, email, phone, avatar, role, position, department_id, company_id';

    const run = async (cols) => {
      let query = supabase
        .from('users')
        .select(cols)
        .neq('is_active', false)
        .or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
        .order('full_name', { ascending: true })
        .limit(limit);
      query = addTenantFilter(query, req.user);
      return query;
    };

    let { data, error } = await run(colsWithDept);
    if (error) {
      ({ data, error } = await run(colsBasic));
    }
    if (error) throw error;
    res.json({ users: data || [] });
  } catch (e) {
    console.error('GET /messenger/users/search:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi' });
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

function messengerGroupsSkipCache(req, res, next) {
  const limitRaw = parseInt(String(req.query.limit ?? ''), 10);
  const view = String(req.query.view || '').trim().toLowerCase();
  if ((Number.isFinite(limitRaw) && limitRaw > 0) || view === 'ids') return next();
  return responseCache({ ttl: 30, scope: 'user', tags: ['messenger'] })(req, res, next);
}

/** Rank + unread nhẹ (không preview) — dùng khi phân trang để khỏi RPC v3 toàn bộ membership. */
async function fetchInboxRankKeys(groupIds, uid) {
  if (!Array.isArray(groupIds) || !groupIds.length) return new Map();
  const pg = await pgQuerySafe(
    `WITH last_msg AS (
       SELECT DISTINCT ON (group_id) group_id, created_at
       FROM messenger_group_messages
       WHERE group_id = ANY($1::uuid[])
       ORDER BY group_id, created_at DESC
     ),
     unread AS (
       SELECT m.group_id, COUNT(*)::int AS unread_count
       FROM messenger_group_messages m
       LEFT JOIN messenger_read_receipts r
         ON r.group_id = m.group_id AND r.user_id = $2::uuid
       WHERE m.group_id = ANY($1::uuid[])
         AND m.user_id IS DISTINCT FROM $2::uuid
         AND m.created_at > COALESCE(r.last_read_at, TIMESTAMPTZ 'epoch')
       GROUP BY m.group_id
     )
     SELECT g.id::text AS id,
            g.created_at,
            g.crm_lead_id,
            COALESCE(lm.created_at, g.created_at) AS last_message_at,
            COALESCE(u.unread_count, 0) AS unread_count
     FROM messenger_groups g
     LEFT JOIN last_msg lm ON lm.group_id = g.id
     LEFT JOIN unread u ON u.group_id = g.id
     WHERE g.id = ANY($1::uuid[])`,
    [groupIds, uid],
  );
  if (!pg || !Array.isArray(pg.rows)) return null;
  const map = new Map();
  for (const row of pg.rows) {
    if (!row?.id) continue;
    map.set(String(row.id), {
      last_message_at: row.last_message_at,
      unread_count: Number(row.unread_count) || 0,
      created_at: row.created_at,
      crm_lead_id: row.crm_lead_id || null,
    });
  }
  return map;
}

async function loadMessengerGroupStatsMap(ids, uid) {
  const statsMap = new Map();
  if (!ids.length) return statsMap;
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
    return statsMap;
  }
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
    return statsMap;
  }
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
  return statsMap;
}

async function applyLastMessagePreviews(statsMap, groupIds, uid) {
  if (!groupIds.length) return;
  try {
    const picked = await fetchLastMessagesForGroupPreviews(groupIds, uid);
    for (const [gid, row] of picked) {
      const prev = statsMap.get(gid) || {
        message_count: 0,
        last_message_at: row.created_at,
        last_message: null,
        last_user_id: null,
        unread_count: 0,
      };
      const pickTs = new Date(row.created_at || 0).getTime();
      const statTs = new Date(prev.last_message_at || 0).getTime();
      if (pickTs >= statTs || isStatsPreviewMissing(prev)) {
        statsMap.set(gid, {
          ...prev,
          last_message: row.preview,
          last_user_id: row.user_id || prev.last_user_id || null,
          last_message_at: pickTs >= statTs ? row.created_at : prev.last_message_at,
        });
      }
    }
  } catch (_) {
    /* best-effort */
  }
}

function sortMessengerInboxRows(a, b) {
  const tb = new Date(b.last_message_at || 0).getTime();
  const ta = new Date(a.last_message_at || 0).getTime();
  if (tb !== ta) return tb - ta;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

/** Danh sách nhóm mà user là thành viên. `limit`/`before`/`before_id` opt-in (web mặc định full). `view=ids` chỉ trả id. */
r.get('/groups', messengerGroupsSkipCache, async (req, res) => {
  try {
    const uid = req.authUserId;
    const { data: rows, error } = await supabase.from('messenger_group_members').select('group_id, role').eq('user_id', uid);
    if (error) throw error;
    const roleByGid = new Map((rows || []).map((r) => [r.group_id, r.role]));
    const ids = [...roleByGid.keys()];

    const limitRaw = parseInt(String(req.query.limit ?? ''), 10);
    const paged = Number.isFinite(limitRaw) && limitRaw > 0;
    const pageLimit = paged ? Math.min(Math.max(limitRaw, 1), 100) : 0;
    const beforeAt = String(req.query.before || '').trim();
    const beforeId = String(req.query.before_id || '').trim();
    const view = String(req.query.view || '').trim().toLowerCase();

    if (!ids.length) {
      res.setHeader('X-Unread-Total', '0');
      if (paged) res.setHeader('X-Has-More', '0');
      return res.json([]);
    }
    if (view === 'ids') {
      return res.json(ids.map((id) => ({ id })));
    }

    const leadQ = req.query.crm_lead_id != null ? String(req.query.crm_lead_id).trim() : '';
    const leadFilter = leadQ ? parseUuidParam(leadQ) : null;

    let groups = [];
    let statsMap = new Map();
    let ranked = [];

    const rankKeys = paged ? await fetchInboxRankKeys(ids, uid) : null;
    if (paged && rankKeys) {
      ranked = ids.map((id) => {
        const key = String(id);
        const rk = rankKeys.get(key);
        return {
          id,
          last_message_at: rk?.last_message_at || rk?.created_at || null,
          unread_count: Number(rk?.unread_count) || 0,
          crm_lead_id: rk?.crm_lead_id || null,
        };
      });
      if (leadFilter) {
        ranked = ranked.filter((row) => String(row.crm_lead_id || '') === leadFilter);
      }
      ranked.sort(sortMessengerInboxRows);
      const unreadTotal = ranked.reduce((sum, row) => sum + row.unread_count, 0);
      res.setHeader('X-Unread-Total', String(unreadTotal));
      if (beforeAt) {
        const bt = new Date(beforeAt).getTime();
        ranked = ranked.filter((row) => {
          const t = new Date(row.last_message_at || 0).getTime();
          if (!Number.isFinite(bt)) return true;
          if (t < bt) return true;
          if (t > bt) return false;
          return beforeId ? String(row.id) < String(beforeId) : false;
        });
      }
      const hasMore = ranked.length > pageLimit;
      ranked = ranked.slice(0, pageLimit);
      res.setHeader('X-Has-More', hasMore ? '1' : '0');
      const pageIdsOnly = ranked.map((row) => row.id);
      if (!pageIdsOnly.length) return res.json([]);
      const { data: pageGroupRows, error: gErr } = await supabase
        .from('messenger_groups')
        .select('*')
        .in('id', pageIdsOnly);
      if (gErr) throw gErr;
      const byId = new Map((pageGroupRows || []).map((g) => [String(g.id), g]));
      groups = pageIdsOnly.map((id) => byId.get(String(id))).filter(Boolean);
      statsMap = await loadMessengerGroupStatsMap(pageIdsOnly, uid);
    } else {
      const { data: allGroups, error: gErr } = await supabase.from('messenger_groups').select('*').in('id', ids);
      if (gErr) throw gErr;
      const groupsFiltered =
        leadFilter && Array.isArray(allGroups)
          ? allGroups.filter((g) => String(g.crm_lead_id || '') === leadFilter)
          : allGroups || [];
      statsMap = await loadMessengerGroupStatsMap(ids, uid);
      ranked = groupsFiltered.map((g) => {
        const st = statsMap.get(g.id);
        return {
          g,
          id: g.id,
          last_message_at: st?.last_message_at || g.created_at,
          unread_count: Number(st?.unread_count) || 0,
        };
      });
      ranked.sort(sortMessengerInboxRows);
      const unreadTotal = ranked.reduce((sum, row) => sum + row.unread_count, 0);
      res.setHeader('X-Unread-Total', String(unreadTotal));
      if (paged) {
        if (beforeAt) {
          const bt = new Date(beforeAt).getTime();
          ranked = ranked.filter((row) => {
            const t = new Date(row.last_message_at || 0).getTime();
            if (!Number.isFinite(bt)) return true;
            if (t < bt) return true;
            if (t > bt) return false;
            return beforeId ? String(row.id) < String(beforeId) : false;
          });
        }
        const hasMore = ranked.length > pageLimit;
        ranked = ranked.slice(0, pageLimit);
        res.setHeader('X-Has-More', hasMore ? '1' : '0');
      }
      groups = ranked.map((row) => row.g).filter(Boolean);
    }

    const pageGroups = groups;
    const pageIds = pageGroups.map((g) => g.id);
    if (!pageIds.length) return res.json([]);

    // Preview tin cuối + nickname chỉ hydrate trang hiện tại (hoặc full list khi không phân trang).
    await applyLastMessagePreviews(statsMap, pageIds, uid);

    const { data: allMems } = await supabase
      .from('messenger_group_members')
      .select('group_id, user_id')
      .in('group_id', pageIds);
    const membersByG = new Map();
    for (const m of allMems || []) {
      if (!membersByG.has(m.group_id)) membersByG.set(m.group_id, []);
      membersByG.get(m.group_id).push(m.user_id);
    }
    const peerIds = [];
    for (const g of pageGroups) {
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

    const lastSenderIds = [
      ...new Set(
        pageGroups
          .filter((g) => !g.is_direct)
          .map((g) => statsMap.get(g.id)?.last_user_id)
          .filter(Boolean),
      ),
    ];
    const nickTargetIds = [...new Set([...uniquePeers, ...lastSenderIds].map(String))];
    const contactNickMap = await fetchMessengerNicknameMap(uid, nickTargetIds);
    const nonDirectGroupIds = pageGroups.filter((g) => !g.is_direct).map((g) => g.id);
    const groupNickMapsByGroup = await fetchMessengerGroupNicknameMapsByGroup(
      uid,
      nonDirectGroupIds,
      lastSenderIds,
    );
    const senderUserById = new Map();
    if (lastSenderIds.length) {
      const { data: senderUsers } = await supabase.from('users').select('id, full_name, email').in('id', lastSenderIds);
      for (const u of senderUsers || []) {
        if (u?.id) senderUserById.set(String(u.id), u);
      }
    }

    const list = pageGroups.map((g) => {
      let display_name = g.name;
      let peer_id = null;
      let peer_avatar = null;
      let peer_full_name = null;
      if (g.is_direct) {
        const mems = membersByG.get(g.id) || [];
        const other = mems.find((id) => String(id) !== String(uid));
        if (other) {
          peer_id = other;
          const pu = peerMap.get(other);
          if (pu) {
            display_name = resolveMessengerDisplayName(pu, contactNickMap);
            peer_full_name = pu.full_name || pu.email || null;
          }
          if (pu?.avatar) peer_avatar = pu.avatar;
        }
      }
      const st = statsMap.get(g.id);
      const lastUserId = st?.last_user_id ?? null;
      let previewSenderName = null;
      if (!g.is_direct && lastUserId) {
        const senderUser = senderUserById.get(String(lastUserId));
        const gNickMap = groupNickMapsByGroup.get(String(g.id)) || new Map();
        previewSenderName = resolveMessengerDisplayName(senderUser, gNickMap);
      }
      const last_message = formatGroupListPreview(
        sanitizeStatsLastMessagePreview(st?.last_message, uid),
        {
          isDirect: !!g.is_direct,
          lastUserId,
          viewerId: uid,
          senderName: previewSenderName,
        },
      );
      return {
        id: g.id,
        name: display_name,
        raw_name: g.name,
        avatar: g.avatar || null,
        is_direct: !!g.is_direct,
        peer_id,
        peer_avatar,
        peer_full_name,
        created_by: g.created_by,
        created_at: g.created_at,
        crm_lead_id: g.crm_lead_id || null,
        my_role: roleByGid.get(g.id),
        message_count: st?.message_count ?? 0,
        last_message_at: st?.last_message_at || g.created_at,
        last_message,
        last_user_id: st?.last_user_id ?? null,
        unread_count: st?.unread_count ?? 0,
      };
    });
    if (!paged) list.sort(sortMessengerInboxRows);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Lịch sử cuộc gọi trên mọi hội thoại user là thành viên — 1 query, không N+1 theo nhóm.
 * GET /messenger/call-history?limit=50
 */
r.get('/call-history', async (req, res) => {
  try {
    const uid = req.authUserId;
    const limitRaw = parseInt(String(req.query.limit || '50'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    const { data: memRows, error: memErr } = await supabase
      .from('messenger_group_members')
      .select('group_id')
      .eq('user_id', uid);
    if (memErr) throw memErr;
    const groupIds = [...new Set((memRows || []).map((m) => m.group_id).filter(Boolean))];
    if (!groupIds.length) return res.json({ items: [] });

    let rows = [];
    let pg = null;
    try {
      pg = await pgQuerySafe(
        `SELECT
          m.id, m.group_id, m.user_id, m.content, m.message_type, m.created_at,
          m.is_system, m.attachments, m.attachment_url, m.attachment_name, m.attachment_mime,
          m.recalled_at, m.recalled_by, m.reply_to, m.mention_user_ids
        FROM messenger_group_messages m
        WHERE m.group_id = ANY($1::uuid[])
          AND (
            m.message_type = 'call'
            OR BTRIM(COALESCE(m.content, '')) LIKE ':call_log:%'
          )
          AND m.recalled_at IS NULL
        ORDER BY m.created_at DESC
        LIMIT $2`,
        [groupIds, limit],
      );
    } catch (err) {
      console.warn('[messenger/call-history] pg fallback:', err.message);
      pg = null;
    }
    if (pg?.rows) {
      rows = pg.rows;
    } else {
      // pg pool unavailable — fallback PostgREST (vẫn 1 request, không N+1)
      const { data, error } = await supabase
        .from('messenger_group_messages')
        .select(MSG_USER_SELECT)
        .in('group_id', groupIds)
        .or('message_type.eq.call,content.like.:call_log:%')
        .is('recalled_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      rows = data || [];
    }

    if (!rows.length) return res.json({ items: [] });

    const hitGroupIds = [...new Set(rows.map((m) => m.group_id).filter(Boolean))];
    const groups = await fetchMessengerGroupsLite(hitGroupIds);
    const groupById = new Map((groups || []).map((g) => [String(g.id), g]));

    const { data: hitMems } = await supabase
      .from('messenger_group_members')
      .select('group_id, user_id')
      .in('group_id', hitGroupIds);
    const membersByG = new Map();
    for (const m of hitMems || []) {
      const gid = String(m.group_id);
      if (!membersByG.has(gid)) membersByG.set(gid, []);
      membersByG.get(gid).push(m.user_id);
    }

    const peerIds = [];
    for (const g of groups || []) {
      if (!g.is_direct) continue;
      const mems = membersByG.get(String(g.id)) || [];
      const other = mems.find((id) => String(id) !== String(uid));
      if (other) peerIds.push(other);
    }
    const msgUserIds = rows.map((m) => m.user_id).filter(Boolean);
    const users = await fetchUsersByIdsForMessenger([...peerIds, ...msgUserIds]);
    const userById = new Map(users.map((u) => [String(u.id), u]));
    const contactNickMap = await fetchMessengerNicknameMap(uid, [...new Set(peerIds.map(String))]);

    const items = [];
    for (const raw of rows) {
      const payload = extractCallLogPayloadFromRow(raw);
      if (!payload && raw.message_type !== 'call') continue;
      const gid = String(raw.group_id || '');
      const g = groupById.get(gid);
      if (!g) continue;

      let groupName = g.name || 'Chat';
      let groupAvatar = g.avatar || null;
      if (g.is_direct) {
        const mems = membersByG.get(gid) || [];
        const other = mems.find((id) => String(id) !== String(uid));
        if (other) {
          const pu = userById.get(String(other));
          if (pu) groupName = resolveMessengerDisplayName(pu, contactNickMap) || groupName;
          if (pu?.avatar) groupAvatar = pu.avatar;
        }
      }

      let message = { ...raw };
      if (!message.user && message.user_id) {
        const u = userById.get(String(message.user_id));
        if (u) {
          message = {
            ...message,
            user: {
              id: u.id,
              full_name: u.full_name,
              avatar: u.avatar,
              is_bot: u.is_bot,
            },
          };
        }
      }
      message = hydrateMessengerCallLogRow(message, uid);

      const callerId = String(payload?.callerId || payload?.hostId || '');
      items.push({
        id: String(message.id),
        group_id: gid,
        group_name: groupName,
        group_avatar: groupAvatar,
        is_direct: !!g.is_direct,
        created_at: message.created_at,
        label: message.content || formatCallLogLine(payload, uid) || '📞 Cuộc gọi',
        status: payload?.status || 'completed',
        kind: payload?.kind === 'video' ? 'video' : 'audio',
        duration_sec: Number(payload?.durationSec) || 0,
        is_outgoing: !!(uid && callerId && String(uid) === callerId),
        message,
      });
    }

    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Biệt danh liên hệ Messenger (chat 1-1 / chat nhanh — chỉ mình bạn thấy). */
r.get('/nicknames', async (req, res) => {
  try {
    const uid = req.authUserId;
    const map = await fetchMessengerNicknameMap(uid);
    const nicknames = {};
    for (const [targetId, nick] of map.entries()) nicknames[targetId] = nick;
    res.json({ nicknames });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Tin hệ thống trong hội thoại (biệt danh, rời nhóm, …) + emit realtime. */
async function postMessengerSystemMessage(io, { groupId, userId, content }) {
  if (!groupId || !content) return null;
  const { data: inserted, error } = await supabase
    .from('messenger_group_messages')
    .insert({
      group_id: groupId,
      user_id: userId || null,
      content: String(content).slice(0, 500),
      message_type: 'system',
      is_system: true,
    })
    .select('id')
    .single();
  if (error || !inserted?.id) {
    if (error) console.warn('[messenger] system msg:', error.message);
    return null;
  }
  const full = await fetchMessengerMessageById(inserted.id);
  if (io && full) io.to(`messenger_group:${groupId}`).emit('messenger_group:chat', full);
  return full;
}

async function resolveDirectGroupIdBetween(userA, userB) {
  if (!userA || !userB) return null;
  const key = directPairKey(userA, userB);
  const { data } = await supabase
    .from('messenger_groups')
    .select('id')
    .eq('direct_pair_key', key)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function userLabelForSystem(userId, fallback = 'Ai đó') {
  if (!userId) return fallback;
  const { data } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();
  return String(data?.full_name || data?.email || fallback).trim() || fallback;
}

r.put('/nicknames/:targetUserId', async (req, res) => {
  try {
    const viewerId = req.authUserId;
    const targetId = parseUuidParam(req.params.targetUserId);
    if (!targetId) return res.status(400).json({ error: 'Người dùng không hợp lệ' });
    if (String(targetId) === String(viewerId)) {
      return res.status(400).json({ error: 'Không thể đặt biệt danh cho chính mình' });
    }
    const nickname = String(req.body?.nickname || '').trim();
    if (!nickname || nickname.length > 80) {
      return res.status(400).json({ error: 'Biệt danh phải từ 1–80 ký tự' });
    }
    const { data: targetUser, error: uErr } = await supabase
      .from('users')
      .select('id, full_name, email, avatar')
      .eq('id', targetId)
      .maybeSingle();
    if (uErr || !targetUser) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    const ready = await ensureMessengerNicknamesTable();
    if (!ready) return res.status(503).json({ error: 'Chưa cấu hình bảng biệt danh Messenger' });
    const { error } = await supabase.from('messenger_contact_nicknames').upsert(
      {
        viewer_user_id: viewerId,
        target_user_id: targetId,
        nickname,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'viewer_user_id,target_user_id' },
    );
    if (error) return res.status(400).json({ error: error.message });

    const groupId =
      parseUuidParam(req.body?.group_id)
      || (await resolveDirectGroupIdBetween(viewerId, targetId));
    if (groupId) {
      const viewerName = await userLabelForSystem(viewerId, 'Ai đó');
      const targetName = targetUser.full_name || targetUser.email || 'đồng nghiệp';
      await postMessengerSystemMessage(req.app.get('io'), {
        groupId,
        userId: viewerId,
        content: `${viewerName} đã đặt biệt danh cho ${targetName} thành «${nickname}»`,
      });
    }

    res.json({
      target_user_id: targetId,
      nickname,
      display_name: nickname,
      full_name: targetUser.full_name || targetUser.email || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/nicknames/:targetUserId', async (req, res) => {
  try {
    const viewerId = req.authUserId;
    const targetId = parseUuidParam(req.params.targetUserId);
    if (!targetId) return res.status(400).json({ error: 'Người dùng không hợp lệ' });
    const ready = await ensureMessengerNicknamesTable();
    if (!ready) return res.status(503).json({ error: 'Chưa cấu hình bảng biệt danh Messenger' });
    const { data: targetUser } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', targetId)
      .maybeSingle();
    await supabase
      .from('messenger_contact_nicknames')
      .delete()
      .eq('viewer_user_id', viewerId)
      .eq('target_user_id', targetId);

    const groupId =
      parseUuidParam(req.body?.group_id)
      || (await resolveDirectGroupIdBetween(viewerId, targetId));
    if (groupId) {
      const viewerName = await userLabelForSystem(viewerId, 'Ai đó');
      const targetName = targetUser?.full_name || targetUser?.email || 'đồng nghiệp';
      await postMessengerSystemMessage(req.app.get('io'), {
        groupId,
        userId: viewerId,
        content: `${viewerName} đã xóa biệt danh của ${targetName}`,
      });
    }

    res.json({
      target_user_id: targetId,
      nickname: null,
      display_name: targetUser?.full_name || targetUser?.email || 'Đồng nghiệp',
      full_name: targetUser?.full_name || targetUser?.email || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Biệt danh thành viên trong nhóm (tách biệt biệt danh cá nhân). */
r.put('/groups/:groupId/nicknames/:targetUserId', async (req, res) => {
  try {
    const viewerId = req.authUserId;
    const groupId = parseUuidParam(req.params.groupId);
    const targetId = parseUuidParam(req.params.targetUserId);
    if (!groupId) return res.status(400).json({ error: 'Nhóm không hợp lệ' });
    if (!targetId) return res.status(400).json({ error: 'Người dùng không hợp lệ' });
    if (String(targetId) === String(viewerId)) {
      return res.status(400).json({ error: 'Không thể đặt biệt danh cho chính mình' });
    }
    const ok = await assertGroupMember(groupId, viewerId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const { data: grp } = await supabase.from('messenger_groups').select('id, is_direct').eq('id', groupId).maybeSingle();
    if (!grp) return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    if (grp.is_direct) {
      return res.status(400).json({ error: 'Chat 1-1 dùng biệt danh cá nhân, không dùng biệt danh nhóm' });
    }
    const memberOk = await assertGroupMember(groupId, targetId);
    if (!memberOk) return res.status(404).json({ error: 'Người dùng không thuộc nhóm' });
    const nickname = String(req.body?.nickname || '').trim();
    if (!nickname || nickname.length > 80) {
      return res.status(400).json({ error: 'Biệt danh phải từ 1–80 ký tự' });
    }
    const { data: targetUser, error: uErr } = await supabase
      .from('users')
      .select('id, full_name, email, avatar')
      .eq('id', targetId)
      .maybeSingle();
    if (uErr || !targetUser) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    const ready = await ensureMessengerGroupMemberNicknamesTable();
    if (!ready) return res.status(503).json({ error: 'Chưa cấu hình bảng biệt danh nhóm Messenger' });
    const { error } = await supabase.from('messenger_group_member_nicknames').upsert(
      {
        viewer_user_id: viewerId,
        group_id: groupId,
        target_user_id: targetId,
        nickname,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'viewer_user_id,group_id,target_user_id' },
    );
    if (error) return res.status(400).json({ error: error.message });

    const viewerName = await userLabelForSystem(viewerId, 'Ai đó');
    const targetName = targetUser.full_name || targetUser.email || 'thành viên';
    await postMessengerSystemMessage(req.app.get('io'), {
      groupId,
      userId: viewerId,
      content: `${viewerName} đã đặt biệt danh cho ${targetName} thành «${nickname}»`,
    });

    res.json({
      group_id: groupId,
      target_user_id: targetId,
      nickname,
      group_nickname: nickname,
      display_name: nickname,
      full_name: targetUser.full_name || targetUser.email || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/groups/:groupId/nicknames/:targetUserId', async (req, res) => {
  try {
    const viewerId = req.authUserId;
    const groupId = parseUuidParam(req.params.groupId);
    const targetId = parseUuidParam(req.params.targetUserId);
    if (!groupId) return res.status(400).json({ error: 'Nhóm không hợp lệ' });
    if (!targetId) return res.status(400).json({ error: 'Người dùng không hợp lệ' });
    const ok = await assertGroupMember(groupId, viewerId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const ready = await ensureMessengerGroupMemberNicknamesTable();
    if (!ready) return res.status(503).json({ error: 'Chưa cấu hình bảng biệt danh nhóm Messenger' });
    const { data: targetUser } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', targetId)
      .maybeSingle();
    await supabase
      .from('messenger_group_member_nicknames')
      .delete()
      .eq('viewer_user_id', viewerId)
      .eq('group_id', groupId)
      .eq('target_user_id', targetId);

    const viewerName = await userLabelForSystem(viewerId, 'Ai đó');
    const targetName = targetUser?.full_name || targetUser?.email || 'thành viên';
    await postMessengerSystemMessage(req.app.get('io'), {
      groupId,
      userId: viewerId,
      content: `${viewerName} đã xóa biệt danh của ${targetName}`,
    });

    res.json({
      group_id: groupId,
      target_user_id: targetId,
      nickname: null,
      group_nickname: null,
      display_name: targetUser?.full_name || targetUser?.email || 'Đồng nghiệp',
      full_name: targetUser?.full_name || targetUser?.email || null,
    });
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
 * Đổi avatar nhóm — yêu cầu trưởng/phó nhóm hoặc người tạo nhóm.
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

    const { error: uErr } = await updateGroupAvatar(gid, avatarUrl);
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

let _messengerChatWallpapersReady = null;

async function ensureMessengerChatWallpapersTable() {
  if (_messengerChatWallpapersReady === true) return true;
  if (_messengerChatWallpapersReady === false) return false;
  try {
    await pgSessionQuery(`
      CREATE TABLE IF NOT EXISTS messenger_chat_wallpapers (
        viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id UUID NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
        wallpaper_url TEXT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (viewer_user_id, group_id)
      )
    `);
    await pgSessionQuery(`
      CREATE INDEX IF NOT EXISTS idx_messenger_chat_wallpapers_group
        ON messenger_chat_wallpapers (group_id)
    `);
    _messengerChatWallpapersReady = true;
    return true;
  } catch {
    _messengerChatWallpapersReady = false;
    return false;
  }
}

function isMissingChatWallpapersTableError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    code === '42P01'
    || code === 'PGRST205'
    || msg.includes('messenger_chat_wallpapers')
    || (msg.includes('relation') && msg.includes('does not exist'))
  );
}

/** GET hình nền chat (per-user) — đồng bộ web / app. */
r.get('/groups/:id/wallpaper', async (req, res) => {
  try {
    const gid = req.params.id;
    const uid = req.authUserId;
    const ok = await assertGroupMember(gid, uid);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const ready = await ensureMessengerChatWallpapersTable();
    if (!ready) return res.json({ wallpaper_url: null });
    const { data, error } = await supabase
      .from('messenger_chat_wallpapers')
      .select('wallpaper_url, updated_at')
      .eq('viewer_user_id', uid)
      .eq('group_id', gid)
      .maybeSingle();
    if (error) {
      if (isMissingChatWallpapersTableError(error)) return res.json({ wallpaper_url: null });
      throw error;
    }
    const url = data?.wallpaper_url ? String(data.wallpaper_url).trim() : null;
    res.json({ wallpaper_url: url || null, updated_at: data?.updated_at || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Đặt / xóa hình nền chat (per-user).
 * - multipart `file` → upload ảnh
 * - body `{ clear: true }` hoặc DELETE → về nền mặc định
 * - body `{ wallpaper_url }` → gán URL đã có (ít dùng)
 */
r.put('/groups/:id/wallpaper', messengerMemoryUpload.single('file'), async (req, res) => {
  try {
    const gid = req.params.id;
    const uid = req.authUserId;
    const ok = await assertGroupMember(gid, uid);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const ready = await ensureMessengerChatWallpapersTable();
    if (!ready) return res.status(503).json({ error: 'Chưa sẵn sàng lưu hình nền — chạy migration 418' });

    const clear = req.body?.clear === true || req.body?.clear === 'true' || req.body?.clear === '1';
    let wallpaperUrl = null;

    if (clear) {
      wallpaperUrl = null;
    } else if (req.file) {
      const mime = (req.file.mimetype || '').toLowerCase();
      if (!mime.startsWith('image/')) return res.status(400).json({ error: 'Chỉ chấp nhận file ảnh' });
      const stored = await storeMessengerUploadedFile(gid, req.file);
      wallpaperUrl = stored.url;
    } else if (req.body?.wallpaper_url != null) {
      const raw = String(req.body.wallpaper_url || '').trim();
      wallpaperUrl = raw || null;
    } else {
      return res.status(400).json({ error: 'Thiếu file ảnh hoặc clear=true' });
    }

    const row = {
      viewer_user_id: uid,
      group_id: gid,
      wallpaper_url: wallpaperUrl,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('messenger_chat_wallpapers')
      .upsert(row, { onConflict: 'viewer_user_id,group_id' });
    if (error) {
      if (isMissingChatWallpapersTableError(error)) {
        return res.status(503).json({ error: 'Bảng hình nền chưa tồn tại — chạy migration 418' });
      }
      throw error;
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${uid}`).emit('messenger_chat:wallpaper', {
        group_id: gid,
        wallpaper_url: wallpaperUrl,
      });
    }
    res.json({ wallpaper_url: wallpaperUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/groups/:id/wallpaper', async (req, res) => {
  try {
    const gid = req.params.id;
    const uid = req.authUserId;
    const ok = await assertGroupMember(gid, uid);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const ready = await ensureMessengerChatWallpapersTable();
    if (!ready) return res.json({ wallpaper_url: null });
    const { error } = await supabase
      .from('messenger_chat_wallpapers')
      .upsert({
        viewer_user_id: uid,
        group_id: gid,
        wallpaper_url: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'viewer_user_id,group_id' });
    if (error && !isMissingChatWallpapersTableError(error)) throw error;
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${uid}`).emit('messenger_chat:wallpaper', { group_id: gid, wallpaper_url: null });
    }
    res.json({ wallpaper_url: null });
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
    const { error: uErr } = await updateGroupAvatar(gid, null);
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
    const contactNickMap = await fetchMessengerNicknameMap(req.authUserId, uids);
    const groupNickMap = group.is_direct
      ? new Map()
      : await fetchMessengerGroupNicknameMap(req.authUserId, req.params.id, uids);
    const members = (memberRows || []).map((m) => {
      const u = userMap.get(String(m.user_id)) || null;
      if (group.is_direct) {
        return { ...m, user: attachContactDisplayNameToUser(u, contactNickMap) };
      }
      return { ...m, user: attachGroupDisplayNameToUser(u, groupNickMap, contactNickMap) };
    });
    let payload = { ...group, members };
    if (group.is_direct) {
      payload = await enrichDirectGroupResponse(group, req.authUserId, contactNickMap);
      payload = { ...payload, members };
    }
    res.json(payload);
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
 * Kiểm tra user có quyền quản trị nhóm (trưởng/phó hoặc người tạo nhóm).
 * Không dùng role admin hệ thống — quyền gắn với vai trò trong nhóm chat.
 */
async function assertGroupLeader(groupId, userId) {
  const { data: grp } = await supabase
    .from('messenger_groups')
    .select('created_by, is_direct')
    .eq('id', groupId)
    .maybeSingle();
  if (!grp || grp.is_direct) return false;
  if (String(grp.created_by) === String(userId)) return true;
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
 * Xoá thành viên khỏi nhóm — chỉ trưởng/phó nhóm hoặc người tạo nhóm.
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

/** Thêm thành viên — trưởng/phó có thể gán vai trò; thành viên thường chỉ thêm member. */
r.post('/groups/:id/members', async (req, res) => {
  try {
    const gid = req.params.id;
    const canManage = await assertGroupLeader(gid, req.authUserId);
    if (!canManage) {
      // Fallback: thành viên thường vẫn được mời người khác, nhưng chỉ với role member
      const ok = await assertGroupMember(gid, req.authUserId);
      if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    }
    const batch = Array.isArray(req.body.members) ? req.body.members : [];
    const user_id = req.body.user_id;
    const toAdd = batch.length ? batch : user_id ? [{ user_id, role: req.body.role || 'member' }] : [];
    if (!toAdd.length) return res.status(400).json({ error: 'Thiếu members' });

    const { data: adder } = await supabase.from('users').select('full_name').eq('id', req.authUserId).single();
    const io = req.app.get('io');
    const results = [];
    for (const item of toAdd) {
      let role = mapIncomingRole(item.role);
      if (role === 'leader') role = 'member';
      if (!canManage) role = 'member';
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
    const limitRaw = parseInt(String(req.query.limit || ''), 10);
    const paged = Number.isFinite(limitRaw) && limitRaw > 0;
    const pageLimit = paged ? Math.min(Math.max(limitRaw, 1), 200) : 500;
    const before = String(req.query.before || '').trim();

    let q = supabase
      .from('messenger_group_messages')
      .select(MSG_USER_SELECT)
      .eq('group_id', req.params.id);
    if (paged) {
      q = q.order('created_at', { ascending: false }).limit(pageLimit);
      if (before) q = q.lt('created_at', before);
    } else {
      q = q.order('created_at', { ascending: true }).limit(500);
    }
    const { data, error } = await q;
    if (error) throw error;
    const fetchedLen = Array.isArray(data) ? data.length : 0;
    let rows = data || [];
    if (paged) rows = [...rows].reverse();
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
    const viewerId = req.authUserId;
    const msgUserIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean).map(String))];
    const { data: grpRow } = await supabase
      .from('messenger_groups')
      .select('id, is_direct')
      .eq('id', req.params.id)
      .maybeSingle();
    if (grpRow?.is_direct) {
      const contactNickMap = await fetchMessengerNicknameMap(viewerId, msgUserIds);
      rows = attachDisplayNamesToMessages(rows, contactNickMap);
    } else {
      const groupNickMap = await fetchMessengerGroupNicknameMap(viewerId, req.params.id, msgUserIds);
      const contactNickMap = await fetchMessengerNicknameMap(viewerId, msgUserIds);
      rows = attachGroupDisplayNamesToMessages(rows, groupNickMap, contactNickMap);
    }
    rows = rows.map((m) => hydrateMessengerCallLogRow(m, viewerId));
    if (paged) res.setHeader('X-Has-More', fetchedLen >= pageLimit ? '1' : '0');
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
      f.originalname = fixUploadFilename(f.originalname);
      attachments.push(await storeMessengerUploadedFile(req.params.id, f));
    }
    if (!content && !attachments.length) return res.status(400).json({ error: 'Thiếu nội dung' });
    const mentionIds = await resolveGroupMentionIds(req.params.id, req.authUserId, req.body);
    const { id: insertedId, mentionIds: storedMentions } = await insertMessengerGroupMessage(
      {
        group_id: req.params.id,
        user_id: req.authUserId,
        content: content || '',
        attachments: attachments.length ? attachments : null,
        reply_to: reply_to || null,
      },
      { mentionIds },
    );
    let data = (await fetchMessengerMessageById(insertedId)) || { id: insertedId };
    if (storedMentions.length) data = { ...data, mention_user_ids: storedMentions };
    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${req.params.id}`).emit('messenger_group:chat', data);
    const { data: grpRow } = await supabase.from('messenger_groups').select('name').eq('id', req.params.id).maybeSingle();
    await notifyMessengerGroupChatRecipients(
      req,
      req.params.id,
      req.authUserId,
      data,
      grpRow?.name || '',
      storedMentions,
    );
    triggerAiHookIfNeeded(data, req.params.id, io);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/groups/:id/chat/drive', async (req, res) => {
  try {
    const ok = await assertGroupMember(req.params.id, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
    const { file_ids, content, reply_to } = req.body || {};
    const { buildDriveChatAttachments } = require('../helpers/driveChatAttachments');
    const attachments = await buildDriveChatAttachments(req.user, file_ids);
    if (!attachments.length) return res.status(403).json({ error: 'Không có quyền với file Drive đã chọn' });
    if (!content && !attachments.length) return res.status(400).json({ error: 'Thiếu nội dung' });

    const mentionIds = await resolveGroupMentionIds(req.params.id, req.authUserId, req.body);
    const { id: insertedId, mentionIds: storedMentions } = await insertMessengerGroupMessage(
      {
        group_id: req.params.id,
        user_id: req.authUserId,
        content: content || '',
        message_type: 'file',
        attachments,
        reply_to: reply_to || null,
      },
      { mentionIds },
    );
    let data = (await fetchMessengerMessageById(insertedId)) || { id: insertedId };
    if (storedMentions.length) data = { ...data, mention_user_ids: storedMentions };
    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${req.params.id}`).emit('messenger_group:chat', data);
    const { data: grpRow } = await supabase.from('messenger_groups').select('name').eq('id', req.params.id).maybeSingle();
    await notifyMessengerGroupChatRecipients(
      req,
      req.params.id,
      req.authUserId,
      data,
      grpRow?.name || '',
      storedMentions,
    );
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
    req.file.originalname = fixUploadFilename(req.file.originalname);
    const mime = req.file.mimetype;
    let message_type = 'file';
    if (mime.startsWith('image/')) message_type = 'image';
    else if (mime.startsWith('video/')) message_type = 'video';
    else if (mime.startsWith('audio/')) message_type = 'audio';
    const stored = await storeMessengerUploadedFile(req.params.id, req.file);
    const attachment_url = stored.url;
    const mentionIds = await resolveGroupMentionIds(req.params.id, req.authUserId, req.body);
    const { id: insertedId, mentionIds: storedMentions } = await insertMessengerGroupMessage(
      {
        group_id: req.params.id,
        user_id: req.authUserId,
        content: req.body.content || '',
        message_type,
        attachment_url,
        attachment_name: stored.name || req.file.originalname,
        attachment_size: req.file.size,
        attachment_mime: mime,
        reply_to: req.body.reply_to || null,
      },
      { mentionIds },
    );
    let data = (await fetchMessengerMessageById(insertedId)) || { id: insertedId };
    if (storedMentions.length) data = { ...data, mention_user_ids: storedMentions };
    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${req.params.id}`).emit('messenger_group:chat', data);
    const { data: grpRow } = await supabase.from('messenger_groups').select('name').eq('id', req.params.id).maybeSingle();
    await notifyMessengerGroupChatRecipients(
      req,
      req.params.id,
      req.authUserId,
      data,
      grpRow?.name || '',
      storedMentions,
    );
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
      const payload = { group_id: gid, message_id: mid, reactions };
      emitMessengerGroupEvent(io, gid, 'messenger_group:reaction', payload);
      emitMessengerGroupEvent(io, gid, 'messenger_group:reactions', payload);
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

/** Thu hồi tin nhắn — xóa nội dung/file, giữ dòng tombstone; chỉ người gửi, trong 24h. */
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
      await purgeAndRecallMessage(mid, uid, recalled_at);
    } catch (uErr) {
      logMessengerAction({ action: 'recall-failed', gid, mid, err: uErr.message });
      throw uErr;
    }

    const fetched = await fetchMessengerMessageById(mid);
    const full = buildRecalledMessagePayload(fetched || msg, {
      gid,
      mid,
      uid,
      recalled_at,
    });
    full.reactions = [];
    full.content = null;
    full.attachments = null;
    full.attachment_url = null;

    const io = req.app.get('io');
    if (io) {
      emitMessengerGroupEvent(io, gid, 'messenger_group:chat', full);
      emitMessengerGroupEvent(io, gid, 'messenger_group:recalled', {
        group_id: gid,
        message_id: mid,
        recalled_at,
        recalled_by: uid,
      });
    }

    logMessengerAction({ action: 'recall-ok', gid, mid });
    res.json(full);
  } catch (e) {
    logMessengerAction({ action: 'recall-failed', gid: req.params.gid, mid: req.params.mid, err: e.message });
    res.status(500).json({ error: e.message });
  }
});

/** Giới hạn upload file Messenger (cho client hiển thị). */
r.get('/upload-limits', (_req, res) => {
  res.json({
    max_upload_mb: MESSENGER_MAX_UPLOAD_MB,
    max_file_bytes: MESSENGER_MAX_FILE_BYTES,
    max_files_per_message: 20,
  });
});

r.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `File quá lớn. Tối đa ${MESSENGER_MAX_UPLOAD_MB} MB mỗi file.`,
    });
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Trường file không hợp lệ' });
  }
  next(err);
});

module.exports = r;
