/**
 * Phân tích tự động hiệu quả quảng cáo Facebook — sinh nhận xét bằng LUẬT.
 *
 * Cố ý KHÔNG dùng AI sinh chữ: mỗi nhận xét phải chỉ ra được con số đứng sau nó,
 * và phải lặp lại y hệt khi chạy lại. Quảng cáo là chuyện tiền bạc, không đoán.
 *
 * Ba giới hạn phải nói rõ trong mọi kết quả:
 *   1. CHI TIÊU chỉ có khi đã nối Marketing API. Chưa nối thì tuyệt đối không
 *      nói gì về ROI — thà im còn hơn đoán tiền.
 *   2. Điểm chất lượng đo độ đầy đủ thông tin, KHÔNG phải xác suất chốt.
 *   3. Mẫu nhỏ thì im lặng, không phán.
 */
const { supabase } = require('../config/supabase');
const { layTheoLo, layTheoLoMem } = require('./supabaseLo');

const MAU_TOI_THIEU = 10;       // dưới ngưỡng này không kết luận gì
const MAU_DE_CHE = 15;          // đủ để nói "không ra đơn"
const NGAY_TOI_THIEU = 14;      // quảng cáo phải chạy đủ lâu mới xét
const NGAY_IM_LANG = 7;

const XEP_HANG = { tot: 4, kha: 3, can_xem: 2, kem: 1, chua_du: 0 };

function soNgay(tu, den) {
  if (!tu || !den) return 0;
  return Math.max(0, Math.round((new Date(den) - new Date(tu)) / 86400000));
}

function pct(a, b) {
  return b ? Math.round((a / b) * 100) : 0;
}

function tien(x) {
  return Math.round(Number(x) || 0).toLocaleString('vi-VN');
}

