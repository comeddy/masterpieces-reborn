// js/pieces/07-sunflowers.js
// After Van Gogh — Sunflowers (1888). 절차적 임파스토 정물화.
// 노란 임파스토 배경(오프스크린 베이크) + 도자기 화병 + 해바라기 12~14송이.
// 각 꽃은 개화도 bloom 0..1로 느리게 피고 시들며, 클릭 시 만개+꽃가루, 드래그 시 붓바람에 휨.

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let bg = null, bgCtx = null;          // 배경 임파스토 베이크용 오프스크린
let flowers = [], order = [], pollen = [];

const GOLDEN = 2.39996323;            // 황금각(라디안) — 해바라기 씨앗 나선
const GRAVITY = 340;                  // 꽃가루 낙하 가속도(px/s^2)

// ── 유틸 ──────────────────────────────────────────────
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// 세 성분 색 보간 → rgb 문자열
function mix3(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}

// ── 배경 굽기: 세로 임파스토 스트로크 ─────────────────
function bakeBackground() {
  bg = document.createElement("canvas");
  bg.width = Math.max(1, Math.round(W));
  bg.height = Math.max(1, Math.round(H));
  bgCtx = bg.getContext("2d");
  const g = bgCtx;
  g.fillStyle = "#c99a34";
  g.fillRect(0, 0, W, H);
  // 짧고 두꺼운 세로 획을 촘촘히 쌓아 임파스토 질감 생성
  g.lineCap = "round";
  const step = Math.max(6, W / 160);
  for (let x = -step; x < W + step; x += step) {
    for (let y = -10; y < H + 10; ) {
      const len = rnd(14, 42);
      const t = Math.random();                     // 밝기 흔들림
      const top = y < H * 0.66 ? t : t * 0.5;       // 상단은 더 밝은 노랑
      const col = [lerp(150, 240, top), lerp(120, 190, top), lerp(30, 60, top)];
      g.strokeStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
      g.lineWidth = rnd(3, step * 0.9);
      g.beginPath();
      g.moveTo(x + rnd(-2, 2), y);
      g.lineTo(x + rnd(-3, 3), y + len);
      g.stroke();
      y += len * rnd(0.5, 0.85);
    }
  }
}

// ── 꽃 데이터 생성(init 1회) ──────────────────────────
function makeFlowers() {
  flowers = [];
  const count = 13;                                // 12~14 사이
  const R = 0.33;                                  // 부케 퍼짐(S 단위)
  const seed = rnd(0, Math.PI * 2);
  for (let i = 0; i < count; i++) {
    const rr = R * Math.sqrt((i + 0.6) / count);
    const ang = i * GOLDEN + seed;
    flowers.push({
      ox: rr * Math.cos(ang) + rnd(-0.02, 0.02),   // 부케 중심 기준 오프셋(S 단위)
      oy: rr * Math.sin(ang) * 0.82 - 0.03 + rnd(-0.02, 0.02),
      baseSize: rnd(0.045, 0.07) * (1 - rr * 0.4), // 바깥쪽일수록 약간 작게
      petals: (14 + (Math.random() * 5 | 0)),
      phase: rnd(0, Math.PI * 2),                  // 생애주기 위상
      cycleSpeed: rnd(0.05, 0.11),                 // 느린 개화/시듦
      swayPhase: rnd(0, Math.PI * 2),
      wiggle: rnd(0.9, 1.1),
      bloom: rnd(0.3, 0.9),
      bend: 0, bendVel: 0,                          // 붓바람 휨(각도) + 각속도
      animating: false, animT: 0, animFrom: 0,      // 클릭 만개 애니메이션
      x: 0, y: 0, rad: 0,
    });
  }
}

// ── 레이아웃(init/resize): 화면 크기 반영 ─────────────
let vase = {};
function layout() {
  const S = Math.min(W, H);
  const bx = W * 0.5, by = H * 0.40;
  for (const f of flowers) {
    f.x = bx + f.ox * S;
    f.y = by + f.oy * S;
    f.rad = f.baseSize * S;
  }
  order = flowers.map((_, i) => i).sort((a, b) => flowers[a].y - flowers[b].y);
  vase = {
    cx: W * 0.5, mouthY: H * 0.585, tableY: H * 0.72,
    mouthHalf: S * 0.135, bodyHalf: S * 0.185, bottomHalf: S * 0.12,
  };
}

