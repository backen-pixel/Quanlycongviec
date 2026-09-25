import { useCallback, useEffect, useRef, useState } from 'react';
import api from './api';
import { displayPipelineStageName } from '../components/ProjectDealSyncPanel';
import { useAuth } from './auth';
import { isPlatformAdmin, isStrictAdmin, isSystemAdmin } from './adminRole';
import { memberModulesFromUser } from './memberModuleCounts';
import { isProjectAlreadyInLogistics, VC_TEMP_LOCK_MSG } from './projectLogistics';
import { TEMP_SX_FREE_DRAG } from './sxPipelineRevenue';

function foldName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/** Cột «Hoàn thành» của một module — chỉ người thuộc module đó mới thấy lệnh. */
function isModuleCompletionStage(stage) {
  const n = foldName(displayPipelineStageName(stage));
  return n.includes('hoan thanh') || stage?.is_won === true;
}

function viewerCanSeeCompletion(module, viewerMods, seeAll) {
  if (seeAll) return true;
  if (module === 'crm') return viewerMods.has('crm');
  if (module === 'sx') return viewerMods.has('production');
  if (module === 'vc') return viewerMods.has('logistics');
  return false;
}

function findStage(stages, test) {
  return (stages || []).find((stage) => test(foldName(displayPipelineStageName(stage)))) || null;
}

function asStageList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.stages)) return data.stages;
  return [];
}

function stageCommand({ module, stage, projectId, leadId, currentId, groupLabel, project }) {
  const id = stage?.id;
  if (id == null || id === '') return null;
  const name = displayPipelineStageName(stage);
  if (!name || name === 'Chưa có') return null;
  const current = currentId != null && String(currentId) === String(id);
  const mod = module === 'vc' ? 'VC / LĐ' : module === 'crm' ? 'CRM' : 'Sản xuất';
  return {
    id: `stage:${module}:${projectId || leadId || ''}:${id}`,
    kind: 'stage',
    label: name,
    emoji: stage.icon || '➡️',
    keywords: `${name} ${mod}`,
    hint: current ? 'Đang đứng ở cột này' : `Chuyển ${mod}`,
    groupLabel: groupLabel || 'Chuyển tiến độ',
    module,
    projectId: projectId || null,
    leadId: leadId || null,
    stageId: id,
    stage,
    current,
    currentStageId: currentId || null,
    project: project || null,
  };
}

export function buildStageSlashCommands({
  module,
  stages,
  projectId,
  leadId,
  currentId,
  groupLabel,
  project,
}) {
  return (Array.isArray(stages) ? stages : [])
    .map((stage) => stageCommand({ module, stage, projectId, leadId, currentId, groupLabel, project }))
    .filter(Boolean);
}

function alertMoveError(e, fallback) {
  const body = e?.response?.data || {};
  if (body.code === 'SX_BLOCKING_TASKS_INCOMPLETE' || body.code === 'VC_BLOCKING_TASKS_INCOMPLETE' || body.code === 'CRM_BLOCKING_TASKS_INCOMPLETE') {
    const names = (body.remaining_tasks || []).map((t) => t.title || t.name).filter(Boolean);
    alert(`Còn nhiệm vụ chặn chuyển cột${body.current_stage_name ? ` tại «${body.current_stage_name}»` : ''}${names.length ? `:\n• ${names.slice(0, 8).join('\n• ')}` : ''}`);
    return;
  }
  if (body.code === 'requires_deadline') {
    alert(body.error || 'Cột này bắt buộc hạn — mở chi tiết để nhập hạn rồi chuyển.');
    return;
  }
  alert(body.error || e?.message || fallback);
}

async function postMovedComment(leadId, moduleLabel, stageName) {
  if (!leadId) return;
  try {
    await api.post(`/crm/leads/${leadId}/comments`, {
      body: `Đã chuyển tiến độ ${moduleLabel} sang «${stageName}»`,
    });
  } catch { /* chuyển cột đã xong — thiếu dòng bình luận không hoàn tác */ }
}

