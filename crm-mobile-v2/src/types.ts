export type LeadTemp = 'hot' | 'warm' | 'cold' | 'new';

export type Lead = {
  id: string;
  code: string;
  title: string;
  source: string; // [FB], [Zalo]...
  location: string;
  contactName: string;
  phone: string;
  temp: LeadTemp;
  status: string; // Mới, Warm...
  date: string;
  deadlineLabel: string;
  overdue?: boolean;
  ownerName: string;
  ownerInitials: string;
  ownerColor: string;
  tagCount?: number;
};

export type Deal = {
  id: string;
  code: string;
  title: string;
  value: string; // hiển thị: 146.000.000đ | Chưa định giá
  stage: string; // Deal mới, Chờ khảo sát...
  location: string;
  contactName: string;
  phone: string;
  date: string;
  deadlineLabel: string;
  overdue?: boolean;
  ownerName: string;
  ownerInitials: string;
  ownerColor: string;
  tagCount?: number;
};

export type Recording = {
  id: string;
  title: string;
  timeLabel: string;
  dateLabel: string;
  ownerName: string;
  phone: string;
  device: string;
  durationSec: number;
  linked: boolean;
  customerName?: string;
};

export type ChatThread = {
  id: string;
  name: string;
  preview: string;
  timeLabel: string;
  unread: number;
  online?: boolean;
  isDirect?: boolean;
  color: string;
};

export type ChatMessage = {
  id: string;
  text: string;
  time: string;
  mine: boolean;
  read?: boolean;
};

export type Assignee = {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
};

export type CrmPipelineStage = {
  id: string;
  name: string;
  icon: string;
  color: string;
  orderIndex: number;
};

export type CrmKanbanItem = {
  id: string;
  kind: 'lead' | 'deal';
  code: string;
  title: string;
  stageId: string;
  regionId?: string;
  stageName: string;
  stageColor: string;
  stageIcon?: string;
  contactName: string;
  phone: string;
  companyName?: string;
  sourceLabel?: string;
  valueLabel?: string;
  temp?: LeadTemp;
  ownerId: string;
  assignedToId: string;
  leadOwnerId: string;
  ownerName: string;
  ownerInitials: string;
  ownerColor: string;
  createdAt?: string | null;
  dueIso?: string | null;
  overdue: boolean;
};

export type CrmBoard = {
  stages: CrmPipelineStage[];
  items: CrmKanbanItem[];
};

/** Cache một cột kanban (phân trang). */
export type CrmStageCache = {
  items: CrmKanbanItem[];
  hasMore: boolean;
  nextOffset: number;
  loaded: boolean;
};

/** Dữ liệu hub Leads/Deals — meta + cache từng cột. */
export type CrmHubData = {
  stages: CrmPipelineStage[];
  stageCounts: Record<string, number>;
  cache: Record<string, CrmStageCache>;
};

export type PlannerKind = 'lead' | 'deal';

export type PlannerItem = {
  id: string;
  kind: PlannerKind;
  code: string;
  title: string;
  status: string; // tên stage
  contactName: string;
  phone: string;
  location: string;
  valueLabel?: string; // chỉ deal
  temp?: LeadTemp; // chỉ lead
  ownerId: string;
  ownerName: string;
  ownerInitials: string;
  ownerColor: string;
  deadlineLabel: string;
  dueIso?: string | null;
  overdue: boolean;
};

export type TaskKind = 'call' | 'meeting' | 'quote' | 'followup';

export type PlannerTask = {
  id: string;
  time: string;
  title: string;
  kind: TaskKind;
  linkedCode?: string;
  assigneeId: string;
  done?: boolean;
  overdue?: boolean;
};