// ── 꽃 한 송이 그리기 ─────────────────────────────────
const C_GOLD = [247, 199, 44], C_DEEP = [212, 132, 26], C_BROWN = [118, 80, 44];
const C_DISK = [58, 38, 22], C_DISK2 = [104, 66, 30];

function drawFlower(f, lean) {
  const bloom = f.bloom;
  const droop = 1 - bloom;
  const hx = f.x + Math.sin(lean) * f.rad * 1.2;   // 바람에 옆으로
  const hy = f.y + droop * f.rad * 0.6;            // 시들면 고개 숙임
  const cR = f.rad * 0.55;                          // 중심 원판 반지름
  const pLen = f.rad * (0.5 + 0.8 * bloom);        // 꽃잎 길이 = 개화도 반영
  const sat = 0.35 + 0.65 * bloom;                  // 시들수록 갈색조

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean * 0.5);
  ctx.lineCap = "round";

  // 꽃잎: 중심각 배열, 각 꽃잎 = 2~3개의 굵은 곡선 획
  const pc = f.petals;
  for (let i = 0; i < pc; i++) {
    const a = (i / pc) * Math.PI * 2 + f.swayPhase * 0.1;
    const jitter = ((i * 928.71) % 1) - 0.5;        // 꽃잎별 미세 변주
    const len = pLen * (0.9 + jitter * 0.18);
    const t = clamp(sat + jitter * 0.12, 0, 1);
    const base = jitter > 0.15 ? mix3(C_BROWN, C_DEEP, t) : mix3(C_BROWN, C_GOLD, t);
    drawPetal(a, cR * 0.85, cR + len, f.rad * 0.11, base);
  }

  // 중심 원판: 갈색 점묘 나선(황금각 phyllotaxis)
  ctx.fillStyle = mix3(C_DISK, C_DISK2, 0.2 + droop * 0.3);
  ctx.beginPath(); ctx.arc(0, 0, cR, 0, Math.PI * 2); ctx.fill();
  const dots = Math.min(90, Math.max(24, (cR * cR * 0.12) | 0));
  for (let k = 0; k < dots; k++) {
    const dr = cR * 0.94 * Math.sqrt(k / dots);
    const da = k * GOLDEN;
    const dx = dr * Math.cos(da), dy = dr * Math.sin(da);
    ctx.fillStyle = (k & 1) ? mix3(C_DISK, C_DISK2, 0.85) : mix3(C_DISK, [30, 18, 8], 0.5);
    const s = cR * 0.09;
    ctx.beginPath(); ctx.arc(dx, dy, s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// 꽃잎 하나: 중심각 a 방향으로 뻗는 3개의 굵은 곡선 획 + 1px 에지 하이라이트
function drawPetal(a, r0, r1, halfW, colBase) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const px = -sa, py = ca;                          // 수직 방향(폭)
  const curl = (((a * 53.13) % 1) - 0.5) * 0.5;     // 살짝 휘어짐
  for (let k = -1; k <= 1; k++) {
    const off = k * halfW * 0.55;
    const taper = 1 - Math.abs(k) * 0.22;           // 바깥 획은 짧게 → 뾰족한 끝
    const sx = ca * r0 + px * off, sy = sa * r0 + py * off;
    const ex = ca * (r0 + (r1 - r0) * taper) + px * off * 0.4;
    const ey = sa * (r0 + (r1 - r0) * taper) + py * off * 0.4;
    const mx = ca * (r0 + r1) * 0.5 + px * (off + curl * halfW * 2);
    const my = sa * (r0 + r1) * 0.5 + py * (off + curl * halfW * 2);
    ctx.lineWidth = halfW * (k === 0 ? 1.1 : 0.8);
    ctx.strokeStyle = colBase;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
    // 임파스토 하이라이트: 1px 오프셋 밝은 에지
    ctx.lineWidth = Math.max(1, halfW * 0.28);
    ctx.strokeStyle = "rgba(255,246,196,0.55)";
    ctx.beginPath();
    ctx.moveTo(sx + px * 1 - 1, sy + py * 1 - 1);
    ctx.quadraticCurveTo(mx + px - 1, my + py - 1, ex - 1, ey - 1);
    ctx.stroke();
  }
}

// ── 화병 + 테이블 + 줄기 ──────────────────────────────
function drawVaseAndStems() {
  const v = vase, S = Math.min(W, H);
  // 테이블 라인(painterly)
  ctx.lineCap = "round";
  ctx.strokeStyle = "#8a5a1e";
  ctx.lineWidth = Math.max(4, S * 0.012);
  ctx.beginPath();
  ctx.moveTo(0, v.tableY + 2);
  ctx.quadraticCurveTo(W * 0.5, v.tableY - 4, W, v.tableY + 3);
  ctx.stroke();
  ctx.strokeStyle = "rgba(60,38,14,0.5)";
  ctx.lineWidth = Math.max(2, S * 0.006);
  ctx.beginPath(); ctx.moveTo(0, v.tableY + 10); ctx.lineTo(W, v.tableY + 12); ctx.stroke();

  // 줄기(꽃 뒤에 먼저): 화병 입구에서 각 꽃 머리로
  const R = 0.33;
  for (const i of order) {
    const f = flowers[i];
    const mx = v.cx + (f.ox / R) * v.mouthHalf * 0.6;
    const droop = 1 - f.bloom;
    const hx = f.x + Math.sin(f.bend) * f.rad * 1.2;
    const hy = f.y + droop * f.rad * 0.6 + f.rad * 0.5;
    ctx.strokeStyle = mix3([70, 96, 40], [96, 78, 36], droop);
    ctx.lineWidth = Math.max(2, f.rad * 0.14);
    ctx.beginPath();
    ctx.moveTo(mx, v.mouthY);
    ctx.quadraticCurveTo((mx + hx) * 0.5 + Math.sin(f.bend) * f.rad, (v.mouthY + hy) * 0.5, hx, hy);
    ctx.stroke();
  }

  // 화병 본체(윤곽 2~3획 + 채움)
  const cx = v.cx;
  ctx.beginPath();
  ctx.moveTo(cx - v.mouthHalf, v.mouthY);
  ctx.bezierCurveTo(cx - v.bodyHalf, v.mouthY + (v.tableY - v.mouthY) * 0.5,
    cx - v.bottomHalf, v.tableY, cx - v.bottomHalf, v.tableY);
  ctx.lineTo(cx + v.bottomHalf, v.tableY);
  ctx.bezierCurveTo(cx + v.bodyHalf, v.tableY, cx + v.bodyHalf, v.mouthY + (v.tableY - v.mouthY) * 0.5,
    cx + v.mouthHalf, v.mouthY);
  ctx.closePath();
  const grd = ctx.createLinearGradient(0, v.mouthY, 0, v.tableY);
  grd.addColorStop(0, "#f0d27a");
  grd.addColorStop(0.52, "#e6b94e");
  grd.addColorStop(0.54, "#b9822f");
  grd.addColorStop(1, "#9a6a26");
  ctx.fillStyle = grd; ctx.fill();
  // 윤곽 획
  ctx.strokeStyle = "#7a4e18"; ctx.lineWidth = Math.max(3, S * 0.009); ctx.stroke();
  // 입구 타원
  ctx.strokeStyle = "#7a4e18"; ctx.lineWidth = Math.max(2, S * 0.006);
  ctx.beginPath(); ctx.ellipse(cx, v.mouthY, v.mouthHalf, v.mouthHalf * 0.26, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#caa24a"; ctx.beginPath();
  ctx.ellipse(cx, v.mouthY, v.mouthHalf, v.mouthHalf * 0.26, 0, 0, Math.PI * 2); ctx.fill();
}

// ── 꽃가루 입자 ───────────────────────────────────────
function spawnPollen(x, y) {
  for (let i = 0; i < 20; i++) {
    pollen.push({
      x, y,
      vx: rnd(-90, 90),
      vy: -rnd(60, 210),                            // 위로 튀었다가 포물선 낙하
      life: 0, max: rnd(0.8, 1.6),
      size: rnd(1.4, 3.4),
    });
  }
  if (pollen.length > 220) pollen.splice(0, pollen.length - 220);
}
function updatePollen(dt) {
  for (let i = pollen.length - 1; i >= 0; i--) {
    const p = pollen[i];
    p.life += dt;
    if (p.life >= p.max) { pollen.splice(i, 1); continue; }
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const a = 1 - p.life / p.max;
    ctx.fillStyle = `rgba(255,${210 + (a * 30) | 0},70,${(a * 0.9).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
}

// ── 입력: 클릭 개화 / 드래그 붓바람 ───────────────────
function handleInput(ptr) {
  if (ptr.justDown && ptr.inside) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < flowers.length; i++) {
      const f = flowers[i];
      const hy = f.y + (1 - f.bloom) * f.rad * 0.6;
      const hx = f.x + Math.sin(f.bend) * f.rad * 1.2;
      const d = Math.hypot(ptr.x - hx, ptr.y - hy);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && bestD < flowers[best].rad * 1.6) {
      const f = flowers[best];
      f.animating = true; f.animT = 0; f.animFrom = f.bloom;   // 1.2초 만개
      spawnPollen(f.x + Math.sin(f.bend) * f.rad * 1.2, f.y - f.rad * 0.2);
    }
  }
  // 드래그 = 붓바람: 커서 근처 꽃에 각속도 임펄스
  if (ptr.down && ptr.inside && (Math.abs(ptr.dx) > 0.1 || Math.abs(ptr.dy) > 0.1)) {
    const R = Math.min(W, H) * 0.42;
    const push = clamp(ptr.dx, -60, 60) * (reduced ? 0.0003 : 0.0011);
    for (const f of flowers) {
      const d = Math.hypot(ptr.x - f.x, ptr.y - f.y);
      if (d < R) f.bendVel += push * (1 - d / R);
    }
  }
}

// ── 꽃 물리/생애주기 갱신 ─────────────────────────────
function updateFlowers(dt) {
  for (const f of flowers) {
    const natural = 0.5 + 0.5 * Math.sin(T * f.cycleSpeed + f.phase);
    if (f.animating) {
      f.animT += dt;
      const k = Math.min(f.animT / 1.2, 1);
      const e = 1 - Math.pow(1 - k, 3);              // easeOutCubic
      f.bloom = f.animFrom + (1 - f.animFrom) * e;
      if (f.animT > 1.2 + 2.6) f.animating = false;  // 만개 유지 후 자연 사이클 복귀
    } else {
      f.bloom += (natural - f.bloom) * Math.min(dt * 1.4, 1);
    }
    // 붓바람 각도 스프링 복귀
    f.bendVel += (-9.0 * f.bend - 3.2 * f.bendVel) * dt;
    f.bend += f.bendVel * dt;
    f.bend = clamp(f.bend, -0.6, 0.6);
  }
}

// ── 모듈 인터페이스 ───────────────────────────────────
export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    pollen = [];
    makeFlowers();
    layout();
    bakeBackground();
  },
  tick(dt, ptr) {
    T += dt;
    // 배경(구운 임파스토)
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    else { ctx.fillStyle = "#c99a34"; ctx.fillRect(0, 0, W, H); }

    if (ptr) handleInput(ptr);
    updateFlowers(dt);

    drawVaseAndStems();

    // 유휴 흔들림 포함 렌더 각도로 뒤→앞(위→아래) 순서로 그림
    for (const i of order) {
      const f = flowers[i];
      const sway = (reduced ? 0.25 : 1) * 0.05 * Math.sin(T * 1.1 * f.wiggle + f.swayPhase);
      drawFlower(f, f.bend + sway);
    }

    updatePollen(dt);
  },
  resize(w, h) {
    W = w; H = h;
    layout();
    bakeBackground();
  },
  dispose() {
    ctx = null; bg = null; bgCtx = null;
    flowers = []; order = []; pollen = [];
  },
};
