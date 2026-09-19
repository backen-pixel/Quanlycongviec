import { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, X, Loader2, FileSpreadsheet, AlertTriangle, Check } from 'lucide-react';
import api from '../lib/api';

/**
 * Nhập Excel GIÁ VỐN cho từng nhiệm vụ / công đoạn của một mẫu nhiệm vụ SX.
 *
 * Mỗi dòng Excel = một công đoạn. Khớp với nhiệm vụ trong mẫu theo TÊN (bỏ dấu, không
 * phân biệt hoa thường). File đọc ngay tại trình duyệt bằng `xlsx` — không upload file
 * lên server, chỉ gửi các dòng đã đọc, nên không phải lo lưu trữ / quét virus.
 *
 * KHÔNG ghi vào products.cost_price: bảng đó là giá vốn theo MÃ HÀNG (702 sản phẩm),
 * khác hẳn giá gia công theo công đoạn. Hai thứ khác nhau, cố ý không gộp.
 *
 * Người dùng luôn xem bảng đối chiếu trước khi lưu — dòng nào không khớp tên thì hiện rõ
 * để sửa file, chứ không lặng lẽ bỏ qua.
 */

/** Bỏ dấu + thường hoá — phải khớp đúng hàm chuanHoaTen() ở backend. */
function chuanHoaTen(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** '1.250.000', '1,250,000', '1250000đ', 1250000 → 1250000. Đọc không ra → null. */
export function doSoTien(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const raw = String(v).trim();
  // Chỉ lấy CỤM SỐ ĐẦU TIÊN — '85.000 đ/m2' mà lọc toàn cục sẽ ra '85.0002' → sai.
  const khop = raw.match(/-?\d[\d.,\u00a0 ]*/);
  if (!khop) return null;
  let s = khop[0].replace(/[\s\u00a0]/g, '').replace(/[.,]+$/, '');
  if (!s) return null;
  const phay = s.lastIndexOf(',');
  const cham = s.lastIndexOf('.');
  if (phay >= 0 && cham >= 0) {
    if (phay > cham) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (phay >= 0) {
    s = (s.length - phay - 1) === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (cham >= 0) {
    s = (s.length - cham - 1) === 2 ? s : s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Nhận diện cột theo tiêu đề — chấp nhận nhiều cách gọi thường gặp trong file xưởng. */
const NHAN_COT = {
  title: ['nhiem vu', 'cong doan', 'ten cong doan', 'ten nhiem vu', 'ten', 'cong viec', 'hang muc', 'noi dung'],
  chi_phi: ['chi phi', 'gia von', 'von', 'chiphi', 'cost'],
  gia_gia_cong: ['gia gia cong', 'gia cong', 'don gia', 'don gia gia cong', 'gia', 'price'],
  don_vi_tinh: ['dvt', 'don vi', 'don vi tinh', 'unit'],
  ghi_chu_gia: ['ghi chu', 'note', 'ghichu'],
};

function doanCot(header) {
  const map = {};
  const dung = new Set();
  header.forEach((h, i) => {
    const k = chuanHoaTen(h);
    if (!k) return;
    for (const [field, tuKhoa] of Object.entries(NHAN_COT)) {
      if (map[field] !== undefined || dung.has(i)) continue;
      // Khớp chính xác trước, rồi mới khớp chứa — tránh 'gia' nuốt mất 'gia von'.
      if (tuKhoa.includes(k)) { map[field] = i; dung.add(i); break; }
    }
  });
  header.forEach((h, i) => {
    const k = chuanHoaTen(h);
    if (!k || dung.has(i)) return;
    for (const [field, tuKhoa] of Object.entries(NHAN_COT)) {
      if (map[field] !== undefined) continue;
      if (tuKhoa.some((t) => k.includes(t))) { map[field] = i; dung.add(i); break; }
    }
  });
  return map;
}

export default function GiaVonExcelModal({ tpl, onClose, onSaved }) {
  const inputRef = useRef(null);
  const [tenFile, setTenFile] = useState('');
  const [dangDoc, setDangDoc] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');
  const [dong, setDong] = useState([]);
  const [ketQua, setKetQua] = useState(null);

  const items = useMemo(() => (Array.isArray(tpl?.items) ? tpl.items : []), [tpl]);
  const theoTen = useMemo(() => {
    const m = new Map();
    items.forEach((it) => {
      const k = chuanHoaTen(it.title);
      if (m.has(k)) m.set(k, '__trung__');
      else m.set(k, it);
    });
    return m;
  }, [items]);

  const docFile = useCallback(async (file) => {
    if (!file) return;
    setLoi(''); setKetQua(null); setDangDoc(true); setTenFile(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('File không có sheet nào');
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
      if (!matrix.length) throw new Error('Sheet đầu tiên đang trống');

      // Dòng tiêu đề = dòng đầu tiên nhận ra được cột tên công đoạn (thường xưởng có
      // vài dòng tiêu đề công ty ở trên trước khi tới bảng thật).
      let hIdx = -1; let cot = null;
      for (let i = 0; i < Math.min(matrix.length, 15); i += 1) {
        const thu = doanCot(matrix[i] || []);
        if (thu.title !== undefined && (thu.chi_phi !== undefined || thu.gia_gia_cong !== undefined)) {
          hIdx = i; cot = thu; break;
        }
      }
      if (hIdx < 0) {
        throw new Error('Không tìm thấy dòng tiêu đề. File cần có một cột tên công đoạn (Nhiệm vụ / Công đoạn) và ít nhất một cột Chi phí hoặc Giá gia công.');
      }

      const ra = [];
      for (let i = hIdx + 1; i < matrix.length; i += 1) {
        const r = matrix[i] || [];
        const title = String(r[cot.title] ?? '').trim();
        if (!title) continue;
        const chiPhi = cot.chi_phi !== undefined ? doSoTien(r[cot.chi_phi]) : undefined;
        const giaGC = cot.gia_gia_cong !== undefined ? doSoTien(r[cot.gia_gia_cong]) : undefined;
        if (chiPhi === null && giaGC === null) continue;
        const khop = theoTen.get(chuanHoaTen(title));
        ra.push({
          title,
          chi_phi: chiPhi,
          gia_gia_cong: giaGC,
          don_vi_tinh: cot.don_vi_tinh !== undefined ? String(r[cot.don_vi_tinh] ?? '').trim() : undefined,
          ghi_chu_gia: cot.ghi_chu_gia !== undefined ? String(r[cot.ghi_chu_gia] ?? '').trim() : undefined,
          item: khop === '__trung__' ? null : (khop || null),
          trung: khop === '__trung__',
        });
      }
      if (!ra.length) throw new Error('Đọc được tiêu đề nhưng không có dòng dữ liệu nào có số tiền.');
      setDong(ra);
    } catch (e) {
      setDong([]);
      setLoi(e?.message || 'Không đọc được file');
    } finally {
      setDangDoc(false);
    }
  }, [theoTen]);

  const soKhop = dong.filter((d) => d.item).length;
  const soLech = dong.length - soKhop;

  const luu = async () => {
    const rows = dong.filter((d) => d.item).map((d) => ({
      item_id: d.item.id,
      chi_phi: d.chi_phi,
      gia_gia_cong: d.gia_gia_cong,
      ...(d.don_vi_tinh !== undefined ? { don_vi_tinh: d.don_vi_tinh } : {}),
      ...(d.ghi_chu_gia !== undefined ? { ghi_chu_gia: d.ghi_chu_gia } : {}),
    }));
    if (!rows.length) { setLoi('Không có dòng nào khớp với nhiệm vụ trong mẫu'); return; }
    setDangLuu(true); setLoi('');
    try {
      const { data } = await api.put(`/production/task-templates/${tpl.id}/gia-von`, { rows });
      setKetQua(data);
      onSaved?.(data);
    } catch (e) {
      setLoi(e?.response?.data?.error || 'Không lưu được giá vốn');
    } finally {
      setDangLuu(false);
    }
  };

  const tien = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('vi-VN'));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">Nhập Excel giá vốn</p>
            <p className="truncate text-[11px] text-gray-500">
              Mẫu «{tpl?.name}» · {items.length} nhiệm vụ
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer" title="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {!ketQua && (
            <>
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center">
                <input
                  ref={inputRef}
                  id="gia-von-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => { docFile(e.target.files?.[0]); e.target.value = ''; }}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={dangDoc}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {dangDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {tenFile ? 'Chọn file khác' : 'Chọn file Excel'}
                </button>
                <p className="mt-2 text-[11px] text-gray-500">
                  .xlsx · .xls · .csv — file đọc ngay tại máy anh, không tải lên server
                </p>
                {tenFile && <p className="mt-1 truncate text-[11px] font-medium text-gray-700">{tenFile}</p>}
              </div>

              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-gray-600">
                <p className="font-semibold text-gray-700">File cần có các cột (tên cột đọc linh hoạt, không phân biệt hoa thường / dấu):</p>
                <p className="mt-1">
                  <strong>Nhiệm vụ</strong> (hoặc Công đoạn / Tên công việc / Hạng mục) ·{' '}
                  <strong>Chi phí</strong> (hoặc Giá vốn) · <strong>Giá gia công</strong> (hoặc Đơn giá) ·{' '}
                  ĐVT · Ghi chú
                </p>
                <p className="mt-1 text-gray-500">
                  Số tiền nhận cả <span className="font-mono">1.250.000</span>, <span className="font-mono">1,250,000</span> và <span className="font-mono">1250000đ</span>.
                  Vài dòng tiêu đề công ty phía trên bảng cũng không sao — hệ thống tự dò tới dòng tiêu đề thật.
                </p>
              </div>

              {loi && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{loi}</span>
                </p>
              )}

              {dong.length > 0 && (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                      {soKhop} dòng khớp nhiệm vụ
                    </span>
                    {soLech > 0 && (
                      <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                        {soLech} dòng không khớp — sẽ bỏ qua
                      </span>
                    )}
                    <span className="text-gray-500">Đọc được {dong.length} dòng từ file</span>
                  </div>

                  <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                          <th className="px-3 py-2 text-left font-bold">Tên trong file</th>
                          <th className="px-3 py-2 text-right font-bold">Chi phí</th>
                          <th className="px-3 py-2 text-right font-bold">Giá gia công</th>
                          <th className="px-3 py-2 text-left font-bold">Khớp nhiệm vụ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dong.map((d, i) => (
                          <tr key={`${d.title}-${i}`} className={`border-t border-gray-100 ${d.item ? '' : 'bg-amber-50/50'}`}>
                            <td className="px-3 py-1.5">{d.title}</td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums">{tien(d.chi_phi)}</td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums">{tien(d.gia_gia_cong)}</td>
                            <td className="px-3 py-1.5">
                              {d.item ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                  <Check className="h-3 w-3" /> {d.item.title}
                                </span>
                              ) : (
                                <span className="text-amber-700">
                                  {d.trung ? 'Trùng tên trong mẫu — sửa tên rồi nhập lại' : 'Không có nhiệm vụ nào tên này'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {ketQua && (
            <div className="py-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <Check className="h-4 w-4" /> Đã lưu giá cho {ketQua.da_cap_nhat} nhiệm vụ
              </p>
              {Array.isArray(ketQua.khong_khop) && ketQua.khong_khop.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-amber-800">
                    {ketQua.khong_khop.length} dòng không khớp, chưa lưu:
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-700">{ketQua.khong_khop.join(' · ')}</p>
                </div>
              )}
              {Array.isArray(ketQua.ten_trung) && ketQua.ten_trung.length > 0 && (
                <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-rose-800">
                    {ketQua.ten_trung.length} tên bị trùng trong mẫu nên không đoán được, chưa lưu:
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-rose-700">{ketQua.ten_trung.join(' · ')}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 cursor-pointer">
            {ketQua ? 'Đóng' : 'Hủy'}
          </button>
          {!ketQua && (
            <button
              type="button"
              onClick={luu}
              disabled={dangLuu || soKhop === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              {dangLuu && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Lưu {soKhop > 0 ? `${soKhop} dòng` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
