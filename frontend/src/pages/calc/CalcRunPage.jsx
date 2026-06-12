/**
 * Tính nhanh: chọn danh mục → loại sản phẩm → form input → ra kết quả.
 */

import { useEffect, useMemo, useState } from 'react';
import { Calculator, Save, Sparkles, AlertTriangle } from 'lucide-react';
import api from '../../lib/api';

export default function CalcRunPage() {
  const [categories, setCategories] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [catId, setCatId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [bundle, setBundle] = useState(null); // { product_type, variables, formulas, rules }
  const [inputs, setInputs] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    api.get('/calc/categories', { params: { active: 1 } })
      .then((r) => setCategories(r.data?.categories || []));
  }, []);

  useEffect(() => {
    if (!catId) { setProductTypes([]); setTypeId(''); return; }
    api.get('/calc/product-types', { params: { category_id: catId, active: 1 } })
      .then((r) => {
        setProductTypes(r.data?.product_types || []);
        setTypeId('');
      });
  }, [catId]);

  useEffect(() => {
    if (!typeId) { setBundle(null); setInputs({}); setResult(null); return; }
    api.get(`/calc/product-types/${typeId}`).then((r) => {
      setBundle(r.data);
      const initial = {};
      (r.data?.variables || []).forEach((v) => {
        if (v.default_value !== null && v.default_value !== undefined) {
          initial[v.var_key] = String(v.default_value);
        }
      });
      setInputs(initial);
      setResult(null);
    });
  }, [typeId]);

  const compute = async (save = false) => {
    setRunning(true);
    setError(null);
    try {
      const payload = {
        product_type_id: typeId,
        inputs: Object.fromEntries(
          Object.entries(inputs).map(([k, v]) => [k, v === '' ? 0 : Number(v)])
        ),
      };
      if (save) { payload.save = 1; payload.notes = notes; }
      const { data } = await api.post('/calc/compute', payload);
      setResult(data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setResult(null);
    } finally { setRunning(false); }
  };

  const dimensionVars = useMemo(() => (bundle?.variables || []).filter((v) => v.is_dimension), [bundle]);
  const otherVars = useMemo(() => (bundle?.variables || []).filter((v) => !v.is_dimension), [bundle]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center text-white">
          <Calculator className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tính nhanh</h1>
          <p className="text-sm text-gray-500">Nhập kích thước, hệ thống chọn rule + công thức và tính ra giá trị.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Danh mục</label>
          <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>
            <option value="">— chọn —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Loại sản phẩm</label>
          <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={!catId}>
            <option value="">— chọn —</option>
            {productTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {bundle && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          {dimensionVars.length > 0 && (
            <Section title="Kích thước (từ bản vẽ 3D / đo thực tế)">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {dimensionVars.map((v) => (
                  <VarInput key={v.id} v={v} value={inputs[v.var_key] ?? ''}
                    onChange={(val) => setInputs({ ...inputs, [v.var_key]: val })} />
                ))}
              </div>
            </Section>
          )}

          {otherVars.length > 0 && (
            <Section title="Tham số khác (kích thước chuẩn, % điều chỉnh, đơn giá…)">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {otherVars.map((v) => (
                  <VarInput key={v.id} v={v} value={inputs[v.var_key] ?? ''}
                    onChange={(val) => setInputs({ ...inputs, [v.var_key]: val })} />
                ))}
              </div>
            </Section>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => compute(false)}
              disabled={running}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" /> {running ? 'Đang tính…' : 'Tính'}
            </button>
            <input
              className="input flex-1"
              placeholder="Ghi chú (tùy chọn)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button
              onClick={() => compute(true)}
              disabled={running}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Lưu vào lịch sử
            </button>
          </div>

          {error && (
            <div className="border border-rose-200 bg-rose-50 rounded-lg p-3 text-sm text-rose-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {result && (
            <div className="border-2 border-emerald-200 bg-emerald-50 rounded-lg p-4">
              <p className="text-xs uppercase font-semibold text-emerald-700 mb-1">Kết quả</p>
              <p className="text-3xl font-bold text-emerald-900">
                {Number(result.result || 0).toLocaleString('vi-VN', { maximumFractionDigits: 4 })}
                {result.result_unit ? <span className="ml-2 text-base text-emerald-700 font-normal">{result.result_unit}</span> : null}
              </p>
              <div className="mt-3 text-xs text-emerald-900/80 space-y-1 font-mono">
                <p><span className="text-emerald-700">Rule khớp:</span> {result.breakdown?.condition || '—'}</p>
                <p><span className="text-emerald-700">Công thức:</span> {result.breakdown?.formula || '—'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function VarInput({ v, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {v.label}
        {v.unit ? <span className="text-gray-400 ml-1">({v.unit})</span> : null}
        {v.is_dimension && v.dim_axis ? <span className="ml-1 text-[10px] px-1 bg-orange-100 text-orange-700 rounded">{v.dim_axis}</span> : null}
      </label>
      <input
        type="number"
        step="any"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={v.default_value !== null && v.default_value !== undefined ? String(v.default_value) : ''}
      />
    </div>
  );
}
