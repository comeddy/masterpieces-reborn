// js/pieces/05-impression-sunrise.js
// After Monet — Impression, Sunrise (1872). 절차적 재해석: 안개 낀 르아브르 항구 새벽.
// 이미지 미사용. 청회색 안개 하늘 + 가로 붓질 바다 + 고동치는 밝은 노랑 태양 + 부서진 반사 + 조각배.
// 클릭 시 태양 중심에서 방사형 광선이 사방으로 뻗으며 코어가 눈부시게 밝아진다.

const TWO_PI = Math.PI * 2;
const RIPPLE_SPEED = 150;   // 리플 링이 바깥으로 번지는 속도(px/s)
const RIPPLE_W = 46;        // 링(파동 패킷) 두께
const RK = TWO_PI / 40;     // 리플 파장 → 위상 계수
const N_BANDS = 16;         // 바다 가로 붓질 밴드 수
const MAX_RIPPLES = 20;

let W = 0, H = 0, ctx = null, T = 0, reduced = false, mo = 1;
let horizonY = 0, seaH = 0;
let sunX = 0, sunY = 0, sunR = 0, sunFlash = 0;

let bands = [];        // {f, amp, wl, spd, ph, r,g,b} — f: 수평선(0)~전경(1)
let fog = [];          // {x, y, r, vx, drift, ph, a} — 느리게 흐르는 안개 블롭
let refl = [];         // {t, x, w, ph, base} — 태양 아래 부서진 반사 조각
let boats = [];        // {x, y, s, bp, bs, amp} — 검은 조각배 실루엣
const ripples = [];    // {x, y, t, strength} — 드래그/클릭 파원
const bursts = [];     // {t, dur, maxLen, rays[]} — 클릭 시 태양 중심에서 뻗는 방사형 광선
const gulls = [];      // {x, y, vx, ph} — 이따금 지나가는 갈매기 점
let gullTimer = 3, dragAccum = 0;

const rnd = (a, b) => a + Math.random() * (b - a);

// 장면 지오메트리/정적 요소 (재)구성 — init·resize에서 호출
function build() {
  horizonY = H * 0.52;
  seaH = H - horizonY;
  sunX = W * 0.34;
  sunY = horizonY - H * 0.055;
  sunR = Math.max(14, Math.min(W, H) * 0.032);

  bands = [];
  for (let i = 0; i < N_BANDS; i++) {
    const f = i / (N_BANDS - 1);
    // 수평선의 옅은 청회색 → 전경의 짙은 청록으로 보간
    bands.push({
      f,
      amp: 2 + f * 6,
      wl: TWO_PI / (60 + Math.random() * 80),
      spd: rnd(0.5, 1.3) * (i % 2 ? 1 : -1),
      ph: rnd(0, TWO_PI),
      r: Math.round(118 - f * 84),
      g: Math.round(132 - f * 84),
      b: Math.round(138 - f * 82),
    });
  }

  fog = [];
  for (let i = 0; i < 4; i++) {
    fog.push({
      x: rnd(0, W), y: rnd(H * 0.12, horizonY * 0.9),
      r: rnd(H * 0.14, H * 0.26), vx: rnd(4, 12),
      drift: rnd(0.1, 0.3), ph: rnd(0, TWO_PI), a: rnd(0.08, 0.18),
    });
  }

  refl = [];
  for (let i = 0; i < 48; i++) {
    refl.push({
      t: Math.pow(Math.random(), 0.7),  // 위로 밀집(수평선 근처가 촘촘)
      x: Math.random() * 2 - 1,         // 태양 열 기준 좌우 계수
      w: rnd(0.4, 1), ph: rnd(0, TWO_PI), base: rnd(0.35, 1),
    });
  }

  boats = [
    { x: W * 0.52, y: horizonY + seaH * 0.14, s: Math.max(10, W * 0.022), bp: 0.4, bs: 0.9, amp: seaH * 0.012 },
    { x: W * 0.66, y: horizonY + seaH * 0.07, s: Math.max(6, W * 0.013), bp: 2.1, bs: 1.1, amp: seaH * 0.008 },
  ];
}

