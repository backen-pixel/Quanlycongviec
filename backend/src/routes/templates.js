const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ═══ LIST TEMPLATES (all or by stage) ═══
r.get('/', async (req, res) => {
  try {
    const { stage_id } = req.query;
    let q = supabase.from('task_templates')
      .select('*, stage:workflow_stages(id,name,slug,color), creator:users!task_templates_created_by_fkey(id,full_name)')
      .order('order_index');
    if (stage_id) q = q.eq('stage_id', stage_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ templates: data || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET TEMPLATES GROUPED BY STAGE ═══
r.get('/by-stage', async (req, res) => {
  try {
    const { data: stages } = await supabase.from('workflow_stages').select('*').eq('is_active', true).order('order_index');
    const { data: templates } = await supabase.from('task_templates').select('*').order('order_index');

    const grouped = (stages || []).map(s => ({
      ...s,
      templates: (templates || []).filter(t => t.stage_id === s.id),
    }));

    res.json({ stages: grouped });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ CREATE TEMPLATE ═══
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.title || !b.stage_id) return res.status(400).json({ error: 'Tên và giai đoạn bắt buộc' });

    const { data, error } = await supabase.from('task_templates').insert({
      stage_id: b.stage_id,
      title: b.title,
      description: b.description || null,
      priority: b.priority || 'medium',
      estimated_hours: b.estimated_hours || null,
      order_index: b.order_index || 0,
      checklist_items: b.checklist_items || [],
      assignee_role: b.assignee_role || null,
      assignee_id: b.assignee_id || null,
      created_by: req.user.userId,
    }).select('*, stage:workflow_stages(id,name,slug,color)').single();
    if (error) throw error;
    res.status(201).json({ template: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ UPDATE TEMPLATE ═══
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['title','description','priority','estimated_hours','order_index','checklist_items','assignee_role','assignee_id','stage_id','is_active'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });

    const { data, error } = await supabase.from('task_templates').update(update).eq('id', req.params.id)
      .select('*, stage:workflow_stages(id,name,slug,color)').single();
    if (error) throw error;
    res.json({ template: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DELETE TEMPLATE ═══
r.delete('/:id', async (req, res) => {
  try {
    await supabase.from('task_templates').update({ is_active: false }).eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ TOGGLE TEMPLATE ACTIVE/INACTIVE ═══
r.patch('/:id/toggle', async (req, res) => {
  try {
    const { data: current } = await supabase.from('task_templates').select('is_active').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('task_templates')
      .update({ is_active: !current?.is_active }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ template: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ ACTIVATE ALL TEMPLATES ═══
r.post('/activate-all', async (req, res) => {
  try {
    const { data, error } = await supabase.from('task_templates').update({ is_active: true }).eq('is_active', false).select('id');
    if (error) throw error;
    res.json({ message: `Đã kích hoạt ${data?.length || 0} nhiệm vụ mẫu`, count: data?.length });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
