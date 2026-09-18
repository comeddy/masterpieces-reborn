// js/pieces/11-tree-of-life.js
// After Klimt — The Tree of Life (Stoclet Frieze, 1905–09). 절차적 성장 + WebAudio.
// 크림·금빛 프리즈 위에서 로그 나선 가지가 자라나고, 클릭하면 새 가지가 돋아 펼쳐진다.
// 가지엔 클림트의 눈·삼각형·원반 모티프가 점점이 박히고, 검은 새 한 마리가 가지를 옮겨 앉는다.

let ctx = null, W = 0, H = 0, S = 0, T = 0, reduced = false;
let audio = null, actx = null, wasDown = false;
let bg = null;                          // 배경(크림 모자이크) 오프스크린 베이크
let trunk = [];                         // 줄기 중심선 정점
let branches = [], shimmer = [];
let bird = null;
let baseX = 0, baseY = 0;
let windX = 0, windV = 0;               // 전역 바람(스프링)
let spawnAcc = 0, shimAcc = 0, birdAcc = 0, nextSpawn = 2, nextBird = 8;
let cam = null, track = null;           // 공용 카메라 getter(opts.cam)와 손 추적 상태(makeHandTrack)
let handOn = false, handAcc = 0, handShimAcc = 0;
let hx = null, hy = null;               // 이번 프레임 손의 캔버스 좌표(없으면 null)
const SWEEP = 0.6;                      // 휘두름 판정 속도(정규화 단위/초) — 이상이면 발아 대신 바람만
const NEAR_R = 0.22, NEAR_BOOST = 2.5;  // 손 반경 S*NEAR_R 안 가지의 성장 가속

const CAP = 78;                         // 가지 수 상한
const CREAM = "#e7d9b9", CREAM2 = "#f2e9cf";
const BR_DK = "#5f4d1e", BRONZE = "#957a2f", GOLD = "#c6a53a", GOLD_HI = "#e6cd6c";
const EYE_W = "#f3ecd6", RING = "#241d10", BLACK = "#161109";
const TEAL = "#2f7d68", BLUE = "#3a5a86", ROSE = "#c25c6d", DISC = "#b6ad98";

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

// ── 손 추적 순수 계산부 (export — node:test 대상, 브라우저 API 미참조) ────────
// pt는 공용 cam.hands()의 주 손 좌표 {x,y}(거울 보정 후 0..1) 또는 null(손 없음).
// 위치는 EMA 스무딩, 속도는 스무딩 위치의 차분을 다시 EMA(정규화 단위/초).
// present는 PRESENT_AFTER초 연속 검출 후 켜지고 LOST_AFTER초 연속 미검출 후 꺼진다(프레임 드랍 흡수).
export const SMOOTH_RATE = 14, VEL_RATE = 10, PRESENT_AFTER = 0.05, LOST_AFTER = 0.35;

export function makeHandTrack() {
  return { present: false, x: 0.5, y: 0.5, vx: 0, vy: 0, seenT: 0, lostT: 0, init: false };
}

export function handTrackStep(s, pt, dt) {
  if (dt <= 0) return s;
  const kv = 1 - Math.exp(-VEL_RATE * dt);
  if (pt) {
    if (!s.init || !s.present) {          // 첫 검출·부재 후 재등장: 옛 위치에서 날아오지 않도록 점프, 속도 0
      s.x = pt.x; s.y = pt.y; s.vx = 0; s.vy = 0; s.init = true;
    } else {
      const k = 1 - Math.exp(-SMOOTH_RATE * dt);
      const nx = s.x + (pt.x - s.x) * k, ny = s.y + (pt.y - s.y) * k;
      s.vx += ((nx - s.x) / dt - s.vx) * kv;
      s.vy += ((ny - s.y) / dt - s.vy) * kv;
      s.x = nx; s.y = ny;
    }
    s.seenT += dt; s.lostT = 0;
    if (s.seenT >= PRESENT_AFTER) s.present = true;
  } else {
    s.lostT += dt; s.seenT = 0;
    s.vx -= s.vx * kv; s.vy -= s.vy * kv;   // 위치는 유지, 속도만 0으로 감쇠
    if (s.lostT >= LOST_AFTER) s.present = false;
  }
  return s;
}

