/**
 * Quản lý lỗi — xem toàn bộ lỗi của công ty, không bó trong một dự án.
 *
 * Trước trang này, báo lỗi xong là lỗi biến mất: `POST /api/bao-loi` có người gọi, còn
 * `GET /api/bao-loi` thì không ai gọi. Người báo không biết lỗi của mình tới đâu, người
 * sửa không biết hôm nay còn bao nhiêu lỗi — nên ai cũng quay lại Zalo.
 *
 * Dùng ĐÚNG khung bảng của «hộp việc» (components/inbox/InboxBoards.jsx) để người đi từ
 * trang nhiệm vụ sang không thấy như hai phần mềm khác nhau.
 *
 * Lọc ở MÁY KHÁCH: một lần gọi lấy về cả rổ rồi lọc tại chỗ. Lỗi là tập nhỏ (trăm, không
 * phải vạn như nhiệm vụ), đổi bộ lọc mà phải chờ mạng thì không ai buồn lọc.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bug, Search, RefreshCw, Loader2, AlertTriangle, MessageSquare, Paperclip,
  LayoutGrid, CalendarDays, Clock, Table as TableIcon, UserRound, Send, X,
  ArrowUp, ArrowDown, GripVertical, Crosshair, Wrench,
} from 'lucide-react';
import api from '../lib/api';
import { InboxKanbanBoard, InboxCalendarBoard } from '../components/inbox/InboxBoards';
import { DEADLINE_BUCKET_META, groupByDeadline } from '../components/inbox/inboxDeadline';
import HopChiTietLoi from '../features/baoloi/HopChiTietLoi';
import {
  TRANG_THAI, MUC_DO, trangThai, mucDo, daXong, quaHan, gioNgan, tachMoTa, choHong,
} from '../features/baoloi/loiMeta';

const CHE_DO = [
  { id: 'trang_thai', nhan: 'Trạng thái', icon: LayoutGrid },
  { id: 'han',        nhan: 'Hạn xử lý',  icon: Clock },
  { id: 'lich',       nhan: 'Lịch',       icon: CalendarDays },
  { id: 'bang',       nhan: 'Bảng',       icon: TableIcon },
];

const LS_CHE_DO = 'quanLyLoi.cheDo';

/** Cột của chế độ Bảng. `lay` trả về khoá sắp xếp — chuỗi so chuỗi, số so số. */
const COT_BANG = [
  { id: 'title',    nhan: 'Tiêu đề',       lay: (x) => (x.title || '').toLowerCase(), rong: 'min-w-[16rem]' },
  { id: 'status',   nhan: 'Trạng thái',    lay: (x) => TRANG_THAI.findIndex((t) => t.id === x.status) },
  { id: 'severity', nhan: 'Mức độ',        lay: (x) => MUC_DO.findIndex((m) => m.id === x.severity) },
  { id: 'loai',     nhan: 'Loại lỗi',      lay: (x) => (x.loai?.name || '').toLowerCase() },
  { id: 'xu_ly',    nhan: 'Người xử lý',   lay: (x) => (x.nguoi_xu_ly?.full_name || '').toLowerCase() },
  // Lỗi chưa đặt hạn phải nằm CUỐI dù sắp tăng hay giảm — nó không phải «hạn sớm nhất».
  { id: 'deadline', nhan: 'Hạn xử lý',     lay: (x) => (x.deadline ? new Date(x.deadline).getTime() : Number.POSITIVE_INFINITY) },
  { id: 'bao',      nhan: 'Người báo',     lay: (x) => (x.nguoi_bao?.full_name || '').toLowerCase() },
  { id: 'created',  nhan: 'Báo lúc',       lay: (x) => new Date(x.created_at || 0).getTime() },
];

function TheKpi({ icon: Icon, nhan, so, mau, nen }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-2.5">
      <span className={`h-8 w-8 rounded-lg inline-flex items-center justify-center shrink-0 ${nen}`}>
        <Icon className="h-4 w-4" style={{ color: mau }} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-slate-500 truncate">{nhan}</span>
        <span className="block text-lg font-bold text-slate-900 leading-tight tabular-nums">{so}</span>
      </span>
    </div>
  );
}

