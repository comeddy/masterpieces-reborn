// js/pieces/12-bull-puppet.js — After Lee Jung-seob, Bull (황소, c.1953)
// 이중섭 〈황소〉의 머리 클로즈업 구도를 가위로 오려낸 종이 인형으로 재해석한 막대 인형극.
// 소머리(+어깨)가 무대 개구부를 가득 채우는 주인공. 머리는 왼쪽을 향해 주둥이를 치켜들고
// 울부짖으며, 굵고 빠른 먹빛 윤곽·황토 붓질·주홍 노을로 강렬한 에너지를 낸다. 100% 절차적·무음.
// 유휴: 숨쉬기 → 머리 흔들기 → 울부짖기(턱 크게 벌림) 반복. 드래그: 머리 막대(기울임)·턱 막대(입).
// 클릭: 화면을 향해 들이받기(머리가 앞으로 커지며 울부짖음). reducedMotion 감쇠.

let W = 0, H = 0, ctx = null, T = 0, reduced = false;

// ---- 팔레트(주홍 노을 클로즈업 버전) ----
const INK = "#2a1a10";     // 굵은 먹빛 윤곽
const INK2 = "#5a3618";    // 근육 결 어두운 획
const PAPER = "#f6ecd4";   // 오려낸 종이 흰(크림) 절단면
const OCHRE = "#d68f2c";   // 황토 몸통
const OCHRE_D = "#93531a"; // 붓질 어두운 결
const OCHRE_H = "#f3d178"; // 붓질 밝은 결
const CREAM = "#efdca0";   // 뿔·귀 크림
const CREAM_H = "#fff2c8";
const RED = "#c8441f";     // 주홍 콧등·입술
const RED_D = "#7a1d0d";   // 입 안
const PINK = "#d98a5c";    // 콧구멍 안·살굿빛

