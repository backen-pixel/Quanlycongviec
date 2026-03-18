import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import Modal from '../components/Modal';
import { Plus, Search, Package, Upload, Download, Trash2, Edit3, Save, X, Settings, ChevronDown, ChevronRight, Eye, FileSpreadsheet } from 'lucide-react';
import { formatVND } from '../lib/utils';
import * as XLSX from 'xlsx';

const CODE_PART_ORDER = ['group','spec','standard','category','style','glass','type_standard','side','size'];
const CODE_PART_VN = {
  group:'Nhóm SP', spec:'Quy cách', standard:'Tiêu chuẩn', category:'Loại/Phân loại',
  style:'Hình thức', glass:'Kính', type_standard:'Chuẩn loại', side:'Hông', size:'Kích thước',
};

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [codeParts, setCodeParts] = useState({});
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showCodeParts, setShowCodeParts] = useState(false);
  const [importData, setImportData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, codeRes] = await Promise.allSettled([
        api.get('/products', { params: { search, limit: 200 } }),
        api.get('/products/code-parts'),
      ]);
      if (prodRes.status === 'fulfilled') {
        setProducts(prodRes.value.data.products || []);
        setTotal(prodRes.value.data.total || 0);
      }
      if (codeRes.status === 'fulfilled') {
        setCodeParts(codeRes.value.data.codeParts || {});
      }
    } catch {}
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  // ── Export Excel ──
  const exportExcel = async () => {
    try {
      const { data } = await api.get('/products/export');
      if (!data.rows?.length) return alert('Không có sản phẩm để xuất');
      const ws = XLSX.utils.json_to_sheet(data.rows);
      // Set column widths
      ws['!cols'] = [
        {wch:5},{wch:10},{wch:12},{wch:12},{wch:15},{wch:12},{wch:10},{wch:12},{wch:10},{wch:12},
        {wch:20},{wch:30},{wch:20},{wch:20},{wch:12}
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sản phẩm');
      XLSX.writeFile(wb, `SanPham_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (e) { alert('Lỗi xuất: ' + e.message); }
  };

  // ── Import Excel ──
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        
        // Raw parse — handle multi-row headers + duplicate "mã" columns
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Find header row (contains 'thành phẩm' or 'đơn vị')
        let headerIdx = 0;
        for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
          const rowStr = (rawRows[r] || []).map(v => (v ?? '').toString().toLowerCase()).join('|');
          if (rowStr.includes('thành phẩm') || rowStr.includes('đơn vị')) { headerIdx = r; break; }
        }
        const headerCells = (rawRows[headerIdx] || []).map(h => (h ?? '').toString().trim());
        console.log('Headers:', headerCells);

        // Find column index by pattern
        const findCol = (patterns) => {
          for (const pat of patterns) {
            const p = pat.toLowerCase();
            const idx = headerCells.findIndex(h => h.toLowerCase().includes(p));
            if (idx >= 0) return idx;
          }
          return -1;
        };

        // Each group has 2 cols: [tên đầy đủ] [mã]. Find name col, then code col = name+1 if header is "mã"
        const findPair = (namePatterns) => {
          const ni = findCol(namePatterns);
          if (ni < 0) return { ni: -1, ci: -1 };
          const next = headerCells[ni + 1]?.toLowerCase() || '';
          return { ni, ci: (next === 'mã' || next === 'ma') ? ni + 1 : -1 };
        };

        const C = {
          group: findPair(['nhóm sp', 'nhom sp']),
          spec: findPair(['quy cách', 'quy cach']),
          standard: findPair(['tiêu chuẩn', 'tieu chuan']),
          category: findPair(['loại', 'phân loại']),
          style: findPair(['hình thức', 'hinh thuc']),
          glass: findPair(['kính', 'kinh']),
          type_std: findPair(['chuẩn loại', 'chuan loai']),
          side: findPair(['hông', 'hong']),
          size: findPair(['kích thước', 'kich thuoc']),
        };
        const cFullCode = findCol(['mã thành phẩm']);
        const cName = findCol(['tên thành phẩm']);
        const cSellPrice = findCol(['gồm vat', 'giá bán gồm']);
        const cBasePrice = findCol(['chưa vat', 'giá bán chưa']);
        const cUnit = findCol(['đơn vị', 'don vi']);

        // Parse data rows
        const parsed = [];
        for (let r = headerIdx + 1; r < rawRows.length; r++) {
          const v = rawRows[r];
          if (!v || v.every(x => x === '' || x == null)) continue;
          const gv = (i) => i >= 0 ? (v[i] ?? '').toString().trim() : '';
          const gn = (i) => i >= 0 ? (parseFloat(v[i]) || 0) : 0;

          const p = {
            stt: parsed.length + 1,
            _name_group: gv(C.group.ni), _name_spec: gv(C.spec.ni), _name_standard: gv(C.standard.ni),
            _name_category: gv(C.category.ni), _name_style: gv(C.style.ni), _name_glass: gv(C.glass.ni),
            _name_type_std: gv(C.type_std.ni), _name_side: gv(C.side.ni), _name_size: gv(C.size.ni),
            code_group: gv(C.group.ci), code_spec: gv(C.spec.ci), code_standard: gv(C.standard.ci),
            code_category: gv(C.category.ci), code_style: gv(C.style.ci), code_glass: gv(C.glass.ci),
            code_type_std: gv(C.type_std.ci), code_side: gv(C.side.ci), code_size: gv(C.size.ci),
            code: gv(cFullCode), name: gv(cName),
            selling_price: gn(cSellPrice), base_price: gn(cBasePrice),
            unit: gv(cUnit) || 'cái',
          };

          // Fallback: split MÃ THÀNH PHẨM if individual codes empty
          if (p.code && !p.code_group) {
            const pts = p.code.split('-');
            p.code_group=pts[0]||''; p.code_spec=pts[1]||''; p.code_standard=pts[2]||'';
            p.code_category=pts[3]||''; p.code_style=pts[4]||''; p.code_glass=pts[5]||'';
            p.code_type_std=pts[6]||''; p.code_side=pts[7]||''; p.code_size=pts[8]||'';
          }
          if (!p.selling_price && p.base_price) p.selling_price = Math.round(p.base_price * 1.1);
          if (!p.base_price && p.selling_price) p.base_price = Math.round(p.selling_price / 1.1);
          if (!p.code) p.code = [p.code_group,p.code_spec,p.code_standard,p.code_category,p.code_style,p.code_glass,p.code_type_std,p.code_side,p.code_size].filter(Boolean).join('-');
          p._error = !p.name ? 'Thiếu tên SP' : null;
          parsed.push(p);
        }

        // Build normalized rows for backend
        const importRows = parsed.map(p => ({
          'MÃ THÀNH PHẨM': p.code, 'TÊN THÀNH PHẨM': p.name,
          'GIÁ BÁN GỒM VAT 10%': p.selling_price, 'GIÁ BÁN CHƯA VAT 10%': p.base_price,
          'đơn vị tính': p.unit, 'nhóm sp': p.code_group, 'mã quy cách': p.code_spec,
          'mã tiêu chuẩn': p.code_standard, 'mã loại/ phân loại': p.code_category,
          'mã hình thức': p.code_style, 'mã kính': p.code_glass, 'mã chuẩn loại': p.code_type_std,
          'mã hông': p.code_side, 'mã Kích thước quy ước': p.code_size,
        }));

        setImportData({ fileName: file.name, rows: importRows, parsed, total: parsed.length });
        setShowImport(true);
      } catch (err) { alert('Lỗi đọc file: ' + err.message); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const doImport = async (mode) => {
    if (!importData?.rows?.length) return;
    try {
      const { data } = await api.post('/products/import', { rows: importData.rows, mode });
      alert(data.message);
      if (mode !== 'preview') { setShowImport(false); setImportData(null); load(); }
      else { setImportData(prev => ({ ...prev, preview: data.preview, errors: data.errors })); }
    } catch (e) { alert('Lỗi import: ' + (e.response?.data?.error || e.message)); }
  };

  // ── Delete ──
  const del = async (id) => {
    if (!confirm('Xóa sản phẩm này?')) return;
    try { await api.delete(`/products/${id}`); load(); } catch (e) { alert('Lỗi xóa'); }
  };

  // ── Download template ──
  const downloadTemplate = () => {
    const headers = ['STT','nhóm sp','mã quy cách','mã tiêu chuẩn','mã loại/ phân loại','mã hình thức','mã kính','mã chuẩn loại','mã hông','mã Kích thước quy ước','MÃ THÀNH PHẨM','TÊN THÀNH PHẨM','GIÁ BÁN GỒM VAT 10%','GIÁ BÁN CHƯA VAT 10%','đơn vị tính'];
    const sample = [1,'BEPTR','L','N','nhỏ','trên','4L','T','380','TB-BEPTR-L-N','Tủ bếp trên nhỏ kính 4ly',5500000,5000000,'cái'];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = headers.map((h) => ({wch: Math.max(h.length + 2, 12)}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_SanPham.xlsx');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" /> Sản Phẩm
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} sản phẩm</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowCodeParts(!showCodeParts)} className="h-9 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-200 flex items-center gap-1.5 cursor-pointer">
            <Settings className="h-3.5 w-3.5" /> Cấu trúc mã
          </button>
          <button onClick={downloadTemplate} className="h-9 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs hover:bg-gray-200 flex items-center gap-1.5 cursor-pointer">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Mẫu Excel
          </button>
          <label className="h-9 px-3 bg-emerald-100 text-emerald-700 rounded-lg text-xs hover:bg-emerald-200 flex items-center gap-1.5 cursor-pointer">
            <Upload className="h-3.5 w-3.5" /> Import Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} className="hidden" />
          </label>
          <button onClick={exportExcel} className="h-9 px-3 bg-blue-100 text-blue-700 rounded-lg text-xs hover:bg-blue-200 flex items-center gap-1.5 cursor-pointer">
            <Download className="h-3.5 w-3.5" /> Export Excel
          </button>
          <button onClick={() => { setEditId(null); setShowAdd(true); }} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Thêm SP
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mã, tên sản phẩm..."
          className="w-full h-10 pl-10 pr-4 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Code Parts Manager */}
      {showCodeParts && <CodePartsManager codeParts={codeParts} onReload={load} />}

      {/* Products Table */}
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left text-xs font-semibold text-gray-500 uppercase">
              <th className="p-3 w-10">STT</th>
              <th className="p-3">Mã thành phẩm</th>
              <th className="p-3">Tên thành phẩm</th>
              <th className="p-3 text-right">Giá bán (VAT)</th>
              <th className="p-3 text-right">Giá chưa VAT</th>
              <th className="p-3">ĐVT</th>
              <th className="p-3 text-center w-20"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400">Đang tải...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-gray-400">Chưa có sản phẩm</td></tr>
            ) : products.map((p, i) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="p-3 text-gray-400">{i + 1}</td>
                <td className="p-3">
                  <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{p.code}</span>
                </td>
                <td className="p-3 font-medium text-gray-900">{p.name}</td>
                <td className="p-3 text-right font-semibold text-emerald-600">{formatVND(p.selling_price || 0)}</td>
                <td className="p-3 text-right text-gray-600">{formatVND(p.base_price || 0)}</td>
                <td className="p-3 text-gray-500">{p.unit}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => { setEditId(p.id); setShowAdd(true); }} className="p-1.5 hover:bg-blue-50 rounded text-blue-600 cursor-pointer"><Edit3 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => del(p.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showAdd && <ProductFormModal codeParts={codeParts} editId={editId} onClose={() => { setShowAdd(false); setEditId(null); }} onSaved={load} />}

      {/* Import Preview Modal — full table immediately */}
      {showImport && importData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-emerald-50 to-blue-50">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Import: {importData.fileName}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {importData.total} sản phẩm • {importData.parsed.filter(p => !p._error).length} hợp lệ
                  {importData.parsed.some(p => p._error) && <span className="text-red-500 ml-1">• {importData.parsed.filter(p => p._error).length} lỗi</span>}
                </p>
              </div>
              <button onClick={() => { setShowImport(false); setImportData(null); }} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-100 text-left text-[10px] font-bold text-gray-500 uppercase">
                    <th className="p-2 w-8">STT</th>
                    <th className="p-2">Nhóm SP</th>
                    <th className="p-2">Quy cách</th>
                    <th className="p-2">T.Chuẩn</th>
                    <th className="p-2">Loại</th>
                    <th className="p-2">H.Thức</th>
                    <th className="p-2">Kính</th>
                    <th className="p-2">C.Loại</th>
                    <th className="p-2">Hông</th>
                    <th className="p-2">K.Thước</th>
                    <th className="p-2 bg-blue-50 font-bold">MÃ THÀNH PHẨM</th>
                    <th className="p-2 bg-blue-50 font-bold min-w-[200px]">TÊN THÀNH PHẨM</th>
                    <th className="p-2 text-right bg-emerald-50">GIÁ (VAT)</th>
                    <th className="p-2 text-right">GIÁ (chưa VAT)</th>
                    <th className="p-2">ĐVT</th>
                  </tr>
                </thead>
                <tbody>
                  {importData.parsed.map((p, i) => (
                    <tr key={i} className={`border-b hover:bg-gray-50 ${p._error ? 'bg-red-50' : ''}`}>
                      <td className="p-2 text-gray-400">{p.stt}</td>
                      <td className="p-2"><span className="font-mono bg-gray-100 px-1 rounded text-[10px]" title={p._name_group || p.code_group}>{p.code_group || '-'}</span></td>
                      <td className="p-2"><span className="font-mono bg-gray-100 px-1 rounded text-[10px]" title={p._name_spec || p.code_spec}>{p.code_spec || '-'}</span></td>
                      <td className="p-2"><span className="font-mono bg-gray-100 px-1 rounded text-[10px]" title={p._name_standard || p.code_standard}>{p.code_standard || '-'}</span></td>
                      <td className="p-2"><span className="font-mono bg-gray-100 px-1 rounded text-[10px]" title={p._name_category || p.code_category}>{p.code_category || '-'}</span></td>
                      <td className="p-2"><span className="font-mono bg-gray-100 px-1 rounded text-[10px]" title={p._name_style || p.code_style}>{p.code_style || '-'}</span></td>
                      <td className="p-2"><span className="font-mono bg-gray-100 px-1 rounded text-[10px]" title={p._name_glass || p.code_glass}>{p.code_glass || '-'}</span></td>
                      <td className="p-2"><span className="font-mono bg-gray-100 px-1 rounded text-[10px]" title={p._name_type_std || p.code_type_std}>{p.code_type_std || '-'}</span></td>
                      <td className="p-2"><span className="font-mono bg-gray-100 px-1 rounded text-[10px]" title={p._name_side || p.code_side}>{p.code_side || '-'}</span></td>
                      <td className="p-2"><span className="font-mono bg-gray-100 px-1 rounded text-[10px]" title={p._name_size || p.code_size}>{p.code_size || '-'}</span></td>
                      <td className="p-2 bg-blue-50/50"><span className="font-mono text-xs font-bold text-blue-700">{p.code || '—'}</span></td>
                      <td className="p-2 bg-blue-50/50 font-medium text-gray-900">
                        {p.name || <span className="text-red-500 italic">Thiếu tên</span>}
                      </td>
                      <td className="p-2 text-right font-semibold text-emerald-600 bg-emerald-50/50">{p.selling_price ? formatVND(p.selling_price) : '-'}</td>
                      <td className="p-2 text-right text-gray-600">{p.base_price ? formatVND(p.base_price) : '-'}</td>
                      <td className="p-2 text-gray-500">{p.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Tổng: <strong>{importData.total}</strong> SP
                {importData.parsed.some(p => p.selling_price) && (
                  <> • Tổng giá trị: <strong className="text-emerald-600">{formatVND(importData.parsed.reduce((s, p) => s + (p.selling_price || 0), 0))}</strong></>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowImport(false); setImportData(null); }}
                  className="h-9 px-4 bg-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-300 cursor-pointer">
                  Hủy
                </button>
                <button onClick={() => doImport('upsert')} disabled={!importData.parsed.some(p => !p._error)}
                  className="h-9 px-5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                  <Upload className="h-3.5 w-3.5" /> Xác nhận Import ({importData.parsed.filter(p => !p._error).length} SP)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Product Form Modal ═══
function ProductFormModal({ codeParts, editId, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', unit: 'bộ', selling_price: '', base_price: '', description: '',
    code_group: '', code_spec: '', code_standard: '', code_category: '',
    code_style: '', code_glass: '', code_type_std: '', code_side: '', code_size: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editId) {
      api.get(`/products/${editId}`).then(({ data }) => {
        const p = data.product;
        setForm({
          name: p.name || '', unit: p.unit || 'bộ',
          selling_price: p.selling_price || '', base_price: p.base_price || '',
          description: p.description || '',
          code_group: p.code_group || '', code_spec: p.code_spec || '',
          code_standard: p.code_standard || '', code_category: p.code_category || '',
          code_style: p.code_style || '', code_glass: p.code_glass || '',
          code_type_std: p.code_type_std || '', code_side: p.code_side || '',
          code_size: p.code_size || '',
        });
      });
    }
  }, [editId]);

  const generatedCode = CODE_PART_ORDER.map(t => form['code_' + (t === 'type_standard' ? 'type_std' : t)] || '').filter(Boolean).join('-');

  const set = (k, v) => {
    const next = { ...form, [k]: v };
    // Auto-calc price
    if (k === 'selling_price' && v) next.base_price = Math.round(parseFloat(v) / 1.1);
    if (k === 'base_price' && v) next.selling_price = Math.round(parseFloat(v) * 1.1);
    setForm(next);
  };

  const save = async () => {
    if (!form.name) return alert('Nhập tên sản phẩm');
    setLoading(true);
    try {
      if (editId) await api.put(`/products/${editId}`, { ...form, selling_price: +form.selling_price || 0, base_price: +form.base_price || 0 });
      else await api.post('/products', { ...form, selling_price: +form.selling_price || 0, base_price: +form.base_price || 0 });
      onSaved(); onClose();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setLoading(false);
  };

  return (
    <Modal title={editId ? '✏️ Sửa sản phẩm' : '➕ Thêm sản phẩm'} onClose={onClose} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Code Preview */}
        {generatedCode && (
          <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-2">
            <span className="text-xs text-blue-600 font-medium">Mã thành phẩm:</span>
            <span className="font-mono text-sm font-bold text-blue-800">{generatedCode}</span>
          </div>
        )}

        {/* Code Parts Grid */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Cấu trúc mã</h3>
          <div className="grid grid-cols-3 gap-2">
            {CODE_PART_ORDER.map(t => {
              const key = 'code_' + (t === 'type_standard' ? 'type_std' : t);
              const items = codeParts[t]?.items || [];
              return (
                <div key={t}>
                  <label className="text-[10px] font-medium text-gray-500 block mb-0.5">{CODE_PART_VN[t]}</label>
                  <select value={form[key]} onChange={e => set(key, e.target.value)}
                    className="w-full h-8 text-xs border rounded-lg px-2 bg-white">
                    <option value="">--</option>
                    {items.map(it => <option key={it.id} value={it.code}>{it.code} - {it.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-700 block mb-1">Tên thành phẩm *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Tủ bếp gỗ sồi chữ L tiêu chuẩn" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Giá bán gồm VAT 10%</label>
            <input type="number" value={form.selling_price} onChange={e => set('selling_price', e.target.value)}
              className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="55,000,000" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Giá bán chưa VAT 10%</label>
            <input type="number" value={form.base_price} onChange={e => set('base_price', e.target.value)}
              className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="50,000,000" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Đơn vị tính</label>
            <select value={form.unit} onChange={e => set('unit', e.target.value)}
              className="w-full h-9 px-3 border rounded-lg text-sm bg-white">
              {['bộ','cái','m²','m dài','chiếc','tấm','thanh'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Mô tả</label>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="Ghi chú..." />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
        <button onClick={onClose} className="h-9 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm cursor-pointer">Hủy</button>
        <button onClick={save} disabled={loading} className="h-9 px-6 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
          <Save className="h-4 w-4" /> {loading ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </Modal>
  );
}

// ═══ Code Parts Manager ═══
function CodePartsManager({ codeParts, onReload }) {
  const [expanded, setExpanded] = useState(null);
  const [adding, setAdding] = useState(null); // part_type
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  const addPart = async (type) => {
    if (!newCode.trim() || !newName.trim()) return;
    try {
      await api.post('/products/code-parts', { part_type: type, code: newCode.trim(), name: newName.trim() });
      setAdding(null); setNewCode(''); setNewName('');
      onReload();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const delPart = async (id) => {
    if (!confirm('Xóa mã này?')) return;
    try { await api.delete(`/products/code-parts/${id}`); onReload(); } catch { alert('Lỗi xóa'); }
  };

  const syncCodeParts = async () => {
    try {
      const { data } = await api.post('/products/code-parts/auto-extract');
      alert(data.message);
      onReload();
    } catch (e) { alert('Lỗi: ' + (e.response?.data?.error || e.message)); }
  };

  return (
    <div className="bg-white rounded-xl border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Settings className="h-4 w-4 text-gray-500" /> Quản lý cấu trúc mã thành phẩm
        </h3>
        <button onClick={syncCodeParts} className="h-7 px-3 bg-blue-100 text-blue-700 rounded-lg text-[10px] hover:bg-blue-200 flex items-center gap-1 cursor-pointer">
          🔄 Đồng bộ từ SP đã import
        </button>
      </div>
      <p className="text-xs text-gray-500">Mã thành phẩm = Nhóm SP - Quy cách - Tiêu chuẩn - Loại - Hình thức - Kính - Chuẩn loại - Hông - Kích thước</p>

      {CODE_PART_ORDER.map(type => {
        const group = codeParts[type] || { label: CODE_PART_VN[type], items: [] };
        const isOpen = expanded === type;

        return (
          <div key={type} className="border rounded-lg overflow-hidden">
            <button onClick={() => setExpanded(isOpen ? null : type)}
              className="w-full flex items-center justify-between p-2.5 hover:bg-gray-50 cursor-pointer text-left">
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                <span className="text-xs font-semibold text-gray-700">{CODE_PART_VN[type]}</span>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{group.items.length}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setAdding(type); setExpanded(type); }}
                className="text-[10px] text-blue-600 hover:underline cursor-pointer">+ Thêm</button>
            </button>

            {isOpen && (
              <div className="border-t px-3 pb-2 space-y-1">
                {group.items.map(it => (
                  <div key={it.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">{it.code}</span>
                      <span className="text-xs text-gray-700">{it.name}</span>
                    </div>
                    <button onClick={() => delPart(it.id)} className="text-red-400 hover:text-red-600 cursor-pointer">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {adding === type && (
                  <div className="flex items-center gap-2 pt-1 border-t">
                    <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Mã" className="w-16 h-7 px-2 border rounded text-xs" />
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Tên" className="flex-1 h-7 px-2 border rounded text-xs" />
                    <button onClick={() => addPart(type)} className="h-7 px-2 bg-blue-600 text-white rounded text-xs cursor-pointer">Lưu</button>
                    <button onClick={() => setAdding(null)} className="h-7 px-2 bg-gray-100 rounded text-xs cursor-pointer">Hủy</button>
                  </div>
                )}

                {group.items.length === 0 && adding !== type && (
                  <p className="text-[10px] text-gray-400 py-1">Chưa có mã nào</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
