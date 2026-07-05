// js/pieces/12-bull-puppet.js — After Lee Jung-seob, Bull (황소, c.1953)
// 이중섭의 황소를 가위로 오려낸 종이 인형으로 재해석한 막대 인형극. 100% 절차적 렌더.
// 프로시니엄 무대 위에서 인형이 스스로 걷고·고개를 젓고·울부짖는 소극(小劇)을 반복하고,
// 관객은 조각에 매달린 나무 막대를 드래그로 잡아 직접 조종하거나 클릭으로 돌진시킨다.
// 팔레트: 주홍 노을 배경막 · 황토/주홍 붓질 · 굵은 먹빛 윤곽 · 흰 종이 절단면. 무음.

let W = 0, H = 0, ctx = null, T = 0, reduced = false;

// ---- 팔레트 ----
const INK = "#231812";           // 먹빛 윤곽
const PAPER = "#f1e6cf";         // 오려낸 종이 흰 테두리
const OCHRE = "#d3922f";         // 황토 몸통
const OCHRE_D = "#9c6414";       // 붓질 어두운 결
const OCHRE_H = "#f0c96b";       // 붓질 밝은 결
const RED = "#c1442a";           // 주홍(콧등·입)
const RED_D = "#7c1f13";         // 입 안
const HOOF = "#c98a6c";          // 살굿빛 발굽

// ---- 유틸 ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
// 프레임레이트 독립 접근(스프링 대용)
const approach = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
function mulberry32(s) { return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rot = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); const dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
function centroid(p) { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length]; }
function expand(p, c, px) { return p.map(([x, y]) => { const dx = x - c[0], dy = y - c[1], d = Math.hypot(dx, dy) || 1; return [x + dx / d * px, y + dy / d * px]; }); }
function bbox(p) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const q of p) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); } return { x: a, y: b, w: c - a, h: d - b }; }
function tracePath(p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }

// 2관절 IK — 어깨 ax,ay 에서 발끝 tx,ty 로, bone 길이 l1·l2, bend 방향(±1)의 무릎 위치
function solve2(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1, l1 + l2 - 1);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const j = base + bend * Math.acos(cosA);
  return [ax + Math.cos(j) * l1, ay + Math.sin(j) * l1];
}

// ---- 무대·인형 상태 ----
let stage = {};                  // 무대 지오메트리(리사이즈 시 재계산)
let bg = null;                   // 배경막 오프스크린(주홍 노을, 베이크)
let S = 1;                       // 인형 스케일
let ss = 1;                      // 그림자 오프셋 스케일

// 애니메이션 채널(모두 dt 스프링으로 목표에 접근)
const ch = { gait: 0, bob: 0, swing: 0, lift: 0, mouth: 0, foot: 0.32, lean: 0, sway: 0 };
let walkPh = 0;                  // 보행 위상 누적
let anchorX = 0, anchorY = 0;    // 몸통 앵커(스프링 상태)
let bodyRot = 0;

// 자동 공연 상태 기계
const PHASES = [["walk", 6.2], ["shake", 3.4], ["bellow", 3.4]];
let phase = 0, phaseT = 0;

// 조종/돌진
let grab = null;                 // 잡은 막대: "body" | "head" | "tail"
let dragging = false, pressX = 0, pressY = 0;
let headDrag = 0, tailDrag = 0;  // 드래그로 향한 목표 각(월드)
let charging = false, chargeT = 0, chargeDir = -1;
let shake = 0;                   // 무대 미세 진동 강도

// 로컬 폴리곤(스케일에 맞춰 init에서 1회 빌드)
let bodyShape = null, headShape = null, hornA = null, hornB = null, earShape = null;
let jit = {};                    // 조각별 절단선 지터(고정 → 흔들리지 않음)

