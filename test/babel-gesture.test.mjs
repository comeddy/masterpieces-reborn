// test/babel-gesture.test.mjs — 10번 카메라 제스처 상태 기계(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILD_INTERVAL, COLLAPSE_HOLD, COLLAPSE_COOL, N_GRACE, makeGesture, gestureStep }
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
  const r = run(g, 1, 2); // 유예(0.25s) 이후 약 (2-0.25)/0.3 ≈ 5~6회
  assert.ok(r.builds >= 4 && r.builds <= 7, `builds=${r.builds}`);
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
