/**
 * Strategy registry cho parser file 3D / cutlist.
 *
 * Mỗi parser export {
 *   key: 'csv' | 'xlsx' | 'ifc' | 'dxf' | 'obj' | 'gltf' | 'json' | 'xml',
 *   exts: ['.csv', ...],
 *   canParse(file): boolean,         // file = { name, ext, mime, size, path }
 *   parse(buffer, file): Promise<{
 *     items: Array<{ name, w, h, d, qty, raw, meta? }>,
 *     meta?: object,
 *   }>,
 * }
 *
 * Item.w/h/d luôn ở đơn vị mm (parser tự normalize).
 */

const csvParser = require('./csvParser');
const xlsxParser = require('./xlsxParser');
const jsonParser = require('./jsonParser');
const daeParser = require('./daeParser');
const kmzParser = require('./kmzParser');
const stubIfc = require('./ifcStub');
const stubDxf = require('./dxfStub');
const stubObj = require('./objStub');
const stubSkp = require('./skpStub');

const PARSERS = [
  csvParser, xlsxParser, jsonParser,
  daeParser, kmzParser,
  stubIfc, stubDxf, stubObj, stubSkp,
];

function pickParser(file) {
  for (const p of PARSERS) {
    try { if (p.canParse(file)) return p; } catch { /* ignore */ }
  }
  return null;
}

function listSupportedFormats() {
  return PARSERS.map((p) => ({ key: p.key, exts: p.exts, status: p.status || 'ready' }));
}

/**
 * Parse 1 file 3D — strategy theo extension.
 * @returns {Promise<{format, items, meta, parser_status}>}
 */
async function parse3dFile({ buffer, file }) {
  const parser = pickParser(file);
  if (!parser) {
    throw new Error(`Định dạng "${file.ext}" chưa hỗ trợ. Hãy xuất sang CSV/XLSX/JSON từ phần mềm 3D.`);
  }
  const out = await parser.parse(buffer, file);
  return {
    format: parser.key,
    items: out.items || [],
    meta: out.meta || {},
    parser_status: parser.status || 'ready',
  };
}

module.exports = { parse3dFile, pickParser, listSupportedFormats };
