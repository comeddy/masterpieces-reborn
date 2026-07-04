// js/pieces/10-tower-of-babel.js
// After Bruegel — Tower of Babel (1563). 절차적 나선 원뿔 탑: 끝없는 건설과 붕괴.

let W = 0, H = 0, ctx = null, reduced = false, T = 0;
let cx = 0, groundY = 0;              // 탑 밑동 화면 앵커
let camS = 1, camTarget = 1;         // 탑이 높아지면 서서히 축소
let tiers = [];   // tiers[t] = { cap, filled[], n, order[] }
let blocks = [];  // 개별 블록 {t, i, cap, r, g, b, oy, vy, state}
let debris = [];  // 붕괴 파편(월드 물리) / dust: 흙먼지 / clouds: 구름
let dust = [], clouds = [];
let buildTimer = 0, buildInterval = 2.5, heldTime = 0, collapseDone = false;

const BRICK = [168, 103, 74];        // #a8674a
const FLATTEN = 0.34;                // 원근 납작 타원 ry/rx
const SPIRAL = 0.20;                 // 층마다 나선 오프셋
const G = 1650;                      // 중력(월드/s^2)

const rand = (a, b) => a + Math.random() * (b - a);
const baseRx = () => Math.min(W, H) * 0.30;
const tierH = () => baseRx() * 0.17;
const rxAt = (t) => baseRx() * Math.max(0.28, 1 - 0.03 * t);
const baseAngle = (t) => t * SPIRAL;
const capAt = (t) => Math.max(5, Math.min(40, Math.round((2 * Math.PI * rxAt(t)) / (baseRx() * 0.30))));

// --- 층 생성: 그리기 순서를 뒤(sin<0)→앞(sin>0)으로 미리 정렬 ---
function ensureTier(t) {
  while (tiers.length <= t) {
    const cap = capAt(tiers.length), ba = baseAngle(tiers.length), order = [];
    for (let i = 0; i < cap; i++) order.push(i);
    order.sort((p, q) => Math.sin(ba + p * 6.283 / cap) - Math.sin(ba + q * 6.283 / cap));
    tiers.push({ cap, filled: new Array(cap).fill(false), n: 0, order });
  }
}

// --- 블록 배치(위에서 낙하) ---
function placeSlot(t, i) {
  ensureTier(t);
  const tier = tiers[t];
  if (tier.filled[i]) return;
  tier.filled[i] = true; tier.n++;
  const th = tierH(), v = () => (Math.random() * 32 - 16) | 0;
  blocks.push({
    t, i, cap: tier.cap, r: BRICK[0] + v(), g: BRICK[1] + v(), b: BRICK[2] + v(),
    oy: reduced ? -th * 1.2 : -(th * 6 + rand(0, th * 4)), vy: 0, state: "falling",
  });
}

// 자동 건설: 가장 낮은 미완성 층의 다음 빈 슬롯(링 채운 뒤 상승)
function placeNextAuto() {
  ensureTier(0);
  let t = 0;
  while (t < tiers.length && tiers[t].n >= tiers[t].cap) t++;
  ensureTier(t);
  for (let i = 0; i < tiers[t].cap; i++) if (!tiers[t].filled[i]) { placeSlot(t, i); return; }
}

// 클릭 건설: 클릭 지점 근처 층/각도의 빈 슬롯
function placeNear(sx, sy) {
  const th = tierH();
  let t = Math.max(0, Math.min(Math.round(-(sy - groundY) / camS / th - 0.5), tiers.length));
  ensureTier(t);
  while (tiers[t] && tiers[t].n >= tiers[t].cap) { t++; ensureTier(t); }
  const tier = tiers[t], da = 6.283 / tier.cap, ba = baseAngle(t);
  const hint = Math.acos(Math.max(-1, Math.min(1, (sx - cx) / camS / rxAt(t)))); // 0..PI 앞면
  let best = -1, bestD = 9;
  for (let i = 0; i < tier.cap; i++) {
    if (tier.filled[i]) continue;
    const a = ba + i * da, d = Math.abs(Math.atan2(Math.sin(a - hint), Math.cos(a - hint)));
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best >= 0) placeSlot(t, best);
}

