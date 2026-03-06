# QUICK TEST SCRIPT - Phân quyền Admin/CEO

## ⏱️ 5-MINUTE TEST (Nhanh nhất)

### Chuẩn bị
- [ ] Mở app: https://tubep-frontend-s30w.onrender.com
- [ ] Đăng nhập: `admin@tubep.vn` / `admin123`
- [ ] Mở DevTools (F12) → Console tab (xem lỗi)

### Test Flow

**Minute 1: Vào trang Phân quyền**
```
1. Click menu: 🛡️ Phân quyền
2. Đợi load (< 3s)
3. ✅ CHECK: 3 tabs hiển thị?
4. ✅ CHECK: Tab 1 active mặc định?
```

**Minute 2: Tab 1 - Kiểm tra roles**
```
1. Xem danh sách bên trái
2. ✅ CHECK: Có vai trò "Admin"?
3. Click "Admin"
4. ✅ CHECK: Bên phải hiện permissions grid?
5. ✅ CHECK: Tất cả checkbox đều tích xanh?
```

**Minute 3: Tab 2 - Gán role cho user**
```
1. Click Tab 2: "Gán vai trò"
2. ✅ CHECK: Danh sách users load < 2s?
3. Tìm user đầu tiên (hoặc gõ search)
4. Click vào card user
5. ✅ CHECK: Modal mở ra với form?
6. Dropdown "Chọn vai trò" → chọn "Admin"
7. Dropdown "Phạm vi" → chọn "Toàn hệ thống"
8. Click "Thêm vai trò"
9. ✅ CHECK: Toast "Đã gán vai trò" xuất hiện?
10. ✅ CHECK: Badge "Admin" xuất hiện trong modal?
```

**Minute 4: Tab 3 - Test bulk permissions**
```
1. Click Tab 3: "Phân quyền chi tiết"
2. ✅ CHECK: Cây ecosystem hiển thị?
3. Click expand một Khối (▶️ → ▼)
4. ✅ CHECK: Children load ra?
5. Click vào 1 công ty
6. ✅ CHECK: Bên phải hiện danh sách users?
7. Check 2-3 users
8. ✅ CHECK: "Bật/tắt quyền cho X người" xuất hiện?
```

**Minute 5: Kiểm tra responsive**
```
1. Press F12 → Toggle device toolbar (Ctrl+Shift+M)
2. Chọn "iPhone 12 Pro"
3. ✅ CHECK: Tabs scroll được?
4. ✅ CHECK: Không có element bị overflow?
5. Chọn "iPad Pro"
6. ✅ CHECK: Layout vẫn ổn?
```

### Kết quả
- **✅ 15/15 checks PASS** → UX tốt, sẵn sàng dùng!
- **10-14 checks pass** → Khá tốt, có vài lỗi nhỏ
- **< 10 checks pass** → Cần fix nhiều issues

---

## ⏱️ 15-MINUTE TEST (Chi tiết hơn)

### Phase 1: Setup & Navigation (3 min)

**1.1 Login & Access**
```
✅ CHECK: Login page load < 2s
✅ CHECK: Redirect sau login đúng route
✅ CHECK: Sidebar menu hiển thị
✅ CHECK: "Phân quyền" menu item có icon 🛡️
✅ CHECK: Click vào load trang /permissions < 3s
```

**1.2 Tab Layout**
```
✅ CHECK: 3 tabs hiển thị ngang hàng
✅ CHECK: Tab label rõ ràng (Vietnamese)
✅ CHECK: Tab icons (⚙️👥🏢) hiển thị
✅ CHECK: Active tab có purple underline
✅ CHECK: Hover tab có background change
```

### Phase 2: Tab 1 Testing (4 min)

**2.1 Roles List**
```
✅ CHECK: Danh sách load < 2s
✅ CHECK: 4 default roles: Admin, Manager, Employee, Viewer
✅ CHECK: Badge "Hệ thống" trên system roles
✅ CHECK: Permission count hiển thị (e.g., "28/28 quyền")
✅ CHECK: Hover role có highlight
```