// 모든 리플의 감쇠 사인 기여 합 — 링은 시간에 따라 확장하며 사그라짐
function rippleField(px, py) {
  let sum = 0;
  for (let i = 0; i < ripples.length; i++) {
    const r = ripples[i];
    const dx = px - r.x, dy = py - r.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const off = d - RIPPLE_SPEED * r.t;               // 링 정점까지의 거리
    const env = r.strength * Math.exp(-r.t * 0.85) *
                Math.exp(-(off * off) / (2 * RIPPLE_W * RIPPLE_W));
    sum += env * Math.cos(off * RK);
  }
  return sum;
}

function addRipple(x, y, s) {
  ripples.push({ x, y, t: 0, strength: s });
  if (ripples.length > MAX_RIPPLES) ripples.shift();
}

// 클릭 시 태양 중심에서 사방으로 뻗는 방사형 광선 한 다발 생성
// 광선마다 각도·길이·두께·위상이 조금씩 달라 자연스럽게 흩어진다
function addSunburst() {
  const n = reduced ? 10 : Math.round(rnd(16, 22));   // 광선 수(감속 시 축소)
  const base = Math.random() * TWO_PI;                // 다발 전체 회전 위상
  const rays = [];
  for (let i = 0; i < n; i++) {
    rays.push({
      a: base + (i / n) * TWO_PI + rnd(-0.13, 0.13),  // 균등 분포 + 지터
      lf: rnd(0.55, 1.15),                            // 길이 계수(불규칙)
      w: rnd(1.5, 4),                                 // 두께
      ph: rnd(0, TWO_PI),                             // 흔들림 위상
    });
  }
  bursts.push({
    t: 0,
    dur: reduced ? 1.6 : 2.6,                          // 잦아드는 데 걸리는 시간
    maxLen: sunR * (reduced ? 5 : 9),                 // 최대 광선 길이(감속 시 축소)
    rays,
  });
  if (bursts.length > 4) bursts.shift();
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY + seaH * 0.1);
  g.addColorStop(0, "#41505d");
  g.addColorStop(0.5, "#6a7883");
  g.addColorStop(0.82, "#b7ac9d");
  g.addColorStop(1, "#d8c3ac");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, horizonY + 2);
}

function drawFog(dt) {
  for (const f of fog) {
    f.x += f.vx * dt;
    if (f.x - f.r > W) f.x = -f.r;                    // 좌로 랩어라운드
    const y = f.y + Math.sin(T * f.drift + f.ph) * 8;
    const g = ctx.createRadialGradient(f.x, y, 0, f.x, y, f.r);
    g.addColorStop(0, `rgba(206,210,214,${f.a})`);
    g.addColorStop(1, "rgba(206,210,214,0)");
    ctx.fillStyle = g;
    ctx.fillRect(f.x - f.r, y - f.r, f.r * 2, f.r * 2);
  }
}

function drawSea() {
  const g = ctx.createLinearGradient(0, horizonY, 0, H);
  g.addColorStop(0, "#7c848a");
  g.addColorStop(0.25, "#5c6a72");
  g.addColorStop(1, "#28353d");
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY, W, seaH);

  const S = 16;
  const wmo = reduced ? 0.7 : 1;
  const thick = seaH / N_BANDS * 1.9;
  for (const bd of bands) {
    const by = horizonY + bd.f * seaH;
    ctx.beginPath();
    ctx.moveTo(0, by);
    for (let x = 0; x <= W; x += S) {
      const wave = Math.sin(x * bd.wl + T * bd.spd + bd.ph) * bd.amp * wmo;
      ctx.lineTo(x, by + wave + rippleField(x, by));  // 사인 일렁임 + 리플
    }
    ctx.lineTo(W, by + thick);
    ctx.lineTo(0, by + thick);
    ctx.closePath();
    ctx.fillStyle = `rgba(${bd.r},${bd.g},${bd.b},${0.42 + bd.f * 0.4})`;
    ctx.fill();
  }
}

