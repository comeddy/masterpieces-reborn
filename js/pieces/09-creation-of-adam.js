// js/pieces/09-creation-of-adam.js
// After Michelangelo — Creation of Adam (c.1512). 닿을 듯 닿지 않는 두 손끝의 간극에
// 커서를 가져가면 정전기가 충전되고, 간극을 이으면 생명의 불꽃이 방전된다.

const TWO_PI = Math.PI * 2;
const NEAR = 40;          // 손끝 선분 근접 판정(px)
const CHARGE_TIME = 1.5;  // 충전 완료 시간(초)
const IGNITE_TIME = 0.8;  // 대형 아크 방전 지속
const COOLDOWN_TIME = 3;  // 쿨다운
const WARM_TIME = 1.5;    // 이미지가 따뜻하게 밝아지는 시간

// 두 손끝 좌표(이미지 기준 u,v). 좌: 아담 검지 끝(좌하 손), 우: 신 검지 끝(우 손)
// 번들 이미지(1280×581 전체 프레스코)에서 실측한 두 손끝 — 화면 중앙 좌측에서 거의 맞닿는 지점
const LEFT_UV = { u: 0.378, v: 0.456 };
const RIGHT_UV = { u: 0.382, v: 0.450 };

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let img = null, fresco = null, fit = { x: 0, y: 0, w: 0, h: 0 };
let A = { x: 0, y: 0 }, B = { x: 0, y: 0 }; // 좌/우 손끝 스크린 좌표

let phase = "ready";      // ready | ignite | cooldown
let charge = 0, igniteT = 0, cooldownT = 0, warmT = 99, warmth = 0;
let tMin = 1, tMax = 0, awayT = 0; // 경로 주파(traverse) 추적
let near = false;
let idleTimer = 3, idleFlash = 0; // 유휴 정전기
let gold = [];            // 금빛 입자 풀

// ---- 기하 헬퍼 ----
function containFit(iw, ih, w, h, margin) {
  const s = Math.min((w * (1 - margin * 2)) / iw, (h * (1 - margin * 2)) / ih);
  const bw = iw * s, bh = ih * s;
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

// 점→선분 최근접 거리와 정규화 투영값 t(0..1)
function projSeg(px, py) {
  const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - A.x) * dx + (py - A.y) * dy) / l2));
  return { t, dist: Math.hypot(px - (A.x + dx * t), py - (A.y + dy * t)) };
}

function computeTips() {
  if (img) {
    fit = containFit(img.naturalWidth || img.width, img.naturalHeight || img.height, W, H, 0.06);
    A = { x: fit.x + LEFT_UV.u * fit.w, y: fit.y + LEFT_UV.v * fit.h };
    B = { x: fit.x + RIGHT_UV.u * fit.w, y: fit.y + RIGHT_UV.v * fit.h };
  } else {
    const cx = W / 2, cy = H / 2, gap = Math.min(W, H) * 0.09;
    fit = { x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.8 };
    A = { x: cx - gap, y: cy + gap * 0.5 }; // 아담: 아래에서
    B = { x: cx + gap, y: cy - gap * 0.5 }; // 신: 위에서
  }
}

// ---- 프레스코 질감: 노이즈 점 + 크랙 라인을 오프스크린에 한 번 굽는다 ----
function buildFresco(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  const g = c.getContext("2d");
  const dots = Math.min(9000, ((w * h) / 380) | 0);
  for (let i = 0; i < dots; i++) {
    const a = 0.03 + Math.random() * 0.06;
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,250,238,${a})` : `rgba(88,72,56,${a})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, Math.random() < 0.85 ? 0.6 : 1.5, 0, TWO_PI);
    g.fill();
  }
  const cracks = 5 + (Math.random() * 4 | 0);
  for (let i = 0; i < cracks; i++) {
    let x = Math.random() * w, y = Math.random() * h, ang = Math.random() * TWO_PI;
    g.strokeStyle = `rgba(58,46,36,${0.06 + Math.random() * 0.05})`;
    g.lineWidth = 0.6 + Math.random() * 0.7;
    g.beginPath(); g.moveTo(x, y);
    const segs = 6 + (Math.random() * 8 | 0);
    for (let s = 0; s < segs; s++) {
      ang += (Math.random() - 0.5) * 1.1;
      x += Math.cos(ang) * (20 + Math.random() * 40);
      y += Math.sin(ang) * (20 + Math.random() * 40);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}
function ensureFresco() { if (!fresco) fresco = buildFresco(W, H); }

// ---- 절차적 두 손 실루엣 (이미지 null 폴백) ----
function drawArmHand(tipX, tipY, fromX, fromY, armW, fill, shade) {
  const dx = fromX - tipX, dy = fromY - tipY, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux;
  const hx = tipX + ux * armW * 1.4, hy = tipY + uy * armW * 1.4; // 손등 중심
  const grad = ctx.createLinearGradient(tipX, tipY, fromX, fromY);
  grad.addColorStop(0, fill); grad.addColorStop(1, shade);
  ctx.fillStyle = grad; ctx.strokeStyle = grad;
  ctx.lineWidth = armW; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fromX, fromY); ctx.stroke();
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.atan2(uy, ux));
  ctx.beginPath(); ctx.ellipse(0, 0, armW * 0.78, armW * 0.62, 0, 0, TWO_PI); ctx.fill(); ctx.restore();
  // 검지: 손등 → 손끝 (베지어 채움 실루엣)
  ctx.beginPath();
  ctx.moveTo(hx + px * armW * 0.28, hy + py * armW * 0.28);
  ctx.quadraticCurveTo((hx + tipX) / 2 + px * armW * 0.12, (hy + tipY) / 2 + py * armW * 0.12, tipX, tipY);
  ctx.quadraticCurveTo((hx + tipX) / 2 - px * armW * 0.12, (hy + tipY) / 2 - py * armW * 0.12,
    hx - px * armW * 0.28, hy - py * armW * 0.28);
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) { // 말린 나머지 손가락
    const off = (i - 1) * armW * 0.34;
    ctx.beginPath();
    ctx.arc(hx + px * off - ux * armW * 0.22, hy + py * off - uy * armW * 0.22, armW * 0.22, 0, TWO_PI);
    ctx.fill();
  }
}
function drawProceduralHands() {
  const armW = Math.min(W, H) * 0.12;
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  drawArmHand(A.x, A.y, -W * 0.05, H * 1.1, armW, "#c9a17a", "#7d5a3c");   // 아담(좌하단)
  drawArmHand(B.x, B.y, W * 1.05, -H * 0.05, armW * 1.04, "#d4ac86", "#8a6242"); // 신(우상단)
  ctx.restore();
}

