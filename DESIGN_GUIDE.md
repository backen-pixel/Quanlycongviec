# Create Project Page — Visual Design Guide

## Layout Structure

```
FULLSCREEN (no sidebar padding)
├── HEADER (sticky, white bg)
│   ├── LEFT: Logo box + Title + Subtitle
│   │   "📌 Tạo Dự Án Mới"
│   │   "Nhập thông tin cơ bản và chọn luồng quy trình"
│   │
│   └── RIGHT: [Hủy] button (gray)
│
├── TABS (max-width 5xl, centered, margin: auto)
│   ├── [📋 Thông Tin] — Active = blue gradient, white text
│   ├── [🔄 Quy Trình]  — Inactive = gray text
│   └── [📎 Tệp Đính Kèm] — Inactive = gray text
│
├── CARD (white, rounded-2xl, shadow-lg)
│   └── CONTENT
│       Tab 1: Form fields
│       Tab 2: Flow preview
│       Tab 3: File upload
│
└── FOOTER (max-width 5xl, centered)
    ├── [Hủy]
    └── [Tiếp Tục →] / [← Quay Lại] / [Tạo Dự Án] ✓
```

---

## Color Palette

| Color | Usage | Tailwind |
|-------|-------|----------|
| Blue 500-600 | Primary actions, active tab | `from-blue-500 to-blue-600` |
| Emerald 500 | Create/success button | `from-emerald-500 to-teal-600` |
| Red 500 | Errors, warnings | `text-red-600`, `border-red-300` |
| Green 50 | Info background | `from-emerald-50 to-teal-50` |
| Blue 50 | Customer info card | `from-blue-50 to-cyan-50` |
| Gray 100-200 | Secondary buttons | `bg-gray-100 hover:bg-gray-200` |
| Gray 900 | Text (dark) | `text-gray-900` |
| Gray 500-600 | Secondary text | `text-gray-500` |

---

## Tab 1: Thông Tin (Information)

```
┌──────────────────────────────────────────────┐
│ 📌 Tên Dự Án *                               │
│ [Full-width input, blue border on focus]     │
│                                              │
│ 👤 Khách Hàng *        [+ Thêm mới]         │
│ [Dropdown list]        (right-aligned link) │
│                                              │
│ When creating customer:                      │
│ ┌────────────────────────────────────────┐  │
│ │ 🌀 Tạo Khách Hàng Mới (blue gradient)  │  │
│ │ [Họ tên] [SĐT]                         │  │
│ │ [Email]  [Thành phố]                   │  │
│ │ [Tạo KH] [Hủy]                         │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ When selected, show:                         │
│ ┌────────────────────────────────────────┐  │
│ │ 👤 Thông Tin Khách Hàng (blue card)   │  │
│ │ Tên: ...  | SĐT: ... | Email: ...     │  │
│ │ (3-column grid)                        │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ 📍 Địa Chỉ Lắp Đặt                         │
│ [Textarea, 2 rows]                         │
│                                              │
│ GRID (2 cols):                              │
│ ┌────────────────┬──────────────────────┐  │
│ │ 📝 Mô Tả       │ 💰 Giá Trị Dự Tính  │  │
│ │ [Textarea]     │ [Number input]       │  │
│ │                │                      │  │
│ │                │ ⭐ Mức Độ Ưu Tiên   │  │
│ │                │ [🟢 Thấp / 🟡 TB / 🔴 Cao] │
│ └────────────────┴──────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## Tab 2: Quy Trình (Process)

```
┌──────────────────────────────────────────────┐
│ 🔄 Chọn Luồng Quy Trình *                    │
│                                              │
│ ┌──────────┬──────────┬──────────┐          │
│ │ Luồng 1  │ Luồng 2  │ Luồng 3  │          │
│ │ Desc...  │ Desc...  │ ⭐ Mặc định         │
│ └──────────┴──────────┴──────────┘          │
│ (3-column grid, hover highlights)           │
│                                              │
│ ─────────────────────────────────────────    │
│                                              │
│ 🔄 Cấu Trúc Luồng: [Luồng được chọn]       │
│                                              │
│ ┌────────────────────────────────────────┐  │
│ │ 1️⃣ BỨC 1: TƯ VẤN         [▼ expand]    │  │
│ │    Description here      [2 bộ phận]   │  │
│ │                                        │  │
│ │ ┌──────────────────────────────────┐ │  │
│ │ │ ► Bộ phận 1: Tư vấn khách hàng  │ │  │
│ │ │   [3 nhiệm vụ]                  │ │  │
│ │ │                                  │ │  │
│ │ │ ► Bộ phận 2: Báo giá sơ bộ      │ │  │
│ │ │   [2 nhiệm vụ]                  │ │  │
│ │ └──────────────────────────────────┘ │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ (More steps below, scrollable)              │
│                                              │
│ ┌────────────────────────────────────────┐  │
│ │ ✅ SUMMARY (green card)                │  │
│ │ Luồng này sẽ tạo tự động:             │  │
│ │ 25 nhiệm vụ                            │  │
│ │ Các NV sẽ được phân công theo stage... │  │
│ └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## Tab 3: Tệp Đính Kèm (Attachments)