function drawSun() {
  const fl = Math.min(1, sunFlash);                             // 섬광 정도 0~1
  const r = sunR * (1 + Math.sin(T * 1.4) * 0.06 * mo) * (1 + fl * 0.18); // 반경 펄스 + 섬광 팽창
  const glowR = sunR * (3.4 + Math.sin(T * 1.1) * 0.5 * mo) + sunFlash * sunR * 4.5;
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowR);
  g.addColorStop(0, `rgba(255,244,190,${0.5 + sunFlash * 0.45})`); // 따뜻한 노랑-흰빛 코어광
  g.addColorStop(0.4, "rgba(255,214,80,0.2)");
  g.addColorStop(1, "rgba(255,210,63,0)");
  ctx.fillStyle = g;
  ctx.fillRect(sunX - glowR, sunY - glowR, glowR * 2, glowR * 2);
  ctx.globalCompositeOperation = "source-over";
  // 코어: 평상시 밝은 노랑 → 섬광 시 흰빛으로
  const cg = Math.round(210 + fl * 45);                         // 210 → 255
  const cb = Math.round(63 + fl * 185);                         // 63 → 248 (흰빛)
  ctx.fillStyle = `rgb(255,${cg},${cb})`;
  ctx.beginPath();
  ctx.arc(sunX, sunY, r, 0, TWO_PI);
  ctx.fill();
}

