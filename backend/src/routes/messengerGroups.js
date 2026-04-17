const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Router } = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const config = require('../config');

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

const MSG_USER_SELECT = '*, user:users!messenger_group_messages_user_id_fkey(id, full_name, avatar)';

async function fetchMessengerMessageById(id) {
  const { data, error } = await supabase.from('messenger_group_messages').select(MSG_USER_SELECT).eq('id', id).single();
  if (error) return null;
  return data;
}

/** .in('id', …) + map UUID — tránh lệch khóa string/UUID khi join profile */
async function fetchUsersByIdsForMessenger(idList) {
  const ids = [...new Set((idList || []).filter(Boolean).map((x) => String(x)))];
  const rows = [];
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const { data, error } = await supabase.from('users').select('id, full_name, email, avatar').in('id', slice);
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
  return String(usr?.role || '') === 'admin';
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
    if (existing?.id) return res.status(200).json(existing);

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

    res.status(201).json(group);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Danh sách nhóm mà user là thành viên */
r.get('/groups', async (req, res) => {
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
      const { data: peerUsers } = await supabase.from('users').select('id, full_name').in('id', uniquePeers);
      (peerUsers || []).forEach((u) => peerMap.set(u.id, u));
    }

    let statsMap = new Map();
    if (ids.length) {
      const { data: statRows, error: statErr } = await supabase.rpc('messenger_group_list_stats', { p_group_ids: ids });
      if (!statErr && Array.isArray(statRows)) {
        for (const row of statRows) {
          statsMap.set(row.group_id, {
            message_count: Number(row.message_count) || 0,
            last_message_at: row.last_message_at,
          });
        }
      }
    }

    const list = (groupsFiltered || []).map((g) => {
      let display_name = g.name;
      let peer_id = null;
      if (g.is_direct) {
        const mems = membersByG.get(g.id) || [];
        const other = mems.find((id) => String(id) !== String(uid));
        if (other) {
          peer_id = other;
          const pu = peerMap.get(other);
          if (pu?.full_name) display_name = pu.full_name;
        }
      }
      const st = statsMap.get(g.id);
      return {
        id: g.id,
        name: display_name,
        raw_name: g.name,
        is_direct: !!g.is_direct,
        peer_id,
        created_by: g.created_by,
        created_at: g.created_at,
        crm_lead_id: g.crm_lead_id || null,
        my_role: roleByGid.get(g.id),
        message_count: st?.message_count ?? 0,
        last_message_at: st?.last_message_at || g.created_at,
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

/** Thêm thành viên (mọi thành viên hiện tại đều được thêm — có thể siết leader sau) */
r.post('/groups/:id/members', async (req, res) => {
  try {
    const ok = await assertGroupMember(req.params.id, req.authUserId);
    if (!ok) return res.status(403).json({ error: 'Bạn không thuộc nhóm này' });
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
    const { data, error } = await supabase
      .from('messenger_group_messages')
      .insert(insertRow)
      .select('*, user:users!messenger_group_messages_user_id_fkey(id, full_name, avatar)')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${req.params.id}`).emit('messenger_group:chat', data);
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
    const { data, error } = await supabase
      .from('messenger_group_messages')
      .insert(insertRow)
      .select('*, user:users!messenger_group_messages_user_id_fkey(id, full_name, avatar)')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    const io = req.app.get('io');
    if (io) io.to(`messenger_group:${req.params.id}`).emit('messenger_group:chat', data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
