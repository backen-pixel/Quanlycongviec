const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isCrmSystemAdminUser } = require('../helpers/crmAccessRoles');
const { emitNotifyBadge } = require('../helpers/notifyBadge');
const { responseCache, invalidateTags: rcInvalidateTags } = require('../middleware/responseCache');

const r = Router();
r.use(auth);

r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function internalSocialInvalidate(body) {
    if (res.statusCode < 400) void rcInvalidateTags(['internal-social']);
    return origJson(body);
  };
  next();
});

const MAX_BODY = 8000;
const MAX_COMMENT = 4000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_OFFSET = 2000;
const MAX_ATTACHMENTS_PER_POST = 12;

/** Chuỗi từ client (kể cả `""`) → null nếu rỗng sau trim */
function strTrimField(v, maxLen) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, maxLen);
  return s.length ? s : null;
}

const REACTION_KEYS = new Set(['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry']);

function normalizeReaction(body) {
  const r = String(body?.reaction || 'like').toLowerCase().trim();
  return REACTION_KEYS.has(r) ? r : 'like';
}

function sameUserId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function reactionKeyFromLikeRow(row) {
  return row.reaction && REACTION_KEYS.has(String(row.reaction).toLowerCase())
    ? String(row.reaction).toLowerCase()
    : 'like';
}

/** rows: { user_id, reaction }[] */
function reactionsFromRows(rows, me) {
  const reaction_counts = {};
  let my_reaction = null;
  for (const row of rows || []) {
    const key = reactionKeyFromLikeRow(row);
    reaction_counts[key] = (reaction_counts[key] || 0) + 1;
    if (sameUserId(row.user_id, me)) my_reaction = key;
  }
  const like_count = rows?.length || 0;
  return {
    reaction_counts,
    my_reaction,
    like_count,
    liked_by_me: my_reaction != null,
  };
}

/** DB chưa có cột reaction (chưa chạy migration 177) → coi mọi like là 'like'. */
async function fetchLikeRowsWithReactionFallback(postIds) {
  if (!postIds.length) return [];
  const q1 = await supabase
    .from('internal_social_likes')
    .select('post_id, user_id, reaction, created_at')
    .in('post_id', postIds);
  if (!q1.error) return q1.data || [];
  const msg = String(q1.error.message || q1.error.details || '').toLowerCase();
  const code = q1.error.code;
  const missingReaction =
    code === '42703'
    || (msg.includes('reaction') && (msg.includes('does not exist') || msg.includes('unknown column')));
  if (!missingReaction) throw q1.error;
  const q2 = await supabase
    .from('internal_social_likes')
    .select('post_id, user_id, created_at')
    .in('post_id', postIds);
  if (q2.error) throw q2.error;
  return (q2.data || []).map((row) => ({ ...row, reaction: 'like' }));
}

async function fetchLikesForPosts(postIds) {
  if (!postIds.length) return {};
  const data = await fetchLikeRowsWithReactionFallback(postIds);
  const by = {};
  for (const row of data) {
    if (!by[row.post_id]) by[row.post_id] = [];
    by[row.post_id].push(row);
  }
  return by;
}

async function reactionPayloadForPost(postId, me) {
  const by = await fetchLikesForPosts([postId]);
  return reactionsFromRows(by[postId], me);
}

async function fetchCommentReactionRows(commentIds) {
  if (!commentIds.length) return [];
  const q1 = await supabase
    .from('internal_social_comment_reactions')
    .select('comment_id, user_id, reaction')
    .in('comment_id', commentIds);
  if (!q1.error) return q1.data || [];
  const msg = String(q1.error.message || q1.error.details || '').toLowerCase();
  const code = q1.error.code;
  const missing =
    code === '42P01'
    || (msg.includes('internal_social_comment_reactions') && (msg.includes('does not exist') || msg.includes('not find')))
    || (msg.includes('relation') && msg.includes('does not exist') && msg.includes('internal_social_comment_reactions'));
  if (missing) return [];
  throw q1.error;
}

async function enrichCommentsWithReactions(list, me) {
  const ids = list.map((c) => c.id);
  const rows = await fetchCommentReactionRows(ids);
  const byComment = {};
  for (const row of rows) {
    if (!byComment[row.comment_id]) byComment[row.comment_id] = [];
    byComment[row.comment_id].push({ user_id: row.user_id, reaction: row.reaction });
  }
  return list.map((c) => {
    const rx = reactionsFromRows(byComment[c.id], me);
    return {
      ...c,
      reaction_counts: rx.reaction_counts,
      my_reaction: rx.my_reaction,
      liked_by_me: rx.liked_by_me,
      reaction_count: rx.like_count,
    };
  });
}

async function reactionPayloadForComment(commentId, me) {
  const rows = await fetchCommentReactionRows([commentId]);
  const rx = reactionsFromRows(rows, me);
  return {
    reaction_counts: rx.reaction_counts,
    my_reaction: rx.my_reaction,
    liked_by_me: rx.liked_by_me,
    reaction_count: rx.like_count,
  };
}

function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const a of raw) {
    if (out.length >= MAX_ATTACHMENTS_PER_POST) break;
    const url = a?.file_url != null ? String(a.file_url).trim() : '';
    if (!url || url.length > 2500) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      file_url: url,
      file_name: (String(a.file_name || 'file').trim().slice(0, 400) || 'file'),
      mime_type: (String(a.mime_type || 'application/octet-stream').trim().slice(0, 200) || 'application/octet-stream'),
      file_size: Math.min(Math.max(0, Number(a.file_size) || 0), 2048 * 1024 * 1024),
    });
  }
  return out;
}

function parseVisibility(v) {
  const s = String(v ?? 'company').toLowerCase().trim();
  if (s === 'selected_users') return 'selected_users';
  if (s === 'selected_companies') return 'selected_companies';
  return 'company';
}

function parseAudienceUserIds(body) {
  const raw = body?.audience_user_ids ?? body?.audienceUserIds;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const id = x != null ? String(x).trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (out.length >= 500) break;
    out.push(id);
  }
  return out;
}

function parseAudienceCompanyIds(body) {
  const raw = body?.audience_company_ids ?? body?.audienceCompanyIds;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const id = x != null ? String(x).trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (out.length >= 200) break;
    out.push(id);
  }
  return out;
}

async function validateCompanyIds(companyIds) {
  const uniq = [...new Set((companyIds || []).map(String).filter(Boolean))];
  if (!uniq.length) return { ok: false, error: 'Chọn ít nhất một công ty được xem bài.' };
  const { data, error } = await supabase
    .from('companies')
    .select('id, is_active')
    .in('id', uniq);
  if (error) throw error;
  const byId = new Map((data || []).map((c) => [String(c.id), c]));
  for (const id of uniq) {
    const c = byId.get(String(id));
    if (!c) return { ok: false, error: 'Một số công ty không tồn tại.' };
    if (c.is_active === false) return { ok: false, error: 'Một số công ty đã ngừng hoạt động.' };
  }
  return { ok: true, ids: uniq };
}

