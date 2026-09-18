// test/hand-pointer.test.mjs — 손 랜드마크 → 포인터 합성(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { openness, palmCenter, sampleFromLandmarks } from "../js/hand-pointer.js";

// 합성 손: 손목(0)을 (cx, cy+0.05)에, 중지 뿌리(9)를 손목 위 0.1(= palm)에 두고
// 다섯 손끝(4,8,12,16,20)을 손목에서 palm*ratio 거리에 방사형으로 놓는다.
// 나머지 관절은 손바닥 근처에 채운다(openness 계산에 쓰이지 않음).
export function mkHand(cx, cy, ratio, palm = 0.1) {
  const wrist = { x: cx, y: cy + palm / 2 };
  const lm = Array.from({ length: 21 }, () => ({ x: wrist.x, y: wrist.y, z: 0 }));
  lm[0] = wrist;
  lm[9] = { x: cx, y: wrist.y - palm, z: 0 };                   // 중지 뿌리 = palm 기준
  lm[5] = { x: cx - palm * 0.3, y: wrist.y - palm, z: 0 };      // 검지 뿌리
  lm[13] = { x: cx + palm * 0.3, y: wrist.y - palm, z: 0 };     // 약지 뿌리
  lm[17] = { x: cx + palm * 0.55, y: wrist.y - palm * 0.9, z: 0 }; // 소지 뿌리
  const tips = [4, 8, 12, 16, 20];
  tips.forEach((i, k) => {
    const ang = -Math.PI / 2 + (k - 2) * 0.35;                  // 위쪽으로 부채꼴
    lm[i] = { x: wrist.x + Math.cos(ang) * palm * ratio, y: wrist.y + Math.sin(ang) * palm * ratio, z: 0 };
  });
  return lm;
}

test("펼친 손(손끝 거리비 ≈1.85)은 openness 0.9 이상", () => {
  assert.ok(openness(mkHand(0.5, 0.5, 1.85)) >= 0.9);
});

test("주먹(거리비 ≈1.1)은 openness 0", () => {
  assert.equal(openness(mkHand(0.5, 0.5, 1.1)), 0);
});

test("반쯤 오므린 손(거리비 1.5)은 openness ≈0.5", () => {
  const o = openness(mkHand(0.5, 0.5, 1.5));
  assert.ok(Math.abs(o - 0.5) < 0.05, `openness ${o}`);
});

test("openness는 스케일·거울에 불변이다", () => {
  const base = mkHand(0.5, 0.5, 1.6);
  const scaled = base.map((p) => ({ x: p.x * 2, y: p.y * 2 }));
  const mirrored = base.map((p) => ({ x: 1 - p.x, y: p.y }));
  assert.ok(Math.abs(openness(base) - openness(scaled)) < 1e-9);
  assert.ok(Math.abs(openness(base) - openness(mirrored)) < 1e-9);
});

test("손바닥 크기 0·관절 부족·빈 입력은 openness 0", () => {
  const flat = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  assert.equal(openness(flat), 0);
  assert.equal(openness(mkHand(0.5, 0.5, 1.8).slice(0, 10)), 0);
  assert.equal(openness(null), 0);
  assert.equal(openness([]), 0);
});

test("palmCenter는 손목·네 손가락 뿌리의 평균", () => {
  const lm = mkHand(0.3, 0.6, 1.8);
  const c = palmCenter(lm);
  const ex = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
  const ey = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;
  assert.ok(Math.abs(c.x - ex) < 1e-9 && Math.abs(c.y - ey) < 1e-9);
});

test("sampleFromLandmarks: 보정 전 좌표(mirrored=false)는 x를 1−x로 뒤집고, 보정 후는 그대로", () => {
  const lm = mkHand(0.3, 0.6, 1.8);
  const c = palmCenter(lm);
  const raw = sampleFromLandmarks(lm, false);
  const done = sampleFromLandmarks(lm, true);
  assert.ok(Math.abs(raw.x - (1 - c.x)) < 1e-9);
  assert.ok(Math.abs(done.x - c.x) < 1e-9);
  assert.ok(Math.abs(raw.y - c.y) < 1e-9);
  assert.ok(raw.openness >= 0.9);
});

