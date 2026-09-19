// test/babel-gesture.test.mjs — 10번 카메라 제스처 상태 기계(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILD_INTERVAL, COLLAPSE_HOLD, COLLAPSE_COOL, N_GRACE, makeGesture, gestureStep,
  IDLE_MIN, IDLE_MAX, makeIdle, idleStep }
  from "../js/pieces/10-tower-of-babel.js";

// n을 유지한 채 sec초 동안 60fps로 돌리고 발화 횟수를 센다
const run = (g, n, sec, dt = 1 / 60) => {
  let builds = 0, collapses = 0;
  for (let t = 0; t < sec - 1e-9; t += dt) {
    const o = gestureStep(g, n, dt);
    if (o.build) builds++;
    if (o.collapse) collapses++;
  }
  return { builds, collapses };
};

test("한 손 유지: BUILD_INTERVAL마다 쌓기 발화", () => {
  const g = makeGesture();
  const r = run(g, 1, 2); // 유예 이후 약 (2 - N_GRACE)/BUILD_INTERVAL 회
  const expected = Math.floor((2 - N_GRACE) / BUILD_INTERVAL);
  assert.ok(Math.abs(r.builds - expected) <= 1, `builds=${r.builds}, expected≈${expected}`);
  assert.equal(r.collapses, 0);
});

test("두 손 유지: COLLAPSE_HOLD 후 붕괴 1회 발화", () => {
  const g = makeGesture();
  const r = run(g, 2, N_GRACE + COLLAPSE_HOLD + 0.2);
  assert.equal(r.collapses, 1);
  assert.equal(r.builds, 0);
});

test("붕괴 직후 쿨다운: COLLAPSE_COOL 동안 재발화 금지, 소진 후 재발화", () => {
  const g = makeGesture();
  run(g, 2, N_GRACE + COLLAPSE_HOLD + 0.05);          // 1회 발화시킴
  const r2 = run(g, 2, 2);                             // 쿨다운(3s) 내 — 금지
  assert.equal(r2.collapses, 0);
  const r3 = run(g, 2, 2.5);                           // 잔여 쿨다운 1s 소진 + 유지 0.8s → 재발화
  assert.equal(r3.collapses, 1);
});

test("짧은 깜빡임(유예 미만)은 손 개수 전환을 일으키지 않는다", () => {
  const g = makeGesture();
  run(g, 1, 1);                                        // 한 손 정착
  run(g, 2, 0.1);                                      // 0.1s 깜빡 — N_GRACE 미만
  assert.equal(g.n, 1);                                // 여전히 한 손 모드
  const r = run(g, 1, 0.35);
  assert.ok(r.builds >= 1, "쌓기 지속");
});

test("손 없음(n=0)은 아무것도 발화하지 않는다", () => {
  const g = makeGesture();
  const r = run(g, 0, 3);
  assert.equal(r.builds + r.collapses, 0);
});

test("유휴 리셋: 입력으로 무장 후 한계 도달 시 1회 발동, 재입력 전 재발동 없음", () => {
  const s = makeIdle();
  const pick = () => 4;
  let fired = 0;
  for (let t = 0; t < 6; t += 1 / 60) if (idleStep(s, false, 1 / 60, pick)) fired++;
  assert.equal(fired, 0);                       // 무장 전 유휴는 발동하지 않음
  assert.equal(idleStep(s, true, 1 / 60, pick), false); // 입력 → 무장
  for (let t = 0; t < 10; t += 1 / 60) if (idleStep(s, false, 1 / 60, pick)) fired++;
  assert.equal(fired, 1);                       // 4초 뒤 정확히 1회, 이후 침묵
  idleStep(s, true, 1 / 60, pick);              // 재입력 → 재무장
  for (let t = 0; t < 5; t += 1 / 60) if (idleStep(s, false, 1 / 60, pick)) fired++;
  assert.equal(fired, 2);                       // 재발동 가능
});

test("유휴 리셋: 입력이 이어지는 동안 타이머가 리셋되어 발동하지 않는다", () => {
  const s = makeIdle();
  let fired = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    const engaged = Math.floor(t) % 2 === 0;    // 2초 주기 on/off — 유휴가 3초를 못 채움
    if (idleStep(s, engaged, 1 / 60, () => 3)) fired++;
  }
  assert.equal(fired, 0);
});
