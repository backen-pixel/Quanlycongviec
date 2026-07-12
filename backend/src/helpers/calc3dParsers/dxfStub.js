/**
 * DXF/DWG parser — STUB.
 * DXF text-based có thể parse với regex (lấy block name + AcDbEntity dimensions),
 * nhưng cutlist công nghiệp thường chỉ chứa 2D contour, không kèm W/H/D theo phần.
 * Khuyến nghị xuất bảng vật tư (BOM) sang CSV/XLSX trước khi import.
 */
module.exports = {
  key: 'dxf',
  exts: ['.dxf', '.dwg'],
  status: 'stub',
  canParse(file) {
    return ['.dxf', '.dwg'].includes(String(file.ext || '').toLowerCase());
  },
  async parse() {
    throw new Error('Định dạng DXF/DWG chưa được cài parser. Hãy xuất bảng vật tư từ AutoCAD sang CSV/XLSX.');
  },
};
