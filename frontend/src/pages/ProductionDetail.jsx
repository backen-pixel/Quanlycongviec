import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useCrmNotesFab } from '../context/CrmNotesFabContext';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { taskBelongsToWorkshopModule } from '../lib/workshopTaskScope';
import { markWorkshopPipelineCardFocus } from '../lib/workshopPipelineStorage';
import {
  isLeadDocVisibleInModule,
  isCrmSharedArtifactVisibleInModule,
  parseShareModules,
  cleanShareModulesForApi,
  shareModuleLabels,
} from '../lib/documentShareScope';
import DocumentShareModulePicker from '../components/DocumentShareModulePicker';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import { publicFileUrl as pubUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import {
  ArrowLeft, FolderKanban, MessageSquare, Plus, X,
  FileUp, Edit2, Save, ChevronDown, Trash2, Send, Paperclip,
  AlertTriangle, CheckCircle2, Circle, Clock, Truck, Wrench, ArrowRightLeft, Loader2,
} from 'lucide-react';
import CRMTasksTab from '../components/CRMTasksTab';
import UnifiedTaskHistoryWidget from '../components/UnifiedTaskHistoryWidget';
import ProjectApprovalsTab from '../components/ProjectApprovalsTab';
import { LeadMembersTab, LeadChatTab } from '../components/LeadChatTabs';
import CrmChatNotesPanel from '../components/CrmChatNotesPanel';
import PipelineStepper from '../components/PipelineStepper';
import BlockingTasksAlertModal from '../components/BlockingTasksAlertModal';
import {
  buildCrmStageSlugLabelMapFromTasks,
  resolveCrmPipelineStageLabel,
} from '../lib/crmStageSlugLabels';
import { buildCrmLeadDocTaskSections, normalizeCrmChecklist } from '../lib/crmTaskDocumentTree';
import { fetchPipelineStagesById } from '../lib/crmPipelineStages';
import { buildSxPipelineStageMeta } from '../lib/sxPipelineRevenue';
import { ProjectCommentsPanel } from '../components/CommentsPanels';

/** Cùng tên tab với LeadDetail (chi tiết deal) — bỏ facebook và calls */
const DEAL_TAB_KEYS = new Set(['tasks', 'documents', 'notes', 'comments', 'team', 'approvals', 'incidents']);
const LEGACY_TAB_MAP = {
  timeline: 'comments',
  'crm-notes': 'notes',
  /** Tab cũ «Đơn hàng» / crm-tasks → nhiệm vụ trên deal */
  orders: 'tasks',
  'crm-tasks': 'tasks',
  'crm-chat': 'comments',
  'crm-comments': 'comments',
  'crm-activities': 'comments',
  activities: 'comments',
  chat: 'comments',
  'crm-deal-docs': 'documents',
  'crm-members': 'team',
};

function calcProgressForTasks(taskList) {
  if (!taskList?.length) return 0;
  return Math.round((taskList.filter((t) => t.status === 'done').length / taskList.length) * 100);
}

/** Khớp cột Kanban SX — không fallback thẳng workflow_stages.id (namespace khác production_pipeline_stages). */
function resolveSxKanbanCurrentStageId(project, stages) {
  const list = Array.isArray(stages) ? stages : [];
  const ids = new Set(list.map((s) => String(s.id)));
  const inList = (id) => (id != null && ids.has(String(id)) ? id : null);
  const sorted = [...list].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const VC_STATUSES = new Set(['shipping', 'installing', 'warranty', 'completed']);
  const inVcFlow = VC_STATUSES.has(String(project?.status || ''));
  const firstCol = () => {
    const intake = sorted.find(
      (s) => s.bucket_slug === 'won_pending' || String(s.id).startsWith('__fb_'),
    );
    return intake?.id ?? sorted[0]?.id ?? null;
  };
  const handoverCol = sorted.find((s) => s.is_handover_to_logistics === true);

  const primaryDeal = project?.crmDeals?.[0];
  const fromSx = inList(project?.sx_kanban_column_id);
  if (fromSx) return fromSx;

  const crmCol = primaryDeal?.sx_pipeline_stage?.id;
  const fromCrm = inList(crmCol);
  if (fromCrm) return fromCrm;

  if (inVcFlow && handoverCol?.id) return handoverCol.id;

  if (project?.sx_won_deal && !primaryDeal?.sx_handover_at) {
    return firstCol();
  }

  if (project?.sx_intake) return firstCol();

  const wfId = project?.current_stage_id || project?.current_stage?.id;
  if (wfId) {
    const wfMatches = sorted.filter(
      (s) => String(s.workflow_stage_id || s.workflow_stage?.id) === String(wfId),
    );
    if (wfMatches.length === 1) return wfMatches[0].id;
  }

  return null;
}

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Gọi điện', icon: '📞', color: 'bg-blue-100 text-blue-700' },
  { value: 'meeting', label: 'Gặp mặt', icon: '🤝', color: 'bg-purple-100 text-purple-700' },
  { value: 'email', label: 'Email', icon: '📧', color: 'bg-amber-100 text-amber-700' },
  { value: 'zalo', label: 'Zalo', icon: '💬', color: 'bg-blue-100 text-blue-700' },
  { value: 'note', label: 'Ghi chú', icon: '📝', color: 'bg-gray-100 text-gray-700' },
  { value: 'quote_sent', label: 'Gửi báo giá', icon: '💰', color: 'bg-emerald-100 text-emerald-700' },
];

const ACTIVITY_FORM_TYPES = ACTIVITY_TYPES.filter((t) =>
  ['call', 'meeting', 'email', 'zalo', 'note'].includes(t.value),
);

