// test/cam.test.mjs — cam.js 순수 헬퍼(거울 보정·손바닥 대표점) 검증. 브라우저 API 미참조.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mirrorLandmarks, palmPoint } from "../js/cam.js";

const pt = (x, y) => ({ x, y, z: 0 });
const hand = (fn) => Array.from({ length: 21 }, (_, i) => fn(i));

test("mirrorLandmarks: 모든 점의 x가 1-x로 반전되고 y·z는 유지된다", () => {
  const raw = [hand((i) => pt(0.1 + i * 0.01, 0.5 + i * 0.01))];
  const m = mirrorLandmarks(raw);
  assert.equal(m.length, 1);
  assert.equal(m[0].length, 21);
  for (let i = 0; i < 21; i++) {
    assert.ok(Math.abs(m[0][i].x - (1 - raw[0][i].x)) < 1e-12, `x[${i}]`);
    assert.equal(m[0][i].y, raw[0][i].y, `y[${i}]`);
    assert.equal(m[0][i].z, 0);
  }
  assert.notEqual(m[0], raw[0], "원본 배열을 변경하지 않고 새 배열을 만든다");
  assert.ok(Math.abs(raw[0][3].x - 0.13) < 1e-12, "원본 값 불변");
});

test("mirrorLandmarks: 빈 입력은 빈 배열", () => {
  assert.deepEqual(mirrorLandmarks([]), []);
});

test("palmPoint: 랜드마크 5·9의 중점", () => {
  const lm = hand((i) => (i === 5 ? pt(0.2, 0.6) : i === 9 ? pt(0.4, 0.8) : pt(0, 0)));
  const p = palmPoint(lm);
  assert.ok(Math.abs(p.x - 0.3) < 1e-12 && Math.abs(p.y - 0.7) < 1e-12, JSON.stringify(p));
});
