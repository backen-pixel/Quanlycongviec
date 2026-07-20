import type { EmployeeReportRow, OrgActivityFeedApiItem, OrgOverviewReport } from '../api/employeeReport';
import { formatVndShort } from './reportFormat';
import { reportClosedWonCount, reportClosedWonValue } from './reportMetrics';

export type ActivityFeedItem = {
  id: string;
  kind: 'won' | 'urgent' | 'lead' | 'lost' | 'calls' | 'stage' | 'comment' | 'created' | 'activity';
  title: string;
  subtitle: string;
  value: string;
  badge: string;
  badgeTone: 'green' | 'yellow' | 'purple' | 'red' | 'teal' | 'muted';
  occurredAt?: string;
  leadId?: string;
};

const BADGE_TONES = new Set<ActivityFeedItem['badgeTone']>([
  'green', 'yellow', 'purple', 'red', 'teal', 'muted',
]);

function eventTypeToKind(eventType: string): ActivityFeedItem['kind'] {
  switch (eventType) {
    case 'deal_won': return 'won';
    case 'deal_lost': return 'lost';
    case 'lead_created': return 'lead';
    case 'deal_created': return 'created';
    case 'stage_changed': return 'stage';
    case 'comment': return 'comment';
    case 'crm_activity': return 'activity';
    default: return 'stage';
  }
}

export function mapApiActivityFeedItem(row: OrgActivityFeedApiItem): ActivityFeedItem {
  const tone = BADGE_TONES.has(row.badge_tone as ActivityFeedItem['badgeTone'])
    ? (row.badge_tone as ActivityFeedItem['badgeTone'])
    : 'muted';
  return {
    id: row.id,
    kind: eventTypeToKind(row.event_type),
    title: row.title,
    subtitle: row.subtitle,
    value: row.value || '',
    badge: row.badge,
    badgeTone: tone,
    occurredAt: row.occurred_at,
    leadId: row.lead_id || undefined,
  };
}

/** Fallback tổng hợp khi API feed chưa sẵn sàng. */
export function buildOrgActivityFeed(report: OrgOverviewReport): ActivityFeedItem[] {
  const s = report.summary;
  const items: ActivityFeedItem[] = [];

  const topWon = [...(report.by_employee || [])]
    .sort((a, b) => reportClosedWonValue(b) - reportClosedWonValue(a))[0];
  if (topWon && reportClosedWonCount(topWon) > 0) {
    items.push({
      id: 'won-top',
      kind: 'won',
      title: `Deal chốt — ${topWon.full_name || 'NV'}`,
      subtitle: `${topWon.department_name || 'CRM'} · ${reportClosedWonCount(topWon)} deal chốt`,
      value: formatVndShort(reportClosedWonValue(topWon)),
      badge: 'Hoàn thành',
      badgeTone: 'green',
    });
  }

  const overdue = s.overdue_count ?? 0;
  if (overdue > 0) {
    items.push({
      id: 'urgent',
      kind: 'urgent',
      title: `${overdue} hồ sơ quá hạn / cần xử lý`,
      subtitle: s.overdue_rate_pct != null ? `Tỷ lệ quá hạn ${s.overdue_rate_pct}%` : 'Ưu tiên cao',
      value: String(overdue),
      badge: 'Khẩn',
      badgeTone: 'yellow',
    });
  }

  return items.slice(0, 5);
}

export function filterEmployeesByMode(
  rows: EmployeeReportRow[],
  mode: 'all' | 'won' | 'open',
): EmployeeReportRow[] {
  if (mode === 'won') {
    return rows.filter((r) => reportClosedWonCount(r) > 0);
  }
  if (mode === 'open') {
    return rows.filter((r) => (r.deal_count ?? 0) > 0);
  }
  return rows;
}
