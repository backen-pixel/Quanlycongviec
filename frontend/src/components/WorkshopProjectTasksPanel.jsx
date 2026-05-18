import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { taskBelongsToWorkshopModule } from '../lib/workshopTaskScope';
import { isLeadDocVisibleInModule } from '../lib/documentShareScope';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import { ClipboardList, X, ChevronDown, ChevronRight, UserPlus, Trash2, Save } from 'lucide-react';

function filterProjectTasksByWorkArea(tasks, workArea) {
  const moduleKey = workArea === 'logistics' ? 'vc' : 'sx';
  return (tasks || []).filter((t) => taskBelongsToWorkshopModule(t, moduleKey));
}

function isCrmDocSharedToWorkshop(doc) {
  return !!doc && doc.shared_to_workshop === true;
}

function userNameById(users, id) {
  if (!id) return '';
  const u = (users || []).find((x) => x.id === id);
  return u?.full_name || id.slice(0, 8);
}

export default function WorkshopProjectTasksPanel({
  project,
  workArea,
  workshopPipeline,
  tasks,
  users,
  onReload,
  crmSharedNotes = [],
  crmDealDocs = [],
}) {
  const stageSlug = workArea === 'logistics' ? 'delivery' : 'production';
  const defaultStage = (workshopPipeline || []).find((s) => s.slug === stageSlug)
    || (workshopPipeline || []).find((s) => (workArea === 'logistics' ? LOGISTICS_SLUGS : PRODUCTION_SLUGS).has(s.slug));
  const defaultStageId = defaultStage?.id || null;

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [adding, setAdding] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [descDraft, setDescDraft] = useState({});
  const [savingDesc, setSavingDesc] = useState(null);
  const [ecosystemUnits, setEcosystemUnits] = useState([]);
  const [unitPick, setUnitPick] = useState({});
  const [participantUserPick, setParticipantUserPick] = useState({});
  const [employeesByUnit, setEmployeesByUnit] = useState({});
  const [crmSharedTaskNotes, setCrmSharedTaskNotes] = useState([]);

  const filtered = filterProjectTasksByWorkArea(tasks, workArea);
  const shareMod = workArea === 'logistics' ? 'logistics' : 'production';
  const sharedCrmDocs = useMemo(
    () => (crmDealDocs || []).filter(
      (d) => isCrmDocSharedToWorkshop(d) && isLeadDocVisibleInModule(d, shareMod),
    ),
    [crmDealDocs, shareMod],
  );

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const area = workArea === 'logistics' ? 'logistics' : 'production';
      const cid = area === 'logistics'
        ? (project?.logistics_company_id || project?.logistics_company?.id || null)
        : (project?.company_id || project?.company?.id || null);
      const { data } = await api.get('/production/task-templates', {
        params: {
          workshop_area: area,
          active_only: 'true',
          ...(cid ? { company_id: cid } : {}),
        },
      });
      setTemplates(data || []);
    } catch {
      setTemplates([]);
    }
    setTemplatesLoading(false);
  }, [workArea, project?.company_id, project?.logistics_company_id, project?.company?.id, project?.logistics_company?.id]);

  useEffect(() => {
    if (showTemplatePanel) loadTemplates();
  }, [showTemplatePanel, loadTemplates]);

  useEffect(() => {
    let c = true;
    api.get('/ecosystem/units').then((r) => {
      const u = r.data?.units || r.data || [];
      if (c) setEcosystemUnits(Array.isArray(u) ? u : []);
    }).catch(() => { if (c) setEcosystemUnits([]); });
    return () => { c = false; };
  }, []);

  useEffect(() => {
    if (!project?.id) {
      setCrmSharedTaskNotes([]);
      return undefined;
    }
    let c = true;
    const shareMod = workArea === 'logistics' ? 'logistics' : 'production';
    api.get(`/crm/project/${project.id}/shared-notes`, { params: { for_module: shareMod } }).then((r) => {
      const rows = r.data;
      if (c) setCrmSharedTaskNotes(Array.isArray(rows) ? rows : []);
    }).catch(() => { if (c) setCrmSharedTaskNotes([]); });
    return () => { c = false; };
  }, [project?.id, workArea]);

  const loadEmployees = async (unitId) => {
    if (!unitId || employeesByUnit[unitId]) return;
    try {
      const { data } = await api.get('/users', { params: { company_unit_id: unitId } });
      const list = data?.users || data || [];
      setEmployeesByUnit((p) => ({ ...p, [unitId]: Array.isArray(list) ? list : [] }));
    } catch {
      setEmployeesByUnit((p) => ({ ...p, [unitId]: [] }));
    }
  };

  const applyTemplate = async (templateId) => {
    try {
      const { data } = await api.post(`/production/projects/${project.id}/tasks/from-template`, {
        template_id: templateId,
      });
      alert(`Đã tạo ${data.count} nhiệm vụ từ bộ mẫu`);
      setShowTemplatePanel(false);
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    }
  };

  const toggleStatus = async (task) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    try {
      await api.put(`/tasks/${task.id}`, { status: next });
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    }
  };

  const updateAssignee = async (taskId, assignee_id) => {
    try {
      await api.put(`/tasks/${taskId}`, { assignee_id: assignee_id || null });
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    }
  };

  const saveDescription = async (taskId) => {
    const text = (descDraft[taskId] !== undefined ? descDraft[taskId] : (filtered.find((t) => t.id === taskId)?.description)) ?? '';
    setSavingDesc(taskId);
    try {
      await api.put(`/tasks/${taskId}`, { description: text || null });
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu ghi chú');
    }
    setSavingDesc(null);
  };

  const addParticipant = async (taskId) => {
    const userId = participantUserPick[taskId];
    if (!unitPick[taskId] || !userId) {
      alert('Chọn đơn vị (ecosystem) và nhân viên');
      return;
    }
    try {
      await api.post(`/tasks/${taskId}/participants`, { user_id: userId, role: 'participant' });
      setUnitPick((p) => ({ ...p, [taskId]: '' }));
      setParticipantUserPick((p) => ({ ...p, [taskId]: '' }));
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi thêm người');
    }
  };

  const removeParticipant = async (taskId, userId) => {
    if (!confirm('Gỡ người này khỏi nhiệm vụ?')) return;
    try {
      await api.delete(`/tasks/${taskId}/participants/${userId}`);
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    }
  };

  const addTask = async () => {
    if (!title.trim()) {
      alert('Nhập tiêu đề nhiệm vụ');
      return;
    }
    if (!defaultStageId) {
      alert('Chưa có giai đoạn workflow trên hệ thống cho nhóm này (production / delivery). Kiểm tra workflow_stages.');
      return;
    }
    setAdding(true);
    try {
      await api.post('/tasks', {
        project_id: project.id,
        stage_id: defaultStageId,
        title: title.trim(),
        priority,
        task_type: 'project',
      });
      setTitle('');
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi tạo nhiệm vụ');
    }
    setAdding(false);
  };

  const openExpand = (task) => {
    if (expandedTaskId === task.id) {
      setExpandedTaskId(null);
    } else {
      setExpandedTaskId(task.id);
      setDescDraft((d) => ({ ...d, [task.id]: task.description || '' }));
      if (unitPick[task.id]) loadEmployees(unitPick[task.id]);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-xs text-gray-500">
        Nhiệm vụ giai đoạn{' '}
        <strong>{workArea === 'logistics' ? 'vận chuyển / lắp đặt' : 'sản xuất'}</strong>
        {' '}— ghi chú, phụ trách, nhiều người tham gia; nội dung CRM chia sẻ xưởng hiển thị bên dưới.
      </p>

      {(crmSharedNotes?.length > 0 || crmSharedTaskNotes.length > 0 || sharedCrmDocs.length > 0) && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 space-y-3">
          <p className="text-sm font-semibold text-violet-900">📣 Từ CRM (đã chia sẻ xưởng)</p>
          {crmSharedNotes?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-violet-700 uppercase mb-1">Hoạt động / ghi chú</p>
              <ul className="space-y-1 text-xs text-gray-800">
                {crmSharedNotes.map((n) => (
                  <li key={n.id} className="border border-violet-100 rounded-lg p-2 bg-white/80">
                    <span className="font-medium">{n.title || 'Ghi chú'}</span>
                    {n.description && <p className="text-gray-600 mt-0.5 whitespace-pre-wrap">{n.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {crmSharedTaskNotes.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-violet-700 uppercase mb-1">Nhiệm vụ CRM (ghi chú / file chia sẻ)</p>
              <ul className="space-y-2 text-xs">
                {crmSharedTaskNotes.map((t) => (
                  <li key={t.id} className="border border-violet-100 rounded-lg p-2 bg-white/80">
                    <p className="font-medium text-gray-900">{t.title}</p>
                    {t.notes && <p className="text-gray-600 mt-1 whitespace-pre-wrap">{t.notes}</p>}
                    {(t.attachments || []).length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {(t.attachments || []).map((a) => {
                          const open = a.file_url ? getFileOpenAnchorProps(a.file_url, { fileName: a.file_name || a.name }) : null;
                          if (!open) return null;
                          return (
                            <li key={a.id}>
                              <a {...open} className="text-blue-600 hover:underline">
                                {a.file_name || a.name || 'Tệp'}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sharedCrmDocs.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-violet-700 uppercase mb-1">Tài liệu deal</p>
              <ul className="space-y-1">
                {sharedCrmDocs.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2 text-xs">
                    <span className="truncate flex-1">{doc.name || doc.file_name}</span>
                    {doc.file_url && (() => {
                      const open = getFileOpenAnchorProps(doc.file_url, { fileName: doc.file_name });
                      return open ? <a {...open} className="text-blue-600 shrink-0">Mở</a> : null;
                    })()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowTemplatePanel((s) => !s)}
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border transition-colors ${
            showTemplatePanel
              ? 'bg-amber-100 border-amber-300 text-amber-900'
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Bộ nhiệm vụ mẫu
        </button>
        <Link
          to="/sx/task-templates"
          className="text-xs font-medium text-teal-700 hover:text-teal-900 underline-offset-2 hover:underline"
        >
          Cấu hình bộ mẫu xưởng
        </Link>
      </div>
      {showTemplatePanel && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-950 flex items-center gap-1.5">
              📋 Gắn bộ nhiệm vụ mẫu ({workArea === 'logistics' ? 'VC & lắp đặt' : 'Sản xuất'})
            </p>
            <button type="button" onClick={() => setShowTemplatePanel(false)} className="p-1 rounded hover:bg-amber-100 text-amber-800" aria-label="Đóng">
              <X className="h-4 w-4" />
            </button>
          </div>
          {templatesLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin h-6 w-6 border-2 border-amber-600 border-t-transparent rounded-full" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-amber-900/80">
              Chưa có bộ mẫu. <Link to="/sx/task-templates" className="font-medium underline">Tạo bộ mẫu</Link>
            </p>
          ) : (
            <ul className="space-y-2 max-h-56 overflow-y-auto">
              {templates.map((tpl) => (
                <li key={tpl.id} className="flex items-center justify-between gap-2 bg-white/80 border border-amber-100 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{tpl.name}</p>
                    <p className="text-[10px] text-gray-500">{(tpl.items || []).length} nhiệm vụ trong mẫu</p>
                  </div>
                  <button type="button" onClick={() => applyTemplate(tpl.id)} className="shrink-0 h-8 px-3 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700">
                    Gắn
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end p-4 bg-gray-50 rounded-xl border border-gray-100">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Thêm nhiệm vụ</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm mt-1"
            placeholder="Tiêu đề..."
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Ưu tiên</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9 px-2 border border-gray-200 rounded-lg text-sm mt-1 block bg-white">
            <option value="low">Thấp</option>
            <option value="medium">Trung bình</option>
            <option value="high">Cao</option>
          </select>
        </div>
        <button type="button" onClick={addTask} disabled={adding || !defaultStageId} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {adding ? '…' : '+ Thêm'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          Chưa có nhiệm vụ trong nhóm này
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const parts = task.task_participants || [];
            const partIds = new Set(parts.map((p) => p.user_id));
            const open = expandedTaskId === task.id;
            const empList = (employeesByUnit[unitPick[task.id]] || []).filter((u) => !partIds.has(u.id));
            return (
              <div key={task.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                <div className="flex items-start gap-2 p-3">
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    onChange={() => toggleStatus(task)}
                    className="mt-1 accent-blue-600 cursor-pointer"
                  />
                  <button type="button" onClick={() => openExpand(task)} className="mt-0.5 text-gray-400 hover:text-gray-600">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {task.stage?.name || task.stage?.slug || '—'} · Phụ trách: {task.assignee?.full_name || 'Chưa giao'}
                      {parts.length > 0 && ` · +${parts.length} tham gia`}
                    </p>
                    {(task.checklists || []).length > 0 && (
                      <p className="text-[10px] text-emerald-600 mt-1">
                        Checklist: {(task.checklists || []).filter((c) => c.is_completed).length}/{(task.checklists || []).length} xong
                      </p>
                    )}
                  </div>
                  <select
                    value={task.assignee_id || ''}
                    onChange={(e) => updateAssignee(task.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg h-8 px-1 max-w-[140px] bg-white shrink-0"
                  >
                    <option value="">— Phụ trách —</option>
                    {(users || []).map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
                {open && (
                  <div className="px-3 pb-3 pt-0 border-t border-gray-100 space-y-3 bg-slate-50/50">
                    {task.metadata?.workshop_template_item_id && (
                      <div className="rounded-lg border border-teal-200 bg-teal-50/90 px-3 py-2">
                        <p className="text-[10px] font-bold text-teal-900 uppercase tracking-wide">Lên kế hoạch thực hiện</p>
                        <p className="text-xs text-teal-950 mt-1">
                          {task.due_date ? (
                            <>
                              Hạn hiện tại:{' '}
                              <strong>{new Date(task.due_date).toLocaleString('vi-VN')}</strong>
                            </>
                          ) : (
                            <span className="text-teal-800/95">
                              Chưa có ngày hẹn — nhân viên tự đặt trên nhiệm vụ (hệ thống không tự gen từ bộ mẫu).
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase">Ghi chú (mô tả nhiệm vụ)</label>
                      <textarea
                        value={descDraft[task.id] !== undefined ? descDraft[task.id] : (task.description || '')}
                        onChange={(e) => setDescDraft((d) => ({ ...d, [task.id]: e.target.value }))}
                        rows={3}
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                        placeholder="Ghi chú nội dung, hướng dẫn thực hiện…"
                      />
                      <button
                        type="button"
                        onClick={() => saveDescription(task.id)}
                        disabled={savingDesc === task.id}
                        className="mt-1 h-8 px-3 rounded-lg bg-sky-600 text-white text-xs font-medium inline-flex items-center gap-1 hover:bg-sky-700 disabled:opacity-50"
                      >
                        <Save className="h-3 w-3" />
                        {savingDesc === task.id ? '…' : 'Lưu ghi chú'}
                      </button>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
                        <UserPlus className="h-3 w-3" />
                        Người tham gia (theo đơn vị / công ty)
                      </p>
                      {parts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {parts.map((p) => (
                            <span key={p.user_id} className="inline-flex items-center gap-1 text-[11px] bg-white border rounded-full px-2 py-0.5">
                              {userNameById(users, p.user_id)}
                              <button type="button" onClick={() => removeParticipant(task.id, p.user_id)} className="text-red-500 hover:text-red-700">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 items-end">
                        <div>
                          <label className="text-[10px] text-gray-500 block">Đơn vị (ecosystem)</label>
                          <select
                            value={unitPick[task.id] || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setUnitPick((x) => ({ ...x, [task.id]: v }));
                              if (v) loadEmployees(v);
                            }}
                            className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white max-w-[200px]"
                          >
                            <option value="">— Chọn —</option>
                            {ecosystemUnits.map((unit) => (
                              <option key={unit.id} value={unit.id}>{unit.name || unit.short_name || unit.id}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 block">Nhân viên</label>
                          <select
                            value={participantUserPick[task.id] || ''}
                            onChange={(e) => setParticipantUserPick((x) => ({ ...x, [task.id]: e.target.value }))}
                            className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white max-w-[200px]"
                          >
                            <option value="">— Chọn —</option>
                            {empList.map((u) => (
                              <option key={u.id} value={u.id}>{u.full_name}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => addParticipant(task.id)}
                          className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-medium"
                        >
                          Thêm người
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
