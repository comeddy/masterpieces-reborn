// test/mona-opening.test.mjs — 04번 모나리자 오프닝 응집 안무·얼굴 가중치(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { stepParticle } from "../js/particle-engine.js";
import { FACE_OVAL, FACE_FADE, FACE_SPRING_MIN, GATHER_MAX_DELAY, GATHER_RAMP, GATHER_IDLE_K,
  GATHER_JITTER, GATHER_REACH, MOUTH, MOUTH_FADE, faceDist, faceWeight, faceSpringScale, gatherDelay, gatherSpring,
  gatherEndFor, mouthDist, mouthWeight }
  from "../js/pieces/04-mona-lisa.js";

test("faceDist: 타원 중심 0, 타원 경계 1", () => {
  assert.equal(faceDist(FACE_OVAL.cu, FACE_OVAL.cv), 0);
  assert.ok(Math.abs(faceDist(FACE_OVAL.cu + FACE_OVAL.ru, FACE_OVAL.cv) - 1) < 1e-9);
  assert.ok(Math.abs(faceDist(FACE_OVAL.cu, FACE_OVAL.cv - FACE_OVAL.rv) - 1) < 1e-9);
});

test("faceWeight: 타원 안 1 → 감쇠 대역에서 연속 감소 → 바깥 0", () => {
  assert.equal(faceWeight(0), 1);
  assert.equal(faceWeight(1), 1);
  assert.equal(faceWeight(1 + FACE_FADE), 0);
  assert.equal(faceWeight(3), 0);
  let prev = 1;
  for (let d = 1; d <= 1 + FACE_FADE + 1e-9; d += FACE_FADE / 20) {
    const w = faceWeight(d);
    assert.ok(w >= 0 && w <= 1, `범위 밖 ${w}`);
    assert.ok(w <= prev + 1e-12, `단조 감소 위반 d=${d}`);
    prev = w;
  }
  // 경계에서 점프 없음(smoothstep): 대역 시작·끝 근처 값이 1·0에 붙어 있다
  assert.ok(faceWeight(1 + FACE_FADE * 0.02) > 0.99);
  assert.ok(faceWeight(1 + FACE_FADE * 0.98) < 0.01);
});

test("faceSpringScale: 얼굴 중심 FACE_SPRING_MIN, 바깥 1, 사이 연속", () => {
  assert.ok(Math.abs(faceSpringScale(0) - FACE_SPRING_MIN) < 1e-12);
  assert.equal(faceSpringScale(1 + FACE_FADE), 1);
  const mid = faceSpringScale(1 + FACE_FADE / 2);
  assert.ok(mid > FACE_SPRING_MIN && mid < 1);
});

test("gatherDelay: 얼굴 중심이 최대 지연, GATHER_REACH 밖은 0, 단조·비음수", () => {
  assert.ok(Math.abs(gatherDelay(0, 0) - GATHER_MAX_DELAY) < 1e-9);
  assert.equal(gatherDelay(GATHER_REACH, 0), 0);
  assert.equal(gatherDelay(GATHER_REACH + 5, 0), 0);
  let prev = Infinity;
  for (let d = 0; d <= GATHER_REACH + 1e-9; d += GATHER_REACH / 40) {
    const v = gatherDelay(d, 0);
    assert.ok(v >= 0 && v <= prev + 1e-12, `단조 위반 d=${d}`);
    prev = v;
  }
  // 랜덤 지터는 0..GATHER_JITTER 범위만 더한다 (음수 불가)
  assert.ok(Math.abs(gatherDelay(0, 1) - (GATHER_MAX_DELAY + GATHER_JITTER)) < 1e-9);
  assert.ok(gatherDelay(GATHER_REACH + 1, 1) >= 0);
  // 지터도 도달 거리에서 연속으로 0에 닿는다 (계단 없음)
  const eps = 1e-3;
  assert.ok(gatherDelay(GATHER_REACH - eps, 1) < 0.01, `도달 거리 직전 지연 ${gatherDelay(GATHER_REACH - eps, 1)}`);
  assert.equal(gatherDelay(GATHER_REACH + eps, 1), 0);
});

