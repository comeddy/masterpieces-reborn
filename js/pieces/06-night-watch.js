// js/pieces/06-night-watch.js
// After Rembrandt — The Night Watch (1642) · 키아로스쿠로
// 원작 이미지를 오프스크린 A에 contain-fit으로 그려두고, 커서 등불은
// 오프스크린 B의 방사형 그라데이션 마스크로 이미지를 국소 리빌한다.

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let img = null;                 // 원작 이미지 (없으면 null → 절차적 폴백)
let A = null, actx = null;      // 오프스크린 A: 명화 또는 절차적 장면
let B = null, bctx = null;      // 오프스크린 B: 등불 마스크 스크래치
let fit = { x: 0, y: 0, w: 0, h: 0 };

let lx = 0, ly = 0;             // 부드럽게 따라오는 등불 좌표
let flash = 0;                  // 화약 섬광 잔여 시간(초)
let travel = 0;                 // 이동 누적 (잔광 스팟 스폰용)
const spots = [];               // 잔광 스팟 (최대 5, 3초 페이드)
let dust = [];                  // 미세 먼지 입자

const BASE_R = 140;             // 기본 등불 반경(px)
const MARGIN = 0.06;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}

// 원작 종횡비를 화면에 contain-fit
function computeFit() {
  let iw = img ? (img.naturalWidth || img.width) : 0;
  let ih = img ? (img.naturalHeight || img.height) : 0;
  if (iw <= 0 || ih <= 0) { iw = 1000; ih = 820; } // Night Watch 가로형 근사
  const bw = W * (1 - MARGIN * 2), bh = H * (1 - MARGIN * 2);
  const s = Math.min(bw / iw, bh / ih);
  const w = iw * s, h = ih * s;
  fit = { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// A 오프스크린 갱신: 이미지 또는 절차적 장면
function paintA() {
  actx.clearRect(0, 0, W, H);
  if (img) actx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
  else proceduralScene();
}

// 절차적 폴백: 어둠 속 인물 실루엣 8개 + 옷깃 하이라이트
function proceduralScene() {
  const { x, y, w, h } = fit;
  const bg = actx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, "#241a12");
  bg.addColorStop(0.6, "#1a1109");
  bg.addColorStop(1, "#0d0805");
  actx.fillStyle = bg;
  actx.fillRect(x, y, w, h);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const fxc = x + w * (0.1 + t * 0.8);
    const scale = 0.82 + ((i * 37) % 10) / 30;
    const fh = h * 0.66 * scale;
    const fw = fh * 0.32;
    const fy = y + h - fh - h * 0.04 * (i % 3);
    drawFigure(fxc, fy, fw, fh, i);
  }
}

function drawFigure(cx, top, w, h, i) {
  const hw = w / 2;
  // 망토 실루엣
  actx.fillStyle = "#0a0705";
  actx.beginPath();
  actx.moveTo(cx - hw, top + h);
  actx.lineTo(cx - hw * 0.7, top + h * 0.28);
  actx.quadraticCurveTo(cx, top + h * 0.16, cx + hw * 0.7, top + h * 0.28);
  actx.lineTo(cx + hw, top + h);
  actx.closePath();
  actx.fill();
  // 머리
  actx.fillStyle = "#120c08";
  actx.beginPath();
  actx.arc(cx, top + h * 0.16, w * 0.22, 0, 6.283);
  actx.fill();
  // 옷깃/러프 하이라이트 — 밝게 두어 등불에 드러남
  actx.strokeStyle = i % 2 === 0 ? "rgba(226,196,140,0.9)" : "rgba(200,170,120,0.75)";
  actx.lineWidth = Math.max(1.5, w * 0.09);
  actx.beginPath();
  actx.moveTo(cx - hw * 0.55, top + h * 0.30);
  actx.quadraticCurveTo(cx, top + h * 0.24, cx + hw * 0.55, top + h * 0.30);
  actx.stroke();
  // 얼굴 하이라이트
  actx.fillStyle = "rgba(210,175,130,0.5)";
  actx.beginPath();
  actx.arc(cx + w * 0.03, top + h * 0.15, w * 0.12, 0, 6.283);
  actx.fill();
}

function initDust() {
  const n = Math.round(Math.min(140, (W * H) / 9000));
  dust = new Array(n);
  for (let i = 0; i < n; i++) {
    dust[i] = {
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 6, vy: -6 - Math.random() * 10,
      ph: Math.random() * 6.28, sz: 0.6 + Math.random() * 1.4,
    };
  }
}

