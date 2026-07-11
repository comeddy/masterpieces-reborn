// test/mic.test.mjs — 마이크 레벨 정규화(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLevelState, normalizeLevel } from "../js/mic.js";

// dt 60fps로 sec초 동안 일정 rms를 흘린다
const feed = (s, rms, sec) => {
  let out = 0;
  for (let i = 0; i < Math.round(sec * 60); i++) out = normalizeLevel(rms, 1 / 60, s);
  return out;
};

test("무음이면 레벨은 0으로 수렴한다", () => {
  const s = makeLevelState();
  assert.ok(feed(s, 0, 2) < 0.01);
});

test("또렷한 소리는 빠르게(attack) 레벨을 올린다", () => {
  const s = makeLevelState();
  feed(s, 0, 1);                        // 플로어 안정화
  const lv = feed(s, 0.3, 0.3);         // 0.3초 만에
  assert.ok(lv > 0.5, `attack 후 레벨 ${lv}`);
});

test("소리가 멎으면 천천히(release) 내려간다 — 즉시 0이 아니다", () => {
  const s = makeLevelState();
  feed(s, 0, 1);
  feed(s, 0.3, 1);                      // 충분히 올린 뒤
  const justAfter = feed(s, 0, 0.1);    // 0.1초 무음
  assert.ok(justAfter > 0.2, `release 직후 ${justAfter}`);
  assert.ok(feed(s, 0, 3) < 0.05, "3초 무음이면 거의 0");
});

test("지속 소음은 플로어로 흡수된다 — 웅성거림에 계속 충전되지 않는다", () => {
  const s = makeLevelState();
  const lv = feed(s, 0.15, 60);         // 60초 내내 일정한 배경 소음
  assert.ok(lv < 0.3, `플로어 흡수 후 ${lv}`);
});

test("레벨은 항상 0..1로 클램프된다", () => {
  const s = makeLevelState();
  assert.ok(feed(s, 5, 1) <= 1);
  assert.ok(feed(s, -1, 1) >= 0);
});
