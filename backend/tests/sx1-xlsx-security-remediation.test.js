'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Worker } = require('node:worker_threads');

const JSZip = require('jszip');
const XLSX = require('xlsx');

const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');
const xlsxParser = require('../src/helpers/calc3dParsers/xlsxParser');
const { parseQuotationExcelBuffer } = require('../src/helpers/quotationExcelParser');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPOSITORY_ROOT = path.resolve(BACKEND_ROOT, '..');
const VENDOR_TARBALL = path.join(REPOSITORY_ROOT, 'vendor', 'xlsx-0.20.3.tgz');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'sx1');
const XLSX_MAIN = require.resolve('xlsx');

const MAX_XLSX_INPUT_BYTES = 10 * 1024 * 1024;
const PARSE_TIMEOUT_MS = 5_000;
const MODULE_LOAD_TIMEOUT_MS = 15_000;
const WORKER_OLD_GENERATION_MB = 64;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha512Integrity(buffer) {
  return `sha512-${crypto.createHash('sha512').update(buffer).digest('base64')}`;
}

function assertInputWithinLimit(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    const error = new TypeError('XLSX input must be a Buffer');
    error.code = 'XLSX_INPUT_TYPE';
    throw error;
  }
  if (buffer.length === 0) {
    const error = new Error('XLSX file is empty');
    error.code = 'XLSX_FILE_EMPTY';
    throw error;
  }
  if (buffer.length > MAX_XLSX_INPUT_BYTES) {
    const error = new Error(`XLSX file exceeds ${MAX_XLSX_INPUT_BYTES} bytes`);
    error.code = 'XLSX_FILE_TOO_LARGE';
    throw error;
  }
}

function readWorkbookWithinLimit(buffer, options = {}) {
  assertInputWithinLimit(buffer);
  return XLSX.read(buffer, { type: 'buffer', ...options });
}

function parseWorkbookInWorker(buffer, options = {}) {
  try {
    assertInputWithinLimit(buffer);
  } catch (error) {
    if (error.code === 'XLSX_FILE_TOO_LARGE' || error.code === 'XLSX_FILE_EMPTY') {
      return Promise.reject(error);
    }
  }

  const timeoutMs = options.timeoutMs || PARSE_TIMEOUT_MS;
  const workerSource = String.raw`
    'use strict';
    const { parentPort, workerData } = require('node:worker_threads');
    const XLSX = require(workerData.xlsxMain);
    const started = process.hrtime.bigint();
    try {
      const workbook = XLSX.read(Buffer.from(workerData.base64, 'base64'), {
        type: 'buffer',
        WTF: true,
        cellFormula: true,
      });
      parentPort.postMessage({
        ok: true,
        sheets: workbook.SheetNames.length,
        elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
        heapUsed: process.memoryUsage().heapUsed,
      });
    } catch (error) {
      parentPort.postMessage({
        ok: false,
        error: String(error && error.message || error),
        elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
        heapUsed: process.memoryUsage().heapUsed,
      });
    }
  `;

  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { base64: buffer.toString('base64'), xlsxMain: XLSX_MAIN },
      resourceLimits: {
        maxOldGenerationSizeMb: WORKER_OLD_GENERATION_MB,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
    });

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      const error = new Error(`XLSX parse exceeded ${timeoutMs} ms`);
      error.code = 'XLSX_PARSE_TIMEOUT';
      worker.terminate().finally(() => finish(reject, error));
    }, timeoutMs);

    worker.once('message', (message) => finish(resolve, message));
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => {
      if (!settled && code !== 0) finish(reject, new Error(`XLSX worker exited with code ${code}`));
    });
  });
}

function makeWorkbook(rows, sheetName = 'Dữ liệu') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), sheetName);
  return workbook;
}

test('SX-1 supply-chain contract binds the official vendored xlsx 0.20.3 tarball', () => {
  const tarball = fs.readFileSync(VENDOR_TARBALL);
  const installedPackagePath = path.join(path.dirname(XLSX_MAIN), 'package.json');
  const installedPackage = JSON.parse(fs.readFileSync(installedPackagePath, 'utf8'));
  const lockEntry = packageLock.packages['node_modules/xlsx'];

  assert.equal(tarball.length, 2_409_319);
  assert.equal(sha256(tarball), '8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8');
  assert.equal(packageJson.dependencies.xlsx, 'file:../vendor/xlsx-0.20.3.tgz');
  assert.equal(packageLock.packages[''].dependencies.xlsx, packageJson.dependencies.xlsx);
  assert.equal(lockEntry.version, '0.20.3');
  assert.equal(lockEntry.resolved, 'file:../vendor/xlsx-0.20.3.tgz');
  assert.equal(lockEntry.integrity, sha512Integrity(tarball));
  assert.equal(installedPackage.name, 'xlsx');
  assert.equal(installedPackage.version, '0.20.3');
  assert.equal(XLSX.version, '0.20.3');
});

