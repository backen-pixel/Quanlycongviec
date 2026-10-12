/**
 * Công tắc "chặn kéo cột Kanban SX khi còn nhiệm vụ chưa hoàn thành", bật/tắt theo
 * công ty hoặc theo từng phân loại xưởng.
 *
 * VÌ SAO CÓ TỆP NÀY
 * Trước đây gate miễn trừ bằng cách so TÊN phân loại — `n === 'canh kinh' || n === 'cua'`.
 * Đổi tên phân loại là mất miễn trừ; muốn tắt cho phân loại mới thì phải sửa code rồi
 * chờ deploy. Chuyển thành dữ liệu để sửa được ngay trong màn hình cài đặt.
 *
 * Lưu trong `app_settings` (khoá/giá trị JSON) thay vì thêm cột — giống
 * `placeWorkshopNotifySettings.js`. Không cần migration, không đụng schema.
 *
 * Hình dạng giá trị:
 *   {
 *     tat_theo_cong_ty:  [companyId...],       // cả công ty kéo tự do
 *     tat_theo_phan_loai:[workshopTypeId...],  // riêng phân loại này kéo tự do
 *     bat_theo_phan_loai:[workshopTypeId...],  // riêng phân loại này VẪN chặn, dù công ty đã tắt
 *   }
 *
 * Thứ tự ưu tiên: bat_theo_phan_loai > tat_theo_phan_loai > tat_theo_cong_ty > mặc định (chặn).
 * Có `bat_theo_phan_loai` thì ô tick trong màn hình cài đặt mới bật/tắt được từng phân loại
 * của công ty đã tắt cả loạt — không thì tick lên rồi vẫn thấy tắt, trông như hỏng.
 *
 * MẶC ĐỊNH LÀ BẬT CHẶN. Chỉ những id nằm trong danh sách mới được kéo tự do — thiếu khoá,
 * hỏng JSON hay lỗi mạng đều rơi về "vẫn chặn", tức là an toàn về phía nghiệp vụ.
 */

const { supabase } = require('../config/supabase');

const KHOA = 'sx_chan_keo_theo_nhiem_vu';

/** Cache ngắn: gate chạy mỗi lần kéo thẻ, không nên bắn thêm một query mỗi lần. */
const TTL_MS = 60 * 1000;
let cache = null;
let cacheHan = 0;

function chuanHoa(value) {
  const v = value && typeof value === 'object' ? value : {};
  const ds = (x) => (Array.isArray(x) ? x.map((s) => String(s)).filter(Boolean) : []);
  return {
    tat_theo_cong_ty: ds(v.tat_theo_cong_ty),
    tat_theo_phan_loai: ds(v.tat_theo_phan_loai),
    bat_theo_phan_loai: ds(v.bat_theo_phan_loai),
  };
}

async function docCaiDat({ boQuaCache = false } = {}) {
  if (!boQuaCache && cache && Date.now() < cacheHan) return cache;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', KHOA)
      .maybeSingle();
    if (error) throw error;
    cache = chuanHoa(data?.value);
  } catch (e) {
    console.warn('[sxChanKeo] đọc cài đặt lỗi, tạm coi như bật chặn:', e.message);
    cache = chuanHoa(null);
  }
  cacheHan = Date.now() + TTL_MS;
  return cache;
}

function xoaCache() {
  cache = null;
  cacheHan = 0;
}

/** true = phân loại này được kéo tự do (KHÔNG chặn theo nhiệm vụ). */
async function laMienTruChanKeo(companyId, workshopTypeId) {
  const ct = await docCaiDat();
  const tid = workshopTypeId ? String(workshopTypeId) : '';
  if (tid && ct.bat_theo_phan_loai.includes(tid)) return false;
  if (tid && ct.tat_theo_phan_loai.includes(tid)) return true;
  if (companyId && ct.tat_theo_cong_ty.includes(String(companyId))) return true;
  return false;
}

/** Bật/tắt cho MỘT phân loại. `bat = true` nghĩa là chặn; `false` là kéo tự do. */
async function datChanKeoChoPhanLoai(workshopTypeId, bat) {
  const id = String(workshopTypeId || '');
  if (!id) throw new Error('Thiếu workshopTypeId');
  const ct = chuanHoa(await docCaiDat({ boQuaCache: true }));
  const tat = ct.tat_theo_phan_loai.filter((x) => x !== id);
  const batDs = ct.bat_theo_phan_loai.filter((x) => x !== id);
  const moi = {
    tat_theo_cong_ty: ct.tat_theo_cong_ty,
    tat_theo_phan_loai: bat ? tat : [...tat, id],
    bat_theo_phan_loai: bat ? [...batDs, id] : batDs,
  };
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: KHOA, value: moi, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  xoaCache();
  return moi;
}

module.exports = {
  KHOA_CHAN_KEO: KHOA,
  docCaiDat,
  laMienTruChanKeo,
  datChanKeoChoPhanLoai,
  xoaCache,
};