/** Cột trái — inline-editable như LeadDetail */
function WorkshopInfoPanel({
  project,
  onUpdate,
  moduleKey = 'sx',
  crmDeal = null,
  companyRegions = [],
  onDealUpdate,
}) {
  const isVC = moduleKey === 'vc';
  const [editing, setEditing] = useState(null); // field name
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const prob = typeof project.productionTaskProgress === 'number' ? project.productionTaskProgress : 0;

  const startEdit = (field, value) => { setEditing(field); setDraft(value ?? ''); };
  const cancelEdit = () => { setEditing(null); setDraft(''); };

  const save = async (field, value) => {
    setSaving(true);
    try {
      await api.put(`/projects/${project.id}`, { [field]: value || null });
      onUpdate?.();
      setEditing(null);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu'); }
    setSaving(false);
  };

  const saveDealRegion = async (regionId) => {
    if (!crmDeal?.id) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/crm/leads/${crmDeal.id}`, {
        region_id: regionId || null,
      });
      const reg = regionId
        ? companyRegions.find((r) => String(r.id) === String(regionId))
        : null;
      onDealUpdate?.({
        ...data,
        region_id: regionId || null,
        crm_region: reg ? { id: reg.id, name: reg.name, code: reg.code } : null,
      });
      setEditing(null);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu khu vực');
    }
    setSaving(false);
  };

  const regionName = crmDeal?.crm_region?.name
    || companyRegions.find((r) => String(r.id) === String(crmDeal?.region_id))?.name
    || null;

  return (
    <div className="bg-white rounded-xl border p-5 space-y-1">
      <h3 className="text-sm font-bold text-gray-900 uppercase mb-2">Thông tin</h3>

      {/* Khu vực (deal CRM) — chỉ module SX */}
      {!isVC && crmDeal && (
        <div
          className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors group cursor-pointer"
          onClick={() => editing !== 'region_id' && startEdit('region_id', crmDeal.region_id || '')}
        >
          <span className="text-sm mt-0.5 shrink-0">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Khu vực</p>
            {editing === 'region_id' ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <select
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                >
                  <option value="">— Chưa chọn —</option>
                  {companyRegions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}{r.code ? ` (${r.code})` : ''}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => saveDealRegion(draft || null)}
                  disabled={saving}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50"
                >
                  ✓
                </button>
                <button type="button" onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
              </div>
            ) : (
              <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                {regionName || '—'}
                <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" />
              </p>
            )}
            {companyRegions.length === 0 && (
              <p className="text-[10px] text-amber-600 mt-0.5">
                Chưa có khu vực — thêm tại <Link to="/sx/regions" className="underline font-medium">Khu vực SX</Link>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors group cursor-pointer" onClick={() => editing !== (isVC ? 'estimated_value' : 'production_value') && startEdit(isVC ? 'estimated_value' : 'production_value', isVC ? (project.estimated_value || '') : (project.production_value || ''))}>
          <span className="text-sm mt-0.5 shrink-0">💰</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{isVC ? 'Giá trị dự án' : 'Giá trị sản xuất'}</p>
            {editing === (isVC ? 'estimated_value' : 'production_value') ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input type="number" value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                  className="w-full px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400" placeholder="0" />
                <button onClick={() => save(isVC ? 'estimated_value' : 'production_value', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
                <button onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
              </div>
            ) : (
              <p className="text-sm font-medium text-gray-900 flex items-center gap-1">{formatVND(isVC ? project.estimated_value : project.production_value)} <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" /></p>
            )}
          </div>
        </div>

      {/* Ngày đặt hàng */}
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors group cursor-pointer" onClick={() => editing !== 'order_date' && startEdit('order_date', project.order_date ? project.order_date.substring(0, 10) : '')}>
        <span className="text-sm mt-0.5 shrink-0">🛒</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Ngày đặt hàng</p>
          {editing === 'order_date' ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <input type="date" value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                className="px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400" />
              <button onClick={() => save('order_date', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
              <button onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
            </div>
          ) : (
            <p className="text-sm font-medium text-gray-900 flex items-center gap-1">{project.order_date ? formatDate(project.order_date) : '—'} <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" /></p>
          )}
        </div>
      </div>

      {/* Ngày giao hàng */}
      {(() => {
        const dd = project.delivery_date;
        const ddDate = dd ? new Date(dd) : null;
        const isOverdue = ddDate && ddDate < new Date();
        const isSoon = ddDate && !isOverdue && ddDate < new Date(Date.now() + 3 * 86400000);
        return (
          <div className={`flex items-start gap-2 py-2 px-1 rounded-lg -mx-1 transition-colors group cursor-pointer ${isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}
            onClick={() => editing !== 'delivery_date' && startEdit('delivery_date', dd ? dd.substring(0, 10) : '')}>
            <span className="text-sm mt-0.5 shrink-0">🚚</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Ngày giao hàng</p>
              {editing === 'delivery_date' ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <input type="date" value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                    className="px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400" />
                  <button onClick={() => save('delivery_date', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
                  <button onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
                </div>
              ) : (
                <p className={`text-sm font-medium flex items-center gap-1 ${isOverdue ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-gray-900'}`}>
                  {dd ? formatDate(dd) : '—'}
                  {isOverdue && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">Trễ!</span>}
                  {isSoon && <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-bold">Sắp tới</span>}
                  <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" />
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Deadline */}
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors group cursor-pointer" onClick={() => editing !== 'deadline' && startEdit('deadline', project.deadline ? project.deadline.substring(0, 10) : '')}>
        <span className="text-sm mt-0.5 shrink-0">📅</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Deadline tổng</p>
          {editing === 'deadline' ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <input type="date" value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                className="px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400" />
              <button onClick={() => save('deadline', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
              <button onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
            </div>
          ) : (
            <p className="text-sm font-medium text-gray-900 flex items-center gap-1">{project.deadline ? formatDate(project.deadline) : '—'} <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" /></p>
          )}
        </div>
      </div>

      {/* Deadline giao hàng (VC) */}
      {isVC && (() => {
        const fieldKey = 'deadline';
        const pd = project.deadline;
        const pdDate = pd ? new Date(pd) : null;
        const isOverdue = pdDate && pdDate < new Date();
        const isSoon = pdDate && !isOverdue && pdDate < new Date(Date.now() + 3 * 86400000);
        return (
          <div className={`flex items-start gap-2 py-2 px-1 rounded-lg -mx-1 transition-colors group cursor-pointer ${isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}
            onClick={() => editing !== fieldKey && startEdit(fieldKey, pd ? pd.substring(0, 10) : '')}>
            <span className="text-sm mt-0.5 shrink-0">{isVC ? '🚚' : '🏭'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Deadline giao hàng</p>
              {editing === fieldKey ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <input type="date" value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                    className="px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400" />
                  <button onClick={() => save(fieldKey, draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
                  <button onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
                </div>
              ) : (
                <p className={`text-sm font-medium flex items-center gap-1 ${isOverdue ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-gray-900'}`}>
                  {pd ? formatDate(pd) : '—'}
                  {isOverdue && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">Trễ!</span>}
                  {isSoon && <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-bold">Sắp tới</span>}
                  <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" />
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Địa chỉ lắp đặt (VC only) */}
      {isVC && (
        <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors group cursor-pointer"
          onClick={() => editing !== 'install_address' && startEdit('install_address', project.install_address || project.customer?.address || '')}>
          <span className="text-sm mt-0.5 shrink-0">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Địa chỉ lắp đặt</p>
            {editing === 'install_address' ? (
              <div className="flex items-start gap-1" onClick={e => e.stopPropagation()}>
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} autoFocus
                  className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400 resize-none" placeholder="Nhập địa chỉ lắp đặt..." />
                <div className="flex flex-col gap-1">
                  <button onClick={() => save('install_address', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
                  <button onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
                </div>
              </div>
            ) : (
              <p className="text-sm font-medium text-gray-900 flex items-start gap-1">
                <span className="flex-1">{project.install_address || project.customer?.address || '—'}</span>
                <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 mt-0.5 shrink-0" />
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tiến độ SX / Lắp đặt */}
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors">
        <span className="text-sm mt-0.5 shrink-0">📊</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">
            {isVC ? 'Tiến độ lắp đặt' : 'Tiến độ sản xuất'}
          </p>
          <p className="text-sm font-medium text-gray-900">{prob}%</p>
          <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div className={`${isVC ? 'bg-orange-500' : 'bg-blue-600'} h-full rounded-full transition-all duration-300`} style={{ width: `${prob}%` }} />
          </div>
        </div>
      </div>

      {/* Ưu tiên */}
      <div className="flex items-start gap-2 py-2 px-1 rounded-lg hover:bg-gray-50 -mx-1 transition-colors group cursor-pointer" onClick={() => editing !== 'priority' && startEdit('priority', project.priority || 'medium')}>
        <span className="text-sm mt-0.5 shrink-0">🎯</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">Ưu tiên</p>
          {editing === 'priority' ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <select value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                className="px-2 py-1 border border-blue-300 rounded text-sm outline-none focus:ring-1 focus:ring-blue-400">
                <option value="low">🟢 Thấp</option>
                <option value="medium">🟡 Trung bình</option>
                <option value="high">🔴 Cao</option>
              </select>
              <button onClick={() => save('priority', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓</button>
              <button onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">✕</button>
            </div>
          ) : (
            <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
              {project.priority === 'high' ? '🔴 Cao' : project.priority === 'medium' ? '🟡 Trung bình' : '🟢 Thấp'}
              <Edit2 className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" />
            </p>
          )}
        </div>
      </div>

      {/* Ghi chú xưởng / giao hàng */}
      <div className="pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
            {isVC ? 'Ghi chú vận chuyển' : 'Ghi chú nội bộ xưởng'}
          </p>
          {editing !== 'notes' && <button onClick={() => startEdit('notes', project.notes || '')} className="text-[10px] text-blue-500 hover:text-blue-700 cursor-pointer">Sửa</button>}
        </div>
        {editing === 'notes' ? (
          <div className="space-y-1">
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} autoFocus
              className="w-full px-2 py-1.5 border border-blue-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-400 resize-none"
              placeholder={isVC ? 'Ghi chú vận chuyển, lắp đặt...' : 'Ghi chú nội bộ...'} />
            <div className="flex gap-1">
              <button onClick={() => save('notes', draft)} disabled={saving} className="px-2 py-1 bg-blue-600 text-white rounded text-xs cursor-pointer disabled:opacity-50">✓ Lưu</button>
              <button onClick={cancelEdit} className="px-2 py-1 bg-gray-100 rounded text-xs cursor-pointer">Hủy</button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-700 whitespace-pre-wrap">{project.notes || <span className="text-gray-400 italic">Chưa có ghi chú</span>}</p>
        )}
      </div>

      {/* Ghi chú xưởng SX (production_note) — chỉ hiện cho SX */}
      {!isVC && project.production_note && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Ghi chú kỹ thuật SX</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap">{project.production_note}</p>
        </div>
      )}
    </div>
  );
}

function getFileIcon(name) {
  if (!name) return '📄';
  const ext = name.split('.').pop()?.toLowerCase();
  const map = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', dwg: '📐', dxf: '📐', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', zip: '📦', rar: '📦', mp4: '🎬', mov: '🎬', webm: '🎬', avi: '🎬' };
  return map[ext] || '📄';
}

const CRM_DOC_TYPES = [
  { value: 'requirement', label: 'Yêu cầu KH', icon: '📝' },
  { value: 'drawing', label: 'Bản vẽ', icon: '📐' },
  { value: 'image', label: 'Hình ảnh', icon: '🖼️' },
  { value: 'contract', label: 'Hợp đồng', icon: '📄' },
  { value: 'measurement', label: 'Số đo', icon: '📏' },
  { value: 'other', label: 'Khác', icon: '📎' },
];

/** Thứ tự giai đoạn pipeline CRM — khớp CRMTasksTab / LeadDetail */
const CRM_STAGE_ORDER = [
  'consulting', 'design', 'quotation', 'contract',
  'deal_new', 'deal_quote_contract', 'deal_ordering', 'deal_schedule', 'deal_shipping', 'deal_notes',
  'sx_tiep_nhan', 'sx_thiet_ke_ke_hoach', 'sx_kiem_tra_cheo', 'sx_vat_tu',
  'sx_san_xuat_thung', 'sx_san_xuat_alu', 'sx_hoan_thien', 'sx_dong_goi', 'sx_giao_hang',
];

const CRM_STAGE_LABELS = {
  consulting: '💬 Tư vấn',
  design: '🎨 Thiết kế',
  quotation: '💰 Báo giá',
  contract: '📄 Hợp đồng',
  deal_new: '📋 Nhiệm vụ Deal mới',
  deal_quote_contract: '📄 Báo giá & Hợp đồng',
  deal_ordering: '🛒 Tiến hành đặt hàng',
  deal_schedule: '📅 Hẹn ngày lắp đặt',
  deal_shipping: '🚛 Đặt Vận chuyển',
  deal_notes: '📝 Ghi chú khác',
  sx_tiep_nhan: '1️⃣ Tiếp nhận',
  sx_thiet_ke_ke_hoach: '2️⃣ Thiết kế và lên kế hoạch',
  sx_kiem_tra_cheo: '3️⃣ Kiểm tra chéo',
  sx_vat_tu: '4️⃣ Vật tư',
  sx_san_xuat_thung: '5️⃣ Sản xuất thùng',
  sx_san_xuat_alu: '6️⃣ Sản xuất alu',
  sx_hoan_thien: '7️⃣ Hoàn thiện',
  sx_dong_goi: '8️⃣ Đóng gói',
  sx_giao_hang: '9️⃣ Giao hàng',
};

function isCrmDocFromTask(doc) {
  return !!(doc?.source_attachment_id || doc?.source_crm_task_id || doc?.is_from_task);
}

/** lead_documents.name thường lưu `[Tên nhiệm vụ] tên file` — bóc prefix khi đã hiện tên NV ở nhóm cha. */
function stripLeadDocumentTaskPrefix(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const bracket = s.match(/^\[([^\]]+)\]\s*(.*)$/s);
  if (bracket) {
    const rest = (bracket[2] || '').trim();
    if (rest.startsWith('📝')) {
      const noteBody = rest.replace(/^📝\s*(Ghi chú:?\s*)?/i, '').trim();
      return noteBody || 'Ghi chú';
    }
    return rest || bracket[1];
  }
  if (s.startsWith('📝 Ghi chú:')) return s.replace(/^📝 Ghi chú:\s*/, '').trim() || 'Ghi chú';
  return s;
}

function resolveCrmDocDisplayTitle(doc, { preferFileName = false } = {}) {
  const fileName = doc.file_name || doc.file_path?.split('/').pop() || '';
  const isNote = doc.doc_type === 'task_inline_note' || doc.doc_type === 'task_note'
    || (!doc.file_url && !!doc.notes);
  if (isNote) return stripLeadDocumentTaskPrefix(doc.name) || 'Ghi chú';
  if (isCrmDocFromTask(doc)) {
    if (preferFileName && fileName) return fileName;
    const stripped = stripLeadDocumentTaskPrefix(doc.name);
    if (fileName && stripped !== doc.name) return fileName;
    if (stripped && stripped !== doc.name) return stripped;
    return fileName || stripped || doc.name || 'Tài liệu';
  }
  return doc.name || fileName || 'Tài liệu';
}

/** Nhóm tài liệu CRM: giai đoạn → nhiệm vụ → checklist → file (khớp tab Nhiệm vụ). */
function buildCrmSharedDocSections(docs, taskMetaMap, stageSlugLabelMap = {}) {
  const { sections, manualDocs } = buildCrmLeadDocTaskSections(
    docs,
    taskMetaMap,
    stageSlugLabelMap,
    CRM_STAGE_LABELS,
  );
  return { taskSections: sections, manualDocs };
}

/** Khối tài liệu CRM — mỗi file một dòng, nhóm theo giai đoạn → nhiệm vụ */
function CrmSharedDocumentsPanel({
  docs, workshopModule, crmLeadId, dealLabel, onVisibilitySaved, taskMetaMap = {}, stageSlugLabelMap = {},
}) {
  const { taskSections, manualDocs } = useMemo(
    () => buildCrmSharedDocSections(docs, taskMetaMap, stageSlugLabelMap),
    [docs, taskMetaMap, stageSlugLabelMap],
  );

  if (!docs.length) return null;

  const moduleLabel = workshopModule === 'logistics' ? 'Vận chuyển' : 'Sản xuất';

  return (
    <div className="mb-5 rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/90 via-white to-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-violet-100 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-violet-900">📋 Tài liệu từ CRM</p>
          <p className="text-xs text-violet-700/85 mt-0.5 leading-relaxed">
            {docs.length} tài liệu được chia sẻ sang <strong>{moduleLabel}</strong>
            {dealLabel ? <> · Deal <span className="font-mono">{dealLabel}</span></> : null}
          </p>
        </div>
        {crmLeadId && (
          <Link
            to={`/crm/leads/${crmLeadId}?tab=documents`}
            className="shrink-0 h-8 px-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
          >
            Mở trên CRM →
          </Link>
        )}
      </div>

      <div className="p-4 space-y-4">
        {taskSections.length > 0 && (
          <div className="space-y-4">
            {taskSections.map((stage) => (
              <div key={stage.stageSlug} className="border border-violet-100 rounded-xl overflow-hidden">
                <div className="bg-gradient-to-r from-violet-50 to-slate-50 px-3 py-2 border-b border-violet-100 flex items-center gap-2">
                  <p className="text-xs font-bold text-gray-700">{stage.stageLabel}</p>
                  <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded-full">{stage.fileCount} file</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {stage.tasks.map((task) => (
                    <div key={task.taskKey}>
                      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Nhiệm vụ</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-gray-900 leading-snug">{task.taskTitle}</span>
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                            📎 {task.checklistGroups.reduce((n, g) => n + g.docs.length, 0)} file
                          </span>
                        </div>
                      </div>
                      {task.checklistGroups.map((ckGroup) => (
                        <div key={`${task.taskKey}-${ckGroup.checklistId}`}>
                          {ckGroup.checklistTitle && (
                            <div className="bg-emerald-50/80 px-4 py-2 border-b border-emerald-100 border-l-4 border-l-emerald-500">
                              <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-0.5">Checklist</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-emerald-950 leading-snug">{ckGroup.checklistTitle}</span>
                                <span className="text-[10px] text-emerald-700 font-medium">{ckGroup.docs.length} mục</span>
                              </div>
                            </div>
                          )}
                          <div className="divide-y divide-gray-50 bg-white">
                            {ckGroup.docs.map((doc) => (
                              <div key={doc.id} className="px-3 py-1">
                                <DocRow
                                  doc={doc}
                                  crmPresentation
                                  nested
                                  workshopModule={workshopModule}
                                  onVisibilitySaved={onVisibilitySaved}
                                  stageSlugLabelMap={stageSlugLabelMap}
                                  taskMetaMap={taskMetaMap}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {manualDocs.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-2">
              📄 Tài liệu thêm trên deal ({manualDocs.length})
            </p>
            <div className="space-y-2">
              {manualDocs.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  crmPresentation
                  workshopModule={workshopModule}
                  onVisibilitySaved={onVisibilitySaved}
                  stageSlugLabelMap={stageSlugLabelMap}
                  taskMetaMap={taskMetaMap}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Row tài liệu — rich preview như CRM DocumentRow; crmVisibility = chia sẻ từ lead_documents */
function DocRow({
  doc, onDelete, workshopModule, onVisibilitySaved, crmPresentation = false, nested = false, stageSlugLabelMap = {}, taskMetaMap = {},
}) {
  const [expanded, setExpanded] = useState(false);
  const [showVis, setShowVis] = useState(false);
  const [sharedToWorkshop, setSharedToWorkshop] = useState(!!doc.shared_to_workshop);
  const [allowedMods, setAllowedMods] = useState(() => parseShareModules(doc.allowed_share_modules) || []);
  const [savingVis, setSavingVis] = useState(false);

  const typeInfo = CRM_DOC_TYPES.find((t) => t.value === doc.doc_type) || CRM_DOC_TYPES[5];
  const fileName = doc.file_name || doc.file_path?.split('/').pop() || '';
  const displayTitle = crmPresentation
    ? resolveCrmDocDisplayTitle(doc, { preferFileName: nested })
    : (fileName || doc.name || 'Tài liệu');
  const fileHref = doc.file_url ? pubUrl(doc.file_url) : '';
  const fileOpenProps = fileHref ? getFileOpenAnchorProps(doc.file_url, { fileName: fileName || displayTitle }) : null;
  const isFile = !!fileHref;
  const mime = doc.mime_type || '';
  const isImage = isFile && (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName || doc.file_url || ''));
  const isVideo = isFile && (mime.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(fileName || doc.file_url || ''));
  const hasExtra = doc.notes || isImage || isVideo;
  const crmShareUi = typeof doc.shared_to_workshop === 'boolean' && doc.id && onVisibilitySaved;
  const showCrmMeta = crmPresentation || crmShareUi;
  const resolvedStageBadge = doc.crm_stage_slug || doc.crm_stage_group_label
    ? resolveCrmPipelineStageLabel(doc.crm_stage_slug || doc.crm_stage_group_label, {
      slugLabelMap: stageSlugLabelMap,
      taskMetaMap,
      staticLabels: CRM_STAGE_LABELS,
    })
    : null;
  const showStageBadge = showCrmMeta && resolvedStageBadge && !nested && resolvedStageBadge !== '📋 Khác';
  const visibleHere =
    !workshopModule || isLeadDocVisibleInModule(doc, workshopModule);

  const openVis = () => {
    setSharedToWorkshop(!!doc.shared_to_workshop);
    setAllowedMods(parseShareModules(doc.allowed_share_modules) || []);
    setShowVis(true);
  };

  const saveVis = async () => {
    setSavingVis(true);
    try {
      await api.put(`/crm/documents/${doc.id}/visibility`, {
        allowed_companies: doc.allowed_companies ?? null,
        allowed_departments: doc.allowed_departments ?? null,
        shared_to_workshop: !!sharedToWorkshop,
        allowed_share_modules: sharedToWorkshop ? cleanShareModulesForApi(allowedMods) : null,
      });
      setShowVis(false);
      onVisibilitySaved?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    }
    setSavingVis(false);
  };

  return (
    <div className={nested ? 'border-b border-gray-50 last:border-b-0' : 'bg-gray-50 rounded-lg border overflow-hidden'}>
      <div className={`flex items-center justify-between ${nested ? 'py-2' : 'p-3'}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={() => hasExtra && setExpanded(!expanded)}>
          <span className="text-lg shrink-0">{isVideo ? '🎬' : (showCrmMeta ? typeInfo.icon : getFileIcon(fileName || displayTitle))}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{displayTitle}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {showCrmMeta ? (
                <span className="text-xs text-gray-500">
                  {typeInfo.label}
                  {isFile && fileName && displayTitle !== fileName ? ` · ${fileName}` : !isFile ? ' · Văn bản' : ''}
                  {isImage ? ' · 🖼️' : ''}
                  {isVideo ? ' · 🎬' : ''}
                </span>
              ) : (
                <span className="text-xs text-gray-500">{isImage ? '🖼️ Ảnh' : isVideo ? '🎬 Video' : '📄 File'}</span>
              )}
              {doc.file_size > 0 && <span className="text-[10px] text-gray-400">{doc.file_size > 1048576 ? `${(doc.file_size/1048576).toFixed(1)} MB` : `${(doc.file_size/1024).toFixed(1)} KB`}</span>}
              {doc.created_at && <span className="text-[10px] text-gray-400">{new Date(doc.created_at).toLocaleDateString('vi-VN')}</span>}
              {(doc.uploader?.full_name || doc.creator?.full_name) && <span className="text-[10px] text-gray-400">· {doc.uploader?.full_name || doc.creator?.full_name}</span>}
              {showCrmMeta && isCrmDocFromTask(doc) && !nested && (
                <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">📌 Từ nhiệm vụ</span>
              )}
              {showStageBadge && (
                <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">{resolvedStageBadge}</span>
              )}
              {crmShareUi && doc.shared_to_workshop && (
                <span className="text-[9px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">🧩 {shareModuleLabels(doc.allowed_share_modules)}</span>
              )}
              {crmShareUi && workshopModule && !visibleHere && (
                <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded-full font-medium">Ẩn ở module này</span>
              )}
            </div>
          </div>
          {isFile && !isImage && !isVideo && fileOpenProps && (
            <a {...fileOpenProps} className="text-xs text-blue-600 hover:underline shrink-0 px-2" onClick={e => e.stopPropagation()}>Mở</a>
          )}
          {hasExtra && <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />}
        </div>
        <div className="flex items-center shrink-0">
          {crmShareUi && (
            <button
              type="button"
              title="Chia sẻ module SX / VC / CV — ai được xem"
              onClick={(e) => { e.stopPropagation(); openVis(); }}
              className="p-1 hover:bg-slate-200 text-slate-600 rounded cursor-pointer"
            >
              ⚙️
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 hover:bg-red-100 text-red-500 rounded ml-1 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
      {isVideo && (
        <div className={`px-3 ${expanded ? 'pb-3' : 'pb-2'}`}>
          <video src={fileHref} controls preload="metadata" className={`w-full rounded-lg border border-gray-200 bg-black shadow-sm ${expanded ? 'max-h-96' : 'max-h-40'}`} />
        </div>
      )}
      {isImage && !expanded && fileOpenProps && (
        <div className="px-3 pb-2">
          <a {...fileOpenProps} className="block"><img src={fileHref} alt={displayTitle} className="max-h-24 rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90 transition-opacity" /></a>
        </div>
      )}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {isImage && fileOpenProps && (
            <a {...fileOpenProps} className="block"><img src={fileHref} alt={displayTitle} className="max-h-64 max-w-full rounded-lg border border-gray-200 object-contain cursor-pointer hover:opacity-90" /></a>
          )}
          {doc.notes && <div className="bg-white rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap border">{doc.notes}</div>}
        </div>
      )}

      {showVis && crmShareUi && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => !savingVis && setShowVis(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-900">Ai được xem tài liệu này?</p>
            <p className="text-xs text-gray-500">Chọn khối được xem (vd. chỉ Sản xuất — VC/LĐ không thấy).</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sharedToWorkshop} onChange={(e) => setSharedToWorkshop(e.target.checked)} />
              Chia sẻ sang khối SX / VC / Công việc dự án
            </label>
            {sharedToWorkshop && (
              <DocumentShareModulePicker value={allowedMods} onChange={setAllowedMods} />
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50" onClick={() => setShowVis(false)} disabled={savingVis}>Hủy</button>
              <button type="button" className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60" onClick={saveVis} disabled={savingVis}>{savingVis ? '…' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tab Công việc khi chưa có deal CRM gắn `project_id`: hiển thị nhiệm vụ bảng `tasks` (pipeline workflow dự án). */
function WorkshopTasksFallbackPanel({ tasks, moduleLabel, onToggleDone, onEnsureCrmDeal, ensuringCrmDeal = false }) {
  const grouped = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      const label = t.stage?.name || t.stage?.slug || 'Khác';
      if (!m.has(label)) m.set(label, []);
      m.get(label).push(t);
    }
    return Array.from(m.entries());
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold text-amber-900">Đang xem nhiệm vụ xưởng (bảng dự án)</p>
        <p className="text-xs text-amber-800/95 mt-1 leading-relaxed">
          Dự án này chưa có deal CRM nào được gắn <span className="font-mono bg-amber-100/90 px-1 rounded">project_id</span> — không tải được
          pipeline CRM (nhiệm vụ <span className="font-mono">sx_*</span> trên deal). Các dòng dưới là nhiệm vụ trên dự án (quy trình {moduleLabel}).
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={() => onEnsureCrmDeal?.()}
            disabled={!onEnsureCrmDeal || ensuringCrmDeal}
            className="h-8 px-3 rounded-lg bg-amber-900 text-amber-50 text-xs font-semibold hover:bg-amber-950 disabled:opacity-60"
            title="Tạo deal CRM gắn project_id và gen nhiệm vụ sx_*"
          >
            {ensuringCrmDeal ? 'Đang gen…' : 'Gen nhiệm vụ SX (tự tạo deal)'}
          </button>
          <p className="text-[11px] text-amber-900/80">
            Nếu lúc đầu lỗi / mạng chập chờn, bấm nút này để thử lại (không ảnh hưởng nhiệm vụ đang có trên dự án).
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {grouped.map(([stageLabel, rows]) => (
          <div key={stageLabel}>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{stageLabel}</p>
            <ul className="space-y-2">
              {rows.map((task) => {
                const done = task.status === 'done';
                const Icon = done ? CheckCircle2 : Circle;
                return (
                  <li
                    key={task.id}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleDone?.(task)}
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-teal-600 cursor-pointer"
                      title={done ? 'Đánh dấu chưa xong' : 'Hoàn thành'}
                    >
                      <Icon className={`h-4 w-4 ${done ? 'text-teal-600' : ''}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                        {task.title || '—'}
                      </p>
                      {task.assignee?.full_name && (
                        <p className="text-[11px] text-gray-500 mt-0.5">👤 {task.assignee.full_name}</p>
                      )}
                      {task.due_date && (
                        <p className="text-[11px] text-amber-900 mt-0.5">
                          ⏰ Hạn: {new Date(task.due_date).toLocaleString('vi-VN')}
                        </p>
                      )}
                      {task.metadata?.workshop_template_id && !task.due_date && !done && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Chưa có ngày hẹn — nhân viên tự đặt trên nhiệm vụ.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProductionDetail({ moduleKey = 'sx' }) {
  // moduleKey = 'sx' (sản xuất) | 'vc' (vận chuyển)
  const MOD = moduleKey === 'vc'
    ? { apiPrefix: '/logistics', routePrefix: '/vc', label: 'Vận chuyển', icon: '🚚', stageField: 'vc_kanban_column_id', stagesKey: 'vcKanbanStages' }
    : { apiPrefix: '/production', routePrefix: '/sx', label: 'Sản xuất', icon: '🏭', stageField: 'sx_kanban_column_id', stagesKey: 'sxKanbanStages' };
  const isVC = moduleKey === 'vc';

  // Chỉ tính nhiệm vụ đúng khu SX hoặc VC (metadata.workshop_area + slug), không lẫn bộ mẫu giữa hai module.
  const pickWorkshopTasksForSummary = useCallback(
    (list) =>
      (Array.isArray(list) ? list : []).filter((t) =>
        taskBelongsToWorkshopModule(t, isVC ? 'vc' : 'sx'),
      ),
    [isVC],
  );

  const { id } = useParams();
  const navigate = useNavigate();
  const goToDashboard = () => {
    if (id) markWorkshopPipelineCardFocus(id, moduleKey === 'vc' ? 'vc' : 'sx');
    navigate(`${MOD.routePrefix}/dashboard`);
  };
  const { socket, user } = useAuth();
  const { setCrmNotesAnchor } = useCrmNotesFab();
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState(null);
  const [companyRegions, setCompanyRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fallbackDealIdForTasks, setFallbackDealIdForTasks] = useState(null);
  /** Map crm_tasks.id → { title, stage_slug, order_index } — sắp xếp tài liệu theo nhiệm vụ */
  const [crmTaskMetaMap, setCrmTaskMetaMap] = useState({});
  /** stage_slug (kể cả pl_* uuid) → tên cột pipeline CRM */
  const [crmStageSlugLabelMap, setCrmStageSlugLabelMap] = useState({});
  const [ensuringCrmDeal, setEnsuringCrmDeal] = useState(false);
  const tabFromUrl = searchParams.get('tab');
  const normalizedUrlTab = LEGACY_TAB_MAP[tabFromUrl] || tabFromUrl;
  const tabAllowed = (t) => DEAL_TAB_KEYS.has(t);
  const [activeTab, setActiveTab] = useState(
    tabAllowed(normalizedUrlTab) ? normalizedUrlTab : 'tasks',
  );
  const [crmUsers, setCrmUsers] = useState([]);
  const [crmActivities, setCrmActivities] = useState([]);
  const [crmDealDocs, setCrmDealDocs] = useState([]);
  const [productionTaskSummary, setProductionTaskSummary] = useState({ total: 0, completed: 0, percent: 0 });
  /** Nhiệm vụ trên deal CRM (crm_tasks) — khớp tab CRMTasksTab khi có deal gắn dự án */
  const [crmDealTaskSummary, setCrmDealTaskSummary] = useState({ total: 0, completed: 0, percent: 0 });
  /** Danh sách thô từ GET /tasks?project_id= — dùng khi không có deal CRM để vẫn hiển thị nhiệm vụ xưởng */
  const [workshopTasksForProject, setWorkshopTasksForProject] = useState([]);
  const [savingProductionOwner, setSavingProductionOwner] = useState(false);
  const [vcTeams, setVcTeams] = useState([]);
  const [savingTeamAssign, setSavingTeamAssign] = useState(false);
  const [showAddCrmActivity, setShowAddCrmActivity] = useState(false);
  const [crmActivityForm, setCrmActivityForm] = useState({
    type: 'note', title: '', description: '', outcome: '',
  });
  const [savingCrmActivity, setSavingCrmActivity] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [projectDocs, setProjectDocs] = useState([]); // production-native documents
  const [taskFiles, setTaskFiles] = useState([]); // task file attachments
  const [projectActivities, setProjectActivities] = useState([]); // production-native activities
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: 'note', title: '', description: '', outcome: '' });
  const [savingActivity, setSavingActivity] = useState(false);
  const [showAddTextDoc, setShowAddTextDoc] = useState(false);
  const [textDocForm, setTextDocForm] = useState({ name: '', notes: '' });

  // Title inline editing — same pattern as LeadDetail
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  // Production pipeline stages (loaded from API)
  const [productionStages, setProductionStages] = useState([]);
  const [handoverModal, setHandoverModal] = useState(null); // { projectId, projectName, targetSxStageId }
  // Modal cảnh báo task chặn chuyển giai đoạn (parity CRM) — bật khi PATCH /stage trả 400 code: SX_BLOCKING_TASKS_INCOMPLETE.
  const [blockingTasksModal, setBlockingTasksModal] = useState(null);
  const [handoverLogisticsCompanyId, setHandoverLogisticsCompanyId] = useState('');
  const [handoverCompanies, setHandoverCompanies] = useState([]);
  const [handoverErr, setHandoverErr] = useState('');
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [switchWorkshopModal, setSwitchWorkshopModal] = useState(null);
  const [switchWorkshopSaving, setSwitchWorkshopSaving] = useState(false);

  // Document upload state
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Incidents
  const [incidents, setIncidents] = useState([]);
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ title: '', description: '', severity: 'medium' });
  const [savingIncident, setSavingIncident] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    if (!project?.id) return;
    api.get(`/projects/comments/index?project_ids=${project.id}`)
      .then((r) => {
        const meta = r.data?.[project.id] || r.data?.[String(project.id)];
        setCommentCount(meta?.count || 0);
      })
      .catch(() => setCommentCount(0));
  }, [project?.id]);

  const noteActivities = useMemo(
    () => (crmActivities || []).filter((a) => a.type === 'note'),
    [crmActivities],
  );

  const workshopShareMod = moduleKey === 'vc' ? 'logistics' : 'production';

  /** Chỉ hiện hoạt động đã chia sẻ và thuộc khối hiện tại */
  const sharedActivities = useMemo(
    () => (crmActivities || []).filter(
      (a) => a.shared_to_workshop === true && isCrmSharedArtifactVisibleInModule(a, workshopShareMod),
    ),
    [crmActivities, workshopShareMod],
  );

  const sharedNotes = useMemo(
    () => sharedActivities.filter((a) => a.type === 'note'),
    [sharedActivities],
  );

  const visibleCrmSharedDocs = useMemo(
    () => (project?.sharedDocuments || []).filter((d) => isLeadDocVisibleInModule(d, workshopShareMod)),
    [project?.sharedDocuments, workshopShareMod],
  );

  const crmDealIdForDocs = project?.crmDeals?.[0]?.id || fallbackDealIdForTasks;

  useEffect(() => {
    if (!crmDealIdForDocs) {
      setCrmTaskMetaMap({});
      setCrmStageSlugLabelMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [tasksRes, leadRes] = await Promise.all([
          api.get(`/crm/leads/${crmDealIdForDocs}/tasks`, { params: { task_scope: 'all' } }),
          api.get(`/crm/leads/${crmDealIdForDocs}`).catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        const tasks = Array.isArray(tasksRes.data) ? tasksRes.data : [];
        let pipelineStages = [];
        const pipelineId = leadRes.data?.pipeline_id;
        if (pipelineId) {
          const { stages } = await fetchPipelineStagesById(pipelineId);
          pipelineStages = stages || [];
        }
        const stageOrderById = new Map(
          pipelineStages.map((s) => [String(s.id), s.order_index ?? 999]),
        );
        const map = {};
        tasks.forEach((t, idx) => {
          map[t.id] = {
            title: t.title,
            stage_slug: t.stage_slug,
            stage_name: t.pipeline_stage?.name || null,
            stage_order_index: t.pipeline_stage_id
              ? stageOrderById.get(String(t.pipeline_stage_id))
              : undefined,
            order_index: t.order_index ?? idx,
            checklist: normalizeCrmChecklist(t.checklist),
          };
        });
        setCrmTaskMetaMap(map);
        setCrmStageSlugLabelMap(buildCrmStageSlugLabelMapFromTasks(tasks, pipelineStages));
      } catch {
        if (!cancelled) {
          setCrmTaskMetaMap({});
          setCrmStageSlugLabelMap({});
        }
      }
    })();
    return () => { cancelled = true; };
  }, [crmDealIdForDocs]);

  const refreshCrmActivities = useCallback(async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId) return;
    try {
      const { data } = await api.get(`/crm/leads/${dealId}/activities`);
      setCrmActivities(Array.isArray(data) ? data : []);
    } catch (_) {
      /* giữ danh sách cũ */
    }
  }, [project?.crmDeals?.[0]?.id]);

  useEffect(() => {
    const cid = project?.company_id || project?.company?.id;
    if (!cid || moduleKey === 'vc') {
      setCompanyRegions([]);
      return;
    }
    const forModule = moduleKey === 'vc' ? 'logistics' : 'production';
    api
      .get('/crm/company-regions', { params: { company_id: cid, for_module: forModule } })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setCompanyRegions(list.filter((reg) => reg.is_active !== false));
      })
      .catch(() => setCompanyRegions([]));
  }, [project?.company_id, project?.company?.id, moduleKey]);

  const crmFabDealId = project?.crmDeals?.[0]?.id;

  useEffect(() => {
    if (loadError || loading || !project || !crmFabDealId) return;
    const deal = project.crmDeals?.[0];
    if (!deal || String(deal.id) !== String(crmFabDealId)) return;
    setCrmNotesAnchor({
      leadId: crmFabDealId,
      notes: noteActivities,
      contextLine: `🎯 Deal ${[deal.code, deal.title].filter(Boolean).join(' — ')}`,
      contextBadge: deal?.code || project?.code || '',
      onPosted: refreshCrmActivities,
    });
  }, [
    loadError,
    loading,
    project,
    crmFabDealId,
    noteActivities,
    refreshCrmActivities,
    setCrmNotesAnchor,
  ]);

  const setTab = useCallback((tab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (tab === 'tasks') p.delete('tab');
      else p.set('tab', tab);
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (!t) return;
    const next = LEGACY_TAB_MAP[t] || t;
    if (!tabAllowed(next)) {
      setActiveTab('tasks');
      const p = new URLSearchParams(searchParams);
      p.delete('tab');
      setSearchParams(p, { replace: true });
      return;
    }
    setActiveTab(next);
    if (next !== t) {
      const p = new URLSearchParams(searchParams);
      if (next === 'tasks') p.delete('tab');
      else p.set('tab', next);
      setSearchParams(p, { replace: true });
    }
  }, [id, searchParams, moduleKey, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    const cid = project?.company_id || project?.company?.id || '';
    const forModule = moduleKey === 'vc' ? 'logistics' : 'production';
    api.get('/crm/employees-by-company', {
      params: {
        ...(cid ? { company_id: cid } : {}),
        for_module: forModule,
      },
    }).then((r) => {
      const u = r.data?.users || r.data || [];
      if (!cancelled) setAllUsers(Array.isArray(u) ? u : []);
    }).catch(() => {
      api.get('/users').then((r) => {
        const u = r.data?.users || r.data || [];
        if (!cancelled) setAllUsers(Array.isArray(u) ? u : []);
      }).catch(() => {});
    });
    // Load VC teams (chỉ cần cho module VC)
    if (moduleKey === 'vc') {
      api.get('/workshop-teams').then((r) => {
        if (cancelled) return;
        const rows = r.data?.teams || r.data || [];
        setVcTeams(Array.isArray(rows) ? rows : []);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [moduleKey, project?.company_id, project?.company?.id]);

  useEffect(() => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId) {
      setCrmUsers([]);
      setCrmActivities([]);
      setCrmDealDocs([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [usersRes, actRes, docRes] = await Promise.all([
          api.get('/crm/employees-by-company', {
            params: {
              ...(project?.company_id ? { company_id: project.company_id } : {}),
              for_module: 'crm',
            },
          }).then((r) => r.data?.users || r.data || []).catch(() => []),
          api.get(`/crm/leads/${dealId}/activities`).then((r) => r.data || []).catch(() => []),
          api.get(`/crm/leads/${dealId}/documents`).then((r) => r.data || []).catch(() => []),
        ]);
        if (!cancelled) {
          setCrmUsers(Array.isArray(usersRes) ? usersRes : []);
          setCrmActivities(Array.isArray(actRes) ? actRes : []);
          setCrmDealDocs(Array.isArray(docRes) ? docRes : []);
        }
      } catch (_) {
        if (!cancelled) {
          setCrmUsers([]);
          setCrmActivities([]);
          setCrmDealDocs([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [project?.crmDeals?.[0]?.id, project?.company_id]);

  /**
   * Pipeline SX/VC theo công ty dự án + phân loại (workshop_type_id).
   * GET /projects/:id đã trả sxKanbanStages — chỉ fetch thêm khi thiếu.
   */
  useEffect(() => {
    const embedded = project?.[MOD.stagesKey];
    if (Array.isArray(embedded) && embedded.length) return undefined;
    const cid = project?.company_id || project?.company?.id;
    if (!cid) return undefined;
    const wtId = project?.workshop_type_id || project?.workshop_type?.id || null;
    const params = { company_id: cid };
    if (wtId) params.workshop_type_id = wtId;
    let cancelled = false;
    api.get(`${MOD.apiPrefix}/pipeline-stages`, { params }).then((r) => {
      if (cancelled) return;
      const rows = r.data || [];
      setProductionStages(rows.length ? rows : []);
    }).catch(() => { if (!cancelled) setProductionStages([]); });
    return () => { cancelled = true; };
  }, [MOD.apiPrefix, MOD.stagesKey, project?.company_id, project?.company?.id, project?.workshop_type_id, project?.workshop_type?.id, project?.[MOD.stagesKey]]);

  const loadProjectDocs = useCallback(async (projectId) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/documents`);
      setProjectDocs(data?.documents || []);
    } catch (_) { setProjectDocs([]); }
  }, []);

  const loadTaskFiles = useCallback(async (projectId) => {
    try {
      const forModule = moduleKey === 'vc' ? 'logistics' : 'production';
      const { data } = await api.get(`/projects/${projectId}/task-files`, { params: { for_module: forModule } });
      setTaskFiles(data?.taskFiles || []);
    } catch (_) { setTaskFiles([]); }
  }, [moduleKey]);

  const loadProjectActivities = useCallback(async (projectId) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/activities`);
      setProjectActivities(data?.activities || []);
    } catch (_) { setProjectActivities([]); }
  }, []);

  const summarizeCrmTasks = useCallback((list) => {
    const rows = Array.isArray(list) ? list : [];
    const total = rows.length;
    const completed = rows.filter((t) => t.status === 'completed').length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, []);

  const fetchCrmDealTaskSummary = useCallback(async (dealId) => {
    if (!dealId) {
      setCrmDealTaskSummary({ total: 0, completed: 0, percent: 0 });
      return;
    }
    try {
      const taskScope = moduleKey === 'vc' ? 'crm' : 'production';
      const { data } = await api.get(`/crm/leads/${dealId}/tasks`, { params: { task_scope: taskScope } });
      setCrmDealTaskSummary(summarizeCrmTasks(data));
    } catch {
      setCrmDealTaskSummary({ total: 0, completed: 0, percent: 0 });
    }
  }, [moduleKey, summarizeCrmTasks]);

  const handleCrmTaskSummaryChange = useCallback((summary) => {
    if (!summary || typeof summary.total !== 'number') return;
    setCrmDealTaskSummary(summary);
  }, []);

  useEffect(() => {
    setLoadError(null);
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [projRes, tasksRes] = await Promise.all([
        api.get(`${MOD.apiPrefix}/projects/${id}`),
        api.get('/tasks', { params: { project_id: id } }).catch(() => ({ data: { tasks: [] } })),
      ]);
      const proj = projRes.data?.project;
      if (proj?.id && String(proj.id) !== String(id)) {
        setLoading(false);
        navigate(`${MOD.routePrefix}/projects/${proj.id}`, { replace: true });
        return;
      }
      const list = tasksRes.data?.tasks || tasksRes.data || [];
      setWorkshopTasksForProject(Array.isArray(list) ? list : []);
      const scopedTasks = pickWorkshopTasksForSummary(list);
      const total = scopedTasks.length;
      const completed = scopedTasks.filter((t) => t.status === 'done').length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      setProductionTaskSummary({ total, completed, percent });
      setProject(proj ? { ...proj, productionTaskProgress: percent } : proj);
      if (Array.isArray(proj?.[MOD.stagesKey]) && proj[MOD.stagesKey].length) {
        setProductionStages(proj[MOD.stagesKey]);
      }
      let dealIdForTasks = proj?.crmDeals?.[0]?.id || null;
      setFallbackDealIdForTasks(null);
      try {
        if (!dealIdForTasks && proj?.id) {
          // Fallback giống tab Đơn hàng: tìm deal đơn (fulfillment) theo orders của dự án để gen/hiển thị sx_*.
          const { data: ordData } = await api.get(`/projects/${proj.id}/orders`).catch(() => ({ data: null }));
          const orders = ordData?.orders || [];
          const fid = orders.find((o) => o?.fulfillment_lead_id)?.fulfillment_lead_id || null;
          if (fid) {
            dealIdForTasks = String(fid);
            setFallbackDealIdForTasks(dealIdForTasks);
          }
        }
      } catch (_) { /* ignore */ }
      await fetchCrmDealTaskSummary(dealIdForTasks);
      if (proj?.incidents) setIncidents(proj.incidents);
      loadProjectDocs(id);
      loadTaskFiles(id);
      loadProjectActivities(id);
    } catch (e) {
      console.error(e);
      const st = e.response?.status;
      const d = e.response?.data || {};

      if (st === 404) {
        if (d.reason === 'deal_without_project' && d.crm_lead_id) {
          setLoadError({
            kind: 'deal_without_project',
            crm_lead_id: d.crm_lead_id,
            title: d.title,
            hint: d.hint,
          });
          setLoading(false);
          return;
        }
        if (d.reason === 'broken_project_link') {
          setLoadError({
            kind: 'broken_project_link',
            hint: d.hint,
            project_id: d.project_id,
          });
          setLoading(false);
          return;
        }
        try {
          const { data: lead } = await api.get(`/crm/leads/${id}/detail`);
          if (lead?.project_id) {
            navigate(`${MOD.routePrefix}/projects/${lead.project_id}`, { replace: true });
            return;
          }
          if (lead?.id) {
            setLoadError({
              kind: 'deal_without_project',
              crm_lead_id: lead.id,
              title: lead.title,
              hint: 'Deal chưa có dự án (project_id). Chuyển deal sang Thắng hoặc tạo dự án từ deal.',
            });
            setLoading(false);
            return;
          }
        } catch (_) {
          /* ignore */
        }
        setLoadError({
          kind: 'unknown',
          message: d.hint || d.error || 'Không tìm thấy dự án hoặc deal với id này.',
        });
      } else {
        setLoadError({ kind: 'other', message: d.error || e.message || 'Lỗi tải dữ liệu' });
      }
    }
    setLoading(false);
  };

  const refreshProjectSilently = useCallback(async () => {
    try {
      const [projRes, tasksRes] = await Promise.all([
        api.get(`${MOD.apiPrefix}/projects/${id}`),
        api.get('/tasks', { params: { project_id: id } }).catch(() => ({ data: { tasks: [] } })),
      ]);
      const proj = projRes.data?.project;
      const list = tasksRes.data?.tasks || tasksRes.data || [];
      setWorkshopTasksForProject(Array.isArray(list) ? list : []);
      const scopedTasks = pickWorkshopTasksForSummary(list);
      const total = scopedTasks.length;
      const completed = scopedTasks.filter((t) => t.status === 'done').length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      setProductionTaskSummary({ total, completed, percent });
      setProject(proj ? { ...proj, productionTaskProgress: percent } : proj);
      if (Array.isArray(proj?.[MOD.stagesKey]) && proj[MOD.stagesKey].length) {
        setProductionStages(proj[MOD.stagesKey]);
      }
      const dealId = proj?.crmDeals?.[0]?.id || fallbackDealIdForTasks || null;
      await fetchCrmDealTaskSummary(dealId);
      loadProjectDocs(id);
      loadTaskFiles(id);
    } catch (_) {
      /* giữ state cũ */
    }
  }, [id, MOD.apiPrefix, MOD.stagesKey, pickWorkshopTasksForSummary, fallbackDealIdForTasks, fetchCrmDealTaskSummary, loadProjectDocs, loadTaskFiles]);

  /** Realtime: đồng bộ Kanban + nhiệm vụ CRM giữa web và mobile */
  useEffect(() => {
    if (!socket || !id) return undefined;
    let timer = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshProjectSilently(), 650);
    };
    const onStage = (payload) => {
      const pid = payload?.id || payload?.project_id;
      if (pid && String(pid) !== String(id)) return;
      schedule();
    };
    const onTask = (payload) => {
      if (payload?.project_id && String(payload.project_id) === String(id)) schedule();
    };
    socket.on('project:stage_changed', onStage);
    socket.on('crm:task_changed', onTask);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('project:stage_changed', onStage);
      socket.off('crm:task_changed', onTask);
    };
  }, [socket, id, refreshProjectSilently]);

  useEffect(() => {
    if (!handoverModal) return;
    let cancelled = false;
    setHandoverErr('');
    setHandoverSaving(false);
    setHandoverLogisticsCompanyId('');
    api.get('/companies', { params: { for_module: 'logistics' } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.companies || r.data || [];
        setHandoverCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setHandoverCompanies([]); });
    return () => { cancelled = true; };
  }, [handoverModal]);

  const closeHandoverModal = useCallback(() => {
    setHandoverModal(null);
    setHandoverLogisticsCompanyId('');
    setHandoverCompanies([]);
    setHandoverErr('');
    setHandoverSaving(false);
  }, []);

  const confirmHandoverFromDetail = useCallback(async () => {
    if (!handoverModal?.projectId) return;
    if (!handoverLogisticsCompanyId) {
      setHandoverErr('Vui lòng chọn công ty Vận chuyển/Lắp đặt.');
      return;
    }
    setHandoverSaving(true);
    setHandoverErr('');
    try {
      const sxColId = handoverModal?.targetSxStageId ? String(handoverModal.targetSxStageId) : '';
      const targetCol = sxColId
        ? (productionStages || []).find((s) => String(s.id) === sxColId)
        : null;
      const sxStageMeta = buildSxPipelineStageMeta(targetCol);

      // Optimistic: ghim thẻ sang trạng thái VC ngay trên chi tiết
      setProject((prev) => (prev ? {
        ...prev,
        status: 'shipping',
        current_stage_id: null,
        current_stage: null,
        logistics_company_id: handoverLogisticsCompanyId,
        ...(sxColId ? {
          sx_kanban_column_id: sxColId,
          sx_pipeline_stage: sxStageMeta || prev.sx_pipeline_stage,
          sx_intake: false,
        } : {}),
      } : prev));

      await api.patch(`/production/projects/${handoverModal.projectId}/handover-vc`, {
        logistics_company_id: handoverLogisticsCompanyId,
        ...(sxColId ? { production_pipeline_stage_id: sxColId } : {}),
      });
      closeHandoverModal();
      window.setTimeout(() => { refreshProjectSilently(); }, 200);
    } catch (e) {
      setHandoverErr(e.response?.data?.error || e.message || 'Lỗi bàn giao VC/LĐ');
      refreshProjectSilently();
    }
    setHandoverSaving(false);
  }, [handoverModal, handoverLogisticsCompanyId, closeHandoverModal, refreshProjectSilently, productionStages]);

  const confirmSwitchWorkshopFromDetail = useCallback(async () => {
    if (!switchWorkshopModal?.targetCol || !id || switchWorkshopSaving) return;
    setSwitchWorkshopSaving(true);
    try {
      const { data } = await api.patch(`/production/projects/${id}/switch-workshop-type`, {
        production_pipeline_stage_id: switchWorkshopModal.targetCol.id,
        current_sx_pipeline_stage_id: switchWorkshopModal.currentColId || null,
      });
      const updated = data?.project;
      setProject((prev) => (prev && updated ? {
        ...prev,
        workshop_type_id: updated.workshop_type_id ?? data?.to_workshop_type_id,
        workshop_type: updated.workshop_type ?? prev.workshop_type,
        sx_kanban_column_id: updated.sx_kanban_column_id ?? data?.pipeline_stage_id,
        sx_pipeline_stage: updated.sx_pipeline_stage ?? prev.sx_pipeline_stage,
        sx_intake: false,
        current_stage_id: updated.current_stage_id ?? prev.current_stage_id,
        current_stage: updated.current_stage ?? prev.current_stage,
        status: updated.status ?? prev.status,
      } : prev));
      setSwitchWorkshopModal(null);
      window.setTimeout(() => { refreshProjectSilently(); }, 200);
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('crm-project-badges-refresh', { detail: { projectId: String(id) } }));
        }, 280);
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi chuyển phân loại');
      refreshProjectSilently();
    }
    setSwitchWorkshopSaving(false);
  }, [switchWorkshopModal, switchWorkshopSaving, id, refreshProjectSilently]);

  const ensureCrmDealAndSxTasks = useCallback(async () => {
    if (ensuringCrmDeal) return;
    setEnsuringCrmDeal(true);
    try {
      // Backend GET /production/projects/:id đã tự đảm bảo có crmDeals + sx_* nếu thiếu.
      await refreshProjectSilently();
      // Sau refresh silent, gọi load lại nhẹ để cập nhật fallbackDealIdForTasks nếu cần.
      await load();
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || e.message || 'Không gen được nhiệm vụ SX');
    } finally {
      setEnsuringCrmDeal(false);
    }
  }, [ensuringCrmDeal, refreshProjectSilently]);

  /** Phải đặt trước mọi return sớm (loadError / loading) — Rules of Hooks */
  const scopedWorkshopTasksForTab = useMemo(
    () => pickWorkshopTasksForSummary(workshopTasksForProject),
    [workshopTasksForProject, pickWorkshopTasksForSummary],
  );

  const toggleWorkshopTaskDone = useCallback(async (task) => {
    if (!task?.id) return;
    const next = task.status === 'done' ? 'todo' : 'done';
    try {
      await api.patch(`/tasks/${task.id}/status`, { status: next });
      await refreshProjectSilently();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi cập nhật');
    }
  }, [refreshProjectSilently]);

  const setProductionPerson = useCallback(async (userId) => {
    if (!project?.id) return;
    setSavingProductionOwner(true);
    try {
      const personField = moduleKey === 'vc' ? 'logistics_person_id' : 'production_person_id';
      if (moduleKey === 'vc') {
        // Dùng endpoint assign để kèm thông báo
        await api.patch(`/workshop-teams/projects/${project.id}/assign`, { [personField]: userId || null });
      } else {
        await api.put(`/projects/${project.id}`, { [personField]: userId || null });
      }
      await refreshProjectSilently();
    } catch (e) {
      alert(e.response?.data?.error || `Lỗi phân công ${MOD.label}`);
    }
    setSavingProductionOwner(false);
  }, [project?.id, refreshProjectSilently, moduleKey, MOD.label]);

  const setVcTeamAssign = useCallback(async (field, value) => {
    if (!project?.id || moduleKey !== 'vc') return;
    setSavingTeamAssign(true);
    try {
      await api.patch(`/workshop-teams/projects/${project.id}/assign`, { [field]: value || null });
      await refreshProjectSilently();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gán đội');
    }
    setSavingTeamAssign(false);
  }, [project?.id, moduleKey, refreshProjectSilently]);

  const saveCrmActivity = async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId || !crmActivityForm.title.trim()) {
      alert('Nhập tiêu đề hoạt động');
      return;
    }
    setSavingCrmActivity(true);
    try {
      await api.post(`/crm/leads/${dealId}/activities`, {
        type: crmActivityForm.type,
        title: crmActivityForm.title.trim(),
        description: crmActivityForm.description || '',
        outcome: crmActivityForm.outcome || '',
      });
      const { data } = await api.get(`/crm/leads/${dealId}/activities`);
      setCrmActivities(data || []);
      setShowAddCrmActivity(false);
      setCrmActivityForm({ type: 'note', title: '', description: '', outcome: '' });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi');
    }
    setSavingCrmActivity(false);
  };

  const moveStage = async (stageId) => {
    try {
      let body;
      let optimisticPatch = null;
      if (moduleKey === 'vc') {
        // stageId là logistics_pipeline_stages.id → gửi vc_stage_id
        // Tìm thêm workflow_stage_id nếu có
        const vcStage = pipelineStages.find((s) => s.id === stageId);
        body = { vc_stage_id: stageId };
        if (vcStage?.workflow_stage_id) body.stage_id = vcStage.workflow_stage_id;
        // Nếu là cột intake, dùng move_to_intake
        if (vcStage?.bucket_slug === 'delivery_pending') {
          body = { move_to_intake: true };
        }
        optimisticPatch = {
          vc_kanban_column_id: vcStage?.bucket_slug === 'delivery_pending' ? stageId : stageId,
        };
      } else {
        const sxStage = pipelineStages.find((s) => String(s.id) === String(stageId));
        // Nếu cột SX có cờ "bàn giao VC" → mở modal chọn công ty VC/LĐ thay vì patch stage thường
        if (sxStage?.is_handover_to_logistics === true) {
          setHandoverModal({ projectId: id, projectName: project?.name || project?.code || '', targetSxStageId: sxStage?.id || stageId });
          return;
        }
        if (sxStage?.is_switch_workshop_type === true && sxStage?.target_workshop_type_id) {
          const fromName = project?.workshop_type?.name || 'Phân loại hiện tại';
          const toName = sxStage?.target_workshop_type?.name || 'Phân loại đích';
          setSwitchWorkshopModal({
            targetCol: sxStage,
            fromName,
            toName,
            currentColId: project?.sx_kanban_column_id || project?.crmDeals?.[0]?.sx_pipeline_stage?.id || null,
          });
          return;
        }
        // Intake (Chờ vào xưởng) không có workflow_stage_id → dùng move_to_intake giống Kanban drag.
        if (sxStage?.bucket_slug === 'won_pending' || String(sxStage?.id || '').startsWith('__fb_')) {
          body = { move_to_intake: true };
          optimisticPatch = {
            sx_kanban_column_id: sxStage?.id || stageId,
            sx_intake: true,
            current_stage_id: null,
            current_stage: null,
          };
        } else {
          // Cột Kanban SX (id riêng) — gửi production_pipeline_stages.id, không gửi workflow stage_id
          // (nhiều cột Phúc Đạt dùng chung workflow «Sản xuất» → stage_id không phân biệt được cột).
          const colId = sxStage?.id || stageId;
          const wid = sxStage?.workflow_stage_id || sxStage?.workflow_stage?.id || null;
          body = {
            sx_pipeline_stage_id: colId,
            current_sx_pipeline_stage_id:
              project?.sx_kanban_column_id
              || project?.crmDeals?.[0]?.sx_pipeline_stage?.id
              || null,
          };
          optimisticPatch = {
            sx_kanban_column_id: colId,
            sx_intake: false,
            current_stage_id: wid,
            current_stage: wid ? {
              id: wid,
              slug: sxStage?.slug || sxStage?.workflow_stage?.slug,
              name: sxStage?.workflow_stage?.name || sxStage?.name,
              color: sxStage?.color,
              icon: sxStage?.icon,
            } : null,
          };
        }
      }

      // Optimistic update: đổi tag/cột ngay, không reload trang
      if (optimisticPatch) {
        setProject((prev) => (prev ? { ...prev, ...optimisticPatch } : prev));
      }

      const { data } = await api.patch(`${MOD.apiPrefix}/projects/${id}/stage`, body);
      const p = data.project || data;
      const newSxCol = p.sx_kanban_column_id ?? data.pipeline_stage_id ?? null;
      setProject((prev) => (prev && p ? {
        ...prev,
        status: p.status,
        current_stage_id: p.current_stage_id,
        vc_kanban_column_id: p.vc_kanban_column_id ?? prev.vc_kanban_column_id,
        sx_kanban_column_id: newSxCol ?? prev.sx_kanban_column_id,
        sx_intake: p.sx_intake ?? prev.sx_intake,
        current_stage: p.current_stage || prev.current_stage,
        crmDeals: newSxCol && prev.crmDeals?.length
          ? prev.crmDeals.map((d, i) => (i === 0 ? {
            ...d,
            sx_pipeline_stage: pipelineStages.find((s) => String(s.id) === String(newSxCol))
              || d.sx_pipeline_stage,
          } : d))
          : prev.crmDeals,
      } : prev));

      // Refresh nhẹ để đồng bộ sx_kanban_column_id/sx_intake (API patch không trả đủ field)
      window.setTimeout(() => { refreshProjectSilently(); }, 120);

      if (typeof window !== 'undefined' && id) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('crm-project-badges-refresh', { detail: { projectId: String(id) } }));
        }, 280);
      }
    } catch (e) {
      const respBody = e?.response?.data || {};
      if (respBody.code === 'SX_BLOCKING_TASKS_INCOMPLETE') {
        setBlockingTasksModal({
          currentStageName: respBody.current_stage_name || '',
          targetStageName: respBody.target_stage_name || '',
          remainingTasks: Array.isArray(respBody.remaining_tasks) ? respBody.remaining_tasks : [],
        });
        // Đồng bộ lại UI để rollback optimistic.
        refreshProjectSilently();
        return;
      }
      alert('Lỗi: ' + (respBody?.error || e.message));
      // Nếu optimistic sai do lỗi server, đồng bộ lại
      refreshProjectSilently();
    }
  };

  const saveTitle = async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!titleDraft.trim() || savingTitle) return;
    setSavingTitle(true);
    try {
      if (dealId) {
        const { data } = await api.put(`/crm/leads/${dealId}`, { title: titleDraft.trim() });
        setProject((prev) => prev ? { ...prev, crmDeals: prev.crmDeals?.map((d) => d.id === dealId ? { ...d, ...data } : d) } : prev);
      }
      setEditingTitle(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật tên');
    }
    setSavingTitle(false);
  };

  const saveProjectActivity = async () => {
    if (!activityForm.title.trim()) { alert('Nhập tiêu đề hoạt động'); return; }
    setSavingActivity(true);
    try {
      await api.post(`/projects/${project.id}/activities`, activityForm);
      await loadProjectActivities(project.id);
      setShowAddActivity(false);
      setActivityForm({ type: 'note', title: '', description: '', outcome: '' });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSavingActivity(false);
  };

  const saveIncident = async () => {
    if (!incidentForm.title.trim()) { alert('Nhập tiêu đề sự cố'); return; }
    setSavingIncident(true);
    try {
      const { data } = await api.post(`${MOD.apiPrefix}/projects/${project.id}/incidents`, incidentForm);
      setIncidents((prev) => [data.incident, ...prev]);
      setShowIncidentForm(false);
      setIncidentForm({ title: '', description: '', severity: 'medium' });
    } catch (e) { alert(e.response?.data?.error || 'Lỗi báo sự cố'); }
    setSavingIncident(false);
  };

  const resolveIncident = async (incidentId) => {
    try {
      await api.patch(`${MOD.apiPrefix}/projects/${project.id}/incidents/${incidentId}`, { status: 'resolved' });
      setIncidents((prev) => prev.map((inc) => inc.id === incidentId ? { ...inc, status: 'resolved' } : inc));
    } catch (e) { alert(e.response?.data?.error || 'Lỗi cập nhật sự cố'); }
  };

  const uploadProjectDocument = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      setUploadingDoc(true);
      try {
        const uploaded = [];
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          uploaded.push({ original_name: file.name, file_url: data.url || data.file_url, file_name: data.file_name || file.name, file_size: data.file_size || file.size, mime_type: data.mime_type || file.type });
        }
        await api.post(`/projects/${project.id}/documents/bulk`, { items: uploaded });
        await loadProjectDocs(project.id);
      } catch (err) { alert(err.response?.data?.error || 'Lỗi upload file'); }
      setUploadingDoc(false);
    };
    input.click();
  };

  const deleteProjectDocument = async (docId) => {
    if (!confirm('Xóa tài liệu này?')) return;
    try {
      await api.delete(`/projects/${project.id}/documents/${docId}`);
      await loadProjectDocs(project.id);
    } catch (e) { alert('Lỗi xóa tài liệu'); }
  };

  const uploadDocument = async () => {
    const dealId = project?.crmDeals?.[0]?.id;
    if (!dealId) { alert('Cần liên kết deal CRM để upload tài liệu'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      setUploadingDoc(true);
      try {
        const uploaded = [];
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          uploaded.push({ name: file.name, file_url: data.url || data.file_url, file_name: file.name });
        }
        await api.post(`/crm/leads/${dealId}/documents/bulk`, { documents: uploaded });
        const { data: docs } = await api.get(`/crm/leads/${dealId}/documents`);
        setCrmDealDocs(Array.isArray(docs) ? docs : []);
      } catch (err) {
        alert(err.response?.data?.error || 'Lỗi upload file');
      }
      setUploadingDoc(false);
    };
    input.click();
  };

  if (loadError) {
    const isDealNoProject = loadError.kind === 'deal_without_project';
    const isBroken = loadError.kind === 'broken_project_link';
    return (
      <div className="max-w-lg mx-auto mt-12 p-6 bg-white rounded-xl border border-amber-200 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          {isDealNoProject && 'Deal chưa có dự án xưởng'}
          {isBroken && 'Liên kết deal → dự án bị lỗi'}
          {loadError.kind === 'unknown' && 'Không tìm thấy dự án'}
          {loadError.kind === 'other' && 'Lỗi tải trang'}
        </h2>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{loadError.hint || loadError.message}</p>
        {isDealNoProject && loadError.crm_lead_id && (
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/crm/leads/${loadError.crm_lead_id}`}
              className="inline-flex h-10 px-4 items-center rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
            >
              Mở deal trên CRM → chuyển Thắng / tạo dự án
            </Link>
            <button
              type="button"
            onClick={goToDashboard}
            className="inline-flex h-10 px-4 items-center rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Về dashboard
            </button>
          </div>
        )}
        {!isDealNoProject && (
          <button
            type="button"
            onClick={goToDashboard}
            className="h-10 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Về dashboard
          </button>
        )}
      </div>
    );
  }

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const safeVcTeams = Array.isArray(vcTeams) ? vcTeams : [];
  const safeTaskUsers = (Array.isArray(allUsers) && allUsers.length)
    ? allUsers
    : (Array.isArray(crmUsers) ? crmUsers : []);
  const safeProjectDocs = Array.isArray(projectDocs) ? projectDocs : [];
  const safeTaskFiles = Array.isArray(taskFiles) ? taskFiles : [];

  const defaultPipelineStages = moduleKey === 'vc'
    ? [
        { id: null, slug: 'delivery_pending', name: 'Chờ vận chuyển', color: '#f97316', icon: '📦' },
        { id: null, slug: 'delivery', name: 'Đang vận chuyển', color: '#ea580c', icon: '🚚' },
        { id: null, slug: 'installation', name: 'Đang lắp đặt', color: '#d97706', icon: '🔧' },
        { id: null, slug: 'customer-care', name: 'Bảo hành', color: '#0f766e', icon: '🤝' },
      ]
    : [
        { id: null, slug: 'won_pending', name: 'Chờ vào xưởng', color: '#64748b', icon: '⏳' },
        { id: null, slug: 'production', name: 'Sản xuất', color: '#0f766e', icon: '🏭' },
        { id: null, slug: 'customer-care', name: 'CSKH', color: '#5eead4', icon: '🤝' },
      ];
  const pipelineStages = (moduleKey !== 'vc' && project?.sxKanbanStages?.length)
    ? project.sxKanbanStages
    : (moduleKey === 'vc' && project?.vcKanbanStages?.length)
      ? project.vcKanbanStages
      : productionStages.length
        ? productionStages
        : project.workshopPipeline?.length
          ? project.workshopPipeline
          : defaultPipelineStages;
  const safePipelineStages = Array.isArray(pipelineStages) ? pipelineStages : [];

  // VC dùng vc_kanban_column_id (logistics_pipeline_stages.id) để match stepper
  // SX phải dùng sx_kanban_column_id (production_pipeline_stages.id hoặc __fb_intake__) — không fallback workflow id.
  const currentStageId = moduleKey === 'vc'
    ? (project.vc_kanban_column_id || project.current_stage_id || project.current_stage?.id)
    : resolveSxKanbanCurrentStageId(project, safePipelineStages);
  const primaryCrmDeal = project.crmDeals?.[0];
  const crmLeadId = primaryCrmDeal?.id || fallbackDealIdForTasks;
  const displayCode = primaryCrmDeal?.code || project.code;
  const displayTitle = primaryCrmDeal?.title || project.name;
  const taskCount = crmLeadId
    ? (crmDealTaskSummary.total || 0)
    : (productionTaskSummary.total || 0);
  const taskUsers = safeTaskUsers;

  const tabBtn = (tab, label) => (
    <button
      type="button"
      key={tab}
      onClick={() => setTab(tab)}
      className={`flex-1 py-3 px-4 text-sm font-medium transition-all ${
        activeTab === tab
          ? 'text-blue-600 border-b-2 border-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4 mx-auto">
      {/* Header — same style as LeadDetail */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goToDashboard}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${moduleKey === 'vc' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>
                {MOD.icon} {moduleKey === 'vc' ? 'VC' : 'SX'}
              </span>
              <span className="text-xs text-gray-500 font-mono">{displayCode}</span>
            </div>
            {editingTitle ? (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="h-10 min-w-[320px] max-w-[560px] px-3 border border-gray-300 rounded-lg text-lg font-semibold text-gray-900 bg-white"
                  placeholder="Nhập tên deal"
                  autoFocus
                />
                <button
                  onClick={saveTitle}
                  disabled={savingTitle || !titleDraft.trim()}
                  className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save className="h-4 w-4" /> {savingTitle ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button
                  onClick={() => { setTitleDraft(displayTitle || ''); setEditingTitle(false); }}
                  disabled={savingTitle}
                  className="h-10 px-3 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <X className="h-4 w-4" /> Hủy
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{displayTitle}</h1>
                {crmLeadId && (
                  <button
                    onClick={() => { setTitleDraft(displayTitle || ''); setEditingTitle(true); }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition"
                    title="Sửa tên deal"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/projects/${project.id}`}
            className="h-9 px-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
          >
            <FolderKanban className="h-4 w-4" /> Dự án đầy đủ
          </Link>
          {crmLeadId && (
            <Link
              to={`/crm/leads/${crmLeadId}`}
              className="h-9 px-3 bg-teal-100 text-teal-800 rounded-lg text-sm font-medium flex items-center gap-1.5"
            >
              <FolderKanban className="h-4 w-4" /> CRM deal
            </Link>
          )}
        </div>
      </div>

      {/* Hint phân loại — pipeline stepper bám theo workshop_type của project (công ty + loại). */}
      {moduleKey !== 'vc' && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Pipeline:</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
            🏢 {project.company?.short_name || project.company?.name || 'Chưa có công ty'}
          </span>
          {project.workshop_type?.name || project.workshop_type_id ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium border border-teal-200">
              📦 {project.workshop_type?.name || 'Đã phân loại'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
              ⚠️ Chưa phân loại — chỉ hiển thị cột chung
            </span>
          )}
          {primaryCrmDeal?.crm_region?.name && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 font-medium border border-indigo-200">
              📍 {primaryCrmDeal.crm_region.name}
            </span>
          )}
        </div>
      )}

      {/* Pipeline — shared PipelineStepper component */}
      <PipelineStepper
        stages={safePipelineStages}
        currentStageId={currentStageId}
        onMoveToStage={moveStage}
        linearProgress
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Cột trái — giống LeadDetail */}
        <div className="lg:col-span-1 space-y-4">
          <WorkshopInfoPanel
            project={project}
            onUpdate={refreshProjectSilently}
            moduleKey={moduleKey}
            crmDeal={primaryCrmDeal}
            companyRegions={companyRegions}
            onDealUpdate={(data) => {
              if (!data?.id) return;
              setProject((prev) => (prev ? {
                ...prev,
                crmDeals: prev.crmDeals?.map((d) => (
                  String(d.id) === String(data.id) ? { ...d, ...data } : d
                )),
              } : prev));
            }}
          />

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Hoạt động</p>
              <p className="text-xl font-bold text-blue-600">{crmActivities.length}</p>
            </div>
            <div className="bg-amber-50 rounded-lg border border-amber-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Tài liệu</p>
              <p className="text-xl font-bold text-amber-600">{project.sharedDocuments?.length || 0}</p>
            </div>
            <div className="bg-purple-50 rounded-lg border border-purple-100 p-3 text-center">
              <p className="text-xs text-gray-600 mb-1">Nhiệm vụ {MOD.label}</p>
              <p className="text-xl font-bold text-purple-600">{taskCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase">Đội ngũ</h3>
            {primaryCrmDeal && (
              <div className="space-y-2 pb-3 mb-3 border-b border-gray-100">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">CRM</p>
                <PersonCard label="Phụ trách CRM" person={primaryCrmDeal.assignee || primaryCrmDeal.lead_owner} showPlaceholder />
                {primaryCrmDeal.sx_pipeline_stage?.name && (
                  <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
                    <p className="text-[10px] text-violet-600 font-semibold uppercase">Deal trên Kanban SX</p>
                    <p className="text-sm font-medium text-gray-900">{primaryCrmDeal.sx_pipeline_stage.name}</p>
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Dự án {MOD.label}</p>
            <div className="space-y-2">
              <PersonCard label="Kinh doanh" person={project.sales_person} />
              <PersonCard label="QL dự án" person={project.project_manager} />
              <PersonCard label="Giám sát" person={project.supervisor} />
              <PersonCard label={moduleKey === 'vc' ? 'Người vận chuyển' : 'Phụ trách chính'} person={project.logistics_person || project.production_person} />
              {moduleKey !== 'vc' && (project.production_staff?.length > 0) && (
                <div className="pl-2">
                  <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Đội SX ({project.production_staff.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {project.production_staff.map((u) => (
                      <span
                        key={u.id}
                        className={`text-[11px] px-2 py-0.5 rounded ${u.is_primary ? 'bg-indigo-100 text-indigo-800 font-medium' : 'bg-gray-100 text-gray-700'}`}
                        title={u.is_primary ? 'Phụ trách chính' : undefined}
                      >
                        {u.full_name}{u.is_primary ? ' ★' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="pl-2">
                <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">
                  {moduleKey === 'vc' ? '🚚 Người vận chuyển phụ trách' : `Phân công ${MOD.label}`}
                </p>
                <select
                  value={project.logistics_person?.id || project.logistics_person_id || project.production_person?.id || project.production_person_id || ''}
                  onChange={(e) => setProductionPerson(e.target.value)}
                  disabled={savingProductionOwner}
                  className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                >
                  <option value="">— Chưa phân công —</option>
                  {taskUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>

              {/* VC-only: Đội vận chuyển & người lắp đặt */}
              {moduleKey === 'vc' && (
                <>
                  {/* Đội vận chuyển */}
                  <div className="pl-2">
                    <p className="text-[10px] text-gray-400 uppercase font-medium mb-1 flex items-center gap-1">
                      <Truck className="h-3 w-3 text-orange-500" /> Đội vận chuyển
                    </p>
                    <select
                      value={project.delivery_team?.id || project.delivery_team_id || ''}
                      onChange={(e) => setVcTeamAssign('delivery_team_id', e.target.value)}
                      disabled={savingTeamAssign}
                      className="w-full h-9 px-3 border border-orange-200 rounded-lg text-sm bg-orange-50/40 focus:ring-2 focus:ring-orange-400 disabled:opacity-60"
                    >
                      <option value="">— Chưa gán đội —</option>
                      {safeVcTeams.filter((t) => t.type === 'delivery').map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {project.delivery_team?.name && (
                      <p className="text-[10px] text-orange-600 mt-0.5">✓ {project.delivery_team.name}</p>
                    )}
                  </div>

                  {/* Người lắp đặt */}
                  <div className="pl-2">
                    <p className="text-[10px] text-gray-400 uppercase font-medium mb-1 flex items-center gap-1">
                      <Wrench className="h-3 w-3 text-amber-600" /> Người lắp đặt
                    </p>
                    <select
                      value={project.installer_person?.id || project.installer_person_id || ''}
                      onChange={(e) => setVcTeamAssign('installer_person_id', e.target.value)}
                      disabled={savingTeamAssign}
                      className="w-full h-9 px-3 border border-amber-200 rounded-lg text-sm bg-amber-50/40 focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
                    >
                      <option value="">— Chưa phân công —</option>
                      {taskUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Đội lắp đặt */}
                  <div className="pl-2">
                    <p className="text-[10px] text-gray-400 uppercase font-medium mb-1 flex items-center gap-1">
                      <Wrench className="h-3 w-3 text-amber-600" /> Đội lắp đặt
                    </p>
                    <select
                      value={project.installation_team?.id || project.installation_team_id || ''}
                      onChange={(e) => setVcTeamAssign('installation_team_id', e.target.value)}
                      disabled={savingTeamAssign}
                      className="w-full h-9 px-3 border border-amber-200 rounded-lg text-sm bg-amber-50/40 focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
                    >
                      <option value="">— Chưa gán đội —</option>
                      {safeVcTeams.filter((t) => t.type === 'installation').map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {project.installation_team?.name && (
                      <p className="text-[10px] text-amber-600 mt-0.5">✓ {project.installation_team.name}</p>
                    )}
                  </div>
                </>
              )}

              <PersonCard label="CSKH" person={project.care_person} />
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">Công ty phụ trách</p>
              <p className="text-sm text-gray-800">
                {(() => {
                  const c = isVC ? (project.logistics_company || null) : (project.company || null);
                  const fallback = project.company || null;
                  const pick = c || (isVC ? fallback : null);
                  return pick
                    ? `${pick.name}${pick.short_name ? ` (${pick.short_name})` : ''}`
                    : '—';
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* Cột phải — tab giống LeadDetail */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl border">
            {/* Tab bar — giống LeadDetail, bỏ Facebook và Tổng đài */}
            <div className="flex border-b flex-wrap">
              {tabBtn('tasks', `✅ Công việc${taskCount ? ` (${taskCount})` : ''}`)}
              {tabBtn('documents', `📋 Tài liệu (${safeProjectDocs.length + visibleCrmSharedDocs.length + safeTaskFiles.length})`)}
              {tabBtn('notes', `📝 Ghi chú (${sharedNotes.length})`)}
              {tabBtn('comments', `💬 Bình luận${commentCount > 0 ? ` (${commentCount})` : ''}`)}
              {tabBtn('incidents', incidents.filter(i => i.status === 'open' || i.status === 'in_progress').length > 0
                ? `⚠️ Sự cố (${incidents.filter(i => i.status === 'open' || i.status === 'in_progress').length})`
                : '⚠️ Sự cố')}
              {tabBtn('team', '👥 Thành viên')}
              {tabBtn('approvals', '✅ Gửi duyệt')}
            </div>

            <div className="p-5">
              {activeTab === 'tasks' && (
                <>
                {crmLeadId ? (
                  <CRMTasksTab
                    leadId={crmLeadId}
                    leadType="deal"
                    users={taskUsers}
                    taskScope={moduleKey === 'vc' ? 'crm' : 'production'}
                    onArtifactsSynced={refreshProjectSilently}
                    onTaskSummaryChange={handleCrmTaskSummaryChange}
                    linkedProjectId={project?.id || null}
                  />
                ) : scopedWorkshopTasksForTab.length > 0 ? (
                  <WorkshopTasksFallbackPanel
                    tasks={scopedWorkshopTasksForTab}
                    moduleLabel={MOD.label}
                    onToggleDone={toggleWorkshopTaskDone}
                    onEnsureCrmDeal={ensureCrmDealAndSxTasks}
                    ensuringCrmDeal={ensuringCrmDeal}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-500 text-sm border border-dashed border-gray-200 rounded-xl space-y-2 px-4">
                    <p>Chưa có deal CRM gắn dự án (<span className="font-mono text-xs">crm_leads.project_id</span>) và chưa có nhiệm vụ xưởng trên dự án.</p>
                    <p className="text-xs text-gray-400">
                      Gắn deal từ CRM (deal phải trỏ đúng <span className="font-mono">project_id</span>) để dùng tab pipeline CRM; hoặc thêm nhiệm vụ trực tiếp trên dự án / CRM.
                    </p>
                  </div>
                )}
                <div className="mt-6">
                  <UnifiedTaskHistoryWidget projectId={id} />
                </div>
                </>
              )}

              {/* Tài liệu */}
              {activeTab === 'documents' && (
                <>
                  {/* Header buttons */}
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {uploadingDoc ? (
                      <span className="h-8 px-3 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium flex items-center gap-1.5">
                        <span className="animate-spin h-3.5 w-3.5 border-2 border-orange-600 border-t-transparent rounded-full" /> Đang tải lên...
                      </span>
                    ) : (
                      <button type="button" onClick={uploadProjectDocument} className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                        <FileUp className="h-3.5 w-3.5" /> Upload file xưởng
                      </button>
                    )}
                    <button type="button" onClick={() => setShowAddTextDoc(true)} className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                      <Plus className="h-3.5 w-3.5" /> Nhập văn bản
                    </button>
                  </div>

                  <CrmSharedDocumentsPanel
                    docs={visibleCrmSharedDocs}
                    workshopModule={workshopShareMod}
                    crmLeadId={crmLeadId}
                    dealLabel={displayCode}
                    taskMetaMap={crmTaskMetaMap}
                    stageSlugLabelMap={crmStageSlugLabelMap}
                    onVisibilitySaved={refreshProjectSilently}
                  />

                  {/* Production-native documents */}
                  {projectDocs.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">📁 Tài liệu xưởng ({projectDocs.length})</p>
                      <div className="space-y-2">
                        {projectDocs.map(doc => <DocRow key={doc.id} doc={doc} onDelete={() => deleteProjectDocument(doc.id)} />)}
                      </div>
                    </div>
                  )}

                  {/* Task file attachments */}
                  {taskFiles.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">📌 File đính kèm nhiệm vụ ({taskFiles.length})</p>
                      <div className="space-y-1">
                        {taskFiles.map(f => (
                          <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border rounded-lg">
                            <span className="text-sm shrink-0">{getFileIcon(f.file_name)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{f.file_name}</p>
                              {f.task?.title && <p className="text-[10px] text-purple-600 truncate">📌 {f.task.title}</p>}
                            </div>
                            {f.file_url && (
                              <a {...getFileOpenAnchorProps(f.file_url, { fileName: f.file_name })} className="text-[10px] text-blue-600 hover:underline shrink-0">Mở</a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {projectDocs.length === 0 && visibleCrmSharedDocs.length === 0 && taskFiles.length === 0 && (
                    <div className="text-center py-10 bg-gray-50 rounded-lg border-2 border-dashed">
                      <FileUp className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Chưa có tài liệu nào</p>
                      <p className="text-xs text-gray-400 mt-1">Upload file xưởng hoặc bật chia sẻ từ CRM</p>
                    </div>
                  )}

                  {(project.hiddenDocumentsCount || 0) > 0 && (
                    <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                      Còn <strong>{project.hiddenDocumentsCount}</strong> tài liệu CRM chưa chia sẻ xưởng.
                    </div>
                  )}
                </>
              )}

              {/* Hoạt động */}
              {activeTab === 'activities' && (
                <>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <button type="button" onClick={() => crmLeadId ? setShowAddCrmActivity(true) : setShowAddActivity(true)}
                      className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                      <Plus className="h-3.5 w-3.5" /> Thêm hoạt động
                    </button>
                  </div>

                  {/* Production-native activities (no CRM) */}
                  {!crmLeadId && (
                    projectActivities.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageSquare className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">Chưa có hoạt động nào</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        <div className="relative">
                          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-blue-100" />
                          {projectActivities.map((act) => {
                            let parsed = null;
                            try { parsed = JSON.parse(act.content); } catch { parsed = null; }
                            const typeInfo = ACTIVITY_TYPES.find(t => t.value === parsed?.type) || ACTIVITY_TYPES[4];
                            return (
                              <div key={act.id} className="p-3 bg-gray-50 rounded-lg border relative z-10 ml-4 mb-2">
                                <div className="absolute -left-5 top-4 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                                <div className="flex items-start gap-2">
                                  <span className="text-lg shrink-0">{typeInfo.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium text-gray-900">{parsed?.title || act.content}</p>
                                      <span className="text-[10px] text-gray-400">{formatDate(act.created_at)}</span>
                                    </div>
                                    {parsed?.description && <p className="text-xs text-gray-600 mt-1">{parsed.description}</p>}
                                    {parsed?.outcome && <p className="text-xs text-blue-600 font-medium mt-1">→ {parsed.outcome}</p>}
                                    {act.user && <p className="text-[10px] text-gray-400 mt-1">{act.user.full_name}</p>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}

                  {/* CRM shared activities */}
                  {crmLeadId && (
                    sharedActivities.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageSquare className="h-10 w-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">Chưa có hoạt động nào được chia sẻ xưởng</p>
                        <p className="text-xs text-gray-400 mt-1">Bên CRM, bật «Chia sẻ xưởng» để hiện ở đây</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        <div className="relative">
                          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 to-blue-100" />
                          {sharedActivities.map((act) => {
                            const typeInfo = ACTIVITY_TYPES.find((t) => t.value === act.type) || ACTIVITY_TYPES[4];
                            return (
                              <div key={act.id} className="p-3 bg-gray-50 rounded-lg border relative z-10 ml-4 mb-2">
                                <div className="absolute -left-5 top-4 w-3 h-3 bg-blue-600 rounded-full border-2 border-white" />
                                <div className="flex items-start gap-2">
                                  <span className="text-lg shrink-0">{typeInfo.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium text-gray-900">{act.title}</p>
                                      <span className="text-[10px] text-gray-400">{formatDate(act.activity_date)}</span>
                                    </div>
                                    {act.description && <p className="text-xs text-gray-600 mt-1">{act.description}</p>}
                                    {act.outcome && <p className="text-xs text-blue-600 font-medium mt-1">→ {act.outcome}</p>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}
                </>
              )}

              {/* Ghi chú — chỉ hiện ghi chú đã chia sẻ xưởng, dùng CrmChatNotesPanel giống LeadDetail */}
              {activeTab === 'notes' && (
                crmLeadId ? (
                  <CrmChatNotesPanel
                    variant="embedded"
                    leadId={crmLeadId}
                    notes={sharedNotes}
                    onPosted={refreshCrmActivities}
                    currentUserId={user?.id || user?.userId}
                    canEditAnyNote={isAdminLike(user) || user?.role === 'manager'}
                    includeVoiceTimeline
                    defaultShareToWorkshop
                    defaultShareModules={['production', 'workshop']}
                    contextLine={
                      primaryCrmDeal
                        ? `🎯 Deal ${[primaryCrmDeal.code, primaryCrmDeal.title].filter(Boolean).join(' — ')}`
                        : `📋 Dự án ${project.code || ''}`
                    }
                    contextBadge={primaryCrmDeal?.code || project?.code || ''}
                  />
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">Liên kết deal CRM để dùng ghi chú.</p>
                )
              )}

              {/* Sự cố */}
              {activeTab === 'incidents' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">Báo sự cố xưởng</h3>
                    <button type="button" onClick={() => setShowIncidentForm(true)}
                      className="h-8 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                      <AlertTriangle className="h-3.5 w-3.5" /> Báo sự cố
                    </button>
                  </div>

                  {showIncidentForm && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                      <h4 className="text-sm font-bold text-red-700">Báo sự cố mới</h4>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Tiêu đề sự cố *</label>
                        <input value={incidentForm.title} onChange={e => setIncidentForm(f => ({ ...f, title: e.target.value }))}
                          className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm" placeholder="Ví dụ: Máy cắt bị hỏng, nguyên liệu thiếu..." />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Mô tả chi tiết</label>
                        <textarea value={incidentForm.description} onChange={e => setIncidentForm(f => ({ ...f, description: e.target.value }))}
                          className="w-full min-h-[80px] px-2 py-2 border border-gray-200 rounded-lg mt-1 text-sm resize-none" placeholder="Mô tả thêm về sự cố..." />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Mức độ</label>
                        <select value={incidentForm.severity} onChange={e => setIncidentForm(f => ({ ...f, severity: e.target.value }))}
                          className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm">
                          <option value="low">🟢 Thấp — không ảnh hưởng tiến độ</option>
                          <option value="medium">🟡 Trung bình — có thể chậm tiến độ</option>
                          <option value="high">🔴 Cao — ảnh hưởng nghiêm trọng</option>
                          <option value="critical">🚨 Khẩn cấp — dừng sản xuất</option>
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setShowIncidentForm(false); setIncidentForm({ title: '', description: '', severity: 'medium' }); }}
                          className="h-9 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">Hủy</button>
                        <button type="button" onClick={saveIncident} disabled={savingIncident}
                          className="h-9 px-4 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                          {savingIncident ? 'Đang gửi...' : 'Gửi báo cáo'}
                        </button>
                      </div>
                    </div>
                  )}

                  {incidents.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed">
                      <CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 font-medium">Chưa có sự cố nào</p>
                      <p className="text-xs text-gray-400 mt-1">Dự án đang vận hành bình thường</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {incidents.map((inc) => {
                        const isOpen = inc.status === 'open' || inc.status === 'in_progress';
                        const sevColor = {
                          low: 'bg-green-100 text-green-700 border-green-200',
                          medium: 'bg-amber-100 text-amber-700 border-amber-200',
                          high: 'bg-red-100 text-red-700 border-red-200',
                          critical: 'bg-red-200 text-red-800 border-red-300',
                        }[inc.severity] || 'bg-gray-100 text-gray-700';
                        const sevLabel = { low: '🟢 Thấp', medium: '🟡 Trung bình', high: '🔴 Cao', critical: '🚨 Khẩn cấp' }[inc.severity] || inc.severity;
                        return (
                          <div key={inc.id} className={`rounded-xl border p-4 ${isOpen ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${sevColor}`}>{sevLabel}</span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isOpen ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    {isOpen ? '🔴 Đang mở' : '✅ Đã giải quyết'}
                                  </span>
                                </div>
                                <p className="text-sm font-semibold text-gray-900">{inc.title}</p>
                                {inc.description && <p className="text-xs text-gray-600 mt-1">{inc.description}</p>}
                                <div className="flex items-center gap-2 mt-2">
                                  {inc.reporter?.full_name && <span className="text-[10px] text-gray-400">👤 {inc.reporter.full_name}</span>}
                                  <span className="text-[10px] text-gray-400"><Clock className="h-2.5 w-2.5 inline mr-0.5" />{new Date(inc.created_at).toLocaleDateString('vi-VN')}</span>
                                </div>
                              </div>
                              {isOpen && (
                                <button type="button" onClick={() => resolveIncident(inc.id)}
                                  className="shrink-0 h-8 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium cursor-pointer">
                                  Đã xử lý
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Bình luận deal / dự án — realtime */}
              {activeTab === 'comments' && (
                project?.id
                  ? <ProjectCommentsPanel projectId={project.id} onCountChange={setCommentCount} />
                  : <p className="text-sm text-gray-500 text-center py-8">Chưa có dữ liệu để bình luận.</p>
              )}

              {/* Thành viên */}
              {activeTab === 'team' && (
                crmLeadId ? <LeadMembersTab leadId={crmLeadId} /> : <p className="text-sm text-gray-500 text-center py-8">Liên kết deal CRM để xem thành viên.</p>
              )}

              {/* Trao đổi */}
              {activeTab === 'chat' && (
                crmLeadId
                  ? <LeadChatTab leadId={crmLeadId} socket={socket} />
                  : <ProjectChatTab projectId={project.id} socket={socket} />
              )}

              {/* Gửi duyệt — dùng ProjectApprovalsTab thật */}
              {activeTab === 'approvals' && (
                <ProjectApprovalsTab
                  variant="workshop"
                  projectId={project.id}
                  project={project}
                  onUpdated={() => load()}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {showAddCrmActivity && project?.crmDeals?.[0]?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddCrmActivity(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Thêm hoạt động CRM</h2>
              <button type="button" onClick={() => setShowAddCrmActivity(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Loại</label>
                <select
                  value={crmActivityForm.type}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm"
                >
                  {ACTIVITY_FORM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tiêu đề</label>
                <input
                  value={crmActivityForm.title}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm"
                  placeholder="Ví dụ: Gọi xác nhận lắp đặt"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Mô tả</label>
                <textarea
                  value={crmActivityForm.description}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full min-h-[80px] px-2 py-2 border border-gray-200 rounded-lg mt-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Kết quả / bước tiếp</label>
                <input
                  value={crmActivityForm.outcome}
                  onChange={(e) => setCrmActivityForm((f) => ({ ...f, outcome: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddCrmActivity(false)} className="h-9 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={saveCrmActivity}
                  disabled={savingCrmActivity}
                  className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingCrmActivity ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal cảnh báo còn nhiệm vụ chặn chuyển giai đoạn (parity CRM) */}
      <BlockingTasksAlertModal
        open={!!blockingTasksModal}
        onClose={() => setBlockingTasksModal(null)}
        currentStageName={blockingTasksModal?.currentStageName || ''}
        targetStageName={blockingTasksModal?.targetStageName || ''}
        remainingTasks={blockingTasksModal?.remainingTasks || []}
        onGoToTasks={() => { try { setActiveTab('tasks'); } catch (_) { /* tab có thể chưa khởi tạo */ } }}
      />

      {/* Chuyển phân loại (cột có cờ is_switch_workshop_type) */}
      {switchWorkshopModal && moduleKey !== 'vc' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!switchWorkshopSaving) setSwitchWorkshopModal(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-violet-600" /> Chuyển phân loại
              </h2>
              <button type="button" onClick={() => !switchWorkshopSaving && setSwitchWorkshopModal(null)} className="p-1 hover:bg-gray-100 rounded cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Dự án <strong>{project?.name || project?.code}</strong> sẽ chuyển sang pipeline phân loại mới.
            </p>
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm mb-4 space-y-1">
              <p><span className="text-gray-500">Từ:</span> <strong>{switchWorkshopModal.fromName}</strong> → cột «{switchWorkshopModal.targetCol?.name}»</p>
              <p><span className="text-gray-500">Sang:</span> <strong>{switchWorkshopModal.toName}</strong> → cột đầu pipeline</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => !switchWorkshopSaving && setSwitchWorkshopModal(null)} disabled={switchWorkshopSaving}
                className="h-10 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50">Hủy</button>
              <button type="button" onClick={confirmSwitchWorkshopFromDetail} disabled={switchWorkshopSaving}
                className="h-10 px-4 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2">
                {switchWorkshopSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                {switchWorkshopSaving ? 'Đang chuyển...' : 'Xác nhận chuyển'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SX → VC/LĐ handover modal (khi đổi stage tới cột có cờ bàn giao VC) */}
      {handoverModal && moduleKey !== 'vc' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeHandoverModal}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">🚚 Bàn giao sang VC/LĐ</h2>
              <button type="button" onClick={closeHandoverModal} className="p-1 hover:bg-gray-100 rounded cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              Chọn <strong>công ty VC/LĐ</strong> để bàn giao dự án. Sau khi xác nhận, dự án sẽ hiển thị trong dashboard VC của công ty đó.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">🏢 Công ty VC/LĐ *</label>
              <select
                value={handoverLogisticsCompanyId}
                onChange={(e) => setHandoverLogisticsCompanyId(e.target.value)}
                className={`w-full h-10 px-3 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-500 ${
                  !handoverLogisticsCompanyId && handoverErr ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              >
                <option value="">-- Chọn công ty --</option>
                {(handoverCompanies || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
              {handoverErr && <p className="text-xs text-red-600">{handoverErr}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={closeHandoverModal}
                disabled={handoverSaving}
                className="h-10 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmHandoverFromDetail}
                disabled={handoverSaving}
                className="h-10 px-4 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
              >
                {handoverSaving ? 'Đang bàn giao...' : 'Xác nhận bàn giao'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Production-native activity modal */}
      {showAddActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddActivity(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Thêm hoạt động xưởng</h2>
              <button type="button" onClick={() => setShowAddActivity(false)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Loại</label>
                <select value={activityForm.type} onChange={e => setActivityForm(f => ({ ...f, type: e.target.value }))} className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm">
                  {ACTIVITY_FORM_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tiêu đề</label>
                <input value={activityForm.title} onChange={e => setActivityForm(f => ({ ...f, title: e.target.value }))} className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm" placeholder="Ví dụ: Kiểm tra nguyên vật liệu" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Mô tả</label>
                <textarea value={activityForm.description} onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))} className="w-full min-h-[80px] px-2 py-2 border border-gray-200 rounded-lg mt-1 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Kết quả</label>
                <input value={activityForm.outcome} onChange={e => setActivityForm(f => ({ ...f, outcome: e.target.value }))} className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddActivity(false)} className="h-9 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">Hủy</button>
                <button type="button" onClick={saveProjectActivity} disabled={savingActivity} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                  {savingActivity ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nhập văn bản modal */}
      {showAddTextDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddTextDoc(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Nhập văn bản tài liệu</h2>
              <button type="button" onClick={() => setShowAddTextDoc(false)} className="p-1 hover:bg-gray-100 rounded cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Tên tài liệu</label>
                <input value={textDocForm.name} onChange={e => setTextDocForm(f => ({ ...f, name: e.target.value }))} className="w-full h-9 px-2 border border-gray-200 rounded-lg mt-1 text-sm" placeholder="Ví dụ: Phiếu nghiệm thu nội bộ" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Nội dung / ghi chú</label>
                <textarea value={textDocForm.notes} onChange={e => setTextDocForm(f => ({ ...f, notes: e.target.value }))} rows={5} className="w-full px-2 py-2 border border-gray-200 rounded-lg mt-1 text-sm resize-none" placeholder="Nhập nội dung..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddTextDoc(false)} className="h-9 px-4 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">Hủy</button>
                <button type="button" disabled={!textDocForm.name.trim()} onClick={async () => {
                  const content = textDocForm.notes || '';
                  const dataUrl = content ? `data:text/plain;charset=utf-8,${encodeURIComponent(content)}` : '';
                  try {
                    await api.post(`/projects/${project.id}/documents/bulk`, { items: [{ file_name: textDocForm.name + '.txt', file_url: dataUrl, file_size: content.length, mime_type: 'text/plain', original_name: textDocForm.name + '.txt', notes: content }] });
                    await loadProjectDocs(project.id);
                    setShowAddTextDoc(false);
                    setTextDocForm({ name: '', notes: '' });
                  } catch (e) { alert(e.response?.data?.error || 'Lỗi lưu'); }
                }} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">Lưu</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tasks Tab Component
function TasksTab({ project }) {
  return (
    <div className="space-y-4">
      {project.tasksByStage && Object.keys(project.tasksByStage).length > 0 ? (
        Object.entries(project.tasksByStage).map(([stageName, tasks]) => (
          <div key={stageName} className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3 capitalize">{stageName}</h4>
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded transition">
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    readOnly
                    className="mt-1 w-4 h-4 accent-blue-600"
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    {task.assignee && (
                      <p className="text-xs text-gray-500 mt-1">Giao cho: {task.assignee.full_name}</p>
                    )}
                  </div>
                  {task.priority && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                      {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm text-center py-6">Không có nhiệm vụ</p>
      )}
    </div>
  );
}

// Documents Tab Component
function PersonCard({ label, person, showPlaceholder }) {
  if (!person?.full_name) {
    if (!showPlaceholder) return null;
    return (
      <div className="flex items-center gap-3 py-0.5">
        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold shrink-0">—</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-sm text-gray-400">Chưa gán</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {person.avatar ? (
        <img src={person.avatar} alt="" className="h-8 w-8 rounded-full" />
      ) : (
        <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: avatarColor(person.full_name) }}>
          {getInitials(person.full_name)}
        </div>
      )}
      <div className="flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{person.full_name}</p>
      </div>
    </div>
  );
}

/** Chat nội bộ xưởng — dùng project_comments khi không có CRM deal */
function ProjectChatTab({ projectId, socket }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/comments`);
      setMessages((data?.comments || []).slice().reverse());
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
    } catch (_) {}
  }, [projectId]);

  useEffect(() => {
    load();
    if (socket) {
      socket.emit('join:project', projectId);
      const handler = (payload) => {
        if (String(payload?.project_id) !== String(projectId)) return;
        setMessages(prev => prev.some(m => m.id === payload.comment?.id) ? prev : [...prev, payload.comment]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      };
      socket.on('project:comment', handler);
      return () => socket.off('project:comment', handler);
    }
  }, [projectId, socket, load]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/comments`, { content: text.trim() });
      setMessages(prev => [...prev, data.comment]);
      setText('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) { alert(e.response?.data?.error || 'Lỗi gửi'); }
    setSending(false);
  };

  const handleUpload = async (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    setSending(true);
    try {
      const uploaded = [];
      for (const file of arr) {
        const fd = new FormData();
        fd.append('file', file);
        const { data: up } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        uploaded.push({ url: up.url || up.file_url, name: file.name, type: file.type, size: file.size });
      }
      const { data } = await api.post(`/projects/${projectId}/comments`, { content: text.trim() || '', attachments: uploaded });
      setMessages(prev => [...prev, data.comment]);
      setText('');
    } catch (e) { alert(e.response?.data?.error || 'Lỗi upload'); }
    setSending(false);
  };

  const formatTime = (d) => {
    const date = new Date(d);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return isToday ? time : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + time;
  };

  return (
    <div className="flex flex-col" style={{ height: '450px' }}>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50 rounded-t-xl">
        {messages.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Chưa có tin nhắn nào. Bắt đầu trao đổi!</p>}
        {messages.map(m => {
          const isMe = String(m.user_id) === String(user?.userId || user?.id);
          const atts = Array.isArray(m.attachments) ? m.attachments : [];
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
              {!isMe && (
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {(m.user?.full_name || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm ${isMe ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md' : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'}`}>
                {!isMe && <p className="text-[10px] font-medium mb-0.5 text-blue-600">{m.user?.full_name}</p>}
                {m.content && <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>}
                {atts.map((att, i) => {
                  const isImg = att.type?.startsWith('image/');
                  const href = pubUrl(att.url);
                  return isImg ? (
                    <img key={i} src={href} alt={att.name} className="rounded-lg max-w-full max-h-48 mt-1 object-contain" />
                  ) : (
                    <a key={i} href={href} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs underline"><Paperclip size={11} />{att.name || 'File'}</a>
                  );
                })}
                <p className={`text-[9px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t bg-white rounded-b-xl flex gap-2 shrink-0">
        <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-blue-500 p-2 cursor-pointer" title="Đính kèm">
          <Paperclip size={18} />
        </button>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Nhập tin nhắn..." className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 bg-gray-50" />
        <button type="button" onClick={send} disabled={sending || !text.trim()}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl w-10 h-10 flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer shadow-sm">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
