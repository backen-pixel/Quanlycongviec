/**
 * Upload file 3D / cutlist → backend parse → trả items + auto-tính giá trị từng item.
 *
 * Hỗ trợ trực tiếp: CSV / TSV / XLSX / XLS / JSON.
 * Stub (báo lỗi hướng dẫn): IFC / DXF / DWG / OBJ / GLTF / SKP / FBX.
 */

import { useEffect, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, FileText, Trash2, Loader2, Sparkles, UploadCloud } from 'lucide-react';
import api from '../../lib/api';

const STATUS_BADGE = {
  ready: { label: 'Sẵn sàng', cls: 'bg-emerald-100 text-emerald-700' },
  stub: { label: 'Sắp ra mắt', cls: 'bg-amber-100 text-amber-700' },
};

export default function CalcImport3DPage() {
  const [parsers, setParsers] = useState([]);
  const [imports, setImports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [activeImport, setActiveImport] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const loadImports = () =>
    api.get('/calc/imports').then((r) => setImports(r.data?.imports || []));

  useEffect(() => {
    api.get('/calc/parsers').then((r) => setParsers(r.data?.parsers || []));
    api.get('/calc/categories', { params: { active: 1 } }).then((r) => setCategories(r.data?.categories || []));
    loadImports();
  }, []);

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (categoryId) fd.append('category_id', categoryId);
      const { data } = await api.post('/calc/import-3d', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setActiveImport(data?.import || null);
      await loadImports();
    } catch (err) {
      setUploadError(err?.response?.data?.error || err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onUpload = (e) => uploadFile(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    uploadFile(e.dataTransfer.files?.[0]);
  };

  const openImport = async (id) => {
    const { data } = await api.get(`/calc/imports/${id}`);
    setActiveImport(data?.import || null);
  };

  const removeImport = async (id) => {
    if (!confirm('Xóa file import này?')) return;
    await api.delete(`/calc/imports/${id}`);
    await loadImports();
    if (activeImport?.id === id) setActiveImport(null);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center text-white">
          <Upload className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tính từ file 3D / Cutlist</h1>
          <p className="text-sm text-gray-500">Upload bảng vật tư xuất từ phần mềm 3D, hệ thống lọc danh sách, map theo từ khóa và tính giá trị từng item.</p>
        </div>
      </div>

      {/* Cách khuyên dùng: OpenCutList → CSV/XLSX */}
      <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-emerald-800 mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-600" /> Cách dễ & chính xác nhất: OpenCutList → CSV/XLSX
        </h3>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { n: 1, t: 'Cài OpenCutList', d: 'Trong SketchUp: Extension Warehouse → tìm "OpenCutList" → Install (miễn phí).' },
            { n: 2, t: 'Xuất bảng cắt', d: 'Mở OpenCutList → tab Cutlist → nút Export → chọn CSV hoặc XLSX.' },
            { n: 3, t: 'Kéo file vào đây', d: 'Thả file CSV/XLSX vừa xuất vào ô bên dưới — hệ thống tự đọc kích thước & tính giá.' },
          ].map((s) => (
            <li key={s.n} className="bg-white border border-emerald-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">{s.n}</span>
                <span className="text-sm font-semibold text-gray-800">{s.t}</span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">{s.d}</p>
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-emerald-700/80 mt-2">
          CSV/XLSX giữ đúng kích thước do OpenCutList tính sẵn, nên chuẩn hơn cách xuất <code className="bg-emerald-100 px-1 rounded">.dae</code>/<code className="bg-emerald-100 px-1 rounded">.kmz</code> (hệ thống phải tự đoán hộp bao).
        </p>
      </div>

      {/* Upload */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Danh mục (tùy chọn)</label>
          <select className="input max-w-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— Tự động map theo từ khóa —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="text-[10px] text-gray-400 mt-1">Chọn để chỉ map item về các loại trong danh mục này.</p>
        </div>

        <div
          onClick={() => !uploading && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'
          } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.ods,.json,.dae,.kmz,.xml"
            onChange={onUpload}
            disabled={uploading}
            className="hidden"
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-emerald-600">
              <Loader2 className="h-7 w-7 animate-spin" />
              <span className="text-sm font-medium">Đang xử lý file…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <UploadCloud className={`h-8 w-8 ${dragOver ? 'text-emerald-500' : 'text-gray-400'}`} />
              <p className="text-sm font-medium text-gray-700">Kéo & thả file vào đây, hoặc bấm để chọn</p>
              <p className="text-[11px] text-gray-400">Ưu tiên <strong>CSV / XLSX</strong> (OpenCutList) · cũng nhận JSON / DAE / KMZ</p>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="border border-rose-200 bg-rose-50 rounded-lg p-3 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>{uploadError}</div>
          </div>
        )}

        {/* Định dạng được hỗ trợ */}
        <div className="pt-1">
          <h4 className="text-[11px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Tất cả định dạng hỗ trợ
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {parsers.map((p) => (
              <span key={p.key} className={`text-[11px] font-mono px-2 py-0.5 rounded ${STATUS_BADGE[p.status]?.cls || 'bg-gray-100'}`}>
                {p.exts.join(' / ')} — {STATUS_BADGE[p.status]?.label || p.status}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            <strong>SketchUp không cài OpenCutList?</strong> File → Export → 3D Model → chọn <code className="bg-gray-100 px-1">.dae</code> hoặc <code className="bg-gray-100 px-1">.kmz</code>.
            Các định dạng <strong>Sắp ra mắt</strong> (IFC/DXF/SKP/OBJ…) cần xuất tạm sang CSV/XLSX/JSON.
          </p>
        </div>
      </div>

      {/* History list + active import */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-4 bg-white border border-gray-200 rounded-xl">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-bold text-gray-700">Đã import</div>
          <div className="max-h-[600px] overflow-y-auto">
            {imports.length === 0 ? (
              <p className="p-4 text-xs text-gray-400 italic">Chưa có file nào.</p>
            ) : imports.map((imp) => (
              <button
                key={imp.id}
                onClick={() => openImport(imp.id)}
                className={`group w-full text-left flex items-center gap-2 px-4 py-2.5 border-l-4 ${
                  activeImport?.id === imp.id ? 'bg-orange-50 border-orange-500' : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{imp.file_name}</p>
                  <p className="text-[11px] text-gray-500">
                    {imp.format} · {Number(imp.total_result || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                    {imp.total_currency ? ` ${imp.total_currency}` : ''}
                  </p>
                </div>
                <Trash2
                  className="h-3.5 w-3.5 text-gray-300 group-hover:text-rose-500"
                  onClick={(e) => { e.stopPropagation(); removeImport(imp.id); }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-12 md:col-span-8">
          {!activeImport ? (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm">
              Chọn file đã import bên trái hoặc upload file mới.
            </div>
          ) : (
            <ImportDetail imp={activeImport} />
          )}
        </div>
      </div>
    </div>
  );
}

function ImportDetail({ imp }) {
  const items = imp.items || [];
  const total = imp.total_result || 0;
  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-bold text-gray-900 flex-1">{imp.file_name}</h3>
          <span className="text-xs text-gray-500 font-mono">{imp.format}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {items.length} item · Tổng giá trị:{' '}
          <strong className="text-emerald-700 text-base">
            {Number(total).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
            {imp.total_currency ? ` ${imp.total_currency}` : ''}
          </strong>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Tên item</th>
              <th className="px-3 py-2 text-left">Map về loại</th>
              <th className="px-3 py-2 text-right">W (mm)</th>
              <th className="px-3 py-2 text-right">H (mm)</th>
              <th className="px-3 py-2 text-right">D (mm)</th>
              <th className="px-3 py-2 text-right">SL</th>
              <th className="px-3 py-2 text-right">Đơn giá</th>
              <th className="px-3 py-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((it, i) => (
              <tr key={i} className={it.compute_error ? 'bg-rose-50' : it.matched_type_id ? 'hover:bg-gray-50' : 'bg-amber-50/40 hover:bg-amber-50'}>
                <td className="px-3 py-2 text-sm">{it.name}</td>
                <td className="px-3 py-2 text-xs">
                  {it.matched_type_name ? (
                    <span className="text-emerald-700">{it.matched_type_name}</span>
                  ) : (
                    <span className="text-amber-600">— chưa map —</span>
                  )}
                  {it.compute_error && (
                    <p className="text-[10px] text-rose-600 mt-0.5">⚠ {it.compute_error}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">{it.w ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{it.h ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{it.d ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{it.qty ?? 1}</td>
                <td className="px-3 py-2 text-right text-xs">
                  {it.unit_value !== undefined ? Number(it.unit_value).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : '—'}
                </td>
                <td className="px-3 py-2 text-right text-xs font-semibold">
                  {it.qty_value !== undefined ? Number(it.qty_value).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
