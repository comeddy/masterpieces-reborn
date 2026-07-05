// js/pieces/16-dream-journey.js
// After An Gyeon — Mongyudowondo, 몽유도원도 (1447, 덴리대 소장) · 두루마리 여행
// 안평대군의 꿈을 그린 이 그림은 여느 두루마리와 달리 왼→오른쪽으로 전개된다:
// 왼쪽 아래 야산의 현실에서 출발해 중앙 험준한 기암을 넘어 오른쪽 복사꽃 도원경에 이른다.
// 화면 높이에 맞춰 깐 원작을 가로 카메라로 훑는다 — 드래그는 두루마리를 펴는 손(관성+양끝
// 이징 바운스), 가만두면 꿈이 스스로 좌→우로 흐른다. 원작을 하늘/원경/근경 3개 깊이 층으로
// 나눠 시차를 주되, 층 경계는 안개 띠가 가려 산세가 어색히 잘리지 않는다. 도원 구간에 들면
// 복사꽃잎이 나풀나풀 날리고, 화면을 누르면 그 자리에서 꽃잎이 왈칵 터진다.
//
// 규약: dt·pointer만 사용. addEventListener/rAF/타이머/시계 API 없음.
// document는 오프스크린 캔버스 생성에만 사용. 좌표는 CSS px. assets.target 없으면 절차적 폴백.

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let img = null;                           // 원작 (없으면 null → 절차적 폴백)
let base = null, bctx = null;             // 오프스크린: 화면 높이로 스케일한 두루마리 전체
let baseW = 0, baseH = 0;                 // 스케일된 두루마리 픽셀 크기
let marginTop = 0;                        // 상하 한지 여백(세로 중앙 정렬)
const MARGIN_V = 0.045;                   // 상하 여백 비율

// ---- 가로 카메라 ----
let camX = 0;                             // 두루마리 좌측 기준 스크롤 오프셋(px)
let maxCam = 0, camMid = 0;               // 이동 한계 / 시차 앵커(가운데)
let camV = 0;                             // 카메라 속도(px/s) — 관성·자동 유람 공용
let dragV = 0;                            // 드래그 중 손가락 속도(관성 시드용, 평활화)
let idle = 0;                             // 마지막 드래그 이후 유휴 시간(초)
let autoDir = 1;                          // 자동 유람 방향(+1 우, -1 좌)
let pressMoved = false;                   // 이번 누름이 드래그로 바뀌었는지(탭↔드래그 구분)
const IDLE_DELAY = 1.6;                   // 이 시간 지나면 자동 유람 시작(초)
const FRICTION = 0.90;                    // 관성 마찰(프레임당, dt 보정)
const END_K = 9;                          // 양끝 스프링(이징 바운스) 강도

// ---- 깊이 층 (하늘/원경/근경) ----
// v0..v1: base 세로 정규화 구간, f: 시차 계수(가운데 앵커 → 양끝에서만 어긋남)
// 경계(0.42·0.76)는 하늘 여백과 낮은 전경처럼 강한 수직 산세가 적은 자리에 두고
// 그 위를 안개 띠로 가려 층 경계가 산봉우리를 어색하게 자르지 않게 한다.
const LAYERS = [
  { v0: 0.00, v1: 0.44, f: 0.94 },        // 원경(하늘·먼 봉우리) — 느리게
  { v0: 0.42, v1: 0.78, f: 1.00 },        // 중경(기암 본체) — 기준 앵커, 항상 온전
  { v0: 0.76, v1: 1.00, f: 1.07 },        // 근경(전경 바위·계곡·물가) — 빠르게
];
const SEAMS = [0.43, 0.77];               // 안개로 가릴 층 경계(base 세로 정규화)
let mist = [];                            // {vc, half, baseA, drift, w, phase, dir, ox}
const SILK = "#c4a874";                   // 아연 바랜 비단 톤(여백·안개)
const SILK_RGB = [206, 182, 132];         // 안개 색(비단보다 살짝 밝음)

