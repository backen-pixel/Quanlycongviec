import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCatalog } from '../lib/useCatalog';
import { THONG_TIN } from '../data/thongTin';

const RONG = {
  hoTen: '',
  dienThoai: '',
  email: '',
  khuVuc: '',
  quanTam: '',
  dienTich: '',
  noiDung: '',
};

export default function LienHe() {
  const { sanPham: SAN_PHAM } = useCatalog();
  const { state } = useLocation();
  const [form, setForm] = useState({ ...RONG, quanTam: state?.sanPham || '' });
  const [loi, setLoi] = useState({});
  const [daGui, setDaGui] = useState(false);

  const dat = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setLoi((l) => ({ ...l, [k]: undefined }));
  };

  const kiemTra = () => {
    const l = {};
    if (!form.hoTen.trim()) l.hoTen = 'Vui lòng nhập họ tên';
    if (!/^[0-9+\s.-]{9,15}$/.test(form.dienThoai.trim())) l.dienThoai = 'Số điện thoại chưa hợp lệ';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) l.email = 'Email chưa hợp lệ';
    return l;
  };

  const guiForm = (e) => {
    e.preventDefault();
    const l = kiemTra();
    setLoi(l);
    if (Object.keys(l).length) return;
    // Bản frontend: chưa gửi về server. Nối API tại đây khi backend sẵn sàng.
    setDaGui(true);
  };

  return (
    <>
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h1 className="text-3xl font-bold text-stone-900 md:text-4xl">Liên hệ &amp; nhận báo giá</h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Để lại thông tin, đội tư vấn sẽ gọi lại trong giờ làm việc ({THONG_TIN.gioLamViec}) và gửi báo giá chi tiết
            trong 24 giờ.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[1.4fr_1fr]">
        {/* Form */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm md:p-8">
          {daGui ? (
            <div className="py-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
                ✓
              </div>
              <h2 className="mt-5 text-xl font-bold text-stone-900">Đã ghi nhận yêu cầu</h2>
              <p className="mx-auto mt-3 max-w-md text-stone-600">
                Cảm ơn {form.hoTen || 'bạn'}. Tư vấn viên sẽ liên hệ số {form.dienThoai} trong thời gian sớm nhất.
              </p>
              <button
                type="button"
                onClick={() => {
                  setForm({ ...RONG });
                  setDaGui(false);
                }}
                className="mt-6 rounded-xl border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Gửi yêu cầu khác
              </button>
            </div>
          ) : (
            <form onSubmit={guiForm} noValidate className="grid gap-5 sm:grid-cols-2">
              <Truong nhan="Họ và tên *" loi={loi.hoTen}>
                <input
                  value={form.hoTen}
                  onChange={dat('hoTen')}
                  placeholder="Nguyễn Văn A"
                  className={oInput(loi.hoTen)}
                />
              </Truong>

              <Truong nhan="Số điện thoại *" loi={loi.dienThoai}>
                <input
                  value={form.dienThoai}
                  onChange={dat('dienThoai')}
                  inputMode="tel"
                  placeholder="09xx xxx xxx"
                  className={oInput(loi.dienThoai)}
                />
              </Truong>

              <Truong nhan="Email" loi={loi.email}>
                <input
                  value={form.email}
                  onChange={dat('email')}
                  type="email"
                  placeholder="email@domain.com"
                  className={oInput(loi.email)}
                />
              </Truong>

              <Truong nhan="Khu vực thi công">
                <input
                  value={form.khuVuc}
                  onChange={dat('khuVuc')}
                  placeholder="Quận / Tỉnh thành"
                  className={oInput()}
                />
              </Truong>

              <Truong nhan="Mẫu quan tâm">
                <select value={form.quanTam} onChange={dat('quanTam')} className={oInput()}>
                  <option value="">Chưa xác định</option>
                  {SAN_PHAM.map((sp) => (
                    <option key={sp.id} value={sp.ten}>
                      {sp.ten}
                    </option>
                  ))}
                </select>
              </Truong>

              <Truong nhan="Chiều dài bếp (m)">
                <input
                  value={form.dienTich}
                  onChange={dat('dienTich')}
                  inputMode="decimal"
                  placeholder="VD: 3.6"
                  className={oInput()}
                />
              </Truong>

              <div className="sm:col-span-2">
                <Truong nhan="Nội dung">
                  <textarea
                    value={form.noiDung}
                    onChange={dat('noiDung')}
                    rows={4}
                    placeholder="Mô tả hiện trạng bếp, phong cách mong muốn, ngân sách dự kiến…"
                    className={oInput()}
                  />
                </Truong>
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white transition hover:bg-amber-600"
                >
                  Gửi yêu cầu báo giá
                </button>
                <p className="mt-3 text-center text-xs text-stone-500">
                  Thông tin chỉ dùng để tư vấn, không chia sẻ cho bên thứ ba.
                </p>
              </div>
            </form>
          )}
        </div>

        {/* Thông tin liên hệ */}
        <aside className="space-y-5">
          <div className="rounded-2xl bg-stone-900 p-6 text-white">
            <p className="text-sm uppercase tracking-wide text-amber-400">Hotline</p>
            <a
              href={`tel:${THONG_TIN.hotline.replace(/\s/g, '')}`}
              className="mt-1 block text-2xl font-bold hover:text-amber-400"
            >
              {THONG_TIN.hotline}
            </a>
            <p className="mt-4 text-sm text-stone-300">{THONG_TIN.gioLamViec}</p>
          </div>

          <DongTin nhan="Email" giaTri={THONG_TIN.email} />
          <DongTin nhan="Showroom" giaTri={THONG_TIN.diaChiShowroom} />
          <DongTin nhan="Xưởng sản xuất" giaTri={THONG_TIN.diaChiXuong} />

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <p className="font-semibold text-amber-900">Gửi bản vẽ để báo giá nhanh hơn</p>
            <p className="mt-2 text-sm text-amber-800">
              Nếu có bản vẽ mặt bằng hoặc ảnh hiện trạng, gửi qua Zalo/email theo hotline ở trên — thời gian báo giá rút
              ngắn còn 4 giờ.
            </p>
          </div>
        </aside>
      </section>
    </>
  );
}

function Truong({ nhan, loi, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">{nhan}</span>
      {children}
      {loi && <span className="mt-1 block text-xs text-red-600">{loi}</span>}
    </label>
  );
}

function DongTin({ nhan, giaTri }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{nhan}</p>
      <p className="mt-1 text-sm text-stone-800">{giaTri}</p>
    </div>
  );
}

function oInput(loi) {
  return `w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-amber-500 ${
    loi ? 'border-red-400' : 'border-stone-300'
  }`;
}
