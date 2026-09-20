// test/venus-gesture.test.mjs — 02번 손(서풍) 보정 순수 함수 검증
// 셸이 손을 포인터로 합성하므로 작품은 ptr.hand만 읽는다 — 마우스 값은 바뀌지 않고,
// 손이면 바람이 넓고 조금 세며, 펼친 손 아래 숨결이 생기고, 빠른 손길에 꽃잎이 방출된다.
import { test } from "node:test";
import assert from "node:assert/strict";
import piece, { HAND, windParams, gustParams, breathParams, petalEmit, petalStats }
  from "../js/pieces/02-birth-of-venus.js";

const mouse = (over = {}) => ({ x: 400, y: 300, dx: 6, dy: 0, down: true, justDown: false, inside: true,
  hand: { visible: false, openness: 0, speed: 0 }, ...over });
const hand = (over = {}) => mouse({ hand: { visible: true, openness: 0.9, speed: 500 }, ...over });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("HAND 상수는 스펙 값과 같다", () => {
  assert.deepEqual(HAND, { pushRadius: 1.5, pushGain: 1.25, gust: 1.4, breathRadius: 120, breathForce: 30,
    petalSpeedMin: 320, petalCool: 0.16, petalMax: 90, petalLife: 7, petalFade: 1.5 });
});

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
  assert.ok(g.radius > 210 && g.strength > 540, "손 돌풍은 마우스보다 넓고 세다");
});

