# Runbook cắt chuyển — CHỈ khi anh nói «chuyển»

Rollback: đảo webhook + `NEXTGO_CUTOVER=YES node scripts/freeze-nextgo-source.js --unfreeze --apply`

## Thứ tự

1. Thông báo user NextGo cửa sổ 2–4 giờ.
2. Freeze nguồn: `NEXTGO_CUTOVER=YES node scripts/freeze-nextgo-source.js --apply`
3. Delta: `node scripts/export-nextgo-instance.js --since=<exported_at UAT>`
4. `node scripts/import-nextgo-instance.js --apply` + `copy-nextgo-storage.js --apply`
5. So counts manifest vs đích.
6. Facebook (sau khi đích đã có đủ 1 page / 2057 contact / 16050 tin):
   - Meta Developer → Webhooks callback `https://<domain-nextgo>/api/facebook/webhook`
   - Verify token khớp `facebook_pages.webhook_verify_token`
   - Subscribe page `1102202982968909`
   - Hệ cũ giữ nguyên dữ liệu; chỉ đổi URL nhận tin mới
   - Zalo: NextGo đang 0 OA — bỏ qua
7. DNS / bookmark domain mới.
8. Smoke: 1 tin FB, 1 deal, 1 task SX, 1 file.
9. Hệ cũ chỉ đọc 14 ngày.

Không dual-run inbox. Không sửa `main` Tủ Bếp ngoài freeze.
