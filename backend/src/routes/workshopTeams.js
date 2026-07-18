/**
 * Workshop Teams — Đội Vận chuyển
 * API prefix: /api/workshop-teams
 */
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const { notifyMultiple, createNotification } = require('../helpers/notifications');

const r = Router();
r.use(auth);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lấy danh sách user_id thành viên của team */
async function getTeamMemberIds(teamId) {
  const { data } = await supabase
    .from('workshop_team_members')
    .select('user_id')
    .eq('team_id', teamId);
  return (data || []).map((m) => m.user_id).filter(Boolean);
}

// ─── GET /workshop-teams ──────────────────────────────────────────────────────
r.get('/', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { type } = req.query; // 'delivery' | 'installation' | 'production' | undefined
    const companyId = req.query.company_id && String(req.query.company_id).trim();
    let q = supabase
      .from('workshop_teams')
      .select(`
        id, name, type, description, color, is_active, created_at, company_id,
        members:workshop_team_members(
          id, role, joined_at,
          user:users(id, full_name, email, role, avatar)
        )
      `)
      .order('created_at');
    if (type) q = q.eq('type', type);
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error && error.message?.includes('workshop_teams')) {
      return res.json([]); // table chưa tồn tại
    }
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /workshop-teams ─────────────────────────────────────────────────────
r.post('/', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên đội' });
    if (!['delivery', 'installation', 'production'].includes(b.type)) {
      return res.status(400).json({ error: 'type phải là delivery, installation hoặc production' });
    }
    if (b.type === 'production' && !(b.company_id && String(b.company_id).trim())) {
      return res.status(400).json({ error: 'Đội sản xuất cần company_id (công ty xưởng)' });
    }
    const { data, error } = await supabase
      .from('workshop_teams')
      .insert({
        name: b.name.trim(),
        type: b.type,
        company_id: b.company_id || null,
        description: b.description || null,
        color:
          b.color ||
          (b.type === 'delivery' ? '#f97316' : b.type === 'installation' ? '#d97706' : '#0d9488'),
        is_active: b.is_active !== false,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /workshop-teams/:id ──────────────────────────────────────────────────
r.put('/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    const update = {};
    ['name', 'description', 'color', 'is_active'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase
      .from('workshop_teams')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /workshop-teams/:id ───────────────────────────────────────────────
r.delete('/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    await supabase.from('workshop_teams').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /workshop-teams/:id/members ── thêm thành viên ─────────────────────
r.post('/:id/members', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { user_id, role = 'member' } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Thiếu user_id' });

    // Upsert (bỏ qua nếu đã tồn tại)
    const { error } = await supabase
      .from('workshop_team_members')
      .upsert({ team_id: req.params.id, user_id, role }, { onConflict: 'team_id,user_id' });
    if (error) throw error;

    // Thông báo người vừa được thêm
    const { data: team } = await supabase
      .from('workshop_teams').select('name, type').eq('id', req.params.id).single();
    const typeLabel =
      team?.type === 'delivery' ? 'vận chuyển' : team?.type === 'installation' ? 'lắp đặt' : 'sản xuất';
    await createNotification(
      req, user_id, 'task_assigned',
      `👥 Bạn đã tham gia đội ${typeLabel}`,
      `Bạn được thêm vào đội "${team?.name || ''}"`,
      'project', null,
      {
        ecosystem_module_key: team?.type === 'delivery' || team?.type === 'installation' ? 'logistics' : 'production',
      },
    );

    const { data: updated } = await supabase
      .from('workshop_teams')
      .select(`id, name, type, color, is_active, members:workshop_team_members(id, role, joined_at, user:users(id, full_name, email, role, avatar))`)
      .eq('id', req.params.id).single();
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /workshop-teams/:id/members/:userId ── xóa thành viên ────────────
r.delete('/:id/members/:userId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    await supabase.from('workshop_team_members')
      .delete().eq('team_id', req.params.id).eq('user_id', req.params.userId);
    res.json({ message: 'Đã xóa thành viên' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /workshop-teams/projects/:projectId/assign ── gán đội/người ────────
r.patch('/projects/:projectId/assign', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { delivery_team_id, installation_team_id, installer_person_id, logistics_person_id } = req.body;
    const userId = req.user.userId;

    const { data: project } = await supabase
      .from('projects').select('id, code, name').eq('id', projectId).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const update = {};
    if (delivery_team_id !== undefined)      update.delivery_team_id     = delivery_team_id || null;
    if (installation_team_id !== undefined)  update.installation_team_id = installation_team_id || null;
    if (installer_person_id !== undefined)   update.installer_person_id  = installer_person_id || null;
    if (logistics_person_id !== undefined)   update.logistics_person_id  = logistics_person_id || null;

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Không có gì để cập nhật' });

    const { data: updated, error } = await supabase
      .from('projects').update(update).eq('id', projectId)
      .select(`id, code, name, status,
        logistics_person:users!projects_logistics_person_id_fkey(id, full_name),
        installer_person:users!projects_installer_person_id_fkey(id, full_name),
        delivery_team:workshop_teams!projects_delivery_team_id_fkey(id, name, color, type),
        installation_team:workshop_teams!projects_installation_team_id_fkey(id, name, color, type)
      `).single();
    if (error) throw error;

    const projectLabel = project.code || project.name;

    // Thông báo người vận chuyển mới
    if (logistics_person_id && logistics_person_id !== userId) {
      await createNotification(req, logistics_person_id, 'task_assigned',
        `🚚 Bạn được giao vận chuyển`,
        `Dự án "${projectLabel}" vừa giao cho bạn vận chuyển`,
        'project', projectId,
        { ecosystem_module_key: 'logistics', project_id: String(projectId) });
    }

    // Thông báo người lắp đặt mới
    if (installer_person_id && installer_person_id !== userId) {
      await createNotification(req, installer_person_id, 'task_assigned',
        `🔧 Bạn được giao lắp đặt`,
        `Dự án "${projectLabel}" vừa giao cho bạn lắp đặt`,
        'project', projectId,
        { ecosystem_module_key: 'logistics', project_id: String(projectId) });
    }

    // Thông báo tất cả thành viên đội vận chuyển mới
    if (delivery_team_id) {
      const memberIds = await getTeamMemberIds(delivery_team_id);
      const recipients = memberIds.filter((uid) => uid !== userId);
      if (recipients.length) {
        const { data: team } = await supabase.from('workshop_teams').select('name').eq('id', delivery_team_id).single();
        await notifyMultiple(req, recipients, 'task_assigned',
          `🚚 Đội ${team?.name}: Dự án mới`,
          `Dự án "${projectLabel}" vừa được giao cho đội bạn vận chuyển`,
          'project', projectId,
          { ecosystem_module_key: 'logistics', project_id: String(projectId) });
      }
    }

    // Thông báo tất cả thành viên đội lắp đặt mới
    if (installation_team_id) {
      const memberIds = await getTeamMemberIds(installation_team_id);
      const recipients = memberIds.filter((uid) => uid !== userId);
      if (recipients.length) {
        const { data: team } = await supabase.from('workshop_teams').select('name').eq('id', installation_team_id).single();
        await notifyMultiple(req, recipients, 'task_assigned',
          `🔧 Đội ${team?.name}: Dự án mới`,
          `Dự án "${projectLabel}" vừa được giao cho đội bạn lắp đặt`,
          'project', projectId,
          { ecosystem_module_key: 'logistics', project_id: String(projectId) });
      }
    }

    const io = req.app.get('io');
    if (io) io.emit('project:updated', updated);

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /workshop-teams/users — danh sách user có thể gán ───────────────────
r.get('/users', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email, role, avatar')
      .in('role', ['logistics', 'installer', 'production', 'manager', 'admin', 'sales_admin'])
      .eq('is_active', true)
      .order('full_name');
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