/** Nạp số liệu thô theo từng ad_id trong kỳ. */
async function napSoLieuTheoAd({ ngay = 90 } = {}) {
  const tu = new Date(Date.now() - ngay * 86400000).toISOString();

  const { data: qk, error } = await supabase
    .from('lead_attribution')
    .select('lead_id, fb_ad_id, fb_page_id, fb_ad_title, cham_dau_luc')
    .not('fb_ad_id', 'is', null)
    // BẮT BUỘC: quy kết được ghi ở mức CONTACT ngay khi khách nhắn, lead chỉ sinh
    // ra sau khi được duyệt — nên có dòng mang ad_id mà lead_id còn trống (đo ngày
    // 04/10/2026: 156/512 dòng). Thiếu dòng lọc này thì String(null) hoá chuỗi
    // 'null' chui vào .in(), Postgres chối cả lô và phân tích chết lặng.
    .not('lead_id', 'is', null)
    .gte('cham_dau_luc', tu)
    .limit(20000);
  if (error) throw new Error(error.message);
  const rows = qk || [];
  if (!rows.length) return { theoAd: new Map(), nen: null };

  const ids = [...new Set(rows.map((x) => String(x.lead_id)))];
  const [leadRows, diemRows, catRows, pageRows] = await Promise.all([
    layTheoLo('crm_leads', 'id', ids,
      'id, type, phone, customer_id, actual_close_date, estimated_value, company_id'),
    layTheoLo('lead_quality_scores', 'lead_id', ids, 'lead_id, diem, nhan'),
    supabase.from('fb_ad_catalog').select('ad_id, campaign_name, ad_name')
      .then((x) => x.data || [], () => []),
    supabase.from('facebook_pages').select('page_id, page_name')
      .then((x) => x.data || [], () => []),
  ]);

  const khachIds = leadRows.map((l) => l.customer_id).filter(Boolean);
  const khachRows = await layTheoLoMem('customers', 'id', khachIds, 'id, phone');
  const mSdt = new Map(khachRows.map((c) => [String(c.id), c.phone]));

  const mLead = new Map(leadRows.map((l) => [String(l.id), l]));
  const mDiem = new Map(diemRows.map((x) => [String(x.lead_id), x]));
  const mCat = new Map(catRows.map((x) => [String(x.ad_id), x]));
  const mPage = new Map(pageRows.map((x) => [String(x.page_id), x.page_name]));

  const mocBayNgay = Date.now() - 7 * 86400000;
  const mocMuoiBon = Date.now() - 14 * 86400000;
  const theoAd = new Map();

  for (const a of rows) {
    const l = mLead.get(String(a.lead_id));
    if (!l) continue;
    const k = String(a.fb_ad_id);
    if (!theoAd.has(k)) {
      const c = mCat.get(k) || {};
      theoAd.set(k, {
        ad_id: k,
        ad_title: a.fb_ad_title || c.ad_name || null,
        campaign_name: c.campaign_name || null,
        page_id: a.fb_page_id || null,
        page_name: mPage.get(String(a.fb_page_id)) || null,
        company_id: l.company_id || null,
        leads: 0, deals: 0, closed: 0, revenue: null, closed_estimated_value: 0, revenue_status: 'UNKNOWN', eligible_for_budget_optimization: false,
        chi_tieu: 0, hien_thi: 0, nhap: 0,
        rac: 0, chat_luong: 0, khong_sdt: 0,
        lead_7_ngay: 0, lead_7_ngay_truoc: 0,
        lan_dau: a.cham_dau_luc, lan_cuoi: a.cham_dau_luc,
      });
    }
    const g = theoAd.get(k);
    g.leads += 1;
    if (a.cham_dau_luc < g.lan_dau) g.lan_dau = a.cham_dau_luc;
    if (a.cham_dau_luc > g.lan_cuoi) g.lan_cuoi = a.cham_dau_luc;

    const t = new Date(a.cham_dau_luc).getTime();
    if (t >= mocBayNgay) g.lead_7_ngay += 1;
    else if (t >= mocMuoiBon) g.lead_7_ngay_truoc += 1;

    const d = mDiem.get(String(a.lead_id));
    if (d) {
      if (d.nhan === 'rac') g.rac += 1;
      if (['am', 'nong', 'da_chot'].includes(d.nhan)) g.chat_luong += 1;
    }
    if (!String(l.phone || mSdt.get(String(l.customer_id)) || '').trim()) g.khong_sdt += 1;
    if (l.type === 'deal') g.deals += 1;
    if (l.actual_close_date) { g.closed += 1; g.closed_estimated_value += Number(l.estimated_value) || 0; }
  }

  // Chi tiêu thật từ Marketing API — không có thì để 0 và không phán gì về tiền.
  try {
    const { data: ct } = await supabase.from('fb_ad_spend_daily')
      .select('ad_id, chi_tieu, hien_thi, nhap')
      .gte('ngay', tu.slice(0, 10))
      .limit(50000);
    for (const x of ct || []) {
      const g = theoAd.get(String(x.ad_id));
      if (!g) continue;
      g.chi_tieu += Number(x.chi_tieu) || 0;
      g.hien_thi += Number(x.hien_thi) || 0;
      g.nhap += Number(x.nhap) || 0;
    }
  } catch { /* chưa có bảng hoặc chưa nối — coi như không có chi tiêu */ }

  // Nền so sánh của toàn bộ quảng cáo trong kỳ
  let tongLead = 0; let tongChot = 0; let tongDoanhThu = 0; let tongChi = 0;
  for (const g of theoAd.values()) {
    tongLead += g.leads; tongChot += g.closed; tongDoanhThu += g.closed_estimated_value; tongChi += g.chi_tieu;
  }
  const nen = {
    so_quang_cao: theoAd.size,
    leads: tongLead,
    closed: tongChot,
    revenue: null, closed_estimated_value: tongDoanhThu, revenue_status: 'UNKNOWN', eligible_for_budget_optimization: false,
    chi_tieu: Math.round(tongChi),
    ti_le_chot: pct(tongChot, tongLead),
    doanh_thu_moi_lead: null,
    gia_moi_lead: tongChi > 0 && tongLead ? Math.round(tongChi / tongLead) : 0,
    co_chi_tieu: tongChi > 0,
  };
  return { theoAd, nen };
}

