# Hai bản vá còn thiếu trên GitHub

Tôi không đẩy được lên `backen-pixel/Quanlycongviec` (proxy của phiên chặn: repo
không nằm trong danh sách nguồn được phép). Hai patch dưới đây áp thẳng lên
`origin/main` hiện tại của GitHub.

## Cách áp

```bash
cd /đường/dẫn/tới/Quanlycongviec
git fetch origin
git checkout -B fix/cot-thieu origin/main
git am 0001-cot-thieu-planner-va-nhat-ky-cong-viec.patch
git am 0002-ha-lo-in-xuong-300.patch
git am 0003-sua-29-cot-khong-ton-tai.patch
cd backend && npm run test:perf-retention   # phải ra 24/24
cd .. && git push origin fix/cot-thieu:main
```

**Patch 0003 là lớn nhất** — 20 file, sửa 29 cột không tồn tại tìm được bằng rà
soát tĩnh. Xem `RA-SOAT-sau-khi-sua.md` để đối chiếu: phần `.select()` còn 0 lỗi.

## Vì sao phải áp lên `origin/main` chứ không đẩy `main` cục bộ

**Repo cục bộ trên máy bạn đã phân kỳ với GitHub.** Đẩy thẳng sẽ bị từ chối,
hoặc tệ hơn là xoá mất việc của phiên khác.

GitHub **đã có** toàn bộ việc của tôi nhưng dưới **SHA khác** (ai đó đã commit
lại): `144e1082`, `90781b2a`, `3a568ba9`, `7302abb0`, `c0416acc`… trùng nội dung
với các commit cục bộ `575d64fc`, `38e5d161`, `c6776429`, `5452215c`, `0000b13e`.
Migration 585–588 đều đã có trên GitHub.

GitHub còn có việc **song song** mà máy bạn chưa có:

| Commit | Nội dung |
|---|---|
| `7fa59c49` | `supabaseQueryGuard.js` — lớp cảnh báo cho 2 lỗi âm thầm của PostgREST |
| `64e739d3` | SX dashboard: 5 lỗi hiệu năng/dữ liệu ở quy mô lớn |
| `adcac1f4` `2438d3d8` `96a9c223` | Báo cáo hàng ngày: ~9s → ~2.6s → ~1.0s (135 → 22 truy vấn) |
| `f476c087` | CRM/SX dashboard: tăng tốc tải |
| `769a616d` | Merge — giữ cả hai cải tiến trên `productionClientCompanies.js` |

Nên **đừng** `git push --force` từ máy. Cách an toàn: `git fetch origin` rồi
`git reset --hard origin/main` cho nhánh `main` cục bộ, sau đó áp 2 patch này.

## Nội dung hai patch

**0001** — hai cột thiếu cuối cùng (đã tìm bằng cách quét trọn 24 giờ log):
- `database/589` — `tasks.planner_order`. Migration `database/25` có sẵn trong
  repo nhưng chưa từng chạy trên production, nên **trang Planner không lấy được
  việc nào** và thao tác kéo-thả sắp xếp cũng hỏng. *Đã áp dụng live vào DB rồi.*
- `dailyWorkHistory.js` — select `'content, note'` trong khi bảng
  `crm_activities` không có cột nào trong hai cái đó (cột đúng: `description`),
  nên **nhật ký công việc luôn hiện 0 hoạt động CRM**. GitHub vẫn còn lỗi này.

**0002** — sửa một suy luận sai của tôi. `supabaseQueryGuard.js` đo được `.in()`
gãy trên **643 id**, mà tôi lại để `CH = 800` vì tin rằng "800 đã chạy được lâu
nay". Đó không phải bằng chứng. Hạ mọi lô xuống **300** (đúng ngưỡng cảnh báo mà
guard dùng).

## Trạng thái phía DATABASE

Không cần làm gì — migration 585, 586, 587, 588, 589 **đã áp dụng live** vào
project `kdxypztstbeovyedmvem`. Hai patch trên chỉ là phần CODE.
