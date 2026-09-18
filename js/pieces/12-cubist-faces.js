// js/pieces/12-cubist-faces.js — Hommage à Picasso, "Simultaneous Faces" (동시의 얼굴)
// 특정 피카소 작품을 복제하지 않는 큐비즘 *스타일 오마주*. 한 얼굴을 여러 시점에서
// 동시에 본다는 큐비즘의 일반 어법만 사용: 다시점 동시성, 면(facet) 분할, 정면 눈+측면 눈
// 공존, 옆모습 코, 이중 입, 면마다 다른 시점 음영, 검정 굵은 윤곽 + 종합적 큐비즘 팔레트,
// 콜라주 질감(신문 스트라이프·도트·해칭 — 절차 패턴, 텍스트 없음). 100% 절차적·무음·무에셋.
// 클릭=면들이 흩어졌다 새 시드로 재조립. 드래그=커서 주변 면 밀림·기울기(스프링 안착).
// 유휴=느린 호흡 + 시점 혼합 비율 진동. reducedMotion: 재조립 전이·호흡 감쇠.

let W = 0, H = 0, ctx = null, T = 0, reduced = false;

// ---- 종합적 큐비즘 팔레트: 검정 윤곽 + 빨강·파랑·노랑·크림·회갈 ----
const BLACK = "#16110f";
const CREAM = ["#efe4c6", "#f4eeda", "#e6d6ad"];
const GREYB = ["#8b7358", "#6d5a44", "#a89178"];   // 회갈(warm grey-brown)
const RED = ["#c5341f", "#8f2417"];
const BLUE = ["#2f5c9e", "#1e3c68", "#6f9ac8"];
const YELLOW = ["#e6b229", "#f0cf6b"];
// 면 색 가중 풀: 크림·회갈이 우세하고 원색은 강조로
const POOL = [...CREAM, ...CREAM, ...GREYB, ...GREYB, RED[0], RED[1], BLUE[0], BLUE[1], BLUE[2], YELLOW[0], YELLOW[1], CREAM[2], GREYB[0]];
const TEX = ["", "", "", "stripe", "dot", "hatch"];  // 다수는 평면, 일부만 콜라주 질감

// ---- 유틸 ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (c, t, r, dt) => c + (t - c) * (1 - Math.exp(-r * dt));
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- 카메라 손짓 판정 상태 기계 (순수, node:test 대상) ----
// 손 x좌표(0..1)의 좌우 방향 반전을 세어 "흔들기"를 판정한다. 단방향 스침·
// 몸 전체 이동은 반전이 없어 발화하지 않는다. 발화 후 WAVE_COOL 쿨다운,
// 손 미검출은 HAND_GRACE 유예로 랜드마커 프레임 드랍을 흡수한다.
export const WAVE_WINDOW = 1.2;   // 마지막 스윙 이후 유효 시간창(s)
export const WAVE_SWINGS = 2;     // 발화에 필요한 방향 반전 횟수
export const WAVE_MIN_VX = 0.25;  // 스윙으로 인정하는 최소 |x속도|(정규화폭/s)
export const WAVE_COOL = 1.6;     // 발화 후 쿨다운(s)
export const HAND_GRACE = 0.25;   // 손 미검출 유예(s)

export function makeWave() {
  return { lastX: -1, dir: 0, swings: 0, windowT: 0, coolT: 0, graceT: 0 };
}

export function waveStep(w, x, present, dt) {
  w.coolT = Math.max(0, w.coolT - dt);
  if (!present) {                          // 미검출: 유예 초과 시 스윙 상태 리셋
    w.graceT += dt;
    if (w.graceT >= HAND_GRACE) { w.lastX = -1; w.dir = 0; w.swings = 0; w.windowT = 0; }
    return { fire: false };
  }
  w.graceT = 0;
  if (w.lastX < 0 || dt <= 0) { w.lastX = x; return { fire: false }; }  // 첫 프레임: 기준점만
  const vx = (x - w.lastX) / dt;
  w.lastX = x;
  if (w.dir !== 0) {                       // 제스처 진행 중에만 시간창이 흐른다
    w.windowT += dt;
    if (w.windowT > WAVE_WINDOW) { w.swings = 0; w.dir = 0; w.windowT = 0; }
  }
  if (Math.abs(vx) >= WAVE_MIN_VX) {
    const d = vx > 0 ? 1 : -1;
    if (w.dir === 0) { w.dir = d; w.windowT = 0; }            // 첫 유효 이동: 방향만 설정
    else if (d !== w.dir) { w.dir = d; w.swings++; w.windowT = 0; }  // 반전 = 스윙 1회
  }
  if (w.swings >= WAVE_SWINGS && w.coolT <= 0) {
    w.swings = 0; w.dir = 0; w.coolT = WAVE_COOL;
    return { fire: true };
  }
  return { fire: false };
}

