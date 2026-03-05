# 🎨 Gợi ý Redesign: Project Overview + Sidebar

**Date**: 2026-03-05  
**Component**: ProjectDetail.jsx (header, stage pipeline, info cards, sidebar)

---

## 📊 HIỆN TẠI (Current State)

### Layout:
```
┌─────────────────────────────────────────────────────────┐
│ [Header] Mã dự án • Tên • Công ty | [Actions]          │
├─────────────────────────────────────────────────────────┤
│ [Stage Pipeline] Tư vấn > Thiết kế > Báo giá > ...     │
├─────────────────────────────────────────────────────────┤
│ [Info Cards 3-col]                                      │
│   Khách hàng    |    Giá trị      |    Tiến độ         │
├─────────────────────────────────────────────────────────┤
│ [File báo giá - collapsible]                            │
├─────────────────────────────────────────────────────────┤
│ [Nhân sự dự án - collapsible]                           │
├─────────────────────────────────────────────────────────┤
│ [Template Sets info] (nếu có flowAssignments)           │
├─────────────────────────────────────────────────────────┤
│ [Tabs] Tasks | Luồng | Duyệt | Tài liệu | Chat         │
└─────────────────────────────────────────────────────────┘
```

### Vấn đề:
❌ **Stage pipeline** quá dài (8 stages), khó nhìn trên mobile  
❌ **Info cards** nằm ngang, lãng phí không gian vertical  
❌ **Nhân sự** ẩn sau collapse, khó truy cập nhanh  
❌ **Template Sets** card riêng biệt, trùng lặp với flow info  
❌ Không có **sidebar** để xem thông tin dự án nhanh khi scroll  

---

## 🎯 GỢI Ý REDESIGN

### OPTION A: 2-Column Layout (Desktop) + Sticky Sidebar

```
┌──────────────────┬──────────────────────────────────────┐
│  SIDEBAR (30%)   │  MAIN CONTENT (70%)                  │
│  (sticky)        │                                       │
├──────────────────┼──────────────────────────────────────┤
│ 🏢 Thông tin DA  │ [Header Compact]                     │
│   • Mã: TB-2026  │ TB-2026-001 • Tủ bếp Nhôm kính...   │
│   • Khách: Anh A │                                       │
│   • Giá: 50M VND │ [Stage Tracker - Vertical Timeline]  │
│   • Tiến độ: 75% │   ●━━━ Tư vấn       [Hoàng A]       │
│                  │   ●━━━ Thiết kế     [Trần B]        │
│ 👥 Nhân sự       │   ●━━━ Báo giá      [Lê C]          │
│   [Avatars x4]   │   ○─── Hợp đồng     [Chưa gán]      │
│                  │   ○─── Sản xuất                       │
│ 📋 Luồng         │                                       │
│   Luồng 8 bước   │ [Tabs] Tasks | Luồng | ...           │
│   Cty A: 75%     │                                       │
│   Cty B: 30%     │ [Tab Content]                         │
│                  │                                       │
│ 📎 File (3)      │                                       │
│   [List files]   │                                       │
└──────────────────┴──────────────────────────────────────┘
```

**Ưu điểm**:
✅ Sidebar sticky → info luôn nhìn thấy khi scroll  
✅ Stage timeline vertical → đẹp hơn, responsive tốt  
✅ Main content rộng hơn cho tabs  
✅ Tất cả info tập trung 1 chỗ  

**Nhược điểm**:
⚠️ Mobile phải collapse sidebar thành modal  
⚠️ Cần redesign khá nhiều code  

---

### OPTION B: Single Column + Compact Header + Better Cards

```
┌─────────────────────────────────────────────────────────┐
│ [Compact Header]                                        │
│  TB-2026-001 • Tủ bếp Nhôm kính • 🏢 Công ty A          │
│  Status: 🟢 Thiết kế | 👤 PM: Nguyễn Văn A             │
│  ────────────────────────────────────────────────────   │
│  ██████████░░░░░ 75% (6/8 tasks)                       │
├─────────────────────────────────────────────────────────┤
│ [Stage Progress - Horizontal Compact]                   │
│  ✓ Tư vấn → ✓ Thiết kế → ● Báo giá → Hợp đồng → ...   │
│  [4 done] [1 active] [3 pending]                        │
├─────────────────────────────────────────────────────────┤
│ [Info Grid 2x2]                                         │
│  👤 Khách hàng: Anh Nguyễn • 0903...  | 💰 50.000.000₫ │
│  📋 Luồng: 8 bước • 2 công ty          | 📎 File: 3     │
├─────────────────────────────────────────────────────────┤
│ [Flow Assignments - Inline Cards]                       │
│  ┌──────────────┐  ┌──────────────┐                   │
│  │ Cty A        │  │ Cty B        │                   │
│  │ Template ABC │  │ Template XYZ │                   │
│  │ ████░░ 75%   │  │ ██░░░░ 30%   │                   │
│  └──────────────┘  └──────────────┘                   │
├─────────────────────────────────────────────────────────┤
│ [Quick Actions]                                         │
│  👥 Nhân sự (8) | 📎 File (3) | 💬 Chat (12) | ...     │
│  [Click to expand inline, không navigate]              │
├─────────────────────────────────────────────────────────┤
│ [Tabs] Tasks | Luồng | Duyệt | Tài liệu                │
└─────────────────────────────────────────────────────────┘
```