**2.2 Permission Grid**
```
✅ CHECK: Click role → grid load ngay
✅ CHECK: 7 groups: projects, workflows, templates, users, ecosystem, reports, settings
✅ CHECK: Each group có header (uppercase, gray bg)
✅ CHECK: Permissions sorted alphabetically
✅ CHECK: Checkbox size 20x20px
✅ CHECK: Checked = green bg + white checkmark
✅ CHECK: Unchecked = gray border
✅ CHECK: Click checkbox → toggle state ngay
```

**2.3 Save Changes**
```
✅ CHECK: "Lưu thay đổi" button visible
✅ CHECK: Disabled khi không có thay đổi
✅ CHECK: Enabled khi toggle permission
✅ CHECK: Click save → spinner trong button
✅ CHECK: Success toast "Đã cập nhật" xuất hiện
✅ CHECK: Toast auto-dismiss sau 3s
```

**2.4 Create Role**
```
✅ CHECK: "+ Tạo vai trò mới" button góc phải
✅ CHECK: Click → modal mở (fade-in 200ms)
✅ CHECK: Form có 2 fields: Tên, Mô tả
✅ CHECK: Validation: Tên required
✅ CHECK: Submit disabled nếu empty
✅ CHECK: Submit enabled khi valid
✅ CHECK: Success → modal đóng + reload list
```

### Phase 3: Tab 2 Testing (4 min)

**3.1 User List**
```
✅ CHECK: Load < 3s (nếu < 100 users)
✅ CHECK: User cards 2-column grid
✅ CHECK: Avatar với initial (first letter)
✅ CHECK: Full name + email hiển thị
✅ CHECK: Role badges (nếu có) hiển thị
```

**3.2 Filters**
```
✅ CHECK: 3 dropdowns: Khối, Công ty, Phòng ban
✅ CHECK: Khối load ngay (từ API)
✅ CHECK: Chọn Khối → Công ty load < 1s
✅ CHECK: Chọn Công ty → Phòng ban load < 1s
✅ CHECK: User list filter < 500ms
✅ CHECK: Filter pills hiển thị active filters
✅ CHECK: Click × trên pill → remove filter
✅ CHECK: "Xóa tất cả" clear toàn bộ
```

**3.3 Assign Role**
```
✅ CHECK: Click user card → modal < 100ms
✅ CHECK: Modal title "Phân quyền cho [Tên]"
✅ CHECK: Current roles hiển thị (nếu có)
✅ CHECK: Dropdown roles đầy đủ (4+ roles)
✅ CHECK: Dropdown scope (Toàn hệ thống, Khối, Cty, PB, Team)
✅ CHECK: Submit → API call < 1s
✅ CHECK: Success toast "Đã gán vai trò"
✅ CHECK: Modal cập nhật list ngay
```

**3.4 Remove Role**
```
✅ CHECK: Badge role có nút × (close)
✅ CHECK: Click × → confirm dialog
✅ CHECK: Confirm "Có" → remove
✅ CHECK: Success toast "Đã xóa"
✅ CHECK: Badge biến mất
```

### Phase 4: Tab 3 Testing (4 min)

**4.1 Ecosystem Tree**
```
✅ CHECK: Root nodes visible ngay
✅ CHECK: Collapsible (▶️/▼ icon)
✅ CHECK: Click expand → children load
✅ CHECK: Icons per level (🏢📦🏭👥⚡)
✅ CHECK: Depth indentation 16px/level
✅ CHECK: Selected unit purple bg
✅ CHECK: Hover unit gray bg
```

**4.2 User List**
```
✅ CHECK: Select unit → users load < 1s
✅ CHECK: "Gán nhân viên" button visible
✅ CHECK: User cards với checkbox
✅ CHECK: Click checkbox → check/uncheck
✅ CHECK: "Chọn tất cả" button works
✅ CHECK: Count "X đã chọn" update
```

