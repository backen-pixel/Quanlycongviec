import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowLeft, Building2, Calculator, Check, Database, ExternalLink,
  FileSpreadsheet, FlaskConical, MapPin, Plus, RefreshCw, Save, Search, Settings, Trash2, X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAccountingUser } from '../lib/crossWorkshopProduction';
import { isAdminLike, isSystemAdmin } from '../lib/adminRole';
import { BASE_OPERANDS } from '../lib/costFormulaTerms';
import {
  costTypeModuleLabel,
  costTypeModuleShort,
  slugCostTypeCode,
} from '../lib/costTypeModules';

/**
 * Nút tích sinh ra số gì. Doanh thu KHÔNG được cộng vào giá vốn, nên nó mang khoá
 * `doanhthu.<mã>` riêng — trùng đúng quy ước bên backend (costLedger.revenueSourceKey).
 */
/**
 * Ba module thật sự có bộ mẫu nhiệm vụ để gắn nút tích. Mua hàng / Dự án tạo được
 * nút tích nhưng chưa có nhiệm vụ nào để gắn, nên không dựng tab riêng cho chúng —
 * chúng vẫn nằm đủ trong bảng tổng hợp phía trên.
 */
const TAB_MODULE = [
  { key: 'production', nhan: 'Sản xuất', short: 'SX' },
  { key: 'logistics', nhan: 'Vận chuyển', short: 'VC' },
  { key: 'crm', nhan: 'CRM', short: 'CRM' },
];

const LS_MODULE_TAB = 'cost_setup_module_tab';

const LOAI_SO = [
  { key: 'chi_phi', nhan: 'Chi phí', mo: 'Cộng vào giá vốn' },
  { key: 'doanh_thu', nhan: 'Doanh thu', mo: 'Số bán ra — không cộng vào giá vốn' },
];

function laDoanhThu(t) {
  return String(t?.value_kind || 'chi_phi') === 'doanh_thu';
}

/** Tên biến của nút tích để gọi trong công thức. */
function bienCuaNutTich(t) {
  const ma = String(t?.code || '').trim().toLowerCase();
  return laDoanhThu(t) ? `doanhthu.${ma}` : `excel.${ma}`;
}

/** Nút tích của từng module — CRM tái dùng nút «Upload Excel Báo giá» vốn đã có. */
const NUT_TICH = {
  crm: { nhan: 'Upload Excel Báo giá', co: 'show_excel_quotation_upload' },
  production: { nhan: 'Nộp Excel chi phí', co: 'require_cost_excel' },
  logistics: { nhan: 'Nộp Excel chi phí', co: 'require_cost_excel' },
};

function laNutBaoGiaCrm(t) {
  return t?.module_key === 'crm' && String(t?.code || '').toLowerCase() === 'bao_gia';
}

const MODULE_VI = {
  production: 'Sản xuất', logistics: 'Vận chuyển', crm: 'CRM',
  purchasing: 'Mua hàng', accounting: 'Kế toán', projects: 'Dự án',
};

/** Số tiền gọn cho bảng chẩn đoán — không kèm chữ «đ» để cột số thẳng hàng. */
function fmtTien(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(Math.round(v));
}

/**
 * Đúng ba bước: ĐẦU VÀO (nút tích lấy Excel từ nhiệm vụ) → CÔNG THỨC → ĐẦU RA.
 * Mọi thứ khác (nguồn tự động, nhóm chi phí, lấp dữ liệu) nằm trong mục «Nâng cao» cuối trang.
 */
const VUNG = [
  { key: 'dauvao', nhan: 'Nút tích', icon: FileSpreadsheet, mo: 'Tạo nút tích và gán xuống nhiệm vụ' },
  { key: 'congthuc', nhan: 'Công thức', icon: Calculator, mo: 'Ghép các nút tích, xem thử kết quả' },
];

const MAU_CHAM = { xanh: 'bg-emerald-500', cam: 'bg-amber-500', xam: 'bg-gray-300' };
const MAU_CHU = { xanh: 'text-emerald-700', cam: 'text-amber-700', xam: 'text-gray-400' };

const LS_VUNG = 'cost_setup_vung';
const LS_COMPANY = 'cost_setup_company_id';
const LS_REGION = 'cost_setup_region_id';

