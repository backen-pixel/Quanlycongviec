/**
 * Quản lý lỗi — dùng chung cho MỌI module (CRM, Sản xuất, VC, Kế toán).
 *
 * Route cũ `/logistics/projects/:id/incidents` gắn chặt vào một dự án: xem được lỗi của
 * dự án đang mở, nhưng không trả lời được «hôm nay cả công ty có bao nhiêu lỗi chưa xử lý».
 * Ở đây đi theo chiều ngang — lọc theo trạng thái, loại, người xử lý, module.
 *
 * Lỗi HỆ THỐNG không thuộc module nào: nút hỏng ở CRM vẫn do đội kỹ thuật sửa. Nên module
 * chỉ là BỘ LỌC MẶC ĐỊNH của từng trang, không phải tường ngăn.
 */
const express = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { createNotification } = require('../helpers/notifications');

const r = express.Router();
r.use(auth);

const TRANG_THAI = ['tiep_nhan', 'dang_lam', 'dang_cho', 'hoan_thanh'];
const MUC_DO = ['low', 'medium', 'high', 'critical'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const uuidHoacNull = (v) => (v && UUID_RE.test(String(v).trim()) ? String(v).trim() : null);

/** Công ty người dùng được xem. null = không giới hạn (admin hệ thống). */
function congTyChoPhep(user) {
  const { isSystemAdmin } = require('../helpers/adminRole');
  if (isSystemAdmin(user)) return null;
  return user?.company_id ? [String(user.company_id)] : null;
}

// ── DANH SÁCH ────────────────────────────────────────────────────────────────
r.get('/', async (req, res) => {
  try {
    const { status, error_type_id, assignee_id, project_id, reported_by, q, limit } = req.query;
    let qr = supabase
      .from('project_incidents')
      .select(`
        id, project_id, title, description, severity, status, deadline,
        error_type_id, assignee_id, company_id, reported_by,
        created_at, updated_at, resolved_at, closed_at,
        loai:shared_workspace_error_types(id, name, slug, source_kind),
        nguoi_bao:users!project_incidents_reported_by_fkey(id, full_name, email, avatar),
        nguoi_xu_ly:users!project_incidents_assignee_id_fkey(id, full_name, email, avatar),
        du_an:projects(id, code, name)
      `)
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(limit) || 300, 1000));

    if (status && TRANG_THAI.includes(status)) qr = qr.eq('status', status);
    if (uuidHoacNull(error_type_id)) qr = qr.eq('error_type_id', error_type_id);
    if (uuidHoacNull(assignee_id)) qr = qr.eq('assignee_id', assignee_id);
    if (uuidHoacNull(project_id)) qr = qr.eq('project_id', project_id);
    if (uuidHoacNull(reported_by)) qr = qr.eq('reported_by', reported_by);
    if (q && String(q).trim()) {
      const s = String(q).trim().replace(/[%_]/g, '');
      qr = qr.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
    }

    const cids = congTyChoPhep(req.user);
    if (cids) qr = qr.or(`company_id.is.null,company_id.in.(${cids.join(',')})`);

    const { data, error } = await qr;
    if (error) throw error;

    // Đếm bình luận và tệp theo lô — thẻ cần hiện 💬 3 · 📷 2 mà không gọi thêm API.
    const ids = (data || []).map((x) => x.id);
    const demBl = new Map();
    const demFile = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      const lo = ids.slice(i, i + 100);
      const [{ data: bl }, { data: fl }] = await Promise.all([
        supabase.from('project_incident_comments').select('incident_id').in('incident_id', lo).is('deleted_at', null),
        supabase.from('file_attachments').select('entity_id').eq('entity_type', 'project_incident').in('entity_id', lo),
      ]);
      for (const x of bl || []) demBl.set(x.incident_id, (demBl.get(x.incident_id) || 0) + 1);
      for (const x of fl || []) demFile.set(x.entity_id, (demFile.get(x.entity_id) || 0) + 1);
    }

    res.json({
      data: (data || []).map((x) => ({
        ...x,
        so_binh_luan: demBl.get(x.id) || 0,
        so_tep: demFile.get(x.id) || 0,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TẠO ──────────────────────────────────────────────────────────────────────
r.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.title || '').trim()) return res.status(400).json({ error: 'Thiếu tiêu đề lỗi' });

    /**
     * `thanh_phan` là dấu vết DOM do menu chuột phải bắt được (xem batThanhPhanLoi.js).
     * Gắn vào cuối mô tả thay vì cột riêng: người sửa đọc một mạch là đủ, và không phải
     * đổi schema mỗi lần thêm một thông tin môi trường.
     */
    let moTa = String(b.description || '').trim();
    if (b.thanh_phan && typeof b.thanh_phan === 'object') {
      const tp = b.thanh_phan;
      const dong = [
        '',
        '───── Thành phần bị lỗi ─────',
        tp.khu_vuc ? `Khu vực: ${tp.khu_vuc}` : null,
        tp.chu ? `Nội dung: ${tp.chu}` : null,
        tp.the ? `Thẻ: <${tp.the}>` : null,
        tp.trang?.url ? `Trang: ${tp.trang.url}` : null,
        tp.trang?.man_hinh ? `Màn hình: ${tp.trang.man_hinh}` : null,
        tp.css ? `CSS: ${tp.css}` : null,
      ].filter(Boolean);
      moTa = `${moTa}\n${dong.join('\n')}`.trim();
    }

    const row = {
      project_id: uuidHoacNull(b.project_id),
      title: String(b.title).trim(),
      description: moTa || null,
      severity: MUC_DO.includes(b.severity) ? b.severity : 'medium',
      status: 'tiep_nhan',
      error_type_id: uuidHoacNull(b.error_type_id),
      assignee_id: uuidHoacNull(b.assignee_id),
      company_id: uuidHoacNull(b.company_id) || req.user?.company_id || null,
      deadline: b.deadline || null,
      reported_by: req.user?.id || req.user?.userId || null,
    };

    const { data, error } = await supabase.from('project_incidents').insert(row).select('*').single();
    if (error) throw error;

    // Người xử lý mặc định của loại lỗi — khai ở /management/shared-workspace-settings.
    if (row.error_type_id && !row.assignee_id) {
      const { data: staff } = await supabase.from('shared_workspace_error_type_staff')
        .select('user_id').eq('error_type_id', row.error_type_id).limit(5);
      for (const s of staff || []) {
        await createNotification(
          req, s.user_id, 'bao_loi_moi',
          '🐞 Lỗi mới cần xử lý', data.title,
          'project_incident', data.id,
        ).catch(() => {});
      }
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SỬA / ĐỔI TRẠNG THÁI ─────────────────────────────────────────────────────
r.put('/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const { data: cu } = await supabase.from('project_incidents')
      .select('id, status, reported_by, assignee_id, title').eq('id', req.params.id).maybeSingle();
    if (!cu) return res.status(404).json({ error: 'Không thấy lỗi' });

    const up = { updated_at: new Date().toISOString() };
    if (b.title !== undefined) up.title = String(b.title).trim();
    if (b.description !== undefined) up.description = b.description;
    if (b.severity !== undefined && MUC_DO.includes(b.severity)) up.severity = b.severity;
    if (b.error_type_id !== undefined) up.error_type_id = uuidHoacNull(b.error_type_id);
    if (b.assignee_id !== undefined) up.assignee_id = uuidHoacNull(b.assignee_id);
    if (b.deadline !== undefined) up.deadline = b.deadline || null;
    if (b.status !== undefined && TRANG_THAI.includes(b.status)) {
      up.status = b.status;
      // Mốc thời gian đi kèm trạng thái — báo cáo «xử lý mất bao lâu» cần chúng.
      if (b.status === 'hoan_thanh') {
        up.closed_at = new Date().toISOString();
        up.resolved_at = up.closed_at;
        up.resolved_by = req.user?.id || req.user?.userId || null;
      } else {
        up.closed_at = null;
      }
    }

    const { data, error } = await supabase.from('project_incidents')
      .update(up).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // Đổi trạng thái → báo cho người ĐÃ BÁO lỗi. Họ là người chờ tin nhất.
    const nguoiBao = cu.reported_by;
    const toi = String(req.user?.id || req.user?.userId || '');
    if (up.status && up.status !== cu.status && nguoiBao && String(nguoiBao) !== toi) {
      const nhan = {
        tiep_nhan: 'đã tiếp nhận', dang_lam: 'đang xử lý',
        dang_cho: 'đang chờ', hoan_thanh: 'đã xử lý xong',
      }[up.status] || up.status;
      await createNotification(
        req, nguoiBao, 'bao_loi_doi_trang_thai',
        `🐞 Lỗi bạn báo ${nhan}`, cu.title,
        'project_incident', cu.id,
      ).catch(() => {});
    }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── BÌNH LUẬN ────────────────────────────────────────────────────────────────
r.get('/:id/comments', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('project_incident_comments')
      .select('id, incident_id, content, attachments, parent_id, created_at, user:users(id, full_name, email, avatar)')
      .eq('incident_id', req.params.id)
      .is('deleted_at', null)
      .order('created_at');
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/:id/comments', async (req, res) => {
  try {
    const noiDung = String(req.body?.content || '').trim();
    if (!noiDung) return res.status(400).json({ error: 'Bình luận trống' });

    const { data: loi } = await supabase.from('project_incidents')
      .select('id, title, reported_by, assignee_id').eq('id', req.params.id).maybeSingle();
    if (!loi) return res.status(404).json({ error: 'Không thấy lỗi' });

    const toi = req.user?.id || req.user?.userId || null;
    const { data, error } = await supabase.from('project_incident_comments').insert({
      incident_id: req.params.id,
      user_id: toi,
      content: noiDung,
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
      parent_id: uuidHoacNull(req.body?.parent_id),
    }).select('id, incident_id, content, attachments, parent_id, created_at, user:users(id, full_name, email, avatar)').single();
    if (error) throw error;

    // Báo cho người báo lỗi VÀ người đang xử lý — trừ chính mình.
    const nhan = new Set([loi.reported_by, loi.assignee_id].filter(Boolean).map(String));
    nhan.delete(String(toi));
    for (const uid of nhan) {
      await createNotification(
        req, uid, 'bao_loi_binh_luan',
        '💬 Bình luận mới trên lỗi', `${loi.title}: ${noiDung.slice(0, 80)}`,
        'project_incident', loi.id,
      ).catch(() => {});
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