/** Chọn một cột từ lệnh «/». Trả handled=true khi đây là lệnh tiến độ. */
export async function runStageSlashCommand(cmd) {
  if (!cmd || cmd.kind !== 'stage') return { handled: false };
  if (cmd.current && !cmd.reenableDeadline) {
    alert(`Đang ở cột «${cmd.label}»`);
    return { handled: true, ok: false };
  }
  const stage = cmd.stage || {};
  const project = cmd.project || {};
  try {
    if (cmd.module === 'sx') {
      if (!TEMP_SX_FREE_DRAG && stage.is_handover_to_logistics === true && !isProjectAlreadyInLogistics(project)) {
        await api.post(`/vc-handover/projects/${cmd.projectId}/request`, { sx_stage_id: String(stage.id || cmd.stageId) });
        alert('Đã gửi yêu cầu bàn giao VC/LĐ. Sale chọn công ty và ngày trong bình luận.');
        return { handled: true, ok: true };
      }
      if (stage.is_switch_workshop_type === true && stage.target_workshop_type_id) {
        alert('Cột này đổi phân loại xưởng — mở chi tiết Sản xuất để chuyển.');
        return { handled: true, ok: false };
      }
      const intake = stage.bucket_slug === 'won_pending' || String(stage.id || cmd.stageId).startsWith('__fb_');
      const body = intake
        ? { move_to_intake: true }
        : {
          sx_pipeline_stage_id: stage.id || cmd.stageId,
          current_sx_pipeline_stage_id: cmd.currentStageId || null,
        };
      await api.patch(`/production/projects/${cmd.projectId}/stage`, body);
      await postMovedComment(cmd.leadId, 'Sản xuất', cmd.label);
    } else if (cmd.module === 'vc') {
      if (!cmd.projectId) {
        alert('Deal chưa có dự án VC/LĐ — chưa chuyển được trạng thái.');
        return { handled: true, ok: false };
      }
      if (project.vc_temp_staged && String(cmd.stageId) !== String(project.vc_kanban_column_id || '')) {
        alert(VC_TEMP_LOCK_MSG);
        return { handled: true, ok: false };
      }
      let body = { vc_stage_id: cmd.stageId };
      if (stage.workflow_stage_id) body.stage_id = stage.workflow_stage_id;
      if (stage.bucket_slug === 'delivery_pending') body = { move_to_intake: true };
      await api.patch(`/logistics/projects/${cmd.projectId}/stage`, body);
      await postMovedComment(cmd.leadId, 'VC / LĐ', cmd.moveLabel || displayPipelineStageName(stage) || cmd.label);
    } else if (cmd.module === 'crm') {
      if (stage.is_lost) {
        alert('Đánh dấu Thua cần lý do — mở chi tiết CRM để chuyển.');
        return { handled: true, ok: false };
      }
      if (stage.is_won && !cmd.projectId) {
        alert('Chuyển sang Thắng sẽ tạo dự án — mở chi tiết CRM để chọn xưởng.');
        return { handled: true, ok: false };
      }
      await api.patch(`/crm/leads/${cmd.leadId}/stage`, { stage_id: cmd.stageId });
      await postMovedComment(cmd.leadId, 'CRM', cmd.label);
    } else {
      return { handled: false };
    }
    if (cmd.projectId && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('crm-project-badges-refresh', {
        detail: { projectId: String(cmd.projectId) },
      }));
    }
    return { handled: true, ok: true };
  } catch (e) {
    alertMoveError(e, 'Không chuyển được tiến độ');
    return { handled: true, ok: false };
  }
}

/**
 * Nạp cột pipeline để gõ «/Lắp xong», «/Đã giao» trong bình luận.
 * modules: 'sx' | 'vc' | 'crm' (một hoặc nhiều).
 */
