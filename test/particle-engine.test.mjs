// test/particle-engine.test.mjs — 엔진 순수 로직 검증 (DOM 불필요 부분만)
import { test } from "node:test";
import assert from "node:assert/strict";
import { containFit, stepParticle, ParticleField } from "../js/particle-engine.js";

test("containFit: 종횡비 유지 + 여백 + 중앙 정렬", () => {
  // 정사각 이미지를 1000x500 화면에 margin 0.1로 → 세로가 제약: 박스 400x400
  const f = containFit(100, 100, 1000, 500, 0.1);
  assert.equal(Math.round(f.w), 400);
  assert.equal(Math.round(f.h), 400);
  assert.equal(Math.round(f.x), 300); // (1000-400)/2
  assert.equal(Math.round(f.y), 50);  // (500-400)/2
});

test("stepParticle: 목표로 수렴하고 감쇠가 진동을 잦아들게 한다", () => {
  const p = { x: 0, y: 0, vx: 0, vy: 0, tx: 100, ty: 50 };
  for (let i = 0; i < 600; i++) stepParticle(p, 1 / 60, 22, 7);
  assert.ok(Math.abs(p.tx - p.x) < 1, `x 수렴 실패: ${p.x}`);
  assert.ok(Math.abs(p.ty - p.y) < 1, `y 수렴 실패: ${p.y}`);
});

test("stepParticle: 입자별 spring 오버라이드가 우선한다", () => {
  const slow = { x: 0, y: 0, vx: 0, vy: 0, tx: 100, ty: 0, spring: 2 };
  const fast = { x: 0, y: 0, vx: 0, vy: 0, tx: 100, ty: 0 };
  for (let i = 0; i < 30; i++) { stepParticle(slow, 1/60, 22, 7); stepParticle(fast, 1/60, 22, 7); }
  assert.ok(fast.x > slow.x, "기본 spring(22)이 오버라이드(2)보다 빨라야 함");
});

test("ParticleField(points 모드): 생성·스텝·산란·리사이즈가 동작한다", () => {
  const points = Array.from({ length: 200 }, (_, i) => ({
    u: (i % 20) / 20, v: Math.floor(i / 20) / 10, r: 200, g: 100, b: 50,
  }));
  const f = new ParticleField({ points, aspect: 1, count: 200, w: 800, h: 600 });
  assert.equal(f.particles.length, 200);
  for (let i = 0; i < 400; i++) f.step(1 / 60);
  const avg = f.particles.reduce((s, p) => s + Math.hypot(p.tx - p.x, p.ty - p.y), 0) / 200;
  assert.ok(avg < 2, `응집 실패: 평균 거리 ${avg}`);

  // 산란: 중심 근처 입자들이 밀려남
  f.scatter(400, 300, 300, 900);
  f.step(1 / 60);
  const avgAfter = f.particles.reduce((s, p) => s + Math.hypot(p.tx - p.x, p.ty - p.y), 0) / 200;
  assert.ok(avgAfter > avg, "scatter 후 평균 목표거리가 커져야 함");

  // 리사이즈: 목표가 새 박스 안으로
  f.resize(400, 400);
  for (const p of f.particles) {
    assert.ok(p.tx >= 0 && p.tx <= 400 && p.ty >= 0 && p.ty <= 400);
  }
});