// ---- 스파크(지지직 폴리라인) ----
function boltPoints(ax, ay, bx, by, segs, amp) {
  const pts = [{ x: ax, y: ay }];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < segs; i++) {
    const t = i / segs, o = (Math.random() - 0.5) * amp * Math.sin(Math.PI * t); // 양끝 고정
    pts.push({ x: ax + dx * t + nx * o, y: ay + dy * t + ny * o });
  }
  pts.push({ x: bx, y: by });
  return pts;
}
function strokePoly(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}
function drawBolt(ax, ay, bx, by, amp, width, color, glow, segs) {
  const pts = boltPoints(ax, ay, bx, by, segs, amp);
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = glow; ctx.shadowBlur = width * 4;
  ctx.strokeStyle = color; ctx.lineWidth = width; strokePoly(pts);
  ctx.shadowBlur = width * 2; // 밝은 코어
  ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = width * 0.4; strokePoly(pts);
  ctx.restore();
  return pts;
}
function drawChargeSparks(P) {
  const amp = (reduced ? 3 : 8) * (0.4 + charge), w = 1 + charge * 1.6;
  const col = `rgba(180,200,255,${0.5 + charge * 0.4})`, glow = "rgba(120,170,255,0.9)";
  for (const tip of [A, B]) {
    const main = drawBolt(tip.x, tip.y, P.x, P.y, amp, w, col, glow, 8 + (charge * 6 | 0));
    const nb = reduced ? 1 : 2; // 잔가지
    for (let i = 0; i < nb; i++) {
      const s = main[1 + (Math.random() * (main.length - 2) | 0)];
      drawBolt(s.x, s.y, s.x + (Math.random() - 0.5) * 44, s.y + (Math.random() - 0.5) * 44,
        amp * 0.6, w * 0.6, col, glow, 4);
    }
  }
}
function drawArcDischarge() {
  const fade = 1 - igniteT / IGNITE_TIME;
  const amp = (reduced ? 8 : 22) * (0.5 + fade * 0.8), w = 2.5 + fade * 3;
  const main = drawBolt(A.x, A.y, B.x, B.y, amp, w,
    `rgba(255,240,200,${0.6 + fade * 0.4})`, "rgba(255,210,120,1)", reduced ? 10 : 16);
  const nb = reduced ? 2 : 4;
  for (let i = 0; i < nb; i++) {
    const s = main[1 + (Math.random() * (main.length - 2) | 0)];
    drawBolt(s.x, s.y, s.x + (Math.random() - 0.5) * 70, s.y + (Math.random() - 0.5) * 70,
      amp * 0.7, w * 0.55, "rgba(255,236,190,0.85)", "rgba(255,200,110,0.9)", 5);
  }
}
function drawTipGlow() {
  for (const tip of [A, B]) {
    const r = (3 + charge * 4 + (phase === "ignite" ? 6 : 0)) * 3;
    const a = 0.22 + charge * 0.5 + (phase === "ignite" ? 0.3 : 0);
    const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, r);
    g.addColorStop(0, `rgba(205,222,255,${a})`); g.addColorStop(1, "rgba(205,222,255,0)");
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip.x, tip.y, r, 0, TWO_PI); ctx.fill(); ctx.restore();
  }
}