// ---- 조각 형태 빌드(이중섭 소의 실루엣: 아치진 등·묵직한 머리·가는 다리·긴 꼬리) ----
function buildShapes() {
  const L = S * 3.1;             // 몸통 길이 절반
  const Hh = S * 1.9;            // 몸통 높이 절반
  // 몸통: 등선이 견갑(앞·왼쪽)에서 힘차게 솟았다가 엉덩이로 내려가는 아치. 왼쪽이 앞.
  bodyShape = [
    [-L * 1.02, -Hh * 0.12], [-L * 0.74, -Hh * 1.06], [-L * 0.34, -Hh * 1.34],
    [L * 0.06, -Hh * 0.98], [L * 0.62, -Hh * 0.74], [L * 1.05, -Hh * 0.28],
    [L * 1.02, Hh * 0.44], [L * 0.72, Hh * 0.98], [L * 0.2, Hh * 1.04],
    [-L * 0.3, Hh * 1.0], [-L * 0.78, Hh * 0.86], [-L * 1.06, Hh * 0.34],
  ];
  // 머리: 목 피벗(0,0) 기준 +x 가 주둥이 방향. 묵직한 두상 + 벌어지는 주둥이.
  const hs = S * 1.55;
  headShape = [
    [-hs * 0.15, -hs * 0.72], [hs * 0.55, -hs * 0.66], [hs * 1.16, -hs * 0.34],
    [hs * 1.5, -hs * 0.02], [hs * 1.48, hs * 0.44], [hs * 1.12, hs * 0.66],
    [hs * 0.5, hs * 0.72], [-hs * 0.2, hs * 0.66], [-hs * 0.5, hs * 0.2],
    [-hs * 0.46, -hs * 0.34],
  ];
  // 뿔 두 개 — 정수리에서 위로 솟아 뒤·앞으로 휘는 초승달. 머리 위에 얹혀 또렷이 보임.
  hornA = [[hs * 0.12, -hs * 0.6], [hs * -0.16, -hs * 1.28], [hs * 0.02, -hs * 1.46], [hs * 0.36, -hs * 0.98], [hs * 0.38, -hs * 0.58]];
  hornB = [[hs * 0.56, -hs * 0.56], [hs * 0.98, -hs * 1.2], [hs * 1.2, -hs * 1.16], [hs * 0.94, -hs * 0.66], [hs * 0.64, -hs * 0.42]];
  earShape = [[-hs * 0.3, -hs * 0.1], [-hs * 0.72, -hs * 0.26], [-hs * 0.86, hs * 0.06], [-hs * 0.5, hs * 0.18]];
  jit = {};
}
// 조각별 절단선 지터 벡터(1회 생성 후 고정)
function jitterFor(key, n) {
  if (jit[key]) return jit[key];
  const r = mulberry32(key.length * 2654435761 + n * 40503 + 7);
  const a = []; for (let i = 0; i < n; i++) a.push([(r() - 0.5) * S * 0.5, (r() - 0.5) * S * 0.5]);
  return (jit[key] = a);
}