// ── 로그 나선 한 점 (미변형 기준 좌표) ─────────────────
// b.cx,cy = 감김 중심, R0 = 시작 반지름, th0 = 시작각, dir = 감김 방향, k = 조임, span = 총 회전각
function spiralPt(b, f) {
  const s = f * b.span;
  const r = b.R0 * Math.exp(-b.k * s);
  const th = b.th0 + b.dir * s;
  return { x: b.cx + r * Math.cos(th), y: b.cy + r * Math.sin(th) };
}
// 가지 두께(시작 굵고 끝 가늘게)
function widthAt(b, f) { return b.w0 * (0.16 + 0.84 * (1 - f)); }

// 바람+미세호흡 변형: 위쪽일수록 크게 흔들림 (줄기·가지·새 공통 적용 → 붙어서 움직임)
function swayX(x, y) {
  const h = clamp((baseY - y) / (baseY - H * 0.14), 0, 1);
  const idle = (reduced ? 0.35 : 1) * S * 0.006 * Math.sin(T * 0.55 + x * 0.004);
  return (windX + idle) * h * h;
}

// ── 줄기 생성 ─────────────────────────────────────────
function buildTrunk() {
  trunk = [];
  baseX = W * 0.5; baseY = H + S * 0.02;
  const topX = W * 0.5 + S * 0.03, topY = H * 0.46;
  const wob = S * 0.045;
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    const x = baseX + (topX - baseX) * v + Math.sin(v * 3.1) * wob * (1 - v);
    const y = baseY + (topY - baseY) * v;
    const w = (S * 0.036) * (1 - 0.72 * v) + S * 0.010;
    trunk.push({ x, y, w, v });
  }
}
function trunkPt(v) {
  const i = clamp(Math.round(v * (trunk.length - 1)), 0, trunk.length - 1);
  return trunk[i];
}

// ── 가지 생성 ─────────────────────────────────────────
function makeBranch(px, py, reach, reachLen, turns, depth, parent) {
  const R0 = reachLen;                  // 감김 반지름 = 뻗는 거리
  const w0 = Math.max(S * 0.006, reachLen * 0.072);   // 두께는 크기에 비례
  const span = turns * TAU;
  const tipFrac = rnd(0.05, 0.09);
  const b = {
    cx: px + R0 * Math.cos(reach), cy: py + R0 * Math.sin(reach),
    R0, th0: reach + Math.PI, dir: Math.random() < 0.5 ? 1 : -1,
    k: -Math.log(tipFrac) / span, span, w0,
    grow: 0, rate: (reduced ? 0.6 : 1) * rnd(0.16, 0.26),
    depth, parent, kids: 0, age: 0, chimed: false, fade: 1, dying: false,
    motifs: [],
  };
  const mn = 2 + (Math.random() * 4 | 0);
  for (let i = 0; i < mn; i++) {
    const r = Math.random();
    const type = r < 0.42 ? "eye" : r < 0.66 ? "oval" : r < 0.82 ? "tri"
      : (depth <= 1 && r < 0.94) ? "disc" : "blue";
    b.motifs.push({ f: rnd(0.12, 0.96), type, rot: rnd(0, TAU), ph: rnd(0, TAU) });
  }
  if (parent) parent.kids++;
  branches.push(b);
  return b;
}

