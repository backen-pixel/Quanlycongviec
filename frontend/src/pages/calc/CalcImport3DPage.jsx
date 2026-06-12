/**
 * Upload file 3D / cutlist → backend parse → trả items + auto-tính giá trị từng item.
 *
 * Hỗ trợ trực tiếp: CSV / TSV / XLSX / XLS / JSON.
 * Stub (báo lỗi hướng dẫn): IFC / DXF / DWG / OBJ / GLTF / SKP / FBX.
 */

import { useEffect, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, FileText, Trash2, Loader2 } from 'lucide-react';
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
  const fileRef = useRef(null);

  const loadImports = () =>
    api.get('/calc/imports').then((r) => setImports(r.data?.imports || []));

  useEffect(() => {
    api.get('/calc/parsers').then((r) => setParsers(r.data?.parsers || []));
    api.get('/calc/categories', { params: { active: 1 } }).then((r) => setCategories(r.data?.categories || []));
    loadImports();
  }, []);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
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

      {/* Định dạng được hỗ trợ */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-gray-500" /> Định dạng hỗ trợ
        </h3>
        <div className="flex flex-wrap gap-2">
          {parsers.map((p) => (
            <span key={p.key} className={`text-xs font-mono px-2 py-1 rounded ${STATUS_BADGE[p.status]?.cls || 'bg-gray-100'}`}>
              {p.exts.join(' / ')} — {STATUS_BADGE[p.status]?.label || p.status}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          <strong>SketchUp:</strong> File → Export → 3D Model → chọn <code className="bg-gray-100 px-1">.dae</code> hoặc <code className="bg-gray-100 px-1">.kmz</code> để tải lên (giữ tên Component + W/H/D).
          Định dạng còn ở trạng thái <strong>Sắp ra mắt</strong> (IFC/DXF/SKP/OBJ…): xuất tạm sang CSV/XLSX/JSON từ phần mềm gốc.
        </p>
      </div>

      {/* Upload */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Danh mục (tùy chọn)</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Tự động map theo từ khóa —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Chọn để chỉ map item về các loại trong danh mục này.</p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">File cutlist / 3D</label>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.xlsx,.xls,.ods,.json,.dae,.kmz,.ifc,.dxf,.dwg,.obj,.gltf,.glb,.fbx,.3ds,.skp,.xml"
                onChange={onUpload}
                disabled={uploading}
                className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {uploading && <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
            </div>
          </div>
        </div>
        {uploadError && (
          <div className="mt-3 border border-rose-200 bg-rose-50 rounded-lg p-3 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>{uploadError}</div>
          </div>
        )}
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
