# Hướng dẫn nhanh — Tạo việc ở Không gian chung

Giao việc cho thành viên deal (Bán hàng / Xưởng / Lắp đặt) ngay trên một màn hình chung.

**Trên app:** mở tab **Không gian chung** (CRM / SX / VC-LĐ) → bấm nút **?** cạnh **Thêm**.

---

## Mở Không gian chung

1. Mở **chi tiết Deal** (CRM), hoặc **chi tiết SX / VC / Dự án** (nếu đã gắn deal).
2. Chọn tab **🤝 Không gian chung**.
3. Ở khối **Giao việc cho thành viên**, bấm **?** để xem hướng dẫn, hoặc **Thêm** để tạo việc.

Có thể lọc trước bằng tab: **Tất cả · Bán hàng · Xưởng · Lắp đặt** — form sẽ gợi ý đúng bộ phận đó.

---

## Điền form (tối thiểu → đủ dùng)

| Bước | Ô trên form | Làm gì |
|------|-------------|--------|
| 1 | **Tên việc cần làm** * | Viết rõ việc (bắt buộc). |
| 2 | **Việc này vì sao?** * | Chọn loại (VD: khách yêu cầu / NV làm sai). Hệ thống có thể **tự gán người** theo cài đặt. |
| 3 | **Giao cho bộ phận nào?** * | Bán hàng / Xưởng / Lắp đặt. |
| 4 | **Người nhận việc** | Tick người nhận; chọn vai trò (Người chính / Người làm / Theo dõi / Quản lý). |
| 5 | Bấm **Giao cho N người** | Xong — người được chọn nhận việc. |

### Khi cần thêm (không bắt buộc)

- **Ghi chú thêm** — mô tả ngắn.
- **Lỗi xảy ra ở đâu?** — chỉ hiện khi chọn *Nhân viên làm sai* (có thể khác bộ phận nhận việc).
- **Xưởng nào làm?** — chỉ khi giao **Xưởng** và deal có nhiều xưởng.
- **Loại việc / hạn làm xong** — chọn loại (VD: kính CL) để **tự điền hạn**; vẫn sửa tay được.
- **Mức ưu tiên · Cột trên bảng · Hạn làm xong** — ưu tiên, cột kanban giao việc, deadline.
- **Ảnh minh họa** — đính kèm hình (tối đa 20).

---

## Sau khi tạo

- Việc hiện trong danh sách tab **Không gian chung** (lọc theo bộ phận nếu đang ở tab Xưởng / Lắp đặt…).
- Xem bảng giao việc riêng: link **Giao việc** trên header (CRM / SX / VC tùy bộ phận).
- Sửa / xóa: mở thẻ việc → sửa hoặc xóa.

---

## Lưu ý nhanh

- Cần **deal bán hàng** (lead CRM gắn dự án) mới giao được.
- Chưa thấy người nhận: kiểm tra đã thêm **thành viên deal**, hoặc chọn đúng **loại việc** (lấy người từ cài đặt), hoặc đúng **bộ phận / xưởng**.
- Cài loại việc & người mặc định: **Quản lý → Loại lỗi / loại việc** (`/management/error-types`).

---

## Luồng 1 dòng

```
Mở Deal → Tab Không gian chung → Thêm
→ Tên việc → Vì sao → Bộ phận → Người nhận → Giao
```
