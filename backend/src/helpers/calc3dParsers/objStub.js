/**
 * OBJ / glTF parser — STUB.
 * Có thể parse OBJ thuần (regex theo `o <name>` + bounding-box từ vertices) để
 * suy ra W/H/D — nhưng sẽ thêm CPU/IO. Tạm để stub, xử lý sau khi có nhu cầu thật.
 */
module.exports = {
  key: 'obj',
  exts: ['.obj', '.gltf', '.glb', '.fbx', '.3ds'],
  status: 'stub',
  canParse(file) {
    return ['.obj', '.gltf', '.glb', '.fbx', '.3ds'].includes(String(file.ext || '').toLowerCase());
  },
  async parse() {
    throw new Error('OBJ/glTF/FBX là dữ liệu hình học, chưa kèm BOM. Hãy export bảng vật tư sang CSV/XLSX.');
  },
};