function centroid(p) { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length]; }
function area(p) { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const j = (i + 1) % n; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(a) / 2; }
function bbox(p) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const q of p) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); } return { x: a, y: b, w: c - a, h: d - b }; }
function tracePath(p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
// 볼록 폴리곤을 직선(법선 nx,ny · 값 d)으로 둘로 자른다 → [pos, neg]
function splitByLine(poly, nx, ny, d) {
  const pos = [], neg = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = nx * a[0] + ny * a[1] - d, sb = nx * b[0] + ny * b[1] - d;
    if (sa >= 0) pos.push(a); else neg.push(a);
    if ((sa > 0) !== (sb > 0)) {
      const t = sa / (sa - sb), ix = a[0] + t * (b[0] - a[0]), iy = a[1] + t * (b[1] - a[1]);
      pos.push([ix, iy]); neg.push([ix, iy]);
    }
  }
  return [pos, neg];
}

// ---- 얼굴 공간 상태 ----
let baseS = 1, Cx = 0, Cy = 0;
let head = null;            // 머리 실루엣(볼록) — 분할 원본
let facets = [];           // 면들
let feat = null;           // 이목구비 파라미터(정면/측면)
let asm = 1;               // 조립도 1=완성, 0=흩어짐
let state = "idle";        // idle | out | in
let pressX = 0, pressY = 0, dragging = false;
let cam = null, wav = null, handOn = false, handX = 0, handY = 0; // 카메라 손 입력

// ---- 머리 실루엣(볼록 달걀형) — 시드 지터 ----
function buildHead(rng) {
  const rx = 0.92 + (rng() - 0.5) * 0.1, ry = 1.2 + (rng() - 0.5) * 0.12;
  const wR = 1 + (rng() - 0.5) * 0.16, wL = 1 + (rng() - 0.5) * 0.16;  // 좌우 비대칭(정면/옆 혼합)
  const N = 26, p = [];
  for (let i = 0; i < N; i++) {
    const th = i / N * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const taper = 1 - 0.26 * Math.pow((1 - c) / 2, 1.4);      // 아래(턱) 좁힘 → 볼록 유지
    const x = rx * s * taper * (s >= 0 ? wR : wL);
    const y = -ry * c - 0.06;
    p.push([x, y]);
  }
  return p;
}

// ---- 초상 생성(시드) : 면 분할 + 색·질감·시점음영 + 이목구비 ----
function buildPortrait(seed) {
  const rng = mulberry32(seed);
  head = buildHead(rng);
  // 재귀 분할: 넓은 면을 골라 중심 근처를 지나는 임의 직선으로 자른다
  let polys = [head.map(p => p.slice())];
  const target = 15 + Math.floor(rng() * 7);
  let guard = 0;
  while (polys.length < target && guard++ < 200) {
    polys.sort((a, b) => area(b) - area(a));
    const idx = Math.floor(Math.pow(rng(), 1.7) * Math.min(polys.length, 5));  // 큰 면 우선
    const poly = polys[idx], c = centroid(poly);
    const ang = rng() * Math.PI, nx = Math.cos(ang), ny = Math.sin(ang);
    const jx = c[0] + (rng() - 0.5) * 0.35, jy = c[1] + (rng() - 0.5) * 0.5;
    const [a, b] = splitByLine(poly, nx, ny, nx * jx + ny * jy);
    if (a.length >= 3 && b.length >= 3 && area(a) > 0.02 && area(b) > 0.02) {
      polys.splice(idx, 1, a, b);
    }
  }
  facets = polys.map((pts) => {
    const c = centroid(pts);
    return {
      pts, cx: c[0], cy: c[1],
      col: POOL[Math.floor(rng() * POOL.length)],
      tex: TEX[Math.floor(rng() * TEX.length)],
      texAng: rng() * Math.PI,
      shade: (rng() - 0.5) * 0.34,          // 면마다 다른 시점 음영
      phase: rng() * Math.PI * 2,           // 시점 혼합 진동 위상
      edge: 1.5 + rng() * rng() * 3.4,      // 일부 굵은 검정 윤곽
      sv: [0, 0], svr: 0, dox: 0, doy: 0, drot: 0,
    };
  });
  assignScatter(rng);
  // ---- 이목구비(정면+측면 동시) ----
  const s1 = rng() < 0.5 ? -1 : 1;          // s1 쪽이 '옆얼굴'
  feat = {
    s1,
    profX: s1 * (0.04 + rng() * 0.12),      // 정면/옆을 가르는 중앙 세로선
    eyeF: { x: -s1 * (0.2 + rng() * 0.16), y: -0.44 + rng() * 0.1, r: 0.15 + rng() * 0.05, iris: rng() < 0.5 ? BLUE[1] : BLACK },
    eyeP: { x: s1 * (0.26 + rng() * 0.18), y: -0.26 + rng() * 0.16, r: 0.14 + rng() * 0.04 },  // 다른 높이
    nose: { len: 0.5 + rng() * 0.2, w: 0.16 + rng() * 0.08, col: rng() < 0.5 ? CREAM[0] : GREYB[2] },
    mouthF: { x: -s1 * 0.08, y: 0.5 + rng() * 0.1, w: 0.28 + rng() * 0.1 },
    mouthP: { x: s1 * (0.16 + rng() * 0.1), y: 0.62 + rng() * 0.08, w: 0.16 + rng() * 0.06, rot: s1 * (0.2 + rng() * 0.2) },
    browF: -0.62 - rng() * 0.06, browP: -0.44 - rng() * 0.06,
  };
}

