/**
 * Tổng kết vòng đời dự án — gom dữ liệu cho tab "Tổng kết" ở chi tiết dự án.
 * Từ lúc deal CRM hình thành → sản xuất → VC/LĐ → nghiệm thu → đóng hồ sơ.
 */
const { supabase } = require('../config/supabase');

const MODULE_NHAN = { crm: 'CRM', sx: 'Sản xuất', vc: 'VC/LĐ', khac: 'Khác' };

const SU_KIEN_NHAN = {
  created: 'Tạo mới',
  status_changed: 'Đổi trạng thái',
  completed: 'Hoàn thành',
  deadline_changed: 'Đổi hạn',
  deleted: 'Xoá',
  assignee_changed: 'Đổi người phụ trách',
  comment_added: 'Bình luận',
};

// Thao tác được coi là "phát sinh / thay đổi" chứ không phải tiến triển bình thường
const SU_KIEN_PHAT_SINH = new Set(['deadline_changed', 'assignee_changed', 'deleted']);

function ngay(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function soNgay(tu, den) {
  const a = tu ? new Date(tu) : null;
  const b = den ? new Date(den) : null;
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function moduleCuaTask(task) {
  const meta = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  if (meta.workshop_area === 'logistics') return 'vc';
  if (meta.workshop_area === 'production') return 'sx';
  if (meta.imported_from === 'crm_deal' || meta.deal_id) return 'crm';
  return 'khac';
}

const DUOI_ANH = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i;

function laAnh(mime, ten) {
  if (/^image\//i.test(String(mime || ''))) return true;
  return DUOI_ANH.test(String(ten || ''));
}

/** URL base64 (data:) có thể nặng hàng MB — không đẩy về client. */
function urlAnToan(u) {
  const raw = String(u || '');
  if (!raw) return { url: null, nhung: false };
  if (raw.startsWith('data:')) return { url: null, nhung: true };
  return { url: raw, nhung: false };
}

async function layBang(bang, cot, loc) {
  let q = supabase.from(bang).select(cot);
  for (const [k, v] of Object.entries(loc || {})) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) {
    console.warn(`[tong-ket] ${bang}:`, error.message);
    return [];
  }
  return data || [];
}

async function buildProjectSummaryReport(projectId) {
  const { data: project, error: pe } = await supabase
    .from('projects')
    .select(`
      id, code, name, status, created_at, updated_at, completed_date,
      consult_date, order_date, production_start_date, production_finish_date,
      delivery_date, install_date, construction_start_date, deadline,
      estimated_value, final_value, production_value, install_address, notes,
      company_id, logistics_company_id, workshop_type_id,
      sx_kanban_column_id, vc_kanban_column_id, current_stage_id, customer_id
    `)
    .eq('id', projectId)
    .maybeSingle();
  if (pe) throw new Error(pe.message);
  if (!project) return { ok: false, statusCode: 404, error: 'Không tìm thấy dự án' };

  const [
    khach, congTy, congTyVc, loaiDa, deal,
  ] = await Promise.all([
    project.customer_id
      ? supabase.from('customers').select('id, full_name, phone, address').eq('id', project.customer_id).maybeSingle().then((r) => r.data)
      : null,
    project.company_id
      ? supabase.from('companies').select('id, name').eq('id', project.company_id).maybeSingle().then((r) => r.data)
      : null,
    project.logistics_company_id
      ? supabase.from('companies').select('id, name').eq('id', project.logistics_company_id).maybeSingle().then((r) => r.data)
      : null,
    project.workshop_type_id
      ? supabase.from('workshop_project_types').select('id, name').eq('id', project.workshop_type_id).maybeSingle().then((r) => r.data)
      : null,
    supabase.from('crm_leads')
      .select('id, code, title, stage_id, created_at, actual_close_date, expected_close_date, estimated_value, deposit_amount, region_id, sx_handover_at')
      .eq('project_id', projectId).eq('type', 'deal')
      .order('created_at', { ascending: true }).limit(1).maybeSingle().then((r) => r.data),
  ]);

  // ── Nhiệm vụ + checklist ────────────────────────────────────────────────
  const tasks = await layBang(
    'tasks',
    'id, title, status, priority, due_date, deadline, completed_at, created_at, assignee_id, stage_id, metadata, order_index',
    { project_id: projectId },
  );
  const taskIds = tasks.map((t) => t.id);

  let checklists = [];
  if (taskIds.length) {
    const { data } = await supabase
      .from('task_checklists')
      .select('id, task_id, title, is_completed, completed_at')
      .in('task_id', taskIds);
    checklists = data || [];
  }
  const checklistTheoTask = new Map();
  for (const c of checklists) {
    const k = String(c.task_id);
    if (!checklistTheoTask.has(k)) checklistTheoTask.set(k, []);
    checklistTheoTask.get(k).push(c);
  }

  // ── Lịch sử thao tác ────────────────────────────────────────────────────
  const { data: lichSuRaw } = await supabase
    .from('unified_task_history')
    .select('id, source, source_id, event_type, field_name, old_value, new_value, description, actor_user_id, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(800);
  const lichSu = lichSuRaw || [];

  // ── Cột pipeline ────────────────────────────────────────────────────────
  const [cotSx, cotVc, giaiDoanCrm, buocWf] = await Promise.all([
    supabase.from('production_pipeline_stages').select('id, name, order_index, company_id').then((r) => r.data || []),
    supabase.from('logistics_pipeline_stages').select('id, name, order_index, company_id').then((r) => r.data || []),
    supabase.from('crm_pipeline_stages').select('id, name, order_index, is_won, is_lost').then((r) => r.data || []),
    supabase.from('workflow_stages').select('id, name, slug, order_index').then((r) => r.data || []),
  ]);
  const tenCot = new Map();
  for (const s of cotSx) tenCot.set(String(s.id), { ten: s.name, module: 'sx', thu_tu: s.order_index });
  for (const s of cotVc) tenCot.set(String(s.id), { ten: s.name, module: 'vc', thu_tu: s.order_index });
  for (const s of giaiDoanCrm) tenCot.set(String(s.id), { ten: s.name, module: 'crm', thu_tu: s.order_index });
  const tenBuocWf = new Map(buocWf.map((s) => [String(s.id), s.name]));

  // ── Người dùng ──────────────────────────────────────────────────────────
  const [hoSoCrm, fileDuAn, fileNhiemVu] = await Promise.all([
    supabase.from('lead_documents')
      .select('id, name, file_name, file_url, file_size, mime_type, doc_type, crm_stage_group_label, created_by, created_at, source_project_task_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(400)
      .then((rr) => rr.data || [], () => []),
    supabase.from('file_attachments')
      .select('id, file_name, file_url, file_size, mime_type, uploaded_by, created_at, notes')
      .eq('entity_type', 'project').eq('entity_id', projectId)
      .order('created_at', { ascending: true })
      .limit(300)
      .then((rr) => rr.data || [], () => []),
    taskIds.length
      ? supabase.from('file_attachments')
        .select('id, entity_id, file_name, file_url, file_size, mime_type, uploaded_by, created_at, notes')
        .eq('entity_type', 'task').in('entity_id', taskIds)
        .order('created_at', { ascending: true })
        .limit(300)
        .then((rr) => rr.data || [], () => [])
      : Promise.resolve([]),
  ]);

  const userIds = [...new Set([
    ...tasks.map((t) => t.assignee_id),
    ...lichSu.map((h) => h.actor_user_id),
    ...hoSoCrm.map((d) => d.created_by),
    ...fileDuAn.map((d) => d.uploaded_by),
    ...fileNhiemVu.map((d) => d.uploaded_by),
  ].filter(Boolean).map(String))];
  let users = [];
  if (userIds.length) {
    const { data } = await supabase.from('users').select('id, full_name, avatar').in('id', userIds);
    users = data || [];
  }
  const tenNguoi = new Map(users.map((u) => [String(u.id), { ten: u.full_name, anh: u.avatar }]));

  // ── Lịch sử giai đoạn CRM ───────────────────────────────────────────────
  let lichSuCrm = [];
  if (deal?.id) {
    const { data } = await supabase
      .from('crm_lead_stage_history')
      .select('id, from_stage_id, to_stage_id, entered_at, exited_at, duration_seconds, changed_by')
      .eq('lead_id', deal.id)
      .order('entered_at', { ascending: true });
    lichSuCrm = data || [];
  }

  const chuyenBuoc = await layBang(
    'stage_transitions',
    'id, from_stage_id, to_stage_id, notes, transitioned_by, created_at',
    { project_id: projectId },
  );

  // ── Mốc vòng đời ────────────────────────────────────────────────────────
  const moc = [];
  const themMoc = (key, nhan, luc, nguon, ghi_chu) => {
    const t = ngay(luc);
    if (t) moc.push({ key, nhan, thoi_diem: t, nguon, ghi_chu: ghi_chu || null });
  };
  themMoc('deal_tao', 'Hình thành cơ hội (CRM)', deal?.created_at || project.created_at, 'crm');
  themMoc('du_an_tao', 'Tạo dự án', project.created_at, 'project');
  themMoc('tu_van', 'Tư vấn khách', project.consult_date, 'crm');
  themMoc('chot_don', 'Chốt đơn', project.order_date || deal?.actual_close_date, 'crm');
  themMoc('ban_giao_sx', 'Bàn giao sang sản xuất', deal?.sx_handover_at, 'sx');
  themMoc('sx_bat_dau', 'Bắt đầu sản xuất', project.production_start_date, 'sx');
  themMoc('sx_xong', 'Sản xuất xong', project.production_finish_date, 'sx');
  themMoc('giao_hang', 'Giao hàng', project.delivery_date, 'vc');
  themMoc('lap_dat', 'Lắp đặt', project.install_date, 'vc');
  themMoc('thi_cong', 'Khởi công tại công trình', project.construction_start_date, 'vc');
  themMoc('hoan_thanh', 'Hoàn thành / nghiệm thu', project.completed_date, 'vc');
  moc.sort((a, b) => new Date(a.thoi_diem) - new Date(b.thoi_diem));

  // ── Giai đoạn: gom nhiệm vụ theo cột ────────────────────────────────────
  const nhiemVu = tasks.map((t) => {
    const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
    const mod = moduleCuaTask(t);
    const cotId = mod === 'vc'
      ? (meta.logistics_pipeline_stage_id || null)
      : (mod === 'sx' ? (meta.production_pipeline_stage_id || null) : null);
    const cot = cotId ? tenCot.get(String(cotId)) : null;
    const cl = checklistTheoTask.get(String(t.id)) || [];
    const han = t.deadline || t.due_date || null;
    const xong = t.completed_at || null;
    const treNgay = (han && xong)
      ? Math.max(0, Math.round((new Date(xong) - new Date(han)) / 86400000))
      : (han && !xong ? Math.max(0, Math.round((Date.now() - new Date(han)) / 86400000)) : 0);
    return {
      id: t.id,
      ten: t.title,
      module: mod,
      module_nhan: MODULE_NHAN[mod],
      cot_id: cotId,
      cot: cot?.ten || tenBuocWf.get(String(t.stage_id)) || '—',
      cot_thu_tu: cot?.thu_tu ?? 999,
      trang_thai: t.status,
      da_xong: t.status === 'done' || t.status === 'completed' || !!xong,
      uu_tien: t.priority,
      han: ngay(han),
      xong_luc: ngay(xong),
      tre_ngay: treNgay,
      tao_luc: ngay(t.created_at),
      nguoi_lam: t.assignee_id ? (tenNguoi.get(String(t.assignee_id))?.ten || null) : null,
      checklist_tong: cl.length,
      checklist_xong: cl.filter((c) => c.is_completed).length,
      checklist: cl
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((c) => ({ ten: c.title, xong: !!c.is_completed, xong_luc: ngay(c.completed_at) })),
    };
  });

  const giaiDoan = [];
  const gomCot = new Map();
  for (const nv of nhiemVu) {
    const k = `${nv.module}||${nv.cot}`;
    if (!gomCot.has(k)) {
      gomCot.set(k, {
        module: nv.module,
        module_nhan: nv.module_nhan,
        ten: nv.cot,
        thu_tu: nv.cot_thu_tu,
        so_nhiem_vu: 0,
        so_xong: 0,
        so_tre: 0,
        bat_dau: null,
        ket_thuc: null,
      });
    }
    const g = gomCot.get(k);
    g.so_nhiem_vu += 1;
    if (nv.da_xong) g.so_xong += 1;
    if (nv.tre_ngay > 0) g.so_tre += 1;
    if (nv.tao_luc && (!g.bat_dau || nv.tao_luc < g.bat_dau)) g.bat_dau = nv.tao_luc;
    if (nv.xong_luc && (!g.ket_thuc || nv.xong_luc > g.ket_thuc)) g.ket_thuc = nv.xong_luc;
  }
  const thuTuModule = { crm: 0, sx: 1, vc: 2, khac: 3 };
  for (const g of gomCot.values()) {
    giaiDoan.push({ ...g, so_ngay: soNgay(g.bat_dau, g.ket_thuc) });
  }
  giaiDoan.sort((a, b) => (thuTuModule[a.module] - thuTuModule[b.module]) || (a.thu_tu - b.thu_tu));

  // ── Thao tác ────────────────────────────────────────────────────────────
  const tenTask = new Map(tasks.map((t) => [String(t.id), t.title]));
  const thaoTac = lichSu.map((h) => ({
    id: String(h.id),
    loai: h.event_type,
    loai_nhan: SU_KIEN_NHAN[h.event_type] || h.event_type,
    mo_ta: h.description || null,
    doi_tuong_id: h.source_id ? String(h.source_id) : null,
    doi_tuong: tenTask.get(String(h.source_id)) || null,
    truong: h.field_name || null,
    gia_tri_cu: h.old_value ?? null,
    gia_tri_moi: h.new_value ?? null,
    ai: h.actor_user_id ? (tenNguoi.get(String(h.actor_user_id))?.ten || null) : null,
    luc: ngay(h.created_at),
  }));

  // ── Phát sinh & thay đổi ────────────────────────────────────────────────
  const phatSinh = thaoTac
    .filter((t) => SU_KIEN_PHAT_SINH.has(t.loai))
    .map((t) => ({
      loai: t.loai,
      loai_nhan: t.loai_nhan,
      mo_ta: t.mo_ta || t.doi_tuong || '—',
      doi_tuong: t.doi_tuong,
      gia_tri_cu: t.gia_tri_cu,
      gia_tri_moi: t.gia_tri_moi,
      ai: t.ai,
      luc: t.luc,
      nguon: 'lich_su',
    }));

  const nvPhatSinh = nhiemVu.filter((nv) => /phát sinh|phat sinh|sự cố|su co/i.test(`${nv.cot} ${nv.ten}`));
  for (const nv of nvPhatSinh) {
    phatSinh.push({
      loai: 'nhiem_vu_phat_sinh',
      loai_nhan: 'Nhiệm vụ phát sinh',
      mo_ta: nv.ten,
      doi_tuong: nv.cot,
      gia_tri_cu: null,
      gia_tri_moi: null,
      ai: nv.nguoi_lam,
      luc: nv.tao_luc,
      nguon: 'nhiem_vu',
    });
  }

  const suCo = await layBang(
    'project_incidents',
    'id, title, description, severity, status, created_at, resolved_at',
    { project_id: projectId },
  );
  for (const s of suCo) {
    phatSinh.push({
      loai: 'su_co',
      loai_nhan: 'Sự cố',
      mo_ta: s.title || s.description || '—',
      doi_tuong: s.severity || null,
      gia_tri_cu: null,
      gia_tri_moi: s.status || null,
      ai: null,
      luc: ngay(s.created_at),
      nguon: 'su_co',
    });
  }
  phatSinh.sort((a, b) => new Date(b.luc || 0) - new Date(a.luc || 0));

  // ── Tài liệu / hình ảnh ─────────────────────────────────
  const taiLieu = [];
  const daThayFile = new Set();
  const themTaiLieu = (row) => {
    if (!row) return;
    const khoa = `${row.url || ''}|${row.ten_file || row.ten || ''}|${row.luc || ''}`;
    if (daThayFile.has(khoa)) return;
    daThayFile.add(khoa);
    taiLieu.push(row);
  };

  for (const d of hoSoCrm) {
    if (d.doc_type === 'task_inline_note') continue;
    if (!d.file_url && !d.file_name) continue;
    const u = urlAnToan(d.file_url);
    themTaiLieu({
      id: `ld-${d.id}`,
      ten: d.name || d.file_name || 'Tài liệu',
      ten_file: d.file_name || null,
      url: u.url,
      nhung: u.nhung,
      la_anh: laAnh(d.mime_type, d.file_name),
      mime: d.mime_type || null,
      kich_thuoc: d.file_size || null,
      nhom: d.crm_stage_group_label || d.doc_type || null,
      nguon: 'crm',
      nguon_nhan: 'Hồ sơ CRM',
      doi_tuong: d.source_project_task_id ? (tenTask.get(String(d.source_project_task_id)) || null) : null,
      ai: d.created_by ? (tenNguoi.get(String(d.created_by))?.ten || null) : null,
      luc: ngay(d.created_at),
    });
  }

  for (const d of fileDuAn) {
    const u = urlAnToan(d.file_url);
    themTaiLieu({
      id: `fa-${d.id}`,
      ten: d.file_name || 'Tài liệu',
      ten_file: d.file_name || null,
      url: u.url,
      nhung: u.nhung,
      la_anh: laAnh(d.mime_type, d.file_name),
      mime: d.mime_type || null,
      kich_thuoc: d.file_size || null,
      nhom: d.notes || null,
      nguon: 'du_an',
      nguon_nhan: 'Tài liệu dự án',
      doi_tuong: null,
      ai: d.uploaded_by ? (tenNguoi.get(String(d.uploaded_by))?.ten || null) : null,
      luc: ngay(d.created_at),
    });
  }

  for (const d of fileNhiemVu) {
    const u = urlAnToan(d.file_url);
    themTaiLieu({
      id: `ft-${d.id}`,
      ten: d.file_name || 'Tài liệu',
      ten_file: d.file_name || null,
      url: u.url,
      nhung: u.nhung,
      la_anh: laAnh(d.mime_type, d.file_name),
      mime: d.mime_type || null,
      kich_thuoc: d.file_size || null,
      nhom: d.notes || null,
      nguon: 'nhiem_vu',
      nguon_nhan: 'File nhiệm vụ',
      doi_tuong: tenTask.get(String(d.entity_id)) || null,
      ai: d.uploaded_by ? (tenNguoi.get(String(d.uploaded_by))?.ten || null) : null,
      luc: ngay(d.created_at),
    });
  }
  taiLieu.sort((a, b) => new Date(a.luc || 0) - new Date(b.luc || 0));

  // ── Thống kê ────────────────────────────────────────────────────────────
  const batDau = moc[0]?.thoi_diem || ngay(project.created_at);
  const ketThuc = ngay(project.completed_date) || null;
  const thongKe = {
    tong_nhiem_vu: nhiemVu.length,
    so_xong: nhiemVu.filter((n) => n.da_xong).length,
    so_tre: nhiemVu.filter((n) => n.tre_ngay > 0).length,
    tong_checklist: checklists.length,
    checklist_xong: checklists.filter((c) => c.is_completed).length,
    tong_thao_tac: thaoTac.length,
    so_lan_doi_han: thaoTac.filter((t) => t.loai === 'deadline_changed').length,
    so_lan_doi_nguoi: thaoTac.filter((t) => t.loai === 'assignee_changed').length,
    so_phat_sinh: phatSinh.length,
    so_giai_doan: giaiDoan.length,
    so_tai_lieu: taiLieu.length,
    so_hinh_anh: taiLieu.filter((d) => d.la_anh).length,
    so_moc: moc.length,
    bat_dau: batDau,
    ket_thuc: ketThuc,
    tong_ngay: soNgay(batDau, ketThuc || new Date().toISOString()),
    dang_chay: !ketThuc,
  };

  return {
    ok: true,
    du_an: {
      id: project.id,
      ma: project.code,
      ten: project.name,
      trang_thai: project.status,
      khach_hang: khach?.full_name || null,
      dien_thoai: khach?.phone || null,
      dia_chi: project.install_address || khach?.address || null,
      cong_ty: congTy?.name || null,
      cong_ty_vc: congTyVc?.name || null,
      loai_du_an: loaiDa?.name || null,
      gia_tri: project.final_value ?? project.production_value ?? project.estimated_value ?? null,
      deal_ma: deal?.code || null,
      deal_id: deal?.id || null,
      ghi_chu: project.notes || null,
    },
    moc,
    giai_doan: giaiDoan,
    nhiem_vu: nhiemVu.sort((a, b) => (thuTuModule[a.module] - thuTuModule[b.module])
      || (a.cot_thu_tu - b.cot_thu_tu)
      || String(a.ten).localeCompare(String(b.ten), 'vi')),
    thao_tac: thaoTac.sort((a, b) => new Date(b.luc || 0) - new Date(a.luc || 0)),
    phat_sinh: phatSinh,
    tai_lieu: taiLieu,
    lich_su_crm: lichSuCrm.map((h) => ({
      tu: h.from_stage_id ? (tenCot.get(String(h.from_stage_id))?.ten || null) : null,
      den: h.to_stage_id ? (tenCot.get(String(h.to_stage_id))?.ten || null) : null,
      vao_luc: ngay(h.entered_at),
      ra_luc: ngay(h.exited_at),
      so_ngay: h.duration_seconds ? Math.round(h.duration_seconds / 86400) : null,
    })),
    chuyen_buoc: chuyenBuoc.map((c) => ({
      tu: tenBuocWf.get(String(c.from_stage_id)) || null,
      den: tenBuocWf.get(String(c.to_stage_id)) || null,
      ghi_chu: c.notes || null,
      luc: ngay(c.created_at),
    })),
    thong_ke: thongKe,
  };
}

module.exports = { buildProjectSummaryReport };
