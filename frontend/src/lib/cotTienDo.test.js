import test from 'node:test';
import assert from 'node:assert/strict';
import { cotDaTich, trangThaiCotHien } from './cotTienDo.js';

test('moving past a workshop stage does not fabricate completion', () => {
  assert.equal(cotDaTich({ past: true, allTasksDone: false }), false);
  assert.equal(trangThaiCotHien({ past: true }), 'chua');
  assert.equal(trangThaiCotHien({ past: true, here: true }), 'dang');
});

test('only server confirmation counts; a filtered checklist cannot mark completion', () => {
  assert.equal(cotDaTich({ raw: 'xong' }), true);
  assert.equal(cotDaTich({ allTasksDone: true }), false);
  assert.equal(cotDaTich({ raw: 'dang', allTasksDone: true }), false);
  assert.equal(trangThaiCotHien({ raw: 'xong', here: true }), 'xong');
  assert.equal(trangThaiCotHien({ raw: 'dang', past: true }), 'dang');
  assert.equal(cotDaTich({ raw: 'chua', past: true }), false);
  assert.equal(cotDaTich(), false);
});
