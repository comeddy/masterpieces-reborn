// test/adam.test.mjs — 09번 소리→충전 세기 매핑(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { SOUND_GATE, SOUND_FULL, soundStrength } from "../js/pieces/09-creation-of-adam.js";

test("게이트 이하(속삭임)는 충전되지 않는다", () => {
  assert.equal(soundStrength(0), 0);
  assert.equal(soundStrength(SOUND_GATE), 0);
  assert.equal(soundStrength(SOUND_GATE - 0.05), 0);
});

test("FULL 이상(또렷한 소리)은 최대 속도로 충전한다", () => {
  assert.equal(soundStrength(SOUND_FULL), 1);
  assert.equal(soundStrength(1), 1);
});

test("게이트와 FULL 사이는 선형이다", () => {
  const mid = (SOUND_GATE + SOUND_FULL) / 2;
  assert.ok(Math.abs(soundStrength(mid) - 0.5) < 1e-9);
});
