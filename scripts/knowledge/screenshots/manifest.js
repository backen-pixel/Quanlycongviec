/**
 * Ảnh minh họa bài học — quy ước tên: {course}-{NN}.png
 * course: lead | deal | guide | collab
 * NN: 01–13 (bài 1–12 + bài thi tổng kết 13)
 * Lưu tại: uploads/knowledge-screenshots/
 */

const UPLOAD_PREFIX = '/uploads/knowledge-screenshots';
const UPLOAD_DIR = 'backend/uploads/knowledge-screenshots';
/** Nguồn chụp ảnh (dev) — sync sang UPLOAD_DIR khi deploy */
const CAPTURE_SRC_DIR = 'uploads/knowledge-screenshots';

const COURSES = ['lead', 'deal', 'guide', 'collab'];
const LESSONS_PER_COURSE = 13; // 12 bài + thi tổng kết

/** Tên file ảnh chuẩn */
function lessonImageFile(course, lessonNum) {
  return `${course}-${String(lessonNum).padStart(2, '0')}.png`;
}

function publicUrl(file) {
  return `${UPLOAD_PREFIX}/${file}`;
}

/** URL chụp màn (Puppeteer / MCP) — gợi ý theo bài */
const CAPTURE_HINTS = {
  guide: {
    1: { path: '/login', waitFor: ['Đăng nhập'], fullPage: true },
    2: { path: '/login', waitFor: ['Đăng nhập'], fullPage: true },
    3: { path: '/login', waitFor: ['Cài đặt'], fullPage: false },
    4: { path: '/crm/dashboard', waitFor: ['Lead'], fullPage: true },
    5: { path: '/crm/dashboard', waitFor: ['Lead'], fullPage: true },
    6: { path: '/crm/leads/__SAMPLE_LEAD_ID__', waitFor: ['Tổng quan'], fullPage: true },
    7: { path: '/crm/leads/__SAMPLE_LEAD_ID__?tab=tasks', waitFor: ['Nhiệm vụ'], fullPage: true },
    8: { path: '/crm/dashboard', waitFor: ['Deal'], fullPage: true, tabSwitch: 'deal' },
    9: { path: '/crm/leads/__SAMPLE_DEAL_ID__', waitFor: ['Tài liệu'], fullPage: true },
    10: { path: '/crm/dashboard', waitFor: ['Lead'], fullPage: true },
    11: { path: '/crm/dashboard', waitFor: ['Lead'], fullPage: true },
    12: { path: '/knowledge', waitFor: ['Kiến thức'], fullPage: true },
    13: { path: '/knowledge', waitFor: ['Kiến thức'], fullPage: true },
  },
  lead: {
    1: { path: '/crm/dashboard', waitFor: ['Lead'], fullPage: true },
    2: { path: '/crm/dashboard', waitFor: ['Lead'], fullPage: true },
    3: { path: '/crm/dashboard', waitFor: ['Lead'], fullPage: true },
    4: { path: '/crm/leads/__SAMPLE_LEAD_ID__', waitFor: ['Tổng quan'], fullPage: true },
    5: { path: '/crm/leads/__SAMPLE_LEAD_ID__?tab=tasks', waitFor: ['Nhiệm vụ'], fullPage: true },
    6: { path: '/crm/leads/__SAMPLE_LEAD_ID__?tab=tasks', waitFor: ['Nhiệm vụ'], fullPage: true },
    7: { path: '/crm/leads/__SAMPLE_LEAD_ID__', waitFor: ['Hoạt động'], fullPage: true },
    8: { path: '/crm/kpi/scorecard', waitFor: ['KPI', 'điểm'], fullPage: true },
    9: { path: '/crm/leads/__SAMPLE_LEAD_ID__', waitFor: ['Hoạt động'], fullPage: true },
    10: { path: '/crm/leads/__SAMPLE_LEAD_ID__', waitFor: ['Chuyển Deal'], fullPage: true },
    11: { path: '/crm/leads/__SAMPLE_LEAD_ID__', waitFor: ['Tổng quan'], fullPage: true },
    12: { path: '/crm/dashboard', waitFor: ['Lead'], fullPage: true },
    13: { path: '/knowledge', waitFor: ['Lead', 'Kiến thức'], fullPage: true },
  },
  deal: {
    1: { path: '/crm/dashboard', waitFor: ['Deal'], fullPage: true, tabSwitch: 'deal' },
    2: { path: '/crm/dashboard', waitFor: ['Deal'], fullPage: true, tabSwitch: 'deal' },
    3: { path: '/crm/leads/__SAMPLE_DEAL_ID__', waitFor: ['Báo giá', 'Tổng quan'], fullPage: true },
    4: { path: '/crm/leads/__SAMPLE_DEAL_ID__', waitFor: ['Tổng quan'], fullPage: true },
    5: { path: '/crm/leads/__SAMPLE_DEAL_ID__', waitFor: ['Tài liệu'], fullPage: true },
    6: { path: '/crm/leads/__SAMPLE_DEAL_ID__', waitFor: ['Thắng', 'Tổng quan'], fullPage: true },
    7: { path: '/crm/dashboard', waitFor: ['Deal'], fullPage: true, tabSwitch: 'deal' },
    8: { path: '/crm/leads/__SAMPLE_DEAL_ID__?tab=tasks', waitFor: ['Nhiệm vụ'], fullPage: true },
    9: { path: '/crm/leads/__SAMPLE_DEAL_ID__', waitFor: ['Tài liệu'], fullPage: true },
    10: { path: '/crm/kpi/deal', waitFor: ['Deal', 'KPI'], fullPage: true },
    11: { path: '/crm/leads/__SAMPLE_DEAL_ID__', waitFor: ['Tài liệu'], fullPage: true },
    12: { path: '/crm/dashboard', waitFor: ['Deal'], fullPage: true, tabSwitch: 'deal' },
    13: { path: '/knowledge', waitFor: ['Deal', 'Kiến thức'], fullPage: true },
  },
  collab: {
    1: { path: '/crm/dashboard', waitFor: ['Sự kiện', 'Lead'], fullPage: true },
    2: { path: '/crm/dashboard', waitFor: ['Bảng tin', 'Nhóm chat'], fullPage: true },
    3: { path: '/crm/events', waitFor: ['Sự kiện', 'Lịch'], fullPage: true },
    4: { path: '/crm/events', waitFor: ['Sự kiện', 'Tạo'], fullPage: true },
    5: { path: '/tools/voice-recordings', waitFor: ['Cuộc gọi', 'ghi'], fullPage: true },
    6: { path: '/tools/voice-recordings', waitFor: ['Cuộc gọi', 'Lead'], fullPage: true },
    7: { path: '/crm/messenger', waitFor: ['Nhóm chat', 'Tin nhắn'], fullPage: true },
    8: { path: '/crm/messenger', waitFor: ['Nhóm chat'], fullPage: true },
    9: { path: '/crm/dashboard', waitFor: ['Lead'], fullPage: false, prepare: 'messengerLauncher' },
    10: { path: '/social', waitFor: ['Bảng tin'], fullPage: true },
    11: { path: '/social', waitFor: ['Bảng tin'], fullPage: true },
    12: { path: '/vc/dashboard', waitFor: ['Vận chuyển', 'Bảng tin'], fullPage: true },
    13: { path: '/knowledge', waitFor: ['Kiến thức', 'Sự kiện'], fullPage: true },
  },
};

/** Danh sách shot cho capture-screenshots.js */
function allCaptureShots() {
  const shots = [];
  for (const course of COURSES) {
    for (let lesson = 1; lesson <= LESSONS_PER_COURSE; lesson += 1) {
      const hint = CAPTURE_HINTS[course]?.[lesson] || { path: '/crm/dashboard', fullPage: true };
      shots.push({
        course,
        lesson,
        file: lessonImageFile(course, lesson),
        caption: `Minh họa ${course} bài ${lesson}`,
        ...hint,
      });
    }
  }
  return shots;
}

module.exports = {
  COURSES,
  LESSONS_PER_COURSE,
  UPLOAD_PREFIX,
  UPLOAD_DIR,
  CAPTURE_SRC_DIR,
  lessonImageFile,
  publicUrl,
  CAPTURE_HINTS,
  allCaptureShots,
};