test('xlsx 0.20.3 reads XLS, XLSX and ODS fixtures generated by xlsx 0.18.5', () => {
  const expectedHashes = {
    xls: 'a382d31f7ca0d0a3c4e7cdc77811703718b2809a9060d5b9055bb70758edcd4a',
    xlsx: 'd59de0547ad6a05667863b362266287252ef58d6c9353ac3182fd75da19f7770',
    ods: 'ea8e3a86205e45b48b35749bbb2d86ae7606fc1e0a9d7604c11a56eb68fe220c',
  };

  for (const extension of ['xls', 'xlsx', 'ods']) {
    const fixture = fs.readFileSync(path.join(FIXTURE_ROOT, `baseline-0.18.5.${extension}`));
    assert.equal(sha256(fixture), expectedHashes[extension], `${extension} fixture provenance drift`);

    const workbook = readWorkbookWithinLimit(fixture, { cellDates: true, cellFormula: true });
    assert.deepEqual(workbook.SheetNames, ['Dữ liệu']);
    const sheet = workbook.Sheets['Dữ liệu'];
    assert.equal(sheet.A2.v, 'Tủ bếp chữ L – Đặng Ánh');
    assert.equal(sheet.B2.v, 1234567.89);
    assert.ok(sheet.C2.v instanceof Date, `${extension} date must remain a Date`);
    assert.equal(sheet.C2.v.getUTCFullYear(), 2026);
    assert.equal(sheet.C2.v.getUTCMonth(), 8);
    assert.equal(sheet.C2.v.getUTCDate(), 1);
    assert.equal(sheet.D2.v, 2469135.78);
    if (extension !== 'xls') assert.equal(sheet.D2.f, 'B2*2');
  }
});

test('existing business XLSX import and export APIs remain compatible without source changes', async () => {
  const existingReport = fs.readFileSync(path.join(REPOSITORY_ROOT, 'BaoCao_CongViec_T3_2026.xlsx'));
  const existingWorkbook = readWorkbookWithinLimit(existingReport, { cellDates: true });
  assert.ok(existingWorkbook.SheetNames.length > 0);

  const quotationWorkbook = makeWorkbook([
    ['STT', 'HẠNG MỤC', 'ĐVT', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN'],
    [1, 'Tủ bếp chữ L', 'm', 2, 1_000_000, 2_000_000],
  ], 'Báo giá');
  const quotationBuffer = XLSX.write(quotationWorkbook, { type: 'buffer', bookType: 'xlsx' });
  const quotation = await parseQuotationExcelBuffer(quotationBuffer);
  assert.equal(quotation.items.length, 1);
  assert.equal(quotation.items[0].name, 'Tủ bếp chữ L');
  assert.equal(quotation.summary.total, 2_000_000);

  const exportWorkbook = makeWorkbook([
    ['BÁO CÁO HẰNG NGÀY', 'Số', 'Ngày', 'Công thức'],
    ['Nhân viên Đặng Ánh', 1250.5, new Date('2026-09-01T00:00:00.000Z'), null],
  ], 'Tổng quan');
  exportWorkbook.Sheets['Tổng quan'].D2 = { t: 'n', f: 'B2*2', v: 2501 };
  exportWorkbook.Sheets['Tổng quan']['!ref'] = 'A1:D2';
  const exported = XLSX.write(exportWorkbook, { type: 'buffer', bookType: 'xlsx' });
  const reopened = readWorkbookWithinLimit(exported, { cellDates: true, cellFormula: true });
  assert.equal(reopened.Sheets['Tổng quan'].A2.v, 'Nhân viên Đặng Ánh');
  assert.equal(reopened.Sheets['Tổng quan'].B2.v, 1250.5);
  assert.equal(reopened.Sheets['Tổng quan'].D2.f, 'B2*2');

  const dailyReportSource = fs.readFileSync(
    path.join(BACKEND_ROOT, 'src', 'helpers', 'dailyReportAdminNotify.js'),
    'utf8',
  );
  assert.match(dailyReportSource, /XLSX\.write\(wb, \{ type: 'buffer', bookType: 'xlsx' \}\)/);
  const loadCheck = spawnSync(
    process.execPath,
    ['-e', "require('./src/helpers/dailyReportAdminNotify'); process.exit(0)"],
    { cwd: BACKEND_ROOT, timeout: MODULE_LOAD_TIMEOUT_MS, encoding: 'utf8' },
  );
  assert.equal(loadCheck.status, 0, loadCheck.stderr || loadCheck.error?.message);
});

test('calc-3D business parser accepts XLS, XLSX and ODS with Vietnamese dimensions', async () => {
  for (const [extension, bookType] of [['xls', 'biff8'], ['xlsx', 'xlsx'], ['ods', 'ods']]) {
    const workbook = makeWorkbook([
      ['Tên', 'Rộng', 'Cao', 'Sâu', 'SL', 'Đơn vị'],
      ['Tủ bếp chữ L', 600, 800, 350, 2, 'mm'],
    ], 'Cutlist');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType });
    const result = await xlsxParser.parse(buffer);
    assert.equal(result.items.length, 1, `${extension} must produce one cutlist item`);
    assert.deepEqual(
      { name: result.items[0].name, w: result.items[0].w, h: result.items[0].h, d: result.items[0].d, qty: result.items[0].qty },
      { name: 'Tủ bếp chữ L', w: 600, h: 800, d: 350, qty: 2 },
    );
  }
});