// ---- 복사꽃잎 입자 ----
const petals = [];                        // 풀(활성만 alive=true)
let MAX_PETALS = 130;                     // 상한(reducedMotion이면 절반)
let spawnAcc = 0;                         // 자연 낙화 스폰 누적
const PETAL_TONES = [                     // 연분홍 계열
  [232, 168, 178], [224, 150, 165], [240, 190, 198], [214, 132, 150],
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}

// 화면 높이 기준 스케일 → 두루마리 전체를 base에 굽는다(카메라가 여기서 크롭)
function computeLayout() {
  let iw = img ? (img.naturalWidth || img.width) : 0;
  let ih = img ? (img.naturalHeight || img.height) : 0;
  if (iw <= 0 || ih <= 0) { iw = 1920; ih = 697; }   // 원작 비율 근사(폴백)
  const availH = H * (1 - MARGIN_V * 2);
  const scale = availH / ih;
  baseH = Math.round(ih * scale);
  baseW = Math.round(iw * scale);
  marginTop = (H - baseH) / 2;
  maxCam = Math.max(0, baseW - W);
  camMid = maxCam / 2;
}

// base 굽기: 두루마리 원작(또는 절차 근사)을 baseW×baseH로
function buildBase() {
  base = makeCanvas(baseW, baseH);
  bctx = base.getContext("2d");
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.clearRect(0, 0, baseW, baseH);
  if (img) bctx.drawImage(img, 0, 0, baseW, baseH);
  else proceduralScene(bctx, baseW, baseH);
}

