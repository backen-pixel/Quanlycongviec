/**
 * Trang cấu hình toàn bộ module Tính toán.
 * Layout 3 panel:
 *   ┌──────────────┬──────────────┬─────────────────────────────┐
 *   │  Danh mục    │  Loại trong  │   Tab: Biến / Công thức /   │
 *   │ (categories) │  danh mục    │   Rule điều kiện             │
 *   └──────────────┴──────────────┴─────────────────────────────┘
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Edit3, Save, X, FolderTree, Boxes, Variable, FunctionSquare, GitCompare, ChevronRight } from 'lucide-react';
import api from '../../lib/api';
import BlockEditor from '../../components/calc/BlockEditor';
import { astToText, nodeFactory } from '../../components/calc/astUtils';

const TABS = [
  { key: 'variables', label: 'Biến đầu vào', icon: Variable },
  { key: 'formulas', label: 'Công thức', icon: FunctionSquare },
  { key: 'rules', label: 'Rule điều kiện', icon: GitCompare },
];

export default function CalcSetupPage() {
  const [categories, setCategories] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [activeCatId, setActiveCatId] = useState(null);
  const [activeTypeId, setActiveTypeId] = useState(null);
  const [tab, setTab] = useState('variables');

  const [variables, setVariables] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [rules, setRules] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Load categories
  const loadCategories = async () => {
    const { data } = await api.get('/calc/categories');
    setCategories(data?.categories || []);
    if (!activeCatId && data?.categories?.length) setActiveCatId(data.categories[0].id);
  };
  useEffect(() => { loadCategories(); }, []);

  // ── Load product types when category changes
  useEffect(() => {
    if (!activeCatId) { setProductTypes([]); return; }
    api.get('/calc/product-types', { params: { category_id: activeCatId } })
      .then((r) => {
        const list = r.data?.product_types || [];
        setProductTypes(list);
        if (list.length && !list.find((p) => p.id === activeTypeId)) {
          setActiveTypeId(list[0].id);
        } else if (!list.length) {
          setActiveTypeId(null);
        }
      });
  }, [activeCatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load detail (variables/formulas/rules) when product type changes
  const loadDetail = async () => {
    if (!activeTypeId) {
      setVariables([]); setFormulas([]); setRules([]); return;
    }
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/calc/product-types/${activeTypeId}`);
      setVariables(data?.variables || []);
      setFormulas(data?.formulas || []);
      setRules(data?.rules || []);
    } finally { setLoadingDetail(false); }
  };
  useEffect(() => { loadDetail(); }, [activeTypeId]);

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Cấu hình tính toán</h1>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Col 1: Categories */}
        <div className="col-span-12 md:col-span-3">
          <CategoriesPanel
            items={categories}
            activeId={activeCatId}
            onSelect={setActiveCatId}
            onChanged={loadCategories}
          />
        </div>

        {/* Col 2: Product Types */}
        <div className="col-span-12 md:col-span-3">
          <ProductTypesPanel
            categoryId={activeCatId}
            items={productTypes}
            activeId={activeTypeId}
            onSelect={setActiveTypeId}
            onChanged={() => {
              if (activeCatId) {
                api.get('/calc/product-types', { params: { category_id: activeCatId } })
                  .then((r) => setProductTypes(r.data?.product_types || []));
              }
            }}
          />
        </div>

        {/* Col 3: Tabs (variables / formulas / rules) */}
        <div className="col-span-12 md:col-span-6">
          {!activeTypeId ? (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">
              Chọn (hoặc tạo) một <strong>loại sản phẩm</strong> để bắt đầu cấu hình biến / công thức / rule.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl">
              <div className="flex border-b border-gray-200">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex-1 px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${
                      tab === t.key
                        ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <t.icon className="h-4 w-4" /> {t.label}
                  </button>
                ))}
              </div>
              <div className="p-4">
                {loadingDetail ? (
                  <div className="text-center text-gray-400 text-sm py-6">Đang tải…</div>
                ) : tab === 'variables' ? (
                  <VariablesTab
                    productTypeId={activeTypeId}
                    items={variables}
                    onChanged={loadDetail}
                  />
                ) : tab === 'formulas' ? (
                  <FormulasTab
                    productTypeId={activeTypeId}
                    items={formulas}
                    variables={variables}
                    onChanged={loadDetail}
                  />
                ) : (
                  <RulesTab
                    productTypeId={activeTypeId}
                    items={rules}
                    formulas={formulas}
                    variables={variables}
                    onChanged={loadDetail}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORIES PANEL
// ═════════════════════════════════════════════════════════════════════════════
function CategoriesPanel({ items, activeId, onSelect, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', description: '' });

  const open = (cat) => {
    setEditing(cat || null);
    setForm({ name: cat?.name || '', code: cat?.code || '', description: cat?.description || '' });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.name?.trim()) return alert('Nhập tên danh mục');
    if (editing) await api.put(`/calc/categories/${editing.id}`, form);
    else await api.post('/calc/categories', form);
    setShowForm(false);
    onChanged();
  };

  const remove = async (cat) => {
    if (!confirm(`Xóa danh mục "${cat.name}"? Tất cả loại sản phẩm và công thức bên trong sẽ mất.`)) return;
    await api.delete(`/calc/categories/${cat.id}`);
    onChanged();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <FolderTree className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-bold text-gray-700 flex-1">Danh mục</h2>
        <button
          onClick={() => open(null)}
          className="p-1 rounded hover:bg-blue-50 text-blue-600"
          title="Thêm danh mục"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[600px] overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-4 text-xs text-gray-400 italic">Chưa có danh mục nào.</p>
        ) : (
          items.map((cat) => (
            <div
              key={cat.id}
              className={`group flex items-center gap-2 px-4 py-2.5 cursor-pointer border-l-4 ${
                cat.id === activeId
                  ? 'bg-violet-50 border-violet-500'
                  : 'border-transparent hover:bg-gray-50'
              }`}
              onClick={() => onSelect(cat.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{cat.name}</p>
                {cat.code && <p className="text-[10px] text-gray-400 font-mono">{cat.code}</p>}
              </div>
              {cat.id === activeId && <ChevronRight className="h-4 w-4 text-violet-500" />}
              <button
                className="p-1 text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); open(cat); }}
                title="Sửa"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              <button
                className="p-1 text-gray-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); remove(cat); }}
                title="Xóa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <Modal title={editing ? 'Sửa danh mục' : 'Thêm danh mục'} onClose={() => setShowForm(false)} onSubmit={submit}>
          <Field label="Tên danh mục *">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Mã (tùy chọn)">
            <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Mô tả">
            <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PRODUCT TYPES PANEL
// ═════════════════════════════════════════════════════════════════════════════
function ProductTypesPanel({ categoryId, items, activeId, onSelect, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const open = (pt) => {
    setEditing(pt || null);
    setForm({
      name: pt?.name || '',
      code: pt?.code || '',
      default_unit: pt?.default_unit || 'mm',
      result_unit: pt?.result_unit || '',
      description: pt?.description || '',
      match_keywords: (pt?.match_keywords || []).join(', '),
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!categoryId) return alert('Chọn danh mục trước');
    if (!form.name?.trim()) return alert('Nhập tên loại sản phẩm');
    const payload = {
      ...form,
      category_id: categoryId,
      match_keywords: form.match_keywords
        ? form.match_keywords.split(',').map((s) => s.trim()).filter(Boolean)
        : null,
    };
    if (editing) await api.put(`/calc/product-types/${editing.id}`, payload);
    else await api.post('/calc/product-types', payload);
    setShowForm(false);
    onChanged();
  };

  const remove = async (pt) => {
    if (!confirm(`Xóa loại sản phẩm "${pt.name}"? Tất cả biến/công thức/rule sẽ mất.`)) return;
    await api.delete(`/calc/product-types/${pt.id}`);
    onChanged();
  };

  if (!categoryId) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-6 text-xs text-gray-400 italic">
        Chọn danh mục để xem các loại sản phẩm.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <Boxes className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-bold text-gray-700 flex-1">Loại sản phẩm</h2>
        <button
          onClick={() => open(null)}
          className="p-1 rounded hover:bg-blue-50 text-blue-600"
          title="Thêm loại sản phẩm"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[600px] overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-4 text-xs text-gray-400 italic">Chưa có loại sản phẩm.</p>
        ) : (
          items.map((pt) => (
            <div
              key={pt.id}
              className={`group flex items-center gap-2 px-4 py-2.5 cursor-pointer border-l-4 ${
                pt.id === activeId
                  ? 'bg-emerald-50 border-emerald-500'
                  : 'border-transparent hover:bg-gray-50'
              }`}
              onClick={() => onSelect(pt.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{pt.name}</p>
                <p className="text-[10px] text-gray-400">
                  {pt.default_unit || 'mm'}{pt.result_unit ? ` → ${pt.result_unit}` : ''}
                </p>
              </div>
              {pt.id === activeId && <ChevronRight className="h-4 w-4 text-emerald-500" />}
              <button
                className="p-1 text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); open(pt); }}
                title="Sửa"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              <button
                className="p-1 text-gray-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); remove(pt); }}
                title="Xóa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <Modal title={editing ? 'Sửa loại sản phẩm' : 'Thêm loại sản phẩm'} onClose={() => setShowForm(false)} onSubmit={submit}>
          <Field label="Tên loại *">
            <input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Mã (tùy chọn)">
            <input className="input" value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Đơn vị kích thước">
              <select className="input" value={form.default_unit || 'mm'} onChange={(e) => setForm({ ...form, default_unit: e.target.value })}>
                <option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
              </select>
            </Field>
            <Field label="Đơn vị kết quả">
              <input className="input" placeholder="VND, m², kg…" value={form.result_unit || ''} onChange={(e) => setForm({ ...form, result_unit: e.target.value })} />
            </Field>
          </div>
          <Field label="Từ khóa map từ file 3D" hint="Phân cách bằng dấu phẩy. Vd: tu tren, upper cab, wall unit">
            <input className="input" value={form.match_keywords || ''} onChange={(e) => setForm({ ...form, match_keywords: e.target.value })} />
          </Field>
          <Field label="Mô tả">
            <textarea className="input" rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIABLES TAB
// ═════════════════════════════════════════════════════════════════════════════
function VariablesTab({ productTypeId, items, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const open = (v) => {
    setEditing(v || null);
    setForm({
      var_key: v?.var_key || '',
      label: v?.label || '',
      data_type: v?.data_type || 'number',
      unit: v?.unit || '',
      default_value: v?.default_value ?? '',
      min_value: v?.min_value ?? '',
      max_value: v?.max_value ?? '',
      is_required: v?.is_required !== false,
      is_dimension: !!v?.is_dimension,
      dim_axis: v?.dim_axis || '',
      sort_order: v?.sort_order || 0,
      description: v?.description || '',
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.var_key || !form.label) return alert('Nhập var_key và label');
    const payload = {
      ...form,
      product_type_id: productTypeId,
      default_value: form.default_value === '' ? null : Number(form.default_value),
      min_value: form.min_value === '' ? null : Number(form.min_value),
      max_value: form.max_value === '' ? null : Number(form.max_value),
    };
    if (editing) await api.put(`/calc/variables/${editing.id}`, payload);
    else await api.post('/calc/variables', payload);
    setShowForm(false);
    onChanged();
  };

  const remove = async (v) => {
    if (!confirm(`Xóa biến "${v.var_key}"?`)) return;
    await api.delete(`/calc/variables/${v.id}`);
    onChanged();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">Mỗi biến có 1 mã (var_key, ASCII) dùng trong AST công thức.</p>
        <button onClick={() => open(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg">
          <Plus className="h-4 w-4" /> Thêm biến
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-6 text-center">Chưa có biến nào.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Mã</th>
                <th className="px-3 py-2 text-left">Tên hiển thị</th>
                <th className="px-3 py-2 text-left">Đơn vị</th>
                <th className="px-3 py-2 text-left">Mặc định</th>
                <th className="px-3 py-2 text-left">Từ 3D</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{v.var_key}</td>
                  <td className="px-3 py-2">{v.label}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{v.unit || '—'}</td>
                  <td className="px-3 py-2 text-xs">{v.default_value ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {v.is_dimension ? <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">{v.dim_axis || '?'}</span> : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => open(v)} className="p-1 text-gray-400 hover:text-blue-500"><Edit3 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove(v)} className="p-1 text-gray-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title={editing ? 'Sửa biến' : 'Thêm biến'} onClose={() => setShowForm(false)} onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="var_key * (ASCII, không dấu)" hint="Vd: rong, cao, sau, ty_le">
              <input className="input font-mono" value={form.var_key || ''} onChange={(e) => setForm({ ...form, var_key: e.target.value })} />
            </Field>
            <Field label="Tên hiển thị *">
              <input className="input" value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kiểu dữ liệu">
              <select className="input" value={form.data_type || 'number'} onChange={(e) => setForm({ ...form, data_type: e.target.value })}>
                <option value="number">Số</option><option value="percent">%</option>
              </select>
            </Field>
            <Field label="Đơn vị">
              <input className="input" value={form.unit || ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </Field>
            <Field label="Mặc định">
              <input className="input" type="number" value={form.default_value ?? ''} onChange={(e) => setForm({ ...form, default_value: e.target.value })} />
            </Field>
          </div>
          <div className="border-t border-gray-200 pt-3 mt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!form.is_dimension} onChange={(e) => setForm({ ...form, is_dimension: e.target.checked })} />
              Biến lấy từ kích thước file 3D (W/H/D)
            </label>
            {form.is_dimension && (
              <Field label="Trục" hint="W=rộng, H=cao, D=sâu/dày">
                <select className="input w-32" value={form.dim_axis || ''} onChange={(e) => setForm({ ...form, dim_axis: e.target.value })}>
                  <option value="">— chọn —</option>
                  <option value="W">W (rộng)</option>
                  <option value="H">H (cao)</option>
                  <option value="D">D (sâu/dày)</option>
                </select>
              </Field>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORMULAS TAB
// ═════════════════════════════════════════════════════════════════════════════
function FormulasTab({ productTypeId, items, variables, onChanged }) {
  const [editing, setEditing] = useState(null); // { id?, name, ast }
  const [name, setName] = useState('');
  const [ast, setAst] = useState(nodeFactory('num'));

  const open = (f) => {
    setEditing(f || { id: null });
    setName(f?.name || 'Công thức mới');
    setAst(f?.ast || nodeFactory('num'));
  };

  const submit = async () => {
    if (!name.trim()) return alert('Nhập tên công thức');
    const payload = { product_type_id: productTypeId, name, ast };
    if (editing?.id) await api.put(`/calc/formulas/${editing.id}`, payload);
    else await api.post('/calc/formulas', payload);
    setEditing(null);
    onChanged();
  };

  const remove = async (f) => {
    if (!confirm(`Xóa công thức "${f.name}"?`)) return;
    await api.delete(`/calc/formulas/${f.id}`);
    onChanged();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">Soạn công thức bằng block. Rule sẽ chọn 1 công thức để áp.</p>
        <button onClick={() => open(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg">
          <Plus className="h-4 w-4" /> Thêm công thức
        </button>
      </div>

      {items.length === 0 && !editing ? (
        <p className="text-sm text-gray-400 italic py-6 text-center">Chưa có công thức nào.</p>
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <div key={f.id} className="border border-gray-200 rounded-lg p-3 bg-white">
              <div className="flex items-center gap-2">
                <FunctionSquare className="h-4 w-4 text-violet-500" />
                <strong className="text-sm flex-1">{f.name}</strong>
                <button onClick={() => open(f)} className="p-1 text-gray-400 hover:text-blue-500"><Edit3 className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(f)} className="p-1 text-gray-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <p className="text-xs font-mono text-gray-500 mt-1 break-all">{f.expression_text || astToText(f.ast)}</p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          wide
          title={editing.id ? 'Sửa công thức' : 'Công thức mới'}
          onClose={() => setEditing(null)}
          onSubmit={submit}
        >
          <Field label="Tên công thức">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="text-xs text-gray-500 mb-1">Cây công thức:</div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <BlockEditor value={ast} onChange={setAst} variables={variables} mode="number" />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RULES TAB
// ═════════════════════════════════════════════════════════════════════════════
function RulesTab({ productTypeId, items, formulas, variables, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [conditionAst, setConditionAst] = useState(nodeFactory('cmp'));

  const open = (r) => {
    setEditing(r || { id: null });
    setForm({
      name: r?.name || 'Rule mới',
      priority: r?.priority ?? 100,
      formula_id: r?.formula_id || '',
      is_default: !!r?.is_default,
      is_active: r?.is_active !== false,
    });
    setConditionAst(r?.condition_ast || nodeFactory('cmp'));
  };

  const submit = async () => {
    if (!form.name?.trim()) return alert('Nhập tên rule');
    const payload = {
      product_type_id: productTypeId,
      name: form.name,
      priority: Number(form.priority) || 100,
      formula_id: form.formula_id || null,
      is_default: !!form.is_default,
      is_active: form.is_active !== false,
      condition_ast: form.is_default ? { type: 'noop' } : conditionAst,
    };
    if (editing?.id) await api.put(`/calc/rules/${editing.id}`, payload);
    else await api.post('/calc/rules', payload);
    setEditing(null);
    onChanged();
  };

  const remove = async (r) => {
    if (!confirm(`Xóa rule "${r.name}"?`)) return;
    await api.delete(`/calc/rules/${r.id}`);
    onChanged();
  };

  const formulasById = useMemo(() => {
    const m = {};
    formulas.forEach((f) => { m[f.id] = f; });
    return m;
  }, [formulas]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">Sắp xếp theo priority ASC (số nhỏ ưu tiên cao). Rule khớp đầu tiên thắng.</p>
        <button onClick={() => open(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg">
          <Plus className="h-4 w-4" /> Thêm rule
        </button>
      </div>

      {items.length === 0 && !editing ? (
        <p className="text-sm text-gray-400 italic py-6 text-center">Chưa có rule nào.</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={r.id} className="border border-gray-200 rounded-lg p-3 bg-white">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-mono">P{r.priority}</span>
                <strong className="text-sm flex-1">{r.name}</strong>
                {r.is_default && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">DEFAULT</span>}
                {!r.is_active && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">Tắt</span>}
                <button onClick={() => open(r)} className="p-1 text-gray-400 hover:text-blue-500"><Edit3 className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(r)} className="p-1 text-gray-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                <span className="font-mono">{r.condition_text || astToText(r.condition_ast)}</span>
                {' → '}
                <span className="text-violet-700 font-semibold">
                  {r.formula_id ? (formulasById[r.formula_id]?.name || '(công thức)') : '(chưa gắn)'}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          wide
          title={editing.id ? 'Sửa rule' : 'Rule mới'}
          onClose={() => setEditing(null)}
          onSubmit={submit}
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="Tên rule *" className="col-span-2">
              <input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Priority" hint="Số nhỏ = ưu tiên cao">
              <input className="input" type="number" value={form.priority ?? 100} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            </Field>
          </div>
          <Field label="Áp công thức *">
            <select className="input" value={form.formula_id || ''} onChange={(e) => setForm({ ...form, formula_id: e.target.value })}>
              <option value="">— chọn công thức —</option>
              {formulas.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <div className="flex items-center gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
              Là rule mặc định (luôn khớp)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_active !== false} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Đang bật
            </label>
          </div>
          {!form.is_default && (
            <>
              <div className="text-xs text-gray-500 mt-2">Cây điều kiện (boolean):</div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <BlockEditor value={conditionAst} onChange={setConditionAst} variables={variables} mode="bool" />
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ═════════════════════════════════════════════════════════════════════════════
function Modal({ title, children, onClose, onSubmit, wide }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-xl shadow-xl ${wide ? 'max-w-3xl' : 'max-w-md'} w-full max-h-[90vh] overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-200 flex items-center">
          <h3 className="font-semibold text-gray-900 flex-1">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto">{children}</div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Hủy</button>
          <button onClick={onSubmit} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center gap-2">
            <Save className="h-4 w-4" /> Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children, className }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}
