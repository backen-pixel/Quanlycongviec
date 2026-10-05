/**
 * Chấm điểm ĐẦY ĐỦ THÔNG TIN & TƯƠNG TÁC của lead — 0..100 + nhãn.
 *
 * ĐIỀM NÀY KHÔNG PHẢI XÁC SUẤT CHỐT ĐƠN.
 * Đối chiếu trên dữ liệu thật (25/09/2026) cho thấy điểm cao KHÔNG tương quan
 * với tỉ lệ thành deal, vì phần lớn deal được tạo qua luồng khác (không qua
 * Messenger) nên thiếu hẳn tín hiệu để chấm. Xem docs/architecture/
 * ke-hoach-cong-du-lieu-lead-facebook.md trước khi dùng điểm để ra quyết định ngân sách.
 *
 * Dùng được cho: quảng cáo nào gửi về người thật có số điện thoại và có trả lời,
 * quảng cáo nào chỉ ra cú bấm nhầm.
 *
 * Chín tiêu chí, tổng 100 điểm. Deal đã chốt ép nhãn 'da_chot'.
 */
const { supabase } = require('../config/supabase');

const DIEM = {
  co_sdt: 25,        // có số điện thoại hợp lệ
  sdt_sach: 10,      // không trùng khách cũ, không nằm trong blocklist
  hai_chieu: 15,     // khách có nhắn lại (>= 2 tin từ khách)
  do_sau: 10,        // >= 6 tin nhắn tổng
  phan_hoi_nhanh: 10,// chạm đầu <= 15 phút
  co_thong_tin: 10,  // có địa chỉ hoặc mô tả nhu cầu
  tien_giai_doan: 10,// đã tiến ít nhất 1 cột pipeline
  co_bao_gia: 5,     // có báo giá gắn lead
  da_chot: 5,        // deal đã chốt
};

const NGUONG = [
  { toi_thieu: 75, nhan: 'nong' },
  { toi_thieu: 50, nhan: 'am' },
  { toi_thieu: 25, nhan: 'lanh' },
  { toi_thieu: 0, nhan: 'rac' },
];

const RE_SDT_VN = /^(0|84|\+84)(3|5|7|8|9)\d{8}$/;

function chuanSdt(raw) {
  const s = String(raw || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('+84')) return `0${s.slice(3)}`;
  if (s.startsWith('84') && s.length >= 11) return `0${s.slice(2)}`;
  return s;
}

function sdtHopLe(raw) {
  const s = chuanSdt(raw);
  return !!(s && RE_SDT_VN.test(s));
}

function nhanTuDiem(diem) {
  for (const n of NGUONG) if (diem >= n.toi_thieu) return n.nhan;
  return 'rac';
}

/**
 * Tính điểm cho một loạt lead. Trả mảng { lead_id, diem, nhan, thanh_phan }.
 * Gom truy vấn theo lô để không bắn N+1 query.
 *
 * @param {string[]} leadIds
 */