// 등불 마스크: 중심 불투명 → 가장자리 투명 (source-in용, 흰색으로 색 보존)
function drawLamp(c, x, y, r, intensity) {
  const a = Math.max(0, Math.min(1, intensity));
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
  g.addColorStop(0.55, `rgba(255,255,255,${0.5 * a})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

// 따뜻한 촛불 색온 오버레이
function drawWarm(x, y, r, intensity) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,190,90,${0.1 * intensity})`);
  g.addColorStop(1, "rgba(255,190,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function renderDust(cx, cy, R, dt) {
  const drift = reduced ? 0.3 : 1;
  for (const p of dust) {
    p.x += (p.vx + Math.sin(T * 0.8 + p.ph) * 3) * dt * drift;
    p.y += p.vy * dt * drift;
    if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
    if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > R) continue;                       // 등불 반경 안에서만 보임
    ctx.fillStyle = `rgba(255,224,170,${(1 - d / R) * 0.5})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.sz, 0, 6.283);
    ctx.fill();
  }
}

function drawVignette() {
  const g = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.35,
    W / 2, H / 2, Math.max(W, H) * 0.72,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function render(cx, cy, R, dt) {
  // (0) 거의 검정 배경
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, W, H);

  // (1) 이미지를 희미하게 깔기 (0.10~0.14 은은한 숨결)
  ctx.globalAlpha = 0.12 + Math.sin(T * 0.7) * 0.02;
  ctx.drawImage(A, 0, 0, W, H);
  ctx.globalAlpha = 1;

  // (2) 등불 마스크 합성 → B에 그라데이션을 모으고 A를 source-in
  bctx.globalCompositeOperation = "source-over";
  bctx.clearRect(0, 0, W, H);
  bctx.globalCompositeOperation = "lighter";
  drawLamp(bctx, cx, cy, R, 1);                       // 메인 등불
  for (const s of spots) drawLamp(bctx, s.x, s.y, R * 0.6, s.life * 0.5); // 잔광
  bctx.globalCompositeOperation = "source-in";
  bctx.drawImage(A, 0, 0, W, H);                       // 명화를 마스크에 끼움
  bctx.globalCompositeOperation = "source-over";
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(B, 0, 0, W, H);                        // 메인에 가산

  // 따뜻한 등불빛 오버레이
  drawWarm(cx, cy, R, 1);
  for (const s of spots) drawWarm(s.x, s.y, R * 0.6, s.life * 0.5);

  // (3) 먼지 — 등불 반경 안에서만
  renderDust(cx, cy, R, dt);

  // 비네트
  ctx.globalCompositeOperation = "source-over";
  drawVignette();
  ctx.globalAlpha = 1;
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    img = opts.assets && opts.assets.target ? opts.assets.target : null;
    A = makeCanvas(W, H); actx = A.getContext("2d");
    B = makeCanvas(W, H); bctx = B.getContext("2d");
    computeFit(); paintA();
    lx = W * 0.5; ly = H * 0.5;
    flash = 0; travel = 0; spots.length = 0;
    initDust();
  },

  tick(dt, ptr) {
    T += dt;
    const cdt = Math.min(dt, 0.05);

    // 1) 등불이 부드럽게 따라옴 (lerp 0.12 @60fps, dt 보정)
    const tx = ptr.inside ? ptr.x : lx;
    const ty = ptr.inside ? ptr.y : ly;
    const a = 1 - Math.pow(1 - 0.12, cdt * 60);
    const nlx = lx + (tx - lx) * a;
    const nly = ly + (ty - ly) * a;
    travel += Math.hypot(nlx - lx, nly - ly);
    lx = nlx; ly = nly;

    // 지나간 자리에 잔광 스팟 (최대 5)
    if (ptr.inside && travel > 46) {
      travel = 0;
      spots.push({ x: lx, y: ly, life: 1 });
      if (spots.length > 5) spots.shift();
    }
    for (let i = spots.length - 1; i >= 0; i--) {
      spots[i].life -= dt / 3;                 // 3초 페이드
      if (spots[i].life <= 0) spots.splice(i, 1);
    }

    // 2) 클릭 = 화약 섬광 (0.5초간 반경 확장 후 수축)
    if (ptr.justDown) flash = 0.5;
    if (flash > 0) flash = Math.max(0, flash - dt);
    const peak = reduced ? 1.5 : 3;
    let rmul = 1;
    if (flash > 0) rmul = 1 + (peak - 1) * Math.sin((1 - flash / 0.5) * Math.PI);

    // 촛불 플리커: 반경·중심을 노이즈로 미세하게 흔들기
    const fl = reduced ? 0.03 : 0.1;
    const flick = 1 + fl * (Math.sin(T * 11) * 0.6 + Math.sin(T * 23.3) * 0.4);
    const jx = reduced ? 0 : Math.sin(T * 9.1) * 2.2 + Math.sin(T * 17) * 1.3;
    const jy = reduced ? 0 : Math.cos(T * 8.3) * 2.2 + Math.cos(T * 15.7) * 1.3;
    const base = Math.min(BASE_R, Math.min(W, H) * 0.34);
    const R = base * flick * rmul;

    render(lx + jx, ly + jy, R, cdt);
  },

  resize(w, h) {
    W = w; H = h;
    A.width = W; A.height = H;
    B.width = W; B.height = H;
    computeFit(); paintA();
    initDust();
  },

  dispose() {
    ctx = null; actx = null; bctx = null;
    A = null; B = null; img = null;
    spots.length = 0; dust = [];
  },
};
