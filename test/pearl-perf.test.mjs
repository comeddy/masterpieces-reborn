// test/pearl-perf.test.mjs — 03번 fps 독립화·렌더 경량화 순수 수식 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIM_MAX, SUBSTEP, HOT_BRIGHT, RECT_MAX, simDt, substeps, impulseScale, trailAlpha, particleAlpha, isHot }
  from "../js/pieces/03-pearl-earring.js";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("simDt: 실제 경과가 유한수면 그것을(상한 SIM_MAX), 아니면 dt로 폴백", () => {
  assert.equal(simDt(0.1, 0.05), 0.1);
  assert.equal(simDt(0.9, 0.05), SIM_MAX);
  assert.equal(simDt(-0.01, 0.05), 0);
  assert.equal(simDt(undefined, 0.05), 0.05);
  assert.equal(simDt(NaN, 0.05), 0.05);
});

test("substeps: 합은 sim과 같고 각 스텝은 SUBSTEP 이하, 균등 분할", () => {
  const s = substeps(0.1);
  assert.equal(s.length, 5);
  assert.ok(s.every((h) => h <= SUBSTEP + 1e-12));
  assert.ok(near(s.reduce((a, b) => a + b, 0), 0.1));
  const t = substeps(0.05);
  assert.equal(t.length, 3);
  assert.ok(near(t[0], 0.05 / 3));
  assert.deepEqual(substeps(0), []);
  assert.equal(substeps(1 / 60).length, 1);
});

test("impulseScale: 60fps=1, 10fps=6(상한), 120fps=0.5(하한)", () => {
  assert.ok(near(impulseScale(1 / 60), 1));
  assert.ok(near(impulseScale(0.1), 6));
  assert.ok(near(impulseScale(0.25), 6));
  assert.ok(near(impulseScale(1 / 120), 0.5));
  assert.ok(near(impulseScale(1 / 240), 0.5));
});

test("trailAlpha: 60fps=0.34, 10fps≈0.917, 단조 증가", () => {
  assert.ok(near(trailAlpha(1 / 60), 0.34));
  assert.ok(near(trailAlpha(0.1), 1 - Math.pow(0.66, 6)));
  assert.ok(trailAlpha(0.05) > trailAlpha(1 / 60));
});

test("particleAlpha: bright≤1 구간은 현행 rgb×bright×(0.28+0.5·bright)와 동일값, 1.5에서 1", () => {
  const legacy = (b) => b * Math.min(1, 0.28 + b * 0.5);
  assert.ok(near(particleAlpha(0.5), legacy(0.5)));
  assert.ok(near(particleAlpha(1.0), legacy(1.0)));
  assert.ok(near(particleAlpha(0.45), legacy(0.45)));
  assert.equal(particleAlpha(1.5), 1);
  assert.equal(particleAlpha(1.8), 1);
});

test("isHot: HOT_BRIGHT 초과만 참, RECT_MAX는 2.0", () => {
  assert.equal(isHot(1.0), false);
  assert.equal(isHot(HOT_BRIGHT), false);
  assert.equal(isHot(1.2), true);
  assert.equal(RECT_MAX, 2.0);
});