async function chamDiemLeads(leadIds) {
  const ids = [...new Set((leadIds || []).map(String).filter(Boolean))];
  if (!ids.length) return [];

  const { data: leads, error: eL } = await supabase
    .from('crm_leads')
    .select(`
      id, type, phone, customer_id, install_address, description,
      first_touch_time, created_at, actual_close_date, stage_id,
      estimated_value, company_id
    `)
    .in('id', ids);
  if (eL) throw new Error(eL.message);
  if (!leads?.length) return [];

  const idsThat = leads.map((l) => l.id);

  const [khachRows, contactRows, lichSuRows, baoGiaRows, blockRows] = await Promise.all([
    supabase.from('customers').select('id, phone').in('id', leads.map((l) => l.customer_id).filter(Boolean))
      .then((r) => r.data || [], () => []),
    supabase.from('facebook_contacts').select('id, lead_id, phone').in('lead_id', idsThat)
      .then((r) => r.data || [], () => []),
    supabase.from('crm_lead_stage_history').select('lead_id, to_stage_id').in('lead_id', idsThat)
      .then((r) => r.data || [], () => []),
    supabase.from('quotations').select('id, lead_id').in('lead_id', idsThat)
      .then((r) => r.data || [], () => []),
    supabase.from('crm_auto_lead_blocked_phones').select('phone_last9')
      .then((r) => r.data || [], () => []),
  ]);

  const sdtKhach = new Map(khachRows.map((c) => [String(c.id), c.phone]));
  const contactTheoLead = new Map();
  for (const c of contactRows) {
    const k = String(c.lead_id);
    if (!contactTheoLead.has(k)) contactTheoLead.set(k, []);
    contactTheoLead.get(k).push(c);
  }

  // Đếm tin nhắn theo contact (chỉ lấy contact của các lead đang chấm)
  const contactIds = contactRows.map((c) => c.id);
  const tinTheoContact = new Map();
  if (contactIds.length) {
    const { data: tin } = await supabase
      .from('facebook_messages')
      .select('contact_id, direction')
      .in('contact_id', contactIds)
      .limit(20000);
    for (const m of tin || []) {
      const k = String(m.contact_id);
      if (!tinTheoContact.has(k)) tinTheoContact.set(k, { tong: 0, tu_khach: 0 });
      const o = tinTheoContact.get(k);
      o.tong += 1;
      if (String(m.direction || '').toLowerCase() === 'inbound') o.tu_khach += 1;
    }
  }

  const soCotTheoLead = new Map();
  for (const h of lichSuRows) {
    const k = String(h.lead_id);
    soCotTheoLead.set(k, (soCotTheoLead.get(k) || 0) + 1);
  }
  const coBaoGia = new Set(baoGiaRows.map((q) => String(q.lead_id)));
  const chanSdt = new Set((blockRows || []).map((b) => String(b.phone_last9)));

  // Số điện thoại xuất hiện ở bao nhiêu lead — để phát hiện trùng
  const demSdt = new Map();
  for (const l of leads) {
    const sdt = chuanSdt(l.phone || sdtKhach.get(String(l.customer_id)));
    if (sdt) demSdt.set(sdt, (demSdt.get(sdt) || 0) + 1);
  }

  const ketQua = [];
  for (const l of leads) {
    const tp = {};
    const contacts = contactTheoLead.get(String(l.id)) || [];
    let tong = 0;
    let tuKhach = 0;
    for (const c of contacts) {
      const o = tinTheoContact.get(String(c.id));
      if (o) { tong += o.tong; tuKhach += o.tu_khach; }
    }

    const sdt = chuanSdt(l.phone || sdtKhach.get(String(l.customer_id)) || contacts.find((c) => c.phone)?.phone);

    if (sdtHopLe(sdt)) tp.co_sdt = DIEM.co_sdt;
    const sdt9 = sdt ? sdt.replace(/\D/g, '').slice(-9) : null;
    if (sdt && sdtHopLe(sdt) && !chanSdt.has(sdt9) && (demSdt.get(sdt) || 0) <= 1) tp.sdt_sach = DIEM.sdt_sach;
    if (tuKhach >= 2) tp.hai_chieu = DIEM.hai_chieu;
    if (tong >= 6) tp.do_sau = DIEM.do_sau;

    if (l.first_touch_time && l.created_at) {
      const phut = (new Date(l.first_touch_time) - new Date(l.created_at)) / 60000;
      if (phut >= 0 && phut <= 15) tp.phan_hoi_nhanh = DIEM.phan_hoi_nhanh;
    }

    const coDiaChi = !!String(l.install_address || '').trim();
    const coMoTa = String(l.description || '').trim().length >= 20;
    if (coDiaChi || coMoTa) tp.co_thong_tin = DIEM.co_thong_tin;

    if ((soCotTheoLead.get(String(l.id)) || 0) >= 1) tp.tien_giai_doan = DIEM.tien_giai_doan;
    if (coBaoGia.has(String(l.id))) tp.co_bao_gia = DIEM.co_bao_gia;

    const daChot = l.type === 'deal' && !!l.actual_close_date;
    if (daChot) tp.da_chot = DIEM.da_chot;

    const diem = Math.min(100, Object.values(tp).reduce((a, b) => a + b, 0));
    ketQua.push({
      lead_id: l.id,
      diem,
      nhan: daChot ? 'da_chot' : nhanTuDiem(diem),
      thanh_phan: tp,
    });
  }
  return ketQua;
}

/** Ghi điểm vào lead_quality_scores (upsert theo lead_id). */
async function luuDiem(rows) {
  if (!rows?.length) return { da_ghi: 0 };
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({ ...r, tinh_luc: now }));
  let daGhi = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const lo = payload.slice(i, i + 500);
    const { error } = await supabase
      .from('lead_quality_scores')
      .upsert(lo, { onConflict: 'lead_id' });
    if (error) {
      console.warn('[cham-diem] luu:', error.message);
      continue;
    }
    daGhi += lo.length;
  }
  return { da_ghi: daGhi };
}

/** Chấm + lưu một lô lead. */
async function chamVaLuu(leadIds) {
  const rows = await chamDiemLeads(leadIds);
  const kq = await luuDiem(rows);
  return { da_cham: rows.length, ...kq };
}

module.exports = { chamDiemLeads, luuDiem, chamVaLuu, chuanSdt, sdtHopLe, nhanTuDiem, DIEM, NGUONG };