/** Sinh nhận xét cho một quảng cáo. */
function nhanXetChoAd(g, nen) {
  const nx = [];
  const them = (ma, muc, tieuDe, giaiThich, hanhDong) => nx.push({ ma, muc, tieu_de: tieuDe, giai_thich: giaiThich, hanh_dong: hanhDong || null });

  const ngayChay = soNgay(g.lan_dau, g.lan_cuoi) + 1;
  const tiLeChot = pct(g.closed, g.leads);
  const tiLeRac = pct(g.rac, g.leads);
  const tiLeKhongSdt = pct(g.khong_sdt, g.leads);
  const doanhThuMoiLead = null; // Recognized net revenue source is not connected.
  const imLang = soNgay(g.lan_cuoi, new Date().toISOString());
  const chiTieu = Math.round(g.chi_tieu || 0);
  const giaMoiLead = chiTieu > 0 && g.leads ? Math.round(chiTieu / g.leads) : 0;
  const roas = null;

  // 1. Mẫu quá nhỏ — im lặng, không phán
  if (g.leads < MAU_TOI_THIEU) {
    them('chua_du_mau', 'thong_tin',
      'Chưa đủ dữ liệu để kết luận',
      `Mới ${g.leads} lead. Cần ít nhất ${MAU_TOI_THIEU} lead mới nói được gì có ích.`,
      'Để chạy thêm rồi xem lại.');
    return { nhan_xet: nx, xep_hang: 'chua_du', diem_uu_tien: g.leads };
  }

  // 2. Không ra đơn dù đủ lead và đủ thời gian
  if (g.leads >= MAU_DE_CHE && g.closed === 0 && ngayChay >= NGAY_TOI_THIEU) {
    them('khong_ra_don', 'xau',
      'Nhiều lead nhưng chưa ra đơn nào',
      `${g.leads} lead trong ${ngayChay} ngày, chưa chốt được đơn nào.`
      + (chiTieu > 0 ? ` Đã tiêu ${tien(chiTieu)} đ.` : '')
      + ` Trung bình các quảng cáo khác chốt ${nen.ti_le_chot}%.`,
      'Xem lại nội dung quảng cáo và đối tượng nhắm. Cân nhắc tạm dừng nếu tuần tới vẫn vậy.');
  }

  // 3. Chốt vượt trội
  if (nen.ti_le_chot > 0 && tiLeChot >= nen.ti_le_chot * 1.5 && g.closed >= 2) {
    them('chot_vuot_troi', 'tot',
      'Tỉ lệ chốt cao hơn mặt bằng',
      `Chốt ${tiLeChot}% (${g.closed}/${g.leads} lead), trong khi mặt bằng chung là ${nen.ti_le_chot}%.`,
      'Đây là ứng viên tăng ngân sách hoặc nhân bản sang nhóm đối tượng tương tự.');
  }

  // 4. Chốt kém rõ rệt
  if (nen.ti_le_chot > 0 && g.leads >= MAU_DE_CHE && g.closed > 0 && tiLeChot <= nen.ti_le_chot * 0.4) {
    them('chot_kem', 'canh_bao',
      'Tỉ lệ chốt thấp hơn hẳn mặt bằng',
      `Chốt ${tiLeChot}% so với mặt bằng ${nen.ti_le_chot}%. Ra lead nhưng khó thành đơn.`,
      'Kiểm tra quảng cáo có hứa hẹn sai lệch với sản phẩm thật không.');
  }

  // 5. Lead rác nhiều
  if (tiLeRac >= 30) {
    them('rac_cao', 'canh_bao',
      'Nhiều lead không dùng được',
      `${tiLeRac}% lead xếp nhãn rác (${g.rac}/${g.leads}) — vào rồi không để lại liên hệ, không trả lời.`,
      'Thường do quảng cáo đặt ở vị trí dễ bấm nhầm. Xem lại vị trí hiển thị.');
  }

  // 6. Không lấy được số điện thoại
  if (tiLeKhongSdt >= 40) {
    them('thieu_sdt', 'canh_bao',
      'Phần lớn lead không có số điện thoại',
      `${tiLeKhongSdt}% lead chưa có số (${g.khong_sdt}/${g.leads}). Không gọi lại được thì khó chốt.`,
      'Thêm câu hỏi xin số ngay trong kịch bản trả lời tự động.');
  }

  // 7. Doanh thu mỗi lead nổi bật
  if (nen.doanh_thu_moi_lead > 0 && doanhThuMoiLead >= nen.doanh_thu_moi_lead * 1.5 && g.closed >= 2) {
    them('doanh_thu_cao', 'tot',
      'Khách từ quảng cáo này có giá trị cao',
      `Trung bình ${doanhThuMoiLead.toLocaleString('vi-VN')} đ doanh thu trên mỗi lead, gấp ${(doanhThuMoiLead / nen.doanh_thu_moi_lead).toFixed(1)} lần mặt bằng.`,
      'Đáng ưu tiên ngân sách kể cả khi số lead ít hơn quảng cáo khác.');
  }

  // 8. Đang tăng tốc
  if (g.lead_7_ngay_truoc >= 3 && g.lead_7_ngay >= g.lead_7_ngay_truoc * 2) {
    them('dang_len', 'tot',
      'Lead đang tăng mạnh',
      `7 ngày qua ${g.lead_7_ngay} lead, tuần trước đó ${g.lead_7_ngay_truoc} lead.`,
      'Theo dõi xem chất lượng có giữ được khi tăng lượng không.');
  }

  // 9. Đang tụt
  if (g.lead_7_ngay_truoc >= 5 && g.lead_7_ngay <= g.lead_7_ngay_truoc * 0.4) {
    them('dang_giam', 'canh_bao',
      'Lead đang giảm nhanh',
      `7 ngày qua chỉ ${g.lead_7_ngay} lead, tuần trước đó ${g.lead_7_ngay_truoc} lead.`,
      'Có thể do hết ngân sách, đối tượng bão hoà, hoặc quảng cáo bị hạn chế.');
  }

  // 10. Im lặng
  if (imLang >= NGAY_IM_LANG && g.leads >= 5) {
    them('im_lang', 'thong_tin',
      `Không có lead mới ${imLang} ngày`,
      `Lead cuối cùng vào ngày ${new Date(g.lan_cuoi).toLocaleDateString('vi-VN')}.`,
      'Kiểm tra quảng cáo còn chạy không, hay đã tắt.');
  }

  // 11. Chưa đặt tên chiến dịch
  if (!g.campaign_name) {
    them('chua_dat_ten', 'thong_tin',
      'Chưa gắn tên chiến dịch',
      'Quảng cáo này chưa được gom vào chiến dịch nào nên không tổng hợp theo chiến dịch được.',
      'Bấm vào ô tên ở tab "Theo quảng cáo" để đặt.');
  }

  // 12. Giá mỗi lead đắt hơn hẳn mặt bằng
  if (nen.co_chi_tieu && nen.gia_moi_lead > 0 && giaMoiLead >= nen.gia_moi_lead * 1.5) {
    them('gia_lead_dat', 'canh_bao',
      'Giá mỗi lead đắt hơn mặt bằng',
      `${tien(giaMoiLead)} đ một lead, mặt bằng chung ${tien(nen.gia_moi_lead)} đ. `
      + `Tiêu ${tien(chiTieu)} đ được ${g.leads} lead.`,
      'Nếu chất lượng lead không bù lại được thì nên giảm ngân sách chỗ này.');
  }

  // 13. Giá mỗi lead rẻ rõ rệt
  if (nen.co_chi_tieu && nen.gia_moi_lead > 0 && chiTieu > 0 && giaMoiLead <= nen.gia_moi_lead * 0.6) {
    them('gia_lead_re', 'tot',
      'Giá mỗi lead rẻ hơn mặt bằng',
      `${tien(giaMoiLead)} đ một lead, mặt bằng chung ${tien(nen.gia_moi_lead)} đ.`,
      'Rẻ mới là một nửa chuyện — xem thêm tỉ lệ chốt trước khi tăng ngân sách.');
  }

  // 14. Thu về ít hơn tiền bỏ ra
  if (roas !== null && chiTieu > 0 && g.closed > 0 && roas < 1) {
    them('lo_von', 'xau',
      'Doanh thu chốt được thấp hơn tiền quảng cáo',
      `Tiêu ${tien(chiTieu)} đ, chốt được ${tien(g.revenue)} đ từ ${g.closed} đơn `
      + `(thu về ${roas.toFixed(2)} đ trên mỗi đồng bỏ ra).`,
      'Chỉ đúng nếu các đơn đã được điền giá trị. Kiểm tra giá trị đơn trước khi quyết định tắt.');
  }

  // Xếp hạng
  const coXau = nx.some((x) => x.muc === 'xau');
  const soCanhBao = nx.filter((x) => x.muc === 'canh_bao').length;
  const soTot = nx.filter((x) => x.muc === 'tot').length;
  let xepHang = 'can_xem';
  if (coXau) xepHang = 'kem';
  else if (soTot >= 1 && soCanhBao === 0) xepHang = 'tot';
  else if (soTot >= 1) xepHang = 'kha';
  else if (soCanhBao >= 1) xepHang = 'can_xem';
  else xepHang = 'kha';

  // Ưu tiên xem: việc xấu + nhiều lead thì lên đầu
  const diem = (coXau ? 1000 : 0) + soCanhBao * 100 + Math.min(g.leads, 99);

  return { nhan_xet: nx, xep_hang: xepHang, diem_uu_tien: diem };
}