// ---- 오려낸 종이 조각 렌더: 그림자 → 흰 절단면 → 황토 붓질 → 먹빛 윤곽 ----
function drawStreaks(b, ang, dark, light) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.hypot(b.w, b.h) / 2 + S;
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  ctx.lineWidth = Math.max(2, S * 0.42);
  for (let i = -6; i <= 6; i++) {
    const o = i * S * 0.62;
    ctx.strokeStyle = i % 2 ? light : dark;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + px * o - dx * R, cy + py * o - dy * R);
    ctx.lineTo(cx + px * o + dx * R, cy + py * o + dy * R);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawPiece(pts, key, fillAng) {
  const jv = jitterFor(key, pts.length);
  const p = pts.map((q, i) => [q[0] + jv[i][0], q[1] + jv[i][1]]);
  const c = centroid(p);
  // 흰 종이 절단면(살짝 확장) + 부드러운 오프셋 그림자
  ctx.save();
  ctx.shadowColor = "rgba(30,10,6,0.42)"; ctx.shadowBlur = 15 * ss;
  ctx.shadowOffsetX = 7 * ss; ctx.shadowOffsetY = 12 * ss;
  tracePath(expand(p, c, S * 0.5 + 2)); ctx.fillStyle = PAPER; ctx.fill();
  ctx.restore();
  // 황토 바탕 + 방향성 붓질
  const b = bbox(p);
  ctx.save(); tracePath(p); ctx.clip();
  ctx.fillStyle = OCHRE; ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  drawStreaks(b, fillAng, OCHRE_D, OCHRE_H);
  ctx.restore();
  // 굵은 먹빛 윤곽
  tracePath(p); ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2.4, S * 0.5); ctx.strokeStyle = INK; ctx.stroke();
}
// 가는 다리·꼬리·뿔: 관절 체인을 폭 프로파일로 감싼 폴리곤
function limbPoly(chain, widths) {
  const up = [], dn = [];
  for (let i = 0; i < chain.length; i++) {
    const a = chain[Math.max(0, i - 1)], b = chain[Math.min(chain.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
    up.push([chain[i][0] + nx * widths[i], chain[i][1] + ny * widths[i]]);
    dn.push([chain[i][0] - nx * widths[i], chain[i][1] - ny * widths[i]]);
  }
  return up.concat(dn.reverse());
}

// ---- 무대(프레임·커튼·각광·바닥) ----
function bakeBackdrop() {
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(stage.w)); c.height = Math.max(2, Math.round(stage.h));
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, "#8f2410"); grd.addColorStop(0.42, "#c34a1c");
  grd.addColorStop(0.72, "#dd7524"); grd.addColorStop(1, "#e59a3a");
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  const glow = g.createRadialGradient(c.width * 0.5, c.height * 0.86, c.width * 0.04, c.width * 0.5, c.height * 0.86, c.width * 0.7);
  glow.addColorStop(0, "rgba(255,205,120,0.55)"); glow.addColorStop(1, "rgba(255,205,120,0)");
  g.fillStyle = glow; g.fillRect(0, 0, c.width, c.height);
  // 거친 가로 붓결
  const r = mulberry32(97);
  g.lineCap = "round";
  for (let i = 0; i < 150; i++) {
    const y = r() * c.height, len = c.width * (0.16 + r() * 0.5), x = r() * c.width;
    g.strokeStyle = `rgba(${120 + r() * 90 | 0},${40 + r() * 45 | 0},${18 + r() * 20 | 0},${0.05 + r() * 0.12})`;
    g.lineWidth = 2 + r() * 7;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y + (r() - 0.5) * 14, x + len, y); g.stroke();
  }
  bg = c;
}
function drawStage() {
  const s = stage;
  // 배경막
  ctx.drawImage(bg, s.x, s.y, s.w, s.h);
  ctx.fillStyle = "rgba(20,8,20,0.16)"; ctx.fillRect(s.x, s.y, s.w, s.h);
  // 나무 판자 바닥
  const fg = ctx.createLinearGradient(0, s.floorY, 0, H);
  fg.addColorStop(0, "#5b3a22"); fg.addColorStop(1, "#33200f");
  ctx.fillStyle = fg; ctx.fillRect(s.x, s.floorY, s.w, H - s.floorY);
  ctx.strokeStyle = "rgba(20,10,4,0.5)"; ctx.lineWidth = 2;
  for (let i = 1; i < 9; i++) { const x = s.x + s.w * i / 9; ctx.beginPath(); ctx.moveTo(x, s.floorY); ctx.lineTo(x + (i - 4.5) * 10, H); ctx.stroke(); }
  ctx.strokeStyle = "rgba(255,220,150,0.12)"; ctx.beginPath(); ctx.moveTo(s.x, s.floorY); ctx.lineTo(s.x + s.w, s.floorY); ctx.stroke();
  // 각광(4개) — 아래→위 글로우, 공연 강도에 따라 밝아짐
  const lit = clamp(0.34 + ch.foot, 0, 1.25);
  for (let i = 0; i < 4; i++) {
    const x = s.x + s.w * (i + 0.5) / 4;
    const gl = ctx.createRadialGradient(x, s.floorY, 4, x, s.floorY - s.h * 0.4, s.h * 0.5);
    gl.addColorStop(0, `rgba(255,214,130,${0.5 * lit})`); gl.addColorStop(1, "rgba(255,214,130,0)");
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, s.floorY - s.h * 0.16, s.h * 0.34, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#2a1a0e"; ctx.beginPath(); ctx.ellipse(x, s.floorY, s.w * 0.028, s.h * 0.02, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,226,150,${0.85 * clamp(lit, 0, 1)})`; ctx.beginPath(); ctx.arc(x, s.floorY - s.h * 0.012, s.w * 0.012, 0, Math.PI * 2); ctx.fill();
  }
}
function drawCurtains() {
  const s = stage, sw = ch.sway * s.w * 0.03;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? s.x : s.x + s.w;
    const cw = s.w * 0.17;
    for (let i = 0; i < 5; i++) {
      const fx = x0 - side * (i * cw / 5);
      const wob = Math.sin(T * 1.3 + i) * sw * (i / 5);
      const g = ctx.createLinearGradient(fx - side * cw / 5, 0, fx, 0);
      g.addColorStop(0, "#4a0c10"); g.addColorStop(0.5, "#84181a"); g.addColorStop(1, "#4a0c10");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(fx, s.y);
      ctx.lineTo(fx - side * cw / 5, s.y);
      ctx.quadraticCurveTo(fx - side * cw / 5 + wob, s.floorY + s.h * 0.06, fx - side * cw / 5, s.floorY + s.h * 0.1);
      ctx.lineTo(fx + wob, s.floorY + s.h * 0.1);
      ctx.closePath(); ctx.fill();
    }
  }
  // 프로시니엄 아치
  const t = Math.max(10, s.h * 0.05);
  ctx.fillStyle = "#2b1a0f"; ctx.fillRect(s.x - t, s.y - t, s.w + t * 2, t);
  ctx.fillRect(s.x - t, s.y - t, t, s.h + t * 2); ctx.fillRect(s.x + s.w, s.y - t, t, s.h + t * 2);
  ctx.strokeStyle = "#b0873f"; ctx.lineWidth = 2; ctx.strokeRect(s.x - t, s.y - t, s.w + t * 2, s.h + t);
}