// --- 붕괴: 누른 지점 위쪽 층을 파편으로 무너뜨림(+흙먼지) ---
function collapseAt(sy) {
  if (!tiers.length) return;
  const th = tierH();
  const from = Math.max(0, Math.min(Math.round(-(sy - groundY) / camS / th - 0.5), tiers.length - 1));
  for (const b of blocks) {
    if (b.t < from) continue;
    const rx = rxAt(b.t), ry = rx * FLATTEN, a = baseAngle(b.t) + b.i * 6.283 / b.cap;
    debris.push({
      x: rx * Math.cos(a), y: -b.t * th + ry * Math.sin(a) + b.oy,
      vx: rand(-220, 220), vy: rand(-60, 40), r: b.r, g: b.g, b: b.b,
      w: rx * 0.5, h: th * 0.9, rot: rand(0, 6.28),
      vrot: reduced ? rand(-1, 1) : rand(-5, 5), life: -1, landed: false,
    });
  }
  blocks = blocks.filter((b) => b.t < from);
  tiers.length = from;                                   // 탑 높이 감소
  const n = reduced ? 10 : 26, dyc = -from * th, R = baseRx();
  for (let k = 0; k < n; k++) dust.push({
    x: rand(-R * 0.5, R * 0.5), y: dyc + rand(-th, th), vx: rand(-70, 70),
    vy: rand(-90, -20), rad: rand(R * 0.08, R * 0.22), life: rand(0.9, 1.8), age: 0,
  });
}

function initClouds() {
  clouds = [];
  const n = 3 + (Math.random() * 2 | 0);
  for (let i = 0; i < n; i++) clouds.push({
    x: rand(0, W), y: rand(H * 0.08, H * 0.42), s: rand(0.7, 1.5),
    spd: rand(4, 12) * (Math.random() < 0.5 ? -1 : 1),
  });
}

// --- 업데이트 ---
function update(dt, ptr) {
  T += dt;
  for (const c of clouds) {                              // 구름 표류
    c.x += c.spd * dt * (reduced ? 0.4 : 1);
    const m = 140 * c.s;
    if (c.x < -m) c.x = W + m; else if (c.x > W + m) c.x = -m;
  }
  // 입력: 짧게=클릭 건설 / 길게(>1.2s)=붕괴
  if (ptr.justDown) collapseDone = false;
  if (ptr.down) {
    heldTime = ptr.downTime;
    if (ptr.downTime > 1.2 && !collapseDone) { collapseAt(ptr.y); collapseDone = true; }
  }
  if (ptr.justUp && !collapseDone && heldTime <= 1.2 && ptr.inside) {
    const n = 3 + (Math.random() * 3 | 0);               // 3~5개
    for (let k = 0; k < n; k++) placeNear(ptr.x + rand(-8, 8), ptr.y + rand(-6, 6));
  }
  buildTimer += dt;                                      // 자동 건설(2~3s)
  if (buildTimer >= buildInterval) { buildTimer = 0; buildInterval = rand(2, 3); placeNextAuto(); }
  for (const b of blocks) {                              // 낙하 안착(살짝 튕김)
    if (b.state !== "falling") continue;
    b.vy += G * dt; b.oy += b.vy * dt;
    if (b.oy >= 0) {
      b.oy = 0;
      if (!reduced && b.vy > 260) b.vy = -b.vy * 0.28;
      else { b.vy = 0; b.state = "settled"; }
    }
  }
  const rest = reduced ? 0.1 : 0.4;                      // 파편 물리(바닥 y=0 튕김)
  for (const d of debris) {
    d.vy += G * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vrot * dt;
    if (d.y >= 0) {
      d.y = 0;
      if (Math.abs(d.vy) > 120) { d.vy = -d.vy * rest; d.vx *= 0.7; d.vrot *= 0.6; }
      else { d.vy = 0; d.vx *= 0.9; }
      if (!d.landed) { d.landed = true; d.life = 1.5; }  // 착지 1.5s 후 페이드
    }
    if (d.landed) d.life -= dt;
  }
  debris = debris.filter((d) => d.life === -1 || d.life > 0);
  for (const p of dust) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt; p.rad += 24 * dt; }
  dust = dust.filter((p) => p.age < p.life);
  // 카메라: 탑 전체가 보이도록 축소
  const towerH = Math.max(tierH() * 4, tiers.length * tierH());
  camTarget = Math.min(1, (H * 0.66) / towerH, (W * 0.92) / (2 * baseRx()));
  camS += (camTarget - camS) * Math.min(1, dt * 2.2);
}

