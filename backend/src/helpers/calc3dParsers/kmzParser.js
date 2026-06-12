/**
 * KMZ parser — xuất từ SketchUp:
 *   File → Export → 3D Model → .kmz   (default Google Earth format)
 *
 * KMZ thực chất là zip chứa:
 *   doc.kml + models/<name>.dae + textures/...
 *
 * Strategy: unzip (jszip) → tìm file .dae đầu tiên → delegate sang daeParser.
 */

const JSZip = require('jszip');
const dae = require('./daeParser');

module.exports = {
  key: 'kmz',
  exts: ['.kmz'],
  status: 'ready',
  canParse(file) {
    return String(file.ext || '').toLowerCase() === '.kmz';
  },
  async parse(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    let daeEntry = null;
    zip.forEach((relPath, entry) => {
      if (daeEntry) return;
      if (!entry.dir && relPath.toLowerCase().endsWith('.dae')) daeEntry = entry;
    });
    if (!daeEntry) {
      throw new Error('KMZ không chứa file .dae bên trong (file không phải SketchUp KMZ chuẩn).');
    }
    const daeBuf = await daeEntry.async('nodebuffer');
    const out = await dae._parseDaeBuffer(daeBuf);
    return {
      items: out.items,
      meta: { ...(out.meta || {}), source: 'kmz', dae_entry: daeEntry.name },
    };
  },
};
