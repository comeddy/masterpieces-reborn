// test/picasso-gesture.test.mjs — 12번 손짓(좌우 흔들기) 판정 상태 기계 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { WAVE_WINDOW, WAVE_SWINGS, WAVE_MIN_VX, WAVE_COOL, HAND_GRACE, makeWave, waveStep }
  from "../js/pieces/12-cubist-faces.js";

// 60fps로 sec초 동안 x(t)를 흘리고 발화 횟수를 센다. present(t)로 손 검출 연출.
const run = (w, xOf, sec, present = () => true, dt = 1 / 60) => {
  let fires = 0;
  for (let t = 0; t < sec - 1e-9; t += dt) {
    if (waveStep(w, xOf(t), present(t), dt).fire) fires++;
  }
  return fires;
};
// 2Hz·진폭 0.25 사인 흔들기 — 피크 |vx| ≈ 3.1 (WAVE_MIN_VX의 12배)
const wave2hz = (t) => 0.5 + 0.25 * Math.sin(2 * Math.PI * 2 * t);

test("좌우 왕복 흔들기: 반전 2회에 1회 발화, 쿨다운 내 재발화 금지", () => {
  const w = makeWave();
  assert.equal(run(w, wave2hz, 1.5), 1); // 첫 발화 ~0.4s, 쿨다운 1.6s가 잔여 1.1s를 덮음
});

test("쿨다운 소진 후 계속 흔들면 다시 발화한다", () => {
  const w = makeWave();
  assert.equal(run(w, wave2hz, 3.0), 2); // ~0.4s 발화 → 쿨다운 → ~2.0s 이후 재발화
});

test("단방향 스침(반전 없음)은 발화하지 않는다", () => {
  const w = makeWave();
  assert.equal(run(w, (t) => 0.2 + 1.2 * t, 0.5), 0); // vx=+1.2 일정 — 방향 반전 0회
});

test("느린 손(|vx| < WAVE_MIN_VX)은 발화하지 않는다", () => {
  const w = makeWave();
  assert.equal(run(w, (t) => 0.5 + 0.02 * Math.sin(2 * Math.PI * t), 3), 0); // 피크 |vx| ≈ 0.13
});

test("시간창 초과: 낡은 스윙은 무효 — 1.3s 간격의 반전 2회는 발화하지 않는다", () => {
  const w = makeWave();
  assert.equal(run(w, (t) => 0.4 + 0.4 * t, 0.15), 0);  // 오른쪽 이동 — dir 설정
  assert.equal(run(w, (t) => 0.46 - 0.4 * t, 0.15), 0); // 반전 1회 (swings=1)
  assert.equal(run(w, () => 0.4, WAVE_WINDOW + 0.1), 0); // 정지 — 창 초과, 리셋
  assert.equal(run(w, (t) => 0.4 + 0.4 * t, 0.15), 0);  // 다시 오른쪽 — dir 재설정뿐(반전 2회째 아님)
});

test("손 미검출 유예: 짧은 깜빡임은 스윙 상태를 보존, 초과하면 리셋한다", () => {
  const a = makeWave();
  run(a, (t) => 0.4 + 0.4 * t, 0.15);                   // dir 설정
  run(a, (t) => 0.46 - 0.4 * t, 0.15);                  // swings=1
  run(a, () => 0.4, 0.1, () => false);                  // 0.1s 깜빡 — HAND_GRACE 미만
  assert.equal(a.swings, 1, "유예 내: 스윙 보존");
  assert.equal(run(a, (t) => 0.4 + 0.4 * t, 0.15), 1);  // 반전 2회째 → 발화

  const b = makeWave();
  run(b, (t) => 0.4 + 0.4 * t, 0.15);
  run(b, (t) => 0.46 - 0.4 * t, 0.15);                  // swings=1
  run(b, () => 0.4, HAND_GRACE + 0.2, () => false);     // 유예 초과 — 리셋
  assert.equal(b.swings, 0, "유예 초과: 스윙 리셋");
  assert.equal(run(b, (t) => 0.4 + 0.4 * t, 0.15), 0);  // dir 재설정뿐 — 미발화
});