function readLs(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function writeLs(key, value) {
  try { localStorage.setItem(key, value || ''); } catch { /* ignore */ }
}

/** Các nút chèn nhanh vào công thức. Ngoặc quyết định tính cái nào trước. */
const PHEP_TINH = [
  { ky: '+', nhan: '+', mo: 'cộng' },
  { ky: '-', nhan: '−', mo: 'trừ' },
  { ky: '*', nhan: '×', mo: 'nhân' },
  { ky: '/', nhan: '÷', mo: 'chia' },
  { ky: '(', nhan: '(', mo: 'mở ngoặc — tính phần trong ngoặc trước' },
  { ky: ')', nhan: ')', mo: 'đóng ngoặc' },
];

/** Đổi mã biến thành tên tiếng Việt để đọc lại cho dễ. */
function docCongThuc(expr, extras) {
  let t = String(expr || '');
  if (!t.trim()) return '';
  const all = [...(extras || []), ...BASE_OPERANDS].sort((a, b) => String(b.key).length - String(a.key).length);
  all.forEach((o) => { t = t.split(o.key).join(`«${o.label}»`); });
  return t.replace(/\*/g, '×').replace(/\//g, '÷').replace(/\s+/g, ' ').trim();
}

/** Ngoặc có khớp không — báo ngay tại chỗ, khỏi chờ máy chủ. */
function ngoacCanBang(expr) {
  let n = 0;
  for (const c of String(expr || '')) {
    if (c === '(') n += 1;
    if (c === ')') n -= 1;
    if (n < 0) return false;
  }
  return n === 0;
}

/**
 * Ô soạn công thức: gõ tay được, mà bấm nút cũng được.
 * Cho phép ngoặc lồng nhau và dấu % — thứ mà ô chọn theo số hạng cũ không làm nổi.
 */
/**
 * Kết quả thử một công thức: hiện cả giá trị TỪNG số hạng, không chỉ con số cuối —
 * sai ở đâu thì nhìn ra ngay chỗ đó.
 */
function KetQuaThu({ du, onThu, coDuAn }) {
  return (
    <div className="rounded-lg border bg-slate-50/70 px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onThu}
          disabled={du?.dangChay}
          className="h-8 px-2.5 rounded-lg border bg-white text-xs font-semibold text-teal-700 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <FlaskConical className="h-3.5 w-3.5" /> {du?.dangChay ? 'Đang tính…' : 'Thử công thức'}
        </button>
        {!coDuAn && (
          <span className="text-[11px] text-gray-500">
            Chưa chọn dự án ở khối «Thử trên dự án thật» bên dưới — bấm vẫn kiểm được cú pháp.
          </span>
        )}
      </div>

      {du && !du.dangChay && (
        du.ok === false ? (
          <p className="text-[11px] text-red-600 font-semibold">{du.loi || 'Công thức không hợp lệ'}</p>
        ) : du.chi_kiem_cu_phap ? (
          <p className="text-[11px] text-emerald-700 font-semibold">
            Cú pháp đúng. Chọn một dự án bên dưới để xem ra số bao nhiêu.
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span className="text-gray-600">Kết quả trên </span>
              <span className="font-semibold">{du.du_an?.code || du.du_an?.name}</span>
              <span className="text-gray-600"> = </span>
              <span className="font-bold tabular-nums text-teal-800">{fmtTien(du.gia_tri)}</span>
            </p>
            {(du.so_hang || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {du.so_hang.map((sh) => (
                  <span
                    key={sh.key}
                    className={`inline-block rounded-md px-1.5 py-px text-[10px] border ${
                      sh.value == null
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-white border-slate-200 text-gray-700'
                    }`}
                    title={sh.key}
                  >
                    {sh.key} = {sh.value == null ? 'không có' : fmtTien(sh.value)}
                  </span>
                ))}
              </div>
            )}
            {du.so_dong_so === 0 && (
              <p className="text-[10px] text-amber-700">
                Dự án này chưa có dòng nào trong sổ chi phí nên số hạng nào cũng bằng 0.
              </p>
            )}
          </>
        )
      )}
    </div>
  );
}

function SoanCongThuc({ expr, extras, onChange }) {
  const oRef = useRef(null);

  const chen = (txt) => {
    const el = oRef.current;
    const cu = String(expr || '');
    const a = el && typeof el.selectionStart === 'number' ? el.selectionStart : cu.length;
    const b = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : cu.length;
    const truoc = cu.slice(0, a);
    const sau = cu.slice(b);
    const cach = truoc && !/[\s(]$/.test(truoc) ? ' ' : '';
    const moi = `${truoc}${cach}${txt} ${sau}`;
    onChange(moi.replace(/\s{2,}/g, ' ').trimStart());
    const viTri = (truoc + cach + txt + ' ').replace(/\s{2,}/g, ' ').trimStart().length;
    requestAnimationFrame(() => {
      if (oRef.current) { oRef.current.focus(); oRef.current.setSelectionRange(viTri, viTri); }
    });
  };

  const canBang = ngoacCanBang(expr);
  const doc = docCongThuc(expr, extras);

  return (
    <div className="space-y-1.5">
      <input
        ref={oRef}
        value={expr || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="vd. (excel.gia_von_nvl + excel.phi_vc) + 10%"
        className={`h-10 w-full px-2.5 border rounded-lg text-sm font-mono bg-white ${
          canBang ? '' : 'border-red-400 bg-red-50'
        }`}
        spellCheck={false}
      />
      <div className="flex flex-wrap gap-1">
        {(extras || []).map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => chen(o.key)}
            title={o.key}
            className={`h-7 px-2 rounded-md border text-[11px] font-medium ${
              String(o.key).startsWith('doanhthu.')
                ? 'bg-sky-50 border-sky-200 text-sky-800'
                : String(o.key).startsWith('cat.')
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-teal-50 border-teal-200 text-teal-800'
            }`}
          >
            {o.label}
          </button>
        ))}
        {BASE_OPERANDS.filter((o) => ['crm.doanh_thu', 'entries.total'].includes(o.key)).map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => chen(o.key)}
            className="h-7 px-2 rounded-md border bg-white text-[11px] font-medium text-gray-700"
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {PHEP_TINH.map((x) => (
          <button
            key={x.ky}
            type="button"
            onClick={() => chen(x.ky)}
            title={x.mo}
            className="h-8 w-9 rounded-md border bg-white text-sm font-bold text-gray-800 hover:bg-gray-50"
          >
            {x.nhan}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-gray-200" />
        {[5, 10].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => chen(`+ ${n}%`)}
            title={`Cộng thêm ${n}% vào toàn bộ phần trước đó`}
            className="h-8 px-2 rounded-md border bg-amber-50 border-amber-200 text-[11px] font-bold text-amber-800"
          >
            + {n}%
          </button>
        ))}
        <button
          type="button"
          onClick={() => chen('- 10%')}
          title="Trừ bớt 10% khỏi toàn bộ phần trước đó"
          className="h-8 px-2 rounded-md border bg-amber-50 border-amber-200 text-[11px] font-bold text-amber-800"
        >
          − 10%
        </button>
      </div>
      {!canBang && (
        <p className="text-[11px] text-red-600 font-semibold">Ngoặc chưa khớp — thiếu «(» hoặc «)».</p>
      )}
      {doc && canBang && (
        <p className="text-[11px] text-gray-500">Đọc là: <span className="text-gray-800">{doc}</span></p>
      )}
    </div>
  );
}

const MODULE_TONE = {
  production: 'border-teal-200 bg-teal-50/40',
  logistics: 'border-cyan-200 bg-cyan-50/40',
  crm: 'border-indigo-200 bg-indigo-50/40',
  purchasing: 'border-amber-200 bg-amber-50/40',
  projects: 'border-slate-200 bg-slate-50',
};

const MODULE_SOC = {
  production: 'bg-teal-500',
  logistics: 'bg-cyan-500',
  crm: 'bg-indigo-500',
  purchasing: 'bg-amber-500',
  projects: 'bg-slate-400',
};

export default function AccountingCostSetupPage({
  backTo = '/ketoan/chi-phi',
  backLabel = 'Sổ chi phí',
} = {}) {
  const { user } = useAuth();
  const lockedCompanyId = isAccountingUser(user)
    ? String(user?.company_id || '')
    : (!isSystemAdmin(user) && user?.company_id ? String(user.company_id) : '');
  const canPickCompany = isSystemAdmin(user) || isAdminLike(user);

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(() => lockedCompanyId || readLs(LS_COMPANY));
  const [regionId, setRegionId] = useState(() => readLs(LS_REGION));
  const [regions, setRegions] = useState([]);
  const [cloned, setCloned] = useState(false);
  const [companyLabel, setCompanyLabel] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [types, setTypes] = useState([]);
  const [workTpls, setWorkTpls] = useState({ production: [], logistics: [], crm: [] });
  const [newCat, setNewCat] = useState({ code: '', name: '' });
  const [newType, setNewType] = useState({ name: '', module_key: 'production', value_kind: 'chi_phi' });
  const [newF, setNewF] = useState({
    code: '',
    name: '',
    expr_text: 'crm.doanh_thu - gia_von',
    workshop_type_id: '',
  });
  const [previewErr, setPreviewErr] = useState('');

  // ── Tạo nhiệm vụ ngay tại đây: cần danh mục khu vực / phân loại / cột pipeline ──
  const [scopes, setScopes] = useState(null);
  const [nvMoId, setNvMoId] = useState('');
  const [nvForm, setNvForm] = useState(null);
  const [nvBusy, setNvBusy] = useState(false);
  const [nvMsg, setNvMsg] = useState('');

  // Danh sách nhiệm vụ để tích nút «nộp Excel», theo từng loại chi phí.
  const [moduleTab, setModuleTab] = useState(() => {
    const luu = readLs(LS_MODULE_TAB);
    return TAB_MODULE.some((m) => m.key === luu) ? luu : 'production';
  });
  // Chuỗi chọn của tab Nút tích: module → công ty → khu vực → loại → cột → nhiệm vụ.
  const [locLoai, setLocLoai] = useState('');
  const [locCot, setLocCot] = useState('');
  const [dsNutTich, setDsNutTich] = useState(null);
  const [dsNutTichTai, setDsNutTichTai] = useState(false);
  const [nvDs, setNvDs] = useState({});
  const [nvQ, setNvQ] = useState({});
  const nvTimer = useRef({});
  const [nutChonId, setNutChonId] = useState('');
  const [dangThemNut, setDangThemNut] = useState(false);

  const [vung, setVung] = useState(() => {
    const luu = readLs(LS_VUNG);
    // Tên vùng cũ ('excel', 'kiemtra', 'dauRa') không còn — rơi về Nút tích thay vì trang trắng.
    return VUNG.some((v) => v.key === luu) ? luu : 'dauvao';
  });
  useEffect(() => { writeLs(LS_VUNG, vung); }, [vung]);
  // Đổi module thì loại / cột của module cũ không còn nghĩa — xóa để không lọc nhầm.
  useEffect(() => { setLocLoai(''); setLocCot(''); }, [moduleTab, companyId, regionId]);

  useEffect(() => {
    writeLs(LS_MODULE_TAB, moduleTab);
    setDangThemNut(false);
    setNvMoId('');
    // Tạo nút tích mới thì mặc định thuộc đúng module đang mở — khỏi phải chọn lại.
    setNewType((x) => ({
      ...x,
      module_key: moduleTab,
      value_kind: moduleTab === 'crm' ? 'doanh_thu' : (x.module_key === moduleTab ? x.value_kind : 'chi_phi'),
    }));
  }, [moduleTab]);

  // ── Kiểm tra đường dữ liệu (đầu vào → sổ → công thức) ──
  const [diag, setDiag] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagErr, setDiagErr] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState('');
  const [testList, setTestList] = useState([]);
  const [testId, setTestId] = useState('');
  const [testRow, setTestRow] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [thuNhanh, setThuNhanh] = useState({});

  useEffect(() => {
    if (lockedCompanyId && companyId !== lockedCompanyId) setCompanyId(lockedCompanyId);
  }, [lockedCompanyId, companyId]);

  useEffect(() => {
    api.get('/companies')
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => { writeLs(LS_COMPANY, companyId); }, [companyId]);
  useEffect(() => { writeLs(LS_REGION, regionId); }, [regionId]);

  const adminParams = useMemo(() => {
    const p = {};
    if (companyId) p.client_company_id = companyId;
    if (regionId) p.region_id = regionId;
    return p;
  }, [companyId, regionId]);

  const typesTheoTab = (types || []).filter((t) => t.module_key === moduleTab);

  const extraOperands = useMemo(() => {
    const cats = (categories || []).map((c) => ({ key: `cat.${c.code}`, label: `Nhóm: ${c.name}` }));
    const excels = (types || [])
      .filter((t) => t.is_active !== false)
      .map((t) => ({
        key: bienCuaNutTich(t),
        label: `${t.name} (${costTypeModuleShort(t.module_key)})`,
      }));
    return [...excels, ...cats];
  }, [categories, types]);

  const load = useCallback(async () => {
    if (!companyId) {
      setCategories([]);
      setSources([]);
      setFormulas([]);
      setTypes([]);
      setRegions([]);
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setCloned(false);
    try {
      const { data } = await api.get('/cost-hub/setup', { params: adminParams });
      setCategories(data.categories || []);
      setSources(data.sources || []);
      setFormulas(data.formulas || []);
      setTypes(data.types || []);
      setRegions(data.regions || []);
      setCloned(data.cloned === true);
      setCompanyLabel(data.client_company?.short_name || data.client_company?.name || '');
      if (regionId && (data.regions || []).length
        && !(data.regions || []).some((r) => String(r.id) === String(regionId))) {
        setRegionId('');
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Không tải được setup';
      if (regionId && /khu vực/i.test(String(msg))) {
        setRegionId('');
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [adminParams, companyId, regionId]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const loadWorkTpls = useCallback(async () => {
    if (!companyId) {
      setWorkTpls({ production: [], logistics: [], crm: [] });
      return;
    }
    const loadT = async (module_key) => {
      try {
        const { data } = await api.get('/cost-hub/work-templates', { params: { ...adminParams, module_key } });
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    };
    const pairs = await Promise.all(['production', 'logistics', 'crm'].map(async (k) => [k, await loadT(k)]));
    setWorkTpls(Object.fromEntries(pairs));
  }, [adminParams, companyId]);

  useEffect(() => { loadWorkTpls(); }, [loadWorkTpls]);

  /** Danh mục cho các ô chọn phạm vi — tải một lần khi mở form tạo nhiệm vụ. */
  const loadScopes = useCallback(async () => {
    if (!companyId) { setScopes(null); return null; }
    try {
      const { data } = await api.get('/cost-hub/work-scopes', { params: adminParams });
      setScopes(data);
      return data;
    } catch {
      const rong = {
        regions: [], workshop_types: [], production_stages: [],
        logistics_stages: [], crm_pipelines: [], crm_stages: [],
      };
      setScopes(rong);
      return rong;
    }
  }, [adminParams, companyId]);

  useEffect(() => { setScopes(null); setNvMoId(''); setNvForm(null); setNvMsg(''); }, [companyId, regionId]);

  const saveCategory = async (c) => {
    try {
      await api.put(`/cost-hub/categories/${c.id}`, {
        name: c.name, is_active: c.is_active, sort_order: c.sort_order,
      }, { params: adminParams });
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const addCategory = async () => {
    if (!newCat.code.trim() || !newCat.name.trim()) return alert('Nhập mã và tên nhóm');
    try {
      await api.post('/cost-hub/categories', newCat, { params: adminParams });
      setNewCat({ code: '', name: '' });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const saveSource = async (s, patch) => {
    try {
      const { data } = await api.put(`/cost-hub/sources/${s.id}`, patch, { params: adminParams });
      setSources((list) => list.map((x) => (x.id === s.id ? data : x)));
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  // ── Chẩn đoán: mỗi nguồn đang có bao nhiêu tiền ở module gốc, đã vào sổ bao nhiêu ──
  const loadDiag = useCallback(async () => {
    if (!companyId) { setDiag(null); return; }
    setDiagLoading(true);
    setDiagErr('');
    try {
      const { data } = await api.get('/cost-hub/diagnostics', { params: adminParams });
      setDiag(data);
    } catch (e) {
      setDiagErr(e.response?.data?.error || e.message || 'Không kiểm tra được đường dữ liệu');
      setDiag(null);
    } finally {
      setDiagLoading(false);
    }
  }, [adminParams, companyId]);

  useEffect(() => { if (user && companyId) loadDiag(); }, [user, companyId, loadDiag]);

  const tongDangCho = (diag?.sources || []).reduce((n, x) => n + (x.dang_cho || 0), 0);

  /** Chấm màu + một dòng chữ trên mỗi tab: nhìn là biết vùng nào đang hổng. */
  const nhanVung = useMemo(() => {
    const soLoai = (types || []).filter((t) => t.is_active !== false).length;
    const soCt = (formulas || []).filter((f) => f.is_active !== false).length;
    const soGanTong = (dsNutTich || [])
      .reduce((n, t) => n + (t.so_nhiem_vu || 0), 0);
    const dongSo = diag?.so_chi_phi?.con_hieu_luc;

    let dauVaoChu = 'Chưa tạo nút tích nào';
    let dauVaoMuc = 'cam';
    if (soLoai > 0) {
      dauVaoMuc = 'xanh';
      dauVaoChu = soGanTong > 0
        ? `${soLoai} nút tích · ${soGanTong} nhiệm vụ`
        : `${soLoai} nút tích — mở ra gắn nhiệm vụ`;
    }

    return {
      dauvao: { muc: dauVaoMuc, chu: dauVaoChu },
      congthuc: soCt > 0
        ? { muc: 'xanh', chu: `${soCt} công thức${dongSo > 0 ? ` · ${dongSo} dòng sổ` : ''}` }
        : { muc: 'cam', chu: 'Chưa có công thức' },
    };
  }, [diag, types, formulas, dsNutTich]);

  // Backfill CHỈ chạy khi người dùng bấm — không bao giờ tự động, vì nó ghi hàng trăm dòng sổ.
  // Gọi API theo LÔ (mỗi lô ~40 dự án) rồi lặp tới khi done — một request ôm 174 dự án
  // là ~1.400 lượt truy vấn, đủ lâu để timeout.
  const runBackfill = async () => {
    if (!companyId || backfilling) return;
    const ok = window.confirm(
      `Lấp dữ liệu cũ vào sổ chi phí của ${companyLabel || 'công ty đang chọn'}?\n\n`
      + `Ước tính ${tongDangCho} bản ghi đang chờ.\n`
      + 'Thao tác chỉ THÊM / CẬP NHẬT dòng sổ, không sửa và không xóa dữ liệu gốc. '
      + 'Chạy lại nhiều lần vẫn ra cùng kết quả.',
    );
    if (!ok) return;
    setBackfilling(true);
    setBackfillMsg('Đang lấp…');
    let offset = 0;
    let tongSynced = 0;
    let tongPo = 0;
    try {
      for (let vong = 0; vong < 200; vong += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await api.post(
          '/cost-hub/backfill',
          { limit: 40, offset },
          { params: adminParams },
        );
        tongSynced += data?.synced ?? 0;
        tongPo += data?.po_count ?? 0;
        offset = data?.next_offset ?? offset;
        setBackfillMsg(
          `Đang lấp… ${offset}/${data?.project_count ?? '?'} dự án · ${tongSynced} bản ghi`,
        );
        if (data?.done) break;
        if (!data || data.processed === 0) break;
      }
      setBackfillMsg(`Xong — đã xử lý ${tongSynced} bản ghi, ${tongPo} lệnh đặt hàng.`);
      await loadDiag();
    } catch (e) {
      setBackfillMsg(
        `${e.response?.data?.error || e.message || 'Lỗi khi lấp dữ liệu'}`
        + ` (đã xử lý ${tongSynced} bản ghi trước khi dừng — bấm lại để chạy tiếp)`,
      );
      await loadDiag();
    } finally {
      setBackfilling(false);
    }
  };

  const saveSourceCategory = async (row, categoryId) => {
    await saveSource({ id: row.id }, { default_category_id: categoryId || null });
    setDiag((d) => (d ? {
      ...d,
      sources: d.sources.map((x) => (x.id === row.id
        ? {
          ...x,
          default_category_id: categoryId || null,
          category_name: categories.find((c) => String(c.id) === String(categoryId))?.name || null,
        }
        : x)),
    } : d));
  };

  const saveSourceAuto = async (row, autoPush) => {
    await saveSource({ id: row.id }, { auto_push: autoPush });
    setDiag((d) => (d ? {
      ...d,
      sources: d.sources.map((x) => (x.id === row.id ? { ...x, auto_push: autoPush } : x)),
    } : d));
  };

  // ── Thử công thức trên dự án thật ──
  const loadTestList = useCallback(async () => {
    if (!companyId) { setTestList([]); return; }
    try {
      const { data } = await api.get('/cost-hub/projects', { params: { ...adminParams, limit: 50 } });
      setTestList(Array.isArray(data?.projects) ? data.projects : []);
    } catch {
      setTestList([]);
    }
  }, [adminParams, companyId]);

  /** Thử công thức ĐANG GÕ trên dự án đang chọn ở khối Đầu ra — chưa lưu cũng xem được. */
  const thuCongThuc = async (khoa, exprText) => {
    setThuNhanh((m) => ({ ...m, [khoa]: { dangChay: true } }));
    try {
      const { data } = await api.post('/cost-hub/preview-formula-run', {
        expr_text: exprText,
        project_id: testId || null,
      }, { params: adminParams });
      setThuNhanh((m) => ({ ...m, [khoa]: { ...data, dangChay: false } }));
    } catch (e) {
      setThuNhanh((m) => ({
        ...m,
        [khoa]: { ok: false, loi: e.response?.data?.error || e.message, dangChay: false },
      }));
    }
  };

  const pickTest = async (id) => {
    setTestId(id);
    setTestRow(null);
    if (!id) return;
    setTestLoading(true);
    try {
      const { data } = await api.get(`/cost-hub/projects/${id}/summary`, { params: adminParams });
      setTestRow(data);
    } catch (e) {
      setTestRow({ loi: e.response?.data?.error || e.message || 'Không tải được' });
    } finally {
      setTestLoading(false);
    }
  };

  const saveFormula = async (f) => {
    setPreviewErr('');
    try {
      await api.put(`/cost-hub/formulas/${f.id}`, {
        workshop_type_id: f.workshop_type_id || null,
        name: f.name, expr_text: f.expr_text, is_active: f.is_active, sort_order: f.sort_order,
      }, { params: adminParams });
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const addFormula = async () => {
    if (!newF.name.trim() || !String(newF.expr_text || '').trim()) {
      return alert('Nhập tên công thức và chọn số hạng');
    }
    const code = (newF.code.trim() || newF.name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      || 'cong_thuc';
    try {
      await api.post('/cost-hub/preview-formula', { expr_text: newF.expr_text });
      await api.post('/cost-hub/formulas', {
        ...newF, code, workshop_type_id: newF.workshop_type_id || null,
      }, { params: adminParams });
      setNewF({ code: '', name: '', expr_text: 'crm.doanh_thu - gia_von' });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const addType = async () => {
    if (!newType.name.trim()) return alert('Nhập tên loại chi phí');
    try {
      const { data } = await api.post('/cost-hub/types', {
        name: newType.name.trim(),
        module_key: newType.module_key,
        value_kind: newType.value_kind || 'chi_phi',
        code: slugCostTypeCode(newType.name),
      }, { params: adminParams });
      setNewType({ name: '', module_key: newType.module_key, value_kind: newType.value_kind || 'chi_phi' });
      setDangThemNut(false);
      await load();
      await loadDsNutTich();
      if (data?.id) setNutChonId(data.id);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const saveType = async (t) => {
    try {
      await api.put(`/cost-hub/types/${t.id}`, {
        name: t.name, module_key: t.module_key, is_active: t.is_active,
        value_kind: t.value_kind || 'chi_phi',
      }, { params: adminParams });
      await loadDsNutTich();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const deleteType = async (t) => {
    if (laNutBaoGiaCrm(t)) {
      return alert('Đây là nút Upload Excel Báo giá có sẵn trên CRM — không xóa. Tắt «Đang dùng» nếu chưa cần.');
    }
    if (!confirm(`Xóa loại chi phí «${t.name}»?`)) return;
    try {
      await api.delete(`/cost-hub/types/${t.id}`, { params: adminParams });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };


  // ── Tạo nhiệm vụ mới ngay trong khối loại chi phí ─────────────────────────
  const dsCotTheoModule = (moduleKey) => {
    if (!scopes) return [];
    if (moduleKey === 'logistics') return scopes.logistics_stages || [];
    if (moduleKey === 'crm') return scopes.crm_stages || [];
    return scopes.production_stages || [];
  };

  /** Một dòng chữ mô tả bộ mẫu áp cho đâu — để chọn không bị mù. */
  const moTaPhamVi = (tpl, moduleKey) => {
    if (!scopes) return '';
    const phan = [];
    if (moduleKey !== 'crm') {
      const kv = (scopes.regions || []).find((x) => String(x.id) === String(tpl.region_id));
      phan.push(kv ? kv.name : 'Mọi khu vực');
    }
    if (moduleKey === 'production') {
      const pl = (scopes.workshop_types || []).find((x) => String(x.id) === String(tpl.workshop_type_id));
      phan.push(pl ? pl.name : 'Mọi phân loại');
    }
    const cot = dsCotTheoModule(moduleKey).find((x) => String(x.id) === String(tpl.stage_id));
    phan.push(cot ? cot.name : 'Mọi cột');
    return phan.join(' · ');
  };

  /** Bảng tổng hợp: mỗi nút tích đang bật ở những nhiệm vụ nào. */
  const loadDsNutTich = useCallback(async () => {
    if (!companyId) { setDsNutTich(null); return; }
    setDsNutTichTai(true);
    try {
      const { data } = await api.get('/cost-hub/type-usage', { params: adminParams });
      setDsNutTich(data?.types || []);
    } catch {
      setDsNutTich([]);
    } finally {
      setDsNutTichTai(false);
    }
  }, [adminParams, companyId]);

  useEffect(() => { loadDsNutTich(); }, [loadDsNutTich]);

  /** Tìm nhiệm vụ theo từ khoá (gõ tới đâu lọc tới đó, chờ 300ms cho đỡ gọi liên tục). */
  const timNhiemVu = (type, q, ngay = false) => {
    setNvQ((m) => ({ ...m, [type.id]: q }));
    const chay = async () => {
      setNvDs((m) => ({ ...m, [type.id]: { ...(m[type.id] || { items: [], tong: 0, hien: 0 }), dangTai: true } }));
      try {
        const { data } = await api.get('/cost-hub/work-items', {
          params: {
            ...adminParams,
            module_key: type.module_key,
            cost_type_id: type.id,
            q: q || '',
            ...(locLoai ? { workshop_type_id: locLoai } : {}),
            ...(locCot ? { stage_id: locCot } : {}),
          },
        });
        setNvDs((m) => ({
          ...m,
          [type.id]: {
            items: data?.items || [], tong: data?.tong || 0, hien: data?.hien || 0, dangTai: false,
          },
        }));
      } catch (e) {
        setNvDs((m) => ({ ...m, [type.id]: { items: [], tong: 0, hien: 0, dangTai: false, loi: e.response?.data?.error || e.message } }));
      }
    };
    clearTimeout(nvTimer.current[type.id]);
    if (ngay) chay();
    else nvTimer.current[type.id] = setTimeout(chay, 300);
  };

  useEffect(() => {
    const ds = (types || []).filter((t) => t.module_key === moduleTab);
    if (!ds.length) {
      if (nutChonId) setNutChonId('');
      return;
    }
    if (!ds.some((t) => String(t.id) === String(nutChonId))) {
      setNutChonId(ds[0].id);
    }
  }, [moduleTab, types, nutChonId]);

  useEffect(() => {
    if (!nutChonId) return;
    const t = (types || []).find((x) => String(x.id) === String(nutChonId));
    if (t && !nvDs[t.id]) timNhiemVu(t, nvQ[t.id] || '', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nutChonId]);

  useEffect(() => {
    const crm = (types || []).find((t) => laNutBaoGiaCrm(t));
    if (crm && moduleTab === 'crm' && !nvDs[crm.id]) timNhiemVu(crm, '', true);
    // nạp danh sách một lần khi loại Báo giá xuất hiện
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types, moduleTab]);

  // Đổi loại / cột thì danh sách nhiệm vụ đang mở phải nạp lại theo bộ lọc mới.
  useEffect(() => {
    Object.keys(nvDs || {}).forEach((typeId) => {
      const t = (types || []).find((x) => String(x.id) === String(typeId));
      if (t) timNhiemVu(t, nvQ[typeId] || '', true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locLoai, locCot]);

  /** Bật / tắt nút «nộp Excel» của loại này trên một nhiệm vụ. */
  const ganNhiemVu = async (type, nv, on) => {
    // Cập nhật ngay trên màn cho đỡ khựng; lỗi thì trả lại trạng thái cũ.
    const datTaiCho = (gan) => setNvDs((m) => {
      const cu = m[type.id];
      if (!cu) return m;
      return {
        ...m,
        [type.id]: {
          ...cu,
          items: cu.items.map((x) => (String(x.id) === String(nv.id)
            ? { ...x, da_gan: gan, nut_dang_bat: gan, cost_type_id: gan ? type.id : null }
            : x)),
        },
      };
    });
    datTaiCho(on);
    try {
      // Bật đúng nút của module: CRM là nút báo giá, xưởng/VC là nút nộp Excel chi phí.
      const co = (NUT_TICH[type.module_key] || NUT_TICH.production).co;
      await api.put(`/cost-hub/work-items/${nv.template_kind}/${nv.id}`, {
        [co]: on,
        cost_type_id: on ? type.id : null,
      }, { params: adminParams });
      loadDsNutTich();
    } catch (e) {
      datTaiCho(!on);
      alert(e.response?.data?.error || e.message);
    }
  };

  const moFormNhiemVu = async (type) => {
    if (nvMoId === type.id) { setNvMoId(''); setNvForm(null); return; }
    setNvMoId(type.id);
    setNvMsg('');
    setNvForm({
      cach: 'co_san',
      tpl_id: '',
      tpl_name: '',
      region_id: '',
      workshop_type_id: '',
      stage_id: '',
      title: '',
      deadline_days: '',
    });
    if (!scopes) await loadScopes();
  };

  const taoNhiemVu = async (type, kind) => {
    if (!nvForm || nvBusy) return;
    const tenViec = String(nvForm.title || '').trim();
    if (!tenViec) { setNvMsg('Nhập tên nhiệm vụ'); return; }
    setNvBusy(true);
    setNvMsg('');
    try {
      let tplId = nvForm.tpl_id;
      if (nvForm.cach === 'moi') {
        const tenBo = String(nvForm.tpl_name || '').trim();
        if (!tenBo) { setNvMsg('Nhập tên bộ mẫu mới'); setNvBusy(false); return; }
        const { data: boMoi } = await api.post('/cost-hub/work-templates', {
          name: tenBo,
          module_key: type.module_key,
          region_id: nvForm.region_id || null,
          workshop_type_id: nvForm.workshop_type_id || null,
          stage_id: nvForm.stage_id || null,
        }, { params: adminParams });
        tplId = boMoi?.id;
      }
      if (!tplId) { setNvMsg('Chọn bộ mẫu hoặc tạo bộ mẫu mới'); setNvBusy(false); return; }

      const coNut = (NUT_TICH[type.module_key] || NUT_TICH.production).co;
      await api.post(`/cost-hub/work-templates/${kind}/${tplId}/items`, {
        title: tenViec,
        deadline_days: nvForm.deadline_days === '' ? null : Number(nvForm.deadline_days),
        [coNut]: true,
        cost_type_id: type.id,
      }, { params: adminParams });

      // Nhiệm vụ vừa tạo đã bật sẵn nút nộp Excel của loại này — nạp lại danh sách để thấy nó đã tích.
      await loadWorkTpls();
      timNhiemVu(type, nvQ[type.id] || '', true);
      loadDsNutTich();
      setNvForm((f) => (f ? { ...f, title: '', deadline_days: '', cach: 'co_san', tpl_id: tplId, tpl_name: '' } : f));
      setNvMsg(`Đã thêm «${tenViec}» — nhiệm vụ này sẽ bắt nộp Excel «${type.name}».`);
    } catch (e) {
      setNvMsg(e.response?.data?.error || e.message || 'Lỗi tạo nhiệm vụ');
    } finally {
      setNvBusy(false);
    }
  };

  const canSetup = isAccountingUser(user)
    || isAdminLike(user)
    || ['manager'].includes(String(user?.role || ''));
  if (!canSetup) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-amber-800 font-medium">Setup công thức chi phí dành cho kế toán hoặc admin.</p>
      </div>
    );
  }

  const scopeHint = regionId
    ? 'Đang sửa riêng khu vực này — không đổi mặc định toàn công ty.'
    : 'Đang sửa mặc định toàn công ty. Chọn khu vực nếu mỗi vùng dùng công thức khác.';

  const companyOptions = companies.length
    ? companies
    : (companyId ? [{ id: companyId, name: companyLabel || 'Công ty đang chọn' }] : []);
  const nutDangChon = typesTheoTab.find((t) => String(t.id) === String(nutChonId)) || null;
  const usageCuaNut = (id) => (dsNutTich || []).find((x) => String(x.id) === String(id));

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline mb-1">
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
          <div className="flex items-center gap-2 text-teal-700">
            <Settings className="h-5 w-5" />
            <h1 className="text-2xl font-extrabold text-gray-900">Setup chi phí</h1>
          </div>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">
            Ba bước: <span className="font-semibold text-gray-800">đầu vào</span> là nút tích cho nhân viên
            nộp Excel ở nhiệm vụ · <span className="font-semibold text-gray-800">công thức</span> cộng trừ
            nhân chia các số đó · <span className="font-semibold text-gray-800">đầu ra</span> là kết quả trên dự án.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 shrink-0">
          <label className="text-xs font-semibold text-gray-600">
            <span className="inline-flex items-center gap-1 mb-1"><Building2 className="h-3.5 w-3.5" /> Công ty</span>
            <select
              value={companyId}
              disabled={!!lockedCompanyId && !canPickCompany}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setRegionId('');
              }}
              className="block mt-1 h-9 min-w-[200px] px-2 border rounded-lg text-sm bg-white"
            >
              <option value="">— Chọn công ty —</option>
              {companyOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            <span className="inline-flex items-center gap-1 mb-1"><MapPin className="h-3.5 w-3.5" /> Khu vực</span>
            <select
              value={regionId}
              disabled={!companyId}
              onChange={(e) => setRegionId(e.target.value)}
              className="block mt-1 h-9 min-w-[180px] px-2 border rounded-lg text-sm bg-white disabled:bg-gray-50"
            >
              <option value="">Toàn công ty (mặc định)</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>


      {!companyId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Chọn công ty ở góc phải trước khi setup.
        </div>
      )}

      {companyId && (
        <p className="text-xs text-gray-500">{scopeHint}</p>
      )}

      {cloned && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-800">
          Đã sao chép setup mặc định công ty sang khu vực này. Sửa ở đây không đổi bản toàn công ty.
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-500">Đang tải…</p>}
      {previewErr && <p className="text-xs text-red-600">{previewErr}</p>}

      {companyId && !loading && (
        <>
      {/* ── Thanh vùng: đầu vào → công thức → đầu ra ─────────────────── */}
      <div className="rounded-xl border bg-white p-1.5 grid sm:grid-cols-2 gap-1">
        {VUNG.map((v, i) => {
          const dangMo = vung === v.key;
          const tt = nhanVung[v.key];
          const IconVung = v.icon;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setVung(v.key)}
              title={v.mo}
              className={`text-left rounded-lg px-3 py-2 transition-colors ${
                dangMo ? 'bg-teal-600 shadow-sm' : 'hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`h-6 w-6 shrink-0 rounded-full text-xs font-bold inline-flex items-center justify-center ${
                  dangMo ? 'bg-white/25 text-white' : 'bg-teal-50 text-teal-700'
                }`}
                >
                  {i + 1}
                </span>
                <IconVung className={`h-4 w-4 shrink-0 ${dangMo ? 'text-white' : 'text-teal-700'}`} />
                <span className={`font-semibold text-sm truncate ${dangMo ? 'text-white' : 'text-gray-900'}`}>
                  {v.nhan}
                </span>
                <span className={`ml-auto h-2.5 w-2.5 rounded-full shrink-0 ${MAU_CHAM[tt.muc]}`} />
              </span>
              <span className={`block text-[11px] mt-0.5 pl-8 truncate ${
                dangMo ? 'text-teal-50' : MAU_CHU[tt.muc]
              }`}
              >
                {tt.chu}
              </span>
            </button>
          );
        })}
      </div>

      {vung === 'dauvao' && (
        <>
      <section className="rounded-xl border bg-white p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <span className="h-7 w-7 shrink-0 rounded-full bg-teal-600 text-white text-sm font-bold inline-flex items-center justify-center">1</span>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900">Nút tích — lấy Excel từ nhiệm vụ</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Mỗi thẻ là <span className="font-medium text-gray-700">một số đầu vào</span> cho công thức.
                Chọn thẻ, rồi tích nhiệm vụ sẽ hiện nút nộp Excel — giống «Upload Excel Báo giá» trên CRM.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadDsNutTich}
            className="h-8 px-2.5 rounded-lg border bg-white text-xs font-semibold text-gray-700 inline-flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${dsNutTichTai ? 'animate-spin' : ''}`} /> Tải lại
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {TAB_MODULE.map((m) => {
            const soNut = (types || []).filter((t) => t.module_key === m.key).length;
            const soNv = (dsNutTich || [])
              .filter((t) => t.module_key === m.key)
              .reduce((n, t) => n + (t.so_nhiem_vu || 0), 0);
            const dangMo = moduleTab === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setModuleTab(m.key)}
                className={`h-9 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 ${
                  dangMo ? 'bg-teal-600 text-white' : 'border bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {m.nhan}
                <span className={`text-[10px] tabular-nums rounded-full px-1.5 ${
                  dangMo ? 'bg-white/25' : (soNut > 0 ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-400')
                }`}
                >
                  {soNut}{soNv > 0 ? ` · ${soNv} việc` : ''}
                </span>
              </button>
            );
          })}
          {(types || []).some((t) => !TAB_MODULE.some((m) => m.key === t.module_key)) && (
            <span className="text-[11px] text-gray-500 ml-1">
              (còn {(types || []).filter((t) => !TAB_MODULE.some((m) => m.key === t.module_key)).length} nút
              {' '}ở module khác)
            </span>
          )}
        </div>

        {typesTheoTab.length === 0 && !dangThemNut && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <FileSpreadsheet className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            {moduleTab === 'crm' ? (
              <>
                <p className="text-sm font-medium text-gray-700">Đang lấy nút Upload Excel Báo giá có sẵn trên CRM…</p>
                <p className="text-xs text-gray-500 mt-1">
                  Không tạo nút mới — hệ thống dùng đúng nút Báo giá trên nhiệm vụ CRM.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">
                  Chưa có nút tích nào cho {TAB_MODULE.find((m) => m.key === moduleTab)?.nhan}
                </p>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Tạo cái đầu tiên — ví dụ «{moduleTab === 'logistics' ? 'Phí vận chuyển' : 'Giá vốn NVL'}».
                </p>
                <button
                  type="button"
                  onClick={() => setDangThemNut(true)}
                  className="h-9 px-3 rounded-lg bg-teal-600 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Thêm nút tích
                </button>
              </>
            )}
          </div>
        )}

        {(typesTheoTab.length > 0 || dangThemNut) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {typesTheoTab.map((t) => {
              const usage = usageCuaNut(t.id);
              const dsNv = nvDs[t.id] || null;
              const ganList = dsNv
                ? dsNv.items.filter((x) => x.da_gan)
                : (usage?.nhiem_vu || []);
              const soGan = dsNv ? ganList.length : (usage?.so_nhiem_vu ?? null);
              const dangChon = String(t.id) === String(nutChonId);
              const chips = ganList.slice(0, 3);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNutChonId(t.id)}
                  className={`text-left rounded-xl border bg-white overflow-hidden transition-shadow ${
                    dangChon
                      ? 'border-teal-400 ring-2 ring-teal-500 shadow-md'
                      : 'border-gray-200 hover:border-teal-300 hover:shadow-sm'
                  } ${t.is_active === false ? 'opacity-60' : ''}`}
                >
                  <span className={`block h-1 ${MODULE_SOC[t.module_key] || 'bg-slate-300'}`} />
                  <span className="block p-3 space-y-2">
                    <span className="flex items-start justify-between gap-2">
                      <span className={`font-semibold text-sm leading-snug ${t.is_active === false ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {t.name || 'Chưa đặt tên'}
                      </span>
                      {dangChon ? (
                        <span className="h-5 w-5 shrink-0 rounded-full bg-teal-600 text-white inline-flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : (
                        <span className={`shrink-0 rounded-full px-2 py-px text-[10px] font-bold ${
                          laDoanhThu(t) ? 'bg-sky-100 text-sky-800' : 'bg-teal-100 text-teal-800'
                        }`}
                        >
                          {laDoanhThu(t) ? 'Doanh thu' : 'Chi phí'}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        {costTypeModuleShort(t.module_key)}
                      </span>
                      {laNutBaoGiaCrm(t) && (
                        <span className="rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-px text-[10px] font-semibold text-emerald-800">
                          CRM có sẵn
                        </span>
                      )}
                      {dangChon && (
                        <span className={`rounded-full px-2 py-px text-[10px] font-bold ${
                          laDoanhThu(t) ? 'bg-sky-100 text-sky-800' : 'bg-teal-100 text-teal-800'
                        }`}
                        >
                          {laDoanhThu(t) ? 'Doanh thu' : 'Chi phí'}
                        </span>
                      )}
                    </span>
                    <code className={`block text-[11px] truncate ${laDoanhThu(t) ? 'text-sky-700' : 'text-teal-700'}`}>
                      {bienCuaNutTich(t)}
                    </code>
                    {chips.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {chips.map((nv) => (
                          <span
                            key={nv.id}
                            className="inline-block max-w-full truncate rounded-md bg-teal-50 border border-teal-100 px-1.5 py-px text-[11px] text-teal-900"
                          >
                            {nv.title}
                          </span>
                        ))}
                        {ganList.length > 3 && (
                          <span className="text-[10px] text-gray-500 self-center">+{ganList.length - 3}</span>
                        )}
                      </span>
                    ) : (
                      <span className="block text-[11px] text-amber-700">Chưa gắn nhiệm vụ</span>
                    )}
                    <span className="block text-[10px] text-gray-500">
                      {soGan == null ? '…' : (soGan > 0 ? `${soGan} nhiệm vụ đang bật` : 'Bấm để gắn nhiệm vụ')}
                    </span>
                  </span>
                </button>
              );
            })}

            {moduleTab !== 'crm' && !dangThemNut && (
              <button
                type="button"
                onClick={() => setDangThemNut(true)}
                className="min-h-[9.5rem] rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/30 text-teal-800 hover:bg-teal-50 flex flex-col items-center justify-center gap-1 px-3"
              >
                <Plus className="h-6 w-6 text-teal-600" />
                <span className="font-semibold text-sm">Thêm nút tích</span>
                <span className="text-[11px] text-gray-500 text-center">Số đầu vào mới cho công thức</span>
              </button>
            )}

            {moduleTab !== 'crm' && dangThemNut && (
              <div className="rounded-xl border-2 border-dashed border-teal-400 bg-teal-50/50 p-3 space-y-2 sm:col-span-2 xl:col-span-1">
                <p className="text-xs font-bold text-teal-900 uppercase tracking-wide">Nút tích mới</p>
                <label className="block text-[11px] font-semibold text-gray-600">
                  Tên nút
                  <input
                    placeholder="vd. Giá vốn NVL"
                    value={newType.name}
                    onChange={(e) => setNewType((x) => ({ ...x, name: e.target.value }))}
                    className="block mt-1 h-9 px-2.5 border rounded-lg text-sm w-full bg-white"
                    autoFocus
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-semibold text-gray-600">
                    Module
                    <select
                      value={newType.module_key}
                      onChange={(e) => setNewType((x) => ({ ...x, module_key: e.target.value }))}
                      className="block mt-1 h-9 px-2 border rounded-lg text-sm w-full bg-white"
                    >
                      {TAB_MODULE.map((m) => (
                        <option key={m.key} value={m.key}>{costTypeModuleLabel(m.key)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] font-semibold text-gray-600">
                    Số này là
                    <select
                      value={newType.value_kind}
                      onChange={(e) => setNewType((x) => ({ ...x, value_kind: e.target.value }))}
                      className="block mt-1 h-9 px-2 border rounded-lg text-sm w-full bg-white"
                    >
                      {LOAI_SO.map((k) => <option key={k.key} value={k.key}>{k.nhan}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button type="button" onClick={addType} className="h-9 px-3 rounded-lg bg-teal-600 text-white text-sm font-semibold inline-flex items-center gap-1">
                    <Plus className="h-4 w-4" /> Thêm
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDangThemNut(false); setNewType((x) => ({ ...x, name: '' })); }}
                    className="h-9 px-3 rounded-lg border bg-white text-sm font-semibold text-gray-600"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {moduleTab === 'crm' && typesTheoTab.length > 0 && (
          <p className="text-[11px] text-gray-500">
            CRM dùng nút «Upload Excel Báo giá» có sẵn trên nhiệm vụ — không cần tạo nút tích mới.
          </p>
        )}

        {nutDangChon && (() => {
          const t = nutDangChon;
          const dsNv = nvDs[t.id] || null;
          const soGan = dsNv ? dsNv.items.filter((x) => x.da_gan).length : null;
          const kind = t.module_key === 'crm' ? 'crm' : ((t.module_key === 'production' || t.module_key === 'logistics') ? 'workshop' : null);
          const tpls = kind ? (workTpls[t.module_key] || []) : [];
          const builtinCrm = laNutBaoGiaCrm(t);
          return (
            <div className={`rounded-xl border p-3 space-y-3 ${MODULE_TONE[t.module_key] || 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={t.name}
                  onChange={(e) => setTypes((list) => list.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))}
                  className="h-9 px-2.5 border rounded-lg text-sm grow font-semibold bg-white min-w-[10rem]"
                  placeholder="Tên loại chi phí"
                />
                {builtinCrm && (
                  <span className="h-9 px-2 inline-flex items-center rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800">
                    Nút CRM có sẵn
                  </span>
                )}
                <select
                  value={t.module_key}
                  disabled={builtinCrm}
                  onChange={(e) => setTypes((list) => list.map((x) => (x.id === t.id ? { ...x, module_key: e.target.value } : x)))}
                  className="h-9 px-2 border rounded-lg text-sm bg-white disabled:bg-gray-50"
                  title="Nút tích này gắn vào nhiệm vụ của module nào"
                >
                  {TAB_MODULE.map((m) => (
                    <option key={m.key} value={m.key}>{costTypeModuleLabel(m.key)}</option>
                  ))}
                  {!TAB_MODULE.some((m) => m.key === t.module_key) && (
                    <option value={t.module_key}>{costTypeModuleLabel(t.module_key)}</option>
                  )}
                </select>
                <select
                  value={t.value_kind || 'chi_phi'}
                  onChange={(e) => setTypes((list) => list.map((x) => (x.id === t.id ? { ...x, value_kind: e.target.value } : x)))}
                  className={`h-9 px-2 border rounded-lg text-sm ${laDoanhThu(t) ? 'bg-sky-50 text-sky-800 border-sky-200 font-semibold' : 'bg-white'}`}
                  title="Số này là chi phí (cộng vào giá vốn) hay doanh thu (số bán ra)"
                >
                  {LOAI_SO.map((k) => <option key={k.key} value={k.key}>{k.nhan}</option>)}
                </select>
                <label className="text-xs flex items-center gap-1.5 h-9 px-2 rounded-lg border bg-white">
                  <input type="checkbox" checked={t.is_active !== false} onChange={(e) => setTypes((list) => list.map((x) => (x.id === t.id ? { ...x, is_active: e.target.checked } : x)))} />
                  Đang dùng
                </label>
                <button type="button" onClick={() => saveType(t)} className="h-9 px-3 text-xs font-semibold text-teal-700 border rounded-lg inline-flex items-center gap-1 bg-white hover:bg-teal-50">
                  <Save className="h-3.5 w-3.5" /> Lưu
                </button>
                {!builtinCrm && (
                  <button type="button" onClick={() => deleteType(t)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border bg-white text-gray-400 hover:text-red-600" title="Xóa loại">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-500">
                {builtinCrm
                  ? 'Đây là nút «Upload Excel Báo giá» trên tab Nhiệm vụ CRM — không tạo nút tích mới. '
                  : null}
                Biến công thức: <code className={laDoanhThu(t) ? 'text-sky-700' : 'text-teal-700'}>{bienCuaNutTich(t)}</code>
                {' · '}
                {soGan == null
                  ? costTypeModuleLabel(t.module_key)
                  : (soGan > 0 ? `${soGan} nhiệm vụ đang bật nút này` : 'chưa gắn nhiệm vụ nào')}
              </p>

              {kind ? (
                <div className="rounded-lg bg-white/80 border border-white/80 px-3 py-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">
                      Nhiệm vụ nào hiện nút «{(NUT_TICH[t.module_key] || NUT_TICH.production).nhan}»?
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {t.module_key === 'crm'
                        ? (laDoanhThu(t)
                          ? 'Tích là nhiệm vụ đó có nút Upload Excel Báo giá — TỔNG TIỀN báo giá (sau chiết khấu, chưa VAT) thành doanh thu ở số này.'
                          : 'Tích là nhiệm vụ đó có nút Upload Excel Báo giá — GIÁ VỐN của báo giá chảy vào số này.')
                        : 'Tích là nhiệm vụ đó có nút nộp file trên dự án; hệ thống cộng cột tiền trong file ra số cho công thức.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    {moduleTab === 'production' && (
                      <label className="text-[11px] font-semibold text-gray-600">
                        Phân loại
                        <select
                          value={locLoai}
                          onChange={(e) => { setLocLoai(e.target.value); setLocCot(''); }}
                          onFocus={() => { if (!scopes) loadScopes(); }}
                          className="block mt-1 h-8 px-2 border rounded-lg text-xs bg-white min-w-[9rem]"
                        >
                          <option value="">Mọi loại</option>
                          {(scopes?.workshop_types || []).map((x) => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="text-[11px] font-semibold text-gray-600">
                      Cột pipeline
                      <select
                        value={locCot}
                        onChange={(e) => setLocCot(e.target.value)}
                        onFocus={() => { if (!scopes) loadScopes(); }}
                        className="block mt-1 h-8 px-2 border rounded-lg text-xs bg-white min-w-[11rem]"
                      >
                        <option value="">Mọi cột</option>
                        {dsCotTheoModule(moduleTab)
                          .filter((x) => (moduleTab !== 'production' || !locLoai
                            || !x.workshop_type_id || String(x.workshop_type_id) === String(locLoai)))
                          .map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </label>
                    {(locLoai || locCot) && (
                      <button
                        type="button"
                        onClick={() => { setLocLoai(''); setLocCot(''); }}
                        className="h-8 px-2.5 rounded-lg border bg-white text-[11px] font-semibold text-gray-600 inline-flex items-center gap-1"
                      >
                        <X className="h-3 w-3" /> Bỏ lọc
                      </button>
                    )}
                    <span className="relative grow min-w-[12rem]">
                      <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        value={nvQ[t.id] || ''}
                        onChange={(e) => timNhiemVu(t, e.target.value)}
                        onFocus={() => { if (!dsNv) timNhiemVu(t, '', true); }}
                        placeholder="Tìm nhiệm vụ…"
                        className="h-8 w-full pl-7 pr-2 border rounded-lg text-sm bg-white"
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => timNhiemVu(t, nvQ[t.id] || '', true)}
                      className="h-8 px-2.5 rounded-lg border bg-white text-xs font-semibold text-gray-700 inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${dsNv?.dangTai ? 'animate-spin' : ''}`} /> Tải lại
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Đang gán cho {costTypeModuleShort(moduleTab)}
                    {' · '}{companyLabel || 'công ty đã chọn'}
                    {' · '}{regions.find((r) => String(r.id) === String(regionId))?.name || 'Toàn công ty'}
                  </p>

                  {dsNv?.loi && (
                    <p className="text-[11px] text-red-600">{dsNv.loi}</p>
                  )}

                  {!dsNv ? (
                    <p className="text-[11px] text-gray-500">Đang tải danh sách nhiệm vụ…</p>
                  ) : dsNv.items.length === 0 ? (
                    <p className="text-[11px] text-amber-700">
                      Không có nhiệm vụ nào khớp
                      {dsNv.tong ? ` trong ${dsNv.tong} nhiệm vụ ${costTypeModuleShort(t.module_key)}` : ''}
                      {' — tạo nhiệm vụ mới bên dưới.'}
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-0.5">
                        {dsNv.items.map((nv) => (
                          <label
                            key={nv.id}
                            className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer ${
                              nv.da_gan
                                ? 'bg-teal-50 border-teal-300'
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-teal-700"
                              checked={!!nv.da_gan}
                              onChange={(e) => ganNhiemVu(t, nv, e.target.checked)}
                            />
                            <span className="min-w-0">
                              <span className="block text-xs font-medium text-gray-900 leading-snug">{nv.title}</span>
                              <span className="block text-[10px] text-gray-500 truncate">
                                {nv.template_name}
                                {nv.stage_name ? ` · ${nv.stage_name}` : ''}
                                {nv.nut_dang_bat && !nv.da_gan ? ' · nút đang gắn số khác' : ''}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400">
                        Hiện {dsNv.hien}/{dsNv.tong} nhiệm vụ {costTypeModuleShort(t.module_key)} — nhiệm vụ đã tích nằm trên cùng.
                      </p>
                    </>
                  )}

                  <div className="pt-2 border-t border-dashed border-gray-200">
                    <button
                      type="button"
                      onClick={() => moFormNhiemVu(t)}
                      className="h-8 px-2.5 rounded-lg border bg-white text-xs font-semibold text-teal-700 inline-flex items-center gap-1.5"
                    >
                      {nvMoId === t.id ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {nvMoId === t.id ? 'Đóng' : 'Tạo nhiệm vụ mới'}
                    </button>

                    {nvMoId === t.id && nvForm && (
                      <div className="mt-2 rounded-lg border bg-white p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-[11px] font-semibold text-gray-600">Đặt nhiệm vụ vào:</span>
                          {[
                            { v: 'co_san', nhan: 'Bộ mẫu có sẵn' },
                            { v: 'moi', nhan: 'Bộ mẫu mới' },
                          ].map((o) => (
                            <label key={o.v} className="inline-flex items-center gap-1.5 text-xs text-gray-800">
                              <input
                                type="radio"
                                className="accent-teal-700"
                                checked={nvForm.cach === o.v}
                                onChange={() => setNvForm((f) => ({ ...f, cach: o.v }))}
                              />
                              {o.nhan}
                            </label>
                          ))}
                        </div>

                        {nvForm.cach === 'co_san' ? (
                          <label className="block text-[11px] font-semibold text-gray-600">
                            Bộ mẫu
                            <select
                              value={nvForm.tpl_id}
                              onChange={(e) => setNvForm((f) => ({ ...f, tpl_id: e.target.value }))}
                              className="block mt-1 h-9 w-full px-2 border rounded-lg text-sm bg-white"
                            >
                              <option value="">— Chọn bộ mẫu —</option>
                              {tpls.map((tpl) => (
                                <option key={tpl.id} value={tpl.id}>
                                  {tpl.name}{scopes ? ` — ${moTaPhamVi(tpl, t.module_key)}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                              <label className="text-[11px] font-semibold text-gray-600 grow">
                                Tên bộ mẫu mới
                                <input
                                  value={nvForm.tpl_name}
                                  onChange={(e) => setNvForm((f) => ({ ...f, tpl_name: e.target.value }))}
                                  placeholder="vd. Việc NVL xưởng"
                                  className="block mt-1 h-9 w-full px-2.5 border rounded-lg text-sm bg-white"
                                />
                              </label>
                              <label className="text-[11px] font-semibold text-gray-600">
                                Công ty
                                <input
                                  value={companyLabel || 'Công ty đang chọn'}
                                  readOnly
                                  className="block mt-1 h-9 px-2.5 border rounded-lg text-sm bg-gray-50 text-gray-600 w-44"
                                />
                              </label>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {t.module_key !== 'crm' && (
                                <label className="text-[11px] font-semibold text-gray-600">
                                  Khu vực
                                  <select
                                    value={nvForm.region_id}
                                    onChange={(e) => setNvForm((f) => ({ ...f, region_id: e.target.value }))}
                                    className="block mt-1 h-9 px-2 border rounded-lg text-sm bg-white min-w-[10rem]"
                                  >
                                    <option value="">Mọi khu vực</option>
                                    {(scopes?.regions || []).map((x) => (
                                      <option key={x.id} value={x.id}>{x.name}</option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              {t.module_key === 'production' && (
                                <label className="text-[11px] font-semibold text-gray-600">
                                  Phân loại xưởng
                                  <select
                                    value={nvForm.workshop_type_id}
                                    onChange={(e) => setNvForm((f) => ({ ...f, workshop_type_id: e.target.value, stage_id: '' }))}
                                    className="block mt-1 h-9 px-2 border rounded-lg text-sm bg-white min-w-[10rem]"
                                  >
                                    <option value="">Mọi phân loại</option>
                                    {(scopes?.workshop_types || []).map((x) => (
                                      <option key={x.id} value={x.id}>{x.name}</option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              <label className="text-[11px] font-semibold text-gray-600">
                                Cột pipeline
                                <select
                                  value={nvForm.stage_id}
                                  onChange={(e) => setNvForm((f) => ({ ...f, stage_id: e.target.value }))}
                                  className="block mt-1 h-9 px-2 border rounded-lg text-sm bg-white min-w-[12rem]"
                                >
                                  <option value="">{t.module_key === 'crm' ? '— Chọn cột CRM —' : 'Mọi cột'}</option>
                                  {dsCotTheoModule(t.module_key)
                                    .filter((x) => (t.module_key !== 'production' || !nvForm.workshop_type_id
                                      || !x.workshop_type_id
                                      || String(x.workshop_type_id) === String(nvForm.workshop_type_id)))
                                    .map((x) => (
                                      <option key={x.id} value={x.id}>{x.name}</option>
                                    ))}
                                </select>
                              </label>
                            </div>
                            {t.module_key === 'crm' && (
                              <p className="text-[10px] text-gray-500">
                                Bộ mẫu CRM lấy công ty và khu vực theo pipeline của cột đã chọn — nên phải chọn cột.
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-end gap-2 pt-1 border-t">
                          <label className="text-[11px] font-semibold text-gray-600 grow">
                            Tên nhiệm vụ
                            <input
                              value={nvForm.title}
                              onChange={(e) => setNvForm((f) => ({ ...f, title: e.target.value }))}
                              placeholder="vd. Nộp bảng giá vốn NVL"
                              className="block mt-1 h-9 w-full px-2.5 border rounded-lg text-sm bg-white"
                            />
                          </label>
                          <label className="text-[11px] font-semibold text-gray-600">
                            Hạn (ngày)
                            <input
                              type="number"
                              min="0"
                              value={nvForm.deadline_days}
                              onChange={(e) => setNvForm((f) => ({ ...f, deadline_days: e.target.value }))}
                              className="block mt-1 h-9 w-24 px-2 border rounded-lg text-sm bg-white tabular-nums"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => taoNhiemVu(t, kind)}
                            disabled={nvBusy}
                            className="h-9 px-3 rounded-lg bg-teal-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Plus className="h-4 w-4" /> {nvBusy ? 'Đang thêm…' : 'Thêm nhiệm vụ'}
                          </button>
                        </div>

                        <p className="text-[10px] text-gray-500">
                          Nhiệm vụ tạo ở đây tự bật nút «{(NUT_TICH[t.module_key] || NUT_TICH.production).nhan}» và gắn sẵn vào số «{t.name}».
                        </p>
                        {nvMsg && (
                          <p className={`text-[11px] ${/^Đã thêm/.test(nvMsg) ? 'text-emerald-700' : 'text-red-600'}`}>{nvMsg}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-gray-500">Module này không có bộ mẫu công việc — chỉ dùng Excel trên tab Kế toán của dự án.</p>
              )}
            </div>
          );
        })()}
      </section>
        </>
      )}

      {vung === 'congthuc' && (
        <>
      <section className="rounded-xl border bg-white p-4 space-y-4">
        <div className="flex items-start gap-2">
          <span className="h-7 w-7 shrink-0 rounded-full bg-teal-600 text-white text-sm font-bold inline-flex items-center justify-center">2</span>
          <div>
            <h2 className="font-bold text-gray-900 inline-flex items-center gap-1.5">
              <Calculator className="h-4 w-4 text-teal-700" /> Công thức tính
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Chọn số hạng trong danh sách (Excel loại chi phí hiện ở nhóm đầu). Muốn <span className="font-medium text-gray-700">A trừ (B cộng C)</span> thì thêm 3 số hạng rồi bấm «Gom phần sau vào ngoặc».
            </p>
          </div>
        </div>

        {types.length === 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Tạo ít nhất một loại chi phí ở vùng «2 · Excel chi phí» để công thức lấy được số từ file Excel.
          </p>
        )}

        <div className="space-y-3">
          {formulas.map((f) => (
            <div key={f.id} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/40">
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  value={f.name}
                  onChange={(e) => setFormulas((list) => list.map((x) => x.id === f.id ? { ...x, name: e.target.value } : x))}
                  className="h-9 px-2.5 border rounded-lg text-sm grow font-semibold bg-white"
                  placeholder="Tên công thức, vd. Giá vốn"
                />
                <label className="text-xs flex items-center gap-1.5 h-9 px-2 rounded-lg border bg-white">
                  <input type="checkbox" checked={f.is_active !== false} onChange={(e) => setFormulas((list) => list.map((x) => x.id === f.id ? { ...x, is_active: e.target.checked } : x))} />
                  Hiện trên sổ
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] font-semibold text-gray-600 inline-flex items-center gap-1.5">
                  Áp dụng cho loại
                  <select
                    value={f.workshop_type_id || ''}
                    onChange={(e) => setFormulas((list) => list.map((x) => (x.id === f.id
                      ? { ...x, workshop_type_id: e.target.value } : x)))}
                    onFocus={() => { if (!scopes) loadScopes(); }}
                    className={`h-8 px-2 border rounded-lg text-xs ${
                      f.workshop_type_id ? 'bg-amber-50 border-amber-300 font-semibold text-amber-900' : 'bg-white'
                    }`}
                    title="Bản gắn loại sẽ ĐÈ bản dùng chung cùng tên"
                  >
                    <option value="">Mọi loại (dùng chung)</option>
                    {(scopes?.workshop_types || []).map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </label>
                <span className="text-[10px] text-gray-400">
                  công ty · {regions.find((r) => String(r.id) === String(regionId))?.name || 'toàn công ty'}
                </span>
              </div>
              <SoanCongThuc
                expr={f.expr_text || ''}
                extras={extraOperands}
                onChange={(expr_text) => setFormulas((list) => list.map((x) => x.id === f.id ? { ...x, expr_text } : x))}
              />
              <KetQuaThu
                du={thuNhanh[f.id]}
                onThu={() => thuCongThuc(f.id, f.expr_text || '')}
                coDuAn={!!testId}
              />
              <button type="button" onClick={() => saveFormula(f)} className="h-9 px-3 text-xs font-semibold text-teal-700 border rounded-lg inline-flex items-center gap-1 bg-white hover:bg-teal-50">
                <Save className="h-3.5 w-3.5" /> Lưu công thức
              </button>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t space-y-2">
          <p className="text-sm font-semibold text-gray-800">Thêm công thức khác</p>
          <input
            placeholder="Tên, vd. Lợi nhuận sau VC"
            value={newF.name}
            onChange={(e) => setNewF((x) => ({ ...x, name: e.target.value }))}
            className="h-9 px-2.5 border rounded-lg text-sm w-full sm:w-80 bg-white"
          />
          <label className="text-[11px] font-semibold text-gray-600 inline-flex items-center gap-1.5">
            Áp dụng cho loại
            <select
              value={newF.workshop_type_id}
              onChange={(e) => setNewF((x) => ({ ...x, workshop_type_id: e.target.value }))}
              onFocus={() => { if (!scopes) loadScopes(); }}
              className="h-8 px-2 border rounded-lg text-xs bg-white"
            >
              <option value="">Mọi loại (dùng chung)</option>
              {(scopes?.workshop_types || []).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </label>
          <SoanCongThuc
            expr={newF.expr_text}
            extras={extraOperands}
            onChange={(expr_text) => setNewF((x) => ({ ...x, expr_text }))}
          />
          <KetQuaThu
            du={thuNhanh.__moi__}
            onThu={() => thuCongThuc('__moi__', newF.expr_text || '')}
            coDuAn={!!testId}
          />
          <button type="button" onClick={addFormula} className="h-9 px-3 rounded-lg bg-teal-600 text-white text-sm font-semibold inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> Thêm công thức
          </button>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <FlaskConical className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900">Đầu ra — thử trên dự án thật</h2>
              <p className="text-xs text-gray-500 leading-snug">
                Chọn một dự án để xem đúng số mà kế toán sẽ thấy: từng dòng sổ, từng nhóm, rồi ra kết quả công thức.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadTestList}
            className="h-9 px-3 rounded-lg border text-sm font-semibold text-gray-700 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tải danh sách dự án
          </button>
        </div>

        <select
          value={testId}
          onChange={(e) => pickTest(e.target.value)}
          onFocus={() => { if (!testList.length) loadTestList(); }}
          className="h-9 w-full max-w-md px-2 border rounded-lg text-sm bg-white"
        >
          <option value="">— Chọn dự án để thử —</option>
          {testList.map((pj) => (
            <option key={pj.project_id} value={pj.project_id}>
              {pj.code ? `${pj.code} · ` : ''}{pj.name}
            </option>
          ))}
        </select>

        {testLoading && <p className="text-sm text-gray-500">Đang tính…</p>}
        {testRow?.loi && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{testRow.loi}</p>
        )}

        {testRow && !testRow.loi && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-2">
              {[
                { t: 'Doanh thu (CRM)', v: testRow.revenue },
                { t: 'Tổng chi phí trong sổ', v: testRow.cost_total },
                { t: 'Lợi nhuận gộp', v: testRow.loi_nhuan_gop },
              ].map((k) => (
                <div key={k.t} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{k.t}</p>
                  <p className="text-lg font-extrabold tabular-nums text-gray-900">{fmtTien(k.v)}</p>
                </div>
              ))}
            </div>

            {(testRow.entries || []).length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Dự án này chưa có dòng nào trong sổ chi phí — mọi công thức dựa vào <code>entries.total</code> sẽ ra 0.
                </span>
              </div>
            )}

            {(testRow.entries || []).length > 0 && (
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm min-w-[34rem]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b">
                      <th className="py-1.5 pr-2 font-semibold">Ngày</th>
                      <th className="py-1.5 px-2 font-semibold">Nguồn</th>
                      <th className="py-1.5 px-2 font-semibold">Diễn giải</th>
                      <th className="py-1.5 pl-2 font-semibold text-right">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(testRow.entries || []).map((en) => (
                      <tr key={en.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 tabular-nums text-gray-500">{en.entry_date || '—'}</td>
                        <td className="py-1.5 px-2 text-[11px] text-gray-600">{en.source_key}</td>
                        <td className="py-1.5 px-2 text-gray-800">{en.note || '—'}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-gray-900">{fmtTien(en.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-xl border bg-gray-50 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-700">Kết quả từng công thức</p>
              {(testRow.formulas || []).length === 0 && (
                <p className="text-sm text-gray-500">Chưa có công thức nào.</p>
              )}
              {(testRow.formulas || []).map((f) => (
                <div key={f.code} className="flex flex-wrap items-baseline justify-between gap-2 border-b last:border-0 border-gray-200 pb-1.5 last:pb-0">
                  <span className="min-w-0">
                    <span className="font-semibold text-gray-900">{f.name}</span>
                    <code className="ml-2 text-[11px] text-gray-500">{f.expr_text}</code>
                  </span>
                  <span className={`tabular-nums font-bold ${f.error ? 'text-red-600' : 'text-gray-900'}`}>
                    {f.error ? f.error : fmtTien(f.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
        </>
      )}


      {/* ── Nâng cao: nguồn tự động + nhóm chi phí — không cần cho luồng Excel ──── */}
      <details className="rounded-xl border bg-white p-4">
        <summary className="font-semibold text-gray-800 cursor-pointer text-sm">
          Nâng cao — nguồn tự động vào sổ, nhóm chi phí, lấp dữ liệu cũ
        </summary>
        <p className="text-xs text-gray-500 mt-2 mb-3">
          Phần này KHÔNG cần cho luồng «nút tích → Excel → công thức» ở trên. Nó là đường cũ:
          hệ thống tự lấy số từ dự án, lệnh đặt hàng, báo giá… đẩy thẳng vào sổ chi phí.
        </p>
        <div className="space-y-4">
      <section className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <Activity className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900">Kiểm tra &amp; lấp dữ liệu</h2>
              <p className="text-xs text-gray-500 leading-snug max-w-2xl">
                Sổ chi phí hiện có gì, còn bao nhiêu bản ghi cũ chưa vào sổ. «Lấp dữ liệu cũ» chỉ THÊM /
                CẬP NHẬT dòng sổ, không sửa và không xóa dữ liệu gốc — chạy lại nhiều lần vẫn ra cùng kết quả.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadDiag}
              disabled={diagLoading}
              className="h-9 px-3 rounded-lg border text-sm font-semibold text-gray-700 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${diagLoading ? 'animate-spin' : ''}`} /> Kiểm tra lại
            </button>
            <button
              type="button"
              onClick={runBackfill}
              disabled={backfilling || diagLoading}
              title="Đẩy dữ liệu đã có sẵn ở các module vào sổ chi phí. Chỉ thêm/cập nhật dòng sổ."
              className="h-9 px-3 rounded-lg bg-teal-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Database className="h-3.5 w-3.5" />
              {backfilling ? 'Đang lấp…' : `Lấp dữ liệu cũ vào sổ${tongDangCho > 0 ? ` (${tongDangCho})` : ''}`}
            </button>
            <Link
              to="/ketoan/chi-phi"
              className="h-9 px-3 rounded-lg border text-sm font-semibold text-teal-700 inline-flex items-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Mở sổ chi phí
            </Link>
          </div>
        </div>

        {diagErr && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{diagErr}</p>
        )}
        {backfillMsg && (
          <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">{backfillMsg}</p>
        )}

        {diag && (
          <>
            <div className="grid sm:grid-cols-4 gap-2">
              {[
                { t: 'Dòng sổ còn hiệu lực', v: diag.so_chi_phi?.con_hieu_luc ?? 0 },
                { t: 'Tổng tiền đã vào sổ', v: fmtTien(diag.so_chi_phi?.tong_tien) },
                { t: 'Bản ghi đang chờ', v: tongDangCho, canh: tongDangCho > 0 },
                { t: 'Loại chi phí Excel', v: diag.setup?.types ?? 0, canh: (diag.setup?.types ?? 0) === 0 },
              ].map((k) => (
                <div
                  key={k.t}
                  className={`rounded-xl border px-3 py-2.5 ${k.canh ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}
                >
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{k.t}</p>
                  <p className={`text-lg font-extrabold tabular-nums ${k.canh ? 'text-amber-700' : 'text-gray-900'}`}>{k.v}</p>
                </div>
              ))}
            </div>
            {diag.so_chi_phi?.con_hieu_luc === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Sổ chi phí đang <strong>trống</strong> — mọi công thức sẽ ra 0. Nếu cột «Đang có tiền» phía dưới
                  khác 0 thì bấm <strong>Lấp dữ liệu cũ vào sổ</strong>; nếu cũng bằng 0 thì module gốc chưa ai nhập số.
                </span>
              </div>
            )}
          </>
        )}
        {!diag && !diagErr && (
          <p className="text-sm text-gray-500">{diagLoading ? 'Đang kiểm tra…' : 'Bấm «Kiểm tra lại» để đọc số liệu.'}</p>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <Database className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900">Tiền chảy vào sổ từ đâu</h2>
              <p className="text-xs text-gray-500 leading-snug max-w-2xl">
                Mỗi dòng là một nguồn. Bật «Tự đẩy» thì module đó tự ghi vào sổ chi phí mỗi khi có số mới;
                «Nhóm chi phí» quyết định số tiền rơi vào biến <code>cat.&lt;mã&gt;</code> lúc ghép công thức.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadDiag}
            disabled={diagLoading}
            className="h-9 px-3 rounded-lg border text-sm font-semibold text-gray-700 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${diagLoading ? 'animate-spin' : ''}`} /> Đọc lại số liệu
          </button>
        </div>

        {diagErr && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{diagErr}</p>
        )}

        {diag && (
          <>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm min-w-[46rem]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b">
                    <th className="py-2 pr-2 font-semibold">Nguồn</th>
                    <th className="py-2 px-2 font-semibold">Lấy từ</th>
                    <th className="py-2 px-2 font-semibold text-right">Đang có tiền</th>
                    <th className="py-2 px-2 font-semibold text-right">Đã vào sổ</th>
                    <th className="py-2 px-2 font-semibold text-right">Chờ</th>
                    <th className="py-2 px-2 font-semibold text-center">Tự đẩy</th>
                    <th className="py-2 pl-2 font-semibold">Nhóm chi phí</th>
                  </tr>
                </thead>
                <tbody>
                  {(diag.sources || []).map((row) => {
                    const cho = row.dang_cho || 0;
                    return (
                      <tr key={row.id} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-2">
                          <span className="block font-semibold text-gray-900">{row.name}</span>
                          <span className="block text-[11px] text-gray-500">
                            {MODULE_VI[row.module_key] || row.module_key} · {row.source_key}
                          </span>
                          {row.ghi_chu && (
                            <span className="block text-[11px] text-amber-700 mt-0.5">{row.ghi_chu}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-[11px] text-gray-500 max-w-[14rem]">{row.goc}</td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {row.nguon_co_tien == null ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <>
                              <span className="font-semibold text-gray-900">{row.nguon_co_tien}</span>
                              <span className="block text-[11px] text-gray-500">{fmtTien(row.tong_nguon)}</span>
                            </>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          <span className="font-semibold text-gray-900">{row.da_vao_so}</span>
                          <span className="block text-[11px] text-gray-500">{fmtTien(row.tong_so)}</span>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">
                          {row.dang_cho == null ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <span className={`inline-block rounded-full px-2 py-px text-xs font-bold ${
                              cho > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                            >
                              {cho}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.auto_push !== false}
                            onChange={(e) => saveSourceAuto(row, e.target.checked)}
                            title="Tắt thì module này không ghi dòng mới vào sổ"
                          />
                        </td>
                        <td className="py-2 pl-2">
                          <select
                            value={row.default_category_id || ''}
                            onChange={(e) => saveSourceCategory(row, e.target.value)}
                            className="h-8 px-2 border rounded-lg text-sm bg-white max-w-[11rem]"
                          >
                            <option value="">— chưa gán —</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-500">
              «Đang có tiền» = số bản ghi ở module gốc có số tiền &gt; 0 · «Chờ» = phần chưa có dòng
              tương ứng trong sổ. Muốn xử lý chỗ đang chờ thì sang vùng
              <strong> 4 · Kiểm tra</strong> bấm «Lấp dữ liệu cũ vào sổ».
            </p>
          </>
        )}
        {!diag && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              {diagLoading ? 'Đang kiểm tra…' : 'Chưa kiểm tra được — dưới đây là danh sách nguồn theo setup.'}
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {sources.map((sv) => (
                <label
                  key={sv.id}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${
                    sv.auto_push !== false ? 'border-teal-200 bg-teal-50/40' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={sv.auto_push !== false}
                    onChange={(e) => saveSource(sv, { auto_push: e.target.checked })}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{sv.name}</span>
                    <span className="block text-[11px] text-gray-500">
                      {MODULE_VI[sv.module_key] || sv.module_key}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4 space-y-2">
        <div className="flex items-start gap-2">
          <Settings className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-gray-900">Nhóm chi phí</h2>
            <p className="text-xs text-gray-500 leading-snug">
              Tên nhóm dùng để gom sổ và để gọi trong công thức. Sửa tên ở đây, gán nguồn vào nhóm ở bảng trên.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <input value={c.name} onChange={(e) => setCategories((list) => list.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))} className="h-8 px-2 border rounded-lg text-sm grow" />
              <label className="text-xs flex items-center gap-1">
                <input type="checkbox" checked={c.is_active !== false} onChange={(e) => setCategories((list) => list.map((x) => x.id === c.id ? { ...x, is_active: e.target.checked } : x))} />
                Hiện
              </label>
              <button type="button" onClick={() => saveCategory(c)} className="h-8 px-2 text-xs font-semibold text-teal-700 border rounded-lg inline-flex items-center gap-1">
                <Save className="h-3.5 w-3.5" /> Lưu
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-2 mt-2 border-t">
          <input placeholder="mã (nvl)" value={newCat.code} onChange={(e) => setNewCat((x) => ({ ...x, code: e.target.value }))} className="h-8 px-2 border rounded-lg text-sm w-28" />
          <input placeholder="Tên nhóm" value={newCat.name} onChange={(e) => setNewCat((x) => ({ ...x, name: e.target.value }))} className="h-8 px-2 border rounded-lg text-sm grow" />
          <button type="button" onClick={addCategory} className="h-8 px-3 rounded-lg bg-teal-600 text-white text-xs font-semibold inline-flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Thêm nhóm
          </button>
        </div>
      </section>
        </div>
      </details>

        </>
      )}
    </div>
  );
}
