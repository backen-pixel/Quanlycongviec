const { createHash } = require('node:crypto');
const NO_EVIDENCE = 'Chưa có kết quả công cụ đã xác minh cho yêu cầu này. Em chưa thể xác nhận số liệu; anh chọn công ty và kỳ báo cáo cụ thể nhé.';
// JSON stays parseable. Oversized results are withheld, never cut mid-field.
function evidenceEnvelope(result, maxChars = 8000) {
  if (result?.error || result?._evidence?.status !== 'success') {
    return { status: 'unverified', error: result?.error || 'Chưa có bằng chứng hợp lệ.' };
  }
  const data = Array.isArray(result) ? [...result] : { ...result };
  delete data._evidence;
  const json = JSON.stringify(data);
  const envelope = { status: 'success', evidence: result._evidence, truncated: false, data };
  if (JSON.stringify(envelope).length <= maxChars) return envelope;
  return { status: 'incomplete', evidence: result._evidence, truncated: true,
    original_chars: json.length, sha256: createHash('sha256').update(json).digest('hex'),
    message: 'Kết quả vượt giới hạn. Thu hẹp yêu cầu; chưa cung cấp số liệu từ phần bị lược bỏ.' };
}
function renderEvidence(results) {
  if (!results.length) return NO_EVIDENCE;
  return results.map(e => {
    if (e.status !== 'success') return e.message || 'Không lấy được bằng chứng: ' + e.error;
    const body = typeof e.data?.text === 'string' ? e.data.text : JSON.stringify(e.data, null, 2);
    const scope = e.evidence.scope?.company_wide === true ? 'toàn công ty'
      : 'chỉ các hồ sơ/người dùng trong phạm vi được phép';
    return 'Phạm vi: ' + scope + '.\n' + body
      + '\nNguồn: ' + e.evidence.tool + '; thời điểm: ' + e.evidence.observed_at;
  }).join('\n\n');
}
module.exports = { NO_EVIDENCE, evidenceEnvelope, renderEvidence };
