import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { compressImage } from '../lib/compressImage';
import { taskBelongsToWorkshopModule, taskBelongsToVcSubTab, SX_STAGE_SLUGS, VC_STAGE_SLUGS } from '../lib/workshopTaskScope';
import { isLeadDocVisibleInModule } from '../lib/documentShareScope';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import { FilePreviewOpenLink } from '../context/FilePreviewContext';
import { AttachmentFileIcon, inferAttachmentDocType, TASK_ATTACHMENT_FILE_ACCEPT } from '../lib/attachmentFileIcon';
import { isInstallVcStage } from '../lib/managementDashboardUtils';
import { formatDateTime, PRIORITY_LABELS, TASK_PRIORITY_COLORS as PRIORITY_COLORS } from '../lib/utils';
import UploadProgressBubble from './UploadProgressBubble';
import { mergeUploadProgressState, uploadSingleFileWithProgress, formatUploadProgressMeta } from '../lib/uploadProgressEta';
import {
  ClipboardList, X, ChevronDown, ChevronRight, UserPlus, Trash2, Save,
  Circle, CheckCircle2, Clock, Calendar, ListChecks, Plus, User, List,
  Edit3, Paperclip, FileUp, FileText, Lock, CheckSquare, Square,
} from 'lucide-react';

const STATUS_ICONS = {
  todo: Circle,
  pending: Circle,
  in_progress: Clock,
  done: CheckCircle2,
  completed: CheckCircle2,
};

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

function isTaskDone(task) {
  const s = String(task?.status || '').toLowerCase();
  return s === 'done' || s === 'completed';
}

/** Gán nhiệm vụ vào cột pipeline VC (giống CRMTasksTab.resolveVcTaskPipelineStageId). */
function resolveVcTaskPipelineStageId(task, vcStages, templates = []) {
  const stages = vcStages || [];
  if (!stages.length) return null;
  const validIds = new Set(stages.map((s) => String(s.id)));
  const meta = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const findByBucket = (pred) => stages.find((s) => pred(String(s.bucket_slug || '').toLowerCase(), String(s.name || '').toLowerCase()));

  // 1) Cột gắn trên bộ mẫu (đúng VC/LĐ)
  const tplId = meta.workshop_template_id;
  if (tplId && templates?.length) {
    const tpl = templates.find((t) => String(t.id) === String(tplId));
    const sid = tpl?.logistics_stage_id;
    if (sid && validIds.has(String(sid))) return sid;
  }

  // 2) Theo tiêu đề / slug giai đoạn — trước metadata cũ (có thể sai cột khi apply)
  const slug = String(task?.stage?.slug || task?.stage_slug || '').trim();
  const wsSlug = String(meta.guessed_stage_slug || slug.replace(/^vc_ws_/, '') || '').toLowerCase();
  const title = String(task?.title || '').toLowerCase();

  if (wsSlug === 'delivery_pending' || wsSlug === 'delivery-pending'
    || title.includes('chốt checklist') || title.includes('địa chỉ') || title.includes('chứng từ')
    || title.includes('thanh toán') || title.includes('phiếu giao')) {
    const col = findByBucket((b, n) => b === 'delivery_pending' || n.includes('chờ vận'));
    if (col?.id) return col.id;
  }
  if (wsSlug === 'installation' || wsSlug === 'installing'
    || title.includes('lắp') || title.includes('nghiệm thu') || title.includes('thi công')
    || title.includes('khảo sát') || title.includes('vận hành') || title.includes('dụng cụ')) {
    const col = findByBucket((b, n) => n.includes('lắp đặt') || b === 'installation');
    if (col?.id) return col.id;
  }
  if (wsSlug === 'completed') {
    const col = findByBucket((b, n) => b === 'completed' || n.includes('hoàn thành'));
    if (col?.id) return col.id;
  }
  if (wsSlug === 'shipping' || wsSlug === 'delivery'
    || title.includes('đang vận') || title.includes('giao hàng')) {
    const col = findByBucket((b, n) => n.includes('đang vận') || (n.includes('vận chuyển') && !n.includes('chờ') && b !== 'delivery_pending'));
    if (col?.id) return col.id;
  }

  // 3) Metadata / cột lưu trên task
  const pid = task?.logistics_pipeline_stage_id || meta.logistics_pipeline_stage_id;
  if (pid && validIds.has(String(pid))) return pid;

  return null;
}

function resolveSxTaskPipelineStageId(task, sxStages) {
  const stages = sxStages || [];
  if (!stages.length) return null;
  const validIds = new Set(stages.map((s) => String(s.id)));
  const pid = task?.production_stage_id || task?.production_pipeline_stage_id
    || task?.metadata?.production_pipeline_stage_id;
  if (pid && validIds.has(String(pid))) return pid;
  const slug = String(task?.stage?.slug || task?.stage_slug || '').toLowerCase();
  const hit = stages.find((s) => String(s.slug || '').toLowerCase() === slug
    || String(s.workflow_stage?.slug || '').toLowerCase() === slug);
  if (hit?.id) return hit.id;
  return stages[0]?.id || null;
}