// ---- 금빛 입자 ----
function spawnGold(n, x, y) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TWO_PI, sp = (reduced ? 30 : 60) + Math.random() * (reduced ? 60 : 170);
    gold.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.8 + Math.random() * 1.3, size: 1 + Math.random() * 2.5 });
  }
}
function stepGold(dt) {
  for (let i = gold.length - 1; i >= 0; i--) {
    const p = gold[i]; p.life += dt;
    if (p.life >= p.max) { gold.splice(i, 1); continue; }
    p.vx *= 0.96; p.vy *= 0.96; p.vy += 22 * dt; // 약한 중력
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}
function drawGold() {
  if (!gold.length) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const p of gold) {
    const k = 1 - p.life / p.max;
    ctx.fillStyle = `rgba(255,${190 + (60 * k | 0)},${90 + (70 * k | 0)},${k})`;
    ctx.shadowColor = "rgba(255,200,120,0.9)"; ctx.shadowBlur = 6 * k + 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k + 0.4, 0, TWO_PI); ctx.fill();
  }
  ctx.restore();
}

// ---- 상태 전이 ----
function envelope(t) {
  if (t < 0.2) return t / 0.2;
  if (t < 0.8) return 1;
  if (t < WARM_TIME) return 1 - (t - 0.8) / (WARM_TIME - 0.8);
  return 0;
}
function ignite() {
  phase = "ignite"; igniteT = 0; warmT = 0; charge = 1;
  spawnGold(reduced ? 40 : 110, (A.x + B.x) / 2, (A.y + B.y) / 2);
}
function updateState(dt, P) {
  near = false; let t = 0;
  if (P) { const r = projSeg(P.x, P.y); near = r.dist < NEAR; t = r.t; }
  if (phase === "ready") {
    if (near) {
      charge = Math.min(1, charge + dt / CHARGE_TIME);
      tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); awayT = 0;
    } else {
      charge = Math.max(0, charge - dt * 0.9);
      awayT += dt; if (awayT > 0.4) { tMin = 1; tMax = 0; }
    }
    if (charge >= 1 || (near && tMin < 0.12 && tMax > 0.88)) ignite();
    idleTimer -= dt; if (idleFlash > 0) idleFlash -= dt;
    if (idleTimer <= 0) { idleFlash = 0.1 + Math.random() * 0.12; idleTimer = 2 + Math.random() * 3; }
  } else if (phase === "ignite") {
    warmT += dt; igniteT += dt;
    if (igniteT >= IGNITE_TIME) { phase = "cooldown"; cooldownT = 0; charge = 0; }
  } else {
    warmT += dt; cooldownT += dt; charge = Math.max(0, charge - dt * 2);
    if (cooldownT >= COOLDOWN_TIME) { phase = "ready"; tMin = 1; tMax = 0; }
  }
  warmth = envelope(warmT);
}
function drawWarmth() {
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, rad = Math.max(fit.w, fit.h) * 0.6;
  const g = ctx.createRadialGradient(mx, my, 0, mx, my, rad);
  g.addColorStop(0, `rgba(255,214,150,${warmth * 0.5})`); g.addColorStop(1, "rgba(255,214,150,0)");
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion;
    img = (opts.assets && opts.assets.target) || null;
    T = 0; phase = "ready"; charge = 0; igniteT = 0; cooldownT = 0; warmT = 99; warmth = 0;
    tMin = 1; tMax = 0; awayT = 0; near = false;
    idleTimer = 2 + Math.random() * 3; idleFlash = 0; gold = []; fresco = null;
    computeTips();
  },

  tick(dt, ptr) {
    T += dt;
    ensureFresco();
    // 배경: 프레스코 크림-회색
    ctx.fillStyle = "#d8cfbd"; ctx.fillRect(0, 0, W, H);
    // 이미지 contain-fit 또는 절차적 두 손
    if (img) ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
    else drawProceduralHands();
    // 프레스코 질감 오버레이
    if (fresco) { ctx.globalAlpha = 0.55; ctx.drawImage(fresco, 0, 0); ctx.globalAlpha = 1; }

    const P = ptr && ptr.inside ? ptr : null;
    updateState(dt, P);
    if (warmth > 0.001) drawWarmth(); // 이미지가 따뜻하게 밝아짐

    // 효과 렌더
    if (phase === "ready") {
      if (P && near && charge > 0.01) drawChargeSparks(P);
      else if (idleFlash > 0) // 유휴 미세 정전기
        drawBolt(A.x, A.y, B.x, B.y, reduced ? 2 : 5, 0.8,
          `rgba(170,190,255,${Math.min(0.45, idleFlash * 3)})`, "rgba(120,170,255,0.7)", 6);
    } else if (phase === "ignite") {
      drawArcDischarge();
    }
    stepGold(dt); drawGold();
    drawTipGlow();
  },

  resize(w, h) { W = w; H = h; fresco = null; computeTips(); },

  dispose() { ctx = null; img = null; fresco = null; gold = []; },
};