/** Chạy phân tích toàn bộ và ghi vào fb_ad_analysis. */
async function chayPhanTich({ ngay = 90 } = {}) {
  const { theoAd, nen } = await napSoLieuTheoAd({ ngay });
  if (!theoAd.size) return { da_phan_tich: 0, nen: null };

  const rows = [];
  for (const g of theoAd.values()) {
    const kq = nhanXetChoAd(g, nen);
    rows.push({
      ad_id: g.ad_id,
      xep_hang: kq.xep_hang,
      diem_uu_tien: kq.diem_uu_tien,
      so_lieu: {
        ...g,
        ti_le_chot: pct(g.closed, g.leads),
        ti_le_rac: pct(g.rac, g.leads),
        ti_le_chat_luong: pct(g.chat_luong, g.leads),
        ti_le_khong_sdt: pct(g.khong_sdt, g.leads),
        doanh_thu_moi_lead: null,
        chi_tieu: Math.round(g.chi_tieu || 0),
        gia_moi_lead: g.chi_tieu > 0 && g.leads ? Math.round(g.chi_tieu / g.leads) : null,
        roas: null,
        so_ngay_chay: soNgay(g.lan_dau, g.lan_cuoi) + 1,
      },
      nhan_xet: kq.nhan_xet,
      tinh_luc: new Date().toISOString(),
    });
  }

  for (let i = 0; i < rows.length; i += 200) {
    const lo = rows.slice(i, i + 200);
    const { error } = await supabase.from('fb_ad_analysis').upsert(lo, { onConflict: 'ad_id' });
    if (error) console.warn('[phan-tich-qc] luu:', error.message);
  }
  return { da_phan_tich: rows.length, nen };
}

