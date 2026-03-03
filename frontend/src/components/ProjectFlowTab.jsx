import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  ArrowRight, Building2, CheckCircle2, Circle, Clock, Play, Send,
  Plus, ChevronDown, ChevronRight, FileText, AlertTriangle, Zap
} from 'lucide-react';

const STATUS_MAP = {
  pending: { label: 'Chờ', color: 'text-gray-400', bg: 'bg-gray-100', icon: Circle },
  in_progress: { label: 'Đang thực hiện', color: 'text-blue-600', bg: 'bg-blue-100', icon: Play },
  completed: { label: 'Hoàn thành', color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle2 },
  handed_off: { label: 'Đã chuyển giao', color: 'text-purple-600', bg: 'bg-purple-100', icon: Send },
};

export default function ProjectFlowTab({ projectId }) {
  const [assignments, setAssignments] = useState([]);
  const [handoffs, setHandoffs] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [companies, setCompanies] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [showHandoff, setShowHandoff] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [flowRes, handoffRes, unitsRes] = await Promise.all([
        api.get(`/company-templates/projects/${projectId}/flow`),
        api.get(`/company-templates/projects/${projectId}/handoffs`),
        api.get('/ecosystem/units'),
      ]);
      setAssignments(flowRes.data.assignments || []);
      setHandoffs(handoffRes.data.handoffs || []);

      // Get divisions (Khối) and companies (Cty) from units
      const units = unitsRes.data.units || [];
      const divs = units.filter(u => u.level?.depth === 1);
      setDivisions(divs);

      // Group companies by division
      const compMap = {};
      units.filter(u => u.level?.depth === 2).forEach(c => {
        if (!compMap[c.parent_id]) compMap[c.parent_id] = [];
        compMap[c.parent_id].push(c);
      });
      setCompanies(compMap);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Sort assignments by order_index
  const sorted = [...assignments].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  // Calculate progress
  const total = sorted.length;
  const done = sorted.filter(a => ['completed', 'handed_off'].includes(a.status)).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  // Find current active phase
  const currentPhase = sorted.find(a => a.status === 'in_progress');

  if (loading) return <div className="flex items-center justify-center py-10"><div className="animate-spin h-6 w-6 border-2 border-blue-200 border-t-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {total > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-gray-900">Tiến độ luồng dự án</p>
            <span className="text-sm font-bold" style={{ color: progress === 100 ? '#16a34a' : '#2563eb' }}>{progress}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#16a34a' : '#3b82f6' }} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
            <span>{done}/{total} Khối hoàn thành</span>
            {currentPhase && <span className="text-blue-600 font-medium">▶ {currentPhase.division?.name}</span>}
          </div>
        </div>
      )}

      {/* Flow timeline */}
      <div className="space-y-0">
        {sorted.map((a, i) => {
          const st = STATUS_MAP[a.status] || STATUS_MAP.pending;
          const Icon = st.icon;
          const isLast = i === sorted.length - 1;
          const canHandoff = a.status === 'completed' && !isLast;
          const nextAssignment = sorted[i + 1];
          const relevantHandoff = handoffs.find(h => h.from_division_id === a.division_unit_id);

          return (
            <div key={a.id}>
              {/* Phase card */}
              <div className="flex gap-3">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-xl ${st.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-5 w-5 ${st.color}`} />
                  </div>
                  {!isLast && <div className="w-px flex-1 min-h-[20px] bg-gray-200" />}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow"
                    style={{ borderLeftWidth: 4, borderLeftColor: a.division?.level?.color || a.division?.stage_group?.color || '#e5e7eb' }}>

                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{a.division?.level?.icon || a.division?.stage_group?.icon || '📋'}</span>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">{a.division?.name || 'Khối'}</h3>
                          {a.division?.stage_group && <p className="text-[10px]" style={{ color: a.division.stage_group.color }}>{a.division.stage_group.icon} {a.division.stage_group.name}</p>}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                    </div>

                    {/* Company assignment */}
                    <div className="mt-3 flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                      <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                      {a.company ? (
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-900">{a.company.name}</p>
                          {a.company.short_name && <p className="text-[9px] text-gray-400">{a.company.short_name}{a.company.code ? ` · ${a.company.code}` : ''}</p>}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Chưa gán công ty</p>
                      )}
                      {a.template_set && (
                        <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                          <FileText className="h-2.5 w-2.5" /> {a.template_set.name}
                        </span>
                      )}
                    </div>

                    {/* Timestamps */}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                      {a.started_at && <span>Bắt đầu: {new Date(a.started_at).toLocaleDateString('vi')}</span>}
                      {a.completed_at && <span>Hoàn thành: {new Date(a.completed_at).toLocaleDateString('vi')}</span>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {a.status === 'pending' && a.template_set_id && (
                        <button onClick={async () => {
                          if (!confirm('Tạo task từ bộ NV mẫu? Task sẽ được phân công PB/Team/NV theo template.')) return;
                          try {
                            const r = await api.post(`/company-templates/projects/${projectId}/generate-from-template`, { template_set_id: a.template_set_id, assignment_id: a.id });
                            alert(`✅ Đã tạo ${r.data.count} task từ bộ mẫu`);
                            load();
                          } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
                        }}
                          className="h-7 px-3 text-[10px] bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700 flex items-center gap-1">
                          <Zap className="h-3 w-3" /> Tạo task từ mẫu
                        </button>
                      )}
                      {a.status === 'pending' && (
                        <button onClick={async () => { try { await api.put(`/company-templates/project-assignments/${a.id}`, { status: 'in_progress' }); load(); } catch {} }}
                          className="h-7 px-3 text-[10px] bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 flex items-center gap-1">
                          <Play className="h-3 w-3" /> Bắt đầu
                        </button>
                      )}
                      {a.status === 'in_progress' && (
                        <button onClick={async () => { try { await api.put(`/company-templates/project-assignments/${a.id}`, { status: 'completed' }); load(); } catch {} }}
                          className="h-7 px-3 text-[10px] bg-green-600 text-white rounded-lg cursor-pointer hover:bg-green-700 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Hoàn thành
                        </button>
                      )}
                      {canHandoff && (
                        <button onClick={() => setShowHandoff({ from: a, to: nextAssignment })}
                          className="h-7 px-3 text-[10px] bg-purple-600 text-white rounded-lg cursor-pointer hover:bg-purple-700 flex items-center gap-1">
                          <Send className="h-3 w-3" /> Chuyển giao → {nextAssignment?.division?.name}
                        </button>
                      )}
                    </div>

                    {/* Handoff notes */}
                    {a.handoff_notes && <div className="mt-2 bg-purple-50 rounded-lg p-2 text-xs text-purple-800">📝 {a.handoff_notes}</div>}
                  </div>

                  {/* Handoff record */}
                  {relevantHandoff && (
                    <div className="mt-1 ml-4 flex items-center gap-2 text-[10px] text-purple-600">
                      <Send className="h-3 w-3" />
                      <span>Chuyển giao bởi {relevantHandoff.creator?.full_name} · {new Date(relevantHandoff.created_at).toLocaleString('vi')}</span>
                      {relevantHandoff.summary && <span className="text-purple-400">— {relevantHandoff.summary}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Arrow between phases */}
              {!isLast && sorted.length > 1 && (
                <div className="flex items-center gap-3 py-0">
                  <div className="w-10 flex justify-center"><ArrowRight className="h-3 w-3 text-gray-300 rotate-90" /></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assign company button */}
      <button onClick={() => setShowAssign(true)}
        className="w-full h-10 border-2 border-dashed border-gray-300 rounded-xl text-xs text-gray-500 flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
        <Plus className="h-4 w-4" /> Thêm Khối vào luồng dự án
      </button>

      {/* Empty state */}
      {total === 0 && (
        <div className="text-center py-8">
          <Zap className="h-10 w-10 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">Chưa thiết lập luồng dự án</p>
          <p className="text-xs text-gray-400 mt-1">Bấm "Thêm Khối" để gán Công ty cho từng Khối trong quy trình</p>
        </div>
      )}

      {/* Assign modal */}
      {showAssign && <AssignModal projectId={projectId} divisions={divisions} companies={companies} existing={assignments} onDone={() => { load(); setShowAssign(false); }} onClose={() => setShowAssign(false)} />}

      {/* Handoff modal */}
      {showHandoff && <HandoffModal projectId={projectId} from={showHandoff.from} to={showHandoff.to} onDone={() => { load(); setShowHandoff(null); }} onClose={() => setShowHandoff(null)} />}
    </div>
  );
}

/* ═══ ASSIGN MODAL ═══ */
function AssignModal({ projectId, divisions, companies, existing, onDone, onClose }) {
  const [divId, setDivId] = useState('');
  const [compId, setCompId] = useState('');
  const [tplSetId, setTplSetId] = useState('');
  const [tplSets, setTplSets] = useState([]);
  const [saving, setSaving] = useState(false);

  const existingDivIds = existing.map(a => a.division_unit_id);
  const availDivs = divisions.filter(d => !existingDivIds.includes(d.id));
  const divCompanies = divId ? (companies[divId] || []) : [];

  // Load template sets when company selected
  useEffect(() => {
    if (compId) {
      api.get(`/company-templates/units/${compId}/template-sets`).then(r => {
        setTplSets(r.data.sets || []);
        const def = (r.data.sets || []).find(s => s.is_default);
        if (def) setTplSetId(def.id);
      }).catch(() => {});
    } else { setTplSets([]); setTplSetId(''); }
  }, [compId]);

  const save = async () => {
    if (!divId || !compId) return alert('Chọn Khối và Công ty');
    setSaving(true);
    try {
      await api.post(`/company-templates/projects/${projectId}/assign-company`, {
        division_unit_id: divId, company_unit_id: compId,
        template_set_id: tplSetId || null, order_index: existing.length,
      });
      onDone();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900">Thêm Khối vào luồng dự án</h3>

        <div className="space-y-3">
          <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Khối *</label>
            <select value={divId} onChange={e => { setDivId(e.target.value); setCompId(''); }} className="w-full h-9 px-3 border rounded-lg text-sm">
              <option value="">Chọn Khối...</option>
              {availDivs.map(d => <option key={d.id} value={d.id}>{d.level?.icon} {d.name}</option>)}
            </select>
          </div>

          {divId && (
            <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Công ty *</label>
              <select value={compId} onChange={e => setCompId(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm">
                <option value="">Chọn Công ty trong Khối...</option>
                {divCompanies.map(c => <option key={c.id} value={c.id}>{c.name}{c.short_name ? ` (${c.short_name})` : ''}</option>)}
              </select>
              {divCompanies.length === 0 && <p className="text-[10px] text-amber-600 mt-1">⚠️ Khối này chưa có Công ty con</p>}
            </div>
          )}

          {compId && tplSets.length > 0 && (
            <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Bộ NV mẫu</label>
              <select value={tplSetId} onChange={e => setTplSetId(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm">
                <option value="">Không dùng mẫu</option>
                {tplSets.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' ★' : ''} ({s.task_count} task)</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-8 px-3 border rounded-lg text-xs cursor-pointer">Hủy</button>
          <button onClick={save} disabled={saving || !divId || !compId} className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50">{saving ? '...' : 'Thêm vào luồng'}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══ HANDOFF MODAL ═══ */
function HandoffModal({ projectId, from, to, onDone, onClose }) {
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/company-templates/projects/${projectId}/handoff`, {
        from_division_id: from.division_unit_id,
        to_division_id: to.division_unit_id,
        summary: summary || null, notes: notes || null,
      });
      onDone();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Send className="h-4 w-4 text-purple-600" /> Chuyển giao</h3>

        <div className="flex items-center gap-2 bg-purple-50 rounded-xl p-3">
          <div className="text-center flex-1">
            <p className="text-lg">{from.division?.level?.icon || '📋'}</p>
            <p className="text-xs font-bold">{from.division?.name}</p>
            <p className="text-[9px] text-green-600">✓ Hoàn thành</p>
          </div>
          <ArrowRight className="h-5 w-5 text-purple-400 shrink-0" />
          <div className="text-center flex-1">
            <p className="text-lg">{to.division?.level?.icon || '📋'}</p>
            <p className="text-xs font-bold">{to.division?.name}</p>
            <p className="text-[9px] text-gray-400">Tiếp nhận</p>
          </div>
        </div>

        <div className="space-y-3">
          <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Tóm tắt</label><input value={summary} onChange={e => setSummary(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Đã hoàn thành thiết kế + báo giá" /></div>
          <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Ghi chú</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full min-h-[60px] px-3 py-2 border rounded-lg text-sm resize-none" placeholder="Lưu ý cho Khối tiếp theo..." /></div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="h-8 px-3 border rounded-lg text-xs cursor-pointer">Hủy</button>
          <button onClick={save} disabled={saving} className="h-8 px-4 bg-purple-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5">{saving ? '...' : <><Send className="h-3.5 w-3.5" /> Chuyển giao</>}</button>
        </div>
      </div>
    </div>
  );
}
