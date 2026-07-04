// js/pieces/11-composition-viii.js
// After Kandinsky — Composition VIII (1923). 절차적 기하 도형 + WebAudio.
// 크림색 캔버스 위 칸딘스키 어휘의 도형들이 부유·회전하고, 클릭하면 악기처럼 울린다.

let ctx = null, W = 0, H = 0, S = 0, T = 0, reduced = false;
let audio = null, actx = null, audioTried = false;
let shapes = [], ripples = [], trail = [];
let minM = 1, maxM = 1;
let tex = null;              // 캐시된 미세 텍스처 오프스크린
let wasDown = false;

// 팔레트
const INK = "#1a1a1a", RED = "#d4452f", BLU = "#2b5aa0", YEL = "#e8b430", PUR = "#7a4a8f";
const CREAM = "#ece5d3";
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// 파형 매핑 (도형 종류별)
function waveOf(type) {
  if (type === "triangle") return "triangle";
  if (type === "line") return "square";
  if (type === "checker") return "square";
  return "sine"; // circle, arc
}

// 도형 스펙 생성: 정규화 좌표(nx,ny)로 저장 → 리사이즈 시 픽셀 재계산
function buildShapes() {
  const list = [];
  // 대형 동심원 2개 (보라/검정/주황 겹)
  list.push({ type: "circle", nx: 0.24, ny: 0.30, rf: 0.12,
    discs: [{ r: 1.0, c: PUR }, { r: 0.64, c: INK }, { r: 0.32, c: YEL }] });
  list.push({ type: "circle", nx: 0.72, ny: 0.66, rf: 0.10,
    discs: [{ r: 1.0, c: INK }, { r: 0.66, c: RED }, { r: 0.30, c: CREAM }] });
  // 소형 원 4개
  const smalls = [[0.50, 0.18, RED], [0.85, 0.24, BLU], [0.13, 0.72, YEL], [0.60, 0.44, PUR]];
  for (const [x, y, c] of smalls) list.push({ type: "circle", nx: x, ny: y, rf: rand(0.024, 0.038),
    discs: [{ r: 1.0, c }, { r: 0.5, c: INK }] });
  // 예각 삼각형 3개
  list.push({ type: "triangle", nx: 0.42, ny: 0.62, rf: 0.10, c: BLU });
  list.push({ type: "triangle", nx: 0.80, ny: 0.40, rf: 0.075, c: YEL });
  list.push({ type: "triangle", nx: 0.30, ny: 0.85, rf: 0.065, c: RED });
  // 사선 직선 다발 4개
  const lines = [[0.55, 0.72, -0.7], [0.66, 0.30, 0.5], [0.18, 0.50, 1.2], [0.90, 0.80, -0.3]];
  for (const [x, y, a] of lines) list.push({ type: "line", nx: x, ny: y, rf: rand(0.16, 0.24), ang0: a,
    c: Math.random() < 0.5 ? INK : pick([RED, BLU]) });
  // 호(arc) 2개
  list.push({ type: "arc", nx: 0.36, ny: 0.20, rf: 0.11, a0: 0.2, a1: 2.6, c: RED });
  list.push({ type: "arc", nx: 0.68, ny: 0.86, rf: 0.09, a0: 3.4, a1: 5.6, c: BLU });
  // 체크 격자 작은 사각형 1묶음
  list.push({ type: "checker", nx: 0.92, ny: 0.52, rf: 0.020, c: INK });

  // 공통 초기 상태 부여
  for (const s of list) {
    s.pph = rand(0, 6.28); s.pph2 = rand(0, 6.28);
    s.ds = rand(0.18, 0.42); s.ds2 = rand(0.18, 0.42);
    s.rot = rand(0, 6.28); s.rotSpeed = rand(-0.12, 0.12);
    s.ang = s.ang0 || 0;
    s.scale = 1; s.sv = 0;                 // 펄스 스프링
    s.px = 0; s.py = 0; s.pvx = 0; s.pvy = 0; // 회피 밀림
    s.dx = 0; s.dy = 0;
  }
  return list;
}