// 흩어짐 벡터: 중심에서 바깥으로 + 임의 회전
function assignScatter(rng) {
  for (const f of facets) {
    const dx = f.cx, dy = f.cy + 0.1, dd = Math.hypot(dx, dy) || 1;
    const spread = (reduced ? 0.5 : 1.3) * (0.6 + rng() * 0.9);
    f.sv = [dx / dd * spread + (rng() - 0.5) * 0.4, dy / dd * spread + (rng() - 0.5) * 0.4];
    f.svr = (rng() - 0.5) * (reduced ? 0.6 : 1.8);
  }
}

// ---- 좌표 변환(호흡 포함) ----
function breath() { return reduced ? 1 : 1 + Math.sin(T * 0.5) * 0.014; }
function toScreen(lx, ly) { const S = baseS * breath(); return [Cx + lx * S, Cy + (ly + (reduced ? 0 : Math.sin(T * 0.5) * 0.01)) * S]; }

// 면의 화면 좌표(흩어짐 + 드래그 + 유휴 기울기)
function facetPts(f) {
  const dis = 1 - asm;
  const ox = f.sv[0] * dis + f.dox, oy = f.sv[1] * dis + f.doy;
  const rot = f.svr * dis + f.drot + (reduced ? 0 : Math.sin(T * 0.4 + f.phase) * 0.03);
  const sc = 1 - dis * 0.16, cr = Math.cos(rot), sr = Math.sin(rot);
  return f.pts.map(([x, y]) => {
    const dx = (x - f.cx) * sc, dy = (y - f.cy) * sc;
    return toScreen(f.cx + ox + dx * cr - dy * sr, f.cy + oy + dx * sr + dy * cr);
  });
}

