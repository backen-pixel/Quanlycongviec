/**
 * CRM Lead comments — sửa / xóa / reaction / index tổng hợp (CRUD chi tiết lead ở leadDetail).
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const { isCrmCompanyAdminUser, isCrmSystemAdminUser } = require('../../../helpers/crmAccessRoles');
const {
  commentsTableMissing,
  reactionsTableMissing,
  CRM_COMMENT_ALLOWED_REACTION_EMOJI,
  fetchCrmCommentReactionsAggregate,
} = require('../shared/leadCommentHelpers');

const r = Router();

// PATCH /crm/lead-comments/:cid → sửa bình luận (chỉ chủ sở hữu)
r.patch('/lead-comments/:cid', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const cid = Number(req.params.cid);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Nội dung bắt buộc' });
    const { data, error } = await supabase
      .from('crm_lead_comments')
      .update({ body, updated_at: new Date().toISOString() })
      .eq('id', cid)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('id, lead_id, user_id, parent_id, body, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
      .single();
    if (error) throw error;
    const rxMap = await fetchCrmCommentReactionsAggregate(supabase, [cid], userId);
    const reactions = rxMap == null ? { summary: [], mine: null } : rxMap.get(cid) || { summary: [], mine: null };
    const row = { ...data, reactions };
    const io = req.app.get('io');
    if (io && data?.lead_id) {
      io.to(`lead:${data.lead_id}`).emit('lead:comment', { lead_id: data.lead_id, action: 'updated', comment: row });
    }
    res.json(row);
  } catch (e) {
    console.error('PATCH /crm/lead-comments/:cid:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// PUT /crm/lead-comments/:cid/reaction → thả / đổi / bỏ cảm xúc (1 emoji / user / bình luận)
r.put('/lead-comments/:cid/reaction', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const cid = Number(req.params.cid);
    if (!Number.isFinite(cid) || cid <= 0) return res.status(400).json({ error: 'id bình luận không hợp lệ' });

    const { data: com, error: cErr } = await supabase
      .from('crm_lead_comments')
      .select('id')
      .eq('id', cid)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!com) return res.status(404).json({ error: 'Không tìm thấy bình luận' });

    const raw = req.body?.emoji;
    const emoji = raw == null || raw === '' ? null : String(raw).trim();

    const delMine = async () => {
      const { error: dErr } = await supabase
        .from('crm_lead_comment_reactions')
        .delete()
        .eq('comment_id', cid)
        .eq('user_id', userId);
      if (dErr) {
        if (reactionsTableMissing(dErr)) {
          return res.status(503).json({
            error: 'Bảng cảm xúc chưa có. Chạy migration database/173_crm_lead_comment_reactions.sql.',
          });
        }
        throw dErr;
      }
    };

    if (!emoji) {
      await delMine();
      const rxMap = await fetchCrmCommentReactionsAggregate(supabase, [cid], userId);
      return res.json(rxMap == null ? { summary: [], mine: null } : rxMap.get(cid) || { summary: [], mine: null });
    }
    if (!CRM_COMMENT_ALLOWED_REACTION_EMOJI.has(emoji)) {
      return res.status(400).json({ error: 'Cảm xúc không hợp lệ' });
    }

    const { data: existingRow, error: exErr } = await supabase
      .from('crm_lead_comment_reactions')
      .select('emoji')
      .eq('comment_id', cid)
      .eq('user_id', userId)
      .maybeSingle();
    if (exErr) {
      if (reactionsTableMissing(exErr)) {
        return res.status(503).json({
          error: 'Bảng cảm xúc chưa có. Chạy migration database/173_crm_lead_comment_reactions.sql.',
        });
      }
      throw exErr;
    }
    if (existingRow && existingRow.emoji === emoji) {
      await delMine();
    } else {
      const { error: upErr } = await supabase.from('crm_lead_comment_reactions').upsert(
        { comment_id: cid, user_id: userId, emoji },
        { onConflict: 'comment_id,user_id' },
      );
      if (upErr) {
        if (reactionsTableMissing(upErr)) {
          return res.status(503).json({
            error: 'Bảng cảm xúc chưa có. Chạy migration database/173_crm_lead_comment_reactions.sql.',
          });
        }
        throw upErr;
      }
    }

    const rxMap = await fetchCrmCommentReactionsAggregate(supabase, [cid], userId);
    if (rxMap == null) return res.json({ summary: [], mine: null });
    res.json(rxMap.get(cid) || { summary: [], mine: null });
  } catch (e) {
    console.error('PUT /crm/lead-comments/:cid/reaction:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// DELETE /crm/lead-comments/:cid → xóa mềm (chỉ chủ sở hữu hoặc admin)
r.delete('/lead-comments/:cid', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const cid = Number(req.params.cid);
    const isAdmin = isCrmSystemAdminUser(req.user?.role) || isCrmCompanyAdminUser(req.user?.role);
    const { data: existing } = await supabase
      .from('crm_lead_comments')
      .select('lead_id')
      .eq('id', cid)
      .maybeSingle();
    let q = supabase
      .from('crm_lead_comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', cid);
    if (!isAdmin) q = q.eq('user_id', userId);
    const { error } = await q;
    if (error) throw error;
    const io = req.app.get('io');
    if (io && existing?.lead_id) {
      io.to(`lead:${existing.lead_id}`).emit('lead:comment', {
        lead_id: existing.lead_id,
        action: 'deleted',
        comment_id: cid,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /crm/lead-comments/:cid:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// GET /crm/lead-comments/index?lead_ids=… → Map { lead_id → {count,last_at,last_user_id} }
r.get('/lead-comments/index', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const raw = String(req.query.lead_ids || '').trim();
    let leadIds = raw
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    let q = supabase
      .from('crm_lead_comments')
      .select('lead_id, user_id, created_at')
      .is('deleted_at', null);
    if (leadIds.length) q = q.in('lead_id', leadIds);
    // Bảo vệ: nếu không truyền lead_ids, giới hạn 5000 dòng gần nhất để tránh tải nặng.
    if (!leadIds.length) q = q.order('created_at', { ascending: false }).limit(5000);
    const { data, error } = await q;
    if (error) {
      if (commentsTableMissing(error)) return res.json({});
      throw error;
    }
    const out = {};
    (data || []).forEach((row) => {
      const lid = String(row.lead_id);
      const cur = out[lid] || { count: 0, last_at: null, last_user_id: null };
      cur.count += 1;
      const ts = row.created_at;
      if (!cur.last_at || (ts && ts > cur.last_at)) {
        cur.last_at = ts;
        cur.last_user_id = row.user_id;
      }
      out[lid] = cur;
    });
    res.json(out);
  } catch (e) {
    console.error('GET /crm/lead-comments/index:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});


module.exports = r;
