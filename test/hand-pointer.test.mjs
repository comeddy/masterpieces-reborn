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