// ---- 인형 그리기 ----
function limbAt(hipX, hipY, footX, footY, l1, l2, bend, w0, w1, w2, key, hoof = true) {
  const knee = solve2(hipX, hipY, footX, footY, l1, l2, bend);
  const poly = limbPoly([[hipX, hipY], knee, [footX, footY]], [w0, w1, w2]);
  const jv = jitterFor(key, poly.length);
  const p = poly.map((q, i) => [q[0] + jv[i][0] * 0.5, q[1] + jv[i][1] * 0.5]);
  const c = centroid(p);
  ctx.save(); ctx.shadowColor = "rgba(30,10,6,0.35)"; ctx.shadowBlur = 9 * ss; ctx.shadowOffsetX = 5 * ss; ctx.shadowOffsetY = 8 * ss;
  tracePath(expand(p, c, 2)); ctx.fillStyle = PAPER; ctx.fill(); ctx.restore();
  const b = bbox(p);
  ctx.save(); tracePath(p); ctx.clip(); ctx.fillStyle = OCHRE; ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  ctx.strokeStyle = OCHRE_D; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(knee[0], knee[1]); ctx.lineTo(footX, footY); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
  tracePath(p); ctx.lineJoin = "round"; ctx.lineWidth = Math.max(2, S * 0.42); ctx.strokeStyle = INK; ctx.stroke();
  if (hoof) { // 살굿빛 발굽
    ctx.fillStyle = HOOF; ctx.beginPath(); ctx.arc(footX, footY, w2 + 1, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
  }
}
function drawHead(pivotX, pivotY, ang) {
  ctx.save(); ctx.translate(pivotX, pivotY); ctx.rotate(ang);
  const hs = S * 1.55;
  drawPiece(earShape, "ear", 2.2);
  drawPiece(headShape, "head", 2.7);
  // 주홍 콧등·입(원작의 강렬한 붉은 입) — 울부짖음에 따라 크게 벌어짐
  const mo = ch.mouth;
  ctx.save(); tracePath([[hs * 0.86, hs * 0.1], [hs * 1.48, -hs * 0.04], [hs * 1.54, hs * 0.26], [hs * 1.3, hs * (0.42 + mo * 0.52)], [hs * 0.82, hs * (0.52 + mo * 0.36)]]);
  ctx.fillStyle = RED; ctx.fill(); ctx.lineWidth = Math.max(2, S * 0.4); ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  if (mo > 0.04) { ctx.beginPath(); ctx.ellipse(hs * 1.14, hs * (0.36 + mo * 0.3), hs * 0.17, hs * (0.05 + mo * 0.22), 0, 0, Math.PI * 2); ctx.fillStyle = RED_D; ctx.fill(); }
  // 뿔 — 머리 위에 얹혀 또렷이
  drawPiece(hornA, "hornA", 1.2); drawPiece(hornB, "hornB", 0.9);
  // 눈 — 이중섭 소의 크고 검은 눈 + 흰 반점
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hs * 0.6, -hs * 0.12, hs * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hs * 0.55, -hs * 0.18, hs * 0.055, 0, Math.PI * 2); ctx.fill();
  // 콧구멍
  ctx.fillStyle = RED_D; ctx.beginPath(); ctx.arc(hs * 1.36, hs * 0.12, hs * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawRod(x0, y0) {
  const bx = x0 + (anchorX < W / 2 ? 8 : -8), by = H + 40;
  ctx.strokeStyle = "rgba(70,48,28,0.92)"; ctx.lineWidth = Math.max(2.5, S * 0.34); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = "rgba(150,110,60,0.5)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(bx, by); ctx.stroke();
}

// 몸통 지역좌표 → 월드(앵커+회전)
function toWorld(lx, ly, cx, cy) { return rot(cx + lx, cy + ly, cx, cy, bodyRot); }

function drawBull() {
  const L = S * 3.1, Hh = S * 1.9;
  const bobY = ch.bob * Math.sin(walkPh * Math.PI * 2 * 2) * S * 0.5;
  const cx = anchorX, cy = anchorY + bobY - ch.lift * S * 1.3;
  const gY = stage.floorY - S * 0.15;                 // 발이 딛는 바닥
  // 관절 부착점(로컬)
  const neck = toWorld(-L * 0.86, -Hh * 0.72, cx, cy);
  const tailRoot = toWorld(L * 0.98, -Hh * 0.34, cx, cy);
  const shF = toWorld(-L * 0.5, Hh * 0.5, cx, cy);    // 앞 어깨
  const hipF = toWorld(L * 0.62, Hh * 0.5, cx, cy);   // 뒤 엉덩이
  const legLen = S * 1.05, lower = S * 1.15;
  // 보행: 발끝 타원 경로(대각쌍 위상). swing 반영해 좌우 흔들 시 무게중심 이동감
  const step = ch.gait > 0.02 ? S * 1.1 * ch.bob : 0;
  const lift = ch.gait > 0.02 ? S * 0.9 * ch.bob : 0;
  const foot = (baseX, ph) => { const s = Math.sin(ph); return [baseX + step * Math.cos(ph), gY - Math.max(0, s) * lift]; };
  const p0 = walkPh * Math.PI * 2;
  // 원경(far) 다리 — 몸통 뒤에 먼저(어둡게 살짝 뒤로)
  ctx.save(); ctx.globalAlpha = 0.82;
  limbAt(shF[0] + S * 0.4, shF[1], ...foot(shF[0] + S * 0.5, p0 + Math.PI), legLen, lower, 1, S * 0.5, S * 0.4, S * 0.28, "legFF");
  limbAt(hipF[0] + S * 0.4, hipF[1], ...foot(hipF[0] + S * 0.35, p0), legLen, lower, -1, S * 0.55, S * 0.42, S * 0.3, "legHF");
  ctx.restore();
  // 몸통
  const bodyW = bodyShape.map(([x, y]) => toWorld(x, y, cx, cy));
  drawPiece(bodyW, "body", 0.35);
  // 꼬리 — 엉덩이 오른쪽으로 내려와 끝이 나부낌(몸통 위에 그려 항상 보임)
  const tAng = tailDrag || (1.12 + ch.swing * 0.35 * Math.sin(T * 2.2) + (reduced ? 0 : Math.sin(T * 1.6) * 0.16));
  const tEnd = [tailRoot[0] + Math.cos(tAng) * L * 0.92, tailRoot[1] + Math.sin(tAng) * L * 0.92];
  limbAt(tailRoot[0], tailRoot[1], tEnd[0], tEnd[1], L * 0.58, L * 0.5, 1, S * 0.32, S * 0.2, S * 0.52, "tail", false);
  // 근경(near) 다리 — 몸통 앞
  limbAt(shF[0] - S * 0.4, shF[1], ...foot(shF[0] - S * 0.5, p0), legLen, lower, 1, S * 0.54, S * 0.42, S * 0.3, "legFN");
  limbAt(hipF[0] - S * 0.4, hipF[1], ...foot(hipF[0] - S * 0.45, p0 + Math.PI), legLen, lower, -1, S * 0.6, S * 0.46, S * 0.32, "legHN");
  // 머리 — 목 피벗에서 회전
  const headRest = Math.PI * 0.82 + bodyRot;          // 아래-왼쪽으로 숙임
  let headAng;
  if (grab === "head" && dragging) headAng = headDrag;
  else headAng = headRest - ch.lift * 0.8 + (grab === "head" ? 0 : ch.swing * 0.5 * Math.sin(T * 3.1));
  drawHead(neck[0], neck[1], headAng);
  // 막대(조각에서 무대 아래로) — 몸통·머리·꼬리
  drawRod(toWorld(L * 0.1, Hh * 0.9, cx, cy)[0], toWorld(L * 0.1, Hh * 0.9, cx, cy)[1]);
  drawRod(neck[0] + Math.cos(headAng) * S * 1.4, neck[1] + Math.sin(headAng) * S * 1.4);
  drawRod(tEnd[0], tEnd[1]);
  return { neck, tailEnd: tEnd, bodyRod: toWorld(L * 0.1, Hh * 0.9, cx, cy) };
}

// ---- 자동 공연 목표 채널 ----
function targets() {
  if (charging) {
    const k = reduced ? 0.4 : 1;
    return { gait: 3.4, bob: 0.7 * k, swing: 0, lift: 0.18, mouth: 0.22, foot: 1.05, lean: chargeDir * 0.13 * k };
  }
  const rm = reduced ? 0.45 : 1;
  const name = PHASES[phase][0];
  if (name === "walk") return { gait: 1.5, bob: 1 * rm, swing: 0.12, lift: 0, mouth: 0, foot: 0.34, lean: 0 };
  if (name === "shake") return { gait: 0, bob: 0.34 * rm, swing: 1 * rm, lift: 0.05, mouth: 0.06, foot: 0.34, lean: 0 };
  // bellow: 앞부분 고조 → 유지 → 이완 엔벨로프
  const d = PHASES[phase][1], e = phaseT < d * 0.4 ? phaseT / (d * 0.4) : phaseT > d * 0.78 ? Math.max(0, 1 - (phaseT - d * 0.78) / (d * 0.22)) : 1;
  return { gait: 0, bob: 0.2 * rm, swing: 0.1, lift: (0.55 + 0.45) * e * rm, mouth: e, foot: 0.34 + e * 0.9, lean: 0 };
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height; reduced = !!opts.reducedMotion;
    T = 0; phase = 0; phaseT = 0; walkPh = 0; bodyRot = 0;
    grab = null; dragging = false; charging = false; chargeT = 0; shake = 0; headDrag = 0; tailDrag = 0;
    for (const k in ch) ch[k] = k === "foot" ? 0.32 : 0;
    this.resize(W, H);
    anchorX = stage.homeX; anchorY = stage.homeY;
  },

  resize(w, h) {
    W = w; H = h;
    const m = Math.min(w, h);
    const sx = w * 0.08, sy = h * 0.12, sw = w * 0.84, sh = h * 0.72;
    S = clamp(m * 0.052, 12, 46); ss = clamp(m / 900, 0.6, 1.4);
    stage = { x: sx, y: sy, w: sw, h: sh, floorY: sy + sh * 0.9, homeX: w * 0.5, homeY: 0 };
    stage.homeY = stage.floorY - S * 0.15 - (S * 1.05 + S * 1.15) * 0.86 - S * 1.9 * 0.5;
    buildShapes();
    bakeBackdrop();
    // 리사이즈 후 앵커가 무대 밖이면 홈으로
    if (!anchorX || anchorX < stage.x || anchorX > stage.x + stage.w) { anchorX = stage.homeX; anchorY = stage.homeY; }
  },

  tick(dt, ptr) {
    T += dt;
    // ---- 입력: 잡기/드래그/클릭(돌진) ----
    const rodY = stage.floorY + 24;
    if (ptr.justDown) {
      pressX = ptr.x; pressY = ptr.y; dragging = false;
      // 가장 가까운 막대 선택(몸통·머리·꼬리 핸들)
      const hb = [["body", stage.homeX, 0], ["head", 0, 0], ["tail", 0, 0]];
      // 대략적 핸들 위치(현재 앵커 기준) — 정밀하지 않아도 최근접이면 충분
      const handles = { body: [anchorX, rodY], head: [anchorX - S * 2.4, rodY], tail: [anchorX + S * 2.8, rodY] };
      let best = "body", bd = 1e9;
      for (const k in handles) { const d = Math.hypot(handles[k][0] - ptr.x, handles[k][1] - ptr.y); if (d < bd) { bd = d; best = k; } }
      grab = best;
    }
    if (ptr.down && grab) {
      if (Math.hypot(ptr.x - pressX, ptr.y - pressY) > S * 0.6) dragging = true;
      if (dragging) {
        charging = false;
        if (grab === "body") { anchorX = approach(anchorX, clamp(ptr.x, stage.x + S * 3, stage.x + stage.w - S * 3), 22, dt); anchorY = approach(anchorY, clamp(ptr.y, stage.y + S * 2, stage.floorY - S), 22, dt); }
        else if (grab === "head") headDrag = Math.atan2(ptr.y - (anchorY - S), ptr.x - (anchorX - S * 3.4));
        else if (grab === "tail") tailDrag = Math.atan2(ptr.y - (anchorY - S), ptr.x - (anchorX + S * 3));
      }
    }
    if (ptr.justUp) {
      if (grab && !dragging && ptr.downTime < 0.32) { charging = true; chargeT = 0; chargeDir = ptr.x < W / 2 ? -1 : 1; }
      grab = null; dragging = false;
    }
    const held = dragging && grab;

    // ---- 자동 공연 진행(잡고 있지 않을 때) ----
    if (!held && !charging) {
      phaseT += dt;
      if (phaseT > PHASES[phase][1]) { phaseT = 0; phase = (phase + 1) % PHASES.length; }
    }
    // ---- 돌진 시퀀스 ----
    if (charging) {
      chargeT += dt;
      const reach = reduced ? stage.w * 0.12 : stage.w * 0.3;
      const tx = chargeT < 0.9 ? stage.homeX + chargeDir * reach : stage.homeX;
      anchorX = approach(anchorX, clamp(tx, stage.x + S * 3, stage.x + stage.w - S * 3), 6, dt);
      if (chargeT > 1.8) charging = false;
    }

    // ---- 채널 접근 ----
    const tg = held ? { gait: grab === "body" ? 0.4 : 0, bob: 0.2, swing: 0, lift: ch.lift, mouth: ch.mouth, foot: 0.5, lean: 0 } : targets();
    for (const k in tg) ch[k] = approach(ch[k], tg[k], 4.5, dt);
    // 앵커 복귀(드래그·돌진 아닐 때)
    if (!held && !charging) { anchorX = approach(anchorX, stage.homeX, 3, dt); anchorY = approach(anchorY, stage.homeY, 3.5, dt); }
    if (grab !== "head") headDrag = 0;
    if (grab !== "tail") tailDrag = 0;
    walkPh += ch.gait * dt;
    bodyRot = approach(bodyRot, ch.lean + (reduced ? 0 : ch.bob * Math.sin(walkPh * Math.PI * 2) * 0.03), 8, dt);
    // 커튼 흔들림·무대 진동(돌진·울부짖음에 반응)
    const impulse = (charging ? 1 : 0) + ch.mouth * 0.5;
    ch.sway = approach(ch.sway, impulse * (reduced ? 0.4 : 1), 3, dt);
    shake = approach(shake, reduced ? impulse * 0.12 : impulse, 5, dt);

    // ---- 렌더 ----
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#140b08"; ctx.fillRect(0, 0, W, H);
    const shk = shake * (reduced ? 1 : 1) * S * 0.4;
    ctx.save();
    if (shk > 0.05) ctx.translate(Math.sin(T * 47) * shk, Math.cos(T * 41) * shk * 0.6);
    drawStage();
    drawBull();
    drawCurtains();
    ctx.restore();
  },

  dispose() { ctx = null; bg = null; bodyShape = headShape = hornA = hornB = earShape = null; jit = {}; },
};