**4.3 Bulk Permissions**
```
✅ CHECK: Select users → permission grid hiển thị
✅ CHECK: Grid grouped by resource
✅ CHECK: 2 buttons per permission: [✅ bật] [❌ tắt]
✅ CHECK: Click ✅ → bulk grant (Promise.all)
✅ CHECK: Loading state (disabled buttons)
✅ CHECK: Success toast "Đã bật quyền cho X người"
✅ CHECK: Click ❌ → bulk revoke
✅ CHECK: Error handling (nếu fail)
```

---

## ⏱️ 30-MINUTE TEST (Full Coverage)

### Additional Tests

**Console Errors**
```
✅ CHECK: Không có error trong console
✅ CHECK: Không có warning về performance
✅ CHECK: Network tab: All requests < 3s
✅ CHECK: No 404/500 errors
```

**Data Consistency**
```
✅ CHECK: Assign role → refresh page → vẫn còn
✅ CHECK: Toggle permission → save → reload → đúng state
✅ CHECK: Bulk grant → check individual user → có quyền
✅ CHECK: Remove role → user không còn access
```

**Edge Cases**
```
✅ CHECK: User chưa có role → assign first role
✅ CHECK: User có 5 roles → remove 1 → còn 4
✅ CHECK: Role không có permission nào → assign vẫn ok
✅ CHECK: Select 50 users → bulk grant < 5s
✅ CHECK: Tree 5 levels deep → scroll works
```

**Accessibility**
```
✅ CHECK: Tab keyboard navigation works
✅ CHECK: Focus ring visible
✅ CHECK: Color contrast ≥ 4.5:1 (use browser tool)
✅ CHECK: Screen reader friendly (test với NVDA/JAWS)
```

**Performance**
```
✅ CHECK: Lighthouse score > 80 (Performance)
✅ CHECK: Lighthouse score > 90 (Accessibility)
✅ CHECK: First Contentful Paint < 2s
✅ CHECK: Time to Interactive < 5s
✅ CHECK: No memory leaks (check Memory tab)
```

---

## 📋 Test Report Template

Sau khi test, điền form sau:

```
=== TEST REPORT ===
Date: [YYYY-MM-DD]
Tester: [Tên]
Build: [main branch, commit ad71d7c]
Environment: Production (Render)

PASS RATE:
- 5-min test: __/15 (___%)
- 15-min test: __/50 (___%)
- 30-min test: __/80 (___%)

CRITICAL ISSUES (Phải fix ngay):
1. [Mô tả issue]
2. ...

HIGH PRIORITY (Fix trong 1-2 ngày):
1. [Mô tả issue]
2. ...

MEDIUM PRIORITY (Fix trong tuần):
1. [Mô tả issue]
2. ...

LOW PRIORITY / NICE-TO-HAVE:
1. [Mô tả issue]
2. ...

UX RATING (1-5):
- Clarity: __/5
- Efficiency: __/5
- Feedback: __/5
- Consistency: __/5
- Overall: __/5

COMMENTS:
[Ghi chú thêm, đề xuất cải tiến...]

RECOMMENDATION:
[ ] Ready to use (≥ 90% pass)
[ ] Minor fixes needed (80-89% pass)
[ ] Major fixes needed (< 80% pass)
```

---

## 🚀 Quick Commands

**Test locally:**
```bash
cd frontend
npm run dev
# Open http://localhost:5173/permissions
```

**Test production:**
```
Open: https://tubep-frontend-s30w.onrender.com/permissions
Login: admin@tubep.vn / admin123
```

**Check build size:**
```bash
cd frontend
npm run build
ls -lh dist/assets/*.js
# Main bundle should be < 1MB
```

**Lighthouse audit:**
```
1. Open DevTools (F12)
2. Lighthouse tab
3. Generate report (Mobile + Desktop)
4. Check scores
```

---

Chúc test thuận lợi! 🎯