// ---- 유틸 ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
function mulberry32(s) { return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function centroid(p) { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length]; }
function expand(p, c, px) { return p.map(([x, y]) => { const dx = x - c[0], dy = y - c[1], d = Math.hypot(dx, dy) || 1; return [x + dx / d * px, y + dy / d * px]; }); }
function bbox(p) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const q of p) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); } return { x: a, y: b, w: c - a, h: d - b }; }
function tracePath(p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
const rotL = (p, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a), dx = p[0] - cx, dy = p[1] - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
// 관절 체인을 폭 프로파일로 감싼 폴리곤(뿔·귀 두께)
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

// ---- 무대/변환 상태 ----
let stage = {};
let bg = null;
let s = 1;                 // 머리 월드 스케일(리사이즈+lunge+숨쉬기)
let ss = 1;                // 그림자 오프셋 스케일
let cx = 0, cy = 0;        // 머리 중심(월드)
let headRot = 0;           // 머리 기울임
let baseHU = 1;

// 애니메이션 채널(모두 dt 스프링)
const ch = { breath: 0, jaw: 0.05, lift: 0, lunge: 0, foot: 0.4, heave: 0, shakeG: 0, panx: 0, pany: 0 };
// 자동 공연
const PHASES = [["breathe", 5.0], ["shake", 4.0], ["bellow", 4.6]];
let phase = 0, phaseT = 0;
// 조종/들이받기
let grab = null, dragging = false, pressX = 0, pressY = 0;
let tiltDrag = 0, jawDrag = 0;
let charging = false, chargeT = 0;
let shake = 0;

// ---- 로컬 형태(머리 중심 기준, +x=오른쪽 y아래, 주둥이는 왼쪽 -x) ----
let HEAD, JAW, SHOULDER, EAR, HORN_L, HORN_R, NOSE, UPPER_LIP, LOWER_LIP, HINGE;
let seed = {};
function buildShapes() {
  HEAD = [
    [-1.46, -0.18], [-1.30, -0.44], [-0.95, -0.60], [-0.55, -0.74], [-0.10, -0.86],
    [0.40, -0.80], [0.86, -0.55], [1.10, -0.12], [1.06, 0.30], [0.55, 0.44],
    [0.08, 0.44], [-0.45, 0.30], [-0.95, 0.26], [-1.30, 0.24], [-1.54, 0.02],
  ];
  UPPER_LIP = [[0.08, 0.44], [-0.45, 0.30], [-0.95, 0.26], [-1.30, 0.24]];
  HINGE = [0.14, 0.42];
  JAW = [
    [0.14, 0.42], [0.05, 0.52], [-0.45, 0.52], [-0.95, 0.50], [-1.24, 0.44],
    [-1.02, 0.74], [-0.50, 0.90], [0.08, 0.92], [0.55, 0.82], [0.86, 0.60],
  ];
  LOWER_LIP = [[0.05, 0.52], [-0.45, 0.52], [-0.95, 0.50], [-1.24, 0.44]];
  SHOULDER = [
    [-1.78, 0.36], [-1.35, 0.20], [-0.70, 0.55], [0.10, 0.62], [0.85, 0.52],
    [1.45, 0.30], [1.82, 0.60], [1.88, 1.75], [-1.88, 1.75],
  ];
  EAR = [[0.94, -0.06], [1.48, -0.16], [1.62, 0.18], [1.14, 0.22]];
  // 뿔: 정수리에서 좌우로 벌어지는 리라형 초승달(밑동 굵고 끝 가늘게)
  HORN_L = limbPoly([[0.10, -0.82], [0.0, -1.14], [-0.15, -1.42], [-0.36, -1.60]],
                    [0.19, 0.14, 0.09, 0.045]);
  HORN_R = limbPoly([[0.52, -0.80], [0.76, -1.10], [1.08, -1.30], [1.40, -1.40]],
                    [0.20, 0.14, 0.09, 0.045]);
  // 콧등 주홍: 주둥이 앞을 크게 덮는 둥근 코(브러시처럼 유기적)
  NOSE = [[-1.50, -0.08], [-1.44, -0.30], [-1.28, -0.42], [-1.05, -0.36], [-0.88, -0.14],
          [-0.85, 0.08], [-0.95, 0.26], [-1.18, 0.32], [-1.40, 0.22], [-1.51, 0.04]];
  seed = {};
}
// 조각별 절단선 미세 지터(1회 고정)
function jitFor(key, n) {
  if (seed[key]) return seed[key];
  const r = mulberry32(key.length * 2654435761 + n * 40503 + 11);
  const a = []; for (let i = 0; i < n; i++) a.push([(r() - 0.5) * 0.03, (r() - 0.5) * 0.03, 0.5 + r()]);
  return (seed[key] = a);
}

// ---- 좌표 변환: 로컬 → 월드(스케일·회전·중심) ----
function tf(lx, ly) {
  const x = lx * s, y = ly * s, c = Math.cos(headRot), sn = Math.sin(headRot);
  return [cx + x * c - y * sn, cy + x * sn + y * c];
}
const mapPts = (arr, jkey) => {
  if (!jkey) return arr.map(p => tf(p[0], p[1]));
  const j = jitFor(jkey, arr.length);
  return arr.map((p, i) => tf(p[0] + j[i][0], p[1] + j[i][1]));
};

// ---- 렌더 헬퍼 ----
function streaks(b, ang, dark, light) {
  const bx = b.x + b.w / 2, by = b.y + b.h / 2, R = Math.hypot(b.w, b.h) / 2 + s * 0.15;
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx, gap = s * 0.06;
  ctx.lineWidth = Math.max(2, s * 0.035); ctx.lineCap = "round";
  for (let i = -9; i <= 9; i++) {
    ctx.strokeStyle = i % 2 ? light : dark; ctx.globalAlpha = 0.5;
    const o = i * gap;
    ctx.beginPath();
    ctx.moveTo(bx + px * o - dx * R, by + py * o - dy * R);
    ctx.lineTo(bx + px * o + dx * R, by + py * o + dy * R);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// 굵기 변화가 있는 먹빛 윤곽(이중섭 특유의 한 획)
function inkOutline(pts, jkey, base) {
  const j = jkey ? jitFor(jkey, pts.length) : null;
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = INK;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const wgt = j ? j[i][2] : 1;
    ctx.lineWidth = Math.max(2.2, base * (0.5 + wgt * 0.85));
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
}
function cutPiece(pts, jkey, streakAng, fill, dark, light) {
  const c = centroid(pts);
  ctx.save();
  ctx.shadowColor = "rgba(28,10,4,0.42)"; ctx.shadowBlur = 15 * ss; ctx.shadowOffsetX = 6 * ss; ctx.shadowOffsetY = 11 * ss;
  tracePath(expand(pts, c, s * 0.04 + 2)); ctx.fillStyle = PAPER; ctx.fill();
  ctx.restore();
  const b = bbox(pts);
  ctx.save(); tracePath(pts); ctx.clip();
  ctx.fillStyle = fill; ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  streaks(b, streakAng + headRot, dark, light);
  ctx.restore();
  inkOutline(pts, jkey, s * 0.055);
}

// ---- 무대(오프스크린 노을 배경막) ----
function bakeBackdrop() {
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(stage.w)); c.height = Math.max(2, Math.round(stage.h));
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, "#8a220e"); grd.addColorStop(0.4, "#bf3f18"); grd.addColorStop(0.72, "#d76e22"); grd.addColorStop(1, "#e79a38");
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  const glow = g.createRadialGradient(c.width * 0.5, c.height * 0.62, c.width * 0.04, c.width * 0.5, c.height * 0.62, c.width * 0.75);
  glow.addColorStop(0, "rgba(255,200,110,0.5)"); glow.addColorStop(1, "rgba(255,200,110,0)");
  g.fillStyle = glow; g.fillRect(0, 0, c.width, c.height);
  const r = mulberry32(53); g.lineCap = "round";
  for (let i = 0; i < 170; i++) {
    const y = r() * c.height, len = c.width * (0.14 + r() * 0.5), x = r() * c.width;
    g.strokeStyle = `rgba(${120 + r() * 95 | 0},${38 + r() * 42 | 0},${16 + r() * 22 | 0},${0.05 + r() * 0.12})`;
    g.lineWidth = 2 + r() * 8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y + (r() - 0.5) * 16, x + len, y); g.stroke();
  }
  bg = c;
}
function drawFrame() {
  const st = stage, t = st.frameT;
  ctx.fillStyle = "#241207";
  ctx.fillRect(st.x - t, st.y - t, st.w + t * 2, t);        // top
  ctx.fillRect(st.x - t, st.y + st.h, st.w + t * 2, t);     // bottom
  ctx.fillRect(st.x - t, st.y - t, t, st.h + t * 2);        // left
  ctx.fillRect(st.x + st.w, st.y - t, t, st.h + t * 2);     // right
  ctx.strokeStyle = "#b0863c"; ctx.lineWidth = 2; ctx.strokeRect(st.x - t, st.y - t, st.w + t * 2, st.h + t * 2);
  // 상단 양쪽 짧은 커튼(얇게)
  const sw = ch.shakeC || 0;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? st.x : st.x + st.w, cw = st.w * 0.13;
    for (let i = 0; i < 4; i++) {
      const fx = x0 - side * (i * cw / 4), wob = Math.sin(T * 1.4 + i) * st.w * 0.01 * sw;
      const g = ctx.createLinearGradient(fx - side * cw / 4, 0, fx, 0);
      g.addColorStop(0, "#460a0e"); g.addColorStop(0.5, "#7f1618"); g.addColorStop(1, "#460a0e");
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(fx, st.y); ctx.lineTo(fx - side * cw / 4, st.y);
      ctx.quadraticCurveTo(fx - side * cw / 4 + wob, st.y + st.h * 0.2, fx - side * cw / 4, st.y + st.h * 0.34);
      ctx.lineTo(fx + wob, st.y + st.h * 0.34); ctx.closePath(); ctx.fill();
    }
  }
}
function drawFootlights() {
  const st = stage, lit = clamp(0.3 + ch.foot, 0, 1.4);
  for (let i = 0; i < 5; i++) {
    const x = st.x + st.w * (i + 0.5) / 5, fy = st.y + st.h;
    const gl = ctx.createRadialGradient(x, fy, 4, x, fy - st.h * 0.4, st.h * 0.52);
    gl.addColorStop(0, `rgba(255,206,120,${0.42 * lit})`); gl.addColorStop(1, "rgba(255,206,120,0)");
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, fy, st.h * 0.34, Math.PI, 0); ctx.fill();
    ctx.fillStyle = `rgba(255,226,150,${0.8 * clamp(lit, 0, 1)})`;
    ctx.beginPath(); ctx.arc(x, fy - 3, Math.max(3, st.w * 0.006), 0, Math.PI * 2); ctx.fill();
  }
}