test("sampleFromLandmarks: 손 없음(undefined·빈 배열·21개 미만)은 null", () => {
  assert.equal(sampleFromLandmarks(undefined, true), null);
  assert.equal(sampleFromLandmarks([], true), null);
  assert.equal(sampleFromLandmarks(mkHand(0.5, 0.5, 1.8).slice(0, 20), true), null);
});

import { OPEN_ON, OPEN_OFF, LOST_GRACE, REACH, SMOOTH, makePointerState, applyHand }
  from "../js/hand-pointer.js";

const DT = 1 / 60, W = 1000, H = 500;
const s = (x, y, o) => ({ x, y, openness: o });               // 합성기 입력 샘플
const mkPointer = () => ({ x: -1e4, y: -1e4, px: -1e4, py: -1e4, dx: 0, dy: 0,
  down: false, justDown: false, justUp: false, downTime: 0, inside: false,
  hand: { visible: false, openness: 0, speed: 0 } });
// sec초 동안 같은 샘플을 흘리고 마지막 반환값을 돌려준다
const feed = (p, st, sample, sec) => {
  let r = false;
  for (let i = 0; i < Math.round(sec / DT); i++) r = applyHand(p, sample, st, DT, W, H);
  return r;
};

test("REACH 매핑: 카메라 중앙 70% 구간이 화면 전체가 되고 바깥은 클램프된다", () => {
  const cases = [[REACH, 0], [1 - REACH, W], [0.05, 0], [0.5, W / 2]];
  for (const [x, ex] of cases) {
    const p = mkPointer(), st = makePointerState();
    assert.equal(applyHand(p, s(x, 0.5, 0.8), st, DT, W, H), true);
    assert.ok(Math.abs(p.x - ex) < 1e-6, `x=${x} → ${p.x} (기대 ${ex})`);
  }
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 1 - REACH, 0.8), st, DT, W, H);
  assert.ok(Math.abs(p.y - H) < 1e-6);
});

test("첫 프레임은 점프(dx=dy=0), 이후엔 EMA로 수렴한다", () => {
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 0.5, 0.8), st, DT, W, H);
  assert.equal(p.x, W / 2); assert.equal(p.dx, 0); assert.equal(p.dy, 0);
  applyHand(p, s(1 - REACH, 0.5, 0.8), st, DT, W, H);      // 목표 1000으로 급변
  assert.ok(p.x > W / 2 && p.x < W, `한 프레임 뒤 ${p.x} — 아직 도달 전`);
  assert.ok(p.dx > 0, "오른쪽으로 이동 중");
  feed(p, st, s(1 - REACH, 0.5, 0.8), 1);
  assert.ok(Math.abs(p.x - W) < 1, `1초 뒤 ${p.x}`);
});

test("주먹→펼침 전환은 justDown을 정확히 한 프레임만 올린다", () => {
  const p = mkPointer(), st = makePointerState();
  feed(p, st, s(0.5, 0.5, 0.1), 0.2);                        // 주먹 유지
  assert.equal(p.down, false); assert.equal(p.justDown, false);
  applyHand(p, s(0.5, 0.5, 0.8), st, DT, W, H);              // 펼침
  assert.equal(p.justDown, true); assert.equal(p.down, true);
  applyHand(p, s(0.5, 0.5, 0.8), st, DT, W, H);
  assert.equal(p.justDown, false); assert.equal(p.down, true);
});

test("처음부터 펼친 손은 down이지만 justDown은 없다(전환이 아니므로)", () => {
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 0.5, 0.9), st, DT, W, H);
  assert.equal(p.down, true); assert.equal(p.justDown, false); assert.equal(p.inside, true);
});

