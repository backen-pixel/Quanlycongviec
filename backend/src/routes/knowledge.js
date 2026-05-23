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
    const { name, slug, description, icon, parent_id, sort_order, company_id, is_active } = req.body;
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
    const { data, error } = await supabase.from('knowledge_categories').insert(insert).select().single();
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
    ['name', 'slug', 'description', 'icon', 'parent_id', 'sort_order', 'company_id', 'is_active'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    const { data, error } = await supabase.from('knowledge_categories').update(update).eq('id', req.params.id).select().single();
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
    const { data: lesson } = await supabase.from('knowledge_lessons').select('is_published, target_roles').eq('id', req.params.id).single();
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
    res.json(data);
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
      const items = (ex.questions?.items || []).map(({ id, question, type, options }) => ({
        id,
        question,
        type,
        options,
      }));
      payload.questions = { items };
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
    res.status(201).json(data);
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
