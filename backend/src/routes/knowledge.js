const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isAdminLike, isSystemAdmin } = require('../helpers/adminRole');

const r = Router();
r.use(auth);

const LESSON_SELECT = `*, category:knowledge_categories(id, name, slug, icon, company_id),
  creator:users!knowledge_lessons_created_by_fkey(id, full_name)`;

function canManage(req) {
  return isAdminLike(req.user);
}

function userRole(req) {
  return String(req.user?.role ?? '').trim().toLowerCase();
}

function lessonVisibleToUser(lesson, req) {
  if (!lesson.is_published && !canManage(req)) return false;
  const roles = lesson.target_roles;
  if (!roles || !Array.isArray(roles) || roles.length === 0) return true;
  return roles.map((x) => String(x).toLowerCase()).includes(userRole(req));
}

function categoryVisible(cat, companyId) {
  if (!cat.is_active) return false;
  if (cat.company_id == null) return true;
  if (!companyId) return true;
  return String(cat.company_id) === String(companyId);
}

function buildCategoryTree(flat, parentId = null) {
  return flat
    .filter((c) => (c.parent_id || null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      ...c,
      children: buildCategoryTree(flat, c.id),
    }));
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'danh-muc';
}

function extractYoutubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=))([^?&]+)/);
  return m ? m[1] : null;
}

// ════════════════════════════════════════════════════════════════════════
// CERTIFICATE HELPERS
// ════════════════════════════════════════════════════════════════════════

// Lấy danh sách bài học "đủ điều kiện" của 1 danh mục cho 1 user (theo role).
async function getCategoryLessonsForUser(categoryId, userObj) {
  const { data: lessons } = await supabase
    .from('knowledge_lessons')
    .select('id, target_roles, is_published')
    .eq('category_id', categoryId)
    .eq('is_published', true);
  const role = String(userObj?.role ?? '').trim().toLowerCase();
  return (lessons || []).filter((l) => {
    const roles = l.target_roles;
    if (!roles || !Array.isArray(roles) || roles.length === 0) return true;
    return roles.map((x) => String(x).toLowerCase()).includes(role);
  });
}

// Tính số bài đã hoàn thành + thống kê bài tập cho 1 user trong 1 danh mục.
async function getCategoryProgressStats(categoryId, userId, userObj) {
  const lessons = await getCategoryLessonsForUser(categoryId, userObj);
  const lessonIds = lessons.map((l) => l.id);
  if (!lessonIds.length) {
    return {
      lessons, lessonIds, completedLessons: 0, totalLessons: 0,
      exerciseStats: { total: 0, passed: 0, avgScore: null, pendingIds: [] },
    };
  }

  const { data: prog } = await supabase
    .from('knowledge_lesson_progress')
    .select('lesson_id, status')
    .eq('user_id', userId)
    .in('lesson_id', lessonIds);
  const completedSet = new Set((prog || []).filter((p) => p.status === 'completed').map((p) => p.lesson_id));

  const { data: exs } = await supabase
    .from('knowledge_exercises')
    .select('id')
    .in('lesson_id', lessonIds);
  const exIds = (exs || []).map((e) => e.id);

  let exerciseStats = { total: exIds.length, passed: 0, avgScore: null, pendingIds: [] };
  if (exIds.length) {
    const { data: subs } = await supabase
      .from('knowledge_exercise_submissions')
      .select('exercise_id, status, score, submitted_at')
      .eq('user_id', userId)
      .in('exercise_id', exIds);
    // best score per exercise
    const best = new Map();
    (subs || []).forEach((s) => {
      const prev = best.get(s.exercise_id);
      if (!prev || (s.score ?? -1) > (prev.score ?? -1)) best.set(s.exercise_id, s);
    });
    const passedSet = new Set();
    [...best.values()].forEach((s) => { if (s.status === 'passed') passedSet.add(s.exercise_id); });
    exerciseStats.passed = passedSet.size;
    exerciseStats.pendingIds = exIds.filter((id) => !passedSet.has(id));
    const withScore = [...best.values()].filter((s) => s.score != null);
    if (withScore.length) {
      exerciseStats.avgScore = Math.round((withScore.reduce((a, b) => a + Number(b.score), 0) / withScore.length) * 100) / 100;
    }
  }

  return {
    lessons,
    lessonIds,
    completedLessons: completedSet.size,
    totalLessons: lessons.length,
    exerciseStats,
  };
}

// Đánh giá khả năng cấp chứng nhận. Trả về { eligible, reason, stats, category }.
// Tách riêng để cả tryIssueCertificate và /progress dùng chung.
async function evaluateCertificateEligibility(userId, categoryId, userObj) {
  const { data: category } = await supabase
    .from('knowledge_categories')
    .select('id, name, icon, badge_image_url, require_all_exercises_passed, certificate_template, company_id')
    .eq('id', categoryId)
    .maybeSingle();
  if (!category) {
    return { eligible: false, reason: 'Khoá học không tồn tại', stats: null, category: null };
  }

  const stats = await getCategoryProgressStats(categoryId, userId, userObj);
  if (stats.totalLessons === 0) {
    return { eligible: false, reason: 'Khoá học chưa có bài học nào', stats, category };
  }
  if (stats.completedLessons < stats.totalLessons) {
    return {
      eligible: false,
      reason: `Bạn mới hoàn thành ${stats.completedLessons}/${stats.totalLessons} bài học`,
      stats, category,
    };
  }
  // Mặc định: yêu cầu đạt hết bài tập trong khoá (cờ require_all_exercises_passed)
  const requireExs = category.require_all_exercises_passed !== false;
  if (requireExs && stats.exerciseStats.total > 0 && stats.exerciseStats.passed < stats.exerciseStats.total) {
    return {
      eligible: false,
      reason: `Bạn cần đạt thêm ${stats.exerciseStats.total - stats.exerciseStats.passed}/${stats.exerciseStats.total} bài tập`,
      stats, category,
    };
  }
  return { eligible: true, reason: null, stats, category };
}