test("gatherEndFor: 가장 늦은 입자(최대 지연+지터)가 램프를 마치는 시각 — 감축 모드는 지연만 절반", () => {
  assert.ok(Math.abs(gatherEndFor(1) - (GATHER_MAX_DELAY + GATHER_JITTER + GATHER_RAMP)) < 1e-12);
  assert.ok(Math.abs(gatherEndFor(0.5) - ((GATHER_MAX_DELAY + GATHER_JITTER) * 0.5 + GATHER_RAMP)) < 1e-12);
  // 종료 시각에는 어떤 지연이든 스프링 비율이 1이다
  for (const scale of [1, 0.5]) {
    const worst = gatherDelay(0, 1) * scale;
    assert.equal(gatherSpring(gatherEndFor(scale), worst), 1);
  }
});

test("mouthDist/mouthWeight: 입 타원 안 1, 대역 밖 0, 입 타원은 얼굴 타원 안에 있다", () => {
  assert.equal(mouthWeight(mouthDist(MOUTH.cu, MOUTH.cv)), 1);
  assert.equal(mouthWeight(1 + MOUTH_FADE), 0);
  assert.ok(mouthWeight(1 + MOUTH_FADE / 2) > 0 && mouthWeight(1 + MOUTH_FADE / 2) < 1);
  // 입 서브필드(감쇠 대역 포함)의 네 극점이 얼굴 타원(d≤1) 안에 놓인다 → 얼굴 격자 위에 얹히는 전제
  const reach = 1 + MOUTH_FADE;
  for (const [u, v] of [[MOUTH.cu - MOUTH.ru * reach, MOUTH.cv], [MOUTH.cu + MOUTH.ru * reach, MOUTH.cv],
                        [MOUTH.cu, MOUTH.cv - MOUTH.rv * reach], [MOUTH.cu, MOUTH.cv + MOUTH.rv * reach]]) {
    assert.ok(faceDist(u, v) <= 1, `입 서브필드 극점(${u.toFixed(3)},${v.toFixed(3)})이 얼굴 타원 밖 d=${faceDist(u, v).toFixed(2)}`);
  }
});

test("gatherSpring: 지연 전 GATHER_IDLE_K, 램프 후 1, 사이 단조 증가·연속", () => {
  const delay = 1.0;
  assert.equal(gatherSpring(0, delay), GATHER_IDLE_K);
  assert.equal(gatherSpring(delay, delay), GATHER_IDLE_K);
  assert.equal(gatherSpring(delay + GATHER_RAMP, delay), 1);
  assert.equal(gatherSpring(delay + 10, delay), 1);
  let prev = GATHER_IDLE_K;
  for (let t = delay; t <= delay + GATHER_RAMP + 1e-9; t += GATHER_RAMP / 20) {
    const s = gatherSpring(t, delay);
    assert.ok(s >= prev - 1e-12 && s <= 1, `단조 위반 t=${t}`);
    prev = s;
  }
  assert.ok(gatherSpring(delay + GATHER_RAMP * 0.02, delay) < GATHER_IDLE_K + 0.05, "램프 시작이 부드럽다");
});

