export const LEAVE_TYPES = [
  { v: 'paid', l: 'Phép có lương', color: '#8B5CF6' },
  { v: 'unpaid', l: 'Phép không lương', color: '#6B7280' },
  { v: 'sick', l: 'Nghỉ ốm', color: '#EF4444' },
  { v: 'business_trip', l: 'Công tác', color: '#3B82F6' },
  { v: 'remote', l: 'Làm online', color: '#10B981' },
  { v: 'other', l: 'Khác', color: '#F59E0B' },
];

export const HALF_DAY = [
  { v: 'full', l: 'Cả ngày' },
  { v: 'morning', l: 'Sáng' },
  { v: 'afternoon', l: 'Chiều' },
];

export const STATUS_MAP = {
  pending: {
    label: 'Chờ duyệt',
    cls: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    chipCls: 'bg-yellow-400 text-yellow-950',
    rowBorder: 'border-l-yellow-400',
  },
  approved: {
    label: 'Đã duyệt',
    cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    chipCls: 'bg-emerald-500 text-white',
    rowBorder: 'border-l-emerald-500',
  },
  rejected: {
    label: 'Từ chối',
    cls: 'bg-red-100 text-red-800 border border-red-300',
    chipCls: 'bg-red-500 text-white',
    rowBorder: 'border-l-red-500',
  },
  cancelled: {
    label: 'Đã hủy',
    cls: 'bg-gray-100 text-gray-600 border border-gray-200',
    chipCls: 'bg-gray-400 text-white',
    rowBorder: 'border-l-gray-400',
  },
};

export const STATUS_FILTER_OPTIONS = [
  { v: '', l: 'Tất cả TT', activeCls: 'bg-purple-100 border-purple-300 text-purple-800' },
  { v: 'pending', l: 'Chờ duyệt', activeCls: 'bg-yellow-100 border-yellow-400 text-yellow-900' },
  { v: 'approved', l: 'Đã duyệt', activeCls: 'bg-emerald-100 border-emerald-400 text-emerald-900' },
  { v: 'rejected', l: 'Từ chối', activeCls: 'bg-red-100 border-red-400 text-red-900' },
  { v: 'cancelled', l: 'Đã hủy', activeCls: 'bg-gray-100 border-gray-300 text-gray-700' },
];

export const EMPTY_LEAVE_FORM = {
  user_id: '',
  start_date: '',
  end_date: '',
  leave_type: 'paid',
  half_day: 'full',
  reason: '',
  status: 'pending',
};

export function leaveStatusMeta(status) {
  return STATUS_MAP[status] || STATUS_MAP.pending;
}

export function leaveTypeMeta(v) {
  return LEAVE_TYPES.find((t) => t.v === v) || LEAVE_TYPES[LEAVE_TYPES.length - 1];
}

export function leaveTypeDisplayLabel(v) {
  if (v === 'paid') return 'Nghỉ phép';
  if (v === 'remote') return 'Làm online';
  return leaveTypeMeta(v).l;
}

export function halfDayDisplayLabel(v) {
  if (v === 'morning') return 'Buổi sáng';
  if (v === 'afternoon') return 'Buổi chiều';
  return 'Cả ngày';
}

/** Nhãn gộp loại nghỉ + buổi — dùng trên lịch và ghi chú. */
export function leaveTypeAndHalfLabel(leave) {
  if (!leave) return '';
  return `${leaveTypeDisplayLabel(leave.leave_type)} · ${halfDayDisplayLabel(leave.half_day)}`;
}

/** Ghi chú hiển thị: loại nghỉ · buổi — lý do (nếu có). */
export function formatLeaveNote(leave) {
  if (!leave) return '—';
  const meta = leaveTypeAndHalfLabel(leave);
  const reason = String(leave.reason || '').trim();
  if (!reason) return meta;
  return `${meta} — ${reason}`;
}

/** Màu ô lịch Kanban theo loại nghỉ / buổi. */
export function resolveLeaveCalendarChipKind(leave) {
  if (leave?.leave_type === 'remote') return 'remote';
  if (leave?.half_day && leave.half_day !== 'full') return 'half';
  return 'full';
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function isoDate(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function fmtCreatedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export function formatLeaveDateWithWeekday(startDate, endDate) {
  if (!startDate) return '—';
  const d = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return startDate;
  const dateText = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const weekday = WEEKDAY_LABELS[d.getDay()];
  if (!endDate || endDate === startDate) return `${dateText} (${weekday})`;
  const end = new Date(`${endDate}T12:00:00`);
  const endText = end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${dateText} → ${endText}`;
}

export function resolveLeaveUser(leave, usersById, currentUser) {
  if (leave?.user?.full_name || leave?.user?.email) return leave.user;
  const uid = leave?.user_id != null ? String(leave.user_id) : '';
  if (uid && usersById?.[uid]) {
    const u = usersById[uid];
    return { id: u.id, full_name: u.full_name, email: u.email };
  }
  if (uid && currentUser && String(currentUser.id) === uid) {
    return {
      id: currentUser.id,
      full_name: currentUser.full_name,
      email: currentUser.email,
    };
  }
  return leave?.user || null;
}

/** Gộp users từ dropdown + embed API leave.user để luôn tra được tên. */
export function buildLeaveUsersById(users = [], leaves = [], currentUser = null) {
  const map = {};
  for (const u of users) {
    if (u?.id) map[String(u.id)] = u;
  }
  for (const l of leaves || []) {
    const u = l?.user;
    if (u?.id && (u.full_name || u.email)) {
      const key = String(u.id);
      map[key] = { ...map[key], ...u };
    }
  }
  if (currentUser?.id) {
    const key = String(currentUser.id);
    if (!map[key]) map[key] = currentUser;
  }
  return map;
}

/** Tên đầy đủ nhân viên — dùng bảng danh sách và form sửa. */
export function leavePersonDisplayName(leave, usersById, currentUser) {
  const user = resolveLeaveUser(leave, usersById, currentUser);
  return String(user?.full_name || user?.email || '').trim() || '—';
}

export function leavePersonCalendarLabel(leave, usersById, currentUser) {
  const user = resolveLeaveUser(leave, usersById, currentUser);
  const full = String(user?.full_name || user?.email?.split('@')[0] || '').trim();
  if (!full) return 'Nhân viên';
  return full.length > 22 ? `${full.slice(0, 20)}…` : full;
}

export function leavePersonShortName(leave, usersById, currentUser) {
  const user = resolveLeaveUser(leave, usersById, currentUser);
  const full = String(user?.full_name || user?.email || '').trim();
  if (!full) return 'NV';
  const parts = full.split(/\s+/).filter(Boolean);
  const label = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return label.length > 14 ? `${label.slice(0, 12)}…` : label;
}