test("히스테리시스: 0.3~0.5 사이에서는 직전 down 상태를 유지한다", () => {
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 0.5, 0.8), st, DT, W, H);
  feed(p, st, s(0.5, 0.5, 0.4), 0.2);
  assert.equal(p.down, true, "펼침에서 0.4로 내려와도 유지");
  feed(p, st, s(0.5, 0.5, 0.1), 0.2);
  feed(p, st, s(0.5, 0.5, 0.4), 0.2);
  assert.equal(p.down, false, "주먹에서 0.4로 올라와도 유지");
  assert.equal(p.justDown, false);
});

test("펼침→주먹 전환은 justUp 한 프레임, downTime은 주먹이면 0", () => {
  const p = mkPointer(), st = makePointerState();
  feed(p, st, s(0.5, 0.5, 0.8), 0.5);
  assert.ok(p.downTime > 0.4, `downTime ${p.downTime}`);
  applyHand(p, s(0.5, 0.5, 0.1), st, DT, W, H);
  assert.equal(p.justUp, true); assert.equal(p.down, false); assert.equal(p.downTime, 0);
  applyHand(p, s(0.5, 0.5, 0.1), st, DT, W, H);
  assert.equal(p.justUp, false);
});

test("손 소실: 유예(LOST_GRACE) 미만은 직전 상태 유지, 이상이면 마우스로 반환한다", () => {
  const p = mkPointer(), st = makePointerState();
  feed(p, st, s(0.5, 0.5, 0.8), 0.3);
  assert.equal(feed(p, st, null, LOST_GRACE / 2), true, "0.2초 소실은 점유 유지");
  assert.equal(p.x, W / 2); assert.equal(p.down, true); assert.equal(p.hand.visible, true);
  const before = { x: 123, y: 456, down: false, justDown: true };
  let released = false;
  for (let i = 0; i < Math.round(0.5 / DT); i++) {
    if (!released) { Object.assign(p, before); }                 // 셸의 마우스 스냅샷을 흉내
    const r = applyHand(p, null, st, DT, W, H);
    if (!r) { released = true; break; }
  }
  assert.ok(released, "0.5초 소실이면 false");
  assert.deepEqual({ x: p.x, y: p.y, down: p.down, justDown: p.justDown }, before,
    "false 반환 시 포인터 필드는 그대로");
  assert.equal(p.hand.visible, false); assert.equal(p.hand.openness, 0);
  applyHand(p, s(1 - REACH, 0.5, 0.8), st, DT, W, H);          // 복귀 → 다시 점프
  assert.equal(p.x, W); assert.equal(p.dx, 0); assert.equal(p.justDown, false);
});

test("한 번도 보이지 않은 상태의 null 샘플은 false이고 포인터를 건드리지 않는다", () => {
  const p = mkPointer(), st = makePointerState();
  p.x = 7; p.down = true;
  assert.equal(applyHand(p, null, st, DT, W, H), false);
  assert.equal(p.x, 7); assert.equal(p.down, true); assert.equal(p.hand.visible, false);
});

test("ptr.hand는 visible·openness·speed(px/s)를 갱신한다", () => {
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 0.5, 0.7), st, DT, W, H);
  assert.equal(p.hand.visible, true); assert.equal(p.hand.openness, 0.7); assert.equal(p.hand.speed, 0);
  applyHand(p, s(0.6, 0.5, 0.7), st, DT, W, H);
  assert.ok(p.hand.speed > 0, `speed ${p.hand.speed}`);
  assert.ok(Math.abs(p.hand.speed - Math.hypot(p.dx, p.dy) / DT) < 1e-6);
});

test("상수는 스펙 값과 같다", () => {
  assert.equal(OPEN_ON, 0.5); assert.equal(OPEN_OFF, 0.3); assert.equal(LOST_GRACE, 0.4);
  assert.equal(REACH, 0.15); assert.equal(SMOOTH, 14);
});