// 클릭 광선: 태양 중심에서 뻗어 성장(ease-out)했다가 전체가 페이드
function drawSunburst() {
  if (!bursts.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const b of bursts) {
    const life = b.t / b.dur;                                   // 0~1 수명
    const grow = 1 - Math.pow(1 - Math.min(1, b.t / (b.dur * 0.4)), 3); // 정점까지 빠르게 성장
    const alpha = Math.max(0, 1 - life) ** 1.6;                 // 후반으로 갈수록 잦아듦
    if (alpha <= 0) continue;
    for (const ray of b.rays) {
      const ang = ray.a + Math.sin(b.t * 1.6 + ray.ph) * 0.03;  // 미세한 회전 흔들림
      const len = b.maxLen * ray.lf * grow;
      const x2 = sunX + Math.cos(ang) * len;
      const y2 = sunY + Math.sin(ang) * len;
      const rg = ctx.createLinearGradient(sunX, sunY, x2, y2);
      rg.addColorStop(0, `rgba(255,248,210,${0.55 * alpha})`);
      rg.addColorStop(0.5, `rgba(255,224,102,${0.26 * alpha})`);
      rg.addColorStop(1, "rgba(255,210,63,0)");                 // 끝은 투명 → 부드러운 소멸
      ctx.strokeStyle = rg;
      ctx.lineWidth = ray.w * (0.5 + grow * 0.8);
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawReflections() {
  ctx.globalCompositeOperation = "lighter";
  for (const p of refl) {
    const y = horizonY + p.t * seaH * 0.98 + 4;
    const spread = sunR * (0.5 + p.t * 3.2);          // 아래로 갈수록 넓게 퍼짐
    const rf = rippleField(sunX, y);
    const x = sunX + p.x * spread + rf * 0.6;
    const len = (6 + p.w * 26) * (0.5 + p.t);
    // 명멸: 고유 위상 사인 + 리플 밝기 기여
    let bright = p.base * (0.5 + 0.5 * Math.sin(T * (2 + p.t * 2) + p.ph));
    bright = Math.max(0, Math.min(1, bright + rf * 0.04));
    const yj = y + Math.sin(T * 1.5 + p.ph) * 2 + rf * 0.5;
    // 태양색과 조화되는 노랑 계열: 밝아질수록 흰빛으로 (녹·청 채널 상승)
    ctx.fillStyle = `rgba(255,${205 + Math.round(bright * 45)},${95 + Math.round(bright * 60)},${0.10 + bright * 0.28})`;
    ctx.fillRect(x - len / 2, yj, len, 2 + p.t * 2);
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawBoats() {
  for (const b of boats) {
    const yo = Math.sin(T * b.bs + b.bp) * b.amp * mo; // 느린 보빙
    ctx.save();
    ctx.translate(b.x, b.y + yo);
    ctx.rotate(Math.sin(T * b.bs + b.bp) * 0.05 * mo);
    ctx.fillStyle = "#0b1216";
    const s = b.s;
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(0, s * 0.55, s, 0);           // 초승달 선체
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-1, -s * 0.85, 2.5, s * 0.85);        // 서 있는 노잡이
    ctx.fillRect(-s * 0.7, -1.5, s * 1.4, 2);          // 뱃전
    ctx.restore();
  }
}

function updateGulls(dt) {
  gullTimer -= dt;
  if (gullTimer <= 0 && gulls.length < 3) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    gulls.push({
      x: dir > 0 ? -20 : W + 20, y: rnd(H * 0.14, horizonY * 0.72),
      vx: dir * rnd(22, 40), ph: rnd(0, TWO_PI),
    });
    gullTimer = rnd(4, 9);
  }
  for (let i = gulls.length - 1; i >= 0; i--) {
    gulls[i].x += gulls[i].vx * dt;
    if (gulls[i].x < -30 || gulls[i].x > W + 30) gulls.splice(i, 1);
  }
}

function drawGulls() {
  ctx.strokeStyle = "rgba(38,46,54,0.7)";
  ctx.lineWidth = 1.6;
  for (const g of gulls) {
    const wy = -3 - (Math.sin(T * 7 + g.ph) * 0.5 + 0.5) * 5 * mo; // 날갯짓
    ctx.beginPath();
    ctx.moveTo(g.x - 7, g.y);
    ctx.quadraticCurveTo(g.x - 2, g.y + wy, g.x, g.y);
    ctx.quadraticCurveTo(g.x + 2, g.y + wy, g.x + 7, g.y);
    ctx.stroke();
  }
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; mo = reduced ? 0.5 : 1;
    T = 0; sunFlash = 0; dragAccum = 0; gullTimer = 3;
    ripples.length = 0; bursts.length = 0; gulls.length = 0;
    build();
  },
  tick(dt, ptr) {
    T += dt;
    // 드래그: 이동 거리 누적 후 작은 리플 파원 생성
    if (ptr.inside && ptr.down && (ptr.dx || ptr.dy)) {
      dragAccum += Math.hypot(ptr.dx, ptr.dy);
      if (dragAccum > 20) { addRipple(ptr.x, ptr.y, 6); dragAccum = 0; }
    }
    // 클릭: 수면 리플 + 태양 중심 방사형 광선 + 코어 섬광(클릭 위치와 무관, 중심은 늘 태양)
    if (ptr.justDown) {
      addRipple(ptr.x, ptr.y, 15);
      addSunburst();
      sunFlash = reduced ? 0.7 : 1.3;                 // 감속 시 섬광 감쇠
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t > 7) ripples.splice(i, 1);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      bursts[i].t += dt;
      if (bursts[i].t > bursts[i].dur) bursts.splice(i, 1);
    }
    sunFlash = Math.max(0, sunFlash - dt * 0.45);      // 2~3초에 걸쳐 잦아듦
    updateGulls(dt);

    drawSky();
    drawFog(dt);
    drawSea();
    drawSun();
    drawSunburst();
    drawReflections();
    drawBoats();
    drawGulls();
  },
  resize(w, h) { W = w; H = h; build(); },
  dispose() {
    ctx = null;
    bands = []; fog = []; refl = []; boats = [];
    ripples.length = 0; bursts.length = 0; gulls.length = 0;
  },
};