**Ưu điểm**:
✅ Compact, tiết kiệm vertical space  
✅ Responsive tốt (mobile/desktop giống nhau)  
✅ Quick actions inline, không cần scroll  
✅ Ít thay đổi code hơn Option A  

**Nhược điểm**:
⚠️ Khi scroll xuống mất header info  
⚠️ Stage pipeline vẫn nằm ngang (nhưng compact hơn)  

---

### OPTION C: Accordion-Style Sidebar (Hybrid)

```
┌─────────────────────────────────────────────────────────┐
│ [Mini Header Sticky]                                    │
│  TB-2026-001 • Thiết kế • 75% • [▼ Xem thêm]           │
├─────────────────────────────────────────────────────────┤
│ [Collapsible Sections]                                  │
│                                                          │
│  ▼ Tổng quan (auto-expanded)                            │
│    👤 Khách: Anh A • 📞 0903...                         │
│    💰 Giá trị: 50.000.000₫ • 🏢 Công ty A               │
│    📋 Luồng: 8 bước • Template ABC                      │
│                                                          │
│  ▶ Quy trình (8 bước)                                   │
│    [Stage cards với avatars + progress]                 │
│                                                          │
│  ▶ Nhân sự (8 người)                                    │
│    [Avatar grid với roles]                              │
│                                                          │
│  ▶ File đính kèm (3)                                    │
│    [File list với preview]                              │
│                                                          │
│  ▶ Công ty thực hiện (2)                                │
│    [Flow assignment cards]                              │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ [Tabs] Tasks | Luồng | Duyệt | Tài liệu                │
└─────────────────────────────────────────────────────────┘
```

**Ưu điểm**:
✅ User control được space (expand chỉ những gì cần)  
✅ Mini header sticky giúp luôn thấy project code  
✅ Tất cả info có sẵn, không cần navigate  
✅ Dễ implement (chỉ refactor collapse logic)  

**Nhược điểm**:
⚠️ Nhiều clicks để xem info (nếu collapsed)  
⚠️ Vertical space vẫn khá dài nếu expand hết  

---

## 🎨 CHI TIẾT CẢI TIẾN

### 1. Stage Pipeline - 3 Options

#### A. Timeline Vertical (Best for sidebar)
```
●━━━━ Tư vấn          ✓ Done • 2 tasks • Hoàng A
│
●━━━━ Thiết kế        ✓ Done • 3 tasks • Trần B
│
●━━━━ Báo giá         ● Active • 1/3 tasks • Lê C
│
○──── Hợp đồng        Pending
│
○──── Sản xuất        Pending
```

#### B. Progress Bar Compact (Best for horizontal)
```
[Tư vấn ✓] → [Thiết kế ✓] → [Báo giá ●] → [Hợp đồng] → [Sản xuất] → ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░
      3/8 stages done • 75% complete
```

#### C. Dots + Tooltips (Ultra compact)
```
● ● ● ○ ○ ○ ○ ○  [3/8 stages]
[Hover for detail]
```

### 2. Info Cards - Better Layout

#### Current (3 columns):
```
┌─────────────┬─────────────┬─────────────┐
│ Khách hàng  │  Giá trị    │  Tiến độ    │
│   Content   │  Content    │  Content    │
└─────────────┴─────────────┴─────────────┘
```

#### Redesign (2x2 grid):
```
┌─────────────────────┬─────────────────────┐
│ 👤 Khách hàng       │ 💰 Giá trị          │
│   Anh Nguyễn        │   50.000.000₫       │
│   📞 0903...        │   💳 Đã cọc: 20M    │
├─────────────────────┼─────────────────────┤
│ 📋 Luồng            │ 📎 Tài liệu         │
│   8 bước • 2 CT     │   3 file báo giá    │
│   ████░░ 75%        │   + Upload          │
└─────────────────────┴─────────────────────┘
```