/** Tóm tắt toàn cảnh để hiện đầu trang. */
function tomTat(rows, nen) {
  const dem = { tot: 0, kha: 0, can_xem: 0, kem: 0, chua_du: 0 };
  const nenTat = [];
  const nenTang = [];
  for (const r of rows) {
    dem[r.xep_hang] = (dem[r.xep_hang] || 0) + 1;
    const nx = Array.isArray(r.nhan_xet) ? r.nhan_xet : [];
    if (nx.some((x) => x.ma === 'khong_ra_don')) nenTat.push(r);
    if (nx.some((x) => x.ma === 'chot_vuot_troi' || x.ma === 'doanh_thu_cao')) nenTang.push(r);
  }
  return {
    dem,
    nen_tat: nenTat.slice(0, 5).map((r) => ({
      ad_id: r.ad_id,
      ten: r.so_lieu?.campaign_name || r.so_lieu?.ad_title || r.ad_id,
      leads: r.so_lieu?.leads || 0,
    })),
    nen_tang: nenTang.slice(0, 5).map((r) => ({
      ad_id: r.ad_id,
      ten: r.so_lieu?.campaign_name || r.so_lieu?.ad_title || r.ad_id,
      ti_le_chot: r.so_lieu?.ti_le_chot || 0,
    })),
    mat_bang: nen,
    canh_bao_chung: (nen && nen.co_chi_tieu)
      ? 'Chi tiêu chưa chứng minh đầy đủ; doanh thu kế toán và ROAS chưa xác minh. Không dùng các nhận xét này làm lệnh tự tăng ngân sách.'
      : 'Chưa nối Marketing API nên chưa có chi tiêu — mọi nhận xét dựa trên lead và đơn chốt, '
        + 'không phải hiệu quả đồng tiền. Điểm chất lượng đo độ đầy đủ thông tin, không phải xác suất chốt.',
  };
}

module.exports = { chayPhanTich, napSoLieuTheoAd, nhanXetChoAd, tomTat, MAU_TOI_THIEU };