// 안무 시뮬레이션: 얼굴 중심 입자는 바깥 입자보다 늦게, 그러나 모두 7초 안에 도착한다
// (감쇠 3.4에서 지수 감쇠율은 스프링과 무관하게 c/2=1.7/s → 500px가 4px 안으로 드는 데 ~3.5초)
test("응집 안무: 바깥 입자가 먼저 도착하고 얼굴 입자가 마지막에 도착한다", () => {
  const SPRING = 3.6, DAMP = 3.4, dt = 1 / 60;
  const mk = (d) => ({ x: 0, y: 0, vx: 0, vy: 0, tx: 400, ty: 300, d,
                       delay: gatherDelay(d, 0.5), k: faceSpringScale(d) });
  const face = mk(0), hair = mk(1.3), far = mk(GATHER_REACH + 0.5);
  const dist = (p) => Math.hypot(p.tx - p.x, p.ty - p.y);
  let clock = 0;                       // 절대 시각 — run은 여기서부터 until까지 진행
  const run = (until) => {
    for (; clock < until - 1e-9; clock += dt) {
      for (const p of [face, hair, far]) {
        p.spring = SPRING * p.k * gatherSpring(clock, p.delay);
        stepParticle(p, dt, SPRING, DAMP);
      }
    }
  };
  run(1.2);
  assert.ok(dist(far) < dist(hair) && dist(hair) < dist(face),
    `1.2초: 도착 순서 위반 far=${dist(far).toFixed(1)} hair=${dist(hair).toFixed(1)} face=${dist(face).toFixed(1)}`);
  assert.ok(dist(face) > 200, `1.2초: 얼굴은 아직 멀리 있어야 함 ${dist(face).toFixed(1)}`);
  run(4);
  assert.ok(dist(far) < 4, `4초: 바깥 입자는 안착해야 함 ${dist(far).toFixed(1)}`);
  run(7);
  for (const p of [face, hair, far]) assert.ok(dist(p) < 4, `7초 내 미수렴 d=${p.d}: ${dist(p).toFixed(2)}`);
});

// ── 순수 샘플러: 밀도 필드·특징 보존·중복 없음 ────────────────────────
import { DENSITY_MAX, DENSITY_FLOOR, DENSITY_TOTAL, EDGE_NORM, W_BRIGHT, W_EDGE, FEATURE_EDGE, DENS_BUCKETS, densBucket, skinness,
  importanceOf, solveK, samplePixels } from "../js/pieces/04-mona-lisa.js";

// 결정적 의사난수 (LCG) — 테스트 재현성
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// 균일 회색 이미지(iw×ih) 픽셀 배열. paint(x,y)→[r,g,b] 로 덧칠 가능
function makeImage(iw, ih, paint) {
  const data = new Uint8ClampedArray(iw * ih * 4);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    const c = paint ? paint(x, y) : null;
    const i = (y * iw + x) * 4;
    data[i] = c ? c[0] : 180; data[i + 1] = c ? c[1] : 160; data[i + 2] = c ? c[2] : 130; data[i + 3] = 255;
  }
  return data;
}

test("samplePixels: 피부빛이 아닌 균일 이미지에서는 얼굴 안팎 밀도가 같다(기하만으로는 올리지 않음), 총량은 count·DENSITY_TOTAL", () => {
  const iw = 480, ih = 716, count = 6000;
  const pts = samplePixels(makeImage(iw, ih, () => [150, 162, 156]), iw, ih, count, lcg(1)); // 청록 회색(skinness 0)
  let inCore = 0, inBottom = 0, aCore = 0, aBottom = 0;
  for (let y = 0; y < ih; y += 2) for (let x = 0; x < iw; x += 2) {
    const u = (x + 0.5) / iw, v = (y + 0.5) / ih;
    if (faceDist(u, v) < 0.9) aCore += 4; else if (v > 0.7) aBottom += 4;
  }
  for (const q of pts) { if (faceDist(q.u, q.v) < 0.9) inCore++; else if (q.v > 0.7) inBottom++; }
  const ratio = (inCore / aCore) / (inBottom / aBottom);
  assert.ok(Math.abs(ratio - 1) < 0.12, `얼굴/바깥 밀도 비 ${ratio.toFixed(2)} ≠ 1`);
  assert.ok(Math.abs(pts.length / (count * DENSITY_TOTAL) - 1) < 0.08, `총량 ${pts.length} ≠ ${count * DENSITY_TOTAL}`);
  for (const q of pts) assert.ok(q.dens > 0 && q.dens <= DENSITY_MAX + 1e-9, `dens 범위 밖 ${q.dens}`);
});

