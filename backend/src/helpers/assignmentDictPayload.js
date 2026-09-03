/**
 * Đóng gói danh sách nhiệm vụ theo kiểu "TỪ ĐIỂN": các object nhúng lặp lại (user, công ty,
 * lead) được rút ra một bảng tra dùng chung, mỗi dòng chỉ còn giữ id.
 *
 * Vì sao: đo trên 1.000 dòng thật, payload 1.311KB thì `created_by` chiếm 194KB (14,8%),
 * `lead` 138KB (10,5%), `assignee` 124KB (9,5%), `company` 109KB (8,3%) — tổng 43% chỉ là
 * cùng vài chục cái tên nhân viên và công ty được lặp lại hàng nghìn lần. Rút ra từ điển
 * giảm 37% JSON thô.
 *
 * Lưu ý cái này KHÔNG nhằm tiết kiệm băng thông: gzip đã nén 11,5× nên phần lặp gần như
 * miễn phí trên đường truyền. Cái tiết kiệm được là CPU `JSON.stringify` phía server và
 * `JSON.parse` phía trình duyệt — ở 8.000 dòng là 10,2MB chuỗi phải dựng rồi phân tích lại,
 * và nó chạy trên main thread của trình duyệt nên trực tiếp gây giật.
 *
 * Bật bằng `?dict=1`. KHÔNG đổi mặc định: các app mobile (crm-mobile-v2, sx-mobile,
 * vc-mobile) đang đọc thẳng `assignment.assignee.full_name`, đổi mặc định là làm hỏng chúng.
 *
 * Định dạng phải khớp với `frontend/src/lib/assignmentDictPayload.js` (hàm giải nén).
 */

/** Các khoá object nhúng bị rút ra + bảng từ điển tương ứng. */
const EMBED_TO_DICT = [
  ['assignee', 'users'],
  ['created_by', 'users'],
  ['company', 'companies'],
  ['executor_company', 'companies'],
  ['lead', 'leads'],
];

/**
 * @param {Array<object>} rows danh sách đã qua attachAssignees + attachCrmTaskMeta
 * @returns {{ assignments: Array<object>, dict: { users: object, companies: object, leads: object } }}
 */
function packAssignmentsWithDict(rows) {
  const dict = { users: {}, companies: {}, leads: {} };

  const put = (bucket, obj) => {
    if (!obj || !obj.id) return null;
    const key = String(obj.id);
    // Ghi một lần: các bản sao sau đều là cùng một hàng DB nên nội dung y hệt — TRỪ
    // `assign_role`, thứ do bảng junction gắn thêm nên KHÁC NHAU giữa các dòng cho cùng
    // một người. Nếu để nó lọt vào từ điển thì lần ghi đầu tiên (thường từ `assignees`)
    // sẽ dính vai trò của đúng dòng đó, rồi mọi chỗ khác tra ra cùng người — kể cả
    // `assignee` và `created_by` — đều nhận vai trò lạc đó. Vai trò chỉ sống trong
    // `assignee_refs`, không bao giờ trong từ điển.
    if (!dict[bucket][key]) {
      if (bucket === 'users' && obj.assign_role !== undefined) {
        const clean = { ...obj };
        delete clean.assign_role;
        dict[bucket][key] = clean;
      } else {
        dict[bucket][key] = obj;
      }
    }
    return key;
  };

  const assignments = rows.map((row) => {
    const out = { ...row };

    EMBED_TO_DICT.forEach(([embedKey, bucket]) => {
      put(bucket, out[embedKey]);
      delete out[embedKey];
    });

    // `assignees` là user KÈM vai trò (assign_role) nên không rút gọn về id trần được —
    // gói thành cặp [id, vai trò]. Vai trò `null` = dòng rơi về `assignee` đơn lẻ (không có
    // bản ghi trong bảng junction), phía client phải dựng lại y như vậy, KHÔNG gán vai trò
    // mặc định — nếu gán thì giao diện sẽ hiện huy hiệu vai trò cho dòng vốn không có.
    const list = Array.isArray(out.assignees) ? out.assignees : [];
    out.assignee_refs = list
      .map((u) => {
        const key = put('users', u);
        return key ? [key, u.assign_role || null] : null;
      })
      .filter(Boolean);
    delete out.assignees;

    return out;
  });

  return { assignments, dict };
}

/** `?dict=1` / `dict=true` — mặc định TẮT để không làm hỏng client cũ. */
function wantsDictPayload(query) {
  const v = String(query?.dict ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

module.exports = { packAssignmentsWithDict, wantsDictPayload };
