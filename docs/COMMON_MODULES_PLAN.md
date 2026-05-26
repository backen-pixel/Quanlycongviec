# Kế hoạch module dùng chung (Cross-cutting)

## Trạng thái triển khai

| Sprint | Nội dung | Trạng thái |
|--------|----------|------------|
| 1 | ModuleAccessContext, UnreadBadgesContext, ScopeFilterBar, useScopeFilter, backend scopeQueryParams | **Đã làm** |
| 2 | PresenceContext, socket `presence:update` + `notify:badge`, UserPresenceAvatar, migrate Social | **Đã làm** |
| 3 | EngagementBar, KpiUserFilter→ScopeFilterBar, presence KPI/Knowledge | **Đã làm** |
| 4 | Thùng rác gộp + `audit_log` | **Đã làm** |
| 5 | MediaGallery, VirtualList, BulkActionBar | Chưa |
| 6 | Tài khoản của tôi + AI cross-module | Chưa |

## Sprint 1 — Đã triển khai

### Frontend (`frontend/src/shared/`)

- `context/ModuleAccessContext.jsx` — một lần gọi `GET /ecosystem/my-module-access`
- `context/UnreadBadgesContext.jsx` — gộp badge Có gì mới / Giao việc / Bảng tin
- `hooks/useScopeFilter.js` — lọc công ty, phòng ban, search, date range + localStorage
- `components/ScopeFilterBar.jsx` — UI thanh lọc
- `SharedProviders.jsx` — bọc trong `App.jsx`

### Đã migrate

- `App.jsx` — `ProtectedLayout` dùng `useModuleAccess`
- `Sidebar.jsx` — `useModuleAccess` + `useSidebarUnreadBadges`
- `ActiveUsersPage.jsx` — pilot `useScopeFilter` + `ScopeFilterBar`

### Backend

- `helpers/scopeQueryParams.js` — `parseScopeFromQuery`, `attachScope`
- `middleware/scopeFilter.js` — gắn `req.scope`
- `routes/users.js` — `/activity` dùng scope chuẩn

### Cách dùng ScopeFilter ở trang mới

```jsx
const scope = useScopeFilter({
  storageKey: 'crm_events',
  showCompany: true,
  showDepartment: false,
  showSearch: true,
});
const { data } = await api.get('/events', { params: scope.apiParams });
// ...
<ScopeFilterBar scope={scope} className="mt-4" />
```

## Module dùng chung (tham chiếu)

| Module | Route |
|--------|-------|
| Bảng tin nội bộ | `/social` |
| Đang hoạt động | `/crm/activity` |
| KPI | `/crm/kpi/*`, `/crm/executive-kpi` |
| Sự kiện | `/crm/events` |
| Nhóm chat | `/crm/messenger` |
| Kiến thức | `/knowledge/*` |
| Có gì mới | `/updates` |

## Sprint 2 — Đã triển khai

### Backend
- `setPresenceBroadcast` → `io.emit('presence:update', …)` khi ping
- `helpers/notifyBadge.js` → `notify:badge` (đã gọi khi tạo bài social)

### Frontend
- `PresenceContext` + `usePresence` + `UserPresenceAvatar`
- `UnreadBadgesContext` lắng `notify:badge` + `badge:refresh:*`
- `NotificationCenter` dispatch badge khi có noti giao việc / sự kiện / chat
- `MessengerDock` dùng `usePresence`
- `SocialFeedPage`: `useScopeFilter` + chấm online trên avatar

## Sprint 3 — Đã triển khai

- `shared/lib/reactions.js` + `ReactionCircle.jsx` + `EngagementBar.jsx` (`ReactionSummary`, `PostReactionActions`)
- `SocialFeedPage` dùng EngagementBar (bỏ ~150 dòng lặp)
- `KpiUserFilter` dùng `ScopeFilterBar`; `useScopeFilter` hỗ trợ `departmentByCompany`, `companiesModule: false`, `searchApiKey: 'q'`
- `UserPresenceAvatar` trên bảng KPI nhân viên + Bảng điểm kiến thức

## Sprint 4 — Đã triển khai

### Thùng rác gộp
- `UnifiedTrashPage.jsx` — tab **CRM | Sản xuất | VC** tại `/admin/trash?tab=…`
- `/sx/trash`, `/vc/trash` redirect về hub; Sidebar + dashboard VC trỏ hub
- Tab CRM/SX: API `/api/trash`; tab VC: `/api/logistics/trash` (soft delete `vc_deleted_at`)

### Audit log
- Migration `database/244_audit_log.sql` — bảng `audit_log`
- `helpers/auditLog.js` — `writeAuditLog` (fail-safe)
- Ghi khi: restore/purge/empty (`trash.js`); soft-delete/restore/purge VC (`logistics.js`)

**Lưu ý:** Chạy migration `244_audit_log.sql` trên Supabase để bật ghi audit.

## Sprint tiếp theo (ưu tiên)

1. Bảng `engagement_reactions` chung (backend) cho Release notes / Events
2. `UserPresenceAvatar` trên Events feed (danh sách người tham gia)
3. MediaGallery, VirtualList, BulkActionBar (Sprint 5)