test("samplePixels: 피부빛 균일 이미지에서는 얼굴 타원 안만 촘촘하고, 타원 바깥 고리는 기본 밀도(고리 없음)", () => {
  const iw = 480, ih = 716, count = 6000;
  const pts = samplePixels(makeImage(iw, ih), iw, ih, count, lcg(3)); // 기본색 (180,160,130) = 피부빛
  const ring = (a, b) => { let n = 0; for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) { const d = faceDist((x + 0.5) / iw, (y + 0.5) / ih); if (d >= a && d < b) n++; } return n; };
  const cnt = (a, b) => pts.filter((q) => { const d = faceDist(q.u, q.v); return d >= a && d < b; }).length;
  const dIn = cnt(0, 0.9) / ring(0, 0.9), dOut = cnt(1 + FACE_FADE + 0.1, 1 + FACE_FADE + 0.6) / ring(1 + FACE_FADE + 0.1, 1 + FACE_FADE + 0.6);
  const dFar = pts.filter((q) => q.v > 0.7).length / (iw * ih * 0.3);
  assert.ok(dIn / dFar > 1.3, `얼굴 안 밀도 배율 ${(dIn / dFar).toFixed(2)} — 피부 항이 작동해야 함`);
  assert.ok(Math.abs(dOut / dFar - 1) < 0.12, `타원 바깥 고리 밀도 배율 ${(dOut / dFar).toFixed(2)} ≠ 1 — 고리가 생김`);
});

test("samplePixels: 밀도는 밝기를 따른다 — 밝은 반쪽이 어두운 반쪽보다 촘촘, 어두운 쪽도 하한 유지", () => {
  const iw = 480, ih = 716, count = 6000;
  const data = makeImage(iw, ih, (x, y) => (y < ih / 2 ? [220, 200, 170] : [40, 32, 26]));
  const pts = samplePixels(data, iw, ih, count, lcg(2));
  // 경계선(y=ih/2) 주변 ±8px 은 경계 항이 끼므로 제외
  const top = pts.filter((q) => q.v * ih < ih / 2 - 8).length, bot = pts.filter((q) => q.v * ih > ih / 2 + 8).length;
  const base = count / (iw * ih) * (iw * (ih / 2 - 8));   // 반쪽 면적의 기본 격자 점 수
  const rTop = top / base, rBot = bot / base;
  assert.ok(rTop / rBot >= 2.5, `밝은/어두운 밀도 비 ${(rTop / rBot).toFixed(2)} < 2.5`);
  assert.ok(rBot >= DENSITY_FLOOR * DENSITY_MAX * 0.8, `어두운 쪽 밀도 ${rBot.toFixed(2)} 가 하한 ${(DENSITY_FLOOR * DENSITY_MAX).toFixed(2)} 아래`);
  assert.ok(rTop <= DENSITY_MAX + 0.05, `밝은 쪽 밀도 ${rTop.toFixed(2)} 가 상한 초과`);
  // dens 필드는 실제 밀도와 같은 방향
  const dTop = pts.filter((q) => q.v * ih < ih / 2 - 8).reduce((a, q) => a + q.dens, 0) / top;
  const dBot = pts.filter((q) => q.v * ih > ih / 2 + 8).reduce((a, q) => a + q.dens, 0) / bot;
  assert.ok(dTop > dBot);
});

