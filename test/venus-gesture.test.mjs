// test/venus-gesture.test.mjs — 02번 손(서풍) 보정 순수 함수 검증
// 셸이 손을 포인터로 합성하므로 작품은 ptr.hand만 읽는다 — 마우스 값은 바뀌지 않고,
// 손이면 바람이 넓고 조금 세며, 펼친 손 아래 숨결이 생기고, 빠른 손길에 꽃잎이 방출된다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HAND, windParams, gustParams, breathParams, petalEmit }
  from "../js/pieces/02-birth-of-venus.js";

const mouse = (over = {}) => ({ x: 400, y: 300, dx: 6, dy: 0, down: true, justDown: false, inside: true,
  hand: { visible: false, openness: 0, speed: 0 }, ...over });
const hand = (over = {}) => mouse({ hand: { visible: true, openness: 0.9, speed: 500 }, ...over });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("windParams: 마우스는 기존 값(155/13, 저모션 110/6) 그대로", () => {
  assert.deepEqual(windParams(mouse(), false), { radius: 155, gain: 13 });
  assert.deepEqual(windParams(mouse(), true), { radius: 110, gain: 6 });
});

test("windParams: 손이면 반경 pushRadius배·세기 pushGain배(저모션에도 같은 배율)", () => {
  const w = windParams(hand(), false);
  assert.ok(near(w.radius, 155 * HAND.pushRadius) && near(w.gain, 13 * HAND.pushGain), JSON.stringify(w));
  const r = windParams(hand(), true);
  assert.ok(near(r.radius, 110 * HAND.pushRadius) && near(r.gain, 6 * HAND.pushGain), JSON.stringify(r));
  assert.ok(w.radius > 155 && w.gain > 13, "손은 마우스보다 넓고 세다");
});

test("gustParams: 마우스 210/540(저모션 130/260), 손이면 gust배", () => {
  assert.deepEqual(gustParams(mouse(), false), { radius: 210, strength: 540 });
  assert.deepEqual(gustParams(mouse(), true), { radius: 130, strength: 260 });
  const g = gustParams(hand(), false);
  assert.ok(near(g.radius, 210 * HAND.gust) && near(g.strength, 540 * HAND.gust), JSON.stringify(g));
});

test("ptr.hand가 없거나 visible=false면 손 보정이 적용되지 않는다", () => {
  assert.deepEqual(windParams({ x: 1, y: 1, dx: 1, dy: 0, down: true }, false), { radius: 155, gain: 13 });
  assert.deepEqual(gustParams(null, false), { radius: 210, strength: 540 });
  assert.equal(breathParams({ down: true }, false), null);
});

test("breathParams: 펼친 손(visible·down)에만 숨결, 마우스·주먹은 null, 저모션은 힘 절반", () => {
  assert.equal(breathParams(mouse(), false), null, "마우스 드래그엔 숨결 없음");
  assert.equal(breathParams(hand({ down: false }), false), null, "주먹(down=false)엔 숨결 없음");
  const b = breathParams(hand(), false);
  assert.deepEqual(b, { radius: HAND.breathRadius, force: HAND.breathForce });
  assert.ok(near(breathParams(hand(), true).force, HAND.breathForce * 0.5));
});

test("petalEmit: 빠른 펼친 손은 방출하고 진행 방향 단위벡터·손 속도를 넘긴다", () => {
  const st = { cool: 0 };
  const e = petalEmit(st, hand({ dx: 3, dy: -4, hand: { visible: true, openness: 0.9, speed: 400 } }), 1 / 60, false, 0);
  assert.ok(e, "방출");
  assert.equal(e.n, 2);
  assert.ok(near(e.dirx, 0.6) && near(e.diry, -0.8), `${e.dirx},${e.diry}`);
  assert.equal(e.speed, 400);
  assert.ok(near(st.cool, HAND.petalCool), "쿨다운 장전");
});

test("petalEmit: 아주 빠르면(petalSpeedMin×2 이상) 3장, 저모션은 1장·쿨다운 2배", () => {
  const fast = hand({ hand: { visible: true, openness: 0.9, speed: HAND.petalSpeedMin * 2 } });
  assert.equal(petalEmit({ cool: 0 }, fast, 1 / 60, false, 0).n, 3);
  const st = { cool: 0 };
  assert.equal(petalEmit(st, fast, 1 / 60, true, 0).n, 1);
  assert.ok(near(st.cool, HAND.petalCool * 2));
});

test("petalEmit: 느린 손·주먹·마우스·NaN 속도는 방출하지 않는다", () => {
  const slow = hand({ hand: { visible: true, openness: 0.9, speed: HAND.petalSpeedMin - 1 } });
  assert.equal(petalEmit({ cool: 0 }, slow, 1 / 60, false, 0), null, "느린 손");
  assert.equal(petalEmit({ cool: 0 }, hand({ down: false }), 1 / 60, false, 0), null, "주먹");
  assert.equal(petalEmit({ cool: 0 }, mouse({ dx: 40 }), 1 / 60, false, 0), null, "마우스는 아무리 빨라도 없음");
  const nan = hand({ hand: { visible: true, openness: 0.9, speed: NaN } });
  assert.equal(petalEmit({ cool: 0 }, nan, 1 / 60, false, 0), null, "NaN 속도");
  assert.equal(petalEmit({ cool: 0 }, hand({ dx: 0, dy: 0 }), 1 / 60, false, 0), null, "이동 벡터 0이면 방향이 없어 방출 없음");
});

test("petalEmit: 쿨다운 동안은 방출하지 않고, 쿨다운은 손이 없어도 dt만큼 줄어든다", () => {
  const st = { cool: 0 };
  const h = hand();
  assert.ok(petalEmit(st, h, 1 / 60, false, 0));
  const inside = Math.floor(HAND.petalCool * 60) - 1;          // 쿨다운 안쪽에 확실히 머무는 프레임 수
  let fired = 0;
  for (let i = 0; i < inside; i++) if (petalEmit(st, h, 1 / 60, false, 0)) fired++;
  assert.equal(fired, 0, "쿨다운 안에서는 0회");
  for (let i = 0; i < 3 && !fired; i++) if (petalEmit(st, h, 1 / 60, false, 0)) fired++;
  assert.equal(fired, 1, "쿨다운이 끝나면(≤2프레임 뒤) 다시 방출");
  // 손이 사라진 프레임에도 쿨다운은 흐른다(다음 손길이 바로 방출되도록)
  const st2 = { cool: HAND.petalCool };
  petalEmit(st2, mouse(), HAND.petalCool, false, 0);
  assert.equal(st2.cool, 0);
});

test("petalEmit: 초당 방출 총량은 상한이 있고(1/petalCool × n), petalMax 이상이면 방출하지 않는다", () => {
  const st = { cool: 0 };
  const h = hand();
  let n = 0;
  for (let t = 0; t < 1 - 1e-6; t += 1 / 60) { const e = petalEmit(st, h, 1 / 60, false, 0); if (e) n += e.n; }
  const perSec = Math.ceil(1 / HAND.petalCool) * 2;
  assert.ok(n <= perSec && n >= perSec - 2, `1초 방출 ${n} (상한 ${perSec})`);
  assert.equal(petalEmit({ cool: 0 }, h, 1 / 60, false, HAND.petalMax), null, "총량 상한");
  assert.ok(petalEmit({ cool: 0 }, h, 1 / 60, false, HAND.petalMax - 1), "상한 직전엔 방출");
});