// 성숙한 가지의 한 점에서 바깥·위로 뻗는 새 가지
function sprout(fromClick, cx0, cy0) {
  const mature = branches.filter((b) => b.grow > 0.5 && b.depth < 4 && !b.dying);
  if (!mature.length) return null;
  let host, f, p;
  if (fromClick) {
    // 클릭 지점에서 가장 가까운 가지 점
    let best = 1e9;
    for (const b of branches) {
      if (b.dying) continue;
      for (let t = 0.1; t <= 0.9; t += 0.2) {
        const q = spiralPt(b, t * b.grow);
        const d = Math.hypot(q.x - cx0, q.y - cy0);
        if (d < best) { best = d; host = b; f = t * b.grow; }
      }
    }
    if (!host) return null;
    p = spiralPt(host, f);
  } else {
    host = mature[Math.random() * mature.length | 0];
    f = rnd(0.15, 0.62); p = spiralPt(host, f * host.grow);
  }
  // 뻗는 방향: 위쪽 편향 + (클릭이면 커서 쪽 살짝)
  let reach = -Math.PI / 2 + rnd(-0.9, 0.9);
  if (fromClick) {
    const toC = Math.atan2(cy0 - p.y, cx0 - p.x);
    reach = Math.atan2(Math.sin(reach) * 0.6 + Math.sin(toC) * 0.4,
                       Math.cos(reach) * 0.6 + Math.cos(toC) * 0.4);
  }
  const reachLen = host.R0 * rnd(0.48, 0.72) * (fromClick ? 1.2 : 1);
  const b = makeBranch(p.x, p.y, reach, reachLen, rnd(1.3, 2.4), host.depth + 1, host);
  if (fromClick) b.rate *= 1.5;         // 클릭 발아는 좀 더 빠르게
  return b;
}

// ── 오디오: 첫 pointer.justDown 이후, 사운드 ON일 때만 생성 ─────
function ensureAudio() {
  if (actx || !audio || !audio.enabled()) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
}
function chime(f) {
  if (!actx || !audio || !audio.enabled()) return;
  if (actx.state === "suspended") actx.resume();
  const now = actx.currentTime;
  const base = 320 + f * 520;           // 가지 두께에 따라 음높이 차이
  for (const [mul, amp] of [[1, 0.06], [2.01, 0.03], [3.02, 0.014]]) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(base * mul, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(amp, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    o.connect(g).connect(actx.destination);
    o.start(now); o.stop(now + 1.7);
  }
}

// ── 배경 베이크: 크림 그라데이션 + 미세 반점 + 바닥 꽃밭 모자이크 ─
function bake() {
  bg = document.createElement("canvas");
  bg.width = Math.max(1, W | 0); bg.height = Math.max(1, H | 0);
  const g = bg.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, CREAM2); grd.addColorStop(0.6, CREAM); grd.addColorStop(1, "#ddcba6");
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // 프리즈풍 미세 반점(작은 사각/점)
  const n = ((W * H) / 1300) | 0;
  for (let i = 0; i < n; i++) {
    const bright = Math.random() < 0.5;
    g.fillStyle = bright ? "rgba(255,246,214,0.10)" : "rgba(120,98,52,0.06)";
    const s = Math.random() < 0.3 ? 2.2 : 1.3;
    g.fillRect(Math.random() * W, Math.random() * H, s, s);
  }
  // 옅은 연필 격자(원작이 밑그림/카툰인 흔적)
  g.strokeStyle = "rgba(90,70,40,0.05)"; g.lineWidth = 1;
  const gs = S * 0.13;
  for (let x = 0; x < W; x += gs) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += gs) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // 바닥 꽃밭 모자이크 띠
  const gy = H * 0.9;
  g.fillStyle = "#3c5340"; g.fillRect(0, gy, W, H - gy);
  const cols = ["#c25c6d", "#e0b64a", "#3a5a86", "#7c5a9a", "#d8e0c4", "#cf7f8e", "#2f7d68"];
  const cell = Math.max(7, S * 0.02);
  for (let y = gy; y < H; y += cell) for (let x = 0; x < W; x += cell) {
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.globalAlpha = rnd(0.55, 0.95);
    if (Math.random() < 0.5) { g.beginPath(); g.arc(x + cell / 2, y + cell / 2, cell * 0.34, 0, TAU); g.fill(); }
    else g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
  }
  g.globalAlpha = 1;
}

function layout() {
  S = Math.min(W, H);
  buildTrunk();
  bake();
}

