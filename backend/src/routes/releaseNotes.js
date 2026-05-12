const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { notifyMultiple } = require('../helpers/notifications');
const r = Router();

r.use(auth);

const NOTE_SELECT = `*, creator:users!release_notes_created_by_fkey(id, full_name, avatar)`;

// GET /release-notes — Danh sách (published cho user, tất cả cho admin)
r.get('/', async (req, res) => {
  try {
    const { all } = req.query;
    let q = supabase.from('release_notes').select(NOTE_SELECT, { count: 'exact' });
    if (!all) q = q.eq('is_published', true);
    q = q.order('is_pinned', { ascending: false }).order('published_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    const { data, error, count } = await q;
    if (error) throw error;

    // Get read status for current user
    const noteIds = (data || []).map(n => n.id);
    let reads = [];
    if (noteIds.length) {
      const { data: readData } = await supabase.from('release_note_reads')
        .select('release_note_id')
        .eq('user_id', req.user.userId)
        .in('release_note_id', noteIds);
      reads = (readData || []).map(r => r.release_note_id);
    }

    const notes = (data || []).map(n => ({ ...n, is_read: reads.includes(n.id) }));
    
    // Count unread
    const unread = notes.filter(n => !n.is_read && n.is_published).length;

    res.json({ notes, total: count, unread });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /release-notes/unread-count
r.get('/unread-count', async (req, res) => {
  try {
    const { data: published } = await supabase.from('release_notes')
      .select('id').eq('is_published', true);
    const pubIds = (published || []).map(n => n.id);
    if (!pubIds.length) return res.json({ unread: 0 });

    const { data: readData } = await supabase.from('release_note_reads')
      .select('release_note_id')
      .eq('user_id', req.user.userId)
      .in('release_note_id', pubIds);
    const readIds = (readData || []).map(r => r.release_note_id);
    const unread = pubIds.filter(id => !readIds.includes(id)).length;
    res.json({ unread });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /release-notes/login-banner — chỉ bản cập nhật mới nhất (đã xuất bản); popup nếu user chưa đọc đúng bản đó (không xếp hàng các bản cũ)
r.get('/login-banner', async (req, res) => {
  try {
    const { data: rows, error } = await supabase.from('release_notes')
      .select(NOTE_SELECT)
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const latest = rows?.[0];
    if (!latest) return res.json({ note: null });

    const { data: readRows } = await supabase.from('release_note_reads')
      .select('release_note_id')
      .eq('user_id', req.user.userId)
      .eq('release_note_id', latest.id)
      .limit(1);
    const note = (readRows || []).length ? null : latest;
    res.json({ note });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /release-notes/:id
r.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('release_notes')
      .select(NOTE_SELECT).eq('id', req.params.id).single();
    if (error) throw error;

    // Mark as read
    await supabase.from('release_note_reads').upsert({
      release_note_id: req.params.id, user_id: req.user.userId,
    }, { onConflict: 'release_note_id,user_id' });

    // Read count
    const { count } = await supabase.from('release_note_reads')
      .select('id', { count: 'exact', head: true })
      .eq('release_note_id', req.params.id);

    res.json({ ...data, read_count: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /release-notes — Tạo mới
r.post('/', async (req, res) => {
  try {
    const { title, content, version, category, is_published, is_pinned } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Tiêu đề và nội dung là bắt buộc' });

    const insert = {
      title, content, version: version || null,
      category: category || 'feature',
      is_published: is_published || false,
      is_pinned: is_pinned || false,
      created_by: req.user.userId,
    };
    if (is_published) insert.published_at = new Date().toISOString();

    const { data, error } = await supabase.from('release_notes')
      .insert(insert).select(NOTE_SELECT).single();
    if (error) throw error;

    // Notify all users if published
    if (is_published) {
      try {
        const { data: allUsers } = await supabase.from('users').select('id').eq('is_active', true);
        await notifyMultiple(
          req, (allUsers || []).map(u => u.id),
          'release_note',
          `🆕 Cập nhật mới: ${title}`,
          `${version ? `Phiên bản ${version} — ` : ''}${title}`,
          'release_note', data.id
        );
      } catch (ne) { console.warn('[RELEASE] Notification error:', ne.message); }
    }

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /release-notes/:id
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    ['title', 'content', 'version', 'category', 'is_published', 'is_pinned'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });

    // Set published_at when first published
    if (b.is_published) {
      const { data: existing } = await supabase.from('release_notes')
        .select('is_published, published_at').eq('id', req.params.id).single();
      if (!existing?.is_published && !existing?.published_at) {
        update.published_at = new Date().toISOString();
      }

      // Notify all users when publishing
      try {
        const { data: allUsers } = await supabase.from('users').select('id').eq('is_active', true);
        await notifyMultiple(
          req, (allUsers || []).map(u => u.id),
          'release_note',
          `🆕 Cập nhật mới: ${b.title || 'Cập nhật'}`,
          `${b.version ? `Phiên bản ${b.version} — ` : ''}${b.title || 'Có cập nhật mới'}`,
          'release_note', req.params.id
        );
      } catch (ne) { console.warn('[RELEASE] Notification error:', ne.message); }
    }

    const { data, error } = await supabase.from('release_notes')
      .update(update).eq('id', req.params.id).select(NOTE_SELECT).single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /release-notes/:id
r.delete('/:id', async (req, res) => {
  try {
    await supabase.from('release_note_reads').delete().eq('release_note_id', req.params.id);
    const { error } = await supabase.from('release_notes').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /release-notes/:id/mark-read
r.put('/:id/mark-read', async (req, res) => {
  try {
    await supabase.from('release_note_reads').upsert({
      release_note_id: req.params.id, user_id: req.user.userId,
    }, { onConflict: 'release_note_id,user_id' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