#### Redesign (List style - compact):
```
┌──────────────────────────────────────────────────┐
│  👤 Khách hàng: Anh Nguyễn • 📞 0903... • 📍 HCM │
│  💰 Giá trị: 50.000.000₫ • 💳 Đã thu: 20M (40%)  │
│  📋 Luồng: 8 bước • Công ty A, B • ████░░ 75%    │
│  📎 File: 3 tệp • 💬 Chat: 12 tin • 👥 Team: 8   │
└──────────────────────────────────────────────────┘
```

### 3. Nhân sự - Better Display

#### Current (Collapse + Grid):
```
[▼ Nhân sự dự án]
  ┌─────────────────────────────────┐
  │ [Avatar] [Avatar] [Avatar] ...  │
  │  Hoàng A   Trần B    Lê C       │
  │  Tư vấn    Thiết kế  Báo giá    │
  └─────────────────────────────────┘
```

#### Option 1: Inline Avatars (Always visible)
```
👥 Team (8):  [H] [T] [L] [N] [P] +3
              Hover to see names/roles
```

#### Option 2: Stage-grouped Cards
```
📋 Tư vấn       👤 Hoàng Anh (PM)
📋 Thiết kế     👤 Trần Bảo • 👤 Lê Cường (2)
📋 Báo giá      👤 Chưa gán
```

#### Option 3: Role-grouped
```
👑 Project Manager:  Nguyễn Văn A
🎨 Designers:        Trần B, Lê C (2)
🏭 Production:       Phạm D, Hoàng E, Trương F (3)
📦 Shipping:         Chưa gán
```

### 4. Flow Assignments (Template Sets) - Inline

#### Current (Separate big card):
```
[📋 Bộ Quy Trình Đang Dùng]
┌─────────────────┬─────────────────┐
│ 1 Công ty A     │ 2 Công ty B     │
│ Template ABC    │ Template XYZ    │
│ 75% • 6/8       │ 30% • 3/10      │
│ ██████░░        │ ███░░░░░        │
└─────────────────┴─────────────────┘
```

#### Redesign (Compact badges):
```
📋 Luồng: 8 bước • 2 công ty
  ┌─────────────────┐ ┌─────────────────┐
  │ Cty A 75% ████░ │ │ Cty B 30% ██░░░ │
  └─────────────────┘ └─────────────────┘
```

---

## 📱 RESPONSIVE CONSIDERATIONS

### Desktop (>1024px):
- Option A: 2-column sidebar layout
- Sidebar fixed, main scrollable
- Stage timeline vertical

### Tablet (768-1024px):
- Single column
- Collapsible sections
- Stage pipeline horizontal compact

### Mobile (<768px):
- All collapsed by default
- Mini sticky header with expand button
- Stage progress bar only (no individual stages)
- Info cards 1 column

---

## 🎯 RECOMMENDATION

**Best choice: OPTION B + OPTION C hybrid**

1. **Header**: Compact single-line với progress bar
2. **Stage Pipeline**: Dots + hover tooltips (ultra compact)
3. **Info**: 2x2 grid cards (desktop) / List style (mobile)
4. **Nhân sự**: Inline avatars với hover
5. **Files**: Badge với count (click to expand modal)
6. **Flow Assignments**: Inline compact badges

### Why?
✅ Tiết kiệm space tối đa  
✅ Responsive tốt nhất  
✅ Ít code changes  
✅ UX smooth, không phải scroll nhiều  
✅ Tất cả info có sẵn trong 1-2 screens  

---

## 🛠️ IMPLEMENTATION ROADMAP

### Phase 1: Quick Wins (1-2 giờ)
- [ ] Compact header (single line + progress bar)
- [ ] Info cards từ 3-col → 2x2 grid
- [ ] Nhân sự inline avatars
- [ ] Files badge với modal

### Phase 2: Medium (2-3 giờ)
- [ ] Stage pipeline compact (dots/progress bar)
- [ ] Flow assignments inline badges
- [ ] Quick actions bar
- [ ] Sticky mini header

### Phase 3: Full Redesign (4-5 giờ)
- [ ] 2-column layout với sidebar
- [ ] Vertical timeline
- [ ] Collapsible sections với animations
- [ ] Full responsive rewrite

---

## 🎨 DESIGN TOKENS

### Colors:
- Primary: Blue (#3B82F6)
- Success: Emerald (#10B981)
- Warning: Amber (#F59E0B)
- Danger: Red (#EF4444)
- Stage done: Emerald 100/700
- Stage active: Blue 600
- Stage pending: Gray 200/400

### Spacing:
- Compact mode: p-2, gap-1.5, text-xs
- Normal mode: p-4, gap-3, text-sm
- Sidebar: w-80 (320px)
- Mini header: h-12

### Icons:
- Use lucide-react (already imported)
- Size: h-3.5 w-3.5 (compact), h-4 w-4 (normal)

---

**Next**: Chọn option nào để implement? Tôi sẽ code ngay!
