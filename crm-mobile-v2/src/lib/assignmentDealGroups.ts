import type { CrmAssignment } from '../api/assignments';

/** Section cho việc không gắn Lead/Deal. */
export const UNASSIGNED_LEAD_SECTION_ID = '__no_lead__';

export type AssignmentDealSection = {
  leadId: string;
  code: string;
  title: string;
  kind: 'lead' | 'deal' | null;
  tasks: CrmAssignment[];
};

function sectionSortKey(section: AssignmentDealSection): number {
  let earliest = Number.MAX_SAFE_INTEGER;
  for (const t of section.tasks) {
    if (!t.deadline) continue;
    const ms = new Date(t.deadline).getTime();
    if (!Number.isNaN(ms) && ms < earliest) earliest = ms;
  }
  return earliest;
}

/**
 * Gom nhiệm vụ CRM theo Lead/Deal — khớp UX app xưởng/VC
 * (header Deal mở/đóng, danh sách gọn).
 */
export function groupAssignmentsByDeal(tasks: CrmAssignment[]): AssignmentDealSection[] {
  const map = new Map<string, AssignmentDealSection>();

  for (const task of tasks) {
    const lead = task.lead;
    const leadId = lead?.id ? String(lead.id) : UNASSIGNED_LEAD_SECTION_ID;
    let section = map.get(leadId);
    if (!section) {
      const isOrphan = leadId === UNASSIGNED_LEAD_SECTION_ID;
      const kind: 'lead' | 'deal' | null = isOrphan
        ? null
        : lead?.type === 'deal'
          ? 'deal'
          : 'lead';
      section = {
        leadId,
        code: isOrphan
          ? 'KHÔNG GẮN'
          : (lead?.code?.trim() || `${kind === 'deal' ? 'DEAL' : 'LEAD'}-${leadId.slice(0, 8)}`),
        title: isOrphan
          ? 'Việc chưa gắn Lead/Deal'
          : (lead?.title?.trim() || (kind === 'deal' ? 'Deal' : 'Lead')),
        kind,
        tasks: [],
      };
      map.set(leadId, section);
    }
    section.tasks.push(task);
  }

  return [...map.values()]
    .map((section) => ({
      ...section,
      tasks: [...section.tasks].sort((a, b) => {
        const da = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const db = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      }),
    }))
    .sort((a, b) => {
      if (a.leadId === UNASSIGNED_LEAD_SECTION_ID) return 1;
      if (b.leadId === UNASSIGNED_LEAD_SECTION_ID) return -1;
      const byDue = sectionSortKey(a) - sectionSortKey(b);
      if (byDue !== 0) return byDue;
      return a.code.localeCompare(b.code, 'vi');
    });
}
