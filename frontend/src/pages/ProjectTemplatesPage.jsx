import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  Building2, Layers, Plus, ChevronRight, FolderOpen, FileText, Star,
  Trash2, Copy, Edit, Search, ArrowLeft
} from 'lucide-react';

export default function ProjectTemplatesPage() {
  const navigate = useNavigate();
  const [divisions, setDivisions] = useState([]);
  const [companies, setCompanies] = useState([]); // all companies
  const [units, setUnits] = useState([]);         // ecosystem units
  const [loading, setLoading] = useState(true);

  // Selection state
  const [selDivision, setSelDivision] = useState(null);
  const [selCompany, setSelCompany] = useState(null);

  // Template sets for selected company
  const [tplSets, setTplSets] = useState([]);
  const [loadingSets, setLoadingSets] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('');
  const [saving, setSaving] = useState(false);

  // Stages for selected company
  const [companyStages, setCompanyStages] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [unitRes, compRes] = await Promise.all([
          api.get('/ecosystem/units'),
          api.get('/companies'),
        ]);
        const allUnits = unitRes.data.units || [];
        setUnits(allUnits);
        setDivisions(allUnits.filter(u => u.level?.depth === 1));
        setCompanies(compRes.data.companies || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Load template sets when company selected
  const loadSets = useCallback(async (companyUnit) => {
    if (!companyUnit) return;
    setLoadingSets(true);
    try {
      const [setsRes, stagesRes] = await Promise.all([
        api.get(`/company-templates/units/${companyUnit.id}/template-sets`),
        api.get(`/stages?company_id=${companyUnit.company_id || ''}`),
      ]);
      setTplSets(setsRes.data.sets || []);
      setCompanyStages(stagesRes.data.stages || []);
    } catch {}
    setLoadingSets(false);
  }, []);

  const selectDivision = (div) => {
    setSelDivision(div);
    setSelCompany(null);
    setTplSets([]);
  };

  const selectCompany = (compUnit) => {
    setSelCompany(compUnit);
    loadSets(compUnit);
  };

  const createSet = async () => {
    if (!newName.trim() || !selCompany) return;
    setSaving(true);
    try {
      await api.post(`/company-templates/units/${selCompany.id}/template-sets`, {
        name: newName.trim(), project_type: newType || null,
      });
      setShowCreate(false);
      setNewName('');
      setNewType('');
      loadSets(selCompany);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const deleteSet = async (id) => {
    if (!confirm('Xóa dự án mẫu này?')) return;
    try {
      await api.delete(`/company-templates/template-sets/${id}`);
      loadSets(selCompany);
    } catch {}
  };

  const cloneSet = async (id) => {
    try {
      await api.post(`/company-templates/template-sets/${id}/clone`);
      loadSets(selCompany);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const setDefault = async (id) => {
    try {
      await api.put(`/company-templates/template-sets/${id}`, { is_default: true });
      loadSets(selCompany);
    } catch {}
  };

  // Get company units under selected division
  const divCompanyUnits = selDivision
    ? units.filter(u => u.parent_id === selDivision.id && u.level?.depth === 2)
    : [];

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-indigo-600" /> Dự Án Mẫu
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Chọn Khối → Công ty → Quản lý dự án mẫu</p>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <button onClick={() => { setSelDivision(null); setSelCompany(null); setTplSets([]); }}
          className={`px-2 py-1 rounded-lg cursor-pointer transition-colors ${!selDivision ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
          Tất cả Khối
        </button>
        {selDivision && <>
          <ChevronRight className="h-3 w-3 text-gray-300" />
          <button onClick={() => { setSelCompany(null); setTplSets([]); }}
            className={`px-2 py-1 rounded-lg cursor-pointer transition-colors ${selDivision && !selCompany ? 'bg-purple-100 text-purple-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
            {selDivision.level?.icon} {selDivision.name}
          </button>
        </>}
        {selCompany && <>
          <ChevronRight className="h-3 w-3 text-gray-300" />
          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-medium">🏢 {selCompany.name}</span>
        </>}
      </div>

      {/* ═══ STEP 1: Chọn Khối ═══ */}
      {!selDivision && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {divisions.map(div => {
            const compCount = units.filter(u => u.parent_id === div.id && u.level?.depth === 2).length;
            return (
              <button key={div.id} onClick={() => selectDivision(div)}
                className="bg-white rounded-xl border p-5 text-left hover:shadow-md hover:border-purple-300 transition-all cursor-pointer group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: (div.level?.color || '#6b7280') + '15' }}>
                    {div.level?.icon || '📋'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 group-hover:text-purple-700">{div.name}</h3>
                    <p className="text-[10px] text-gray-400">{compCount} công ty</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 ml-auto group-hover:text-purple-400" />
                </div>
                {div.stage_group && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: (div.stage_group.color || '#eee') + '20', color: div.stage_group.color }}>
                    {div.stage_group.icon} {div.stage_group.name}
                  </span>
                )}
              </button>
            );
          })}
          {divisions.length === 0 && (
            <div className="col-span-full text-center py-10">
              <Layers className="h-10 w-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-500">Chưa có Khối nào trong hệ sinh thái</p>
              <p className="text-xs text-gray-400 mt-1">Tạo Khối trong trang Hệ sinh thái trước</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 2: Chọn Công ty ═══ */}
      {selDivision && !selCompany && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {divCompanyUnits.map(cu => {
            const comp = companies.find(c => c.id === cu.company_id);
            return (
              <button key={cu.id} onClick={() => selectCompany(cu)}
                className="bg-white rounded-xl border p-5 text-left hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 group-hover:text-blue-700 truncate">{cu.name}</h3>
                    {comp && <p className="text-[10px] text-gray-400">{comp.short_name || ''}{comp.tax_code ? ` · MST: ${comp.tax_code}` : ''}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400 shrink-0" />
                </div>
              </button>
            );
          })}
          {divCompanyUnits.length === 0 && (
            <div className="col-span-full text-center py-10">
              <Building2 className="h-10 w-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-500">Khối "{selDivision.name}" chưa có Công ty</p>
              <p className="text-xs text-gray-400 mt-1">Tạo Công ty và gán vào Khối này</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 3: Danh sách dự án mẫu ═══ */}
      {selCompany && (
        <div className="space-y-4">
          {/* Company stages */}
          {companyStages.length > 0 && (
            <div className="bg-white rounded-xl border p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Quy trình của {selCompany.name}</h3>
              <div className="flex flex-wrap gap-1.5">
                {companyStages.filter(s => s.is_active).map((s, i) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: s.color + '40', backgroundColor: s.color + '10', color: s.color }}>
                    <span className="w-4 h-4 rounded-full bg-white flex items-center justify-center text-[9px] font-bold" style={{ color: s.color }}>{i + 1}</span>
                    {s.icon && <span>{s.icon.charCodeAt(0) > 127 ? s.icon : '📋'}</span>}
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Template sets header */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">{tplSets.length} dự án mẫu</p>
            <button onClick={() => setShowCreate(true)}
              className="h-8 px-3 bg-indigo-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-indigo-700 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Tạo dự án mẫu
            </button>
          </div>

          {/* Template sets list */}
          {loadingSets ? (
            <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full" /></div>
          ) : (
            <div className="space-y-2">
              {tplSets.map((s, idx) => (
                <div key={s.id} className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow group">
                  <div className="flex items-center gap-3">
                    {/* Number badge */}
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                      <span className="text-lg font-bold text-indigo-600">{idx + 1}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-gray-900">{s.name}</h3>
                        {s.is_default && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Star className="h-2.5 w-2.5" /> Mặc định</span>}
                        {s.project_type && <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{s.project_type}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                        <span>{s.task_count || 0} nhiệm vụ</span>
                        {s.created_by_user && <span>bởi {s.created_by_user.full_name}</span>}
                        <span>{new Date(s.created_at).toLocaleDateString('vi')}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!s.is_default && (
                        <button onClick={() => setDefault(s.id)} className="w-7 h-7 rounded-lg hover:bg-amber-50 flex items-center justify-center text-gray-400 hover:text-amber-600 cursor-pointer" title="Đặt mặc định">
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => cloneSet(s.id)} className="w-7 h-7 rounded-lg hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-600 cursor-pointer" title="Nhân bản">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => navigate(`/template-sets/${s.id}`)} className="w-7 h-7 rounded-lg hover:bg-indigo-50 flex items-center justify-center text-gray-400 hover:text-indigo-600 cursor-pointer" title="Sửa nội dung">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteSet(s.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer" title="Xóa">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button onClick={() => navigate(`/template-sets/${s.id}`)}
                      className="h-8 px-3 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-100 cursor-pointer flex items-center gap-1 shrink-0">
                      <FileText className="h-3 w-3" /> Mở
                    </button>
                  </div>
                </div>
              ))}

              {tplSets.length === 0 && (
                <div className="text-center py-10 bg-white rounded-xl border">
                  <FolderOpen className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                  <p className="text-sm text-gray-500">Chưa có dự án mẫu</p>
                  <p className="text-xs text-gray-400 mt-1">Tạo dự án mẫu đầu tiên cho {selCompany.name}</p>
                </div>
              )}
            </div>
          )}

          {/* Create modal */}
          {showCreate && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
                <h3 className="text-sm font-bold text-gray-900">Tạo dự án mẫu mới</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Tên dự án mẫu *</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Dự án Biệt thự" autoFocus />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600 block mb-1">Loại dự án</label>
                    <input value={newType} onChange={e => setNewType(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Biệt thự, Chung cư, Nhà phố..." />
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
                    <p>📍 Khối: <strong className="text-purple-600">{selDivision?.name}</strong></p>
                    <p>🏢 Công ty: <strong className="text-blue-600">{selCompany?.name}</strong></p>
                    <p>📋 Quy trình: <strong>{companyStages.filter(s => s.is_active).length} bước</strong></p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => { setShowCreate(false); setNewName(''); setNewType(''); }} className="h-8 px-3 border rounded-lg text-xs cursor-pointer">Hủy</button>
                  <button onClick={createSet} disabled={saving || !newName.trim()} className="h-8 px-4 bg-indigo-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50">
                    {saving ? '...' : 'Tạo'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
