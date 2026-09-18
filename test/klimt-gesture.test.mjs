// test/klimt-gesture.test.mjs — 11번 손 추적 상태 기계(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHandTrack, handTrackStep, PRESENT_AFTER, LOST_AFTER } from "../js/pieces/11-tree-of-life.js";

const F = 1 / 60;
// sec초 동안 매 프레임 fn(i, n)을 호출한다
const feed = (fn, sec, dt = F) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) fn(i, n); };

test("시작 상태와 미검출만 흘린 상태는 present가 아니다", () => {
  const s = makeHandTrack();
  assert.equal(s.present, false);
  feed(() => handTrackStep(s, null, F), 1);
  assert.equal(s.present, false);
});

test("고정점을 1초 흘리면 그 점에 1e-3 안으로 수렴하고 present가 된다", () => {
  const s = makeHandTrack();
  feed(() => handTrackStep(s, { x: 0.2, y: 0.2 }, F), 0.2);
  feed(() => handTrackStep(s, { x: 0.7, y: 0.6 }, F), 1);
  assert.ok(Math.abs(s.x - 0.7) < 1e-3 && Math.abs(s.y - 0.6) < 1e-3, `수렴 (${s.x}, ${s.y})`);
  assert.equal(s.present, true);
});

test("x가 증가하는 점열(0.3→0.7, 0.5초)은 vx>0이고 휘두름 판정(0.6/s) 위다", () => {
  const s = makeHandTrack();
  feed((i, n) => handTrackStep(s, { x: 0.3 + 0.4 * (i + 1) / n, y: 0.5 }, F), 0.5);
  assert.ok(s.vx > 0, `vx ${s.vx}`);
  assert.ok(Math.hypot(s.vx, s.vy) > 0.6, `속도 ${Math.hypot(s.vx, s.vy)}`);
});

test("느린 이동(0.1/s)은 휘두름 판정 아래다 — 머무름으로 취급", () => {
  const s = makeHandTrack();
  feed((i, n) => handTrackStep(s, { x: 0.3 + 0.1 * (i + 1) / n, y: 0.5 }, F), 1);
  assert.ok(Math.hypot(s.vx, s.vy) < 0.6, `속도 ${Math.hypot(s.vx, s.vy)}`);
});

test("히스테리시스: 1프레임(1/30초) 누락은 present 유지, 0.4초 연속 누락은 해제", () => {
  const s = makeHandTrack();
  feed(() => handTrackStep(s, { x: 0.5, y: 0.5 }, F), 0.5);
  handTrackStep(s, null, 1 / 30);
  assert.equal(s.present, true, "1프레임 누락");
  feed(() => handTrackStep(s, null, F), 0.4);
  assert.equal(s.present, false, "0.4초 누락");
  assert.ok(LOST_AFTER < 0.4 && PRESENT_AFTER > F, "상수가 테스트 가정과 맞다");
});

test("단일 프레임 검출(1/60초)만으로는 present가 아니다", () => {
  const s = makeHandTrack();
  handTrackStep(s, { x: 0.5, y: 0.5 }, F);
  assert.equal(s.present, false);
});

test("부재 후 먼 위치 재등장: 첫 프레임에 위치가 즉시 놓이고 속도는 0", () => {
  const s = makeHandTrack();
  feed(() => handTrackStep(s, { x: 0.2, y: 0.2 }, F), 0.5);
  feed(() => handTrackStep(s, null, F), 0.5);
  assert.equal(s.present, false);
  handTrackStep(s, { x: 0.9, y: 0.8 }, F);
  assert.equal(s.x, 0.9); assert.equal(s.y, 0.8);
  assert.equal(s.vx, 0); assert.equal(s.vy, 0);
});
