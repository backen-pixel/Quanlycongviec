import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../lib/api';
import { formatDate, formatVND } from '../lib/utils';
import {
  Plus, CheckCircle2, Circle, Clock, User, Eye, Trash2, ChevronDown, ChevronRight,
  Calendar, List, Users, Target, AlertTriangle, X, Save, ListChecks, ClipboardList,
  Paperclip, FileUp, MessageSquare, FileText, Image as ImageIcon, Share2, Lock, Film,
  FileSpreadsheet, Edit3,
} from 'lucide-react';
import ExcelQuotationImport from './ExcelQuotationImport';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';

const LEAD_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', icon: '💬', color: '#3B82F6' },
];
const DEAL_STAGES = [
  { slug: 'deal_new', label: 'Nhiệm vụ Deal mới', icon: '📋', color: '#3B82F6' },
  { slug: 'deal_quote_contract', label: 'Báo giá & Hợp đồng', icon: '📄', color: '#8B5CF6' },
  { slug: 'deal_ordering', label: 'Tiến hành đặt hàng', icon: '🛒', color: '#F59E0B' },
  { slug: 'deal_schedule', label: 'Hẹn ngày lắp đặt', icon: '📅', color: '#10B981' },
  { slug: 'deal_shipping', label: 'Đặt Vận chuyển', icon: '🚛', color: '#EF4444' },
  { slug: 'deal_notes', label: 'Ghi chú khác', icon: '📝', color: '#6B7280' },
];
const SX_ORDER_STAGES = [
  { slug: 'sx_tiep_nhan', label: 'Tiếp nhận', icon: '1️⃣', color: '#2563EB' },
  { slug: 'sx_thiet_ke_ke_hoach', label: 'Thiết kế và lên kế hoạch', icon: '2️⃣', color: '#7C3AED' },
  { slug: 'sx_kiem_tra_cheo', label: 'Kiểm tra chéo', icon: '3️⃣', color: '#0EA5E9' },
  { slug: 'sx_vat_tu', label: 'Vật tư', icon: '4️⃣', color: '#D97706' },
  { slug: 'sx_san_xuat_thung', label: 'Sản xuất thùng', icon: '5️⃣', color: '#059669' },
  { slug: 'sx_san_xuat_alu', label: 'Sản xuất alu', icon: '6️⃣', color: '#0891B2' },
  { slug: 'sx_hoan_thien', label: 'Hoàn thiện', icon: '7️⃣', color: '#16A34A' },
  { slug: 'sx_dong_goi', label: 'Đóng gói', icon: '8️⃣', color: '#EA580C' },
  { slug: 'sx_giao_hang', label: 'Giao hàng', icon: '9️⃣', color: '#DC2626' },
];
const ALL_STAGES = [...LEAD_STAGES, ...DEAL_STAGES];
const PRIORITY_COLORS = { low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700', high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700' };
const PRIORITY_LABELS = { low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Gấp' };
const STATUS_ICONS = { pending: Circle, in_progress: Clock, completed: CheckCircle2 };

export default function CRMTasksTab({
  leadId,
  leadType = 'lead',
  users = [],
  taskScope = 'all',
  onArtifactsSynced = null,
  refreshKey = null,
  /** Công ty xưởng đã gắn với deal (sx_template_company_id) — gửi khi Gen bộ nhiệm vụ SX */
  sxTemplateCompanyId = null,
}) {
  const [tasks, setTasks] = useState([]);
  const isSxStageSlug = useMemo(() => (slug) => String(slug || '').startsWith('sx_'), []);
  const hasSxTasks = useMemo(() => tasks.some((t) => isSxStageSlug(t.stage_slug)), [tasks, isSxStageSlug]);
  const hasCrmDealTasks = useMemo(
    () => tasks.some((t) => !!t.stage_slug && !isSxStageSlug(t.stage_slug)),
    [tasks, isSxStageSlug],
  );

  /**
   * Deal có thể có 2 nhóm:
   * - CRM tasks: deal_* (bộ nhiệm vụ CRM)
   * - SX tasks: sx_* (bộ nhiệm vụ sản xuất)
   * UI cho phép chọn hiển thị nhóm nào (mặc định CRM).
   */
  const [dealTaskView, setDealTaskView] = useState(() => {
    try {
      const s = localStorage.getItem(`crm_deal_task_view:${leadId}`);
      return s === 'sx' ? 'sx' : 'crm';
    } catch {
      return 'crm';
    }
  });
  useEffect(() => {
    if (leadType !== 'deal') return;
    // Nếu điều hướng giữa nhiều deal trong cùng component instance, sync lại state theo leadId.
    try {
      const s = localStorage.getItem(`crm_deal_task_view:${leadId}`);
      setDealTaskView(s === 'sx' ? 'sx' : 'crm');
    } catch {
      setDealTaskView('crm');
    }
  }, [leadId, leadType]);
  useEffect(() => {
    if (leadType !== 'deal') return;
    try {
      localStorage.setItem(`crm_deal_task_view:${leadId}`, dealTaskView);
    } catch { /* ignore */ }
  }, [leadId, dealTaskView, leadType]);

  const isProductionScope = taskScope === 'production';
  const showSxTasksInUi = leadType === 'deal' && (isProductionScope || (hasSxTasks && dealTaskView === 'sx'));
  const showCrmTemplatesUi = !showSxTasksInUi && !isProductionScope;

  const uiTasks = useMemo(() => {
    if (leadType !== 'deal') return tasks;
    if (showSxTasksInUi) return tasks.filter((t) => isSxStageSlug(t.stage_slug));
    return tasks.filter((t) => !isSxStageSlug(t.stage_slug));
  }, [leadType, tasks, showSxTasksInUi, isSxStageSlug]);

  const isSxOrderTaskFlow = useMemo(() => {
    if (leadType !== 'deal') return false;
    return showSxTasksInUi;
  }, [leadType, showSxTasksInUi]);
  const STAGES = useMemo(() => {
    if (leadType !== 'deal') return LEAD_STAGES;
    return isSxOrderTaskFlow ? SX_ORDER_STAGES : DEAL_STAGES;
  }, [leadType, isSxOrderTaskFlow]);
  const STAGE_OPTIONS = useMemo(
    () => (leadType === 'deal' ? [...DEAL_STAGES, ...SX_ORDER_STAGES] : LEAD_STAGES),
    [leadType],
  );
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingDefaults, setGeneratingDefaults] = useState(false);
  const [generatingProduction, setGeneratingProduction] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // list, deadline, planner, calendar
  const [expandedStages, setExpandedStages] = useState({});
  const [bulkCompleting, setBulkCompleting] = useState(false);
  const [showAdd, setShowAdd] = useState(null); // stage_slug
  const [newTask, setNewTask] = useState({ title: '', priority: 'medium', deadline: '', assignee_id: '', supervisor_id: '' });
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  /** Task có thể thuộc deal con (fulfillment) khi deal gốc dùng đơn — API đính kèm/ghi chú cần đúng lead_id */
  const apiLeadIdForTaskId = (taskId) => {
    const t = tasks.find((x) => x.id === taskId);
    return (t?.lead_id && String(t.lead_id)) || leadId;
  };

  const notifyArtifactsSynced = (optTaskId) => {
    try {
      const lid = optTaskId ? apiLeadIdForTaskId(optTaskId) : leadId;
      onArtifactsSynced?.({ artifactLeadId: lid });
    } catch (_) { /* ignore */ }
  };

  const prevLeadIdForTasksRef = useRef(null);

  const loadTasks = async (opts = {}) => {
    const silent = !!opts.silent;
    if (!silent) setLoading(true);
    try {
      const [tasksRes, tplRes] = await Promise.all([
        api.get(`/crm/leads/${leadId}/tasks`, { params: { task_scope: taskScope } }),
        isProductionScope ? Promise.resolve({ data: [] }) : api.get('/crm/task-templates'),
      ]);
      setTasks(tasksRes.data || []);
      setTemplates(tplRes.data || []);
      // Auto-expand stages that have tasks
      const stages = {};
      (tasksRes.data || []).forEach(t => { if (t.stage_slug) stages[t.stage_slug] = true; });
      setExpandedStages(stages);
    } catch (e) { console.error(e); }
    finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const first = prevLeadIdForTasksRef.current === null;
    const leadSwitched = !first && prevLeadIdForTasksRef.current !== leadId;
    prevLeadIdForTasksRef.current = leadId;
    const silent = !first && !leadSwitched && refreshKey > 0;
    loadTasks({ silent });
  }, [leadId, taskScope, isProductionScope, refreshKey]);

  const addTask = async (stageSlug) => {
    if (!newTask.title.trim()) return;
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/tasks`, {
        ...newTask,
        stage_slug: stageSlug,
        order_index: tasks.filter(t => t.stage_slug === stageSlug).length,
      });
      setNewTask({ title: '', priority: 'medium', deadline: '', assignee_id: '', supervisor_id: '' });
      setShowAdd(null);
      if (data?.id) {
        setTasks((prev) => [...prev, data]);
        if (data.stage_slug) setExpandedStages((s) => ({ ...s, [data.stage_slug]: true }));
      } else loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const applyTemplate = async (templateId) => {
    try {
      const { data } = await api.post(`/crm/leads/${leadId}/tasks/from-template`, { template_id: templateId });
      alert(`Đã tạo ${data.count} công việc từ bộ mẫu`);
      const created = data.tasks || [];
      if (created.length) {
        setTasks((prev) => [...prev, ...created]);
        const stages = {};
        created.forEach((t) => { if (t.stage_slug) stages[t.stage_slug] = true; });
        setExpandedStages((s) => ({ ...s, ...stages }));
      } else loadTasks();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const generateDefaultTasks = async () => {
    if (generatingDefaults) return;
    setGeneratingDefaults(true);
    try {
      // Tạo theo các bộ mẫu được đánh dấu is_default, khớp stage_slug của pipeline hiện tại.
      const defaults = (templates || []).filter((t) => t?.is_default && t?.is_active !== false);
      const byStage = new Map();
      defaults.forEach((t) => {
        if (!t?.stage_slug) return;
        if (!byStage.has(t.stage_slug)) byStage.set(t.stage_slug, t);
      });

      const stageSlugs = (STAGES || []).map((s) => s.slug).filter(Boolean);
      const tplIds = stageSlugs
        .map((slug) => byStage.get(slug)?.id)
        .filter(Boolean);

      if (!tplIds.length) {
        alert('Chưa có bộ mẫu mặc định (is_default) cho các cột nhiệm vụ này. Vào Cài đặt → Bộ mẫu CRM để cấu hình.');
        return;
      }

      let created = 0;
      const allCreated = [];
      for (const tid of tplIds) {
        const { data } = await api.post(`/crm/leads/${leadId}/tasks/from-template`, { template_id: tid });
        created += data?.count || 0;
        if (Array.isArray(data?.tasks) && data.tasks.length) allCreated.push(...data.tasks);
      }

      if (allCreated.length) {
        setTasks((prev) => [...prev, ...allCreated]);
        const stages = {};
        allCreated.forEach((t) => { if (t.stage_slug) stages[t.stage_slug] = true; });
        setExpandedStages((s) => ({ ...s, ...stages }));
      } else {
        await loadTasks();
      }
      alert(created > 0 ? `Đã gen ${created} nhiệm vụ mặc định` : 'Không tạo thêm nhiệm vụ (có thể bộ mẫu trống hoặc đã tồn tại)');
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi gen nhiệm vụ');
    } finally {
      setGeneratingDefaults(false);
    }
  };

  const generateProductionTasks = async () => {
    if (generatingProduction) return;
    if (leadType !== 'deal') return;
    setGeneratingProduction(true);
    try {
      const genPayload = (force) => {
        const o = { force };
        if (sxTemplateCompanyId) o.production_company_id = sxTemplateCompanyId;
        return o;
      };
      const r1 = await api.post(`/crm/leads/${encodeURIComponent(leadId)}/tasks/generate-production-template`, genPayload(false));
      const data = r1.data || {};
      if ((data.created || 0) > 0) {
        alert(`Đã tạo ${data.created} nhiệm vụ Sản xuất`);
        await loadTasks();
        return;
      }
      if (data.reason === 'no_missing_sx_tasks') {
        const ok = window.confirm(
          'Theo bộ mẫu SX hiện tại, không còn nhiệm vụ nào thiếu (đã bổ sung hết hoặc trùng tiêu đề + cột).\n\n'
            + 'Bạn có muốn xóa toàn bộ nhiệm vụ sx_* và gen lại từ đầu theo mẫu công ty?',
        );
        if (!ok) {
          await loadTasks();
          return;
        }
        const r2 = await api.post(`/crm/leads/${encodeURIComponent(leadId)}/tasks/generate-production-template`, genPayload(true));
        alert(`Đã tạo lại ${r2.data?.created || 0} nhiệm vụ Sản xuất`);
        await loadTasks();
        return;
      }
      if (data.reason === 'already_has_sx_tasks') {
        const ok = window.confirm('Deal đã có nhiệm vụ Sản xuất (sx_*).\n\nBạn có muốn tạo lại (xóa & gen lại) theo bộ mẫu công ty của deal không?');
        if (!ok) return;
        const r2 = await api.post(`/crm/leads/${encodeURIComponent(leadId)}/tasks/generate-production-template`, genPayload(true));
        alert(`Đã tạo lại ${r2.data?.created || 0} nhiệm vụ Sản xuất`);
        await loadTasks();
        return;
      }
      alert('Không có nhiệm vụ Sản xuất được tạo.');
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi gen nhiệm vụ Sản xuất');
    } finally {
      setGeneratingProduction(false);
    }
  };

  const updateTask = async (taskId, updates) => {
    const prevTasks = tasks;
    setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
    try {
      const lid = apiLeadIdForTaskId(taskId);
      const { data } = await api.put(`/crm/leads/${lid}/tasks/${taskId}`, updates);
      setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...data } : t)));
    } catch (e) {
      setTasks(prevTasks);
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const toggleStatus = (task) => {
    const next = task.status === 'completed' ? 'pending' : task.status === 'pending' ? 'in_progress' : 'completed';
    updateTask(task.id, { status: next });
  };

  const completeTasksBulk = async (taskList, confirmMessage) => {
    const toComplete = taskList.filter((t) => t.status !== 'completed');
    if (!toComplete.length) return;
    if (!window.confirm(confirmMessage)) return;
    const prevTasks = tasks;
    const ids = new Set(toComplete.map((t) => t.id));
    setBulkCompleting(true);
    setTasks((p) => p.map((t) => (ids.has(t.id) ? { ...t, status: 'completed' } : t)));
    try {
      await Promise.all(
        toComplete.map((t) => {
          const lid = apiLeadIdForTaskId(t.id);
          return api.put(`/crm/leads/${lid}/tasks/${t.id}`, { status: 'completed' });
        }),
      );
    } catch (e) {
      setTasks(prevTasks);
      alert(e.response?.data?.error || 'Lỗi khi đánh dấu hoàn thành hàng loạt');
    } finally {
      setBulkCompleting(false);
      try {
        await loadTasks({ silent: true });
      } catch (_) { /* ignore */ }
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Xóa công việc này?')) return;
    const prevTasks = tasks;
    setTasks((p) => p.filter((t) => t.id !== taskId));
    try {
      await api.delete(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}`);
    } catch (e) {
      setTasks(prevTasks);
      alert('Lỗi');
    }
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      deadline: task.deadline ? (task.deadline.includes('T') ? task.deadline.substring(0, 16) : task.deadline.substring(0, 10) + 'T08:00') : '',
      assignee_id: task.assignee_id || '',
      supervisor_id: task.supervisor_id || '',
      stage_slug: task.stage_slug || '',
    });
  };

  const saveEdit = async () => {
    if (!editForm.title.trim()) return alert('Nhập tên nhiệm vụ');
    const taskId = editingTask.id;
    try {
      const lid = apiLeadIdForTaskId(taskId);
      const { data } = await api.put(`/crm/leads/${lid}/tasks/${taskId}`, {
        title: editForm.title,
        description: editForm.description,
        priority: editForm.priority,
        deadline: editForm.deadline || null,
        assignee_id: editForm.assignee_id || null,
        supervisor_id: editForm.supervisor_id || null,
        stage_slug: editForm.stage_slug,
      });
      setEditingTask(null);
      setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...data } : t)));
    } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu'); }
  };

  const toggleShare = async (taskId) => {
    try {
      const { data } = await api.put(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/toggle-share`);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, shared_to_project: data.shared_to_project } : t));
    } catch (e) { alert('Lỗi kích hoạt chia sẻ'); }
  };

  // Stats
  const stats = useMemo(() => {
    const total = uiTasks.length;
    const completed = uiTasks.filter(t => t.status === 'completed').length;
    const overdue = uiTasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed').length;
    const inProgress = uiTasks.filter(t => t.status === 'in_progress').length;
    return { total, completed, overdue, inProgress, percent: total ? Math.round(completed / total * 100) : 0 };
  }, [uiTasks]);

  // Group tasks by stage
  const tasksByStage = useMemo(() => {
    const map = {};
    STAGES.forEach(s => { map[s.slug] = []; });
    uiTasks.forEach(t => { const key = t.stage_slug || 'other'; if (!map[key]) map[key] = []; map[key].push(t); });
    return map;
  }, [uiTasks, STAGES]);

  // Deadline view groups
  const deadlineGroups = useMemo(() => {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const groups = { overdue: [], today: [], thisWeek: [], later: [], noDeadline: [] };
    uiTasks.filter(t => t.status !== 'completed').forEach(t => {
      if (!t.deadline) { groups.noDeadline.push(t); return; }
      const d = new Date(t.deadline);
      if (d < today) groups.overdue.push(t);
      else if (d < new Date(today.getTime() + 86400000)) groups.today.push(t);
      else if (d < weekEnd) groups.thisWeek.push(t);
      else groups.later.push(t);
    });
    return groups;
  }, [uiTasks]);

  // Planner view - group by assignee
  const plannerGroups = useMemo(() => {
    const map = {}; const unassigned = [];
    uiTasks.filter(t => t.status !== 'completed').forEach(t => {
      if (t.assignee_id && t.assignee) {
        if (!map[t.assignee_id]) map[t.assignee_id] = { user: t.assignee, tasks: [] };
        map[t.assignee_id].tasks.push(t);
      } else { unassigned.push(t); }
    });
    return { assignees: Object.values(map), unassigned };
  }, [uiTasks]);

  // Calendar view
  const calendarTasks = useMemo(() => {
    const map = {};
    uiTasks.forEach(t => {
      if (!t.deadline) return;
      const key = t.deadline.substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [uiTasks]);

  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const calDays = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const startDay = first.getDay() || 7;
    const days = [];
    for (let i = 1 - startDay; i <= 42 - startDay; i++) {
      const d = new Date(calMonth.y, calMonth.m, i + 1);
      days.push(d);
    }
    return days.slice(0, 35);
  }, [calMonth]);

  const [expandedTask, setExpandedTask] = useState(null);
  const [editingDeadline, setEditingDeadline] = useState(null); // taskId currently editing deadline
  const [taskAttachments, setTaskAttachments] = useState({});
  const [taskNoteText, setTaskNoteText] = useState({});
  const [savingNote, setSavingNote] = useState(null);
  const [uploadingTask, setUploadingTask] = useState(null); // taskId đang upload
  const [addingAttNote, setAddingAttNote] = useState(null);
  const [attNoteText, setAttNoteText] = useState('');
  const [attNoteName, setAttNoteName] = useState('');
  const [uploadProgress, setUploadProgress] = useState({}); // { taskId: { percent, name } }
  const [excelImportTaskId, setExcelImportTaskId] = useState(null); // taskId đang mở Excel import modal
  const [importingExcel, setImportingExcel] = useState(null); // taskId đang import
  const [importToast, setImportToast] = useState(null); // { message, type }

  if (loading) return <div className="flex items-center justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;

  const loadAttachments = async (task) => {
    const taskId = task.id;
    try {
      const lid = apiLeadIdForTaskId(taskId);
      const { data } = await api.get(`/crm/leads/${lid}/tasks/${taskId}/attachments`);
      setTaskAttachments(p => ({ ...p, [taskId]: data || [] }));
    } catch (e) { console.error(e); }
  };

  const toggleExpand = (task) => {
    const taskId = task.id;
    if (expandedTask === taskId) {
      setExpandedTask(null);
    } else {
      setExpandedTask(taskId);
      setTaskNoteText((p) => ({ ...p, [taskId]: task.notes || '' }));
      loadAttachments(task);
    }
  };

  const saveTaskNotes = async (taskId) => {
    setSavingNote(taskId);
    try {
      await api.put(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/notes`, { notes: taskNoteText[taskId] || '' });
      // Update local tasks state
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, notes: taskNoteText[taskId] } : t));
      notifyArtifactsSynced(taskId);
      setSavingNote('saved-' + taskId);
      setTimeout(() => setSavingNote(null), 1500);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu ghi chú');
      setSavingNote(null);
    }
  };

  const compressImage = (file, maxWidth = 1920, quality = 0.8) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size < 500 * 1024) { resolve(file); return; }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const uploadTaskFile = (taskId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.mp4,.mov,.webm,.avi';
    input.onchange = async (e) => {
      const rawFiles = Array.from(e.target.files || []).slice(0, 20);
      if (!rawFiles.length) return;
      setUploadingTask(taskId);

      try {
        // Chia thành ảnh và video/file
        const imageFiles = rawFiles.filter(f => f.type.startsWith('image/'));
        const otherFiles = rawFiles.filter(f => !f.type.startsWith('image/'));

        const allUploaded = [];

        // Upload ảnh: nén + batch
        if (imageFiles.length) {
          const compressed = await Promise.all(imageFiles.map(f => compressImage(f)));
          const formData = new FormData();
          compressed.forEach(f => formData.append('files', f));
          const { data: uploadRes } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          allUploaded.push(...(uploadRes.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes])));
        }

        // Upload video/file: từng file riêng với progress + stream endpoint
        for (const file of otherFiles) {
          setUploadProgress(p => ({ ...p, [taskId]: { percent: 0, name: file.name, size: file.size } }));
          const isLarge = file.size > 10 * 1024 * 1024; // >10MB dùng stream
          const endpoint = isLarge ? '/upload/stream' : '/upload/single';
          const result = await new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${api.defaults.baseURL}${endpoint}`);
            xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                const pct = Math.round((ev.loaded / ev.total) * 100);
                setUploadProgress(p => ({ ...p, [taskId]: { percent: pct, name: file.name } }));
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
              } else {
                reject(new Error(`Upload lỗi: ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('Lỗi mạng'));
            xhr.send(formData);
          });
          allUploaded.push(result);
        }

        setUploadProgress(p => { const n = { ...p }; delete n[taskId]; return n; });

        if (!allUploaded.length) throw new Error('Upload không trả về file');

        // Tạo attachments
        const items = allUploaded.map(up => ({
          name: (up.original_name || up.file_name || 'File').replace(/\.[^.]+$/, ''),
          doc_type: (up.mime_type || '').startsWith('image/') ? 'image' : (up.mime_type || '').startsWith('video/') ? 'video' : (up.file_name || '').match(/\.(dwg|dxf)$/i) ? 'drawing' : 'other',
          file_url: up.file_url,
          file_name: up.file_name,
          file_size: up.file_size,
          mime_type: up.mime_type,
        }));
        await api.post(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/attachments/bulk`, { items });
        loadAttachments({ id: taskId });
        loadTasks(); // Refresh counts
        notifyArtifactsSynced(taskId);
      } catch (err) {
        setUploadProgress(p => { const n = { ...p }; delete n[taskId]; return n; });
        alert(err.response?.data?.error || err.message || 'Upload lỗi');
      }
      setUploadingTask(null);
    };
    input.click();
  };

  const addAttachmentNote = async (taskId) => {
    if (!attNoteText.trim()) return alert('Nhập nội dung ghi chú');
    try {
      await api.post(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/attachments`, {
        name: attNoteName.trim() || 'Ghi chú',
        doc_type: 'task_note',
        notes: attNoteText,
      });
      setAddingAttNote(null);
      setAttNoteText('');
      setAttNoteName('');
      loadAttachments({ id: taskId });
      notifyArtifactsSynced(taskId);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi thêm ghi chú'); }
  };

  const deleteAttachment = async (taskId, attId) => {
    if (!confirm('Xóa đính kèm này?')) return;
    try {
      await api.delete(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/attachments/${attId}`);
      loadAttachments({ id: taskId });
      notifyArtifactsSynced(taskId);
    } catch (e) { alert('Lỗi'); }
  };

  const toggleShareAttachment = async (taskId, attId) => {
    try {
      const { data } = await api.put(`/crm/leads/${apiLeadIdForTaskId(taskId)}/tasks/${taskId}/attachments/${attId}/toggle-share`);
      setTaskAttachments(p => ({
        ...p,
        [taskId]: (p[taskId] || []).map(a => a.id === attId ? { ...a, shared_to_project: data.shared_to_project } : a)
      }));
      notifyArtifactsSynced(taskId);
    } catch (e) { alert('Lỗi chia sẻ'); }
  };

  const ATT_ICONS = { image: ImageIcon, video: Film, drawing: FileText, task_note: MessageSquare, other: FileText };

  const excelQuotationLeadId = excelImportTaskId ? apiLeadIdForTaskId(excelImportTaskId) : leadId;

  // TaskRow renders inline — see renderTaskRow below
  const renderTaskRow = (task) => {
    const StatusIcon = STATUS_ICONS[task.status] || Circle;
    const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';
    const isExpanded = expandedTask === task.id;
    const atts = taskAttachments[task.id] || [];
    const descText = (task.description || '').trim();
    const hasDesc = !!descText;
    const hasContent = task.notes || descText || atts.length > 0;
    const fileCount = task.file_count || 0;
    const noteCount = task.note_count || 0;
    const hasNotes = !!task.notes;
    return (
      <div key={task.id} className={`rounded-lg ${isExpanded ? 'bg-gray-50 border border-gray-200' : 'hover:bg-gray-50'}`}>
        {/* Main row */}
        <div className="flex items-center gap-2 py-2 px-3 group">
          <button onClick={() => toggleStatus(task)} className="cursor-pointer shrink-0">
            <StatusIcon className={`h-4 w-4 ${task.status === 'completed' ? 'text-emerald-500' : task.status === 'in_progress' ? 'text-blue-500' : 'text-gray-300'}`} />
          </button>
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => toggleExpand(task)}
            title="Click: ghi chú & đính kèm · Double-click: chỉnh sửa nhiệm vụ"
          >
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <p
                className={`text-sm min-w-0 ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  openEditModal(task);
                }}
              >
                {task.title}
              </p>
              {task.order_label && (
                <span className="shrink-0 text-[10px] font-medium text-amber-900 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                  Đơn: {task.order_label}
                </span>
              )}
              {task.completion_requires_file_or_note && task.status !== 'completed' && (
                <span
                  className="shrink-0 text-[10px] font-medium text-violet-900 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded"
                  title="Cần ghi chú hoặc đính kèm trước khi hoàn thành (Cấu hình KPI → Bộ NV CRM)"
                >
                  📎 Ghi chú / file
                </span>
              )}
            </div>
            {!isExpanded && hasNotes && (
              <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1 italic" title={task.notes}>
                💬 {task.notes.slice(0, 80)}{task.notes.length > 80 ? '...' : ''}
              </p>
            )}
            {!isExpanded && !hasNotes && hasDesc && (
              <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2" title={descText}>
                📋 {descText.slice(0, 120)}{descText.length > 120 ? '…' : ''}
              </p>
            )}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {task.deadline && editingDeadline !== task.id && (
                <span onClick={(e) => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className={`text-[10px] flex items-center gap-0.5 cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}
                  title="Click để đổi ngày giờ hẹn">
                  <Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}{task.deadline?.includes('T') ? ` ${new Date(task.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              )}
              {!task.deadline && editingDeadline !== task.id && (
                <span onClick={(e) => { e.stopPropagation(); setEditingDeadline(task.id); }}
                  className="text-[10px] text-gray-300 flex items-center gap-0.5 cursor-pointer hover:text-blue-500 hover:bg-blue-50 px-1 py-0.5 rounded"
                  title="Chọn ngày giờ hẹn">
                  <Calendar className="h-2.5 w-2.5" />+ Ngày hẹn
                </span>
              )}
              {editingDeadline === task.id && (
                <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <input type="datetime-local" autoFocus
                    defaultValue={task.deadline ? (task.deadline.includes('T') ? task.deadline.substring(0, 16) : task.deadline.substring(0, 10) + 'T08:00') : ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val) updateTask(task.id, { deadline: val });
                    }}
                    onBlur={() => setTimeout(() => setEditingDeadline(null), 300)}
                    className="text-[10px] px-1.5 py-0.5 border border-blue-300 rounded bg-blue-50 outline-none focus:ring-1 focus:ring-blue-400 w-[175px]"
                  />
                  {task.deadline && (
                    <button onClick={() => { updateTask(task.id, { deadline: null }); setEditingDeadline(null); }}
                      className="text-[10px] text-red-400 hover:text-red-600 cursor-pointer p-0.5" title="Xóa ngày hẹn">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
              {task.assignee && <span className="text-[10px] text-blue-600 flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{task.assignee.full_name}</span>}
              {task.supervisor && <span className="text-[10px] text-purple-600 flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{task.supervisor.full_name}</span>}
              {/* File & Note count badges — always visible */}
              {fileCount > 0 && (
                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <Paperclip className="h-2.5 w-2.5" />{fileCount} file
                </span>
              )}
              {noteCount > 0 && (
                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <MessageSquare className="h-2.5 w-2.5" />{noteCount} ghi chú
                </span>
              )}
              {hasNotes && !isExpanded && (
                <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <FileText className="h-2.5 w-2.5" />Có ghi chú
                </span>
              )}
              {hasDesc && !hasNotes && !isExpanded && (
                <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                  <FileText className="h-2.5 w-2.5" />Mô tả mẫu
                </span>
              )}
              {task.shared_to_project && (
                <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                  <Share2 className="h-2.5 w-2.5" />Đang chia sẻ
                </span>
              )}
              {/* Nút Upload Excel Báo giá — chỉ hiện cho task báo giá trong Deal, chưa hoàn thành */}
              {leadType === 'deal' && (task.stage_slug === 'deal_quote_contract' || task.stage_slug === 'quotation') && task.status !== 'completed' && (
                <button
                  onClick={(e) => { e.stopPropagation(); setExcelImportTaskId(task.id); }}
                  className="text-[10px] text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium cursor-pointer border border-emerald-200 transition-colors"
                  title="Upload file Excel để tạo báo giá tự động"
                >
                  <FileSpreadsheet className="h-2.5 w-2.5" />📊 Upload Excel BG
                </button>
              )}
            </div>
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLORS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
          <div className="flex items-center gap-0.5 shrink-0 border-l border-gray-100 pl-1.5 ml-0.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); toggleShare(task.id); }}
              className={`p-1.5 rounded-md cursor-pointer ${task.shared_to_project ? 'text-green-600 hover:bg-green-50' : 'text-gray-500 hover:bg-gray-100 hover:text-green-600'}`}
              title={task.shared_to_project ? 'Đang hiển thị trên Dự án / Khối khác — click để tắt' : 'Bật hiển thị ghi chú & file trên Dự án / Khối khác (team CRM vẫn xem đủ tại đây)'}>
              {task.shared_to_project ? <Share2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpand(task); }} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer" title="Ghi chú & file">
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); openEditModal(task); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer" title="Chỉnh sửa nhiệm vụ">
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer" title="Xóa nhiệm vụ"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* Expanded: Notes + Attachments (gộp 1 khu vực) */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-3 border-t border-gray-200 mx-3 pt-3">
            {hasDesc && (
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Mô tả / hướng dẫn (từ mẫu CRM)</p>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{descText}</p>
              </div>
            )}
            {/* Ghi chú + Upload gộp chung */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase">📝 Ghi chú & Đính kèm ({atts.length})</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleShare(task.id)}
                    className={`text-[10px] flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded ${
                      task.shared_to_project
                        ? 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-300'
                        : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                    }`}
                    title={task.shared_to_project ? 'Đang đồng bộ lên Dự án — click để tắt' : 'Đồng bộ ghi chú lên tab Dự án / Khối khác (CRM luôn xem đủ)'}>
                    {task.shared_to_project ? <Share2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {task.shared_to_project ? ' Ghi chú đang chia sẻ' : ' Chia sẻ ghi chú'}
                  </button>
                  {uploadingTask === task.id ? (
                    <span className="text-[10px] text-orange-600 flex items-center gap-1 px-1.5 py-0.5">
                      <span className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full" />
                      {uploadProgress[task.id]
                        ? <span>{uploadProgress[task.id].name} — {uploadProgress[task.id].percent}% {uploadProgress[task.id].size > 1024*1024 ? `(${(uploadProgress[task.id].size/1024/1024).toFixed(0)}MB)` : ''}</span>
                        : 'Đang nén ảnh...'}
                    </span>
                  ) : (
                    <button onClick={() => uploadTaskFile(task.id)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50">
                      <FileUp className="h-3 w-3" /> Upload file
                    </button>
                  )}
                </div>
              </div>

              {/* Ghi chú (textarea) */}
              <textarea
                value={taskNoteText[task.id] ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  setTaskNoteText(p => ({ ...p, [task.id]: val }));
                }}
                placeholder="Nhập ghi chú cho nhiệm vụ này..."
                rows={2}
                className="w-full px-2.5 py-1.5 border rounded-lg text-xs outline-none focus:border-blue-400 resize-none mb-1.5"
              />
              <div className="flex justify-end mb-2">
                <button onClick={() => saveTaskNotes(task.id)} disabled={savingNote === task.id}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                    savingNote === 'saved-' + task.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}>
                  <Save className="h-2.5 w-2.5" /> {savingNote === task.id ? 'Đang lưu...' : savingNote === 'saved-' + task.id ? '✓ Đã lưu' : 'Lưu ghi chú'}
                </button>
              </div>

              {/* Upload progress bar */}
              {uploadProgress[task.id] && (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-blue-600 mb-1">
                    <span className="truncate max-w-[200px]">📤 {uploadProgress[task.id].name} {uploadProgress[task.id].size > 1024*1024 ? `(${(uploadProgress[task.id].size/1024/1024).toFixed(1)}MB)` : ''}</span>
                    <span className="font-bold">{uploadProgress[task.id].percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress[task.id].percent}%` }} />
                  </div>
                </div>
              )}

              {/* Attachment list */}
              {atts.length > 0 && (
                <div className="space-y-1">
                  {atts.map(att => {
                    const AttIcon = ATT_ICONS[att.doc_type] || FileText;
                    const attOpen = att.file_url ? getFileOpenAnchorProps(att.file_url, { fileName: att.file_name }) : null;
                    return (
                      <div key={att.id} className="py-1.5 px-2 rounded bg-white border group/att">
                        <div className="flex items-start gap-2">
                          <AttIcon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-medium text-gray-800 truncate">{att.name}</p>
                              {att.shared_to_project && (
                                <span className="text-[9px] text-green-600 bg-green-50 px-1 py-0.5 rounded shrink-0">🔗 Đã chia sẻ</span>
                              )}
                            </div>
                            {att.notes && <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{att.notes}</p>}
                            {att.file_url && !att.mime_type?.startsWith('image/') && attOpen && (
                              <a {...attOpen}
                                className="text-[10px] text-blue-600 hover:underline">{att.file_name || 'Mở file'}</a>
                            )}
                            <span className="text-[9px] text-gray-400 ml-1">{att.creator?.full_name}</span>
                          </div>
                          <div className="opacity-0 group-hover/att:opacity-100 flex items-center gap-0.5 shrink-0">
                            <button onClick={() => toggleShareAttachment(task.id, att.id)}
                              className={`p-0.5 cursor-pointer ${att.shared_to_project ? 'text-green-500 hover:text-green-700' : 'text-gray-400 hover:text-green-500'}`}
                              title={att.shared_to_project ? 'File đang hiện trên Dự án — click để tắt' : 'Cho file hiện trên Dự án / Khối khác (CRM vẫn mở được)'}>
                              {att.shared_to_project ? <Share2 className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                            </button>
                            <button onClick={() => deleteAttachment(task.id, att.id)}
                              className="p-0.5 text-gray-400 hover:text-red-500 cursor-pointer">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                        {/* Image preview */}
                        {att.file_url && att.mime_type?.startsWith('image/') && attOpen && (
                          <a {...attOpen} className="block mt-1.5 ml-5">
                            <img src={publicFileUrl(att.file_url)} alt={att.name} className="max-h-40 max-w-full rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity" />
                          </a>
                        )}
                        {/* Video preview */}
                        {att.file_url && (att.mime_type?.startsWith('video/') || att.doc_type === 'video') && (
                          <div className="mt-1.5 ml-5">
                            <video src={publicFileUrl(att.file_url)} controls preload="metadata"
                              className="max-h-52 max-w-full rounded-lg border border-gray-200 bg-black" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {atts.length === 0 && (
                <p className="text-[10px] text-gray-400 italic">Chưa có đính kèm</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const AddTaskForm = ({ stageSlug }) => (
    <div className="bg-blue-50 rounded-lg p-3 space-y-2 mt-2">
      <input value={newTask.title} onChange={e => setNewTask(p => ({...p, title: e.target.value}))}
        placeholder="Tên công việc..." className="w-full px-3 py-1.5 rounded-lg border text-sm outline-none focus:border-blue-500" autoFocus />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select value={newTask.priority} onChange={e => setNewTask(p => ({...p, priority: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="low">Thấp</option><option value="medium">TB</option><option value="high">Cao</option><option value="urgent">Gấp</option>
        </select>
        <input type="datetime-local" value={newTask.deadline} onChange={e => setNewTask(p => ({...p, deadline: e.target.value}))}
          className="px-2 py-1 rounded border text-xs" />
        <select value={newTask.assignee_id} onChange={e => setNewTask(p => ({...p, assignee_id: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="">Giao cho...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select value={newTask.supervisor_id} onChange={e => setNewTask(p => ({...p, supervisor_id: e.target.value}))}
          className="px-2 py-1 rounded border text-xs">
          <option value="">Giám sát...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => addTask(stageSlug)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700"><Save className="h-3 w-3 inline mr-1" />Thêm</button>
        <button onClick={() => setShowAdd(null)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs cursor-pointer hover:bg-gray-200">Hủy</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header: Stats + Views + Templates */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{stats.percent}%</div>
            <div className="text-[10px] text-gray-500 leading-tight">
              <span className="font-medium text-gray-900">{stats.completed}/{stats.total}</span> xong
              {stats.overdue > 0 && <span className="text-red-600 ml-1">• {stats.overdue} quá hạn</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {leadType === 'deal' && hasSxTasks && !isProductionScope && (
            <div className="flex items-center gap-1 mr-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setDealTaskView('crm')}
                className={`h-6 px-2 rounded-md text-[10px] font-semibold cursor-pointer ${dealTaskView === 'crm' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                title="Hiển thị bộ nhiệm vụ CRM (deal_*)"
              >
                CRM
              </button>
              <button
                type="button"
                onClick={() => setDealTaskView('sx')}
                className={`h-6 px-2 rounded-md text-[10px] font-semibold cursor-pointer ${dealTaskView === 'sx' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                title="Hiển thị bộ nhiệm vụ Sản xuất (sx_*)"
              >
                SX
              </button>
            </div>
          )}
          {leadType === 'deal' && (
            <button
              onClick={generateProductionTasks}
              disabled={generatingProduction}
              className="h-7 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
              title="Gen nhiệm vụ Sản xuất (sx_*) từ bộ mẫu xưởng — bắt buộc đúng công ty của deal"
            >
              {generatingProduction ? <span className="animate-spin h-3 w-3 border-2 border-white/80 border-t-transparent rounded-full" /> : <span>🏭</span>}
              Gen SX
            </button>
          )}
          {showCrmTemplatesUi && templates.length > 0 && uiTasks.length === 0 && !showTemplatePanel && (
            <button
              onClick={generateDefaultTasks}
              disabled={generatingDefaults}
              className="h-7 px-2.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              title="Tạo nhanh theo các bộ mẫu được đánh dấu ⭐ (is_default)"
            >
              {generatingDefaults ? <span className="animate-spin h-3 w-3 border-2 border-white/80 border-t-transparent rounded-full" /> : <ListChecks className="h-3 w-3" />}
              Gen nhiệm vụ (CRM)
            </button>
          )}
          {showCrmTemplatesUi && templates.length > 0 && (
            <button onClick={() => setShowTemplatePanel(p => !p)}
              className={`h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${showTemplatePanel ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'}`}>
              <ClipboardList className="h-3 w-3" /> Gắn mẫu
            </button>
          )}
          <div className="w-px h-5 bg-gray-200 mx-1" />
          {[{ id: 'list', icon: List, label: 'List' }, { id: 'deadline', icon: AlertTriangle, label: 'Deadline' }, { id: 'planner', icon: Users, label: 'Planner' }, { id: 'calendar', icon: Calendar, label: 'Lịch' }].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)}
              className={`h-7 px-2 rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer ${viewMode === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <v.icon className="h-3 w-3" />{v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Template panel — always available via button */}
      {showTemplatePanel && templates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">📋 Gắn bộ nhiệm vụ mẫu</p>
            <button onClick={() => setShowTemplatePanel(false)} className="p-1 hover:bg-amber-100 rounded cursor-pointer"><X className="h-3.5 w-3.5 text-amber-600" /></button>
          </div>
          <p className="text-[11px] text-amber-700">Chọn bộ mẫu để tạo nhiệm vụ tự động cho {leadType === 'deal' ? 'Deal' : 'Lead'} này. Có thể gắn nhiều bộ mẫu.</p>
          {ALL_STAGES.map(stage => {
            const stageTpls = templates.filter(t => t.stage_slug === stage.slug);
            if (!stageTpls.length) return null;
            const existingCount = uiTasks.filter(t => t.stage_slug === stage.slug).length;
            return (
              <div key={stage.slug}>
                <p className="text-[10px] font-bold mb-1.5 flex items-center gap-1" style={{ color: stage.color }}>
                  {stage.icon} {stage.label}
                  {existingCount > 0 && <span className="text-gray-400 font-normal">({existingCount} việc hiện có)</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {stageTpls.map(tpl => (
                    <button key={tpl.id} onClick={() => { applyTemplate(tpl.id); }}
                      className="px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 hover:border-amber-400 cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm">
                      <ListChecks className="h-3.5 w-3.5" />
                      {tpl.name}
                      <span className="text-[10px] text-amber-500">({tpl.items?.length || 0} việc)</span>
                      {tpl.is_default && <span className="text-[9px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full">⭐</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template quick-apply — only when no tasks exist */}
      {showCrmTemplatesUi && templates.length > 0 && uiTasks.length === 0 && !showTemplatePanel && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800 mb-2">📋 Chưa có công việc — Áp dụng bộ mẫu nhanh:</p>
          <div className="flex flex-wrap gap-2">
            {templates.filter(t => t.is_default).concat(templates.filter(t => !t.is_default)).slice(0, 5).map(tpl => (
              <button key={tpl.id} onClick={() => applyTemplate(tpl.id)}
                className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer">
                {ALL_STAGES.find(s => s.slug === tpl.stage_slug)?.icon || '📋'} {tpl.name} ({tpl.items?.length || 0} việc)
                {tpl.is_default && ' ⭐'}
              </button>
            ))}
            {templates.length > 5 && (
              <button onClick={() => setShowTemplatePanel(true)} className="px-3 py-1.5 text-xs text-amber-600 hover:text-amber-800 cursor-pointer">
                +{templates.length - 5} bộ mẫu khác...
              </button>
            )}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {STAGES.map(stage => {
            const stageTasks = tasksByStage[stage.slug] || [];
            const completed = stageTasks.filter(t => t.status === 'completed').length;
            const expanded = expandedStages[stage.slug] !== false;
            const tpl = templates.find(t => t.stage_slug === stage.slug);
            return (
              <div key={stage.slug} className="border rounded-lg overflow-hidden">
                <div className="flex items-stretch gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => setExpandedStages(p => ({ ...p, [stage.slug]: !expanded }))}
                    className="flex flex-1 min-w-0 items-center gap-2 px-1 py-1 rounded-md hover:bg-gray-100 cursor-pointer text-left"
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                    <span className="text-sm shrink-0">{stage.icon}</span>
                    <span className="text-sm font-semibold truncate" style={{ color: stage.color }}>{stage.label}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{completed}/{stageTasks.length}</span>
                    {(() => {
                      const totalFiles = stageTasks.reduce((s, t) => s + (t.file_count || 0), 0);
                      const totalNotes = stageTasks.reduce((s, t) => s + (t.note_count || 0), 0);
                      return (
                        <>
                          {totalFiles > 0 && <span className="text-[9px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full shrink-0">📎 {totalFiles}</span>}
                          {totalNotes > 0 && <span className="text-[9px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">📝 {totalNotes}</span>}
                        </>
                      );
                    })()}
                    {stageTasks.length > 0 && (
                      <div className="ml-auto w-14 sm:w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stageTasks.length ? (completed / stageTasks.length) * 100 : 0}%` }} />
                      </div>
                    )}
                  </button>
                  {stageTasks.length > 0 && stageTasks.some((t) => t.status !== 'completed') && (
                    <button
                      type="button"
                      disabled={bulkCompleting}
                      onClick={(e) => {
                        e.stopPropagation();
                        const n = stageTasks.filter((t) => t.status !== 'completed').length;
                        void completeTasksBulk(stageTasks, `Đánh dấu hoàn thành ${n} nhiệm vụ trong «${stage.label}»?`);
                      }}
                      className="shrink-0 self-center flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1.5 rounded-md disabled:opacity-50 cursor-pointer"
                      title="Hoàn thành nhanh mọi việc chưa xong trong nhóm này"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Xong hết</span>
                    </button>
                  )}
                </div>
                {expanded && (
                  <div className="px-2 py-1">
                    {stageTasks.map(t => renderTaskRow(t))}
                    {showAdd === stage.slug ? (
                      <AddTaskForm stageSlug={stage.slug} />
                    ) : (
                      <div className="flex items-center gap-2 py-1 px-3">
                        <button onClick={() => setShowAdd(stage.slug)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer">
                          <Plus className="h-3 w-3" /> Thêm việc
                        </button>
                        {tpl && !stageTasks.length && (
                          <button onClick={() => applyTemplate(tpl.id)}
                            className="text-[10px] text-amber-600 hover:text-amber-800 flex items-center gap-1 cursor-pointer">
                            <ListChecks className="h-3 w-3" /> Áp dụng mẫu ({tpl.items?.length || 0})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DEADLINE VIEW */}
      {viewMode === 'deadline' && (
        <div className="space-y-3">
          {[
            { key: 'overdue', label: '🔴 Quá hạn', tasks: deadlineGroups.overdue, color: 'border-red-300 bg-red-50' },
            { key: 'today', label: '🟡 Hôm nay', tasks: deadlineGroups.today, color: 'border-amber-300 bg-amber-50' },
            { key: 'thisWeek', label: '🔵 Tuần này', tasks: deadlineGroups.thisWeek, color: 'border-blue-300 bg-blue-50' },
            { key: 'later', label: '⚪ Sau đó', tasks: deadlineGroups.later, color: 'border-gray-200 bg-gray-50' },
            { key: 'noDeadline', label: '⏳ Chưa có hạn', tasks: deadlineGroups.noDeadline, color: 'border-gray-200 bg-gray-50' },
          ].filter(g => g.tasks.length > 0).map(group => (
            <div key={group.key} className={`border rounded-lg ${group.color}`}>
              <div className="px-3 py-2 font-semibold text-xs flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  {group.label} <span className="text-gray-400 font-normal">({group.tasks.length})</span>
                </span>
                {group.tasks.some((t) => t.status !== 'completed') && (
                  <button
                    type="button"
                    disabled={bulkCompleting}
                    onClick={() => {
                      const n = group.tasks.filter((t) => t.status !== 'completed').length;
                      void completeTasksBulk(group.tasks, `Đánh dấu hoàn thành ${n} nhiệm vụ trong nhóm ${group.label}?`);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-white/80 hover:bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md disabled:opacity-50 cursor-pointer"
                    title="Hoàn thành nhanh mọi việc chưa xong trong nhóm này"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Xong hết
                  </button>
                )}
              </div>
              <div className="bg-white rounded-b-lg">
                {group.tasks.map(t => renderTaskRow(t))}
              </div>
            </div>
          ))}
          {uiTasks.filter(t => t.status !== 'completed').length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Không có công việc đang chờ</p>
          )}
        </div>
      )}

      {/* PLANNER VIEW */}
      {viewMode === 'planner' && (
        <div className="space-y-3">
          {plannerGroups.assignees.map(group => (
            <div key={group.user.id} className="border rounded-lg">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                    {group.user.full_name?.charAt(0) || '?'}
                  </div>
                  <span className="text-sm font-semibold truncate">{group.user.full_name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">({group.tasks.length} việc)</span>
                </div>
                {group.tasks.some((t) => t.status !== 'completed') && (
                  <button
                    type="button"
                    disabled={bulkCompleting}
                    onClick={() => {
                      const n = group.tasks.filter((t) => t.status !== 'completed').length;
                      void completeTasksBulk(group.tasks, `Đánh dấu hoàn thành ${n} nhiệm vụ đang giao cho ${group.user.full_name || 'người này'}?`);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-md disabled:opacity-50 cursor-pointer"
                    title="Hoàn thành nhanh mọi việc chưa xong của người này"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Xong hết
                  </button>
                )}
              </div>
              <div>{group.tasks.map(t => renderTaskRow(t))}</div>
            </div>
          ))}
          {plannerGroups.unassigned.length > 0 && (
            <div className="border rounded-lg border-dashed">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50">
                <span className="text-sm font-semibold text-gray-500">Chưa giao ({plannerGroups.unassigned.length})</span>
                {plannerGroups.unassigned.some((t) => t.status !== 'completed') && (
                  <button
                    type="button"
                    disabled={bulkCompleting}
                    onClick={() => {
                      const n = plannerGroups.unassigned.filter((t) => t.status !== 'completed').length;
                      void completeTasksBulk(plannerGroups.unassigned, `Đánh dấu hoàn thành ${n} nhiệm vụ chưa được giao?`);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-md disabled:opacity-50 cursor-pointer"
                    title="Hoàn thành nhanh mọi việc chưa giao trong nhóm này"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Xong hết
                  </button>
                )}
              </div>
              <div>{plannerGroups.unassigned.map(t => renderTaskRow(t))}</div>
            </div>
          )}
          {uiTasks.filter(t => t.status !== 'completed').length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Không có công việc đang chờ</p>
          )}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m - 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
              className="px-2 py-1 rounded hover:bg-gray-100 cursor-pointer text-sm">◀</button>
            <span className="font-semibold text-sm">Tháng {calMonth.m + 1}/{calMonth.y}</span>
            <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m + 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
              className="px-2 py-1 rounded hover:bg-gray-100 cursor-pointer text-sm">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden text-[10px]">
            {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
              <div key={d} className="bg-gray-50 text-center py-1 font-semibold text-gray-500">{d}</div>
            ))}
            {calDays.map((day, i) => {
              const key = day.toISOString().substring(0, 10);
              const dayTasks = calendarTasks[key] || [];
              const isToday = key === new Date().toISOString().substring(0, 10);
              const isCurrentMonth = day.getMonth() === calMonth.m;
              return (
                <div key={i} className={`bg-white min-h-[60px] p-1 ${!isCurrentMonth ? 'opacity-30' : ''} ${isToday ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
                  <div className="text-[10px] text-gray-500 mb-0.5">{day.getDate()}</div>
                  {dayTasks.slice(0, 3).map(t => (
                    <div key={t.id} className={`text-[8px] px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-700 line-through' : 'bg-blue-100 text-blue-700'}`}
                      onClick={() => toggleStatus(t)} title={t.title}>
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && <div className="text-[8px] text-gray-400">+{dayTasks.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

            {/* Completed tasks (collapsed) */}
      {uiTasks.filter(t => t.status === 'completed').length > 0 && viewMode !== 'list' && (
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            ✅ Đã hoàn thành ({uiTasks.filter(t => t.status === 'completed').length})
          </summary>
          <div className="mt-2">
            {uiTasks.filter(t => t.status === 'completed').map(t => renderTaskRow(t))}
          </div>
        </details>
      )}

      {/* Excel Quotation Import Modal */}
      {excelImportTaskId && (
        <ExcelQuotationImport
          dealId={excelQuotationLeadId}
          leadId={excelQuotationLeadId}
          taskId={excelImportTaskId}
          onImportDone={(data) => {
            setExcelImportTaskId(null);
            loadTasks();
            notifyArtifactsSynced(excelImportTaskId);
            if (data?.draft_only) {
              setImportToast({
                message: 'Đã mở trang tạo báo giá với dữ liệu Excel — chỉnh sửa và bấm Lưu để tạo báo giá & hoàn thành nhiệm vụ.',
                type: 'success',
              });
              setTimeout(() => setImportToast(null), 8000);
              return;
            }
            let msg = `✅ Đã tạo báo giá ${data.code || ''} — ${formatVND(data.total || 0)}. Task đã hoàn thành!`;
            if (data.synced_products?.length) {
              const linked = data.synced_products?.length || 0;

              if (linked > 0) msg += ` 📦 ${linked} sản phẩm đã liên kết với danh mục web.`;
            }
            setImportToast({ message: msg, type: 'success' });
            setTimeout(() => setImportToast(null), 7000);
          }}
          onClose={() => setExcelImportTaskId(null)}
        />
      )}


      {editingTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditingTask(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Sửa nhiệm vụ</h3>
              </div>
              <button onClick={() => setEditingTask(null)} className="p-1 hover:bg-gray-100 rounded-lg cursor-pointer">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Tên nhiệm vụ *</label>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none" placeholder="Nhập tên nhiệm vụ..." />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Mô tả</label>
                <textarea value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none resize-y min-h-[70px]" placeholder="Mô tả chi tiết..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Giai đoạn</label>
                  <select value={editForm.stage_slug} onChange={e => setEditForm(f => ({ ...f, stage_slug: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
                    <option value="">— Chọn giai đoạn —</option>
                    {STAGE_OPTIONS.map(s => (<option key={s.slug} value={s.slug}>{s.icon} {s.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Hạn hoàn thành</label>
                  <input type="datetime-local" value={editForm.deadline} onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Người phụ trách</label>
                  <select value={editForm.assignee_id} onChange={e => setEditForm(f => ({ ...f, assignee_id: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
                    <option value="">— Chưa giao —</option>
                    {(users || []).map(u => (<option key={u.id} value={u.id}>{u.full_name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">Giám sát</label>
                  <select value={editForm.supervisor_id} onChange={e => setEditForm(f => ({ ...f, supervisor_id: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
                    <option value="">— Không giám sát —</option>
                    {(users || []).map(u => (<option key={u.id} value={u.id}>{u.full_name}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Độ ưu tiên</label>
                <div className="mt-1 flex gap-2">
                  {['low','medium','high','urgent'].map(p => (
                    <button key={p} onClick={() => setEditForm(f => ({ ...f, priority: p }))}
                      className={"px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border transition-colors " + (editForm.priority === p ? PRIORITY_COLORS[p] + ' border-current ring-1 ring-offset-1 ring-current' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100')}>
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-end gap-2">
              <button onClick={() => setEditingTask(null)} className="h-9 px-4 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium cursor-pointer transition-colors">Hủy</button>
              <button onClick={saveEdit} className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
                <Save className="h-3.5 w-3.5" /> Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}

      {importToast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-in slide-in-from-bottom-4 ${
          importToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <span>{importToast.message}</span>
          <button onClick={() => setImportToast(null)} className="p-0.5 hover:bg-white/20 rounded cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
