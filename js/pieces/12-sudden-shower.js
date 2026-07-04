// js/pieces/12-sudden-shower.js — After Hiroshige, Sudden Shower over Shin-Ōhashi (1857)
// 우키요에의 곧은 빗줄기가 두 겹으로 쏟아진다. 커서는 종이 우산이 되어 비를 가리고,
// 우산 가장자리에서 물방울이 튀며, 수면에 닿은 비는 잔물결을 남긴다.
// 번개는 이따금 구름 속에서 0.2초 번뜩인다. 무음 · 먹색-남색-주홍 팔레트.

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let img = null, fit = null;

// 비 스트릭 풀 — downpour 시 activeCount만 늘려 재사용(프레임당 할당 최소화)
const MAX = 270, BASE = 150;
let rain = [];
let activeCount = BASE;
let downpour = false, darkT = 0;

let splashes = [];   // 수면 잔물결 {x,y,life,life0,len}
let drips = [];      // 우산 가장자리 물방울 {x,y,vx,vy}

// 우산 상태: 커서를 lerp로 부드럽게 따라오고, 이동 속도로 기울어진다
const umb = { x: 0, y: 0, tx: 0, ty: 0, px: 0, vx: 0, tilt: 0, r: 100 };

// 번개
let boltTimer = 6, flash = 0, bolt = null;

// ---- 유틸 ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

function containFit(iw, ih, w, h, m = 0.03) {
  const aw = w * (1 - m * 2), ah = h * (1 - m * 2);
  const s = Math.min(aw / iw, ah / ih);
  const bw = iw * s, bh = ih * s;
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

// 스트릭 1개를 화면 위쪽으로 (재)배치. layer 0=근경(진하고 김), 1=원경(옅고 짧음)
function spawn(s, layer, atTop) {
  s.layer = layer;
  // 각도: 근경 78°, 원경 84° (수평 기준) → 곧게 떨어지되 살짝 오른쪽으로
  const deg = layer === 0 ? 78 : 84;
  const a = (deg * Math.PI) / 180;
  s.dx = Math.cos(a); s.dy = Math.sin(a);
  s.len = layer === 0 ? rnd(28, 48) : rnd(14, 26);
  s.speed = layer === 0 ? rnd(820, 1000) : rnd(560, 720);
  s.x = rnd(-0.1 * W, 1.05 * W);
  s.y = atTop ? rnd(-H * 0.5, 0) : -s.len - Math.random() * 40;
}

function initRain() {
  rain = [];
  for (let i = 0; i < MAX; i++) {
    const s = {};
    spawn(s, i % 3 === 0 ? 1 : 0, true); // 약 1/3은 원경
    rain.push(s);
  }
}

// ---- 절차적 폴백 배경: 먹색 구름 밴드 · 대각 다리 실루엣 · 강 수면 밴드 ----
function drawProcedural() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0c0f18");
  sky.addColorStop(0.45, "#28303f");
  sky.addColorStop(0.75, "#1c2634");
  sky.addColorStop(1, "#10161f");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // 상단 먹색 구름 밴드
  const cloud = ctx.createLinearGradient(0, 0, 0, H * 0.26);
  cloud.addColorStop(0, "rgba(8,9,13,0.92)");
  cloud.addColorStop(1, "rgba(8,9,13,0)");
  ctx.fillStyle = cloud; ctx.fillRect(0, 0, W, H * 0.26);

  // 강 수면 밴드(하단 25%)
  const water = ctx.createLinearGradient(0, H * 0.75, 0, H);
  water.addColorStop(0, "#1a2b33");
  water.addColorStop(1, "#0a1418");
  ctx.fillStyle = water; ctx.fillRect(0, H * 0.75, W, H * 0.25);

  // 대각 다리 실루엣 — 좌상에서 우하로 가로지르는 판재
  ctx.fillStyle = "#0b0d12";
  ctx.beginPath();
  ctx.moveTo(-20, H * 0.44); ctx.lineTo(W + 20, H * 0.66);
  ctx.lineTo(W + 20, H * 0.72); ctx.lineTo(-20, H * 0.50);
  ctx.closePath(); ctx.fill();
  // 난간 기둥
  ctx.strokeStyle = "rgba(6,7,10,0.9)"; ctx.lineWidth = 3;
  for (let i = 1; i < 9; i++) {
    const t = i / 9, x = t * W;
    const y = H * (0.44 + 0.22 * t);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 26); ctx.stroke();
  }
}