test('empty, corrupt and oversized workbook inputs fail within explicit safety bounds', async () => {
  assert.throws(
    () => readWorkbookWithinLimit(Buffer.alloc(0)),
    (error) => error.code === 'XLSX_FILE_EMPTY',
  );
  assert.throws(
    () => readWorkbookWithinLimit(Buffer.alloc(MAX_XLSX_INPUT_BYTES + 1)),
    (error) => error.code === 'XLSX_FILE_TOO_LARGE',
  );

  const blankWorkbook = makeWorkbook([], 'Trống');
  const blankBuffer = XLSX.write(blankWorkbook, { type: 'buffer', bookType: 'xlsx' });
  const blankParsed = readWorkbookWithinLimit(blankBuffer);
  assert.deepEqual(XLSX.utils.sheet_to_json(blankParsed.Sheets['Trống'], { header: 1 }), []);

  const corrupt = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03]);
  const corruptResult = await parseWorkbookInWorker(corrupt);
  assert.equal(corruptResult.ok, false);
  assert.match(corruptResult.error, /Unsupported ZIP file|ZIP/i);
  assert.ok(corruptResult.elapsedMs < PARSE_TIMEOUT_MS);

  const crmBundleSource = fs.readFileSync(
    path.join(BACKEND_ROOT, 'src', 'routes', 'crm', 'shared', 'helpersBundle.js'),
    'utf8',
  );
  const calcRouteSource = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'routes', 'calc.js'), 'utf8');
  assert.match(crmBundleSource, /excelUpload = multer\([\s\S]*fileSize: 10 \* 1024 \* 1024/);
  assert.match(calcRouteSource, /limits: \{ fileSize: 50 \* MB \}/);
});

test('crafted XLSX comment cannot modify Object.prototype structure', async () => {
  const workbook = makeWorkbook([['an toàn']], 'Sheet1');
  workbook.Sheets.Sheet1.A1.c = [{ a: 'SX-1', t: 'prototype pollution probe' }];
  const original = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const archive = await JSZip.loadAsync(original);
  const commentPath = Object.keys(archive.files).find((name) => /xl\/comments\d+\.xml$/.test(name));
  assert.ok(commentPath, 'generated workbook must contain a comments XML part');
  const commentXml = await archive.file(commentPath).async('string');
  assert.match(commentXml, /ref="A1"/);
  archive.file(commentPath, commentXml.replace('ref="A1"', 'ref="__proto__"'));
  const crafted = await archive.generateAsync({ type: 'nodebuffer' });

  const beforeNames = Object.getOwnPropertyNames(Object.prototype).sort();
  assert.equal(Object.hasOwn(Object.prototype, 'c'), false);
  const parsed = readWorkbookWithinLimit(crafted, { WTF: true, cellHTML: false });
  assert.deepEqual(parsed.SheetNames, ['Sheet1']);
  assert.equal(Object.hasOwn(Object.prototype, 'c'), false);
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).sort(), beforeNames);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
});

test('regex-stress XML is CPU-, time- and heap-bounded in an isolated worker', async () => {
  const adversarialXml = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Worksheet ss:Name="Stress"><Table><Row><Cell data="' +
    'x'.repeat(1_000_000) +
    '\n</Workbook>',
    'utf8',
  );
  assert.ok(adversarialXml.length < MAX_XLSX_INPUT_BYTES);

  const wallStarted = Date.now();
  const result = await parseWorkbookInWorker(adversarialXml, { timeoutMs: PARSE_TIMEOUT_MS });
  const wallElapsed = Date.now() - wallStarted;
  assert.ok(wallElapsed < PARSE_TIMEOUT_MS, `worker exceeded wall limit: ${wallElapsed}ms`);
  assert.ok(result.elapsedMs < PARSE_TIMEOUT_MS, `regex parse exceeded CPU-time guard: ${result.elapsedMs}ms`);
  assert.ok(
    result.heapUsed < WORKER_OLD_GENERATION_MB * 1024 * 1024,
    `worker heap exceeded guard: ${result.heapUsed} bytes`,
  );
  assert.equal(typeof result.ok, 'boolean');
});
