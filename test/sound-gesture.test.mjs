// test/sound-gesture.test.mjs — 공용 소리 제스처 헬퍼(순수 로직) 검증
//   energy = 지속음 세기(숨·목소리), onset = 순간 스파이크(박수·외침) 1프레임 펄스, strength = 스파이크 크기
import { test } from "node:test";
import assert from "node:assert/strict";
import { GATE, makeSoundState, soundStep } from "../js/sound-gesture.js";

const DT = 1 / 60;

// dt 60fps로 sec초 동안 일정 level을 흘린다 — 마지막 energy와 구간 내 onset 횟수·최대 strength
const feed = (s, level, sec) => {
  let energy = 0, onsets = 0, strength = 0;
  for (let i = 0; i < Math.round(sec * 60); i++) {
    const o = soundStep(level, DT, s);
    energy = o.energy;
    if (o.onset) { onsets++; strength = Math.max(strength, o.strength); }
  }
  return { energy, onsets, strength };
};

test("무음이면 energy 0, onset 없음", () => {
  const s = makeSoundState();
  const r = feed(s, 0, 2);
  assert.equal(r.energy, 0);
  assert.equal(r.onsets, 0);
});

test("0.5 지속음은 0.5초 안에 energy ≥ 0.35, 멎으면 2초 안에 < 0.05", () => {
  const s = makeSoundState();
  const up = feed(s, 0.5, 0.5);
  assert.ok(up.energy >= 0.35, `0.5s 지속 후 energy ${up.energy}`);
  const down = feed(s, 0, 2);
  assert.ok(down.energy < 0.05, `2s 무음 후 energy ${down.energy}`);
});

test("0→0.6 급등은 onset 1회(strength > 0)만 발화한다", () => {
  const s = makeSoundState();
  const first = soundStep(0.6, DT, s);        // 급등 프레임
  assert.equal(first.onset, true);
  assert.ok(first.strength > 0, `strength ${first.strength}`);
  const held = feed(s, 0.6, 1);               // 같은 크기로 유지 — 재발화 없음
  assert.equal(held.onsets, 0);
});

test("쿨다운 안의 재급등은 무시된다", () => {
  const s = makeSoundState();
  assert.equal(soundStep(0.6, DT, s).onset, true);
  feed(s, 0, 0.15);                           // 0.15초 뒤(쿨다운 0.5초 이내)
  const again = soundStep(0.9, DT, s);        // 더 큰 급등이어도
  assert.equal(again.onset, false);
  assert.equal(again.strength, 0);
});

test("쿨다운이 지나면 새 급등에 다시 발화한다", () => {
  const s = makeSoundState();
  assert.equal(soundStep(0.6, DT, s).onset, true);
  feed(s, 0, 0.6);                            // 쿨다운(0.5초) 경과 + 추세 복귀
  const again = soundStep(0.6, DT, s);
  assert.equal(again.onset, true);
  assert.ok(again.strength > 0);
});

test("프레임당 +0.02 완만 상승은 onset 없이 energy만 오른다", () => {
  const s = makeSoundState();
  let energy = 0;
  for (let i = 1; i <= 25; i++) {             // 0.02 → 0.50 (숨을 서서히 불어 넣듯)
    const o = soundStep(0.02 * i, DT, s);
    assert.equal(o.onset, false, `${i}프레임(level ${(0.02 * i).toFixed(2)})에서 onset 발화`);
    energy = o.energy;
  }
  assert.equal(feed(s, 0.5, 1).onsets, 0);    // 그대로 유지해도 발화 없음
  assert.ok(energy > 0, `완만 상승 후 energy ${energy}`);
});

test("GATE 이하 지속음은 energy 0 — 배경 소음에 반응하지 않는다", () => {
  const s = makeSoundState();
  assert.equal(feed(s, GATE, 2).energy, 0);
  assert.equal(feed(s, GATE * 0.6, 2).energy, 0);
});

test("반환 필드가 존재하고 energy·strength는 0..1로 클램프된다", () => {
  const s = makeSoundState();
  const o = soundStep(5, DT, s);              // 범위 밖 입력
  assert.deepEqual(Object.keys(o).sort(), ["energy", "onset", "strength"]);
  assert.equal(typeof o.energy, "number");
  assert.equal(typeof o.onset, "boolean");
  assert.equal(typeof o.strength, "number");
  assert.ok(o.strength <= 1 && o.strength >= 0, `strength ${o.strength}`);
  assert.ok(feed(s, 5, 1).energy <= 1);
  const neg = feed(makeSoundState(), -1, 1);
  assert.ok(neg.energy >= 0 && neg.strength >= 0);
});