// ── 초기 나무 심기 ────────────────────────────────────
function plant() {
  branches = []; shimmer = [];
  const primaries = 9;
  for (let i = 0; i < primaries; i++) {
    const v = 0.44 + (i / primaries) * 0.56;    // 줄기 위쪽을 따라 부착
    const p = trunkPt(v);
    const side = i % 2 ? 1 : -1;
    // 아래쪽 가지는 크고 옆으로 넓게, 위쪽 가지는 작고 위로 → 캔버스를 폭넓게 채움
    const spread = rnd(0.5, 1.7) * (1.2 - v * 0.55);
    const reach = -Math.PI / 2 + side * spread;
    const reachLen = S * rnd(0.15, 0.22) * (1.15 - v * 0.35);
    const b = makeBranch(p.x, p.y, reach, reachLen, rnd(1.7, 2.7), 1, null);
    b.grow = rnd(0.1, 0.4);                      // 진입 후 눈에 띄게 자라도록 작게 시작
  }
  // 검은 새: 성숙 가지에 앉힘
  bird = { x: W * 0.7, y: H * 0.4, tx: W * 0.7, ty: H * 0.4, ox: 0, oy: 0,
           t: 1, host: null, f: 0.5, face: -1 };
  perchBird(true);
}

function perchBird(instant) {
  const cand = branches.filter((b) => b.grow > 0.6 && b.depth <= 2 && !b.dying);
  if (!cand.length) return;
  const b = cand[Math.random() * cand.length | 0];
  const f = rnd(0.25, 0.7);
  const p = spiralPt(b, f * b.grow);
  bird.host = b; bird.f = f;
  bird.ox = bird.x; bird.oy = bird.y;
  bird.tx = p.x; bird.ty = p.y - b.w0 * 0.4;
  bird.t = instant ? 1 : 0;
  if (instant) { bird.x = bird.tx; bird.y = bird.ty; }
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; audio = opts.audio || null;
    T = 0; actx = null; wasDown = false;
    windX = 0; windV = 0; spawnAcc = 0; shimAcc = 0; birdAcc = 0;
    nextSpawn = rnd(1.2, 2.4); nextBird = rnd(7, 12);
    cam = opts.cam || null; track = makeHandTrack();
    handOn = false; handAcc = 0; handShimAcc = 0; hx = hy = null;
    layout();
    plant();
  },

  tick(dt, ptr) {
    T += dt;

    // ── 입력: 카메라 손이 보이면 손이 입력원, 아니면 마우스 폴백 ──
    let pt = null;
    if (cam && cam.active()) {                                      // hands()는 tick당 정확히 1회(프레임당 1회 탐지 계약)
      const h = cam.hands();
      if (h && h.n >= 1) pt = { x: h.x, y: h.y };
    }
    handTrackStep(track, pt, dt);
    if (track.present) {
      hx = track.x * W; hy = track.y * H;
      const speed = Math.hypot(track.vx, track.vy);                 // 정규화 단위/초 — 해상도 무관
      if (!handOn) { ensureAudio(); sprout(true, hx, hy); handAcc = 0; }   // 손 첫 등장 = 클릭 1회
      windV += track.vx * W * dt * (reduced ? 6 : 14);              // 드래그 dx·14와 같은 체감 (dx ≈ vx·W·dt)
      if (speed < SWEEP) {                                          // 머무름 → 주기 발아
        handAcc += dt;
        if (handAcc >= (reduced ? 1.1 : 0.6)) { handAcc = 0; sprout(true, hx, hy); }
      } else handAcc = 0;                                           // 휘두름 → 바람만
      handOn = true;
      if (ptr) wasDown = ptr.down;                                  // 마우스 복귀 시 stale 드래그 방지
    } else {
      handOn = false; hx = hy = null;
      if (ptr) {
        if (ptr.justDown) ensureAudio();
        if (ptr.justDown && ptr.inside) sprout(true, ptr.x, ptr.y); // 클릭 = 새 가지 발아
        if (ptr.down && ptr.inside && wasDown)                      // 드래그 = 바람
          windV += ptr.dx * (reduced ? 6 : 14);
        wasDown = ptr.down;
      }
    }
    // 바람 스프링(0으로 복귀)
    const K = 7, D = reduced ? 5 : 3.2;
    windV += (-K * windX - D * windV) * dt;
    windX = clamp(windX + windV * dt, -S * 0.09, S * 0.09);

    // ── 성장 ──
    for (const b of branches) {
      b.age += dt;
      if (b.grow < 1) {
        let rate = b.rate;
        if (hx !== null) {                                          // 손 가까운 가지가 먼저 피어난다
          const q = spiralPt(b, b.grow);
          if (Math.hypot(q.x - hx, q.y - hy) < S * NEAR_R) rate *= NEAR_BOOST;
        }
        b.grow = Math.min(1, b.grow + rate * dt);
        if (b.grow >= 1 && !b.chimed) { b.chimed = true; chime(1 - b.w0 / (S * 0.03)); }
      }
      if (b.dying) b.fade = Math.max(0, b.fade - dt / 1.3);
    }
    // 유휴 발아
    spawnAcc += dt;
    if (spawnAcc >= nextSpawn) {
      spawnAcc = 0; nextSpawn = rnd(reduced ? 3 : 1.6, reduced ? 5 : 3);
      if (branches.length < CAP) sprout(false);
    }
    // 상한 초과 시 오래된 잎가지 서서히 정리
    if (branches.length > CAP) {
      let victim = null;
      for (const b of branches)
        if (!b.dying && b.kids === 0 && b.depth >= 2 && (!victim || b.age > victim.age)) victim = b;
      if (victim) victim.dying = true;
    }
    branches = branches.filter((b) => {
      if (b.dying && b.fade <= 0) { if (b.parent) b.parent.kids--; return false; }
      return true;
    });

    // 금박 반짝임
    if (!reduced) {
      shimAcc += dt;
      if (shimAcc >= 0.12) {
        shimAcc = 0;
        const b = branches[Math.random() * branches.length | 0];
        if (b && b.grow > 0.2) {
          const p = spiralPt(b, rnd(0.05, 0.95) * b.grow);
          shimmer.push({ x: p.x, y: p.y, life: 1, sz: rnd(1.5, 3.5) * (S / 700) });
        }
      }
    }
    if (!reduced && hx !== null) {                                  // 손 주변 금가루 — 기존 shimmer 재사용
      handShimAcc += dt;
      if (handShimAcc >= 0.06) {
        handShimAcc = 0;
        const a = rnd(0, TAU), r = rnd(0, S * 0.05);
        shimmer.push({ x: hx + Math.cos(a) * r, y: hy + Math.sin(a) * r, life: 1, sz: rnd(1.5, 3.5) * (S / 700) });
      }
    }
    for (const s of shimmer) s.life -= dt / 0.9;
    shimmer = shimmer.filter((s) => s.life > 0);

    // 검은 새
    birdAcc += dt;
    if (birdAcc >= nextBird) { birdAcc = 0; nextBird = rnd(reduced ? 11 : 7, reduced ? 16 : 13); perchBird(false); }
    if (bird) {
      if (bird.t < 1) {
        bird.t = Math.min(1, bird.t + dt * (reduced ? 0.6 : 1.1));
        const e = bird.t * bird.t * (3 - 2 * bird.t);            // smoothstep
        bird.x = bird.ox + (bird.tx - bird.ox) * e;
        bird.y = bird.oy + (bird.ty - bird.oy) * e - Math.sin(bird.t * Math.PI) * S * 0.06;
        if (Math.abs(bird.tx - bird.ox) > 2) bird.face = bird.tx > bird.ox ? 1 : -1;
      } else if (bird.host) {                                    // 앉은 가지에 붙어 흔들림
        const p = spiralPt(bird.host, bird.f * bird.host.grow);
        bird.x = p.x; bird.y = p.y - bird.host.w0 * 0.4;
      }
    }

    // ── 렌더 ──
    if (bg) ctx.drawImage(bg, 0, 0); else { ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H); }
    drawTrunk();
    // 가지: 어린 depth 먼저(굵은 것이 위에)
    const ordered = branches.slice().sort((a, b) => a.depth - b.depth);
    for (const b of ordered) drawBranch(b);
    drawShimmer();
    if (bird) drawBird();
    if (hx !== null) drawHand();
  },

  resize(w, h) { W = w; H = h; layout(); },

  dispose() {
    if (actx) { try { actx.close(); } catch (e) {} }
    actx = null; audio = null; ctx = null; bg = null;
    branches = []; shimmer = []; trunk = []; bird = null;
    cam = null; track = null; hx = hy = null; handOn = false;
  },
};