// ---- 콜라주 질감(면 클립 안) ----
function drawTexture(f, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.hypot(b.w, b.h);
  ctx.globalAlpha = 0.3;
  if (f.tex === "stripe") {                       // 신문 스트라이프(텍스트 없음)
    const dx = Math.cos(f.texAng), dy = Math.sin(f.texAng), px = -dy, py = dx, gap = baseS * 0.05;
    ctx.strokeStyle = "rgba(30,22,18,0.9)"; ctx.lineWidth = Math.max(1, baseS * 0.014);
    for (let i = -14; i <= 14; i++) {
      const o = i * gap;
      ctx.beginPath();
      ctx.moveTo(cx + px * o - dx * R, cy + py * o - dy * R);
      ctx.lineTo(cx + px * o + dx * R, cy + py * o + dy * R);
      ctx.stroke();
    }
  } else if (f.tex === "dot") {                   // 벤데이 도트
    ctx.fillStyle = "rgba(28,20,16,0.9)"; const g = baseS * 0.07, rr = baseS * 0.012;
    for (let y = b.y; y < b.y + b.h + g; y += g)
      for (let x = b.x; x < b.x + b.w + g; x += g) { ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.283); ctx.fill(); }
  } else if (f.tex === "hatch") {                 // 크로스 해칭
    ctx.strokeStyle = "rgba(28,20,16,0.85)"; ctx.lineWidth = Math.max(1, baseS * 0.01);
    for (const a of [f.texAng, f.texAng + 1.2]) {
      const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx, gap = baseS * 0.045;
      for (let i = -16; i <= 16; i++) {
        const o = i * gap;
        ctx.beginPath();
        ctx.moveTo(cx + px * o - dx * R, cy + py * o - dy * R);
        ctx.lineTo(cx + px * o + dx * R, cy + py * o + dy * R);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawFacet(f) {
  const pts = facetPts(f), b = bbox(pts);
  ctx.save(); tracePath(pts); ctx.clip();
  ctx.fillStyle = f.col; ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  if (f.tex) drawTexture(f, b);
  // 시점 음영(면마다 다른 광원 + 느린 진동)
  const sh = f.shade + (reduced ? 0 : Math.sin(T * 0.3 + f.phase) * 0.13);
  ctx.fillStyle = sh < 0 ? `rgba(18,12,12,${Math.min(0.55, -sh)})` : `rgba(255,250,238,${Math.min(0.5, sh)})`;
  ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  ctx.restore();
  ctx.lineJoin = "round"; ctx.strokeStyle = BLACK; ctx.lineWidth = f.edge; tracePath(pts); ctx.stroke();
}

// ---- 이목구비: 정면 눈 + 측면 눈 + 옆모습 코 + 이중 입 ----
function stroke(a, wgt) { ctx.strokeStyle = BLACK; ctx.lineWidth = wgt; ctx.lineCap = "round"; ctx.lineJoin = "round"; tracePath(a); ctx.stroke(); }
function drawFeatures(alpha) {
  ctx.globalAlpha = alpha; const F = feat, S = baseS * breath();
  // 정면/옆을 가르는 중앙 세로선(굵은 먹선)
  const p0 = toScreen(F.profX, -1.1), p1 = toScreen(F.profX + F.s1 * 0.06, 0.9);
  ctx.strokeStyle = BLACK; ctx.lineWidth = S * 0.03; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(toScreen(F.profX + F.s1 * 0.14, -0.1)[0], toScreen(0, -0.1)[1], p1[0], p1[1]); ctx.stroke();

  // 옆모습 코: 중앙에서 옆얼굴 쪽으로 내려오는 쐐기 + 콧구멍 하나
  const nb = toScreen(F.profX, F.eyeF.y + 0.05);           // 콧등 시작(눈썹 사이)
  const nt = toScreen(F.profX + F.s1 * F.nose.w * 1.3, F.eyeF.y + F.nose.len);  // 코끝
  const nback = toScreen(F.profX, F.eyeF.y + F.nose.len * 0.92);
  ctx.fillStyle = F.nose.col;
  ctx.beginPath(); ctx.moveTo(nb[0], nb[1]); ctx.lineTo(nt[0], nt[1]); ctx.lineTo(nback[0], nback[1]); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(20,14,12,0.22)";  // 코의 그늘 면(시점 음영)
  ctx.beginPath(); ctx.moveTo(nb[0], nb[1]); ctx.lineTo(nt[0], nt[1]); ctx.lineTo(nback[0], nback[1]); ctx.closePath(); ctx.fill();
  stroke([nb, nt, nback], S * 0.02);
  ctx.strokeStyle = BLACK; ctx.lineWidth = S * 0.02;       // 콧구멍
  ctx.beginPath(); ctx.arc(nt[0] - F.s1 * S * 0.03, nt[1] - S * 0.01, S * 0.03, 0.2, 3.4); ctx.stroke();

  // 정면 눈(둥근 눈 — 흰자 + 홍채 + 먹선 눈꺼풀)
  const e = F.eyeF, ec = toScreen(e.x, e.y), er = e.r * S;
  ctx.fillStyle = "#f6efdd"; ctx.beginPath(); ctx.ellipse(ec[0], ec[1], er, er * 0.72, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = e.iris; ctx.beginPath(); ctx.arc(ec[0], ec[1], er * 0.42, 0, 6.283); ctx.fill();
  ctx.fillStyle = BLACK; ctx.beginPath(); ctx.arc(ec[0], ec[1], er * 0.2, 0, 6.283); ctx.fill();
  ctx.strokeStyle = BLACK; ctx.lineWidth = S * 0.02;
  ctx.beginPath(); ctx.ellipse(ec[0], ec[1], er, er * 0.72, 0, 0, 6.283); ctx.stroke();
  stroke([toScreen(e.x - e.r, F.browF + 0.02), toScreen(e.x, F.browF), toScreen(e.x + e.r, F.browF + 0.03)], S * 0.028);

  // 측면 눈(옆에서 본 아몬드 — 다른 높이, 콧대 쪽으로 홍채)
  const g = F.eyeP, gc = toScreen(g.x, g.y), gr = g.r * S;
  ctx.beginPath();
  ctx.moveTo(gc[0] - gr, gc[1]);
  ctx.quadraticCurveTo(gc[0], gc[1] - gr * 0.85, gc[0] + gr, gc[1] - gr * 0.15);
  ctx.quadraticCurveTo(gc[0], gc[1] + gr * 0.8, gc[0] - gr, gc[1]);
  ctx.closePath(); ctx.fillStyle = "#f6efdd"; ctx.fill();
  ctx.fillStyle = BLACK; ctx.beginPath(); ctx.arc(gc[0] - F.s1 * gr * 0.35, gc[1] - gr * 0.05, gr * 0.34, 0, 6.283); ctx.fill();
  ctx.strokeStyle = BLACK; ctx.lineWidth = S * 0.022;
  ctx.beginPath();
  ctx.moveTo(gc[0] - gr, gc[1]);
  ctx.quadraticCurveTo(gc[0], gc[1] - gr * 0.85, gc[0] + gr, gc[1] - gr * 0.15);
  ctx.quadraticCurveTo(gc[0], gc[1] + gr * 0.8, gc[0] - gr, gc[1]); ctx.stroke();
  stroke([toScreen(g.x - g.r, F.browP + 0.02), toScreen(g.x + g.r * 0.6, F.browP)], S * 0.026);

  // 이중 입: 정면 입술(빨강, 위/아래 분할) + 측면 입술(기운 작은 입)
  const m = F.mouthF, mc = toScreen(m.x, m.y), mw = m.w * S;
  ctx.fillStyle = RED[0];
  ctx.beginPath();
  ctx.moveTo(mc[0] - mw, mc[1]);
  ctx.quadraticCurveTo(mc[0], mc[1] - mw * 0.4, mc[0] + mw, mc[1]);
  ctx.quadraticCurveTo(mc[0], mc[1] + mw * 0.5, mc[0] - mw, mc[1]);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = BLACK; ctx.lineWidth = S * 0.02;
  ctx.beginPath(); ctx.moveTo(mc[0] - mw, mc[1]); ctx.quadraticCurveTo(mc[0], mc[1] + mw * 0.12, mc[0] + mw, mc[1]); ctx.stroke();
  const m2 = F.mouthP, m2c = toScreen(m2.x, m2.y), m2w = m2.w * S;
  ctx.save(); ctx.translate(m2c[0], m2c[1]); ctx.rotate(m2.rot);
  ctx.fillStyle = RED[1];
  ctx.beginPath(); ctx.ellipse(0, 0, m2w, m2w * 0.42, 0, 0, 6.283); ctx.fill();
  ctx.strokeStyle = BLACK; ctx.lineWidth = S * 0.018;
  ctx.beginPath(); ctx.moveTo(-m2w, 0); ctx.lineTo(m2w, 0); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// --- 손 커서: 팔레트 정합 노랑 글로우 점 — 쿨다운 중엔 옅게(장전 안 됨) ---
function drawHandCursor() {
  if (!handOn) return;
  const r = Math.min(W, H) * 0.02;
  const a = wav.coolT > 0 ? 0.35 : 0.85;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(handX, handY, 0, handX, handY, r * 2.2);
  g.addColorStop(0, `rgba(240,207,107,${a})`);   // YELLOW[1] 계열
  g.addColorStop(1, "rgba(240,207,107,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(handX, handY, r * 2.2, 0, 6.283); ctx.fill();
  ctx.restore();
}

// --- 코너 카메라 미러: 우하단 좌우반전 프리뷰 + 손 랜드마크 오버레이 ---
// (10번 계획 Task 5와 자구 동일 — 카메라 작품 4개+ 시 공용 헬퍼 리팩터 후보)
function drawCamMirror() {
  if (!cam || !cam.active()) return;
  const v = cam.video();
  if (!v || v.readyState < 2) return;
  const mw = Math.min(200, W * 0.18);
  const mh = mw * ((v.videoHeight / v.videoWidth) || 0.75);
  const mx = W - mw - 12, my = H - mh - 12;
  ctx.save();
  ctx.translate(mx + mw, my); ctx.scale(-1, 1);          // 좌우반전 미러
  ctx.globalAlpha = 0.92;
  ctx.drawImage(v, 0, 0, mw, mh);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "rgba(255,210,63,0.9)";                // 랜드마크 점
  for (const hand of cam.landmarks()) {
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(mx + (1 - p.x) * mw, my + p.y * mh, 1.5, 0, 6.283);
      ctx.fill();
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, mw, mh);
  ctx.restore();
}

function rebuild() { buildPortrait(Math.floor(Math.random() * 2 ** 31)); asm = 0; }

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height; reduced = !!opts.reducedMotion;
    T = 0; asm = 1; state = "idle"; dragging = false;
    cam = opts.cam || null;
    wav = makeWave();
    handOn = false;
    this.resize(W, H);
    buildPortrait(Math.floor(Math.random() * 2 ** 31));  // 첫 초상은 조립된 상태
    asm = 1;
  },

  resize(w, h) {
    W = w; H = h;
    baseS = Math.min(w / 2.1, h / 2.62);   // 얼굴이 화면을 가득 채움
    Cx = w / 2; Cy = h * 0.5;
  },

  tick(dt, ptr) {
    T += dt;
    // ---- 입력 ----
    if (ptr.justDown) { pressX = ptr.x; pressY = ptr.y; dragging = false; }
    if (ptr.down && Math.hypot(ptr.x - pressX, ptr.y - pressY) > baseS * 0.045) dragging = true;
    if (ptr.justUp) {
      if (!dragging && ptr.downTime < 0.4 && state === "idle") state = "out";  // 탭 = 재조립
      dragging = false;
    }

    // ---- 카메라 손짓: 좌우로 크게 흔들면 재조립, 손 위치는 면 밀기 가상 포인터 ----
    handOn = false;
    if (cam && cam.active()) {
      const h = cam.hands();
      if (waveStep(wav, h.x, h.n >= 1, dt).fire && state === "idle") state = "out";
      if (h.n >= 1) { handOn = true; handX = h.x * W; handY = h.y * H; }
    }

    // ---- 재조립 상태 기계(dt 기반 전이) ----
    if (state === "out") { asm = approach(asm, -0.08, reduced ? 12 : 7, dt); if (asm < 0.06) { rebuild(); state = "in"; } }
    else if (state === "in") { asm = approach(asm, 1, reduced ? 12 : 6.5, dt); if (asm > 0.985) { asm = 1; state = "idle"; } }

    // ---- 면 밀기: 입력원은 ① 마우스 드래그 ② 카메라 손 (드래그 우선) ----
    const drag = dragging && state === "idle";
    const push = drag || (handOn && state === "idle");
    const pushX = drag ? ptr.x : handX, pushY = drag ? ptr.y : handY;
    const R = baseS * 0.85;
    for (const f of facets) {
      let tox = 0, toy = 0, trot = 0;
      if (push) {
        const cs = toScreen(f.cx, f.cy), d = Math.hypot(cs[0] - pushX, cs[1] - pushY);
        if (d < R) {
          const fall = 1 - d / R;
          tox = (cs[0] - pushX) / baseS * fall * 0.55;
          toy = (cs[1] - pushY) / baseS * fall * 0.55;
          trot = ((cs[0] - pushX) >= 0 ? 1 : -1) * fall * 0.5;
        }
      }
      const rate = push ? 12 : 7;   // 놓으면 스프링 안착
      f.dox = approach(f.dox, tox, rate, dt);
      f.doy = approach(f.doy, toy, rate, dt);
      f.drot = approach(f.drot, trot, rate, dt);
    }

    // ---- 렌더 ----
    ctx.fillStyle = "#211a1b"; ctx.fillRect(0, 0, W, H);   // 따뜻한 중성 배경
    for (const f of facets) drawFacet(f);
    // 머리 실루엣 굵은 윤곽(흩어질수록 옅게)
    ctx.globalAlpha = Math.max(0, asm);
    ctx.strokeStyle = BLACK; ctx.lineWidth = baseS * 0.05; ctx.lineJoin = "round";
    tracePath(head.map(p => toScreen(p[0], p[1]))); ctx.stroke();
    ctx.globalAlpha = 1;
    // 이목구비는 대체로 조립됐을 때만 또렷이(재조립 중 흐려짐)
    const fa = clamp((asm - 0.6) / 0.4, 0, 1);
    if (fa > 0.01) drawFeatures(fa);
    drawHandCursor();
    drawCamMirror();
  },

  dispose() { ctx = null; head = null; facets = []; feat = null; cam = null; wav = null; },
};
