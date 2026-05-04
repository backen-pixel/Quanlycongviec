/**
 * KPI Giám đốc: doanh thu & sản lượng từ đơn hàng; Sale / Lắp đặt; đối soát chéo; phòng ban.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');

const r = Router();
r.use(auth);

const EXEC_ROLES = new Set(['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator']);

function canExecutive(role) {
  return EXEC_ROLES.has(String(role || '').trim().toLowerCase());
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchOrdersBatched({ dateFrom, dateTo }) {
  const pageSize = 800;
  let from = 0;
  const all = [];
  for (;;) {
    let q = supabase
      .from('orders')
      .select(
        `id, code, title, total, paid_amount, status, order_kind, created_by, lead_id, project_id,
         sx_construction_assignee_id, order_date, created_at,
         order_items(quantity)`
      )
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (dateFrom) q = q.gte('created_at', dateFrom);
    if (dateTo) q = q.lte('created_at', dateTo);

    const { data, error } = await q;
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break;
  }

  return all;
}

/** NV thuộc công ty (trực tiếp hoặc qua phòng ban). */
async function getUserIdsForCompany(companyId) {
  const { data: byCompany } = await supabase.from('users').select('id').eq('company_id', companyId);
  const { data: depts } = await supabase.from('departments').select('id').eq('company_id', companyId);
  const deptIds = (depts || []).map((d) => d.id);
  let byDept = [];
  if (deptIds.length) {
    const { data: u2 } = await supabase.from('users').select('id').in('department_id', deptIds);
    byDept = u2 || [];
  }
  return new Set([...(byCompany || []), ...byDept].map((u) => u.id));
}

function sumItemQty(order) {
  const items = order.order_items || [];
  return items.reduce((s, it) => s + num(it.quantity), 0);
}

