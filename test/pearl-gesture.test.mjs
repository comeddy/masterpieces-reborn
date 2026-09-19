// test/pearl-gesture.test.mjs — 03번 손 입력 순수 로직(바람·핀치) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIND_MIN, WIND_FULL, makeHandState, handWind,
         PINCH_IN, PINCH_OUT, PINCH_COOL, pinchRatio, makePinchState, pinchStep }
  from "../js/pieces/03-pearl-earring.js";

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

// 21점 손: 손목(0)·중지 MCP(9)로 손 크기, 엄지 끝(4)·검지 끝(8) 거리로 핀치
function handLm(size, tipGap) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5, y: 0.5 + size, z: 0 };
  lm[9] = { x: 0.5, y: 0.5, z: 0 };
  lm[4] = { x: 0.5 - tipGap / 2, y: 0.4, z: 0 };
  lm[8] = { x: 0.5 + tipGap / 2, y: 0.4, z: 0 };
  return lm;
}

const stepN = (s, ratio, n) => { let fires = 0; for (let i = 0; i < n; i++) if (pinchStep(s, ratio, DT).fire) fires++; return fires; };

test("pinchRatio: 손 크기에 무관한 비율", () => {
  assert.ok(Math.abs(pinchRatio(handLm(0.2, 0.04)) - 0.2) < 1e-9);
  assert.ok(Math.abs(pinchRatio(handLm(0.4, 0.08)) - 0.2) < 1e-9);
  assert.equal(pinchRatio(handLm(0, 0.1)), 1, "크기 0이면 열림(1)");
});

test("pinchStep: 진입 시 1회 발화, 유지 중 재발화 없음", () => {
  const s = makePinchState();
  assert.equal(stepN(s, 0.6, 5), 0);
  assert.equal(stepN(s, 0.2, 30), 1);
  assert.equal(s.closed, true);
});

test("pinchStep: 중간대(0.38)는 상태 유지(히스테리시스)", () => {
  const s = makePinchState();
  assert.equal(stepN(s, 0.38, 10), 0, "열린 상태에서 중간대는 진입 아님");
  stepN(s, 0.2, 1);
  stepN(s, 0.38, 10);
  assert.equal(s.closed, true, "닫힌 상태에서 중간대는 해제 아님");
});

test("pinchStep: 해제 후 쿨다운 경과하면 다시 발화", () => {
  const s = makePinchState();
  stepN(s, 0.2, 1);
  stepN(s, 0.6, Math.ceil(PINCH_COOL / DT) + 2);
  assert.equal(s.closed, false);
  assert.equal(stepN(s, 0.2, 1), 1);
});

test("pinchStep: 쿨다운 중 재진입은 발화 없음", () => {
  const s = makePinchState();
  stepN(s, 0.2, 1);
  stepN(s, 0.6, 3);              // 즉시 해제(0.05s)
  assert.equal(stepN(s, 0.2, 1), 0);
  assert.equal(s.closed, true, "발화는 없지만 닫힘 상태는 기록");
});

test("pinchStep: ratio null(손 없음)은 closed 리셋", () => {
  const s = makePinchState();
  stepN(s, 0.2, 1);
  assert.equal(pinchStep(s, null, DT).fire, false);
  assert.equal(s.closed, false);
});

test("handWind: 카메라가 꺼진 동안 null을 흘리면 재활성 첫 프레임은 점프 속도 없이 null", () => {
  const s = makeHandState();
  sweep(s, 0.1, 0.5, 0.5, 10);           // 손 추적 중
  handWind(s, null, null, DT);           // 카메라 꺼짐 프레임(tick의 else 분기와 동일)
  assert.equal(s.seen, false);
  assert.equal(handWind(s, 0.9, 0.5, DT), null, "재등장 첫 프레임은 위치만 기록");
  assert.equal(s.x, 0.9);
  assert.ok(sweep(s, 0.9, 0.5, 0.05, 5) === null, "그 뒤 미세 이동은 바람 없음");
});

test("pinchStep: 카메라가 꺼진 동안 null을 흘리면 closed가 풀리고 쿨다운은 계속 감소", () => {
  const s = makePinchState();
  pinchStep(s, 0.2, DT);                 // 발화 → closed=true, cool=PINCH_COOL
  assert.equal(s.closed, true);
  for (let i = 0; i < 3; i++) pinchStep(s, null, DT);
  assert.equal(s.closed, false);
  assert.ok(s.cool < PINCH_COOL && s.cool > 0, `cool=${s.cool}`);
});