/**
 * Thẻ lỗi trên bảng Kanban — phải đọc được trong một liếc mắt ở cột rộng 15rem.
 *
 * Là `div` chứ không phải `button` vì bên trong còn hai nút nữa (trao đổi nhanh, gửi):
 * nút lồng nút là HTML sai, trình duyệt tự gỡ lồng và nút trong mất tác dụng.
 */
function TheLoi({ loi, onMo, onKeo, keoDuoc, onGuiBinhLuan }) {
  const [moO, setMoO] = useState(false);
  const [chu, setChu] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const oRef = useRef(null);
  const md = mucDo(loi.severity);
  const tre = quaHan(loi);
  const { loiKe, dauVet } = tachMoTa(loi.description);
  const hong = choHong(dauVet);

  useEffect(() => { if (moO) setTimeout(() => oRef.current?.focus(), 40); }, [moO]);

  const gui = async () => {
    const t = chu.trim();
    if (!t || dangGui) return;
    setDangGui(true);
    const ok = await onGuiBinhLuan?.(loi, t);
    setDangGui(false);
    if (ok) { setChu(''); setMoO(false); }
  };

  return (
    <div
      className={`rounded-lg border bg-white px-2 py-1.5 transition ${
        moO ? 'border-rose-300 shadow-sm' : 'border-slate-200 hover:border-rose-300 hover:shadow-sm'
      }`}
      // Viền trái = mức độ. Chấm tròn nhỏ quá, ở cột 15rem phải ghé sát mới thấy màu.
      style={{ borderLeftWidth: 3, borderLeftColor: md.mau }}
      // Mở ô trao đổi thì tắt kéo: trong vùng draggable, nhiều trình duyệt không cho
      // bôi đen hay đặt con trỏ vào ô nhập — gõ được nhưng sửa chữ thì vật vã.
      draggable={keoDuoc && !moO}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onKeo?.(loi); }}
      onDragEnd={() => onKeo?.(null)}
    >
      <div
        role="button" tabIndex={0}
        onClick={() => onMo(loi)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMo(loi); } }}
        className="cursor-pointer outline-none"
      >
        <div className="flex items-start gap-1.5">
          {keoDuoc ? <GripVertical className="h-3 w-3 mt-0.5 shrink-0 text-slate-300" /> : null}
          <p className="flex-1 min-w-0 text-[12px] font-semibold text-slate-900 line-clamp-2 leading-snug">
            {loi.title}
          </p>
        </div>

        {/* Lời người dùng kể — tiêu đề là «bấm Lưu không được», chi tiết mới nói được
            «đã thử 3 lần, F5 vẫn thế». Cắt 2 dòng, đủ ngữ cảnh mà không phá chiều cao cột. */}
        {loiKe ? (
          <p className="mt-1 text-[11px] text-slate-500 line-clamp-2 leading-snug">{loiKe}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1 mt-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${md.nen} ${md.chu}`}>{md.nhan}</span>
          {loi.loai?.name ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium truncate max-w-[8rem]">
              {loi.loai.name}
            </span>
          ) : null}
          {loi.so_tep ? (
            <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5">
              <Paperclip className="h-2.5 w-2.5" />{loi.so_tep}
            </span>
          ) : null}
        </div>

        {/* Chỗ hỏng — thứ menu chuột phải bắt được. Người sửa cần ĐÚNG nút nào ở màn nào,
            chứ không phải mò theo tiêu đề. */}
        {hong ? (
          <p className="mt-1 flex items-start gap-1 text-[10px] text-slate-600">
            <Crosshair className="h-2.5 w-2.5 mt-[2px] shrink-0 text-rose-400" />
            <span className="min-w-0 flex-1 truncate" title={hong}>{hong}</span>
          </p>
        ) : null}

        {loi.nguoi_xu_ly?.full_name || loi.deadline ? (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {loi.nguoi_xu_ly?.full_name ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium inline-flex items-center gap-0.5 max-w-full truncate">
                <Wrench className="h-2.5 w-2.5 shrink-0" />{loi.nguoi_xu_ly.full_name}
              </span>
            ) : null}
            {loi.deadline ? (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-0.5 ${
                tre ? 'bg-rose-100 text-rose-700' : 'bg-amber-50 text-amber-800'
              }`}
              >
                <Clock className="h-2.5 w-2.5" />{gioNgan(loi.deadline)}
              </span>
            ) : null}
          </div>
        ) : null}

        <p className="mt-1 text-[10px] text-slate-400 truncate inline-flex items-center gap-0.5 w-full">
          <UserRound className="h-2.5 w-2.5 shrink-0" />
          {loi.nguoi_bao?.full_name || 'Không rõ'} · {gioNgan(loi.created_at)}
        </p>
      </div>

      {/* Trao đổi NGAY trên thẻ: hỏi «lỗi này còn không?» không đáng phải mở hộp chi tiết. */}
      <div className="flex items-center gap-1 mt-1">
        <button
          type="button"
          onClick={() => setMoO((v) => !v)}
          className={`h-6 px-1.5 rounded text-[10px] font-semibold inline-flex items-center gap-0.5 cursor-pointer ${
            moO ? 'bg-rose-100 text-rose-700' : 'text-slate-400 hover:bg-slate-100'
          }`}
          title="Trao đổi nhanh"
        >
          <MessageSquare className="h-2.5 w-2.5" />
          {loi.so_binh_luan ? loi.so_binh_luan : ''} {moO ? <X className="h-2.5 w-2.5" /> : null}
        </button>
      </div>

      {moO ? (
        <div className="flex gap-1 mt-1">
          <input
            ref={oRef} value={chu} onChange={(e) => setChu(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); gui(); }
              if (e.key === 'Escape') setMoO(false);
            }}
            placeholder="Trao đổi… (Enter gửi)"
            className="flex-1 min-w-0 h-7 px-2 text-[11px] border border-slate-200 rounded outline-none focus:border-rose-400"
          />
          <button
            type="button" onClick={gui} disabled={dangGui || !chu.trim()}
            className="h-7 w-7 shrink-0 rounded bg-rose-600 text-white inline-flex items-center justify-center hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
            aria-label="Gửi trao đổi"
          >
            {dangGui ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function QuanLyLoiPage() {
  const [ds, setDs] = useState([]);
  const [dsLoai, setDsLoai] = useState([]);
  const [dsNguoi, setDsNguoi] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [dangMo, setDangMo] = useState(null);

  const [cheDo, setCheDo] = useState(() => localStorage.getItem(LS_CHE_DO) || 'trang_thai');
  const [q, setQ] = useState('');
  const [locTrangThai, setLocTrangThai] = useState('');
  const [locLoai, setLocLoai] = useState('');
  const [locNguoi, setLocNguoi] = useState('');
  const [locMucDo, setLocMucDo] = useState('');
  const [sapXep, setSapXep] = useState({ khoa: 'created', nguoc: true });

  const [dangKeo, setDangKeo] = useState(null);   // lỗi đang được kéo
  const [cotDangKeo, setCotDangKeo] = useState(''); // cột con trỏ đang ở trên

  useEffect(() => { localStorage.setItem(LS_CHE_DO, cheDo); }, [cheDo]);

  const tai = useCallback(async () => {
    setDangTai(true); setLoi('');
    try {
      const { data } = await api.get('/bao-loi', { params: { limit: 1000 } });
      setDs(data?.data || []);
    } catch (e) {
      setLoi(e?.response?.data?.error || e.message || 'Không tải được danh sách lỗi.');
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => { tai(); }, [tai]);

  useEffect(() => {
    api.get('/crm/error-types')
      .then(({ data }) => {
        const tho = Array.isArray(data) ? data : (data?.error_types || data?.data || []);
        setDsLoai(tho.filter((x) => ['loi_van_hanh', 'loi_he_thong'].includes(x.source_kind)));
      })
      .catch(() => setDsLoai([]));
    api.get('/users')
      .then(({ data }) => setDsNguoi(data?.users || (Array.isArray(data) ? data : [])))
      .catch(() => setDsNguoi([]));
  }, []);

  const locXong = useMemo(() => {
    const tu = q.trim().toLowerCase();
    return ds.filter((x) => {
      if (locTrangThai && x.status !== locTrangThai) return false;
      if (locLoai && String(x.error_type_id || '') !== locLoai) return false;
      if (locNguoi && String(x.assignee_id || '') !== locNguoi) return false;
      if (locMucDo && x.severity !== locMucDo) return false;
      if (tu) {
        const kho = `${x.title || ''} ${x.description || ''} ${x.nguoi_bao?.full_name || ''}`.toLowerCase();
        if (!kho.includes(tu)) return false;
      }
      return true;
    });
  }, [ds, q, locTrangThai, locLoai, locNguoi, locMucDo]);

  const dem = useMemo(() => {
    const d = { tiep_nhan: 0, dang_lam: 0, dang_cho: 0, hoan_thanh: 0, tre: 0 };
    locXong.forEach((x) => {
      if (d[x.status] !== undefined) d[x.status] += 1;
      if (quaHan(x)) d.tre += 1;
    });
    return d;
  }, [locXong]);

  const theoTrangThai = useMemo(() => {
    const g = { tiep_nhan: [], dang_lam: [], dang_cho: [], hoan_thanh: [] };
    locXong.forEach((x) => { (g[x.status] || g.tiep_nhan).push(x); });
    return g;
  }, [locXong]);

  const theoHan = useMemo(() => groupByDeadline(locXong, { boQua: daXong }), [locXong]);

  const dsBang = useMemo(() => {
    const cot = COT_BANG.find((c) => c.id === sapXep.khoa) || COT_BANG[COT_BANG.length - 1];
    const huong = sapXep.nguoc ? -1 : 1;
    return [...locXong].sort((a, b) => {
      const va = cot.lay(a);
      const vb = cot.lay(b);
      // «Chưa có hạn» = +∞: để nguyên thì chiều giảm đẩy nó lên đầu, trông như hạn gấp nhất.
      if (va === Number.POSITIVE_INFINITY && vb !== Number.POSITIVE_INFINITY) return 1;
      if (vb === Number.POSITIVE_INFINITY && va !== Number.POSITIVE_INFINITY) return -1;
      if (va < vb) return -huong;
      if (va > vb) return huong;
      return 0;
    });
  }, [locXong, sapXep]);

  /** Lỗi vừa đổi — vá tại chỗ thay vì gọi lại cả danh sách. */
  const vaMot = useCallback((moi) => {
    setDs((cu) => cu.map((x) => (x.id === moi.id ? { ...x, ...moi } : x)));
    setDangMo((cu) => (cu && cu.id === moi.id ? { ...cu, ...moi } : cu));
  }, []);

  /**
   * Thả thẻ sang cột khác → đổi trạng thái. Vẽ TRƯỚC rồi mới gọi API: kéo thả mà thẻ đứng
   * im chờ mạng thì người dùng kéo lại lần nữa. Hỏng thì trả về chỗ cũ và báo lỗi.
   */
  const tha = useCallback(async (cot) => {
    const x = dangKeo;
    setCotDangKeo(''); setDangKeo(null);
    if (!x || x.status === cot) return;
    const cu = x.status;
    vaMot({ id: x.id, status: cot });
    try {
      const { data } = await api.put(`/bao-loi/${x.id}`, { status: cot });
      vaMot({ ...x, ...data });
    } catch (e) {
      vaMot({ id: x.id, status: cu });
      setLoi(e?.response?.data?.error || e.message || 'Không đổi được trạng thái.');
    }
  }, [dangKeo, vaMot]);

  /** Trao đổi nhanh từ thẻ — trả về true nếu gửi được, để thẻ tự đóng ô nhập. */
  const guiBinhLuanNhanh = useCallback(async (x, noiDung) => {
    try {
      await api.post(`/bao-loi/${x.id}/comments`, { content: noiDung });
      setDs((cu) => cu.map((t) => (
        t.id === x.id ? { ...t, so_binh_luan: (t.so_binh_luan || 0) + 1 } : t
      )));
      return true;
    } catch (e) {
      setLoi(e?.response?.data?.error || e.message || 'Không gửi được trao đổi.');
      return false;
    }
  }, []);

  const coLoc = !!(q || locTrangThai || locLoai || locNguoi || locMucDo);
  const moThe = (x) => setDangMo(x);
  const doiSapXep = (id) => setSapXep((cu) => (
    cu.khoa === id ? { khoa: id, nguoc: !cu.nguoc } : { khoa: id, nguoc: false }
  ));

  const veThe = (keoDuoc) => (x) => (
    <TheLoi
      key={x.id} loi={x} onMo={moThe}
      keoDuoc={keoDuoc} onKeo={setDangKeo}
      onGuiBinhLuan={guiBinhLuanNhanh}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Bug className="h-5 w-5 text-rose-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-slate-900">Quản lý lỗi</h1>
          <p className="text-[12px] text-slate-500">
            Lỗi vận hành và lỗi hệ thống của mọi module · chuột phải ở bất kỳ đâu để báo lỗi mới
          </p>
        </div>
        <button
          type="button" onClick={tai} disabled={dangTai}
          className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-600 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer"
        >
          {dangTai ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Tải lại
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {TRANG_THAI.map((x) => (
          <TheKpi key={x.id} icon={Bug} nhan={x.nhan} so={dem[x.id]} mau={x.mau} nen={x.nen} />
        ))}
        <TheKpi icon={AlertTriangle} nhan="Quá hạn" so={dem.tre} mau="#EF4444" nen="bg-rose-100" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {CHE_DO.map((c) => (
            <button
              key={c.id} type="button" onClick={() => setCheDo(c.id)}
              className={`h-8 px-2.5 rounded-lg text-[12px] font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                cheDo === c.id
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <c.icon className="h-3.5 w-3.5" /> {c.nhan}
            </button>
          ))}
          <span className="flex-1" />
          {cheDo === 'trang_thai' ? (
            <span className="text-[11px] text-slate-400 hidden sm:inline">Kéo thẻ sang cột khác để đổi trạng thái</span>
          ) : null}
          <span className="text-[12px] text-slate-500 tabular-nums">
            {locXong.length}/{ds.length} lỗi
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tiêu đề, mô tả, người báo…"
              className="w-full h-8 pl-8 pr-2 text-[12px] border border-slate-200 rounded-lg outline-none focus:border-rose-400"
            />
          </div>
          <select
            value={locTrangThai} onChange={(e) => setLocTrangThai(e.target.value)}
            className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white outline-none focus:border-rose-400 cursor-pointer"
          >
            <option value="">Mọi trạng thái</option>
            {TRANG_THAI.map((x) => <option key={x.id} value={x.id}>{x.nhan}</option>)}
          </select>
          <select
            value={locMucDo} onChange={(e) => setLocMucDo(e.target.value)}
            className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white outline-none focus:border-rose-400 cursor-pointer"
          >
            <option value="">Mọi mức độ</option>
            {MUC_DO.map((x) => <option key={x.id} value={x.id}>{x.nhan}</option>)}
          </select>
          <select
            value={locLoai} onChange={(e) => setLocLoai(e.target.value)}
            className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white outline-none focus:border-rose-400 cursor-pointer max-w-[12rem]"
          >
            <option value="">Mọi loại lỗi</option>
            {dsLoai.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select
            value={locNguoi} onChange={(e) => setLocNguoi(e.target.value)}
            className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white outline-none focus:border-rose-400 cursor-pointer max-w-[12rem]"
          >
            <option value="">Mọi người xử lý</option>
            {dsNguoi.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
          {coLoc ? (
            <button
              type="button"
              onClick={() => { setQ(''); setLocTrangThai(''); setLocLoai(''); setLocNguoi(''); setLocMucDo(''); }}
              className="h-8 px-2.5 rounded-lg text-[12px] font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              Xoá lọc
            </button>
          ) : null}
        </div>
      </div>

      {loi ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700 flex items-start gap-2">
          <span className="flex-1">{loi}</span>
          <button type="button" onClick={() => setLoi('')} aria-label="Bỏ qua" className="cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {dangTai ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-rose-500" />
        </div>
      ) : !locXong.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-500">
          {coLoc ? 'Không có lỗi nào khớp bộ lọc.' : 'Chưa có lỗi nào được báo. Chuột phải vào chỗ hỏng để báo lỗi.'}
        </div>
      ) : cheDo === 'trang_thai' ? (
        <InboxKanbanBoard
          columns={TRANG_THAI.map((x) => ({ key: x.id, label: x.nhan }))}
          grouped={theoTrangThai}
          emptyLabel="Không có lỗi"
          renderItem={veThe(true)}
          keoTha={{
            cotDangKeo: dangKeo ? cotDangKeo : '',
            onVao: setCotDangKeo,
            onRa: () => setCotDangKeo(''),
            onTha: tha,
          }}
        />
      ) : cheDo === 'han' ? (
        // KHÔNG cho kéo ở bảng hạn: thả vào «Tuần sau» thì đặt hạn ngày nào? Máy đoán hộ
        // là đặt sai hạn cho người khác. Đổi hạn làm ở hộp chi tiết, nơi chọn được đúng ngày.
        <InboxKanbanBoard
          columns={DEADLINE_BUCKET_META}
          grouped={theoHan}
          emptyLabel="Không có lỗi"
          renderItem={veThe(false)}
        />
      ) : cheDo === 'lich' ? (
        <InboxCalendarBoard
          items={locXong.filter((x) => !daXong(x))}
          nhanChuaCoHan="chưa đặt hạn"
          renderItem={(x, { quaHan: tre } = {}) => (
            <button
              key={x.id} type="button" onClick={() => moThe(x)} title={x.title}
              className={`block w-full text-left truncate rounded px-1 py-0.5 text-[10px] leading-tight border-l-2 hover:bg-slate-50 cursor-pointer ${
                tre ? 'border-rose-400 text-rose-900' : 'border-indigo-300 text-slate-700'
              }`}
            >
              {x.title}
            </button>
          )}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {COT_BANG.map((c) => (
                  <th key={c.id} className={`px-2 py-2 ${c.rong || 'whitespace-nowrap'}`}>
                    <button
                      type="button" onClick={() => doiSapXep(c.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-rose-600 cursor-pointer"
                    >
                      {c.nhan}
                      {sapXep.khoa === c.id
                        ? (sapXep.nguoc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)
                        : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dsBang.map((x) => {
                const tt = trangThai(x.status);
                const md = mucDo(x.severity);
                const tre = quaHan(x);
                const { loiKe, dauVet } = tachMoTa(x.description);
                const hong = choHong(dauVet);
                const trang = dauVet.find((d) => d.ten === 'Trang')?.gt || '';
                return (
                  <tr
                    key={x.id}
                    onClick={() => moThe(x)}
                    className="border-b border-slate-100 last:border-0 hover:bg-rose-50/40 cursor-pointer"
                  >
                    <td className="px-2 py-2 align-top">
                      <p className="text-[12.5px] font-semibold text-slate-900 line-clamp-2">{x.title}</p>

                      {/* Bảng rộng hơn thẻ Kanban nên kể được nhiều hơn: lời người báo trước,
                          rồi mới tới chỗ hỏng và đường dẫn trang cho người đi sửa. */}
                      {loiKe ? (
                        <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2 leading-snug">{loiKe}</p>
                      ) : null}

                      {hong ? (
                        <p className="mt-0.5 flex items-start gap-1 text-[10.5px] text-slate-600">
                          <Crosshair className="h-2.5 w-2.5 mt-[3px] shrink-0 text-rose-400" />
                          <span className="min-w-0 truncate" title={hong}>{hong}</span>
                        </p>
                      ) : null}

                      {trang ? (
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400 truncate" title={trang}>{trang}</p>
                      ) : null}

                      <p className="text-[10px] text-slate-400 inline-flex items-center gap-2 mt-0.5">
                        {x.so_binh_luan ? <span><MessageSquare className="h-2.5 w-2.5 inline" /> {x.so_binh_luan}</span> : null}
                        {x.so_tep ? <span><Paperclip className="h-2.5 w-2.5 inline" /> {x.so_tep}</span> : null}
                        {x.du_an?.name || ''}
                      </p>
                    </td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${tt.nen} ${tt.chu}`}>{tt.nhan}</span>
                    </td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${md.nen} ${md.chu}`}>{md.nhan}</span>
                    </td>
                    <td className="px-2 py-2 align-top text-[11.5px] text-slate-600 whitespace-nowrap">{x.loai?.name || '—'}</td>
                    <td className="px-2 py-2 align-top text-[11.5px] text-slate-600 whitespace-nowrap">{x.nguoi_xu_ly?.full_name || '—'}</td>
                    <td className={`px-2 py-2 align-top text-[11.5px] whitespace-nowrap ${tre ? 'text-rose-600 font-semibold' : 'text-slate-600'}`}>
                      {x.deadline ? gioNgan(x.deadline) : '—'}
                    </td>
                    <td className="px-2 py-2 align-top text-[11.5px] text-slate-600 whitespace-nowrap">{x.nguoi_bao?.full_name || '—'}</td>
                    <td className="px-2 py-2 align-top text-[11.5px] text-slate-500 whitespace-nowrap">{gioNgan(x.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dangMo ? (
        <HopChiTietLoi
          loi={dangMo}
          dsLoai={dsLoai}
          dsNguoi={dsNguoi}
          onDoi={vaMot}
          onDong={() => setDangMo(null)}
        />
      ) : null}
    </div>
  );
}
