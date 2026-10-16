# Kiểm chứng cục bộ và giới hạn

- generate-contracts.cjs sinh8recordschemas/fixtures, không gọi ứng dụng.
- check-contracts.cjs dùng Ajv8.20.0 cósẵn; [contract-results](contract-results.json) gồm positive/negative schema và purepolicy model. Audit schema2020 dùng Ajv2020 riêng. Không mạng/LLM/provider.
- probe-blank-db.cjs dùng PostgreSQL18.1 và pg cósẵn trongWSL, VM actualrunner logic với dotenvNO_OP/transportpin privateUnixsocket. [blank-db-results](blank-db-results.json) ghi2expectedfailures, ledger0, teardowntrue. Không rawreplay seed/repair hoặc thay productiontransport.
- check-package.py kiểm linklocal/JSON/sourcequotes/exactT01–T20/manifestsha và quét credential/PIIpattern trên các file thêm/sửa so productbaseline; [package-results](package-results.json) giữmetadata, khônginmatchedsecret.

Không install/upgrade tool. Ajv và PostgreSQL paths nhậntham số runtimeđãcó, khônghardcodecredential. Cóthể đọc các script trước chạy; baselineprobe tạo/dừng/xóa duy nhất DBtạm với boundarycheck.

LocalcheckPASS khônglà runtimeacceptance. T01–T32/V3A-T01–T24 giữNOT_RUN. ParserMermaidNOT_RUN. Secret/PIIscanner regexcục bộ cógiớihạn, khôngchứngminhkhôngcònbấtkỳPII; cầnreviewdiffvànguồn trướcpublish. Không quét/rawdump dữliệuCRM hoặc.env.