// 절차적 폴백 — 좌: 야산(현실) / 중앙: 험준한 기암 / 우: 복사꽃 언덕(도원)
function proceduralScene(g, w, h) {
  // 비단 바탕(따뜻한 세로 그라데이션)
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#cdb488");
  bg.addColorStop(1, "#bd9f6c");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  const ink = (a) => `rgba(58,46,38,${a})`;
  // 규칙적 난수(폴백은 매번 같은 형상이도록)
  let s = 20240705;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  // (좌 0~18%) 야산 — 현실: 낮고 부드러운 능선 몇 겹
  for (let k = 0; k < 3; k++) {
    g.fillStyle = ink(0.16 + k * 0.08);
    const yb = h * (0.62 + k * 0.11);
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, yb);
    for (let i = 0; i <= 10; i++) {
      const x = w * 0.18 * (i / 10);
      g.lineTo(x, yb - Math.sin(i * 1.3 + k) * h * 0.05 - h * 0.03 * (1 - i / 10));
    }
    g.lineTo(w * 0.18, h);
    g.closePath();
    g.fill();
  }

  // (중앙 22~68%) 험준한 기암 — 수직으로 솟구친 뾰족 봉우리 군
  const cx0 = w * 0.22, cx1 = w * 0.68;
  for (let i = 0; i < 9; i++) {
    const px = cx0 + (cx1 - cx0) * (i / 8) + (rnd() - 0.5) * w * 0.03;
    const pw = w * (0.02 + rnd() * 0.03);
    const pTop = h * (0.10 + rnd() * 0.22);
    const pBot = h * (0.78 + rnd() * 0.16);
    const gr = g.createLinearGradient(0, pTop, 0, pBot);
    gr.addColorStop(0, "rgba(52,42,36,0.85)");
    gr.addColorStop(1, "rgba(70,58,48,0.5)");
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(px, pTop);
    g.quadraticCurveTo(px - pw, pTop + (pBot - pTop) * 0.5, px - pw * 0.6, pBot);
    g.lineTo(px + pw * 0.6, pBot);
    g.quadraticCurveTo(px + pw, pTop + (pBot - pTop) * 0.5, px, pTop);
    g.closePath();
    g.fill();
  }
  // 기암 사이 안개 계곡(밝은 비단 노출)
  g.fillStyle = "rgba(205,180,140,0.5)";
  g.fillRect(cx0, h * 0.5, cx1 - cx0, h * 0.5);

  // (우 68~100%) 복사꽃 언덕 — 둥근 산자락 + 분홍 점묘 꽃나무
  const gx0 = w * 0.68;
  g.fillStyle = ink(0.2);
  g.beginPath();
  g.moveTo(gx0, h);
  g.quadraticCurveTo(w * 0.82, h * 0.55, w * 0.9, h * 0.66);
  g.quadraticCurveTo(w * 0.96, h * 0.74, w, h * 0.6);
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  for (let i = 0; i < 220; i++) {
    const tx = gx0 + rnd() * (w - gx0);
    const ty = h * (0.5 + rnd() * 0.42);
    const t = PETAL_TONES[(rnd() * PETAL_TONES.length) | 0];
    g.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${0.5 + rnd() * 0.4})`;
    g.beginPath();
    g.arc(tx, ty, 1.5 + rnd() * 3, 0, 6.283);
    g.fill();
  }
}

// 안개 띠(층 경계 은폐 + 대기 원근) 배치
function buildMist() {
  mist = SEAMS.map((vc, i) => ({
    vc,
    half: 0.055 + i * 0.015,
    baseA: 0.4 - i * 0.06,
    drift: 10 + i * 6,
    w: (Math.PI * 2) / (13 + i * 5),
    phase: i * 2.3,
    dir: i % 2 ? -1 : 1,
    ox: 0,
  }));
}

// 층의 화면 가로 오프셋 — 가운데 앵커(양끝에서만 어긋나 시차, 중앙에선 완전 정렬)
function layerOX(f) {
  return -((camX - camMid) * f + camMid);
}

// ---- 복사꽃잎 ----
function getPetal() {
  for (let i = 0; i < petals.length; i++) if (!petals[i].alive) return petals[i];
  if (petals.length < MAX_PETALS) { const p = {}; petals.push(p); return p; }
  return null;
}
function initPetal(p, x, y, vx, vy) {
  p.alive = true;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.rot = Math.random() * 6.283;
  p.vr = (Math.random() - 0.5) * 3;
  p.sz = 4 + Math.random() * 5;
  p.sway = Math.random() * 6.283;
  p.swaySpd = 1.5 + Math.random() * 2;
  p.life = 0; p.maxLife = 6 + Math.random() * 5;
  p.tone = PETAL_TONES[(Math.random() * PETAL_TONES.length) | 0];
  p.alpha = 0.7 + Math.random() * 0.3;
}
// 도원 상공에서 자연 낙화
function spawnDrift() {
  const p = getPetal();
  if (!p) return;
  const x = Math.random() * W;
  const y = -10 - Math.random() * 30;
  initPetal(p, x, y, 12 + Math.random() * 26, 14 + Math.random() * 20);
}
// 클릭 = 꽃잎 버스트(방사)
function burst(x, y) {
  const n = reduced ? 14 : 26;
  for (let i = 0; i < n; i++) {
    const p = getPetal();
    if (!p) break;
    const a = (i / n) * 6.283 + Math.random();
    const sp = 60 + Math.random() * 160;
    initPetal(p, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 30);
  }
}
function updatePetals(cdt, wind) {
  for (let i = 0; i < petals.length; i++) {
    const p = petals[i];
    if (!p.alive) continue;
    p.life += cdt;
    p.sway += p.swaySpd * cdt;
    p.vx += (wind - p.vx) * 0.4 * cdt;          // 바람으로 서서히 수렴
    p.vy += 40 * cdt;                            // 중력(살랑)
    p.vy = Math.min(p.vy, 70);
    p.x += (p.vx + Math.sin(p.sway) * 22) * cdt; // 나풀나풀 좌우 흔들림
    p.y += p.vy * cdt;
    p.rot += p.vr * cdt;
    if (p.y > H + 20 || p.x < -30 || p.x > W + 30 || p.life > p.maxLife) p.alive = false;
  }
}
function drawPetals() {
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < petals.length; i++) {
    const p = petals[i];
    if (!p.alive) continue;
    let a = p.alpha;
    const fade = p.maxLife - p.life;
    if (fade < 1.2) a *= clamp01(fade / 1.2);    // 수명 끝 페이드아웃
    if (a <= 0.01) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = a;
    ctx.fillStyle = `rgb(${p.tone[0]},${p.tone[1]},${p.tone[2]})`;
    // 복사꽃잎: 끝이 살짝 파인 타원(두 호로 근사)
    ctx.beginPath();
    ctx.moveTo(0, -p.sz);
    ctx.quadraticCurveTo(p.sz * 0.8, -p.sz * 0.3, p.sz * 0.35, p.sz);
    ctx.quadraticCurveTo(0, p.sz * 0.6, -p.sz * 0.35, p.sz);
    ctx.quadraticCurveTo(-p.sz * 0.8, -p.sz * 0.3, 0, -p.sz);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---- 안개 띠(층 경계 위) ----
function drawMist(cdt) {
  const flow = reduced ? 0.5 : 1;
  const [mr, mg, mb] = SILK_RGB;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let bi = 0; bi < mist.length; bi++) {
    const b = mist[bi];
    b.ox += b.drift * b.dir * cdt * flow;
    const yc = marginTop + b.vc * baseH;
    const half = b.half * baseH;
    const blobR = half * 2.4;
    const step = blobR * 0.55;
    const n = Math.ceil((W + blobR * 2) / step) + 2;
    const pulse = 0.6 + 0.4 * Math.sin(T * b.w * flow + b.phase);
    const baseA = b.baseA * Math.max(0, pulse);
    for (let k = 0; k < n; k++) {
      const bx = ((k * step + b.ox) % (W + blobR * 2) + (W + blobR * 2)) % (W + blobR * 2) - blobR;
      const by = yc + Math.sin(bx * 0.01 + T * 0.4 * flow + b.phase) * half * 0.4;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, blobR);
      g.addColorStop(0, `rgba(${mr},${mg},${mb},${baseA})`);
      g.addColorStop(1, `rgba(${mr},${mg},${mb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, blobR, 0, 6.283);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- 족자 축(卷軸) 프레임 — 화면 좌우에 옅게 고정 ----
function drawRods() {
  const rw = clamp(Math.min(W, H) * 0.028, 14, 30);
  const knob = rw * 0.62;
  for (const side of [0, 1]) {
    const x = side === 0 ? 0 : W - rw;
    ctx.save();
    ctx.globalAlpha = 0.5;
    const g = ctx.createLinearGradient(x, 0, x + rw, 0);
    g.addColorStop(0, "#33241a");
    g.addColorStop(0.4, "#6e5236");
    g.addColorStop(0.55, "#8a6a45");
    g.addColorStop(1, "#33241a");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, rw, H);
    // 축 끝 놋쇠 마구리(상·하)
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#4a3422";                  // 놋쇠 마구리
    for (const cy of [knob * 0.7, H - knob * 0.7]) {
      ctx.beginPath();
      ctx.ellipse(x + rw / 2, cy, rw * 0.72, knob, 0, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    img = opts.assets && opts.assets.target ? opts.assets.target : null;
    MAX_PETALS = reduced ? 65 : 130;
    computeLayout(); buildBase(); buildMist();
    camX = 0; camV = 0; dragV = 0; idle = IDLE_DELAY; autoDir = 1;
    pressMoved = false; spawnAcc = 0;
    petals.length = 0;
  },

  tick(dt, ptr) {
    const cdt = Math.min(dt, 0.05);
    T += cdt;

    // ---- 카메라: 드래그 / 관성 / 자동 유람 / 양끝 이징 바운스 ----
    const dragging = ptr && ptr.down && ptr.inside;
    if (ptr && ptr.justDown) pressMoved = false;
    if (dragging) {
      if (Math.abs(ptr.dx) > 1.2) pressMoved = true;    // 실제로 움직였으면 드래그로 간주
      idle = 0;
      camX -= ptr.dx;                                   // 손가락 따라 두루마리를 편다
      if (cdt > 1e-4) {                                 // 0 나눗셈(NaN) 방어
        const v = -ptr.dx / cdt;                        // 손가락 속도(카메라 단위)
        dragV += (v - dragV) * 0.35;                    // 평활화(관성 시드)
      }
      camV = dragV;
    } else {
      idle += cdt;
      // 자동 유람: 유휴가 쌓이면 목표 속도로 부드럽게 수렴(좌↔우 왕복)
      if (idle > IDLE_DELAY && maxCam > 1) {
        const autoSpeed = (reduced ? 26 : 52) * autoDir;
        camV += (autoSpeed - camV) * clamp01(2.2 * cdt);
      } else {
        camV *= Math.pow(FRICTION, cdt * 60);           // 관성 마찰
      }
      camX += camV * cdt;
    }

    // 양끝 이징 바운스(스프링) — 넘어가면 부드럽게 되돌리고 방향 반전
    if (camX < 0) {
      camV += (0 - camX) * END_K * cdt;
      camV *= Math.pow(0.86, cdt * 60);
      camX += camV * cdt;
      if (Math.abs(camX) < 0.5 && camV <= 0) { camX = 0; camV = 0; }
      autoDir = 1;
    } else if (camX > maxCam) {
      camV += (maxCam - camX) * END_K * cdt;
      camV *= Math.pow(0.86, cdt * 60);
      camX += camV * cdt;
      if (Math.abs(camX - maxCam) < 0.5 && camV >= 0) { camX = maxCam; camV = 0; }
      autoDir = -1;
    }
    camX = clamp(camX, -W * 0.12, maxCam + W * 0.12);    // 바운스 여유

    // ---- 도원 근접도 ----
    // 도원은 화면 오른편에 나타나므로 뷰포트의 우측(0.72 지점)을 두루마리 진행 비율로 삼는다.
    // (뷰 중심을 쓰면 오른쪽 끝에서도 0.68까지밖에 안 닿아 도원이 과소평가됨)
    const viewFrac = baseW > 0 ? clamp01((camX + W * 0.72) / baseW) : 0;
    const garden = smooth((viewFrac - 0.6) / 0.28);      // 도원이 화면에 들면 0→1

    // 꽃잎 자연 낙화(도원에서만)
    if (garden > 0.02) {
      spawnAcc += garden * (reduced ? 8 : 18) * cdt;
      while (spawnAcc >= 1) { spawnDrift(); spawnAcc -= 1; }
    }
    // 탭(누른 자리에서 거의 안 움직이고 뗌) = 꽃잎 버스트 — 드래그 유람과 구분
    if (ptr && ptr.justUp && !pressMoved && ptr.inside) burst(ptr.x, ptr.y);

    const wind = 30 + garden * 40;                       // 도원일수록 바람이 강해짐
    updatePetals(cdt, wind);

    // ---- 렌더 ----
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    // 상하 한지 여백 + 전체 비단 바탕
    ctx.fillStyle = SILK;
    ctx.fillRect(0, 0, W, H);

    // 깊이 층: 각 층을 자기 세로 구간에 클립해 시차 오프셋으로 1회씩 그린다
    for (const L of LAYERS) {
      const y0 = marginTop + L.v0 * baseH;
      const y1 = marginTop + L.v1 * baseH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, W, y1 - y0);
      ctx.clip();
      ctx.drawImage(base, 0, 0, baseW, baseH, layerOX(L.f), marginTop, baseW, baseH);
      ctx.restore();
    }

    // 층 경계 안개(산세 절단 은폐 + 대기 원근)
    drawMist(cdt);

    // 복사꽃잎(도원)
    drawPetals();

    // 족자 축 프레임(좌우 고정)
    drawRods();

    // 은은한 상하 비네트(두루마리 가장자리 그늘)
    const vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, "rgba(40,30,20,0.28)");
    vg.addColorStop(marginTop / H, "rgba(40,30,20,0.05)");
    vg.addColorStop(1 - marginTop / H, "rgba(40,30,20,0.05)");
    vg.addColorStop(1, "rgba(40,30,20,0.3)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  },

  resize(w, h) {
    W = w; H = h;
    const frac = maxCam > 0 ? camX / maxCam : 0;         // 상대 위치 보존
    computeLayout(); buildBase(); buildMist();
    camX = clamp(frac * maxCam, 0, maxCam);
  },

  dispose() {
    ctx = null; bctx = null; base = null; img = null;
    mist = []; petals.length = 0;
  },
};