// ---- 배경(이미지 또는 폴백) + 저녁 톤 오버레이 ----
function drawBackground() {
  if (img && fit) {
    ctx.fillStyle = "#0a0d16"; ctx.fillRect(0, 0, W, H);
    let filtered = false;
    try { ctx.filter = "saturate(0.62) brightness(0.82)"; filtered = true; } catch (e) {}
    ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
    if (filtered) ctx.filter = "none";
  } else {
    drawProcedural();
  }
  // 채도 낮춘 저녁 톤
  ctx.fillStyle = "rgba(20,25,40,0.25)";
  ctx.fillRect(0, 0, W, H);
}

// ---- 번개 실루엣 생성(구름 밴드 안 지그재그) ----
function makeBolt() {
  const pts = [];
  let x = rnd(W * 0.2, W * 0.8), y = 0;
  const endY = H * rnd(0.18, 0.28);
  while (y < endY) {
    pts.push([x, y]);
    y += rnd(14, 30);
    x += rnd(-24, 24);
  }
  pts.push([x, y]);
  bolt = pts;
}

function drawLightning() {
  if (flash <= 0 || !bolt) return;
  const k = flash / 0.2;
  ctx.fillStyle = `rgba(200,210,235,${0.30 * k})`;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = `rgba(235,240,255,${0.85 * k})`;
  ctx.lineWidth = 2.2; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(bolt[0][0], bolt[0][1]);
  for (let i = 1; i < bolt.length; i++) ctx.lineTo(bolt[i][0], bolt[i][1]);
  ctx.stroke();
}

// ---- 비 갱신 + 우산 차단 + 수면 착수 ----
function updateRain(dt) {
  const mul = downpour ? 1.8 : 1;
  const waterY = H * 0.75;
  const R = umb.r, r2 = R * R;
  for (let i = 0; i < activeCount; i++) {
    const s = rain[i];
    const py = s.y;
    s.x += s.dx * s.speed * dt * mul;
    s.y += s.dy * s.speed * dt * mul;

    // 우산 돔(중심 위쪽 반원) 차단 → 재배치 + 가장자리 물방울
    const ddx = s.x - umb.x, ddy = s.y - umb.y;
    if (ddy <= 0 && ddx * ddx + ddy * ddy <= r2) {
      if (drips.length < 130 && Math.random() < 0.16) {
        const side = ddx >= 0 ? 1 : -1;
        drips.push({ x: umb.x + side * R * 0.92, y: umb.y - R * 0.08,
                     vx: side * rnd(15, 45), vy: rnd(20, 60) });
      }
      spawn(s, s.layer, false);
      continue;
    }
    // 수면 착수 → 잔물결 후 재배치
    if (py < waterY && s.y >= waterY) {
      if (splashes.length < 160)
        splashes.push({ x: s.x, y: waterY + rnd(0, H * 0.2), life: 0.34, life0: 0.34, len: rnd(3, 7) });
      spawn(s, s.layer, false);
      continue;
    }
    if (s.y > H + s.len) spawn(s, s.layer, false);
  }
}

function drawRain() {
  // 원경(옅음) → 근경(진함) 순서로 그려 겹침 자연스럽게
  for (let pass = 1; pass >= 0; pass--) {
    ctx.strokeStyle = pass === 0 ? "rgba(214,224,238,0.52)" : "rgba(176,192,214,0.28)";
    ctx.lineWidth = pass === 0 ? 1.1 : 0.7;
    ctx.beginPath();
    for (let i = 0; i < activeCount; i++) {
      const s = rain[i];
      if (s.layer !== pass) continue;
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.dx * s.len, s.y - s.dy * s.len);
    }
    ctx.stroke();
  }
}

function updateDrips(dt) {
  const waterY = H * 0.75;
  const next = [];
  for (const d of drips) {
    d.vy += 900 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt;
    if (d.y >= waterY) {
      if (splashes.length < 160)
        splashes.push({ x: d.x, y: waterY + rnd(0, H * 0.2), life: 0.3, life0: 0.3, len: rnd(2, 5) });
      continue;
    }
    if (d.y < H + 20) next.push(d);
  }
  drips = next;
  ctx.fillStyle = "rgba(220,200,190,0.7)";
  for (const d of drips) ctx.fillRect(d.x - 0.9, d.y - 2, 1.8, 4);
}