// ── 그리기 ────────────────────────────────────────────
function drawTrunk() {
  // 좌우 오프셋 폴리곤(테두리 청동 + 금빛 채움)
  const L = [], R = [];
  for (const t of trunk) {
    const sx = swayX(t.x, t.y);
    L.push([t.x - t.w + sx, t.y]); R.push([t.x + t.w + sx, t.y]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (const p of L) ctx.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  const grd = ctx.createLinearGradient(baseX - S * 0.06, 0, baseX + S * 0.06, 0);
  grd.addColorStop(0, BRONZE); grd.addColorStop(0.5, GOLD); grd.addColorStop(1, BRONZE);
  ctx.fillStyle = grd; ctx.fill();
  ctx.lineWidth = Math.max(1.5, S * 0.004); ctx.strokeStyle = BR_DK; ctx.stroke();
  // 줄기 장식: 사각 '나무껍질' + 눈 점
  for (let i = 2; i < trunk.length - 1; i += 2) {
    const t = trunk[i], sx = swayX(t.x, t.y);
    ctx.save(); ctx.translate(t.x + sx, t.y);
    if (i % 4 === 0) {
      const r = t.w * 0.34;
      ctx.fillStyle = EYE_W; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.lineWidth = r * 0.5; ctx.strokeStyle = RING; ctx.stroke();
      ctx.fillStyle = RING; ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = BR_DK; ctx.globalAlpha = 0.4;
      ctx.fillRect(-t.w * 0.5, -t.w * 0.22, t.w, t.w * 0.44);
    }
    ctx.restore();
  }
}

function drawBranch(b) {
  const vis = b.grow;
  if (vis <= 0.001) return;
  const segs = Math.max(4, Math.ceil(vis * b.span / 0.42));
  ctx.globalAlpha = b.fade;
  ctx.lineCap = "round";
  // 점 배열(변형 적용)
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = (i / segs) * vis;
    const p = spiralPt(b, f);
    pts.push([p.x + swayX(p.x, p.y), p.y, f]);
  }
  // 테두리(청동) → 금빛 몸통 (다층)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i];
      const w = widthAt(b, c[2]);
      ctx.lineWidth = pass === 0 ? w + Math.max(1.4, S * 0.004) : w;
      ctx.strokeStyle = pass === 0 ? BR_DK : (c[2] < 0.5 ? GOLD : GOLD_HI);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }
  }
  // 모티프
  for (const m of b.motifs) {
    if (m.f > vis) continue;
    const p = spiralPt(b, m.f);
    drawMotif(m, p.x + swayX(p.x, p.y), p.y, widthAt(b, m.f));
  }
  ctx.globalAlpha = 1;
}

