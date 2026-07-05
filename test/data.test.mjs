// test/data.test.mjs — data.js 구조 무결성
import { test } from "node:test";
import assert from "node:assert/strict";
import { WINGS, WORKS, wingOf } from "../js/data.js";

test("전시관은 3개이고 필수 필드를 가진다", () => {
  assert.equal(WINGS.length, 4);
  for (const w of WINGS) {
    for (const k of ["id", "index", "name", "sub", "accent"]) assert.ok(w[k], `${w.id}.${k}`);
    assert.match(w.accent, /^#[0-9a-f]{6}$/i);
  }
  assert.equal(new Set(WINGS.map(w => w.id)).size, 4);
});

test("작품은 16점이고 번호 01..16이 정확하다", () => {
  assert.equal(WORKS.length, 16);
  const nos = WORKS.map(w => w.no);
  assert.deepEqual(nos, Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, "0")));
});

test("모든 작품이 필수 필드와 유효한 관/모듈 경로를 가진다", () => {
  const wingIds = new Set(WINGS.map(w => w.id));
  for (const w of WORKS) {
    for (const k of ["no", "wing", "title", "ko", "medium", "year", "note", "hint", "module"]) {
      assert.ok(w[k], `${w.no}.${k} 누락`);
    }
    assert.ok(wingIds.has(w.wing), `${w.no}: 관 ${w.wing} 없음`);
    assert.match(w.module, /^\.\/pieces\/\d{2}-[a-z0-9-]+\.js$/, `${w.no}: 모듈 경로 형식`);
    assert.equal(w.module.slice(9, 11), w.no, `${w.no}: 모듈 번호 불일치`);
    if (w.asset) assert.match(w.asset, /^assets\/targets\/\d{2}-[a-z0-9-]+\.jpg$/);
    assert.equal(typeof wingOf(w), "object");
  }
});

test("관별 작품 수는 4점씩이다", () => {
  for (const wing of WINGS) {
    assert.equal(WORKS.filter(w => w.wing === wing.id).length, 4, wing.id);
  }
});