function updateSplashes(dt) {
  const next = [];
  for (const sp of splashes) {
    sp.life -= dt;
    if (sp.life <= 0) continue;
    const k = sp.life / sp.life0;
    const w = sp.len * (1.4 - k);        // 짧게 번지는 가로획
    ctx.strokeStyle = `rgba(200,214,224,${0.5 * k})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sp.x - w, sp.y); ctx.lineTo(sp.x + w, sp.y);
    ctx.stroke();
    next.push(sp);
  }
  splashes = next;
}

function drawUmbrella() {
  const R = umb.r;
  ctx.save();
  ctx.translate(umb.x, umb.y);
  ctx.rotate(umb.tilt);
  // 화지 막(반투명 주홍 반원)
  ctx.beginPath();
  ctx.moveTo(-R, 0);
  ctx.arc(0, 0, R, Math.PI, Math.PI * 2, false);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -R, 0, 0);
  g.addColorStop(0, "rgba(198,76,50,0.44)");
  g.addColorStop(1, "rgba(214,150,120,0.30)");
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(150,40,28,0.72)"; ctx.stroke();
  // 대나무 살 7개
  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(58,44,36,0.75)";
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = Math.PI + (i / 7) * Math.PI;
    ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
  }
  ctx.stroke();
  // 꼭지 + 손잡이 대
  ctx.strokeStyle = "rgba(58,44,36,0.85)"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -R * 1.08); ctx.stroke();
  ctx.fillStyle = "rgba(150,40,28,0.9)";
  ctx.beginPath(); ctx.arc(0, -R * 1.08, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(48,36,30,0.5)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, R * 0.5); ctx.stroke();
  ctx.restore();
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = opts.reducedMotion; T = 0;
    img = opts.assets && opts.assets.target ? opts.assets.target : null;
    downpour = false; darkT = 0;
    splashes = []; drips = [];
    boltTimer = rnd(6, 12); flash = 0; bolt = null;
    umb.r = clamp(Math.min(W, H) * 0.16, 72, 150);
    umb.x = umb.tx = umb.px = W * 0.5;
    umb.y = umb.ty = H * 0.44;
    umb.vx = 0; umb.tilt = 0;
    this.resize(W, H);
    activeCount = BASE;
    initRain();
  },

  tick(dt, ptr) {
    T += dt;

    // 클릭 = 폭우 토글
    if (ptr.justDown) downpour = !downpour;
    activeCount = downpour ? MAX : BASE;
    darkT += ((downpour ? 1 : 0) - darkT) * Math.min(1, dt * 3);

    // 우산: 커서를 lerp로 따라오고 이동 속도로 기울어짐
    if (ptr.inside) { umb.tx = ptr.x; umb.ty = ptr.y; }
    umb.px = umb.x;
    const lf = Math.min(1, dt * 9);
    umb.x += (umb.tx - umb.x) * lf;
    umb.y += (umb.ty - umb.y) * lf;
    umb.vx = umb.x - umb.px;
    const tiltTarget = reduced ? 0 : clamp(umb.vx * 0.02, -0.5, 0.5);
    umb.tilt += (tiltTarget - umb.tilt) * Math.min(1, dt * 6);

    // 번개(reducedMotion에선 생략)
    if (!reduced) {
      boltTimer -= dt;
      if (boltTimer <= 0) { makeBolt(); flash = 0.2; boltTimer = rnd(6, 12); }
      if (flash > 0) flash = Math.max(0, flash - dt);
    }

    updateRain(dt);

    // ---- 렌더 ----
    drawBackground();
    // 폭우 시 은은한 어두워짐
    if (darkT > 0.01) { ctx.fillStyle = `rgba(10,12,22,${darkT * 0.2})`; ctx.fillRect(0, 0, W, H); }
    if (!reduced) drawLightning();
    drawRain();
    updateSplashes(dt);
    updateDrips(dt);
    drawUmbrella();
  },

  resize(w, h) {
    W = w; H = h;
    umb.r = clamp(Math.min(W, H) * 0.16, 72, 150);
    fit = img ? containFit(img.naturalWidth || img.width, img.naturalHeight || img.height, W, H) : null;
  },

  dispose() { ctx = null; img = null; fit = null; rain = []; splashes = []; drips = []; bolt = null; },
};