function drawMotif(m, x, y, w) {
  const pulse = 1 + 0.08 * Math.sin(T * 1.6 + m.ph);
  const r = Math.max(2, w * 0.7 * pulse);
  ctx.save(); ctx.translate(x, y); ctx.rotate(m.rot);
  if (m.type === "eye") {
    ctx.fillStyle = EYE_W; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = r * 0.5; ctx.strokeStyle = RING; ctx.stroke();
    ctx.fillStyle = RING; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill();
  } else if (m.type === "oval") {
    ctx.fillStyle = BLACK; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = EYE_W; ctx.beginPath(); ctx.arc(r * 0.5, 0, r * 0.34, 0, TAU); ctx.fill();
  } else if (m.type === "tri") {
    const cs = [TEAL, BLUE, ROSE];
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = cs[i + 1]; ctx.beginPath();
      ctx.moveTo(i * r * 1.1, -r * 0.8); ctx.lineTo(i * r * 1.1 - r * 0.7, r * 0.7);
      ctx.lineTo(i * r * 1.1 + r * 0.7, r * 0.7); ctx.closePath(); ctx.fill();
    }
  } else if (m.type === "disc") {
    const rings = [[1, DISC], [0.72, BLUE], [0.46, EYE_W], [0.22, RING]];
    for (const [rr, c] of rings) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, r * 1.6 * rr, 0, TAU); ctx.fill(); }
  } else { // blue 새/눈 모티프
    ctx.fillStyle = BLUE; ctx.beginPath();
    ctx.arc(0, 0, r * 1.2, Math.PI, TAU); ctx.closePath(); ctx.fill();
    ctx.fillStyle = EYE_W; ctx.beginPath(); ctx.arc(0, -r * 0.15, r * 0.34, 0, TAU); ctx.fill();
    ctx.fillStyle = RING; ctx.beginPath(); ctx.arc(0, -r * 0.15, r * 0.16, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawShimmer() {
  for (const s of shimmer) {
    const a = Math.sin(clamp(s.life, 0, 1) * Math.PI);
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = GOLD_HI;
    ctx.beginPath(); ctx.arc(s.x + swayX(s.x, s.y), s.y, s.sz, 0, TAU); ctx.fill();
    ctx.globalAlpha = a * 0.35;
    ctx.beginPath(); ctx.arc(s.x + swayX(s.x, s.y), s.y, s.sz * 2.4, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBird() {
  const u = S * 0.026;                  // 새 크기 단위
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.scale(bird.face, 1);
  const flap = bird.t < 1 ? Math.sin(T * 22) * 0.5 : 0;   // 이동 중 날갯짓
  ctx.fillStyle = BLACK;
  // 꼬리
  ctx.beginPath();
  ctx.moveTo(-u * 0.3, 0); ctx.lineTo(-u * 2.2, -u * 0.5); ctx.lineTo(-u * 2.2, u * 0.5);
  ctx.closePath(); ctx.fill();
  // 흰 꼬리 끝
  ctx.fillStyle = EYE_W;
  ctx.fillRect(-u * 2.2, -u * 0.5, u * 0.35, u);
  // 몸통
  ctx.fillStyle = BLACK;
  ctx.beginPath(); ctx.ellipse(0, -u * 0.2, u * 1.1, u * 0.75, 0, 0, TAU); ctx.fill();
  // 날개
  ctx.save(); ctx.rotate(flap);
  ctx.beginPath(); ctx.ellipse(-u * 0.2, -u * 0.35, u * 0.9, u * 0.42, -0.5, 0, TAU); ctx.fill();
  ctx.restore();
  // 머리
  ctx.beginPath(); ctx.arc(u * 0.85, -u * 0.7, u * 0.5, 0, TAU); ctx.fill();
  // 부리
  ctx.fillStyle = "#caa23a";
  ctx.beginPath(); ctx.moveTo(u * 1.3, -u * 0.8); ctx.lineTo(u * 1.9, -u * 0.6);
  ctx.lineTo(u * 1.3, -u * 0.5); ctx.closePath(); ctx.fill();
  // 눈
  ctx.fillStyle = EYE_W; ctx.beginPath(); ctx.arc(u * 0.95, -u * 0.8, u * 0.12, 0, TAU); ctx.fill();
  ctx.restore();
}

// 손 표식: 클림트 눈 모티프 — 금빛 고리(펄스) + 검은 중심점. 바람(swayX)은 적용하지 않는다(손은 흔들리지 않음).
function drawHand() {
  const r = S * 0.02 * (1 + 0.1 * Math.sin(T * 3));
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(1.5, S * 0.004); ctx.strokeStyle = GOLD_HI;
  ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = RING;
  ctx.beginPath(); ctx.arc(hx, hy, S * 0.006, 0, TAU); ctx.fill();
  ctx.restore();
}