test("importanceOf/solveK: 중요도는 밝기·명암폭에 단조, K 는 총량을 1% 안에서 맞춘다", () => {
  assert.ok(importanceOf(0.9, 0) > importanceOf(0.5, 0) && importanceOf(0.5, 0) > importanceOf(0.1, 0));
  assert.ok(importanceOf(0.5, 50) > importanceOf(0.5, 10));
  assert.ok(Math.abs(importanceOf(1, EDGE_NORM * 5) - (W_BRIGHT + W_EDGE)) < 1e-12, "경계 항은 EDGE_NORM 에서 포화");
  const r = lcg(9); const imps = Array.from({ length: 5000 }, () => importanceOf(r(), r() * 80));
  const target = 2400;
  const K = solveK(imps, target);
  const got = imps.reduce((a, v) => a + Math.min(1, DENSITY_FLOOR + K * v), 0);
  assert.ok(Math.abs(got - target) / target < 0.01, `기대 총량 ${got.toFixed(1)} ≠ ${target}`);
  // 모두 채택해도 모자라면 상한 K
  assert.equal(solveK([0.01, 0.02], 10), 8);
});

test("samplePixels: 얼굴 안 가느다란 어두운 선(입술선)이 점으로 살아남고, 바깥 지터 셀은 원색을 쓴다", () => {
  const iw = 480, ih = 716, count = 6000;
  // 얼굴 중심을 가로지르는 3px 두께의 어두운 선 (v = cv, u ∈ cu±0.06)
  const yLine = Math.round(FACE_OVAL.cv * ih), xa = Math.round((FACE_OVAL.cu - 0.06) * iw), xb = Math.round((FACE_OVAL.cu + 0.06) * iw);
  const data = makeImage(iw, ih, (x, y) => (Math.abs(y - yLine) <= 1 && x >= xa && x <= xb) ? [40, 30, 25] : null);
  const pts = samplePixels(data, iw, ih, count, lcg(3));
  const fstep = Math.sqrt((iw * ih) / count) / Math.sqrt(DENSITY_MAX); // 미세 격자 ≈4.5px → 선을 가로지르는 셀 ≈ (xb-xa)/fstep
  const onLine = pts.filter((q) => Math.abs(q.v * ih - yLine) <= 1.5 && q.u * iw >= xa - 1 && q.u * iw <= xb + 1);
  const expectCells = (xb - xa) / fstep;
  // 선이 지나는 셀은 경계 항으로 채택 확률이 높고(≈1) 특징 스냅이 선을 잡는다 → 셀 수의 70% 이상
  assert.ok(onLine.length >= expectCells * 0.7, `선 위 점 ${onLine.length} < 셀 수 ${expectCells.toFixed(1)}의 70%`);
  for (const q of onLine) assert.ok(0.3 * q.r + 0.59 * q.g + 0.11 * q.b < 120, `선 위 점이 어둡지 않다 ${q.r},${q.g},${q.b}`);
  const far = pts.filter((q) => q.v > 0.7);
  assert.ok(far.every((q) => q.r === 180 && q.g === 160 && q.b === 130), "바깥 점은 원색 그대로");
});

test("samplePixels: 같은 픽셀이 두 번 들어가지 않는다", () => {
  const iw = 240, ih = 358, count = 3000;
  const pts = samplePixels(makeImage(iw, ih), iw, ih, count, lcg(4));
  const keys = new Set(pts.map((q) => Math.round(q.v * ih) * iw + Math.round(q.u * iw)));
  assert.equal(keys.size, pts.length);
});

test("samplePixels: 평탄한 얼굴 셀은 최암점(셀 좌상단)으로 몰리지 않고 셀 안에 고르게 퍼진다", () => {
  const iw = 480, ih = 716, count = 6000;
  const pts = samplePixels(makeImage(iw, ih), iw, ih, count, lcg(5));
  const step = Math.sqrt((iw * ih) / count);
  // 얼굴 중심(d<0.6) 점들의 셀 내 가로 오프셋 — 좌상단 스냅이면 0 근처로 몰린다(표준편차 ≪ step)
  const offs = pts.filter((q) => faceDist(q.u, q.v) < 0.6).map((q) => ((q.u * iw) % step) / step);
  const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
  const sd = Math.sqrt(offs.reduce((a, b) => a + (b - mean) ** 2, 0) / offs.length);
  assert.ok(offs.length > 100, `표본 부족 ${offs.length}`);
  assert.ok(sd > 0.2, `셀 내 오프셋 표준편차 ${sd.toFixed(3)} — 균등(≈0.29)이어야 하며 스냅(≈0)이면 실패`);
});