export function useCommentProgressSlash({
  enabled = true,
  modules = [],
  projectId = null,
  leadId = null,
  companyId = null,
  workshopTypeId = null,
  logisticsCompanyId = null,
  pipelineId = null,
  leadType = 'deal',
  crmStageId = null,
  sxStageId = null,
  vcStageId = null,
  project = null,
}) {
  const { user } = useAuth();
  const [commands, setCommands] = useState([]);
  const projectRef = useRef(project);
  projectRef.current = project;
  const modKey = (modules || []).join(',');

  useEffect(() => {
    if (!enabled || !modKey) {
      setCommands([]);
      return undefined;
    }
    const want = new Set(modKey.split(',').filter(Boolean));
    let alive = true;
    (async () => {
      const buckets = { crm: [], sx: [], vc: [] };
      let sharedVcStages = [];
      const jobs = [];
      if (want.has('crm') && leadId) {
        const params = { type: leadType === 'lead' ? 'lead' : 'deal' };
        if (pipelineId) params.pipeline_id = pipelineId;
        else if (companyId) params.company_id = companyId;
        if (crmStageId) params.ensure_stage_id = crmStageId;
        jobs.push(
          api.get('/crm/pipeline-stages', { params })
            .then((r) => {
              buckets.crm.push(...buildStageSlashCommands({
                module: 'crm',
                stages: asStageList(r.data),
                projectId,
                leadId,
                currentId: crmStageId,
                groupLabel: 'Tiến độ CRM',
                project: projectRef.current,
              }));
            })
            .catch(() => {}),
        );
      }
      if (want.has('sx') && projectId && companyId) {
        const params = { company_id: companyId };
        if (workshopTypeId) params.workshop_type_id = workshopTypeId;
        jobs.push(
          api.get('/production/pipeline-stages', { params })
            .then((r) => {
              buckets.sx.push(...buildStageSlashCommands({
                module: 'sx',
                stages: asStageList(r.data),
                projectId,
                leadId,
                currentId: sxStageId,
                groupLabel: 'Tiến độ sản xuất',
                project: projectRef.current,
              }));
            })
            .catch(() => {}),
        );
      }
      const vcCompanyId = logisticsCompanyId || companyId;
      if (vcCompanyId) {
        jobs.push(
          api.get('/logistics/pipeline-stages', { params: { company_id: vcCompanyId } })
            .then((r) => {
              const stages = asStageList(r.data);
              sharedVcStages = stages;
              if (want.has('vc') && projectId) {
                buckets.vc.push(...buildStageSlashCommands({
                  module: 'vc',
                  stages,
                  projectId,
                  leadId,
                  currentId: vcStageId,
                  groupLabel: 'Tiến độ lắp đặt',
                  project: projectRef.current,
                }));
              }
            })
            .catch(() => {}),
        );
      }
      await Promise.all(jobs);
      if (!alive) return;
      const seeAll = isStrictAdmin(user) || isSystemAdmin(user) || isPlatformAdmin(user);
      const viewerMods = new Set(seeAll ? ['crm', 'production', 'logistics'] : memberModulesFromUser(user));
      const gated = [...buckets.crm, ...buckets.sx, ...buckets.vc].filter((cmd) => {
        if (!isModuleCompletionStage(cmd.stage)) return true;
        return viewerCanSeeCompletion(cmd.module, viewerMods, seeAll);
      });
      const vcStages = sharedVcStages.length
        ? sharedVcStages
        : buckets.vc.map((cmd) => cmd.stage).filter(Boolean);
      const lapStage = findStage(vcStages, (n) => (
        n.includes('da lap') || n.includes('lap xong') || n.includes('lap dat')
      ));
      const giaoStage = findStage(vcStages, (n) => n.includes('da giao') || n.includes('giao xong'));
      const incidentStage = findStage(vcStages, (n) => n.includes('phat sinh'));
      const sharedTarget = lapStage || giaoStage;
      const shared = [];
      const ctx = {
        projectId,
        leadId,
        currentId: vcStageId,
        project: projectRef.current,
      };
      if (sharedTarget) {
        const base = stageCommand({ module: 'vc', stage: sharedTarget, groupLabel: 'Dùng chung', ...ctx });
        if (base) {
          const moveLabel = displayPipelineStageName(sharedTarget);
          shared.push(
            { ...base, id: `shared:da-giao:${base.stageId}`, label: 'Đã giao', keywords: 'da giao', hint: 'Chuyển VC/LĐ sang đã lắp', moveLabel },
            { ...base, id: `shared:da-lap:${base.stageId}`, label: 'Đã lắp', keywords: 'da lap lap xong', hint: 'Chuyển VC/LĐ sang đã lắp', moveLabel },
          );
        }
      }
      if (incidentStage) {
        const base = stageCommand({ module: 'vc', stage: incidentStage, groupLabel: 'Dùng chung', ...ctx });
        if (base) {
          shared.push({
            ...base,
            id: `shared:phat-sinh:${base.stageId}`,
            label: 'Phát sinh',
            keywords: 'phat sinh',
            hint: 'Chuyển VC/LĐ sang phát sinh và bật lại deadline',
            moveLabel: displayPipelineStageName(incidentStage),
            reenableDeadline: true,
          });
        }
      }
      setCommands([...shared, ...gated]);
    })();
    return () => { alive = false; };
  }, [
    enabled, modKey, projectId, leadId, companyId, workshopTypeId, logisticsCompanyId,
    pipelineId, leadType, crmStageId, sxStageId, vcStageId, user,
  ]);

  const run = useCallback((cmd) => runStageSlashCommand(cmd), []);
  return { commands, run };
}