function groupTasksByTemplateBundle(stageTasks, templates) {
  const byId = new Map((templates || []).map((t) => [String(t.id), t]));
  const groups = new Map();
  const orphans = [];
  (stageTasks || []).forEach((task) => {
    const tid = task?.metadata?.workshop_template_id;
    const tpl = tid ? byId.get(String(tid)) : null;
    if (!tpl && !tid) {
      orphans.push(task);
      return;
    }
    const key = String(tid || 'unknown');
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: tpl?.name || 'Bộ mẫu',
        tasks: [],
        tpl: tpl || null,
        isDefault: !!tpl?.is_default,
      });
    }
    groups.get(key).tasks.push(task);
  });
  const ordered = [...groups.values()];
  if (orphans.length) {
    ordered.push({ key: 'orphan', label: 'Nhiệm vụ khác', tasks: orphans, tpl: null });
  }
  if (!ordered.length && (stageTasks || []).length) {
    return [{ key: 'ungrouped', label: null, tasks: stageTasks, tpl: null }];
  }
  return ordered;
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
  /** 'shipping' | 'install' | 'all' — đồng bộ URL / dashboard */
  initialVcAreaTab = null,
  onVcAreaTabChange = null,
}) {
  const stageSlug = workArea === 'logistics' ? 'delivery' : 'production';
  const defaultStage = (workshopPipeline || []).find((s) => s.slug === stageSlug)
    || (workshopPipeline || []).find((s) => (workArea === 'logistics' ? VC_STAGE_SLUGS : SX_STAGE_SLUGS).has(s.slug));
  const defaultStageId = defaultStage?.id || null;

  const inferInitialVcTab = () => {
    if (initialVcAreaTab === 'shipping' || initialVcAreaTab === 'install' || initialVcAreaTab === 'all') {
      return initialVcAreaTab;
    }
    if (workArea !== 'logistics') return 'all';
    const colId = project?.vc_kanban_column_id;
    const cols = Array.isArray(workshopPipeline) ? workshopPipeline : [];
    const col = cols.find((s) => String(s.id) === String(colId));
    if (col && isInstallVcStage(col)) return 'install';
    return 'shipping';
  };

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [adding, setAdding] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [expandedStages, setExpandedStages] = useState({});
  const [vcAreaTab, setVcAreaTab] = useState(inferInitialVcTab); // all | shipping | install
  const [pipelineColumns, setPipelineColumns] = useState([]);
  const [showAddStageId, setShowAddStageId] = useState(null);
  const [editingDueId, setEditingDueId] = useState(null);
  const [assignOpenId, setAssignOpenId] = useState(null);
  const [descDraft, setDescDraft] = useState({});
  const [savingDesc, setSavingDesc] = useState(null);
  const [taskAttachments, setTaskAttachments] = useState({});
  const [uploadingTask, setUploadingTask] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editPopoverStyle, setEditPopoverStyle] = useState({});
  const editPopoverRef = useRef(null);
  const editAnchorElRef = useRef(null);
  const [ecosystemUnits, setEcosystemUnits] = useState([]);
  const [unitPick, setUnitPick] = useState({});
  const [participantUserPick, setParticipantUserPick] = useState({});
  const [employeesByUnit, setEmployeesByUnit] = useState({});
  const [crmSharedTaskNotes, setCrmSharedTaskNotes] = useState([]);

  const shareModule = workArea === 'logistics' ? 'logistics' : 'production';
  const templatesPath = workArea === 'logistics' ? '/vc/task-templates' : '/sx/task-templates';

  const setVcTab = useCallback((id) => {
    setVcAreaTab(id);
    if (typeof onVcAreaTabChange === 'function') onVcAreaTabChange(id);
  }, [onVcAreaTabChange]);

  useEffect(() => {
    if (initialVcAreaTab === 'shipping' || initialVcAreaTab === 'install' || initialVcAreaTab === 'all') {
      setVcAreaTab(initialVcAreaTab);
    }
  }, [initialVcAreaTab]);

  const stageColumns = useMemo(() => {
    if (pipelineColumns.length) return pipelineColumns;
    const fromProp = Array.isArray(workshopPipeline) ? workshopPipeline : [];
    if (workArea === 'logistics' && fromProp.length && (fromProp[0]?.bucket_slug != null || fromProp[0]?.name)) {
      return fromProp;
    }
    if (workArea !== 'logistics' && fromProp.length) return fromProp;
    return [];
  }, [pipelineColumns, workshopPipeline, workArea]);

  const filtered = useMemo(() => {
    let rows = filterProjectTasksByWorkArea(tasks, workArea);
    if (workArea === 'logistics' && (vcAreaTab === 'shipping' || vcAreaTab === 'install')) {
      rows = rows.filter((task) => {
        const sid = resolveVcTaskPipelineStageId(task, stageColumns, templates);
        if (sid && stageColumns.length) {
          const stage = stageColumns.find((s) => String(s.id) === String(sid));
          if (stage) {
            const install = isInstallVcStage(stage);
            return vcAreaTab === 'install' ? install : !install;
          }
        }
        return taskBelongsToVcSubTab(task, vcAreaTab, stageColumns);
      });
    }
    return [...rows].sort((a, b) => {
      const ao = Number(a.order_index) || 0;
      const bo = Number(b.order_index) || 0;
      if (ao !== bo) return ao - bo;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }, [tasks, workArea, vcAreaTab, stageColumns, templates]);

  /** Cột pipeline để accordion — ưu tiên logistics_pipeline_stages / production pipeline đã load. */

  const visibleStageColumns = useMemo(() => {
    if (workArea !== 'logistics' || vcAreaTab === 'all') return stageColumns;
    return stageColumns.filter((s) => (
      vcAreaTab === 'install' ? isInstallVcStage(s) : !isInstallVcStage(s)
    ));
  }, [stageColumns, workArea, vcAreaTab]);

  const tasksByStageId = useMemo(() => {
    const map = {};
    visibleStageColumns.forEach((s) => { map[String(s.id)] = []; });
    const other = [];
    filtered.forEach((task) => {
      const sid = workArea === 'logistics'
        ? resolveVcTaskPipelineStageId(task, stageColumns, templates)
        : resolveSxTaskPipelineStageId(task, stageColumns);
      if (sid && map[String(sid)]) map[String(sid)].push(task);
      else if (sid && visibleStageColumns.some((s) => String(s.id) === String(sid))) {
        if (!map[String(sid)]) map[String(sid)] = [];
        map[String(sid)].push(task);
      } else other.push(task);
    });
    if (other.length) map.__other__ = other;
    return map;
  }, [filtered, visibleStageColumns, stageColumns, workArea, templates]);

  const stagesToRender = useMemo(() => {
    const cols = visibleStageColumns.map((s) => ({
      id: String(s.id),
      label: s.name || s.label || 'Cột',
      icon: s.icon || '📌',
      color: s.color || (workArea === 'logistics' ? '#ea580c' : '#0f766e'),
    }));
    if (tasksByStageId.__other__?.length) {
      cols.push({ id: '__other__', label: 'Khác', icon: '📋', color: '#64748b' });
    }
    // Chỉ hiện cột có việc hoặc là cột đang chọn trên dự án
    const currentCol = project?.vc_kanban_column_id || project?.sx_kanban_column_id;
    return cols.filter((c) => (tasksByStageId[c.id]?.length || 0) > 0 || String(c.id) === String(currentCol));
  }, [visibleStageColumns, tasksByStageId, workArea, project?.vc_kanban_column_id, project?.sx_kanban_column_id]);

  const shareMod = workArea === 'logistics' ? 'logistics' : 'production';
  const sharedCrmDocs = useMemo(
    () => {
      const leadCompanyId = project?.crmDeals?.[0]?.company_id
        || project?.company_id
        || project?.company?.id
        || null;
      return (crmDealDocs || []).filter((d) => {
        // VC/LĐ: xem hết tài liệu (trừ SX + BG/HĐ). SX: chỉ tài liệu đã chia sẻ xưởng.
        if (shareMod === 'logistics') {
          return isLeadDocVisibleInModule(d, shareMod, { leadCompanyId });
        }
        return isCrmDocSharedToWorkshop(d) && isLeadDocVisibleInModule(d, shareMod, { leadCompanyId });
      });
    },
    [crmDealDocs, shareMod, project?.crmDeals, project?.company_id, project?.company?.id],
  );

  useEffect(() => {
    let cancelled = false;
    const area = workArea === 'logistics' ? 'logistics' : 'production';
    const cid = area === 'logistics'
      ? (project?.logistics_company_id || project?.logistics_company?.id || project?.company_id || null)
      : (project?.company_id || project?.company?.id || null);
    if (!cid) {
      setPipelineColumns([]);
      return undefined;
    }
    const path = area === 'logistics' ? '/logistics/pipeline-stages' : '/production/pipeline-stages';
    api.get(path, { params: { company_id: cid }, headers: { 'x-no-cache': '1' } })
      .then((r) => {
        if (cancelled) return;
        const rows = (Array.isArray(r.data) ? r.data : []).filter((s) => s.is_active !== false);
        setPipelineColumns(rows.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
      })
      .catch(() => { if (!cancelled) setPipelineColumns([]); });
    return () => { cancelled = true; };
  }, [workArea, project?.logistics_company_id, project?.logistics_company?.id, project?.company_id, project?.company?.id]);

  const resolvePipelineStageId = useCallback(async () => {
    const area = workArea === 'logistics' ? 'logistics' : 'production';
    const cid = area === 'logistics'
      ? (project?.logistics_company_id || project?.logistics_company?.id || project?.company_id || null)
      : (project?.company_id || project?.company?.id || null);
    const workflowStageId = project?.current_stage_id || null;
    if (!cid || !workflowStageId) return null;
    try {
      const path = area === 'logistics' ? '/logistics/pipeline-stages' : '/production/pipeline-stages';
      const { data } = await api.get(path, { params: { company_id: cid } });
      const rows = Array.isArray(data) ? data : [];
      const hit = rows.find((s) => String(s.workflow_stage_id) === String(workflowStageId));
      return hit?.id || null;
    } catch {
      return null;
    }
  }, [workArea, project?.company_id, project?.company?.id, project?.logistics_company_id, project?.logistics_company?.id, project?.current_stage_id]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const area = workArea === 'logistics' ? 'logistics' : 'production';
      const cid = area === 'logistics'
        ? (project?.logistics_company_id || project?.logistics_company?.id || null)
        : (project?.company_id || project?.company?.id || null);
      const stageId = await resolvePipelineStageId();
      const stageKey = area === 'logistics' ? 'logistics_stage_id' : 'production_stage_id';
      const baseParams = { workshop_area: area, active_only: 'true', ...(cid ? { company_id: cid } : {}) };

      const [allRes, scopedRes, globalRes] = await Promise.all([
        api.get('/production/task-templates', { params: baseParams }),
        stageId
          ? api.get('/production/task-templates', { params: { ...baseParams, [stageKey]: stageId } })
          : Promise.resolve({ data: [] }),
        api.get('/production/task-templates', { params: { ...baseParams, [stageKey]: 'global' } }),
      ]);
      const merged = new Map();
      [...(allRes.data || []), ...(globalRes.data || []), ...(scopedRes.data || [])].forEach((t) => {
        if (t?.id) merged.set(t.id, t);
      });
      setTemplates([...merged.values()]);
    } catch {
      setTemplates([]);
    }
    setTemplatesLoading(false);
  }, [workArea, project?.company_id, project?.logistics_company_id, project?.company?.id, project?.logistics_company?.id, resolvePipelineStageId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Mặc định mở accordion các cột có việc
  useEffect(() => {
    setExpandedStages((prev) => {
      const next = { ...prev };
      let changed = false;
      stagesToRender.forEach((s) => {
        if (next[s.id] === undefined) {
          next[s.id] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [stagesToRender]);

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
    const next = isTaskDone(task) ? 'todo' : 'done';
    try {
      await api.put(`/tasks/${task.id}`, { status: next });
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    }
  };

  const completeStageTasks = async (stageTasks, label) => {
    const pending = (stageTasks || []).filter((t) => !isTaskDone(t));
    if (!pending.length) return;
    if (!confirm(`Đánh dấu hoàn thành ${pending.length} nhiệm vụ trong «${label}»?`)) return;
    try {
      await Promise.all(pending.map((t) => api.put(`/tasks/${t.id}`, { status: 'done' })));
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa nhiệm vụ này?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi xóa');
    }
  };

  const loadAttachments = async (taskId) => {
    try {
      const { data } = await api.get(`/tasks/${taskId}/attachments`, {
        params: { for_module: shareModule },
      });
      setTaskAttachments((p) => ({ ...p, [taskId]: data?.attachments || [] }));
    } catch {
      setTaskAttachments((p) => ({ ...p, [taskId]: [] }));
    }
  };

  const uploadTaskFile = (taskId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = TASK_ATTACHMENT_FILE_ACCEPT;
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 50);
      if (!rawFiles.length) return;
      setUploadingTask(taskId);
      try {
        const imageFiles = rawFiles.filter((f) => f.type.startsWith('image/'));
        const otherFiles = rawFiles.filter((f) => !f.type.startsWith('image/'));
        const allUploaded = [];
        if (imageFiles.length) {
          const compressed = await Promise.all(imageFiles.map((f) => compressImage(f)));
          const formData = new FormData();
          compressed.forEach((f) => formData.append('files', f));
          const { data: uploadRes } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          allUploaded.push(...(uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes])));
        }
        for (const file of otherFiles) {
          setUploadProgress((p) => ({ ...p, [taskId]: { percent: 0, name: file.name, size: file.size } }));
          const isLarge = file.size > 10 * 1024 * 1024;
          const result = await uploadSingleFileWithProgress({
            file,
            endpoint: isLarge ? '/upload/stream' : '/upload/single',
            baseURL: api.defaults.baseURL,
            token: localStorage.getItem('token'),
            onProgress: (stats) => {
              setUploadProgress((p) => ({
                ...p,
                [taskId]: mergeUploadProgressState({ percent: 0, name: file.name, size: file.size }, stats),
              }));
            },
          });
          allUploaded.push(result);
        }
        setUploadProgress((p) => { const n = { ...p }; delete n[taskId]; return n; });
        if (!allUploaded.length) throw new Error('Upload không trả về file');
        await api.post(`/tasks/${taskId}/attachments/bulk`, {
          items: allUploaded.map((up) => ({
            original_name: up.original_name || up.file_name || 'File',
            file_name: up.file_name,
            file_url: up.file_url,
            file_size: up.file_size,
            mime_type: up.mime_type,
            doc_type: inferAttachmentDocType(up),
            allowed_share_modules: [shareModule],
          })),
        });
        await loadAttachments(taskId);
        onReload();
      } catch (err) {
        setUploadProgress((p) => { const n = { ...p }; delete n[taskId]; return n; });
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
      setUploadingTask(null);
    };
    input.click();
  };

  const deleteAttachment = async (taskId, attId) => {
    if (!confirm('Xóa file đính kèm này?')) return;
    try {
      await api.delete(`/tasks/${taskId}/attachments/${attId}`);
      await loadAttachments(taskId);
    } catch {
      alert('Lỗi xóa file');
    }
  };

  const toggleBlocksStage = async (task) => {
    try {
      await api.put(`/tasks/${task.id}`, { blocks_stage_advance: !task.blocks_stage_advance });
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || 'Không cập nhật được chặn giai đoạn');
    }
  };

  const toggleFileNoteRecorded = async (task) => {
    try {
      await api.put(`/tasks/${task.id}`, { file_note_recorded: !task.file_note_recorded });
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || 'Không cập nhật được ghi nhận file/ghi chú');
    }
  };

  const updateEditPopoverPosition = useCallback(() => {
    const rect = editAnchorElRef.current?.getBoundingClientRect?.();
    if (!rect) return;
    const pad = 8;
    const gap = 6;
    const popoverWidth = Math.min(760, window.innerWidth - pad * 2);
    let maxHeight = Math.min(640, window.innerHeight - pad * 2);
    let left = rect.right - popoverWidth;
    if (left < pad) left = Math.max(pad, rect.left);
    left = Math.min(left, window.innerWidth - popoverWidth - pad);
    let top = rect.bottom + gap;
    if (top + maxHeight > window.innerHeight - pad) {
      const aboveTop = rect.top - gap - maxHeight;
      if (aboveTop >= pad) top = aboveTop;
      else { top = pad; maxHeight = window.innerHeight - pad * 2; }
    }
    setEditPopoverStyle({ position: 'fixed', top, left, width: popoverWidth, maxHeight, zIndex: 10050 });
  }, []);

  useLayoutEffect(() => {
    if (!editingTask) return undefined;
    updateEditPopoverPosition();
    return undefined;
  }, [editingTask, updateEditPopoverPosition]);

  useEffect(() => {
    if (!editingTask) return undefined;
    const onReflow = () => updateEditPopoverPosition();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [editingTask, updateEditPopoverPosition]);

  const closeEditModal = () => {
    setEditingTask(null);
    editAnchorElRef.current = null;
    setEditPopoverStyle({});
  };

  const openEditModal = (task, anchorEl) => {
    editAnchorElRef.current = anchorEl || null;
    setEditingTask(task);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      due_date: task.due_date ? String(task.due_date).substring(0, 16) : '',
      assignee_id: task.assignee_id || '',
      blocks_stage_advance: !!task.blocks_stage_advance,
    });
    requestAnimationFrame(() => updateEditPopoverPosition());
  };

  const saveEdit = async () => {
    if (!editForm.title?.trim()) return alert('Nhập tên nhiệm vụ');
    try {
      await api.put(`/tasks/${editingTask.id}`, {
        title: editForm.title,
        description: editForm.description,
        priority: editForm.priority,
        due_date: editForm.due_date || null,
        assignee_id: editForm.assignee_id || null,
        blocks_stage_advance: !!editForm.blocks_stage_advance,
      });
      closeEditModal();
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
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
      setSavingDesc(`saved-${taskId}`);
      setTimeout(() => setSavingDesc(null), 1500);
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu ghi chú');
    setSavingDesc(null);
    }
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

  const stats = useMemo(() => {
    const rows = stagesToRender.length
      ? stagesToRender.flatMap((s) => tasksByStageId[s.id] || [])
      : filtered;
    const completed = rows.filter(isTaskDone).length;
    const total = rows.length;
    const overdue = rows.filter((t) => {
      const due = t.due_date || t.deadline;
      return due && new Date(due) < new Date() && !isTaskDone(t);
    }).length;
    return {
      completed,
      total,
      overdue,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [stagesToRender, tasksByStageId, filtered]);

  const accentBtn = workArea === 'logistics'
    ? 'bg-orange-600 hover:bg-orange-700'
    : 'bg-blue-600 hover:bg-blue-700';
  const accentRing = workArea === 'logistics' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';

  const updateDueDate = async (taskId, value) => {
    try {
      const due_date = value ? new Date(value).toISOString() : null;
      await api.put(`/tasks/${taskId}`, { due_date });
      setEditingDueId(null);
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu ngày hẹn');
    }
  };

  const openExpand = (task) => {
    if (expandedTaskId === task.id) {
      setExpandedTaskId(null);
    } else {
      setExpandedTaskId(task.id);
      setDescDraft((d) => ({ ...d, [task.id]: task.description || '' }));
      if (unitPick[task.id]) loadEmployees(unitPick[task.id]);
      loadAttachments(task.id);
    }
  };

  const toDatetimeLocal = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const renderAddForm = (pipelineStageId) => (
    <div className="bg-blue-50 rounded-lg p-3 space-y-2 mt-2 mx-1">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tên công việc..."
        className="w-full px-3 py-1.5 rounded-lg border text-sm outline-none focus:border-blue-500"
        autoFocus
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="px-2 py-1 rounded border text-xs bg-white">
          <option value="low">Thấp</option>
          <option value="medium">TB</option>
          <option value="high">Cao</option>
        </select>
        <select
          className="px-2 py-1 rounded border text-xs bg-white col-span-1 sm:col-span-2"
          defaultValue=""
          id={`ws-add-assignee-${pipelineStageId || 'x'}`}
        >
          <option value="">Giao cho...</option>
          {(users || []).map((u) => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            const sel = document.getElementById(`ws-add-assignee-${pipelineStageId || 'x'}`);
            const assignee_id = sel?.value || null;
    if (!title.trim()) {
      alert('Nhập tiêu đề nhiệm vụ');
      return;
    }
    if (!defaultStageId) {
              alert('Chưa có giai đoạn workflow trên hệ thống cho nhóm này.');
      return;
    }
    setAdding(true);
    try {
              const payload = {
        project_id: project.id,
        stage_id: defaultStageId,
        title: title.trim(),
        priority,
        task_type: 'project',
                ...(assignee_id ? { assignee_id } : {}),
              };
              if (pipelineStageId && pipelineStageId !== '__other__') {
                payload.metadata = workArea === 'logistics'
                  ? { logistics_pipeline_stage_id: pipelineStageId }
                  : { production_pipeline_stage_id: pipelineStageId };
              }
              await api.post('/tasks', payload);
      setTitle('');
              setShowAddStageId(null);
      onReload();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi tạo nhiệm vụ');
    }
    setAdding(false);
          }}
          disabled={adding || !defaultStageId}
          className={`px-3 py-1 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 ${accentBtn}`}
        >
          <Save className="h-3 w-3 inline mr-1" />Thêm
        </button>
        <button
          type="button"
          onClick={() => { setShowAddStageId(null); setTitle(''); }}
          className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs cursor-pointer hover:bg-gray-200"
        >
          Hủy
        </button>
      </div>
    </div>
  );

  const renderTaskRow = (task) => {
    const parts = task.task_participants || [];
    const partIds = new Set(parts.map((p) => p.user_id));
    const open = expandedTaskId === task.id;
    const done = isTaskDone(task);
    const StatusIcon = STATUS_ICONS[String(task.status || '').toLowerCase()] || Circle;
    const due = task.due_date || task.deadline || null;
    const isOverdue = due && new Date(due) < new Date() && !done;
    const checks = task.checklists || [];
    const checkDone = checks.filter((c) => c.is_completed).length;
    const empList = (employeesByUnit[unitPick[task.id]] || []).filter((u) => !partIds.has(u.id));
    const pri = String(task.priority || 'medium').toLowerCase();
    const assignOpen = assignOpenId === task.id;
    const atts = taskAttachments[task.id] || [];
    const hasNotes = !!(task.description || '').trim();
    const blocks = !!task.blocks_stage_advance;
    const fileNoteOk = !!task.file_note_recorded;

  return (
      <div
        key={task.id}
        className={`rounded-lg ${open ? 'bg-gray-50 border border-gray-200' : 'hover:bg-gray-50'}`}
      >
        <div className="flex items-center gap-2 py-2 px-3 group">
          <button type="button" onClick={() => toggleStatus(task)} className="cursor-pointer shrink-0" title="Đổi trạng thái">
            <StatusIcon className={`h-4 w-4 ${done ? 'text-emerald-500' : task.status === 'in_progress' ? 'text-blue-500' : 'text-gray-300'}`} />
          </button>
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => openExpand(task)}
            onDoubleClick={(e) => { e.stopPropagation(); openEditModal(task, e.currentTarget); }}
            title="Click: ghi chú & file · Double-click: chỉnh sửa"
          >
            <p
              className={`text-sm min-w-0 ${done ? 'line-through text-gray-400' : ''}`}
              style={done ? undefined : { color: '#000000' }}
            >
              {task.title}
            </p>
            {!open && hasNotes && (
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1 italic">
                💬 {(task.description || '').slice(0, 80)}
              </p>
            )}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
              {editingDueId === task.id ? (
                <span className="flex items-center gap-1">
                  <input
                    type="datetime-local"
                    autoFocus
                    defaultValue={toDatetimeLocal(due)}
                    onChange={(e) => { if (e.target.value) updateDueDate(task.id, e.target.value); }}
                    onBlur={() => setTimeout(() => setEditingDueId(null), 250)}
                    className="text-xs px-2 py-1 border border-blue-300 rounded bg-blue-50 outline-none focus:ring-1 focus:ring-blue-400 w-[185px]"
                  />
                  {due && (
                    <button type="button" onClick={() => updateDueDate(task.id, null)} className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer p-0.5" title="Xóa ngày hẹn">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ) : due ? (
                <span onClick={() => setEditingDueId(task.id)} className={`text-xs font-semibold flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-1.5 py-0.5 rounded ${isOverdue ? 'text-red-600' : 'text-gray-700'}`} title="Click để đổi ngày giờ hẹn">
                  <Calendar className="h-3.5 w-3.5" />{formatDateTime(due)}
                </span>
              ) : (
                <span onClick={() => setEditingDueId(task.id)} className="text-xs font-medium text-gray-400 flex items-center gap-1 cursor-pointer hover:text-blue-500 hover:bg-blue-50 px-1.5 py-0.5 rounded" title="Chọn ngày giờ hẹn">
                  <Calendar className="h-3.5 w-3.5" />+ Ngày hẹn
                </span>
              )}
              {task.assignee?.full_name && (
                <span className="text-[10px] text-blue-600 flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{task.assignee.full_name}</span>
              )}
              {atts.length > 0 && (
                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <Paperclip className="h-2.5 w-2.5" />{atts.length} file
                </span>
              )}
              {hasNotes && !open && (
                <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <FileText className="h-2.5 w-2.5" />Có ghi chú
                </span>
              )}
              {fileNoteOk && (
                <span
                  className="text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium border border-teal-200"
                  title="Đã ghi nhận: nhiệm vụ có file/ghi chú (không chặn chuyển cột)"
                >
                  <CheckSquare className="h-2.5 w-2.5" />Đã có file/ghi chú
                </span>
              )}
              {checks.length > 0 && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <ListChecks className="h-2.5 w-2.5" />{checkDone}/{checks.length}
                </span>
              )}
              {blocks && !done && (
                <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium border border-amber-200" title="Phải hoàn thành trước khi chuyển giai đoạn">
                  <Lock className="h-2.5 w-2.5" />Chặn chuyển giai đoạn
                </span>
              )}
              {blocks && done && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium" title="Đã hoàn thành nhiệm vụ chặn giai đoạn">
                  <Lock className="h-2.5 w-2.5" />Đã mở khóa
                </span>
              )}
            </div>
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLORS[pri] || PRIORITY_COLORS.medium}`}>
            {PRIORITY_LABELS[pri] || 'TB'}
          </span>
          <div className="flex items-center gap-0.5 shrink-0 border-l border-gray-100 pl-1.5 ml-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => toggleBlocksStage(task)}
              className={`p-1.5 rounded-md cursor-pointer ${blocks ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-gray-500 hover:text-amber-600 hover:bg-amber-50'}`}
              title={blocks ? 'Đang chặn chuyển giai đoạn — bấm để tắt' : 'Bật chặn chuyển giai đoạn'}
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleFileNoteRecorded(task)}
              className={`p-1.5 rounded-md cursor-pointer ${fileNoteOk ? 'text-teal-700 bg-teal-50 hover:bg-teal-100' : 'text-gray-500 hover:text-teal-600 hover:bg-teal-50'}`}
              title={fileNoteOk
                ? 'Đã ghi nhận có file/ghi chú — bấm để bỏ (không chặn chuyển cột)'
                : 'Tích: đã có file/ghi chú (theo dõi đủ thông tin, không chặn chuyển cột)'}
            >
              {fileNoteOk ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => openExpand(task)}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer"
              title="Ghi chú & file"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setAssignOpenId(assignOpen ? null : task.id)}
              className={`p-1.5 rounded-md cursor-pointer ${task.assignee_id ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
              title="Gán nhân viên"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => openEditModal(task, e.currentTarget)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer"
              title="Chỉnh sửa nhiệm vụ"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => deleteTask(task.id)}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
              title="Xóa nhiệm vụ"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {assignOpen && (
          <div className="px-3 pb-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <select
              value={task.assignee_id || ''}
              onChange={(e) => { updateAssignee(task.id, e.target.value); setAssignOpenId(null); }}
              className="text-xs border border-gray-200 rounded-lg h-8 px-2 flex-1 max-w-xs bg-white"
            >
              <option value="">— Phụ trách —</option>
              {(users || []).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        )}

        {open && (
          <div className="px-3 pb-3 space-y-3 border-t border-gray-200 mx-3 pt-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">📝 Ghi chú & Đính kèm ({atts.length})</label>
                <div className="flex items-center gap-1">
                  {uploadingTask === task.id ? (
                    <span className="text-[10px] text-orange-600 flex items-center gap-1 px-1.5 py-0.5">
                      <span className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full" />
                      {uploadProgress[task.id]
                        ? <span>{uploadProgress[task.id].name} — {formatUploadProgressMeta(uploadProgress[task.id])}</span>
                        : 'Đang nén ảnh...'}
                    </span>
                  ) : (
                    <button type="button" onClick={() => uploadTaskFile(task.id)} className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50">
                      <FileUp className="h-3 w-3" /> Upload file
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={descDraft[task.id] !== undefined ? descDraft[task.id] : (task.description || '')}
                onChange={(e) => setDescDraft((d) => ({ ...d, [task.id]: e.target.value }))}
                placeholder="Nhập ghi chú cho nhiệm vụ này..."
                rows={3}
                className="w-full px-3 py-2 border rounded-lg text-sm leading-relaxed outline-none focus:border-blue-400 resize-y mb-1.5"
              />
              <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                <div>
                  <label className="text-[10px] text-gray-500">Phụ trách:</label>
                  <select value={task.assignee_id || ''} onChange={(e) => updateAssignee(task.id, e.target.value)} className="ml-1 text-xs border border-gray-200 rounded px-1 py-0.5 bg-white">
                    <option value="">— Chưa giao —</option>
                    {(users || []).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => saveDescription(task.id)} disabled={savingDesc === task.id}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${savingDesc === 'saved-' + task.id ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  <Save className="h-2.5 w-2.5" />
                  {savingDesc === task.id ? 'Đang lưu...' : savingDesc === 'saved-' + task.id ? '✓ Đã lưu' : 'Lưu ghi chú'}
                </button>
              </div>
              {uploadProgress[task.id] && (
                <UploadProgressBubble
                  variant="inline"
                  fileName={uploadProgress[task.id].name}
                  fileSize={uploadProgress[task.id].size}
                  percent={uploadProgress[task.id].percent}
                  bytesPerSec={uploadProgress[task.id].bytesPerSec}
                  remainingSec={uploadProgress[task.id].remainingSec}
                />
              )}
              {atts.length > 0 && (
                <div className="space-y-1">
                  {atts.map((att) => {
                    const attOpen = att.file_url ? getFileOpenAnchorProps(att.file_url, { fileName: att.file_name }) : null;
                    const img = att.mime_type?.startsWith('image/') || att.doc_type === 'image';
                    return (
                      <div key={att.id} className="py-1.5 px-2 rounded bg-white border">
                        <div className="flex items-start gap-2">
                          <AttachmentFileIcon att={att} className="h-4 w-4 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">{att.file_name || att.original_name || 'File'}</p>
                            {att.file_url && !img && (
                              <FilePreviewOpenLink fileUrl={att.file_url} fileName={att.file_name || att.name} mimeType={att.mime_type} className="text-[10px] text-blue-600 hover:underline cursor-pointer">
                                {att.file_name || 'Xem file'}
                              </FilePreviewOpenLink>
                            )}
                          </div>
                          <button type="button" onClick={() => deleteAttachment(task.id, att.id)} className="text-[10px] font-medium text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50 cursor-pointer">Xóa</button>
                        </div>
                        {att.file_url && img && attOpen && (
                          <a {...attOpen} className="block mt-1.5 ml-5">
                            <img src={publicFileUrl(att.file_url)} alt={att.file_name} className="max-h-80 max-w-full rounded-lg border border-gray-200 object-contain" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {atts.length === 0 && <p className="text-[10px] text-gray-400 italic">Chưa có đính kèm</p>}
            </div>

            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> Người tham gia
              </p>
              {parts.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {parts.map((p) => (
                    <span key={p.user_id} className="inline-flex items-center gap-1 text-[11px] bg-white border rounded-full px-2 py-0.5">
                      {userNameById(users, p.user_id)}
                      <button type="button" onClick={() => removeParticipant(task.id, p.user_id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="text-[10px] text-gray-500 block">Đơn vị</label>
                  <select value={unitPick[task.id] || ''} onChange={(e) => { const v = e.target.value; setUnitPick((x) => ({ ...x, [task.id]: v })); if (v) loadEmployees(v); }} className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white max-w-[200px]">
                    <option value="">— Chọn —</option>
                    {ecosystemUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name || unit.short_name || unit.id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block">Nhân viên</label>
                  <select value={participantUserPick[task.id] || ''} onChange={(e) => setParticipantUserPick((x) => ({ ...x, [task.id]: e.target.value }))} className="h-8 px-2 border border-gray-200 rounded-lg text-xs bg-white max-w-[200px]">
                    <option value="">— Chọn —</option>
                    {empList.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => addParticipant(task.id)} className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-medium">Thêm người</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
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

      {/* Header giống CRM: % + Gắn mẫu + tabs VC/LĐ */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${accentRing}`}>
              {stats.percent}%
            </div>
            <div className="text-[10px] text-gray-500 leading-tight">
              <span className="font-medium" style={{ color: '#000000' }}>{stats.completed}/{stats.total}</span> xong
              {stats.overdue > 0 && <span className="text-red-600 ml-1">• {stats.overdue} quá hạn</span>}
            </div>
          </div>
          {workArea === 'logistics' && (
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
              {[
                { id: 'shipping', label: 'Vận chuyển' },
                { id: 'install', label: 'Lắp đặt' },
                { id: 'all', label: 'Tất cả' },
              ].map((tab) => (
        <button
                  key={tab.id}
          type="button"
                  onClick={() => setVcTab(tab.id)}
                  className={`h-6 px-2 rounded-md text-[10px] font-semibold cursor-pointer ${
                    vcAreaTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowTemplatePanel((p) => !p)}
            className={`h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
            showTemplatePanel
                ? (workArea === 'logistics' ? 'bg-orange-500 text-white' : 'bg-amber-500 text-white')
                : (workArea === 'logistics'
                  ? 'bg-orange-50 text-orange-800 border border-orange-300 hover:bg-orange-100'
                  : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100')
            }`}
          >
            <ClipboardList className="h-3 w-3" /> Gắn mẫu{workArea === 'logistics' ? ' VC/LĐ' : ''}
        </button>
        <Link
            to={templatesPath}
            className="h-7 px-2 rounded-lg text-[10px] font-medium flex items-center gap-1 bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
            Cấu hình
        </Link>
          <div className="w-px h-5 bg-gray-200 mx-1" />
          <button
            type="button"
            className="h-7 px-2 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer bg-blue-600 text-white"
          >
            <List className="h-3 w-3" />List
          </button>
      </div>
      </div>

      {showTemplatePanel && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              📋 Gắn bộ nhiệm vụ mẫu
            </p>
            <button type="button" onClick={() => setShowTemplatePanel(false)} className="p-1 hover:bg-amber-100 rounded cursor-pointer" aria-label="Đóng">
              <X className="h-3.5 w-3.5 text-amber-600" />
            </button>
          </div>
          {templatesLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin h-6 w-6 border-2 border-amber-600 border-t-transparent rounded-full" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-amber-900/80">
              Chưa có bộ mẫu. <Link to={templatesPath} className="font-medium underline">Tạo bộ mẫu</Link>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className="px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 hover:border-amber-400 cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  {tpl.name}
                  <span className="text-[10px] text-amber-500">({(tpl.items || []).length} việc)</span>
                  {tpl.is_default && <span className="text-[9px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full">⭐ Mặc định</span>}
                  </button>
              ))}
            </div>
          )}
        </div>
      )}

      {stats.total === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          Chưa có nhiệm vụ trong nhóm này
          {defaultStageId && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowAddStageId('__root__')}
                className="text-[10px] text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Thêm việc
              </button>
              {showAddStageId === '__root__' && renderAddForm(null)}
        </div>
          )}
        </div>
      ) : stagesToRender.length === 0 ? (
        <div className="space-y-2">
          {groupTasksByTemplateBundle(filtered, templates).map((bundle) => (
            <div key={bundle.key} className="border rounded-lg overflow-hidden">
              {bundle.label && (
                <p className="text-[10px] font-semibold text-gray-500 px-2 py-1 flex items-center gap-1.5">
                  <ListChecks className="h-3 w-3 text-amber-600" />
                  {bundle.label}
                  {bundle.isDefault && <span className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded">⭐ Mặc định</span>}
                  <span className="text-gray-400 font-normal">({bundle.tasks.length})</span>
                      </p>
                    )}
              <div className="px-2 py-1">
                {bundle.tasks.map((task) => renderTaskRow(task))}
                  </div>
            </div>
          ))}
                </div>
      ) : (
        <div className="space-y-3">
          {stagesToRender.map((stage) => {
            const stageTasks = tasksByStageId[stage.id] || [];
            const completed = stageTasks.filter(isTaskDone).length;
            const expanded = expandedStages[stage.id] !== false;
            const bundles = groupTasksByTemplateBundle(stageTasks, templates);
            const defaultTpl = templates.find((t) => (
              workArea === 'logistics'
                ? String(t.logistics_stage_id || '') === String(stage.id) && t.is_default
                : String(t.production_stage_id || '') === String(stage.id) && t.is_default
            )) || templates.find((t) => (
              workArea === 'logistics'
                ? String(t.logistics_stage_id || '') === String(stage.id)
                : String(t.production_stage_id || '') === String(stage.id)
            ));
            return (
              <div key={stage.id} className="border rounded-lg overflow-hidden">
                <div className="flex items-stretch gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => setExpandedStages((p) => ({ ...p, [stage.id]: !expanded }))}
                    className="flex flex-1 min-w-0 items-center gap-2 px-1 py-1 rounded-md hover:bg-gray-100 cursor-pointer text-left"
                  >
                    {expanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                    <span className="text-sm shrink-0">{stage.icon}</span>
                    <span className="text-sm font-semibold truncate" style={{ color: stage.color }}>{stage.label}</span>
                    {defaultTpl && (
                      <span className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0 truncate max-w-[140px]" title={`Bộ mặc định: ${defaultTpl.name}`}>
                        📋 {defaultTpl.name}{defaultTpl.is_default ? ' ⭐' : ''}
                            </span>
                          )}
                    <span className="text-[10px] text-gray-400 shrink-0">{completed}/{stageTasks.length}</span>
                    {stageTasks.length > 0 && (
                      <div className="ml-auto w-14 sm:w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${stageTasks.length ? (completed / stageTasks.length) * 100 : 0}%` }}
                        />
                      </div>
                    )}
                  </button>
                  {stageTasks.some((t) => !isTaskDone(t)) && (
                      <button
                        type="button"
                      onClick={() => completeStageTasks(stageTasks, stage.label)}
                      className="shrink-0 self-center flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1.5 rounded-md cursor-pointer"
                      title="Hoàn thành nhanh mọi việc chưa xong trong nhóm này"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Xong hết</span>
                      </button>
                  )}
                    </div>
                {expanded && (
                  <div className="px-2 py-1">
                    {bundles.map((bundle) => (
                      <div key={bundle.key} className={bundle.label ? 'mb-2' : ''}>
                        {bundle.label && (
                          <p className="text-[10px] font-semibold text-gray-500 px-2 py-1 flex items-center gap-1.5">
                            <ListChecks className="h-3 w-3 text-amber-600" />
                            {bundle.label}
                            {bundle.isDefault && <span className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded">⭐ Mặc định</span>}
                            <span className="text-gray-400 font-normal">({bundle.tasks.length})</span>
                          </p>
                        )}
                        {bundle.tasks.map((task) => renderTaskRow(task))}
                      </div>
                    ))}
                    {showAddStageId === stage.id ? (
                      renderAddForm(stage.id)
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 py-1 px-3">
                        <button
                          type="button"
                          onClick={() => { setShowAddStageId(stage.id); setTitle(''); }}
                          className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Thêm việc
                        </button>
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingTask && createPortal(
        <>
          <div className="fixed inset-0 z-[10040] bg-black/20" onClick={closeEditModal} />
          <div
            ref={editPopoverRef}
            style={editPopoverStyle}
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Sửa nhiệm vụ</h3>
              </div>
              <button type="button" onClick={closeEditModal} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Tên nhiệm vụ *</label>
                  <input
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Mô tả</label>
                  <textarea
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none resize-y min-h-[70px]"
                  />
                        </div>
                        <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Hạn hoàn thành</label>
                  <input
                    type="datetime-local"
                    value={editForm.due_date || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Người phụ trách</label>
                          <select
                    value={editForm.assignee_id || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, assignee_id: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none"
                  >
                    <option value="">— Chưa giao —</option>
                    {(users || []).map((u) => (
                              <option key={u.id} value={u.id}>{u.full_name}</option>
                            ))}
                          </select>
                        </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Độ ưu tiên</label>
                  <div className="mt-1 flex gap-2 flex-wrap">
                    {['low', 'medium', 'high', 'urgent'].map((p) => (
                        <button
                        key={p}
                          type="button"
                        onClick={() => setEditForm((f) => ({ ...f, priority: p }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                          editForm.priority === p
                            ? `${PRIORITY_COLORS[p]} border-current ring-1 ring-offset-1 ring-current`
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {PRIORITY_LABELS[p]}
                        </button>
                    ))}
                      </div>
                    </div>
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Chặn chuyển giai đoạn</label>
                  <label className="mt-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!editForm.blocks_stage_advance}
                      onChange={(e) => setEditForm((f) => ({ ...f, blocks_stage_advance: e.target.checked }))}
                      className="accent-amber-600"
                    />
                    <span className="text-xs font-medium text-amber-800">
                      ⛔ Bắt buộc hoàn thành trước khi kéo cột Kanban VC/LĐ
                    </span>
                  </label>
                  </div>
              </div>
        </div>
            <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-end gap-2 shrink-0">
              <button type="button" onClick={closeEditModal} className="h-9 px-4 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium cursor-pointer">Hủy</button>
              <button type="button" onClick={saveEdit} className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-pointer">
                <Save className="h-3.5 w-3.5" /> Lưu
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