/** Tạo bài: null/omit → đăng ngay (now). Sửa bài: undefined = không đổi. */
function parsePublishedAtForCreate(body) {
  const raw = body?.published_at ?? body?.publish_at;
  if (raw == null || raw === '') return new Date().toISOString();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function parsePublishedAtForUpdate(body) {
  if (body?.published_at === undefined) return undefined;
  if (body.published_at === null || body.published_at === '') return new Date().toISOString();
  const d = new Date(body.published_at);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

async function validateUsersInCompany(userIds, companyId) {
  const uniq = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!uniq.length) return { ok: false, error: 'Chọn ít nhất một nhân viên được xem bài.' };
  const companyEq = String(companyId);
  const { data: depts, error: dErr } = await supabase
    .from('departments')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);
  if (dErr) throw dErr;
  const deptIds = new Set((depts || []).map((d) => d.id));
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, company_id, department_id, is_active')
    .in('id', uniq);
  if (uErr) throw uErr;
  const byId = new Map((users || []).map((u) => [String(u.id), u]));
  for (const id of uniq) {
    const u = byId.get(String(id));
    if (!u || u.is_active === false) {
      return { ok: false, error: 'Một số nhân viên không tồn tại hoặc đã vô hiệu.' };
    }
    if (u.company_id && String(u.company_id) === companyEq) continue;
    if (u.department_id && deptIds.has(u.department_id)) continue;
    return { ok: false, error: 'Một số nhân viên không thuộc công ty của bài viết.' };
  }
  return { ok: true };
}

async function fetchAudienceUserIds(postId) {
  const { data, error } = await supabase
    .from('internal_social_post_audience')
    .select('user_id')
    .eq('post_id', postId);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || (msg.includes('internal_social_post_audience') && msg.includes('does not exist'))) {
      return [];
    }
    throw error;
  }
  return (data || []).map((r) => r.user_id);
}

async function replacePostAudience(postId, visibility, audienceIds, authorId) {
  const { error: delErr } = await supabase.from('internal_social_post_audience').delete().eq('post_id', postId);
  if (delErr) {
    const msg = String(delErr.message || '').toLowerCase();
    if (delErr.code === '42P01' || (msg.includes('internal_social_post_audience') && msg.includes('does not exist'))) {
      return;
    }
    throw delErr;
  }
  if (visibility !== 'selected_users') return;
  const set = new Set((audienceIds || []).map(String).filter(Boolean));
  set.add(String(authorId));
  const rows = [...set].map((user_id) => ({ post_id: postId, user_id }));
  if (!rows.length) return;
  const { error: insErr } = await supabase.from('internal_social_post_audience').insert(rows);
  if (insErr) throw insErr;
}

async function fetchAudienceByPostIds(postIds) {
  if (!postIds.length) return {};
  const { data, error } = await supabase
    .from('internal_social_post_audience')
    .select('post_id, user_id')
    .in('post_id', postIds);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || (msg.includes('internal_social_post_audience') && msg.includes('does not exist'))) {
      return {};
    }
    throw error;
  }
  const by = {};
  for (const row of data || []) {
    if (!by[row.post_id]) by[row.post_id] = [];
    by[row.post_id].push(row.user_id);
  }
  return by;
}

async function fetchPostExtraCompanyIds(postId) {
  const { data, error } = await supabase
    .from('internal_social_post_companies')
    .select('company_id')
    .eq('post_id', postId);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || (msg.includes('internal_social_post_companies') && msg.includes('does not exist'))) {
      return [];
    }
    throw error;
  }
  return (data || []).map((r) => r.company_id);
}

async function fetchAudienceCompaniesByPostIds(postIds) {
  if (!postIds.length) return {};
  const { data, error } = await supabase
    .from('internal_social_post_companies')
    .select('post_id, company_id')
    .in('post_id', postIds);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || (msg.includes('internal_social_post_companies') && msg.includes('does not exist'))) {
      return {};
    }
    throw error;
  }
  const by = {};
  for (const row of data || []) {
    if (!by[row.post_id]) by[row.post_id] = [];
    by[row.post_id].push(row.company_id);
  }
  return by;
}

async function replacePostCompanies(postId, visibility, companyIds, primaryCompanyId) {
  const { error: delErr } = await supabase.from('internal_social_post_companies').delete().eq('post_id', postId);
  if (delErr) {
    const msg = String(delErr.message || '').toLowerCase();
    if (delErr.code === '42P01' || (msg.includes('internal_social_post_companies') && msg.includes('does not exist'))) {
      return { hint: 'Chạy migration database/200_internal_social_post_companies.sql' };
    }
    throw delErr;
  }
  if (visibility !== 'selected_companies') return null;
  const set = new Set((companyIds || []).map(String).filter(Boolean));
  set.delete(String(primaryCompanyId));
  if (!set.size) return null;
  const rows = [...set].map((company_id) => ({ post_id: postId, company_id }));
  const { error: insErr } = await supabase.from('internal_social_post_companies').insert(rows);
  if (insErr) throw insErr;
  return null;
}

async function hydratePostsToResponse(page, me) {
  const authorMap = await fetchUsersByIds(page.map((p) => p.author_id));
  const ids = page.map((p) => p.id);
  const [likesByPost, { data: commentsRows, error: commentsErr }, audBy, compBy] = await Promise.all([
    fetchLikesForPosts(ids),
    supabase.from('internal_social_comments').select('post_id').in('post_id', ids),
    fetchAudienceByPostIds(ids),
    fetchAudienceCompaniesByPostIds(ids),
  ]);
  if (commentsErr) throw commentsErr;
  const commentCount = {};
  for (const row of commentsRows || []) {
    commentCount[row.post_id] = (commentCount[row.post_id] || 0) + 1;
  }
  let attByPost = {};
  try {
    attByPost = await fetchAttachmentsByPostIds(ids);
  } catch (attErr) {
    if (String(attErr.message || '').includes('internal_social_attachments') || attErr.code === '42P01') {
      attByPost = {};
    } else throw attErr;
  }
  const allAudIds = [...new Set(Object.values(audBy).flat().map(String))];
  const audUserMap = allAudIds.length ? await fetchUsersByIds(allAudIds) : new Map();

  const allCompanyIds = new Set();
  for (const p of page) allCompanyIds.add(String(p.company_id));
  for (const arr of Object.values(compBy)) for (const cid of arr) allCompanyIds.add(String(cid));
  let companyMap = new Map();
  if (allCompanyIds.size) {
    const { data: cmps } = await supabase
      .from('companies')
      .select('id, name, short_name')
      .in('id', [...allCompanyIds]);
    companyMap = new Map((cmps || []).map((c) => [String(c.id), c]));
  }

  return page.map((p) => {
    const rx = reactionsFromRows(likesByPost[p.id], me);
    const vis = p.visibility || 'company';
    const audIds = audBy[p.id] || [];
    const audience_users = vis === 'selected_users'
      ? audIds.map((id) => audUserMap.get(id) || { id, full_name: null, email: null, role: null })
      : [];
    let audience_companies = [];
    if (vis === 'selected_companies') {
      const extras = compBy[p.id] || [];
      const all = [String(p.company_id), ...extras.map(String)];
      const seen = new Set();
      for (const cid of all) {
        if (seen.has(cid)) continue;
        seen.add(cid);
        audience_companies.push(companyMap.get(cid) || { id: cid, name: null, short_name: null });
      }
    }
    return {
      ...p,
      author: authorMap.get(p.author_id) || { id: p.author_id, full_name: null, email: null, role: null },
      like_count: rx.like_count,
      comment_count: commentCount[p.id] || 0,
      liked_by_me: rx.liked_by_me,
      my_reaction: rx.my_reaction,
      reaction_counts: rx.reaction_counts,
      attachments: attByPost[p.id] || [],
      audience_users,
      audience_companies,
    };
  });
}

async function fetchAttachmentsByPostIds(postIds) {
  if (!postIds.length) return {};
  const { data, error } = await supabase
    .from('internal_social_attachments')
    .select('id, post_id, file_url, file_name, mime_type, file_size, sort_index')
    .in('post_id', postIds);
  if (error) throw error;
  const by = {};
  for (const row of data || []) {
    if (!by[row.post_id]) by[row.post_id] = [];
    by[row.post_id].push(row);
  }
  for (const k of Object.keys(by)) {
    by[k].sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
  }
  return by;
}

