# API

| File | Mô tả |
|---|---|
| [API_DOCUMENT.md](./API_DOCUMENT.md) | Inventory đầy đủ endpoint Express (nguồn máy sinh) |
| [openapi.yaml](./openapi.yaml) | Stub OpenAPI — mở rộng dần |
| [postman/](./postman/) | Collection Postman (nếu có) |
| [generate-api-doc.js](./generate-api-doc.js) | Script quét routes |

```bash
node docs/api/generate-api-doc.js
```

**Nguyên tắc:** Backend là nguồn chuẩn business rules; contract API phải khớp route thực tế trước khi frontend suy diễn.
