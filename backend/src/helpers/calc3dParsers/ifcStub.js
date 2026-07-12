/**
 * IFC parser — STUB.
 * IFC là format BIM phức tạp; cài thư viện đầy đủ (web-ifc, ifcjs) tốn ~10MB.
 * Để giảm phụ thuộc, tạm thời trả về thông báo hướng dẫn xuất sang JSON/CSV.
 */
module.exports = {
  key: 'ifc',
  exts: ['.ifc'],
  status: 'stub',
  canParse(file) {
    return String(file.ext || '').toLowerCase() === '.ifc';
  },
  async parse() {
    throw new Error('Định dạng IFC chưa được cài parser. Hãy export sang IFC-JSON hoặc bảng CSV/XLSX.');
  },
};