```
┌──────────────────────────────────────────────┐
│ 📎 Báo Giá & Tài Liệu                        │
│                                              │
│ ┌····································────────┐│
│ │ ┌────────────────────────────────────┐  ││
│ │ │ 📁 [Chọn tệp hoặc kéo thả ở đây]   │  ││
│ │ └────────────────────────────────────┘  ││
│ │ (Tối đa 5 tệp, < 10MB mỗi cái)        ││
│ │ (dashed border, amber accent)           ││
│ └····································────────┘│
│                                              │
│ Tệp Đã Upload (3):                         │
│ ┌──────────────────────────────────────┐  │
│ │ 📄 Báo_giá_1.pdf   5.2 MB  [X delete] │  │
│ ├──────────────────────────────────────┤  │
│ │ 📄 Bản_vẽ_kỹ_thuật.docx  2.1 MB [X]  │  │
│ ├──────────────────────────────────────┤  │
│ │ 📸 Hình_tham_khảo.jpg  1.8 MB  [X]   │  │
│ └──────────────────────────────────────┘  │
│                                              │
│ ┌──────────────────────────────────────┐  │
│ │ 💡 Mẹo: Tải lên báo giá và tài liệu │  │
│ │ liên quan sẽ giúp theo dõi dự án...  │  │
│ │ (blue info card)                     │  │
│ └──────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## Footer Navigation

```
┌──────────────────────────────────────────────┐
│ [Hủy (gray)]      [← Quay Lại (gray)] [Tiếp →]│ ← Tab 1
│ [Hủy (gray)]      [← Quay Lại (gray)] [Tiếp →]│ ← Tab 2
│ [Hủy (gray)]                  [Tạo Dự Án ✓]│ ← Tab 3 (green)
└──────────────────────────────────────────────┘
```

---

## Hover & Interactive States

### Input Fields
- **Default**: `border-gray-200` + white bg
- **Focus**: `border-blue-500` + white bg + blue ring
- **Error**: `border-red-300` + `bg-red-50`
- **Disabled**: `bg-gray-100` + gray text

### Buttons
- **Primary (blue)**: `bg-blue-600` → hover `bg-blue-700`
- **Success (green)**: `from-emerald-500 to-teal-600` → hover darker
- **Secondary (gray)**: `bg-gray-100` → hover `bg-gray-200`
- **Disabled**: `bg-gray-400` (all variants)

### Tab
- **Active**: Blue gradient + white text + shadow
- **Inactive**: Gray text + no background
- **Hover**: Subtle highlight

### Cards
- **Default**: `border border-gray-200`
- **Highlight** (flow selected): `border-blue-500 bg-blue-50`
- **Error**: `border-red-300 bg-red-50`

---

## Responsive Behavior

| Screen | Changes |
|--------|---------|
| Mobile | 1-column grid for form fields |
| Tablet | 2-column for description/value fields |
| Desktop | Full 2-column + card layout |

---

## Animation & Transitions

- All color changes: `transition` (default 150ms)
- Tab switch: Smooth fade (Tailwind's built-in)
- Button hover: Color shift + subtle shadow
- Expand/collapse: ChevronDown/Right rotation (CSS transform)
- Error appearance: Immediate (no delay)

---

## Error Messages

Format:
```
[AlertCircle icon] Red text, 12px
"Tên dự án là bắt buộc"
```

Position: Below input field, 8px gap  
Color: `text-red-600`

---

## Success State

After clicking "Tạo Dự Án":
1. Button shows "Đang tạo..." + disabled state
2. API call in progress
3. On success: Navigate to `/projects/{id}` (ProjectDetail)
4. On error: Alert popup + stay on tab 1

---

**End of Design Guide**