// ---- 인형(소머리 클로즈업) ----
function drawRod(anchor) {
  const bx = anchor[0] + (anchor[0] < cx ? -s * 0.15 : s * 0.15);
  const by = stage.y + stage.h + 4;
  ctx.strokeStyle = "rgba(66,44,26,0.92)"; ctx.lineWidth = Math.max(2.5, s * 0.032); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = "rgba(158,116,62,0.5)"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(bx, by); ctx.stroke();
}
function drawBull() {
  // ---- 변환 갱신 ----
  const breathe = reduced ? 0 : Math.sin(T * 0.9) * ch.breath * 0.02;
  s = baseHU * (1 + ch.lunge * 0.32 + breathe + ch.heave * 0.02);
  cx = stage.cx + ch.panx * s;
  cy = stage.cy + ch.pany * s + (reduced ? 0 : Math.sin(T * 0.9) * ch.breath * s * 0.02) - ch.lunge * s * 0.05;
  const shakeOsc = reduced ? 0 : Math.sin(T * 4.2) * ch.shakeG * 0.14;
  headRot = dragging && grab === "head" ? tiltDrag : (ch.lift * 0.13 + shakeOsc + (reduced ? 0 : Math.sin(T * 1.1) * 0.012));

  // 턱 벌림(드래그 또는 채널) — 힌지 기준 회전
  const jawOpen = (dragging && grab === "jaw") ? jawDrag : ch.jaw;
  const jawAng = -jawOpen * 0.62;
  const jawLocal = JAW.map(p => rotL(p, HINGE[0], HINGE[1], jawAng));
  const lowerLipLocal = LOWER_LIP.map(p => rotL(p, HINGE[0], HINGE[1], jawAng));

  // 1) 어깨/목(뒤) — 강한 수직 근육 결
  cutPiece(mapPts(SHOULDER, "sh"), "sh", 1.28, OCHRE, OCHRE_D, OCHRE_H);
  // 2) 막대(어깨 위, 머리/턱 뒤)
  drawRod(tf(0.92, -0.34));            // 머리 막대(뒤통수)
  drawRod(tf(-0.72, 0.98));            // 턱 막대(턱 아래)
  // 3) 귀(머리 뒤, 오른쪽)
  cutPiece(mapPts(EAR, "ear"), "ear", 0.4, CREAM, OCHRE_D, CREAM_H);
  // 4) 머리(위턱·주둥이·이마)
  const headW = mapPts(HEAD, "head");
  cutPiece(headW, "head", 2.75, OCHRE, OCHRE_D, OCHRE_H);
  // 근육 결 강조 획(머리 안쪽)
  ctx.save(); tracePath(headW); ctx.clip();
  ctx.strokeStyle = INK2; ctx.globalAlpha = 0.55; ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, s * 0.045);
  const accents = [[[-0.9, -0.5], [-0.4, -0.2], [0.2, -0.3]], [[-1.1, 0.0], [-0.6, 0.1], [-0.1, 0.05]], [[0.5, -0.4], [0.7, 0.0], [0.6, 0.34]]];
  for (const a of accents) { const p = a.map(q => tf(q[0], q[1])); ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.quadraticCurveTo(p[1][0], p[1][1], p[2][0], p[2][1]); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.restore();
  // 콧등 주홍
  const noseW = mapPts(NOSE);
  tracePath(noseW); ctx.fillStyle = RED; ctx.fill();
  inkOutline(noseW, null, s * 0.04);
  // 5) 입 안(위입술 + 벌어진 아래입술) — 어둡게
  const cavity = UPPER_LIP.map(p => tf(p[0], p[1])).concat(lowerLipLocal.map(p => tf(p[0], p[1])).reverse());
  tracePath(cavity); ctx.fillStyle = RED_D; ctx.fill();
  if (jawOpen > 0.12) { // 혀
    const tp = tf(-0.55, 0.5 + jawOpen * 0.18);
    ctx.fillStyle = RED; ctx.beginPath(); ctx.ellipse(tp[0], tp[1], s * 0.32, s * (0.08 + jawOpen * 0.12), headRot, 0, Math.PI * 2); ctx.fill();
  }
  // 6) 아래턱(힌지 회전)
  cutPiece(jawLocal.map(p => tf(p[0], p[1])), "jaw", 2.5, OCHRE, OCHRE_D, OCHRE_H);
  // 7) 뿔(정수리 위, 또렷이)
  cutPiece(mapPts(HORN_R), "hornR", 5.6, CREAM, OCHRE_D, CREAM_H);
  cutPiece(mapPts(HORN_L), "hornL", 4.4, CREAM, OCHRE_D, CREAM_H);
  // 8) 눈(크고 검은 눈 + 흰 반점) + 콧구멍
  const eye = tf(0.14, -0.32);
  ctx.save(); ctx.translate(eye[0], eye[1]); ctx.rotate(headRot - 0.16);
  ctx.fillStyle = "#f7ead0"; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.27, s * 0.185, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(-s * 0.05, s * 0.0, s * 0.16, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-s * 0.10, -s * 0.06, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(2.6, s * 0.055); ctx.strokeStyle = INK; ctx.lineCap = "round";
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.3, s * 0.205, 0, Math.PI * 0.96, Math.PI * 2.02); ctx.stroke();  // 두터운 윗눈꺼풀
  ctx.lineWidth = Math.max(1.8, s * 0.03);
  ctx.beginPath(); ctx.ellipse(0, s * 0.02, s * 0.29, s * 0.2, 0, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  ctx.restore();
  const nostril = tf(-1.16, 0.0);
  ctx.save(); ctx.translate(nostril[0], nostril[1]); ctx.rotate(headRot);
  ctx.fillStyle = RED_D; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.075, s * 0.13, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PINK; ctx.beginPath(); ctx.ellipse(-s * 0.01, s * 0.02, s * 0.03, s * 0.06, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---- 자동 공연 목표 ----
function targets() {
  const rm = reduced ? 0.4 : 1;
  if (charging) return { breath: 0.2, jaw: 0.85, lift: 0.7 * rm, lunge: 1, foot: 1.25, heave: 0.8 * rm, shakeG: 0, panx: 0, pany: 0 };
  const name = PHASES[phase][0], d = PHASES[phase][1];
  if (name === "breathe") return { breath: 1 * rm, jaw: 0.06, lift: 0.05, lunge: 0, foot: 0.4, heave: 0.15 * rm, shakeG: 0, panx: 0, pany: 0 };
  if (name === "shake") return { breath: 0.5 * rm, jaw: 0.1, lift: 0.12, lunge: 0, foot: 0.46, heave: 0.2 * rm, shakeG: 1 * rm, panx: 0, pany: 0 };
  // bellow: 고조 → 유지 → 이완
  const e = phaseT < d * 0.35 ? phaseT / (d * 0.35) : phaseT > d * 0.78 ? Math.max(0, 1 - (phaseT - d * 0.78) / (d * 0.22)) : 1;
  return { breath: 0.3, jaw: e, lift: 0.55 * e * rm, lunge: 0.14 * e, foot: 0.4 + e * 0.95, heave: e * rm, shakeG: 0, panx: 0, pany: 0 };
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height; reduced = !!opts.reducedMotion;
    T = 0; phase = 0; phaseT = 0; headRot = 0;
    grab = null; dragging = false; charging = false; chargeT = 0; shake = 0; tiltDrag = 0; jawDrag = 0;
    for (const k in ch) ch[k] = 0; ch.jaw = 0.05; ch.foot = 0.4;
    this.resize(W, H);
  },

  resize(w, h) {
    W = w; H = h;
    const t = Math.max(6, Math.min(w, h) * 0.02);
    const sx = t + w * 0.03, sy = t + h * 0.04, sw = w - 2 * (t + w * 0.03), sh = h - 2 * (t + h * 0.04);
    stage = { x: sx, y: sy, w: sw, h: sh, frameT: t, cx: sx + sw * 0.5, cy: sy + sh * 0.46 };
    ss = clamp(Math.min(w, h) / 900, 0.6, 1.4);
    baseHU = Math.min(sw / 3.4, sh / 3.15);   // 로컬 폭 3.4/높이 3.15가 개구부를 가득 채움
    buildShapes();
    bakeBackdrop();
  },

  tick(dt, ptr) {
    T += dt;
    // ---- 입력 ----
    if (ptr.justDown) {
      pressX = ptr.x; pressY = ptr.y; dragging = false;
      // 최근접 조종부: 턱 앞(입) vs 머리 중심
      const jawP = tf(-0.7, 0.9), headP = [cx, cy];
      grab = Math.hypot(jawP[0] - ptr.x, jawP[1] - ptr.y) < Math.hypot(headP[0] - ptr.x, headP[1] - ptr.y) * 0.75 ? "jaw" : "head";
    }
    if (ptr.down && grab) {
      if (Math.hypot(ptr.x - pressX, ptr.y - pressY) > s * 0.08) dragging = true;
      if (dragging) {
        charging = false;
        if (grab === "head") {
          tiltDrag = clamp(Math.atan2(ptr.y - stage.cy, -(ptr.x - stage.cx)) * 0.5, -0.5, 0.6);
          ch.panx = approach(ch.panx, clamp((ptr.x - stage.cx) / s, -0.7, 0.7), 16, dt);
          ch.pany = approach(ch.pany, clamp((ptr.y - stage.cy) / s, -0.5, 0.5), 16, dt);
        } else {
          jawDrag = clamp(Math.hypot(ptr.x - tf(0.14, 0.42)[0], ptr.y - tf(0.14, 0.42)[1]) / s * 0.7, 0, 1);
        }
      }
    }
    if (ptr.justUp) {
      if (grab && !dragging && ptr.downTime < 0.32) { charging = true; chargeT = 0; }
      grab = null; dragging = false;
    }
    const held = dragging && grab;

    // ---- 자동 공연 진행 ----
    if (!held && !charging) {
      phaseT += dt;
      if (phaseT > PHASES[phase][1]) { phaseT = 0; phase = (phase + 1) % PHASES.length; }
    }
    // ---- 들이받기 시퀀스 ----
    if (charging) { chargeT += dt; if (chargeT > (reduced ? 1.1 : 0.95)) charging = false; }

    // ---- 채널 접근 ----
    let tg;
    if (held && grab === "head") tg = { breath: 0.3, jaw: ch.jaw, lift: ch.lift, lunge: ch.lunge, foot: 0.5, heave: 0.3, shakeG: 0, panx: ch.panx, pany: ch.pany };
    else if (held) tg = { breath: 0.3, jaw: jawDrag, lift: 0.1, lunge: 0, foot: 0.5, heave: 0.3, shakeG: 0, panx: 0, pany: 0 };
    else tg = targets();
    for (const k in tg) ch[k] = approach(ch[k], tg[k], 5, dt);
    if (grab !== "head") { tiltDrag = approach(tiltDrag, 0, 4, dt); }
    if (grab !== "jaw") jawDrag = approach(jawDrag, ch.jaw, 6, dt);
    if (!held) { ch.panx = approach(ch.panx, 0, 3, dt); ch.pany = approach(ch.pany, 0, 3, dt); }
    // 무대 진동/커튼(들이받기·울부짖음에 반응)
    const impulse = (charging ? 1 : 0) + ch.jaw * 0.4;
    ch.shakeC = approach(ch.shakeC || 0, impulse * (reduced ? 0.3 : 1), 3, dt);
    shake = approach(shake, reduced ? impulse * 0.12 : impulse * 0.7, 5, dt);

    // ---- 렌더 ----
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#140b08"; ctx.fillRect(0, 0, W, H);
    ctx.save();
    const shk = shake * s * 0.06;
    if (shk > 0.05) ctx.translate(Math.sin(T * 46) * shk, Math.cos(T * 39) * shk * 0.6);
    // 개구부 클립 → 배경막 → 소 → 각광
    ctx.save();
    ctx.beginPath(); ctx.rect(stage.x, stage.y, stage.w, stage.h); ctx.clip();
    ctx.drawImage(bg, stage.x, stage.y, stage.w, stage.h);
    ctx.fillStyle = "rgba(18,6,16,0.12)"; ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
    drawBull();
    drawFootlights();
    ctx.restore();
    drawFrame();
    ctx.restore();
  },

  dispose() { ctx = null; bg = null; HEAD = JAW = SHOULDER = EAR = HORN_L = HORN_R = NOSE = null; seed = {}; },
};
