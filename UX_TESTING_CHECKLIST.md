# UX/UI TESTING CHECKLIST - TuBep Pro Permissions

## 📱 Responsive Testing

### Desktop (1920x1080)
- [ ] Tab layout hiển thị đầy đủ
- [ ] Sidebar không che nội dung
- [ ] Modal căn giữa màn hình
- [ ] Grid permissions không bị overflow
- [ ] Ecosystem tree không bị cut

### Tablet (768x1024)
- [ ] Tabs không bị wrap xuống dòng
- [ ] Filter grid stack theo chiều dọc
- [ ] User cards hiển thị 2 cột
- [ ] Permission grid stack thành 1 cột
- [ ] Modal fit trong viewport

### Mobile (375x667)
- [ ] Tabs scroll được (horizontal scroll)
- [ ] Filter dropdown full width
- [ ] User list 1 cột
- [ ] Tree có horizontal scroll nếu cần
- [ ] Buttons đủ lớn để tap (min 44x44px)

## 🎨 Visual Design

### Colors
- [ ] Purple primary (#9333EA) nhất quán
- [ ] Green success (#10B981) cho granted
- [ ] Red danger (#EF4444) cho revoked
- [ ] Gray neutral (#6B7280) cho disabled
- [ ] Contrast đủ cho accessibility (WCAG AA)

### Typography
- [ ] Heading: 16-20px, bold
- [ ] Body: 13-14px, regular
- [ ] Label: 12px, medium
- [ ] Caption: 11px, regular
- [ ] Line-height 1.5 cho readability

### Spacing
- [ ] Padding card: 16px
- [ ] Gap between elements: 8-12px
- [ ] Margin sections: 16-24px
- [ ] Button padding: 8px 16px
- [ ] Modal padding: 24px

### Icons
- [ ] Size nhất quán (16px hoặc 20px)
- [ ] Alignment với text (vertical center)
- [ ] Color match với text
- [ ] Có tooltip khi hover (optional)

## ⚡ Performance

### Loading States
- [ ] Spinner hiển thị khi load data
- [ ] Skeleton screen cho danh sách lớn
- [ ] Disabled state cho buttons khi saving
- [ ] Progress indicator cho bulk operations

### Response Time
- [ ] Tab switch: < 100ms
- [ ] Filter update: < 500ms
- [ ] Role toggle: < 300ms
- [ ] Bulk permission: < 2s cho 10 users
- [ ] Tree expand: instant (no delay)

### Data Loading
- [ ] Lazy load ecosystem tree (load on expand)
- [ ] Paginate user list nếu > 100 users
- [ ] Debounce search input (300ms)
- [ ] Cache filter results (local)

## 🖱️ Interactions

### Clicks
- [ ] Click target đủ lớn (min 44x44px)
- [ ] Hover state rõ ràng (background change)
- [ ] Active state khi click (visual feedback)
- [ ] Double-click protection (disable button)

### Keyboard Navigation
- [ ] Tab order logic (left to right, top to bottom)
- [ ] Enter submit forms
- [ ] Esc close modals
- [ ] Arrow keys navigate tree (optional)
- [ ] Focus ring visible (accessibility)

### Touch Gestures
- [ ] Tap = click (no delay)
- [ ] Swipe scroll trong lists
- [ ] Pinch zoom disabled (prevent accident)
- [ ] Long-press không làm gì (avoid confusion)

## 📋 Forms

### Input Fields
- [ ] Label rõ ràng, bên trên input
- [ ] Placeholder hữu ích (example value)
- [ ] Border khi focus (purple)
- [ ] Error state (red border + message)
- [ ] Success state (green checkmark)

### Dropdowns
- [ ] Options sorted alphabetically
- [ ] Search trong dropdown (nếu > 10 items)
- [ ] Selected value highlighted
- [ ] Placeholder "-- Chọn... --"
- [ ] Disabled state (gray + cursor not-allowed)

### Checkboxes
- [ ] Size đủ lớn (20x20px min)
- [ ] Checked state rõ ràng (purple background)
- [ ] Label clickable (tăng click area)
- [ ] Indeterminate state cho "Chọn tất cả" (nếu có)

### Buttons
- [ ] Primary action nổi bật (purple bg)
- [ ] Secondary action subtle (border only)
- [ ] Danger action red (delete, revoke)
- [ ] Disabled state (gray, not clickable)
- [ ] Loading state (spinner inside button)

## 🔔 Feedback

### Success Messages
- [ ] Toast notification (top-right)
- [ ] Green background + checkmark icon
- [ ] Auto-dismiss sau 3s
- [ ] Close button (×) nếu user muốn đóng sớm
- [ ] Text rõ ràng: "✅ Đã gán vai trò cho 10 nhân viên"

### Error Messages
- [ ] Toast notification hoặc inline
- [ ] Red background + warning icon
- [ ] Không auto-dismiss (user phải đóng)
- [ ] Text cụ thể lỗi, không generic
- [ ] Suggest solution nếu được (e.g., "Thử lại")

### Loading Indicators
- [ ] Spinner cho async operations
- [ ] Progress bar cho uploads (nếu có)
- [ ] Text "Đang xử lý..." khi save
- [ ] Disable form khi loading (prevent spam)

## 🌐 Accessibility (a11y)

### Screen Readers
- [ ] Semantic HTML (header, nav, main, section)
- [ ] ARIA labels cho icons
- [ ] Alt text cho images (nếu có)
- [ ] Role attributes (button, checkbox, etc.)

### Keyboard-only Users
- [ ] All interactive elements focusable
- [ ] Focus order logical
- [ ] Skip links (skip to main content)
- [ ] No keyboard traps

### Visual Impairments
- [ ] Color contrast ratio ≥ 4.5:1
- [ ] Text scalable (không fixed px)
- [ ] Icons + text labels (không icon-only)
- [ ] Focus indicators visible

## 🧪 Edge Cases

### Empty States
- [ ] "Chưa có vai trò nào" khi roles = []
- [ ] "Chưa có nhân viên" khi users = []
- [ ] "Chưa có quyền nào" khi permissions = []
- [ ] Illustration + CTA ("Tạo vai trò mới")

### Error States
- [ ] Network error → "Không thể tải dữ liệu"
- [ ] 404 Not Found → "Không tìm thấy"
- [ ] 500 Server Error → "Lỗi hệ thống, thử lại sau"
- [ ] Retry button

### Data Limits
- [ ] 1000+ users → pagination hoặc virtual scroll
- [ ] 100+ permissions → collapse groups
- [ ] Deep tree (5+ levels) → scroll horizontal
- [ ] Long names → truncate với tooltip

### Concurrent Updates
- [ ] User A sửa quyền → User B refresh → thấy update
- [ ] Optimistic UI (update ngay, revert nếu fail)
- [ ] Conflict resolution (last write wins)

## 📊 Specific Tests cho Permission Page

### Tab 1: Vai trò & Quyền

**Test 1: Toggle permissions**
- [ ] Click checkbox → toggle ngay (optimistic)
- [ ] "Lưu thay đổi" button enabled
- [ ] Click "Lưu" → spinner → success toast
- [ ] Badge count update (e.g., "12/28 quyền")

**Test 2: Create role**
- [ ] Modal mở smooth (fade-in 200ms)
- [ ] Form validation: tên required
- [ ] Submit disabled nếu invalid
- [ ] Success → close modal + reload list

**Test 3: System roles**
- [ ] "Admin" role có badge "Hệ thống"
- [ ] Checkbox disabled (cannot edit)
- [ ] Tooltip "Vai trò hệ thống không thể sửa"

### Tab 2: Gán vai trò

**Test 4: Filter users**
- [ ] Dropdown load divisions ngay
- [ ] Chọn division → load companies
- [ ] Chọn company → load departments
- [ ] User list update < 500ms

**Test 5: Assign role**
- [ ] Click user → modal instant
- [ ] Dropdown roles đầy đủ
- [ ] Scope dropdown hierarchical (division > company > dept)
- [ ] Submit → add to list → close modal

**Test 6: Remove role**
- [ ] Click × → confirm dialog
- [ ] "Có" → remove → success toast
- [ ] "Không" → nothing happens

### Tab 3: Phân quyền chi tiết

**Test 7: Ecosystem tree**
- [ ] Root nodes visible immediately
- [ ] Click expand → load children (lazy)
- [ ] Selected unit highlighted (purple bg)
- [ ] Depth indentation clear (16px per level)

**Test 8: Multi-select users**
- [ ] Click checkbox → check/uncheck
- [ ] "Chọn tất cả" → select all visible
- [ ] Count badge "3 đã chọn"
- [ ] Deselect visible

**Test 9: Bulk grant/revoke**
- [ ] Select 5 users → click ✅ "view"
- [ ] Loading 2s → success toast "5 người"
- [ ] Refresh data → 5 users có quyền view
- [ ] Click ❌ "delete" → revoke

## 🎯 Overall UX Goals

- [ ] **Clarity**: User hiểu ngay họ cần làm gì
- [ ] **Efficiency**: Hoàn thành task nhanh (< 1 min)
- [ ] **Forgiveness**: Có thể undo/revert
- [ ] **Consistency**: Patterns nhất quán across app
- [ ] **Feedback**: Luôn có response cho mọi action
- [ ] **Simplicity**: Không quá phức tạp, overwhelming
- [ ] **Delight**: Có moments khiến user thích thú (smooth animations, helpful messages)

## 📈 Success Metrics

- [ ] Task completion rate: ≥ 90%
- [ ] Time to complete: ≤ 2 min (gán role cho 1 user)
- [ ] Error rate: ≤ 5%
- [ ] User satisfaction: ≥ 4/5
- [ ] Return rate: users quay lại dùng
- [ ] Support tickets: minimize "How do I..."

---

## Cách sử dụng checklist này:

1. **Print hoặc mở song song** khi test app
2. **Tick ✅ từng item** khi test xong
3. **Ghi note** bên cạnh nếu có issue
4. **Tổng hợp** các vấn đề ở cuối
5. **Prioritize** fix theo mức độ nghiêm trọng (critical > high > medium > low)
6. **Iterate** sau mỗi lần fix, test lại

**Mục tiêu**: ≥ 90% checklist ✅ = ready to ship!
