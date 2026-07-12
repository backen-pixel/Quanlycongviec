/**
 * SketchUp .skp parser — STUB.
 *
 * .skp là format binary đóng của Trimble; parser chính thức chỉ có trong SDK
 * C++ (SketchUp SDK). Trong môi trường Node.js không có lib mở nguồn nào đọc
 * trực tiếp đáng tin cậy.
 *
 * Workflow khuyến nghị (đều export native từ SketchUp Free + Pro):
 *
 *   ① File → Export → 3D Model → COLLADA (.dae)   ⟶ parser daeParser.js
 *   ② File → Export → 3D Model → Google Earth (.kmz) ⟶ parser kmzParser.js
 *   ③ Extension CutList Pro / OpenCutList → CSV / XLSX ⟶ csvParser / xlsxParser
 *
 * Cả 3 cách đều giữ tên Component / Group → mỗi item có đủ name + W/H/D.
 */
module.exports = {
  key: 'skp',
  exts: ['.skp'],
  status: 'stub',
  canParse(file) {
    return String(file.ext || '').toLowerCase() === '.skp';
  },
  async parse() {
    throw new Error(
      'File .skp (binary của Trimble) chưa hỗ trợ parse trực tiếp. '
      + 'Trong SketchUp: File → Export → 3D Model → chọn .DAE (COLLADA) hoặc .KMZ rồi tải lên đây. '
      + 'Hoặc dùng extension OpenCutList → xuất CSV/XLSX.',
    );
  },
};