test("ptr.hand가 없거나 visible=false면 손 보정이 적용되지 않는다", () => {
  assert.deepEqual(windParams({ x: 1, y: 1, dx: 1, dy: 0, down: true }, false), { radius: 155, gain: 13 });
  assert.deepEqual(gustParams(null, false), { radius: 210, strength: 540 });
  assert.equal(breathParams({ down: true }, false), null);
  assert.equal(petalEmit({ cool: 0 }, { x: 1, y: 1, dx: 5, dy: 0, down: true }, 1 / 60, false, 0), null, "ptr.hand 없음");
  assert.equal(petalEmit({ cool: 0 }, null, 1 / 60, false, 0), null, "ptr null");
  assert.equal(petalEmit({ cool: 0 }, hand({ dx: NaN }), 1 / 60, false, 0), null, "dx NaN");
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

test("petalEmit: speed 인자를 주면 ptr.hand.speed 대신 쓴다(realDt 재계산 경로)", () => {
  const fast = hand({ hand: { visible: true, openness: 0.9, speed: 1000 } });
  assert.equal(petalEmit({ cool: 0 }, fast, 1 / 60, false, 0, 100), null, "재계산 속도가 느리면 방출 없음");
  const slow = hand({ hand: { visible: true, openness: 0.9, speed: 10 } });
  const e = petalEmit({ cool: 0 }, slow, 1 / 60, false, 0, 700);
  assert.ok(e && e.n === 3 && e.speed === 700, "재계산 속도가 빠르면 그 값으로 방출");
  assert.equal(petalEmit({ cool: 0 }, slow, 1 / 60, false, 0, undefined), null, "undefined면 ptr.hand.speed 사용");
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

test("petalEmit: 60fps 1초 방출 수는 쿨다운 프레임 양자화로 정확히 정해지고, 손 꽃잎 수가 petalMax 이상이면 방출하지 않는다", () => {
  const st = { cool: 0 };
  const h = hand();
  const frames = 60;
  let n = 0;
  for (let i = 0; i < frames; i++) { const e = petalEmit(st, h, 1 / 60, false, 0); if (e) n += e.n; }
  const period = Math.ceil(HAND.petalCool * 60 - 1e-9);            // 쿨다운이 0이 되는 프레임 간격(0.16s → 10프레임)
  const fires = Math.floor((frames - 1) / period) + 1;               // 0, period, 2·period … 프레임에 방출
  assert.equal(n, fires * 2, `1초 방출 ${n} = ${fires}회 × 2장`);
  assert.equal(petalEmit({ cool: 0 }, h, 1 / 60, false, HAND.petalMax), null, "손 꽃잎 상한");
  assert.ok(petalEmit({ cool: 0 }, h, 1 / 60, false, HAND.petalMax - 1), "상한 직전엔 방출");
});

// ── 스텁 ctx 스모크: 브라우저 없는 node에서 init→tick→dispose를 렌더 코드까지 실행한다(11번 테스트 선례) ──
// arc(x,y)를 기록해 그려진 입자 좌표가 유한한지 확인하고, petalStats()로 손 꽃잎 수명·상한을 검증한다.
function makeStubCtx() {
  const arcs = [];
  const stub = new Proxy(function () {}, {
    get: (_, k) => {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === "arc") return (x, y) => { arcs.push(x, y); };
      return stub;
    },
    set: () => true, apply: () => stub, construct: () => stub,
  });
  return { stub, arcs };
}
const basePtr = () => ({ x: 640, y: 400, px: 640, py: 400, dx: 0, dy: 0, down: false, justDown: false, justUp: false,
  downTime: 0, inside: true, hand: { visible: false, openness: 0, speed: 0 } });

test("NaN 포인터 프레임(돌풍·바람·숨결·꽃잎 동시)이 들어와도 예외 없이 지나가고 입자 좌표는 전부 유한하다", () => {
  const { stub, arcs } = makeStubCtx();
  piece.init({ canvas: stub, ctx: stub, width: 1280, height: 800, reducedMotion: false, assets: {} });
  try {
    for (let i = 0; i < 30; i++) piece.tick(1 / 60, basePtr(), 1 / 60);
    const bad = { ...basePtr(), x: NaN, y: NaN, dx: NaN, dy: NaN, down: true, justDown: true,
      hand: { visible: true, openness: 1, speed: NaN } };
    piece.tick(1 / 60, bad, 1 / 60);
    arcs.length = 0;
    for (let i = 0; i < 30; i++) piece.tick(1 / 60, basePtr(), 1 / 60);
    assert.ok(arcs.length > 1000, `입자가 그려졌다(${arcs.length / 2}개)`);
    assert.ok(arcs.every(Number.isFinite), "NaN 프레임 뒤에도 모든 입자 좌표가 유한");
  } finally { piece.dispose(); }
});

test("빠른 펼친 손 스윕은 손 꽃잎을 방출하고, 손을 멈추면 petalLife 뒤 손 꽃잎이 전부 사라진다(가장자리 꽃잎은 별도)", () => {
  const { stub } = makeStubCtx();
  piece.init({ canvas: stub, ctx: stub, width: 1280, height: 800, reducedMotion: false, assets: {} });
  try {
    for (let i = 0; i < 30; i++) piece.tick(1 / 60, basePtr(), 1 / 60);
    assert.equal(petalStats().hand, 0);
    for (let i = 0; i < 60; i++) {                                   // 1초 스윕: 프레임당 40px = 2400px/s
      const p = { ...basePtr(), x: 300 + i * 12, y: 400, dx: 40, dy: 0, down: true,
        hand: { visible: true, openness: 1, speed: 2400 } };
      piece.tick(1 / 60, p, 1 / 60);
    }
    const peak = petalStats().hand;
    assert.ok(peak >= 12 && peak <= HAND.petalMax, `1초 스윕 뒤 손 꽃잎 ${peak}장`);
    for (let i = 0; i < Math.ceil((HAND.petalLife + 0.5) * 60); i++) piece.tick(1 / 60, basePtr(), 1 / 60);
    assert.equal(petalStats().hand, 0, "수명이 다하면 손 꽃잎 0");
  } finally { piece.dispose(); }
});

test("손 꽃잎 수가 petalMax에 닿으면 방출이 멈추고(항상 ≤ petalMax), 수명이 다한 만큼만 다시 방출된다 — 상한은 가장자리 꽃잎을 세지 않는다", () => {
  const { stub } = makeStubCtx();
  piece.init({ canvas: stub, ctx: stub, width: 1280, height: 800, reducedMotion: false, assets: {} });
  try {
    // 8초 좌우 왕복 스윕: 700px/s(3장/방출·18장/s > 상한/수명)이면서 발사 속도 ~270px/s라 꽃잎이 화면 안에 머문다
    const step = 700 / 60, leg = 34;                                  // 한 방향 34프레임 ≈ 397px (x 440~840)
    for (let i = 0; i < 60 * 8; i++) {
      const dir = (Math.floor(i / leg) % 2) ? -1 : 1;
      const k = i % leg;
      const x = dir > 0 ? 440 + k * step : 840 - k * step;
      const p = { ...basePtr(), x, y: 400, dx: dir * step, dy: 0, down: true,
        hand: { visible: true, openness: 1, speed: 700 } };
      piece.tick(1 / 60, p, 1 / 60);
      assert.ok(petalStats().hand <= HAND.petalMax, `손 꽃잎 ${petalStats().hand} ≤ ${HAND.petalMax}`);
    }
    const s = petalStats();
    assert.ok(s.hand >= HAND.petalMax * 0.8, `지속 스윕 중 손 꽃잎이 상한 근처를 유지(${s.hand})`);
    assert.ok(s.total >= s.hand, "총수에는 가장자리 꽃잎이 더해질 수 있다");
  } finally { piece.dispose(); }
});