function scoreFromShare(value, maxVal) {
  if (maxVal <= 0) return 0;
  return Math.min(100, Math.round(25 + (75 * value) / maxVal));
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/crm/executive/summary
// ═══════════════════════════════════════════════════════════════════════════
r.get('/summary', async (req, res) => {
  try {
    if (!canExecutive(req.user?.role)) {
      return res.status(403).json({ error: 'Chỉ lãnh đạo / quản trị mới xem được KPI này' });
    }

    const dateFrom = req.query.date_from || null;
    const dateTo = req.query.date_to || null;
    const companyId = req.query.company_id || null;

    let orders = await fetchOrdersBatched({ dateFrom, dateTo });

    const leadIdsAll = [...new Set(orders.map((o) => o.lead_id).filter(Boolean))];
    let leadMap = {};
    if (leadIdsAll.length) {
      const { data: leads, error: le } = await supabase
        .from('crm_leads')
        .select('id, code, title, assigned_to, lead_owner_id, estimated_value, project_id')
        .in('id', leadIdsAll);
      if (le) throw le;
      leadMap = Object.fromEntries((leads || []).map((l) => [l.id, l]));
    }

    if (companyId) {
      const allowed = await getUserIdsForCompany(companyId);
      orders = orders.filter((o) => {
        if (allowed.has(o.created_by)) return true;
        if (o.sx_construction_assignee_id && allowed.has(o.sx_construction_assignee_id)) return true;
        const L = o.lead_id ? leadMap[o.lead_id] : null;
        const sale = L ? L.assigned_to || L.lead_owner_id : null;
        if (sale && allowed.has(sale)) return true;
        return false;
      });
    }

    const salesOrders = orders.filter((o) => (o.order_kind || 'sales') === 'sales' && o.status !== 'cancelled');
    const activeSales = salesOrders;

    const projectIds = [...new Set(activeSales.map((o) => o.project_id).filter(Boolean))];
    let projectMap = {};
    if (projectIds.length) {
      const { data: projects, error: pe } = await supabase
        .from('projects')
        .select('id, code, name, estimated_value')
        .in('id', projectIds);
      if (pe) throw pe;
      projectMap = Object.fromEntries((projects || []).map((p) => [p.id, p]));
    }

    const allUserIds = new Set();
    activeSales.forEach((o) => {
      const lead = o.lead_id ? leadMap[o.lead_id] : null;
      const saleId = lead ? lead.assigned_to || lead.lead_owner_id || o.created_by : o.created_by;
      if (saleId) allUserIds.add(saleId);
      if (o.created_by) allUserIds.add(o.created_by);
    });
    orders.forEach((o) => {
      if (o.sx_construction_assignee_id) allUserIds.add(o.sx_construction_assignee_id);
    });

    let userMap = {};
    if (allUserIds.size) {
      const { data: users, error: ue } = await supabase
        .from('users')
        .select('id, full_name, department_id, role')
        .in('id', [...allUserIds]);
      if (ue) throw ue;
      userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
    }

    const deptIds = [...new Set(Object.values(userMap).map((u) => u.department_id).filter(Boolean))];
    let deptMap = {};
    if (deptIds.length) {
      const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
      deptMap = Object.fromEntries((depts || []).map((d) => [d.id, d]));
    }

    function saleOwnerId(order) {
      const lead = order.lead_id ? leadMap[order.lead_id] : null;
      if (lead) return lead.assigned_to || lead.lead_owner_id || order.created_by;
      return order.created_by;
    }

    const bySale = {};
    for (const o of activeSales) {
      const uid = saleOwnerId(o);
      if (!uid) continue;
      if (!bySale[uid]) {
        bySale[uid] = {
          user_id: uid,
          order_count: 0,
          revenue: 0,
          paid: 0,
          qty: 0,
          delivered_revenue: 0,
        };
      }
      const row = bySale[uid];
      row.order_count += 1;
      row.revenue += num(o.total);
      row.paid += num(o.paid_amount);
      row.qty += sumItemQty(o);
      if (['delivered', 'shipped'].includes(o.status)) row.delivered_revenue += num(o.total);
    }

    const byInstall = {};
    for (const o of orders) {
      const uid = o.sx_construction_assignee_id;
      if (!uid || o.status === 'cancelled') continue;
      if (!byInstall[uid]) {
        byInstall[uid] = {
          user_id: uid,
          order_count: 0,
          revenue: 0,
          qty: 0,
          delivered_qty: 0,
        };
      }
      const row = byInstall[uid];
      row.order_count += 1;
      row.revenue += num(o.total);
      const q = sumItemQty(o);
      row.qty += q;
      if (['delivered', 'shipped'].includes(o.status)) row.delivered_qty += q;
    }

    const saleRows = Object.values(bySale).map((row) => {
      const u = userMap[row.user_id];
      const dn = u?.department_id ? deptMap[u.department_id]?.name || '—' : '—';
      return {
        ...row,
        full_name: u?.full_name || 'Không rõ',
        department_id: u?.department_id || null,
        department_name: dn,
      };
    });

    const maxSaleRev = Math.max(0, ...saleRows.map((r) => r.revenue));
    const saleWithScore = saleRows.map((row) => ({
      ...row,
      score: scoreFromShare(row.revenue, maxSaleRev),
      payment_ratio: row.revenue > 0 ? Math.round((row.paid / row.revenue) * 1000) / 10 : 0,
    }));

    const installRows = Object.values(byInstall).map((row) => {
      const u = userMap[row.user_id];
      const dn = u?.department_id ? deptMap[u.department_id]?.name || '—' : '—';
      return {
        ...row,
        full_name: u?.full_name || 'Không rõ',
        department_id: u?.department_id || null,
        department_name: dn,
      };
    });
    const maxInstQty = Math.max(0, ...installRows.map((r) => r.qty));
    const installWithScore = installRows.map((row) => ({
      ...row,
      score: scoreFromShare(row.qty, maxInstQty),
    }));

    const deptAgg = {};
    for (const row of saleWithScore) {
      const dk = row.department_id || 'none';
      if (!deptAgg[dk]) {
        deptAgg[dk] = {
          department_id: row.department_id,
          department_name: row.department_id ? row.department_name : 'Chưa gán phòng',
          revenue: 0,
          orders: 0,
          headcount: new Set(),
        };
      }
      deptAgg[dk].revenue += row.revenue;
      deptAgg[dk].orders += row.order_count;
      deptAgg[dk].headcount.add(row.user_id);
    }
    const by_department = Object.values(deptAgg).map((d) => ({
      department_id: d.department_id,
      department_name: d.department_name,
      revenue: d.revenue,
      orders: d.orders,
      staff_count: d.headcount.size,
    }));

    const monthly = {};
    for (const o of activeSales) {
      const d = o.created_at ? new Date(o.created_at) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthly[key]) monthly[key] = { month: key, revenue: 0, orders: 0, qty: 0 };
      monthly[key].revenue += num(o.total);
      monthly[key].orders += 1;
      monthly[key].qty += sumItemQty(o);
    }
    const monthly_series = Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month));

    const cross_checks = [];
    const leadTotals = {};
    for (const o of activeSales) {
      if (!o.lead_id) continue;
      leadTotals[o.lead_id] = (leadTotals[o.lead_id] || 0) + num(o.total);
    }
    for (const lid of Object.keys(leadTotals)) {
      const lead = leadMap[lid];
      if (!lead) continue;
      const ot = leadTotals[lid];
      const ev = num(lead.estimated_value);
      const diff = Math.abs(ev - ot);
      if (ev > 0 && diff > Math.max(10000, ev * 0.02)) {
        cross_checks.push({
          type: 'lead_vs_orders',
          lead_id: lid,
          lead_code: lead.code,
          lead_title: lead.title,
          estimated_value: ev,
          orders_total: ot,
          diff,
        });
      }
    }

    for (const o of activeSales) {
      if (!o.project_id) continue;
      const p = projectMap[o.project_id];
      if (!p) continue;
      const pv = num(p.estimated_value);
      const ov = num(o.total);
      const diff = Math.abs(pv - ov);
      if (pv > 0 && diff > Math.max(10000, pv * 0.02)) {
        cross_checks.push({
          type: 'project_vs_order',
          order_id: o.id,
          order_code: o.code,
          project_id: p.id,
          project_code: p.code,
          project_name: p.name,
          project_value: pv,
          order_total: ov,
          diff,
        });
      }
    }

    const totals = {
      revenue: activeSales.reduce((s, o) => s + num(o.total), 0),
      paid: activeSales.reduce((s, o) => s + num(o.paid_amount), 0),
      orders: activeSales.length,
      qty: activeSales.reduce((s, o) => s + sumItemQty(o), 0),
      install_orders: orders.filter((o) => o.sx_construction_assignee_id && o.status !== 'cancelled').length,
    };

    let acceptances = [];
    try {
      const orderIds = activeSales.map((o) => o.id).filter(Boolean);
      if (orderIds.length) {
        const { data: acc } = await supabase
          .from('order_cross_acceptances')
          .select('*')
          .in('order_id', orderIds.slice(0, 500));
        acceptances = acc || [];
      }
    } catch {
      acceptances = [];
    }

    res.json({
      period: { date_from: dateFrom, date_to: dateTo },
      totals,
      sales_by_user: saleWithScore.sort((a, b) => b.revenue - a.revenue),
      install_by_user: installWithScore.sort((a, b) => b.qty - a.qty),
      by_department: by_department.sort((a, b) => b.revenue - a.revenue),
      monthly_series,
      cross_checks: cross_checks.slice(0, 100),
      cross_checks_truncated: cross_checks.length > 100,
      acceptances,
      attribution_note:
        'Doanh thu Sale gán theo NV phụ trách Deal/Lead (assigned_to → lead_owner → người tạo đơn). Lắp đặt theo sx_construction_assignee_id trên đơn.',
    });
  } catch (e) {
    console.error('[executive/summary]', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/crm/executive/acceptance  — ghi nhận đối soát (bảng tuỳ chọn)
// ═══════════════════════════════════════════════════════════════════════════
r.post('/acceptance', async (req, res) => {
  try {
    if (!canExecutive(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { order_id, check_type, notes, snapshot_order_total, snapshot_lead_value, snapshot_project_value } = req.body || {};
    if (!order_id) return res.status(400).json({ error: 'Thiếu order_id' });

    const ctype = check_type || 'crm_vs_orders';
    const patch = {
      status: 'accepted',
      notes: notes || null,
      checked_by: req.user.userId,
      checked_at: new Date().toISOString(),
      snapshot_order_total: snapshot_order_total != null ? num(snapshot_order_total) : null,
      snapshot_lead_value: snapshot_lead_value != null ? num(snapshot_lead_value) : null,
      snapshot_project_value: snapshot_project_value != null ? num(snapshot_project_value) : null,
    };

    const { data: existing, error: selErr } = await supabase
      .from('order_cross_acceptances')
      .select('id')
      .eq('order_id', order_id)
      .eq('check_type', ctype)
      .maybeSingle();

    if (selErr && selErr.code !== 'PGRST116') {
      if (String(selErr.message || '').includes('relation') || selErr.code === '42P01') {
        return res.status(503).json({
          error: 'Chưa áp dụng migration database/109_order_cross_acceptances.sql',
        });
      }
      throw selErr;
    }

    let row;
    if (existing?.id) {
      const { data, error } = await supabase
        .from('order_cross_acceptances')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await supabase
        .from('order_cross_acceptances')
        .insert({
          order_id,
          check_type: ctype,
          ...patch,
        })
        .select('*')
        .single();
      if (error) {
        if (String(error.message || '').includes('relation') || error.code === '42P01') {
          return res.status(503).json({
            error: 'Chưa áp dụng migration database/109_order_cross_acceptances.sql',
          });
        }
        throw error;
      }
      row = data;
    }

    res.json(row);
  } catch (e) {
    console.error('[executive/acceptance]', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

module.exports = r;