test("densBucket: 가장 가까운 밀도 버킷을 고른다", () => {
  assert.equal(densBucket(0.5), 0);
  assert.equal(densBucket(1.1), 1);
  assert.equal(densBucket(1.6), 2);
  assert.equal(densBucket(2.8), 3);
  assert.equal(DENS_BUCKETS.length, 4);
});

test("skinness: 피부빛(따뜻·밝음)은 1에 가깝고 하늘(청록)·머리카락(어두움)은 0", () => {
  assert.ok(skinness(206, 176, 140) > 0.9, "밝은 피부");
  assert.ok(skinness(150, 120, 92) > 0.5, "그늘진 피부");
  assert.equal(skinness(120, 140, 130), 0, "청록 하늘");
  assert.equal(skinness(58, 40, 28), 0, "어두운 머리카락");
  assert.equal(skinness(48, 35, 25), 0, "드레스");
});

// ── 카메라 손짓: 셸 합성 포인터 방식 ──────────────────────────────────
import { WORKS } from "../js/data.js";
import { handStir, handSpeedGain, handMotion, HAND_STILL, HAND_SPEED_MIN, HAND_SPEED_FULL } from "../js/pieces/04-mona-lisa.js";

test("04번은 카메라 손 합성 포인터 작품이다 (cam·handPointer·camHands 1) — 힌트에 📷와 마우스 대응 명시", () => {
  const w = WORKS.find((x) => x.no === "04");
  assert.equal(w.cam, true); assert.equal(w.handPointer, true); assert.equal(w.camHands, 1);
  assert.ok(w.hint.includes("📷") && w.hint.includes("마우스"), w.hint);
  assert.ok(w.note.includes("카메라"), "note에 카메라 문장");
});

test("handStir: 펼침 문턱(0.5) 이하 0.35, 활짝(1) 1, 사이 단조 증가, 비정상 입력은 1", () => {
  assert.ok(Math.abs(handStir(0.5) - 0.35) < 1e-12);
  assert.ok(Math.abs(handStir(0) - 0.35) < 1e-12);
  assert.equal(handStir(1), 1);
  assert.ok(handStir(0.75) > handStir(0.6) && handStir(0.6) > handStir(0.5));
  assert.equal(handStir(NaN), 1); assert.equal(handStir(undefined), 1);
});

test("handSpeedGain: 멈춘 손 HAND_STILL, 빠른 손 1, 사이 단조, 비정상 입력은 멈춤으로", () => {
  assert.ok(Math.abs(handSpeedGain(0) - HAND_STILL) < 1e-12);
  assert.ok(Math.abs(handSpeedGain(HAND_SPEED_MIN) - HAND_STILL) < 1e-12);
  assert.equal(handSpeedGain(HAND_SPEED_FULL), 1); assert.equal(handSpeedGain(5000), 1);
  const mid = handSpeedGain((HAND_SPEED_MIN + HAND_SPEED_FULL) / 2);
  assert.ok(mid > HAND_STILL && mid < 1);
  assert.ok(Math.abs(handSpeedGain(NaN) - HAND_STILL) < 1e-12);
});

test("handMotion: 지터(≤MIN)는 0, FULL 이상 1, 사이 선형·단조, 비정상 입력 0", () => {
  assert.equal(handMotion(0), 0); assert.equal(handMotion(HAND_SPEED_MIN), 0);
  assert.equal(handMotion(HAND_SPEED_FULL), 1); assert.equal(handMotion(9999), 1);
  const a = handMotion(200), b = handMotion(400);
  assert.ok(a > 0 && b > a && b < 1);
  assert.equal(handMotion(NaN), 0);
  assert.ok(Math.abs(handSpeedGain(300) - (HAND_STILL + (1 - HAND_STILL) * handMotion(300))) < 1e-12);
});