function userCompanyId(req) {
  const cid = req.user?.company_id != null ? String(req.user.company_id).trim() : '';
  return cid || null;
}

/** Danh sách / lọc: admin hệ thống bắt buộc ?company_id=; còn lại theo company của user. */
function resolveListCompanyId(req, res) {
  if (isCrmSystemAdminUser(req.user)) {
    const q = req.query.company_id;
    const id = q && String(q).trim() ? String(q).trim() : null;
    if (!id) {
      res.status(400).json({ error: 'Admin hệ thống: chọn company_id để xem bảng tin nội bộ.' });
      return null;
    }
    return id;
  }
  const cid = userCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Tài khoản chưa gắn công ty — vui lòng liên hệ quản trị để cấp quyền xem bảng tin nội bộ.' });
    return null;
  }
  return cid;
}

/** Tạo bài: admin hệ thống gửi company_id trong body. */
function resolveCreateCompanyId(req, res) {
  if (isCrmSystemAdminUser(req.user)) {
    const id = req.body?.company_id && String(req.body.company_id).trim();
    if (!id) {
      res.status(400).json({ error: 'Admin hệ thống: gửi company_id trong body khi đăng bài.' });
      return null;
    }
    return id;
  }
  const cid = userCompanyId(req);
  if (!cid) {
    res.status(400).json({ error: 'Tài khoản chưa gắn công ty — không đăng được bài.' });
    return null;
  }
  return cid;
}

function canModerate(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator', 'region_admin'].includes(role);
}

async function fetchUsersByIds(ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role, avatar')
    .in('id', uniq);
  if (error) throw error;
  const m = new Map();
  for (const u of data || []) m.set(u.id, u);
  return m;
}

/** Kiểm tra quyền xem nội dung (lịch đăng, ẩn công ty, phạm vi). Admin hệ thống: bỏ qua. */
async function assertUserCanAccessPostContent(req, post, me) {
  if (isCrmSystemAdminUser(req.user)) return { ok: true };
  if (post.hidden_at && !sameUserId(post.author_id, me) && !canModerate(req)) {
    return { ok: false, status: 404, error: 'Không tìm thấy bài viết' };
  }
  const pub = new Date(post.published_at || post.created_at);
  if (pub > new Date() && !sameUserId(post.author_id, me) && !canModerate(req)) {
    return { ok: false, status: 404, error: 'Bài viết chưa được đăng' };
  }
  const vis = post.visibility || 'company';
  if (vis !== 'selected_users') return { ok: true };
  if (sameUserId(post.author_id, me) || canModerate(req)) return { ok: true };
  const { data: row, error } = await supabase
    .from('internal_social_post_audience')
    .select('user_id')
    .eq('post_id', post.id)
    .eq('user_id', me)
    .maybeSingle();
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || (msg.includes('internal_social_post_audience') && msg.includes('does not exist'))) {
      return { ok: true };
    }
    throw error;
  }
  if (!row) return { ok: false, status: 403, error: 'Bạn không có quyền xem bài này' };
  return { ok: true };
}

/** Đọc bài + kiểm tra quyền theo công ty; sau đó kiểm tra lịch/ẩn/phạm vi. */
async function getPostForUser(req, postId) {
  const { data: post, error } = await supabase
    .from('internal_social_posts')
    .select('id, company_id, author_id, body, link_url, link_title, image_url, video_url, created_at, updated_at, deleted_at, published_at, visibility, hidden_at')
    .eq('id', postId)
    .maybeSingle();
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    const missing =
      error.code === '42703'
      || (msg.includes('column') && (msg.includes('published_at') || msg.includes('visibility') || msg.includes('hidden_at')));
    if (missing) {
      return { ok: false, status: 503, error: 'Chạy migration 180_internal_social_schedule_visibility_hide_share.sql để dùng đầy đủ bảng tin.' };
    }
    throw error;
  }
  if (!post || post.deleted_at) return { ok: false, status: 404, error: 'Không tìm thấy bài viết' };
  if (!isCrmSystemAdminUser(req.user)) {
    const my = userCompanyId(req);
    let allowed = !!my && String(post.company_id) === String(my);
    if (!allowed && my && post.visibility === 'selected_companies') {
      try {
        const extras = await fetchPostExtraCompanyIds(post.id);
        if (extras.some((cid) => String(cid) === String(my))) allowed = true;
      } catch { /* ignore */ }
    }
    if (!allowed) {
      return { ok: false, status: 403, error: 'Không có quyền với bài viết này' };
    }
  }
  const me = req.user.userId || req.user.id;
  const access = await assertUserCanAccessPostContent(req, post, me);
  if (!access.ok) return access;
  return { ok: true, post };
}

async function getLastReadAt(userId, companyId) {
  const { data, error } = await supabase
    .from('internal_social_last_read')
    .select('last_read_at')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || (msg.includes('internal_social_last_read') && msg.includes('does not exist'))) {
      return null;
    }
    throw error;
  }
  return data?.last_read_at || null;
}

async function countUnreadForCompany(userId, companyId, canModerate) {
  const since = (await getLastReadAt(userId, companyId)) || '1970-01-01T00:00:00.000Z';
  const { data, error } = await supabase.rpc('internal_social_unread_count', {
    p_company_id: companyId,
    p_user_id: userId,
    p_can_moderate: !!canModerate,
    p_since: since,
  });
  if (!error) return Number(data) || 0;
  const msg = String(error.message || '').toLowerCase();
  if (error.code !== '42883' && !msg.includes('internal_social_unread_count')) throw error;

  let q = supabase
    .from('internal_social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .neq('author_id', userId)
    .gt('created_at', since);
  const { count, error: qErr } = await q;
  if (qErr) throw qErr;
  return Number(count) || 0;
}

async function upsertLastRead(userId, companyId) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('internal_social_last_read')
    .upsert(
      { user_id: userId, company_id: companyId, last_read_at: now },
      { onConflict: 'user_id,company_id' },
    );
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || (msg.includes('internal_social_last_read') && msg.includes('does not exist'))) {
      return { ok: false, hint: 'Chạy migration database/199_internal_social_last_read.sql' };
    }
    throw error;
  }
  return { ok: true };
}

/** GET /api/internal-social/unread-count — badge sidebar */
r.get('/unread-count', responseCache({ ttl: 30, scope: 'user', tags: ['internal-social'] }), async (req, res) => {
  try {
    const me = req.user.userId || req.user.id;
    const canMod = canModerate(req);

    if (isCrmSystemAdminUser(req.user)) {
      const q = req.query.company_id && String(req.query.company_id).trim();
      if (q) {
        const unread = await countUnreadForCompany(me, q, true);
        return res.json({ unread, company_id: q });
      }
      const { data: companies, error } = await supabase
        .from('companies')
        .select('id')
        .eq('is_active', true);
      if (error) throw error;
      let unread = 0;
      for (const c of companies || []) {
        unread += await countUnreadForCompany(me, c.id, true);
      }
      return res.json({ unread });
    }

    const companyId = userCompanyId(req);
    if (!companyId) return res.json({ unread: 0 });
    const unread = await countUnreadForCompany(me, companyId, canMod);
    res.json({ unread, company_id: companyId });
  } catch (e) {
    console.error('GET /internal-social/unread-count:', e);
    res.status(500).json({ error: e.message || 'Lỗi đếm tin mới' });
  }
});