// Kiểm tra & cấp chứng nhận nếu đủ điều kiện.
// Idempotent (UNIQUE user_id, category_id). Trả về certificate vừa cấp hoặc null.
async function tryIssueCertificate(userId, categoryId, userObj) {
  if (!userId || !categoryId) return null;

  const { data: existing } = await supabase
    .from('knowledge_certificates')
    .select('id, status')
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .maybeSingle();
  if (existing) return null;

  const evalResult = await evaluateCertificateEligibility(userId, categoryId, userObj);
  if (!evalResult.eligible) return null;
  const { stats, category: cat } = evalResult;

  const { data: usr } = await supabase
    .from('users')
    .select('id, full_name, email, role, company_id, department_id')
    .eq('id', userId)
    .single();

  const { data: numRow } = await supabase.rpc('knowledge_next_certificate_number');
  const { data: codeRow } = await supabase.rpc('knowledge_random_verify_code');
  const certificate_number = numRow || `CN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const verify_code = codeRow || Math.random().toString(36).slice(2, 12).toUpperCase();

  const insert = {
    user_id: userId,
    category_id: categoryId,
    certificate_number,
    verify_code,
    total_lessons: stats.totalLessons,
    completed_lessons: stats.completedLessons,
    avg_exercise_score: stats.exerciseStats.avgScore,
    passed_exercises: stats.exerciseStats.passed,
    total_exercises: stats.exerciseStats.total,
    badge_image_url: cat?.badge_image_url || null,
    metadata: {
      full_name: usr?.full_name || null,
      email: usr?.email || null,
      role: usr?.role || null,
      company_id: usr?.company_id || null,
      department_id: usr?.department_id || null,
      category_name: cat?.name || null,
      category_icon: cat?.icon || null,
      badge_image_url: cat?.badge_image_url || null,
      certificate_template: cat?.certificate_template || null,
    },
  };

  const { data, error } = await supabase
    .from('knowledge_certificates')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') return null; // race condition — đã có rồi
    // Fallback: nếu DB chưa chạy migration 260 → bỏ cột badge_image_url và thử lại
    if (error.code === '42703' && /badge_image_url/i.test(error.message || '')) {
      const { badge_image_url: _b, ...legacy } = insert;
      const { data: retry, error: retryErr } = await supabase
        .from('knowledge_certificates')
        .insert(legacy)
        .select('*')
        .single();
      if (retryErr) {
        console.error('issue certificate (legacy) error', retryErr);
        return null;
      }
      return retry;
    }
    console.error('issue certificate error', error);
    return null;
  }
  return data;
}

// Wrapper an toàn — không bao giờ ném lỗi, dùng trong các route bất kỳ.
async function maybeIssueCertificateForLesson(req, lessonId) {
  try {
    const { data: lesson } = await supabase
      .from('knowledge_lessons')
      .select('category_id')
      .eq('id', lessonId)
      .maybeSingle();
    if (!lesson?.category_id) return null;
    return await tryIssueCertificate(req.user.userId, lesson.category_id, req.user);
  } catch (e) {
    console.error('maybeIssueCertificateForLesson failed', e);
    return null;
  }
}

function gradeQuiz(questions, answers) {
  const items = questions?.items || [];
  if (!items.length) return { score: 100, passed: true, details: [] };

  let correct = 0;
  const details = items.map((q) => {
    const userAns = answers?.[q.id];
    const correctAns = q.correct || [];
    let ok = false;
    if (q.type === 'single') {
      ok = userAns === correctAns[0] || userAns === String(correctAns[0]);
    } else if (q.type === 'multiple') {
      const ua = Array.isArray(userAns) ? userAns.map(Number).sort() : [];
      const ca = [...correctAns].map(Number).sort();
      ok = JSON.stringify(ua) === JSON.stringify(ca);
    } else if (q.type === 'checklist') {
      ok = !!userAns;
    }
    if (ok) correct += 1;
    return { id: q.id, correct: ok };
  });

  const score = Math.round((correct / items.length) * 100);
  return { score, passed: score >= 70, details };
}

// GET /knowledge/categories
r.get('/categories', async (req, res) => {
  try {
    const { all } = req.query;
    const companyId = req.user.company_id || null;
    let q = supabase.from('knowledge_categories').select('*').order('sort_order');
    if (!all || !canManage(req)) {
      q = q.eq('is_active', true);
    }
    const { data, error } = await q;
    if (error) throw error;
    const filtered = (data || []).filter((c) => categoryVisible(c, companyId) || (all && canManage(req)));
    res.json({ categories: buildCategoryTree(filtered), flat: filtered });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/categories
r.post('/categories', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const {
      name, slug, description, icon, parent_id, sort_order, company_id, is_active,
      badge_image_url, require_all_exercises_passed, certificate_template,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên danh mục là bắt buộc' });
    const insert = {
      name,
      slug: slug || slugify(name),
      description: description || null,
      icon: icon || '📚',
      parent_id: parent_id || null,
      sort_order: sort_order ?? 0,
      company_id: company_id ?? req.user.company_id ?? null,
      is_active: is_active !== false,
      created_by: req.user.userId,
    };
    if (badge_image_url !== undefined) insert.badge_image_url = badge_image_url || null;
    if (require_all_exercises_passed !== undefined) insert.require_all_exercises_passed = !!require_all_exercises_passed;
    if (certificate_template !== undefined) insert.certificate_template = certificate_template || {};
    let { data, error } = await supabase.from('knowledge_categories').insert(insert).select().single();
    // Fallback nếu DB chưa chạy migration 260
    if (error && error.code === '42703' && /badge_image_url|require_all_exercises_passed|certificate_template/i.test(error.message || '')) {
      delete insert.badge_image_url; delete insert.require_all_exercises_passed; delete insert.certificate_template;
      ({ data, error } = await supabase.from('knowledge_categories').insert(insert).select().single());
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /knowledge/categories/:id
r.patch('/categories/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const update = { updated_at: new Date().toISOString() };
    [
      'name', 'slug', 'description', 'icon', 'parent_id', 'sort_order', 'company_id', 'is_active',
      'badge_image_url', 'require_all_exercises_passed', 'certificate_template',
    ].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    let { data, error } = await supabase.from('knowledge_categories').update(update).eq('id', req.params.id).select().single();
    if (error && error.code === '42703' && /badge_image_url|require_all_exercises_passed|certificate_template/i.test(error.message || '')) {
      delete update.badge_image_url; delete update.require_all_exercises_passed; delete update.certificate_template;
      ({ data, error } = await supabase.from('knowledge_categories').update(update).eq('id', req.params.id).select().single());
    }
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /knowledge/categories/:id
r.delete('/categories/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { error } = await supabase.from('knowledge_categories').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/lessons
r.get('/lessons', async (req, res) => {
  try {
    const { category_id, all, q: search, tag, bookmarked, required } = req.query;
    let query = supabase.from('knowledge_lessons').select(LESSON_SELECT, { count: 'exact' });
    if (category_id) query = query.eq('category_id', category_id);
    if (!all || !canManage(req)) query = query.eq('is_published', true);
    if (tag) query = query.contains('tags', [tag]);
    if (required === '1' || required === 'true') query = query.eq('is_required', true);
    query = query.order('sort_order');
    const { data, error, count } = await query;
    if (error) throw error;

    let lessons = (data || []).filter((l) => lessonVisibleToUser(l, req));
    if (search) {
      const s = String(search).toLowerCase();
      lessons = lessons.filter(
        (l) => l.title?.toLowerCase().includes(s) || l.summary?.toLowerCase().includes(s) || (l.tags || []).some((t) => t.toLowerCase().includes(s)),
      );
    }

    const lessonIds = lessons.map((l) => l.id);
    let progressMap = {};
    let bookmarkSet = new Set();
    let ratingMap = {};
    if (lessonIds.length) {
      const { data: prog } = await supabase
        .from('knowledge_lesson_progress')
        .select('lesson_id, status')
        .eq('user_id', req.user.userId)
        .in('lesson_id', lessonIds);
      progressMap = Object.fromEntries((prog || []).map((p) => [p.lesson_id, p.status]));

      const { data: bms } = await supabase
        .from('knowledge_lesson_bookmarks')
        .select('lesson_id')
        .eq('user_id', req.user.userId)
        .in('lesson_id', lessonIds);
      bookmarkSet = new Set((bms || []).map((b) => b.lesson_id));

      const { data: ratings } = await supabase
        .from('knowledge_lesson_ratings')
        .select('lesson_id, rating')
        .in('lesson_id', lessonIds);
      (ratings || []).forEach((r2) => {
        if (!ratingMap[r2.lesson_id]) ratingMap[r2.lesson_id] = { sum: 0, count: 0 };
        ratingMap[r2.lesson_id].sum += r2.rating;
        ratingMap[r2.lesson_id].count += 1;
      });
    }

    let enriched = lessons.map((l) => {
      const rm = ratingMap[l.id];
      return {
        ...l,
        progress_status: progressMap[l.id] || 'not_started',
        is_bookmarked: bookmarkSet.has(l.id),
        rating_avg: rm ? Math.round((rm.sum / rm.count) * 10) / 10 : null,
        rating_count: rm ? rm.count : 0,
      };
    });

    if (bookmarked === '1' || bookmarked === 'true') {
      enriched = enriched.filter((l) => l.is_bookmarked);
    }

    res.json({ lessons: enriched, total: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/lessons/:id
r.get('/lessons/:id', async (req, res) => {
  try {
    const { data: lesson, error } = await supabase
      .from('knowledge_lessons')
      .select(LESSON_SELECT)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!lessonVisibleToUser(lesson, req)) return res.status(404).json({ error: 'Không tìm thấy bài học' });

    const { data: exercises } = await supabase
      .from('knowledge_exercises')
      .select('id, title, instructions, type, passing_score, max_attempts, time_limit_minutes, image_url, video_url, video_type, attachments, sort_order')
      .eq('lesson_id', req.params.id)
      .order('sort_order');

    const { data: progress } = await supabase
      .from('knowledge_lesson_progress')
      .select('*')
      .eq('user_id', req.user.userId)
      .eq('lesson_id', req.params.id)
      .maybeSingle();

    await supabase.from('knowledge_lesson_progress').upsert(
      {
        user_id: req.user.userId,
        lesson_id: req.params.id,
        status: progress?.status === 'completed' ? 'completed' : 'in_progress',
        started_at: progress?.started_at || new Date().toISOString(),
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lesson_id' },
    );

    const safeExercises = canManage(req)
      ? exercises
      : (exercises || []).map(({ id, title, instructions, type, passing_score, max_attempts, time_limit_minutes, image_url, video_url, video_type, attachments, sort_order }) => ({
          id,
          title,
          instructions,
          type,
          passing_score,
          max_attempts,
          time_limit_minutes,
          image_url,
          video_url,
          video_type,
          attachments,
          sort_order,
        }));

    const { data: bookmark } = await supabase
      .from('knowledge_lesson_bookmarks')
      .select('id')
      .eq('user_id', req.user.userId)
      .eq('lesson_id', req.params.id)
      .maybeSingle();

    const { data: myRating } = await supabase
      .from('knowledge_lesson_ratings')
      .select('*')
      .eq('user_id', req.user.userId)
      .eq('lesson_id', req.params.id)
      .maybeSingle();

    const { data: ratings } = await supabase
      .from('knowledge_lesson_ratings')
      .select('rating, comment, created_at, user:users(id, full_name, avatar)')
      .eq('lesson_id', req.params.id)
      .order('created_at', { ascending: false });

    const ratingCount = (ratings || []).length;
    const ratingAvg = ratingCount ? Math.round(((ratings.reduce((a, b) => a + b.rating, 0)) / ratingCount) * 10) / 10 : null;

    res.json({
      ...lesson,
      video_embed_id: lesson.video_type === 'youtube' ? extractYoutubeId(lesson.video_url) : null,
      exercises: safeExercises || [],
      progress: progress || { status: 'in_progress' },
      is_bookmarked: !!bookmark,
      my_rating: myRating || null,
      ratings: ratings || [],
      rating_avg: ratingAvg,
      rating_count: ratingCount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/lessons
r.post('/lessons', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    if (!b.title || !b.category_id) return res.status(400).json({ error: 'Tiêu đề và danh mục là bắt buộc' });
    const insert = {
      category_id: b.category_id,
      title: b.title,
      summary: b.summary || null,
      content_md: b.content_md || null,
      cover_image_url: b.cover_image_url || null,
      video_url: b.video_url || null,
      video_type: b.video_type || null,
      duration_minutes: b.duration_minutes || null,
      attachments: Array.isArray(b.attachments) ? b.attachments : [],
      tags: Array.isArray(b.tags) ? b.tags : [],
      is_required: !!b.is_required,
      sort_order: b.sort_order ?? 0,
      is_published: !!b.is_published,
      target_roles: b.target_roles || [],
      created_by: req.user.userId,
    };
    if (insert.is_published) insert.published_at = new Date().toISOString();
    const { data, error } = await supabase.from('knowledge_lessons').insert(insert).select(LESSON_SELECT).single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /knowledge/lessons/:id
r.patch('/lessons/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    [
      'title',
      'summary',
      'content_md',
      'cover_image_url',
      'video_url',
      'video_type',
      'duration_minutes',
      'attachments',
      'tags',
      'is_required',
      'sort_order',
      'is_published',
      'target_roles',
      'category_id',
    ].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (b.is_published === true) {
      const { data: existing } = await supabase
        .from('knowledge_lessons')
        .select('published_at')
        .eq('id', req.params.id)
        .single();
      if (!existing?.published_at) update.published_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('knowledge_lessons')
      .update(update)
      .eq('id', req.params.id)
      .select(LESSON_SELECT)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /knowledge/lessons/:id
r.delete('/lessons/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { error } = await supabase.from('knowledge_lessons').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/lessons/:id/complete
r.post('/lessons/:id/complete', async (req, res) => {
  try {
    const { data: lesson } = await supabase.from('knowledge_lessons').select('is_published, target_roles, category_id').eq('id', req.params.id).single();
    if (!lesson || !lessonVisibleToUser(lesson, req)) return res.status(404).json({ error: 'Không tìm thấy' });
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('knowledge_lesson_progress')
      .upsert(
        {
          user_id: req.user.userId,
          lesson_id: req.params.id,
          status: 'completed',
          completed_at: now,
          last_viewed_at: now,
        },
        { onConflict: 'user_id,lesson_id' },
      )
      .select()
      .single();
    if (error) throw error;

    const newCert = lesson.category_id
      ? await tryIssueCertificate(req.user.userId, lesson.category_id, req.user)
      : null;

    res.json({ ...data, certificate_issued: newCert || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/my-progress
r.get('/my-progress', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_lesson_progress')
      .select('*, lesson:knowledge_lessons(id, title, category_id)')
      .eq('user_id', req.user.userId)
      .order('last_viewed_at', { ascending: false });
    if (error) throw error;
    const completed = (data || []).filter((p) => p.status === 'completed').length;
    res.json({ progress: data || [], completed, total: (data || []).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/exercises/:id
r.get('/exercises/:id', async (req, res) => {
  try {
    const { data: ex, error } = await supabase
      .from('knowledge_exercises')
      .select('*, lesson:knowledge_lessons(id, is_published, target_roles)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!lessonVisibleToUser(ex.lesson, req)) return res.status(404).json({ error: 'Không tìm thấy' });

    const { count } = await supabase
      .from('knowledge_exercise_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('exercise_id', req.params.id)
      .eq('user_id', req.user.userId);

    const payload = { ...ex };
    if (!canManage(req) && ex.type === 'quiz') {
      const items = (ex.questions?.items || []).map(({ id, question, type, options, image_url }) => ({
        id,
        question,
        type,
        options,
        ...(image_url ? { image_url } : {}),
      }));
      payload.questions = { items };
    }
    const ytId = extractYoutubeId(ex.video_url);
    if (ytId) {
      payload.video_embed_id = ytId;
      if (!payload.video_type) payload.video_type = 'youtube';
    }
    payload.attempt_count = count || 0;
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/exercises
r.post('/exercises', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    if (!b.lesson_id || !b.title) return res.status(400).json({ error: 'lesson_id và title là bắt buộc' });
    const { data, error } = await supabase
      .from('knowledge_exercises')
      .insert({
        lesson_id: b.lesson_id,
        title: b.title,
        instructions: b.instructions || null,
        type: b.type || 'quiz',
        questions: b.questions || { items: [] },
        passing_score: b.passing_score ?? 70,
        max_attempts: b.max_attempts ?? null,
        time_limit_minutes: b.time_limit_minutes ?? null,
        image_url: b.image_url || null,
        video_url: b.video_url || null,
        video_type: b.video_type || null,
        attachments: Array.isArray(b.attachments) ? b.attachments : [],
        sort_order: b.sort_order ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /knowledge/exercises/:id
r.patch('/exercises/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const update = { updated_at: new Date().toISOString() };
    ['title', 'instructions', 'type', 'questions', 'passing_score', 'max_attempts', 'time_limit_minutes', 'image_url', 'video_url', 'video_type', 'attachments', 'sort_order'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    const { data, error } = await supabase
      .from('knowledge_exercises')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /knowledge/exercises/:id
r.delete('/exercises/:id', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { error } = await supabase.from('knowledge_exercises').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/exercises/:id/submit
r.post('/exercises/:id/submit', async (req, res) => {
  try {
    const { answers } = req.body;
    const { data: ex, error } = await supabase
      .from('knowledge_exercises')
      .select('*, lesson:knowledge_lessons(id, is_published, target_roles)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!lessonVisibleToUser(ex.lesson, req)) return res.status(404).json({ error: 'Không tìm thấy' });

    const { count } = await supabase
      .from('knowledge_exercise_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('exercise_id', req.params.id)
      .eq('user_id', req.user.userId);
    const attempt = (count || 0) + 1;
    if (ex.max_attempts && attempt > ex.max_attempts) {
      return res.status(400).json({ error: `Đã hết lượt làm bài (tối đa ${ex.max_attempts})` });
    }

    let score = null;
    let status = 'submitted';
    if (ex.type === 'quiz') {
      const graded = gradeQuiz(ex.questions, answers);
      score = graded.score;
      const pass = score >= (ex.passing_score ?? 70);
      status = pass ? 'passed' : 'failed';
    } else if (ex.type === 'checklist') {
      const items = ex.questions?.items || [];
      const done = items.filter((it) => answers?.[it.id]).length;
      score = items.length ? Math.round((done / items.length) * 100) : 100;
      status = score >= (ex.passing_score ?? 70) ? 'passed' : 'failed';
    }

    const { data, error: insErr } = await supabase
      .from('knowledge_exercise_submissions')
      .insert({
        exercise_id: req.params.id,
        user_id: req.user.userId,
        answers: answers || {},
        score,
        status,
        attempt_number: attempt,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    let newCert = null;
    if (status === 'passed' && ex.lesson?.id) {
      newCert = await maybeIssueCertificateForLesson(req, ex.lesson.id);
    }

    res.status(201).json({ ...data, certificate_issued: newCert || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/submissions — admin chấm bài essay
r.get('/submissions', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { status, exercise_id } = req.query;
    let q = supabase
      .from('knowledge_exercise_submissions')
      .select('*, user:users(id, full_name, email), exercise:knowledge_exercises(id, title, type, lesson_id)')
      .order('submitted_at', { ascending: false })
      .limit(100);
    if (status) q = q.eq('status', status);
    if (exercise_id) q = q.eq('exercise_id', exercise_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ submissions: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /knowledge/submissions/:id/grade
r.patch('/submissions/:id/grade', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { score, feedback, status } = req.body;
    const { data, error } = await supabase
      .from('knowledge_exercise_submissions')
      .update({
        score,
        feedback: feedback || null,
        status: status || (score >= 70 ? 'passed' : 'failed'),
        graded_by: req.user.userId,
        graded_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// BOOKMARK
// ════════════════════════════════════════════════════════════════════════

// POST /knowledge/lessons/:id/bookmark — toggle
r.post('/lessons/:id/bookmark', async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from('knowledge_lesson_bookmarks')
      .select('id')
      .eq('user_id', req.user.userId)
      .eq('lesson_id', req.params.id)
      .maybeSingle();
    if (existing) {
      await supabase.from('knowledge_lesson_bookmarks').delete().eq('id', existing.id);
      return res.json({ is_bookmarked: false });
    }
    await supabase.from('knowledge_lesson_bookmarks').insert({
      user_id: req.user.userId,
      lesson_id: req.params.id,
    });
    res.json({ is_bookmarked: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/bookmarks
r.get('/bookmarks', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_lesson_bookmarks')
      .select('created_at, lesson:knowledge_lessons(*, category:knowledge_categories(id, name, icon))')
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ bookmarks: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// RATING
// ════════════════════════════════════════════════════════════════════════

// POST /knowledge/lessons/:id/rate
r.post('/lessons/:id/rate', async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const num = Number(rating);
    if (!num || num < 1 || num > 5) return res.status(400).json({ error: 'Đánh giá 1-5 sao' });
    const { data, error } = await supabase
      .from('knowledge_lesson_ratings')
      .upsert(
        {
          user_id: req.user.userId,
          lesson_id: req.params.id,
          rating: num,
          comment: comment || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lesson_id' },
      )
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /knowledge/lessons/:id/rate
r.delete('/lessons/:id/rate', async (req, res) => {
  try {
    await supabase
      .from('knowledge_lesson_ratings')
      .delete()
      .eq('user_id', req.user.userId)
      .eq('lesson_id', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// CERTIFICATES — Chứng nhận hoàn thành khoá (danh mục)
// ════════════════════════════════════════════════════════════════════════

// GET /knowledge/categories/:id/progress — tiến độ chi tiết của user trong 1 khoá
r.get('/categories/:id/progress', async (req, res) => {
  try {
    const evalResult = await evaluateCertificateEligibility(req.user.userId, req.params.id, req.user);
    const { stats, category, eligible, reason } = evalResult;
    const { data: cert } = await supabase
      .from('knowledge_certificates')
      .select('id, certificate_number, verify_code, issued_at, status, badge_image_url')
      .eq('user_id', req.user.userId)
      .eq('category_id', req.params.id)
      .maybeSingle();
    const totalLessons = stats?.totalLessons || 0;
    const completedLessons = stats?.completedLessons || 0;
    const exerciseStats = stats?.exerciseStats || { total: 0, passed: 0, avgScore: null };
    // Phần trăm hoàn thành tính trung bình bài học + bài tập (cân bằng)
    const lessonRate = totalLessons ? completedLessons / totalLessons : 0;
    const exRate = exerciseStats.total ? exerciseStats.passed / exerciseStats.total : 1;
    const overallRate = (exerciseStats.total > 0 && (category?.require_all_exercises_passed !== false))
      ? Math.round(((lessonRate + exRate) / 2) * 100)
      : Math.round(lessonRate * 100);
    res.json({
      category_id: req.params.id,
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
      completion_rate: overallRate,
      lesson_completion_rate: Math.round(lessonRate * 100),
      exercises: exerciseStats,
      certificate: cert || null,
      eligible,
      reason,
      badge_image_url: category?.badge_image_url || null,
      require_all_exercises_passed: category?.require_all_exercises_passed !== false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/categories/:id/issue-certificate — kích hoạt cấp thủ công (idempotent)
r.post('/categories/:id/issue-certificate', async (req, res) => {
  try {
    const cert = await tryIssueCertificate(req.user.userId, req.params.id, req.user);
    if (!cert) {
      const { data: existing } = await supabase
        .from('knowledge_certificates')
        .select('*, category:knowledge_categories(id, name, icon, badge_image_url)')
        .eq('user_id', req.user.userId)
        .eq('category_id', req.params.id)
        .maybeSingle();
      if (existing) return res.json({ certificate: existing, already_issued: true });
      const evalResult = await evaluateCertificateEligibility(req.user.userId, req.params.id, req.user);
      return res.status(400).json({
        error: evalResult.reason || 'Chưa đủ điều kiện cấp chứng nhận',
        progress: evalResult.stats,
        eligible: false,
      });
    }
    res.status(201).json({ certificate: cert });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/certificates — chứng nhận của tôi
r.get('/certificates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_certificates')
      .select('*, category:knowledge_categories(id, name, slug, icon, badge_image_url)')
      .eq('user_id', req.user.userId)
      .order('issued_at', { ascending: false });
    if (error) throw error;
    res.json({ certificates: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/users/:userId/certificates — public xem chứng nhận của 1 user (mạng nội bộ)
r.get('/users/:userId/certificates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_certificates')
      .select('id, certificate_number, verify_code, issued_at, status, total_lessons, completed_lessons, total_exercises, passed_exercises, avg_exercise_score, badge_image_url, category:knowledge_categories(id, name, slug, icon, badge_image_url)')
      .eq('user_id', req.params.userId)
      .eq('status', 'issued')
      .order('issued_at', { ascending: false });
    if (error) throw error;
    res.json({ certificates: data || [], count: (data || []).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/certificates/:id — chi tiết để in/xem
r.get('/certificates/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_certificates')
      .select(`*,
        category:knowledge_categories(id, name, slug, icon, description, badge_image_url, certificate_template),
        user:users!knowledge_certificates_user_id_fkey(id, full_name, email, role, avatar)`)
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!canManage(req) && data.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Không có quyền xem chứng nhận này' });
    }
    res.json(data);
  } catch (e) {
    res.status(404).json({ error: 'Không tìm thấy chứng nhận' });
  }
});

// GET /knowledge/certificates/verify/:code — xác minh public (vẫn cần auth do middleware)
r.get('/certificates/verify/:code', async (req, res) => {
  try {
    const { data } = await supabase
      .from('knowledge_certificates')
      .select(`id, certificate_number, verify_code, issued_at, status, total_lessons, completed_lessons, avg_exercise_score, metadata,
        category:knowledge_categories(id, name, icon),
        user:users!knowledge_certificates_user_id_fkey(id, full_name, email)`)
      .eq('verify_code', String(req.params.code).toUpperCase())
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'Không tìm thấy chứng nhận', valid: false });
    res.json({ valid: data.status === 'issued', certificate: data });
  } catch (e) {
    res.status(500).json({ error: e.message, valid: false });
  }
});

// GET /knowledge/admin/certificates — admin xem tất cả
r.get('/admin/certificates', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { category_id, user_id, status, q } = req.query;
    let query = supabase
      .from('knowledge_certificates')
      .select(`*,
        category:knowledge_categories(id, name, icon, company_id),
        user:users!knowledge_certificates_user_id_fkey(id, full_name, email, company_id, department_id)`)
      .order('issued_at', { ascending: false })
      .limit(500);
    if (category_id) query = query.eq('category_id', category_id);
    if (user_id) query = query.eq('user_id', user_id);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;

    let list = data || [];
    const adminCompanyId = req.user.company_id || null;
    const sysAdmin = isSystemAdmin(req.user);
    if (!sysAdmin && adminCompanyId) {
      list = list.filter((c) => String(c.user?.company_id || '') === String(adminCompanyId));
    }
    if (q) {
      const s = String(q).toLowerCase();
      list = list.filter((c) =>
        c.user?.full_name?.toLowerCase().includes(s)
        || c.user?.email?.toLowerCase().includes(s)
        || c.certificate_number?.toLowerCase().includes(s)
        || c.category?.name?.toLowerCase().includes(s),
      );
    }
    res.json({ certificates: list, total: list.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /knowledge/admin/certificates/:id/revoke
r.post('/admin/certificates/:id/revoke', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { reason } = req.body || {};
    const { data, error } = await supabase
      .from('knowledge_certificates')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: req.user.userId,
        revoked_reason: reason || null,
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// LỊCH SỬ BÀI LÀM
// ════════════════════════════════════════════════════════════════════════

// GET /knowledge/my-submissions
r.get('/my-submissions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_exercise_submissions')
      .select('*, exercise:knowledge_exercises(id, title, type, passing_score, lesson:knowledge_lessons(id, title))')
      .eq('user_id', req.user.userId)
      .order('submitted_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ submissions: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ANALYTICS (Admin)
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// ADMIN: Quản lý bài tập tập trung
// ════════════════════════════════════════════════════════════════════════

// GET /knowledge/admin/exercises — danh sách tất cả bài tập (admin)
r.get('/admin/exercises', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const { lesson_id, category_id, type, q: search } = req.query;

    let query = supabase
      .from('knowledge_exercises')
      .select(`*, lesson:knowledge_lessons!inner(id, title, category_id, is_published,
        category:knowledge_categories(id, name, icon, company_id))`)
      .order('created_at', { ascending: false });

    if (lesson_id) query = query.eq('lesson_id', lesson_id);
    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) throw error;

    let exercises = data || [];
    if (category_id) exercises = exercises.filter((e) => e.lesson?.category_id === category_id);
    if (search) {
      const s = String(search).toLowerCase();
      exercises = exercises.filter(
        (e) => e.title?.toLowerCase().includes(s) || e.lesson?.title?.toLowerCase().includes(s),
      );
    }

    const exIds = exercises.map((e) => e.id);
    let submissionStats = {};
    if (exIds.length) {
      const { data: subs } = await supabase
        .from('knowledge_exercise_submissions')
        .select('exercise_id, status, score')
        .in('exercise_id', exIds);
      (subs || []).forEach((s) => {
        if (!submissionStats[s.exercise_id]) submissionStats[s.exercise_id] = { count: 0, passed: 0, totalScore: 0, scoreCount: 0 };
        submissionStats[s.exercise_id].count += 1;
        if (s.status === 'passed') submissionStats[s.exercise_id].passed += 1;
        if (s.score != null) {
          submissionStats[s.exercise_id].totalScore += s.score;
          submissionStats[s.exercise_id].scoreCount += 1;
        }
      });
    }

    const enriched = exercises.map((e) => {
      const stat = submissionStats[e.id];
      return {
        ...e,
        question_count: e.questions?.items?.length || (e.type === 'essay' ? 1 : 0),
        submission_count: stat?.count || 0,
        passed_count: stat?.passed || 0,
        pass_rate: stat?.count ? Math.round((stat.passed / stat.count) * 100) : null,
        avg_score: stat?.scoreCount ? Math.round((stat.totalScore / stat.scoreCount) * 10) / 10 : null,
      };
    });

    res.json({ exercises: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// ADMIN: Bảng điểm công ty (Scoreboard)
// ════════════════════════════════════════════════════════════════════════

// GET /knowledge/admin/scoreboard
//   user_id, exercise_id, lesson_id, category_id (module),
//   company_id, department_id, region_id,
//   status, from (ISO date), to, q (search user name)
r.get('/admin/scoreboard', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });
    const {
      user_id, exercise_id, lesson_id, category_id,
      company_id: companyIdParam, department_id, region_id,
      status, from, to, q,
    } = req.query;

    const adminCompanyId = req.user.company_id || null;
    const sysAdmin = isSystemAdmin(req.user);

    // Nếu lọc theo khu vực: lấy danh sách user_id thuộc khu vực đó (M-N)
    let regionUserSet = null;
    if (region_id) {
      const { data: rUsers } = await supabase
        .from('user_company_regions')
        .select('user_id')
        .eq('region_id', region_id);
      regionUserSet = new Set((rUsers || []).map((r) => r.user_id));
    }

    let query = supabase
      .from('knowledge_exercise_submissions')
      .select(`*,
        user:users!knowledge_exercise_submissions_user_id_fkey(id, full_name, email, avatar, role, company_id, department_id),
        exercise:knowledge_exercises(id, title, type, passing_score, lesson_id,
          lesson:knowledge_lessons(id, title, category_id,
            category:knowledge_categories(id, name, icon)))`)
      .order('submitted_at', { ascending: false })
      .limit(1000);

    if (user_id) query = query.eq('user_id', user_id);
    if (exercise_id) query = query.eq('exercise_id', exercise_id);
    if (status) query = query.eq('status', status);
    if (from) query = query.gte('submitted_at', from);
    if (to) query = query.lte('submitted_at', to);

    const { data, error } = await query;
    if (error) throw error;

    let subs = data || [];

    // Phạm vi công ty: admin có company_id chỉ thấy user trong công ty đó.
    // System admin: thấy tất cả, có thể filter bằng companyIdParam.
    if (!sysAdmin && adminCompanyId) {
      subs = subs.filter((s) => String(s.user?.company_id || '') === String(adminCompanyId));
    } else if (companyIdParam) {
      subs = subs.filter((s) => String(s.user?.company_id || '') === String(companyIdParam));
    }

    if (lesson_id) subs = subs.filter((s) => s.exercise?.lesson_id === lesson_id);
    if (category_id) subs = subs.filter((s) => s.exercise?.lesson?.category_id === category_id);
    if (department_id) subs = subs.filter((s) => String(s.user?.department_id || '') === String(department_id));
    if (regionUserSet) subs = subs.filter((s) => regionUserSet.has(s.user_id));
    if (q) {
      const s = String(q).toLowerCase();
      subs = subs.filter(
        (sub) => sub.user?.full_name?.toLowerCase().includes(s) ||
                 sub.user?.email?.toLowerCase().includes(s),
      );
    }

    // Aggregate stats
    const totals = {
      count: subs.length,
      passed: subs.filter((s) => s.status === 'passed').length,
      failed: subs.filter((s) => s.status === 'failed').length,
      pending: subs.filter((s) => s.status === 'submitted').length,
      avg_score: (() => {
        const withScore = subs.filter((s) => s.score != null);
        if (!withScore.length) return null;
        return Math.round((withScore.reduce((a, b) => a + b.score, 0) / withScore.length) * 10) / 10;
      })(),
      unique_users: new Set(subs.map((s) => s.user_id)).size,
    };

    // Filter dropdowns
    let usersForFilter = [];
    let exercisesForFilter = [];
    let lessonsForFilter = [];
    let companiesForFilter = [];
    let categoriesForFilter = [];
    let departmentsForFilter = [];
    let regionsForFilter = [];

    try {
      let usersQ = supabase.from('users')
        .select('id, full_name, email, company_id, department_id')
        .eq('is_active', true);
      if (!sysAdmin && adminCompanyId) usersQ = usersQ.eq('company_id', adminCompanyId);
      const { data: users } = await usersQ.order('full_name').limit(500);
      usersForFilter = users || [];
    } catch { /* ignore */ }

    try {
      const { data: ex } = await supabase
        .from('knowledge_exercises')
        .select('id, title, lesson:knowledge_lessons(id, title, category_id)')
        .order('title')
        .limit(500);
      exercisesForFilter = ex || [];
    } catch { /* ignore */ }

    try {
      const { data: lsn } = await supabase
        .from('knowledge_lessons')
        .select('id, title, category_id')
        .order('title')
        .limit(500);
      lessonsForFilter = lsn || [];
    } catch { /* ignore */ }

    try {
      const { data: cats } = await supabase
        .from('knowledge_categories')
        .select('id, name, icon, company_id')
        .eq('is_active', true)
        .order('sort_order');
      categoriesForFilter = (cats || []).filter((c) => {
        if (c.company_id == null) return true;
        if (sysAdmin) return true;
        return String(c.company_id) === String(adminCompanyId);
      });
    } catch { /* ignore */ }

    try {
      let depQ = supabase.from('departments').select('id, name, company_id').order('name');
      if (!sysAdmin && adminCompanyId) depQ = depQ.eq('company_id', adminCompanyId);
      const { data: deps } = await depQ;
      departmentsForFilter = deps || [];
    } catch { /* ignore */ }

    try {
      let regQ = supabase.from('company_regions')
        .select('id, name, code, company_id')
        .eq('is_active', true)
        .order('order_index');
      if (!sysAdmin && adminCompanyId) regQ = regQ.eq('company_id', adminCompanyId);
      const { data: regs } = await regQ;
      regionsForFilter = regs || [];
    } catch { /* ignore */ }

    // Fetch tất cả công ty để hiển thị (kể cả khi không phải sysAdmin, dùng cho cột tên công ty)
    let allCompanies = [];
    try {
      const { data: comp } = await supabase.from('companies').select('id, name, short_name').order('name');
      allCompanies = comp || [];
      if (sysAdmin) companiesForFilter = allCompanies;
    } catch { /* ignore */ }

    // Map id → name để ghép vào submission.user.company / department
    const companyMap = new Map(allCompanies.map((c) => [String(c.id), c]));
    const deptMap = new Map(departmentsForFilter.map((d) => [String(d.id), d]));
    subs.forEach((s) => {
      if (s.user) {
        if (s.user.company_id) s.user.company = companyMap.get(String(s.user.company_id)) || null;
        if (s.user.department_id) s.user.department = deptMap.get(String(s.user.department_id)) || null;
      }
    });

    res.json({
      submissions: subs,
      totals,
      filters: {
        users: usersForFilter,
        exercises: exercisesForFilter,
        lessons: lessonsForFilter,
        companies: companiesForFilter,
        categories: categoriesForFilter,
        departments: departmentsForFilter,
        regions: regionsForFilter,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /knowledge/analytics
r.get('/analytics', async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Không có quyền' });

    const { data: lessons } = await supabase
      .from('knowledge_lessons')
      .select('id, title, category:knowledge_categories(name, icon)')
      .eq('is_published', true);

    const lessonIds = (lessons || []).map((l) => l.id);
    if (!lessonIds.length) return res.json({ stats: [], totals: {} });

    const { data: progress } = await supabase
      .from('knowledge_lesson_progress')
      .select('lesson_id, status')
      .in('lesson_id', lessonIds);

    const { data: ratings } = await supabase
      .from('knowledge_lesson_ratings')
      .select('lesson_id, rating')
      .in('lesson_id', lessonIds);

    const { data: exercises } = await supabase
      .from('knowledge_exercises')
      .select('id, lesson_id')
      .in('lesson_id', lessonIds);
    const exerciseIds = (exercises || []).map((e) => e.id);
    const exToLesson = Object.fromEntries((exercises || []).map((e) => [e.id, e.lesson_id]));

    let submissions = [];
    if (exerciseIds.length) {
      const { data: subs } = await supabase
        .from('knowledge_exercise_submissions')
        .select('exercise_id, status, score')
        .in('exercise_id', exerciseIds);
      submissions = subs || [];
    }

    const stats = (lessons || []).map((l) => {
      const lp = (progress || []).filter((p) => p.lesson_id === l.id);
      const learners = lp.length;
      const completed = lp.filter((p) => p.status === 'completed').length;
      const rs = (ratings || []).filter((r2) => r2.lesson_id === l.id);
      const ratingCount = rs.length;
      const ratingAvg = ratingCount ? Math.round((rs.reduce((a, b) => a + b.rating, 0) / ratingCount) * 10) / 10 : null;
      const lessonExIds = (exercises || []).filter((e) => e.lesson_id === l.id).map((e) => e.id);
      const lessonSubs = submissions.filter((s) => lessonExIds.includes(s.exercise_id));
      const passed = lessonSubs.filter((s) => s.status === 'passed').length;
      return {
        id: l.id,
        title: l.title,
        category: l.category,
        learners,
        completed,
        completion_rate: learners ? Math.round((completed / learners) * 100) : 0,
        rating_avg: ratingAvg,
        rating_count: ratingCount,
        submission_count: lessonSubs.length,
        passed_count: passed,
        pass_rate: lessonSubs.length ? Math.round((passed / lessonSubs.length) * 100) : 0,
      };
    });

    const totals = {
      total_lessons: lessons.length,
      total_learners: new Set((progress || []).map((p) => p.lesson_id)).size,
      total_submissions: submissions.length,
      total_passed: submissions.filter((s) => s.status === 'passed').length,
      total_ratings: ratings?.length || 0,
    };

    res.json({ stats, totals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