// 픽셀 좌표/크기 재계산 + 주파수 매핑 범위 산출
function layout() {
  S = Math.min(W, H);
  minM = Infinity; maxM = -Infinity;
  for (const s of shapes) {
    s.x = s.nx * W; s.y = s.ny * H;
    s.size = s.rf * S;
    s.metric = s.type === "line" ? s.size * 0.42 : s.type === "checker" ? s.size * 2 : s.size;
    if (s.metric < minM) minM = s.metric;
    if (s.metric > maxM) maxM = s.metric;
  }
  if (maxM <= minM) maxM = minM + 1;
  buildTexture();
}

// 종이질감: 크림 배경 + 미세 반점 (init/resize에서 1회 캐시)
function buildTexture() {
  const c = document.createElement("canvas");
  c.width = Math.max(1, W | 0); c.height = Math.max(1, H | 0);
  const g = c.getContext("2d");
  g.fillStyle = CREAM; g.fillRect(0, 0, c.width, c.height);
  const n = ((W * H) / 900) | 0;
  for (let i = 0; i < n; i++) {
    const dark = Math.random() < 0.5;
    g.fillStyle = dark ? "rgba(80,70,55,0.05)" : "rgba(255,255,255,0.06)";
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 1.4, 1.4);
  }
  tex = c;
}

// 현재 렌더 중심 (기준 + 부유 드리프트 + 회피 밀림)
function cx(s) { return s.x + s.dx + s.px; }
function cy(s) { return s.y + s.dy + s.py; }

// 히트 테스트: 도형별 근사
function hit(s, x, y) {
  const dx = x - cx(s), dy = y - cy(s);
  if (s.type === "line") {
    // 세그먼트까지 거리
    const a = s.rot + s.ang, hx = Math.cos(a) * s.size * 0.5, hy = Math.sin(a) * s.size * 0.5;
    const len2 = hx * hx + hy * hy || 1;
    let t = clamp((dx * hx + dy * hy) / len2, -1, 1);
    const px = dx - hx * t, py = dy - hy * t;
    return Math.hypot(px, py) < 10 + s.size * 0.03;
  }
  const d = Math.hypot(dx, dy);
  if (s.type === "checker") return d < s.size * 2.4;
  if (s.type === "arc") return Math.abs(d - s.size) < s.size * 0.22;
  return d < s.size * (s.type === "triangle" ? 0.7 : 1.0);
}

// 오디오: 첫 justDown에서 생성, 음소거면 skip
function ensureAudio() {
  if (audioTried) return;
  audioTried = true;
  if (!audio || !audio.enabled()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
  } catch (e) { actx = null; }
}
function playTone(s) {
  if (!actx) return;
  if (actx.state === "suspended") actx.resume();
  const t = (s.metric - minM) / (maxM - minM);
  const freq = clamp(180 + (1 - t) * 700, 180, 880);
  const now = actx.currentTime;
  const osc = actx.createOscillator(), g = actx.createGain();
  osc.type = waveOf(s.type);
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.08, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(g).connect(actx.destination);
  osc.start(now); osc.stop(now + 0.42);
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; audio = opts.audio || null;
    T = 0; ripples = []; trail = []; wasDown = false;
    audioTried = false; actx = null;
    shapes = buildShapes();
    layout();
  },

  tick(dt, ptr) {
    T += dt;
    const ampK = (reduced ? 0.5 : 1) * 0.015 * S;

    // 입력 반영
    if (ptr) {
      if (ptr.justDown) ensureAudio();
      // 드래그 궤적 수집
      if (ptr.down && ptr.inside) {
        const ns = !wasDown; // 스트로크 시작이면 이전 점과 잇지 않음
        const last = trail[trail.length - 1];
        if (ns || !last || Math.hypot(ptr.x - last.x, ptr.y - last.y) > 3)
          trail.push({ x: ptr.x, y: ptr.y, age: 0, gap: ns });
      }
      // 클릭 = 최상단 도형 펄스 + 톤 + 파문
      if (ptr.justDown && ptr.inside) {
        for (let i = shapes.length - 1; i >= 0; i--) {
          if (hit(shapes[i], ptr.x, ptr.y)) {
            const s = shapes[i];
            s.scale = 1.3;
            playTone(s);
            ripples.push({ x: ptr.x, y: ptr.y, r: s.size * 0.3, life: 1, c: s.discs ? s.discs[0].c : s.c });
            break;
          }
        }
      }
      wasDown = ptr.down;
    }

    // 시뮬레이션: 부유 드리프트 · 회전 · 펄스/회피 스프링
    for (const s of shapes) {
      s.dx = Math.sin(T * s.ds + s.pph) * ampK;
      s.dy = Math.cos(T * s.ds2 + s.pph2) * ampK;
      s.rot += s.rotSpeed * dt;
      // 펄스 스프링 (→1 복귀)
      s.sv += (60 * (1 - s.scale) - 12 * s.sv) * dt;
      s.scale += s.sv * dt;
      // 커서 반경 80px 회피 (구동형 스프링)
      let fx = 0, fy = 0;
      if (ptr && ptr.inside) {
        const ddx = cx(s) - ptr.x, ddy = cy(s) - ptr.y;
        const d = Math.hypot(ddx, ddy);
        if (d < 80) { const f = ((80 - d) / 80) * 900; fx = (ddx / (d || 1)) * f; fy = (ddy / (d || 1)) * f; }
      }
      s.pvx += (fx - 45 * s.px - 9 * s.pvx) * dt;
      s.pvy += (fy - 45 * s.py - 9 * s.pvy) * dt;
      s.px += s.pvx * dt; s.py += s.pvy * dt;
    }

    // 파문 · 궤적 수명
    for (const rp of ripples) { rp.r += 220 * dt; rp.life -= dt / 0.8; }
    ripples = ripples.filter((rp) => rp.life > 0);
    for (const p of trail) p.age += dt;
    trail = trail.filter((p) => p.age < 2);

    // ── 렌더 ──
    if (tex) ctx.drawImage(tex, 0, 0); else { ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H); }
    for (const s of shapes) drawShape(s);
    drawRipples();
    drawTrail();
  },

  resize(w, h) { W = w; H = h; layout(); },

  dispose() {
    if (actx) { try { actx.close(); } catch (e) {} }
    actx = null; audio = null; ctx = null;
    shapes = []; ripples = []; trail = []; tex = null;
  },
};

