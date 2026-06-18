/** Checklist nhiệm vụ CRM — khớp logic web CRMTasksTab.jsx */

export type CrmChecklistItem = {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  done?: boolean;
  priority?: string;
  assignee_id?: string | null;
  executor_company_id?: string | null;
  completion_requires_file_or_note?: boolean;
  required_evidence_file_types?: string[];
};

let _ckSeq = 0;
export function genChecklistId(): string {
  _ckSeq += 1;
  return `ck_${Date.now().toString(36)}_${_ckSeq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeChecklist(arr: unknown): CrmChecklistItem[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((c, i) => {
    if (typeof c === 'string') {
      return {
        id: `ckidx_${i}_${c.slice(0, 8)}`,
        title: c,
        description: '',
        notes: '',
        done: false,
        priority: 'medium',
        assignee_id: null,
      };
    }
    const row = c as Record<string, unknown>;
    return {
      id: String(row.id || `ckidx_${i}`),
      title: String(row.title || row.label || ''),
      description: String(row.description || ''),
      notes: String(row.notes || ''),
      done: !!(row.done ?? row.is_completed),
      priority: String(row.priority || 'medium'),
      assignee_id: (row.assignee_id || row.default_assignee_id || null) as string | null,
      executor_company_id: (row.executor_company_id || null) as string | null,
      completion_requires_file_or_note: !!row.completion_requires_file_or_note,
      required_evidence_file_types: Array.isArray(row.required_evidence_file_types)
        ? (row.required_evidence_file_types as string[])
        : [],
    };
  });
}

export function ckStateKey(taskId: string, ckId: string): string {
  return `${taskId}:${ckId}`;
}