// --- 렌더 ---
function drawSky() {
  const horizon = H * 0.62, g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, "#b9b2a6"); g.addColorStop(1, "#cdd2d6");  // 웜 그레이→청회
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon);
  for (const c of clouds) {                              // 구름
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = "#eef0f0";
    const r = 26 * c.s;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.ellipse(c.x + k * r * 0.9, c.y + Math.abs(k) * r * 0.18, r * (1.3 - Math.abs(k) * 0.18), r * 0.7, 0, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }
  const gg = ctx.createLinearGradient(0, horizon, 0, H);  // 지면
  gg.addColorStop(0, "#8f8f70"); gg.addColorStop(1, "#5c5a44");
  ctx.fillStyle = gg; ctx.fillRect(0, horizon, W, H - horizon);
}

function drawBlock(b, th) {
  const rx = rxAt(b.t), ry = rx * FLATTEN, da = 6.283 / b.cap, a = baseAngle(b.t) + b.i * da;
  const aL = a - da * 0.5, aR = a + da * 0.5, yT = -(b.t + 1) * th + b.oy, yB = -b.t * th + b.oy;
  const X = (g) => rx * Math.cos(g), Y = (cy, g) => cy + ry * Math.sin(g);
  const k = Math.max(0.45, Math.min(1.15, 0.62 + 0.30 * Math.cos(a + 2.2) + 0.12 * Math.sin(a)));
  ctx.fillStyle = `rgb(${b.r * k | 0},${b.g * k | 0},${b.b * k | 0})`;
  ctx.beginPath();
  ctx.moveTo(X(aL), Y(yT, aL)); ctx.lineTo(X(aR), Y(yT, aR));
  ctx.lineTo(X(aR), Y(yB, aR)); ctx.lineTo(X(aL), Y(yB, aL)); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40,24,16,0.35)"; ctx.lineWidth = 0.6; ctx.stroke();
}

function drawTower() {
  const th = tierH();
  ctx.save(); ctx.translate(cx, groundY); ctx.scale(camS, camS);
  for (const d of debris) {                              // 파편(뒤)
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.globalAlpha = d.life === -1 ? 1 : Math.max(0, d.life / 1.5);
    ctx.fillStyle = `rgb(${d.r},${d.g},${d.b})`;
    ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); ctx.restore();
  }
  ctx.globalAlpha = 1;
  const byTier = [];                                     // 층별 그룹
  for (const b of blocks) (byTier[b.t] || (byTier[b.t] = [])).push(b);
  for (let t = 0; t < byTier.length; t++) {              // 아래→위, 뒤→앞
    const arr = byTier[t]; if (!arr) continue;
    if (tiers[t]) {
      const rank = {}; tiers[t].order.forEach((i, r) => (rank[i] = r));
      arr.sort((p, q) => rank[p.i] - rank[q.i]);
    }
    for (const b of arr) drawBlock(b, th);
  }
  for (const p of dust) {                                // 흙먼지(앞)
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life) * 0.5;
    ctx.fillStyle = "#8a7a63";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.rad, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.restore();
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height; reduced = !!opts.reducedMotion; T = 0;
    tiers = []; blocks = []; debris = []; dust = [];
    buildTimer = 0; buildInterval = rand(2, 3); heldTime = 0; collapseDone = false;
    camS = 1; camTarget = 1; cx = W * 0.5; groundY = H * 0.80;
    initClouds();
    for (let t = 0; t < 3; t++) {                        // 밑동 몇 층 미리 세움
      const cap = capAt(t); ensureTier(t);
      for (let i = 0; i < cap; i++) {
        placeSlot(t, i);
        const b = blocks[blocks.length - 1];
        if (b) { b.oy = 0; b.vy = 0; b.state = "settled"; }
      }
    }
  },
  tick(dt, ptr) { update(dt, ptr); drawSky(); drawTower(); },
  resize(w, h) { W = w; H = h; cx = W * 0.5; groundY = H * 0.80; },
  dispose() { ctx = null; tiers = []; blocks = []; debris = []; dust = []; clouds = []; },
};
