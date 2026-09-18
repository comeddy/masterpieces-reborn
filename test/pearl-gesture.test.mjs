// test/pearl-gesture.test.mjs — 03번 손 입력 순수 로직(바람·핀치) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIND_MIN, WIND_FULL, makeHandState, handWind } from "../js/pieces/03-pearl-earring.js";

const DT = 1 / 60;
// 손을 (x0,y0)에서 초당 speed(정규화 거리/초)로 +x 방향 이동시키며 frames 프레임 돌린 마지막 결과
function sweep(s, x0, y0, speed, frames) {
  let out = null;
  for (let i = 0; i < frames; i++) out = handWind(s, x0 + speed * DT * i, y0, DT);
  return out;
}

test("handWind: 손이 없으면 null이고 seen이 풀린다", () => {
  const s = makeHandState();
  handWind(s, 0.5, 0.5, DT);
  assert.equal(s.seen, true);
  assert.equal(handWind(s, null, null, DT), null);
  assert.equal(s.seen, false);
});

test("handWind: NaN 좌표는 손 없음으로 취급한다 (NaN이 스프링에 스며들지 않게)", () => {
  const s = makeHandState();
  handWind(s, 0.5, 0.5, DT);
  assert.equal(handWind(s, NaN, 0.5, DT), null);
  assert.equal(s.seen, false);
});

test("handWind: 첫 등장 프레임은 위치만 기록하고 null", () => {
  const s = makeHandState();
  assert.equal(handWind(s, 0.3, 0.6, DT), null);
  assert.equal(s.x, 0.3); assert.equal(s.y, 0.6); assert.equal(s.seen, true);
});

test("handWind: 미세 지터(0.1/s)는 임계 미만이라 null", () => {
  const s = makeHandState();
  assert.equal(sweep(s, 0.5, 0.5, 0.1, 30), null);
});

test("handWind: 빠른 이동(1.2/s)은 k=1", () => {
  const s = makeHandState();
  const w = sweep(s, 0.2, 0.5, 1.2, 30);
  assert.ok(w, "바람 발생");
  assert.equal(w.k, 1);
  assert.ok(w.x > 0.2 && w.x < 0.8, `스무딩 위치 x=${w.x}`);
  assert.ok(Math.abs(w.y - 0.5) < 1e-9);
});

test("handWind: 중간 속도는 0<k<1이고 WIND_MIN~WIND_FULL 사이에서 단조 증가", () => {
  const mid = (WIND_MIN + WIND_FULL) / 2;
  const a = sweep(makeHandState(), 0.2, 0.5, mid, 30);
  const b = sweep(makeHandState(), 0.2, 0.5, mid + 0.2, 30);
  assert.ok(a && a.k > 0 && a.k < 1, `a.k=${a && a.k}`);
  assert.ok(b && b.k > a.k, `b.k=${b && b.k} > a.k=${a.k}`);
});

test("handWind: 사라진 뒤 먼 위치 재등장은 첫 프레임 null(점프 속도 없음)", () => {
  const s = makeHandState();
  sweep(s, 0.1, 0.1, 0.5, 10);
  handWind(s, null, null, DT);
  assert.equal(handWind(s, 0.9, 0.9, DT), null);
  assert.equal(s.x, 0.9);
});
