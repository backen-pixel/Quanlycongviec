# Kiểm thiết kế cô lập

Từ thư mục repo, chạy Python 3:

~~~text
python docs/architecture/overall-design-20261016/checks/generate_contract_examples.py
python docs/architecture/overall-design-20261016/checks/check_design.py
python docs/architecture/overall-design-20261016/checks/check_artifacts.py
~~~

Không cài dependency, không import backend, không đọc env/secret hoặc gọi mạng.
Schema dùng nhãn Draft2020-12 cho hình thức trao đổi. Vì runtime không có validator tổng quát, checker chỉ hỗ trợ chính xác tập keyword đã phát sinh và từ chối keyword chưa hỗ trợ. Đây không phải kiểm chuẩn JSON Schema độc lập; builder phải thêm validator chuẩn trong gói xây và contract tests của server.

Các mô hình quyết định, cap và callback chỉ kiểm tính nhất quán của thiết kế trên fixture tổng hợp. Chúng không phải implementation của service, không chứng minh atomic transaction, quyền hiệu lực hoặc chữ ký thật. LC01–LC12 không đổi T01–T32 từ NOT_RUN. LC11 kiểm các conditional shape; LC12 kiểm liên kết fixture C0/Command và reservation MODEL_CALL, không thay server authorization hoặc ledger.

results.json lưu kết quả thực chạy cuối cùng. Các tệp sinh ở schemas/ và examples/ được review cùng nguồn sinh; sửa schema phải chạy lại checker.

artifact-results.json kiểm 9 nguồn sơ đồ ở mức loại tệp/cặp block, parse XML của SVG và kích thước PNG. Không phải Mermaid parser/render; hình tổng thể được review trực quan riêng. Không suy các mũi tên là tích hợp live.
