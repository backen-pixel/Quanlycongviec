/**
 * Tráo thứ tự câu hỏi và đáp án trong bài kiểm tra — chống chép bài và chống học vẹt vị trí.
 *
 * CÁI BẪY PHẢI TRÁNH
 * Người học gửi đáp án về bằng **chỉ số ô** (`answers[idCâu] = 2`). Nếu tráo đáp án lúc hiển
 * thị mà lúc chấm vẫn so với mảng gốc thì chấm sai toàn bộ — người làm đúng bị tính sai.
 *
 * CÁCH LÀM
 * Tráo TẤT ĐỊNH, gieo từ `userId + exerciseId + lượt thứ mấy`. Cùng ba thứ đó thì luôn ra
 * cùng một thứ tự, nên lúc chấm dựng lại được đúng hoán vị đã hiển thị mà KHÔNG cần lưu gì
 * vào cơ sở dữ liệu. Không thêm bảng, không thêm cột trạng thái, không lo lệch khi người học
 * mở bài ở hai tab.
 *
 * Đổi lượt thi thì đề tráo lại — làm lại lần hai không gặp đúng thứ tự lần một.
 *
 * KHÔNG tráo:
 *   - Câu `checklist` — thứ tự các mục thường là thứ tự thao tác, tráo là sai nghiệp vụ.
 *   - Đáp án có chữ «Tất cả các ý trên» / «Không ý nào» — tráo lên giữa thì vô nghĩa.
 */

/** Băm chuỗi → số nguyên 32 bit. FNV-1a, đủ tản cho việc gieo. */
function bamChuoi(s) {
  let h = 0x811c9dc5;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Bộ sinh số giả ngẫu nhiên tất định (mulberry32). */
function boSinh(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hoán vị [0..n-1] theo hạt giống. Fisher–Yates.
 * Trả về mảng `hv` với ý nghĩa: vị trí hiển thị `i` chính là phần tử gốc `hv[i]`.
 */
function hoanVi(n, seed) {
  const hv = Array.from({ length: n }, (_, i) => i);
  const rnd = boSinh(seed);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [hv[i], hv[j]] = [hv[j], hv[i]];
  }
  return hv;
}

/** Đáp án kiểu «Tất cả các ý trên» phải nằm yên chỗ cũ. */
const NEO = /^(tất cả|tat ca|cả hai|ca hai|không ý nào|khong y nao|không câu nào|none|all of)/i;

function coDapAnNeo(options) {
  return (options || []).some((o) => NEO.test(String(o || '').trim()));
}

/** Hạt giống cho MỘT bài: ai làm, bài nào, lượt thứ mấy. */
function hatGiong(userId, exerciseId, luot) {
  return bamChuoi(`${userId}|${exerciseId}|${luot}`);
}

/**
 * Hoán vị đáp án của một câu. Trả null nghĩa là câu này không tráo.
 * @returns {number[]|null} `hv[i]` = chỉ số GỐC của đáp án đang hiển thị ở vị trí i
 */
function hoanViDapAn(cau, userId, exerciseId, luot) {
  if (!cau || cau.type === 'checklist') return null;
  const opts = cau.options || [];
  if (opts.length < 2) return null;
  if (coDapAnNeo(opts)) return null;
  return hoanVi(opts.length, hatGiong(userId, `${exerciseId}:${cau.id}`, luot));
}

/**
 * Dựng đề đã tráo để gửi cho người học.
 * @returns {{items: object[]}} giữ nguyên hình dạng `questions` mà giao diện đang đọc
 */
function tronDeChoNguoiHoc(items, { userId, exerciseId, luot, tronCau, tronDapAn }) {
  const ds = Array.isArray(items) ? items : [];
  if (!ds.length) return ds;

  let thuTu = ds;
  if (tronCau) {
    const hv = hoanVi(ds.length, hatGiong(userId, exerciseId, luot));
    thuTu = hv.map((i) => ds[i]);
  }
  if (!tronDapAn) return thuTu;

  return thuTu.map((cau) => {
    const hv = hoanViDapAn(cau, userId, exerciseId, luot);
    if (!hv) return cau;
    return { ...cau, options: hv.map((i) => (cau.options || [])[i]) };
  });
}

/**
 * Dịch đáp án người học gửi về (chỉ số trên đề ĐÃ TRÁO) thành chỉ số trên đề GỐC.
 *
 * Phải chạy TRƯỚC khi chấm. Không tráo đáp án thì trả nguyên, nên gọi vô điều kiện được.
 */
function doiVeChiSoGoc(items, answers, { userId, exerciseId, luot, tronDapAn }) {
  if (!tronDapAn) return answers || {};
  const ra = { ...(answers || {}) };
  for (const cau of Array.isArray(items) ? items : []) {
    const hv = hoanViDapAn(cau, userId, exerciseId, luot);
    if (!hv) continue;
    const dap = ra[cau.id];
    if (dap === undefined || dap === null) continue;
    if (Array.isArray(dap)) {
      ra[cau.id] = dap
        .map((v) => hv[Number(v)])
        .filter((v) => v !== undefined);
    } else {
      const v = hv[Number(dap)];
      if (v !== undefined) ra[cau.id] = v;
    }
  }
  return ra;
}

module.exports = {
  tronDeChoNguoiHoc,
  doiVeChiSoGoc,
  hoanVi,
  hoanViDapAn,
  hatGiong,
};
