const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { syncCompanyToEcosystem } = require('../helpers/ecosystemSync');

const r = Router();
r.use(auth);

// ═══ LIST COMPANIES ═══
r.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let q = supabase.from('companies').select('*').eq('is_active', true).order('name');
    if (search) q = q.or(`name.ilike.%${search}%,short_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ companies: data || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET COMPANIES OF CURRENT USER ═══
r.get('/my/list', async (req, res) => {
  try {
    const { data } = await supabase.from('user_companies')
      .select('company:companies(*)')
      .eq('user_id', req.user.userId);
    const companies = (data || []).map(d => d.company).filter(Boolean);
    res.json({ companies });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET COMPANY DETAIL ═══
r.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('companies').select('*').eq('id', req.params.id).single();
    if (error) throw error;

    // Load employees of this company
    const { data: members } = await supabase.from('user_companies')
      .select('*, user:users(id,full_name,email,phone,avatar,role,is_active)')
      .eq('company_id', req.params.id);

    // Load projects of this company
    const { data: projects } = await supabase.from('projects')
      .select('id,code,name,status,estimated_value,created_at,customers(full_name)')
      .eq('company_id', req.params.id).order('created_at', { ascending: false });

    res.json({
      company: data,
      members: (members || []).map(m => ({ ...m.user, is_primary: m.is_primary, joined_at: m.joined_at })),
      projects: projects || [],
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ CREATE COMPANY ═══
r.post('/', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    const { data, error } = await supabase.from('companies').insert({
      name: b.name, short_name: b.short_name || null,
      tax_code: b.tax_code || null, address: b.address || null,
      phone: b.phone || null, email: b.email || null, logo_url: b.logo_url || null,
      division_unit_id: b.division_unit_id || null,
    }).select().single();
    if (error) throw error;

    // Auto sync to ecosystem
    if (b.division_unit_id) {
      await syncCompanyToEcosystem({ ...data, division_unit_id: b.division_unit_id });
    }

    res.status(201).json({ company: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ UPDATE COMPANY ═══
r.put('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    ['name', 'short_name', 'tax_code', 'address', 'phone', 'email', 'logo_url', 'is_active', 'division_unit_id'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase.from('companies').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Auto sync to ecosystem
    await syncCompanyToEcosystem(data);

    res.json({ company: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET EMPLOYEES OF A COMPANY (for project assignment dropdown) ═══
r.get('/:id/employees', async (req, res) => {
  try {
    const { data, error } = await supabase.from('user_companies')
      .select('user:users(id,full_name,email,phone,avatar,role,is_active)')
      .eq('company_id', req.params.id);
    if (error) throw error;
    const employees = (data || []).map(d => d.user).filter(u => u && u.is_active);
    res.json({ employees });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ ADD EMPLOYEE TO COMPANY ═══
r.post('/:id/employees', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const { user_id, is_primary } = req.body;
    const { data, error } = await supabase.from('user_companies').insert({
      user_id, company_id: req.params.id, is_primary: is_primary || false,
    }).select('*, user:users(id,full_name,email,role)').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Nhân viên đã thuộc công ty này' });
      throw error;
    }
    res.status(201).json({ member: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ REMOVE EMPLOYEE FROM COMPANY ═══
r.delete('/:companyId/employees/:userId', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    await supabase.from('user_companies').delete()
      .eq('company_id', req.params.companyId).eq('user_id', req.params.userId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DELETE COMPANY ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const { data: company } = await supabase.from('companies').select('name').eq('id', req.params.id).single();
    // Remove all employee links
    await supabase.from('user_companies').delete().eq('company_id', req.params.id);
    // Unlink projects
    await supabase.from('projects').update({ company_id: null }).eq('company_id', req.params.id);
    // Delete company
    const { error } = await supabase.from('companies').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: `Đã xóa công ty ${company?.name}` });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