function drawShape(s) {
  ctx.save();
  ctx.translate(cx(s), cy(s));
  ctx.rotate(s.rot);
  ctx.scale(s.scale, s.scale);
  const R = s.size;
  if (s.type === "circle") {
    for (const d of s.discs) { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(0, 0, R * d.r, 0, 6.2832); ctx.fill(); }
  } else if (s.type === "triangle") {
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.65); ctx.lineTo(-R * 0.4, R * 0.45); ctx.lineTo(R * 0.42, R * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = Math.max(1, R * 0.02); ctx.strokeStyle = INK; ctx.stroke();
  } else if (s.type === "line") {
    ctx.rotate(s.ang);
    ctx.lineCap = "round";
    const lw = Math.max(1, S * 0.004);
    const gap = R * 0.05;
    for (let k = -1; k <= 1; k++) {
      ctx.strokeStyle = k === 0 ? s.c : INK;
      ctx.lineWidth = k === 0 ? lw * 1.4 : lw * 0.7;
      ctx.beginPath(); ctx.moveTo(-R * 0.5, k * gap); ctx.lineTo(R * 0.5, k * gap); ctx.stroke();
    }
  } else if (s.type === "arc") {
    ctx.strokeStyle = s.c; ctx.lineWidth = Math.max(2, R * 0.09); ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, 0, R, s.a0, s.a1); ctx.stroke();
  } else if (s.type === "checker") {
    const c = R, n = 3, off = -(n * c) / 2 + c / 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i + j) % 2 === 0) { ctx.fillStyle = s.c; ctx.fillRect(off + i * c - c / 2, off + j * c - c / 2, c, c); }
    }
  }
  ctx.restore();
}

function drawRipples() {
  for (const rp of ripples) {
    ctx.globalAlpha = clamp(rp.life, 0, 1) * 0.7;
    ctx.strokeStyle = rp.c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, 6.2832); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTrail() {
  ctx.lineWidth = 1.3; ctx.strokeStyle = INK; ctx.lineCap = "round";
  for (let i = 1; i < trail.length; i++) {
    const p = trail[i], q = trail[i - 1];
    if (p.gap) continue;
    ctx.globalAlpha = (1 - p.age / 2) * 0.55;
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