/** POST /api/internal-social/mark-read — đánh dấu đã xem bảng tin (theo công ty) */
r.post('/mark-read', async (req, res) => {
  try {
    const me = req.user.userId || req.user.id;
    let companyId = null;
    if (isCrmSystemAdminUser(req.user)) {
      companyId = (req.body?.company_id || req.query?.company_id) && String(req.body?.company_id || req.query?.company_id).trim();
      if (!companyId) {
        return res.status(400).json({ error: 'Admin hệ thống: gửi company_id khi đánh dấu đã đọc.' });
      }
    } else {
      companyId = userCompanyId(req);
      if (!companyId) return res.status(400).json({ error: 'Tài khoản chưa gắn công ty.' });
    }
    const result = await upsertLastRead(me, companyId);
    if (!result.ok) return res.status(503).json({ error: result.hint });
    res.json({ ok: true, company_id: companyId });
  } catch (e) {
    console.error('POST /internal-social/mark-read:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** GET /api/internal-social/users/search?q=... — tìm thành viên để mở trang cá nhân */
r.get('/users/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ users: [] });
    const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);

    let scopeDeptIds = null;
    const my = userCompanyId(req);
    if (!isCrmSystemAdminUser(req.user)) {
      if (!my) return res.json({ users: [] });
      const { data: depts } = await supabase
        .from('departments')
        .select('id')
        .eq('company_id', my);
      scopeDeptIds = (depts || []).map((d) => d.id);
    }

    let query = supabase
      .from('users')
      .select('id, full_name, email, avatar, role, position, department_id, company_id')
      .neq('is_active', false)
      .or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
      .order('full_name', { ascending: true })
      .limit(20);
    if (scopeDeptIds !== null) {
      const parts = [`company_id.eq.${my}`];
      if (scopeDeptIds.length) parts.push(`department_id.in.(${scopeDeptIds.join(',')})`);
      query = query.or(parts.join(','));
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ users: data || [] });
  } catch (e) {
    console.error('GET /internal-social/users/search:', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/internal-social/profile/:userId — thông tin trang cá nhân */
r.get('/profile/:userId', async (req, res) => {
  try {
    const uid = req.params.userId;
    let user = null;
    const tryFull = await supabase
      .from('users')
      .select('id, full_name, email, phone, role, position, avatar, cover_url, bio, company_id, department_id, created_at')
      .eq('id', uid)
      .maybeSingle();
    if (tryFull.error) {
      const msg = String(tryFull.error.message || '').toLowerCase();
      if (msg.includes('cover_url') || msg.includes('bio')) {
        const fb = await supabase
          .from('users')
          .select('id, full_name, email, phone, role, position, avatar, company_id, department_id, created_at')
          .eq('id', uid)
          .maybeSingle();
        if (fb.error) throw fb.error;
        user = fb.data ? { ...fb.data, cover_url: null, bio: null } : null;
      } else throw tryFull.error;
    } else {
      user = tryFull.data;
    }
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    let company = null;
    let department = null;
    if (user.department_id) {
      const { data: d } = await supabase
        .from('departments')
        .select('id, name, color, company_id')
        .eq('id', user.department_id)
        .maybeSingle();
      if (d) department = d;
    }
    const primaryCompanyId = user.company_id || department?.company_id || null;
    if (primaryCompanyId) {
      const { data: c } = await supabase
        .from('companies')
        .select('id, name, short_name')
        .eq('id', primaryCompanyId)
        .maybeSingle();
      if (c) company = c;
    }

    let postCount = 0;
    try {
      const { count } = await supabase
        .from('internal_social_posts')
        .select('id', { head: true, count: 'exact' })
        .eq('author_id', uid)
        .is('deleted_at', null);
      postCount = Number(count) || 0;
    } catch { /* ignore */ }

    res.json({
      profile: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || null,
        role: user.role || null,
        position: user.position || null,
        avatar: user.avatar || null,
        cover_url: user.cover_url || null,
        bio: user.bio || null,
        company,
        department,
        post_count: postCount,
        created_at: user.created_at || null,
      },
    });
  } catch (e) {
    console.error('GET /internal-social/profile/:userId:', e);
    res.status(500).json({ error: e.message });
  }
});

/** PATCH /api/internal-social/profile/me — đổi avatar / ảnh bìa / tiểu sử */
r.patch('/profile/me', async (req, res) => {
  try {
    const me = req.user.userId || req.user.id;
    const update = {};
    if (req.body?.avatar !== undefined) {
      const v = req.body.avatar == null ? '' : String(req.body.avatar).trim();
      update.avatar = v || null;
    }
    if (req.body?.cover_url !== undefined) {
      const v = req.body.cover_url == null ? '' : String(req.body.cover_url).trim();
      update.cover_url = v || null;
    }
    if (req.body?.bio !== undefined) {
      const raw = req.body.bio == null ? '' : String(req.body.bio).trim();
      update.bio = raw ? raw.slice(0, 500) : null;
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'Không có thay đổi.' });
    }
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('users')
      .update(update)
      .eq('id', me)
      .select('id, full_name, email, avatar, cover_url, bio')
      .single();
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('cover_url') || msg.includes('bio')) {
        return res.status(503).json({ error: 'Chạy migration 201_users_social_profile.sql để cập nhật ảnh bìa / tiểu sử.' });
      }
      throw error;
    }
    res.json({ profile: data });
  } catch (e) {
    console.error('PATCH /internal-social/profile/me:', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/internal-social/profile/:userId/media — ảnh & video xuất hiện trong bài của người dùng */
r.get('/profile/:userId/media', async (req, res) => {
  try {
    const authorId = req.params.userId;
    const me = req.user.userId || req.user.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 200);
    const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), 5000);
    const kindFilter = (() => {
      const k = String(req.query.kind || 'all').toLowerCase();
      return k === 'image' || k === 'video' ? k : 'all';
    })();
    const postBatch = 30;

    const isYoutubeUrl = (url) => {
      try {
        const u = new URL(String(url).trim());
        const h = u.hostname.replace(/^www\./, '');
        return h === 'youtu.be' || h.endsWith('youtube.com') || h.endsWith('youtube-nocookie.com');
      } catch { return false; }
    };
    const isVimeoUrl = (url) => {
      try {
        const u = new URL(String(url).trim());
        return u.hostname.replace(/^www\./, '').endsWith('vimeo.com');
      } catch { return false; }
    };
    const inferKind = (url) => {
      const u = String(url || '').toLowerCase();
      if (isYoutubeUrl(url) || isVimeoUrl(url)) return 'video';
      if (/\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/.test(u)) return 'image';
      if (/\.(mp4|webm|ogg|mov|m4v|avi|mkv)(\?|#|$)/.test(u)) return 'video';
      return null;
    };

    const items = [];
    const seen = new Set();
    const pushItem = (rawUrl, post, kindHint) => {
      const url = String(rawUrl || '').trim();
      if (!url || seen.has(url)) return false;
      const kind = kindHint === 'video' || kindHint === 'image'
        ? kindHint
        : (inferKind(url) || 'image');
      if (kindFilter !== 'all' && kind !== kindFilter) return false;
      seen.add(url);
      items.push({
        url,
        kind,
        post_id: post.id,
        created_at: post.created_at,
      });
      return true;
    };

    let cursor = offset;
    let exhausted = false;
    let scanned = 0;
    const MAX_SCAN = 1200;

    while (items.length < limit && !exhausted && scanned < MAX_SCAN) {
      const { data: rows, error } = await supabase
        .from('internal_social_posts')
        .select('id, company_id, author_id, body, link_url, link_title, image_url, video_url, created_at, updated_at, deleted_at, published_at, visibility, hidden_at')
        .eq('author_id', authorId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(cursor, cursor + postBatch - 1);
      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('visibility') || msg.includes('hidden_at') || msg.includes('published_at')) {
          return res.status(503).json({ error: 'Chạy migration 180_internal_social_schedule_visibility_hide_share.sql' });
        }
        throw error;
      }
      const batch = rows || [];
      if (!batch.length) { exhausted = true; break; }
      scanned += batch.length;
      cursor += batch.length;

      const allowedIds = [];
      for (const post of batch) {
        let allow = isCrmSystemAdminUser(req.user);
        if (!allow) {
          const my = userCompanyId(req);
          if (my) {
            let companyOk = String(post.company_id) === String(my);
            if (!companyOk && post.visibility === 'selected_companies') {
              try {
                const extras = await fetchPostExtraCompanyIds(post.id);
                companyOk = extras.some((cid) => String(cid) === String(my));
              } catch { /* ignore */ }
            }
            if (companyOk) {
              const access = await assertUserCanAccessPostContent(req, post, me);
              if (access.ok) {
                const { count: hideCount } = await supabase
                  .from('internal_social_post_user_hides')
                  .select('user_id', { head: true, count: 'exact' })
                  .eq('post_id', post.id)
                  .eq('user_id', me);
                if (!Number(hideCount)) allow = true;
              }
            }
          }
        }
        if (allow) allowedIds.push(post.id);
      }

      let attByPost = {};
      if (allowedIds.length) {
        try {
          attByPost = await fetchAttachmentsByPostIds(allowedIds);
        } catch (attErr) {
          if (String(attErr.message || '').includes('internal_social_attachments') || attErr.code === '42P01') {
            attByPost = {};
          } else throw attErr;
        }
      }

      for (const post of batch) {
        if (!allowedIds.includes(post.id)) continue;
        if (post.image_url) pushItem(post.image_url, post, 'image');
        if (post.video_url) pushItem(post.video_url, post, inferKind(post.video_url) || 'video');
        if (post.link_url && (isYoutubeUrl(post.link_url) || isVimeoUrl(post.link_url))) {
          pushItem(post.link_url, post, 'video');
        }
        const bodyTrim = String(post.body || '').trim();
        if (bodyTrim && !/\s/.test(bodyTrim) && /^https?:\/\//i.test(bodyTrim)) {
          const bodyKind = inferKind(bodyTrim);
          if (bodyKind) pushItem(bodyTrim, post, bodyKind);
        }
        const atts = attByPost[post.id] || [];
        for (const a of atts) {
          const mt = String(a.mime_type || '').toLowerCase();
          let k = null;
          if (mt.startsWith('image/')) k = 'image';
          else if (mt.startsWith('video/')) k = 'video';
          else k = inferKind(a.file_url);
          if (k === 'image' || k === 'video') pushItem(a.file_url, post, k);
        }
        if (items.length >= limit) break;
      }

      if (batch.length < postBatch) exhausted = true;
    }

    const hasMore = !exhausted && items.length >= limit;
    res.json({
      items: items.slice(0, limit),
      has_more: hasMore,
      next_offset: hasMore ? cursor : null,
    });
  } catch (e) {
    console.error('GET /internal-social/profile/:userId/media:', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/internal-social/profile/:userId/posts — bài của một thành viên (đã lọc theo quyền) */
r.get('/profile/:userId/posts', async (req, res) => {
  try {
    const authorId = req.params.userId;
    const me = req.user.userId || req.user.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), MAX_OFFSET);
    const overfetch = limit + 30;

    const { data: rows, error } = await supabase
      .from('internal_social_posts')
      .select('id, company_id, author_id, body, link_url, link_title, image_url, video_url, created_at, updated_at, deleted_at, published_at, visibility, hidden_at')
      .eq('author_id', authorId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + overfetch);
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('visibility') || msg.includes('hidden_at') || msg.includes('published_at')) {
        return res.status(503).json({ error: 'Chạy migration 180_internal_social_schedule_visibility_hide_share.sql' });
      }
      throw error;
    }

    const all = rows || [];
    const visible = [];
    for (const post of all) {
      let allow = isCrmSystemAdminUser(req.user);
      if (!allow) {
        const my = userCompanyId(req);
        if (my) {
          let companyOk = String(post.company_id) === String(my);
          if (!companyOk && post.visibility === 'selected_companies') {
            try {
              const extras = await fetchPostExtraCompanyIds(post.id);
              companyOk = extras.some((cid) => String(cid) === String(my));
            } catch { /* ignore */ }
          }
          if (companyOk) {
            const access = await assertUserCanAccessPostContent(req, post, me);
            if (access.ok) {
              const { count: hideCount } = await supabase
                .from('internal_social_post_user_hides')
                .select('user_id', { head: true, count: 'exact' })
                .eq('post_id', post.id)
                .eq('user_id', me);
              if (!Number(hideCount)) allow = true;
            }
          }
        }
      }
      if (allow) visible.push(post);
      if (visible.length > limit) break;
    }
    const hasMore = visible.length > limit || all.length > overfetch;
    const page = hasMore ? visible.slice(0, limit) : visible;
    const posts = page.length ? await hydratePostsToResponse(page, me) : [];
    res.json({
      posts,
      has_more: hasMore,
      next_offset: hasMore ? offset + overfetch : null,
    });
  } catch (e) {
    console.error('GET /internal-social/profile/:userId/posts:', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/internal-social/posts */
r.get('/posts', async (req, res) => {
  try {
    const companyId = resolveListCompanyId(req, res);
    if (!companyId) return;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.min(Math.max(parseInt(req.query.offset, 10) || 0, 0), MAX_OFFSET);

    const me = req.user.userId || req.user.id;

    const rpc = await supabase.rpc('internal_social_feed_posts', {
      p_company_id: companyId,
      p_user_id: me,
      p_can_moderate: canModerate(req),
      p_limit: limit + 1,
      p_offset: offset,
    });
    if (rpc.error) {
      const msg = String(rpc.error.message || '').toLowerCase();
      const code = rpc.error.code;
      if (code === '42883' || msg.includes('internal_social_feed_posts') || msg.includes('does not exist')) {
        return res.status(503).json({
          error: 'Chạy migration 180_internal_social_schedule_visibility_hide_share.sql để dùng lọc bảng tin (lịch đăng, ẩn, phạm vi người xem).',
        });
      }
      throw rpc.error;
    }
    const allRows = rpc.data || [];
    const hasMore = allRows.length > limit;
    const page = hasMore ? allRows.slice(0, limit) : allRows;
    if (!page.length) {
      return res.json({ posts: [], next_offset: null, has_more: false });
    }

    const posts = await hydratePostsToResponse(page, me);

    res.json({
      posts,
      next_offset: hasMore ? offset + limit : null,
      has_more: hasMore,
    });
  } catch (e) {
    if (e.code === '42P01' || String(e.message || '').includes('internal_social_posts')) {
      return res.status(503).json({ error: 'Bảng tin chưa được tạo trên database. Chạy migration 175_internal_social_feed.sql.' });
    }
    if (String(e.message || '').includes('internal_social_attachments')) {
      return res.status(503).json({ error: 'Chạy migration 176_internal_social_attachments.sql để dùng đính kèm file.' });
    }
    console.error('GET /internal-social/posts:', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/internal-social/posts/:id — một bài (chia sẻ link / mở sâu) */
r.get('/posts/:id', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const me = req.user.userId || req.user.id;
    const [full] = await hydratePostsToResponse([gate.post], me);
    res.json({ post: full });
  } catch (e) {
    console.error('GET /internal-social/posts/:id:', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/internal-social/posts/:id/comments */
r.get('/posts/:id/comments', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

    const me = req.user.userId || req.user.id;
    let list = [];
    const q = await supabase
      .from('internal_social_comments')
      .select('id, post_id, author_id, body, created_at, parent_id')
      .eq('post_id', req.params.id)
      .order('created_at', { ascending: true });
    if (q.error) {
      const msg = String(q.error.message || '').toLowerCase();
      const missingParent = q.error.code === '42703' || (msg.includes('parent_id') && msg.includes('column'));
      if (missingParent) {
        const q2 = await supabase
          .from('internal_social_comments')
          .select('id, post_id, author_id, body, created_at')
          .eq('post_id', req.params.id)
          .order('created_at', { ascending: true });
        if (q2.error) throw q2.error;
        list = (q2.data || []).map((c) => ({ ...c, parent_id: null }));
      } else throw q.error;
    } else {
      list = q.data || [];
    }

    const authorMap = await fetchUsersByIds(list.map((c) => c.author_id));
    const withAuthors = list.map((c) => ({
      ...c,
      author: authorMap.get(c.author_id) || { id: c.author_id, full_name: null, email: null, role: null },
    }));
    const comments = await enrichCommentsWithReactions(withAuthors, me);
    res.json({ comments });
  } catch (e) {
    console.error('GET /internal-social/posts/:id/comments:', e);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/internal-social/posts/:id/reactions — tổng cảm xúc + danh sách người thả */
r.get('/posts/:id/reactions', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const postId = req.params.id;
    const me = req.user.userId || req.user.id;
    const rows = await fetchLikeRowsWithReactionFallback([postId]);
    const postRows = rows.filter((r) => String(r.post_id) === String(postId));
    const rx = reactionsFromRows(postRows, me);
    const userIds = [...new Set(postRows.map((r) => r.user_id))];
    const authorMap = await fetchUsersByIds(userIds);
    const reactors = postRows
      .map((r) => ({
        user_id: r.user_id,
        reaction: reactionKeyFromLikeRow(r),
        created_at: r.created_at || null,
        user: authorMap.get(r.user_id) || { id: r.user_id, full_name: null, email: null, role: null },
      }))
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
    res.json({
      like_count: rx.like_count,
      reaction_counts: rx.reaction_counts,
      my_reaction: rx.my_reaction,
      liked_by_me: rx.liked_by_me,
      reactors,
    });
  } catch (e) {
    console.error('GET /internal-social/posts/:id/reactions:', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/internal-social/posts */
r.post('/posts', async (req, res) => {
  try {
    const companyId = resolveCreateCompanyId(req, res);
    if (!companyId) return;

    const body = String(req.body?.body ?? '').trim();
    if (body.length > MAX_BODY) return res.status(400).json({ error: `Nội dung tối đa ${MAX_BODY} ký tự` });

    const link_url = strTrimField(req.body?.link_url, 2000);
    const link_title = strTrimField(req.body?.link_title, 500);
    const image_url = strTrimField(req.body?.image_url, 2000);
    const video_url = strTrimField(req.body?.video_url, 2000);
    const atts = normalizeAttachments(req.body?.attachments);

    if (!body && !atts.length && !image_url && !video_url && !link_url) {
      return res.status(400).json({ error: 'Cần nội dung, file đính kèm, ảnh, video hoặc liên kết' });
    }

    const authorId = req.user.userId || req.user.id;
    const visibility = parseVisibility(req.body?.visibility);
    const audienceIdsRaw = parseAudienceUserIds(req.body);
    if (visibility === 'selected_users' && !audienceIdsRaw.length) {
      return res.status(400).json({ error: 'Chọn ít nhất một nhân viên được xem bài.' });
    }
    const audienceForValidation = [...new Set([...audienceIdsRaw.map(String), String(authorId)])];
    if (visibility === 'selected_users') {
      const v = await validateUsersInCompany(audienceForValidation, companyId);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }

    let audienceCompanyIdsRaw = [];
    if (visibility === 'selected_companies') {
      if (!canModerate(req) && !isCrmSystemAdminUser(req.user)) {
        return res.status(403).json({ error: 'Chỉ quản lý hoặc admin mới được chia sẻ bài cho nhiều công ty.' });
      }
      audienceCompanyIdsRaw = parseAudienceCompanyIds(req.body)
        .filter((cid) => String(cid) !== String(companyId));
      if (!audienceCompanyIdsRaw.length) {
        return res.status(400).json({ error: 'Chọn ít nhất một công ty (ngoài công ty gốc) để chia sẻ bài.' });
      }
      const cv = await validateCompanyIds(audienceCompanyIdsRaw);
      if (!cv.ok) return res.status(400).json({ error: cv.error });
    }

    const publishedAt = parsePublishedAtForCreate(req.body);

    const insertPayload = {
      company_id: companyId,
      author_id: authorId,
      body: body || '',
      link_url: link_url || null,
      link_title: link_title || null,
      image_url: image_url || null,
      published_at: publishedAt,
      visibility,
    };
    if (video_url) insertPayload.video_url = video_url;

    const { data, error } = await supabase
      .from('internal_social_posts')
      .insert(insertPayload)
      .select('id, company_id, author_id, body, link_url, link_title, image_url, video_url, created_at, updated_at, deleted_at, published_at, visibility, hidden_at')
      .single();
    if (error) throw error;

    await replacePostAudience(data.id, visibility, audienceIdsRaw, authorId);
    const compHint = await replacePostCompanies(data.id, visibility, audienceCompanyIdsRaw, companyId);
    if (compHint?.hint) {
      return res.status(503).json({ error: compHint.hint });
    }

    let savedAttachments = [];
    if (atts.length) {
      const rows = atts.map((a, i) => ({
        post_id: data.id,
        file_url: a.file_url,
        file_name: a.file_name,
        mime_type: a.mime_type,
        file_size: a.file_size,
        sort_index: i,
      }));
      const { data: insAtt, error: aerr } = await supabase
        .from('internal_social_attachments')
        .insert(rows)
        .select('id, post_id, file_url, file_name, mime_type, file_size, sort_index');
      if (aerr) {
        await supabase.from('internal_social_posts').delete().eq('id', data.id);
        throw aerr;
      }
      savedAttachments = insAtt || [];
    }

    const me = req.user.userId || req.user.id;
    const { data: fullRow, error: refErr } = await supabase
      .from('internal_social_posts')
      .select('id, company_id, author_id, body, link_url, link_title, image_url, video_url, created_at, updated_at, deleted_at, published_at, visibility, hidden_at')
      .eq('id', data.id)
      .single();
    if (refErr) throw refErr;
    const [postOut] = await hydratePostsToResponse([fullRow], me);
    emitNotifyBadge(req.app, 'social', { company_id: companyId });
    res.status(201).json({ post: { ...postOut, attachments: savedAttachments } });
  } catch (e) {
    console.error('POST /internal-social/posts:', e);
    const msg = e.message || '';
    if (msg.includes('internal_social_attachments') || e.code === '42P01') {
      return res.status(503).json({ error: 'Chạy migration 176_internal_social_attachments.sql để đính kèm file.' });
    }
    if (msg.includes('video_url') || (String(e.message || '').includes('column') && msg.includes('video_url'))) {
      return res.status(503).json({ error: 'Chạy migration 179_internal_social_posts_video_url.sql để dùng URL video.' });
    }
    if (msg.includes('published_at') || msg.includes('visibility') || msg.includes('hidden_at')) {
      return res.status(503).json({ error: 'Chạy migration 180_internal_social_schedule_visibility_hide_share.sql để dùng lịch đăng và phạm vi hiển thị.' });
    }
    if (msg.includes('internal_social_posts_visibility_chk') || msg.includes('selected_companies')) {
      return res.status(503).json({ error: 'Chạy migration 200_internal_social_post_companies.sql để chia sẻ bài cho nhiều công ty.' });
    }
    res.status(500).json({ error: e.message });
  }
});

/** PUT /api/internal-social/posts/:id — sửa nội dung, liên kết, URL ảnh/video, đính kèm (gửi `attachments` = mảng mới để thay toàn bộ) */
r.put('/posts/:id', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const postId = req.params.id;
    const me = req.user.userId || req.user.id;
    if (!sameUserId(gate.post.author_id, me) && !canModerate(req)) {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc quản lý mới sửa được bài này' });
    }

    const body = String(req.body?.body ?? '').trim();
    if (body.length > MAX_BODY) return res.status(400).json({ error: `Nội dung tối đa ${MAX_BODY} ký tự` });

    const link_url = strTrimField(req.body?.link_url, 2000);
    const link_title = strTrimField(req.body?.link_title, 500);
    const image_url = strTrimField(req.body?.image_url, 2000);
    const video_url = strTrimField(req.body?.video_url, 2000);
    const atts = normalizeAttachments(req.body?.attachments);

    if (!body && !atts.length && !image_url && !video_url && !link_url) {
      return res.status(400).json({ error: 'Cần nội dung, file đính kèm, ảnh, video hoặc liên kết' });
    }

    const updateRow = {
      body: body || '',
      link_url: link_url || null,
      link_title: link_title || null,
      image_url: image_url || null,
      updated_at: new Date().toISOString(),
    };
    if (req.body?.video_url !== undefined) updateRow.video_url = video_url || null;
    if (req.body?.visibility !== undefined) updateRow.visibility = parseVisibility(req.body.visibility);
    const pubUpd = parsePublishedAtForUpdate(req.body);
    if (pubUpd !== undefined) updateRow.published_at = pubUpd;

    const { data: row, error } = await supabase
      .from('internal_social_posts')
      .update(updateRow)
      .eq('id', postId)
      .select('id, company_id, author_id, body, link_url, link_title, image_url, video_url, created_at, updated_at, deleted_at, published_at, visibility, hidden_at')
      .single();
    if (error) throw error;

    if (
      req.body?.visibility !== undefined
      || Array.isArray(req.body?.audience_user_ids)
      || Array.isArray(req.body?.audience_company_ids)
    ) {
      const vis = row.visibility || 'company';
      if (vis === 'selected_users') {
        const list = Array.isArray(req.body?.audience_user_ids)
          ? parseAudienceUserIds(req.body)
          : await fetchAudienceUserIds(postId);
        if (!list.length) {
          return res.status(400).json({ error: 'Chọn ít nhất một nhân viên được xem bài.' });
        }
        const merged = [...new Set([...list.map(String), String(row.author_id)])];
        const v = await validateUsersInCompany(merged, row.company_id);
        if (!v.ok) return res.status(400).json({ error: v.error });
        await replacePostAudience(postId, vis, list, row.author_id);
        await replacePostCompanies(postId, vis, [], row.company_id);
      } else if (vis === 'selected_companies') {
        if (!canModerate(req) && !isCrmSystemAdminUser(req.user)) {
          return res.status(403).json({ error: 'Chỉ quản lý hoặc admin mới được chia sẻ bài cho nhiều công ty.' });
        }
        const list = (Array.isArray(req.body?.audience_company_ids)
          ? parseAudienceCompanyIds(req.body)
          : await fetchPostExtraCompanyIds(postId))
          .filter((cid) => String(cid) !== String(row.company_id));
        if (!list.length) {
          return res.status(400).json({ error: 'Chọn ít nhất một công ty (ngoài công ty gốc) để chia sẻ bài.' });
        }
        const cv = await validateCompanyIds(list);
        if (!cv.ok) return res.status(400).json({ error: cv.error });
        await replacePostAudience(postId, vis, [], row.author_id);
        const compHint = await replacePostCompanies(postId, vis, list, row.company_id);
        if (compHint?.hint) return res.status(503).json({ error: compHint.hint });
      } else {
        await replacePostAudience(postId, 'company', [], row.author_id);
        await replacePostCompanies(postId, 'company', [], row.company_id);
      }
    }

    if (Array.isArray(req.body.attachments)) {
      await supabase.from('internal_social_attachments').delete().eq('post_id', postId);
      if (atts.length) {
        const rows = atts.map((a, i) => ({
          post_id: postId,
          file_url: a.file_url,
          file_name: a.file_name,
          mime_type: a.mime_type,
          file_size: a.file_size,
          sort_index: i,
        }));
        const { error: aerr } = await supabase.from('internal_social_attachments').insert(rows);
        if (aerr) throw aerr;
      }
    }

    const { data: fullRow, error: refErr } = await supabase
      .from('internal_social_posts')
      .select('id, company_id, author_id, body, link_url, link_title, image_url, video_url, created_at, updated_at, deleted_at, published_at, visibility, hidden_at')
      .eq('id', postId)
      .single();
    if (refErr) throw refErr;
    const [postOut] = await hydratePostsToResponse([fullRow], me);
    res.json({ post: postOut });
  } catch (e) {
    console.error('PUT /internal-social/posts/:id:', e);
    const msg = e.message || '';
    if (msg.includes('video_url') || (String(e.message || '').includes('column') && msg.includes('video_url'))) {
      return res.status(503).json({ error: 'Chạy migration 179_internal_social_posts_video_url.sql để dùng URL video.' });
    }
    if (msg.includes('internal_social_posts_visibility_chk') || msg.includes('selected_companies')) {
      return res.status(503).json({ error: 'Chạy migration 200_internal_social_post_companies.sql để chia sẻ bài cho nhiều công ty.' });
    }
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/internal-social/posts/:id/hide-company — ẩn bài với toàn công ty */
r.post('/posts/:id/hide-company', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const postId = req.params.id;
    const me = req.user.userId || req.user.id;
    if (!sameUserId(gate.post.author_id, me) && !canModerate(req)) {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc quản lý mới ẩn được bài này.' });
    }
    const { error } = await supabase
      .from('internal_social_posts')
      .update({ hidden_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /internal-social/posts/:id/hide-company:', e);
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /api/internal-social/posts/:id/hide-company — hiện lại bài trên bảng tin */
r.delete('/posts/:id/hide-company', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const postId = req.params.id;
    const me = req.user.userId || req.user.id;
    if (!sameUserId(gate.post.author_id, me) && !canModerate(req)) {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc quản lý mới gỡ ẩn được bài này.' });
    }
    const { error } = await supabase
      .from('internal_social_posts')
      .update({ hidden_at: null, updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /internal-social/posts/:id/hide-company:', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/internal-social/posts/:id/hide-for-me — ẩn khỏi bảng tin của tôi */
r.post('/posts/:id/hide-for-me', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const postId = req.params.id;
    const me = req.user.userId || req.user.id;
    const { error } = await supabase.from('internal_social_post_user_hides').insert({ post_id: postId, user_id: me });
    if (error && error.code !== '23505') throw error;
    res.json({ ok: true });
  } catch (e) {
    const msg = String(e.message || '').toLowerCase();
    if (e.code === '42P01' || msg.includes('internal_social_post_user_hides')) {
      return res.status(503).json({ error: 'Chạy migration 180_internal_social_schedule_visibility_hide_share.sql.' });
    }
    console.error('POST /internal-social/posts/:id/hide-for-me:', e);
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /api/internal-social/posts/:id/hide-for-me */
r.delete('/posts/:id/hide-for-me', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const postId = req.params.id;
    const me = req.user.userId || req.user.id;
    const { error } = await supabase
      .from('internal_social_post_user_hides')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', me);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /internal-social/posts/:id/hide-for-me:', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/internal-social/posts/:id/like — body: { reaction?: 'like'|'love'|... }; cùng reaction lần nữa = bỏ thích */
r.post('/posts/:id/like', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const postId = req.params.id;
    const me = req.user.userId || req.user.id;
    const reaction = normalizeReaction(req.body);

    let existing = null;
    const selRx = await supabase
      .from('internal_social_likes')
      .select('post_id, reaction')
      .eq('post_id', postId)
      .eq('user_id', me)
      .maybeSingle();
    if (selRx.error) {
      const msg = String(selRx.error.message || '').toLowerCase();
      const missingReaction =
        selRx.error.code === '42703'
        || (msg.includes('reaction') && (msg.includes('does not exist') || msg.includes('unknown column')));
      if (missingReaction) {
        const selPlain = await supabase
          .from('internal_social_likes')
          .select('post_id')
          .eq('post_id', postId)
          .eq('user_id', me)
          .maybeSingle();
        if (selPlain.error) throw selPlain.error;
        existing = selPlain.data ? { post_id: selPlain.data.post_id, reaction: 'like' } : null;
      } else {
        throw selRx.error;
      }
    } else {
      existing = selRx.data;
    }

    if (existing) {
      const cur = String(existing.reaction || 'like').toLowerCase();
      if (cur === reaction) {
        const { error: delErr } = await supabase.from('internal_social_likes').delete().eq('post_id', postId).eq('user_id', me);
        if (delErr) throw delErr;
      } else {
        const { error: upErr } = await supabase
          .from('internal_social_likes')
          .update({ reaction })
          .eq('post_id', postId)
          .eq('user_id', me);
        if (upErr) throw upErr;
      }
    } else {
      const { error: insErr } = await supabase.from('internal_social_likes').insert({ post_id: postId, user_id: me, reaction });
      if (insErr) throw insErr;
    }

    const payload = await reactionPayloadForPost(postId, me);
    res.json({ ...payload, liked: payload.liked_by_me });
  } catch (e) {
    if (String(e.message || '').includes('reaction') || String(e.message || '').includes('column')) {
      return res.status(503).json({ error: 'Chạy migration 177_internal_social_like_reactions.sql để dùng cảm xúc.' });
    }
    console.error('POST /internal-social/posts/:id/like:', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/internal-social/posts/:id/comments — body: { body, parent_id? } */
r.post('/posts/:id/comments', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const postId = req.params.id;
    const text = String(req.body?.body ?? '').trim();
    if (!text) return res.status(400).json({ error: 'Nội dung bình luận không được để trống' });
    if (text.length > MAX_COMMENT) return res.status(400).json({ error: `Bình luận tối đa ${MAX_COMMENT} ký tự` });

    const parentRaw = req.body?.parent_id != null ? String(req.body.parent_id).trim() : '';
    const parentId = parentRaw || null;

    if (parentId) {
      const { data: par, error: perr } = await supabase
        .from('internal_social_comments')
        .select('id, post_id')
        .eq('id', parentId)
        .maybeSingle();
      if (perr) throw perr;
      if (!par || String(par.post_id) !== String(postId)) {
        return res.status(400).json({ error: 'Bình luận được trả lời không hợp lệ.' });
      }
    }

    const authorId = req.user.userId || req.user.id;
    const insertRow = { post_id: postId, author_id: authorId, body: text };
    if (parentId) insertRow.parent_id = parentId;

    let ins = await supabase
      .from('internal_social_comments')
      .insert(insertRow)
      .select('id, post_id, author_id, body, created_at, parent_id')
      .single();
    if (ins.error && parentId && (String(ins.error.message || '').includes('parent_id') || ins.error.code === '42703')) {
      return res.status(503).json({ error: 'Chạy migration 178_internal_social_comment_thread_reactions.sql để trả lời bình luận.' });
    }
    if (ins.error) throw ins.error;
    const data = ins.data;

    const me = req.user.userId || req.user.id;
    const authorMap = await fetchUsersByIds([authorId]);
    const [enriched] = await enrichCommentsWithReactions(
      [{ ...data, author: authorMap.get(authorId) || { id: authorId, full_name: null, email: null, role: null } }],
      me,
    );
    const { count, error: cErr } = await supabase.from('internal_social_comments').select('*', { count: 'exact', head: true }).eq('post_id', postId);
    if (cErr) throw cErr;
    res.status(201).json({
      comment: enriched,
      comment_count: count ?? 0,
    });
  } catch (e) {
    console.error('POST /internal-social/posts/:id/comments:', e);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/internal-social/posts/:postId/comments/:commentId/reaction — body: { reaction? } */
r.post('/posts/:postId/comments/:commentId/reaction', async (req, res) => {
  try {
    const postId = req.params.postId;
    const commentId = req.params.commentId;
    const gate = await getPostForUser(req, postId);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

    const { data: co, error: coErr } = await supabase
      .from('internal_social_comments')
      .select('id, post_id')
      .eq('id', commentId)
      .maybeSingle();
    if (coErr) throw coErr;
    if (!co || String(co.post_id) !== String(postId)) {
      return res.status(404).json({ error: 'Không tìm thấy bình luận' });
    }

    const me = req.user.userId || req.user.id;
    const reaction = normalizeReaction(req.body);

    let existing = null;
    const selRx = await supabase
      .from('internal_social_comment_reactions')
      .select('comment_id, reaction')
      .eq('comment_id', commentId)
      .eq('user_id', me)
      .maybeSingle();
    if (selRx.error) {
      const msg = String(selRx.error.message || '').toLowerCase();
      const missing =
        selRx.error.code === '42P01'
        || (msg.includes('internal_social_comment_reactions') && (msg.includes('does not exist') || msg.includes('not find')));
      if (missing) {
        return res.status(503).json({ error: 'Chạy migration 178_internal_social_comment_thread_reactions.sql để dùng cảm xúc bình luận.' });
      }
      throw selRx.error;
    }
    existing = selRx.data;

    if (existing) {
      const cur = String(existing.reaction || 'like').toLowerCase();
      if (cur === reaction) {
        const { error: delErr } = await supabase
          .from('internal_social_comment_reactions')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', me);
        if (delErr) throw delErr;
      } else {
        const { error: upErr } = await supabase
          .from('internal_social_comment_reactions')
          .update({ reaction })
          .eq('comment_id', commentId)
          .eq('user_id', me);
        if (upErr) throw upErr;
      }
    } else {
      const { error: insErr } = await supabase
        .from('internal_social_comment_reactions')
        .insert({ comment_id: commentId, user_id: me, reaction });
      if (insErr) throw insErr;
    }

    const payload = await reactionPayloadForComment(commentId, me);
    res.json({ comment_id: commentId, ...payload });
  } catch (e) {
    console.error('POST /internal-social/posts/:postId/comments/:commentId/reaction:', e);
    res.status(500).json({ error: e.message });
  }
});

/** DELETE /api/internal-social/posts/:id */
r.delete('/posts/:id', async (req, res) => {
  try {
    const gate = await getPostForUser(req, req.params.id);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const postId = req.params.id;
    const me = req.user.userId || req.user.id;
    const post = gate.post;

    if (!sameUserId(post.author_id, me) && !canModerate(req)) {
      return res.status(403).json({ error: 'Chỉ tác giả hoặc quản lý mới xóa được bài này' });
    }

    const { error } = await supabase
      .from('internal_social_posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /internal-social/posts/:id:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
