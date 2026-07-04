// js/pieces/08-rain-steam-speed.js
// After Turner — Rain, Steam and Speed (1844). 절차적.
// 금갈색 안개 유동장 속 대각선 철교와 다가오는 증기기관차.

let ctx = null, W = 0, H = 0, reduced = false, T = 0;

// 안개 입자 · 비 스트릭 · 기적 증기 뭉게
let fog = [], rain = [], puffs = [];
// 커서 속도 주입(유동장 교란)
let stir = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };
// 화면 진동(기적)
let shake = 0;
// 기차 접근 위상(0..1, ~20초 루프)
let trainT = 0;
const LOOP = 20; // 초

// 소실점(중앙 약간 위)과 철교 기준선을 화면 비율로 잡는다
let vp = { x: 0, y: 0 };

// ---- 의사 노이즈 유동장: 사인 조합으로 curl 유사 흐름 ----
function flow(x, y, t) {
  const nx = x * 0.0018, ny = y * 0.0018;
  // 두 개의 스칼라장을 미분한 듯한 회전 벡터 (curl 근사)
  const a = Math.sin(nx * 1.7 + t * 0.25) + Math.cos(ny * 2.1 - t * 0.2);
  const b = Math.cos(nx * 2.3 - t * 0.18) + Math.sin(ny * 1.5 + t * 0.22);
  // 전체적으로 우하단→좌상 소용돌이 + 소실점으로 빨려드는 성분
  const dx = vp.x - x, dy = vp.y - y;
  const d = Math.hypot(dx, dy) + 1;
  const pull = 18 / d;
  return {
    x: (b - a) * 26 + dx * pull * 0.02 + 8,
    y: (a + b) * 20 + dy * pull * 0.02 - 6,
  };
}

function rnd(a, b) { return a + Math.random() * (b - a); }

function makeFog(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      x: Math.random() * W, y: Math.random() * H,
      r: rnd(40, 130),                 // 큰 반투명 덩어리
      hue: rnd(0, 1),                  // 황토~회갈 보간용
      a: rnd(0.04, 0.12),
      sp: rnd(0.6, 1.4),               // 유동장 반응 속도차
    });
  }
  return arr;
}

function makeRain(n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(spawnRain());
  return arr;
}
function spawnRain() {
  return {
    x: rnd(-0.1 * W, 1.2 * W), y: rnd(-0.2 * H, H),
    len: rnd(14, 40), v: rnd(700, 1200), a: rnd(0.06, 0.18),
  };
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0; trainT = 0.15; shake = 0;
    stir = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };
    puffs = [];
    layout();
    fog = makeFog(fogCount());
    rain = makeRain(rainCount());
  },

  tick(dt, ptr) {
    T += dt;
    // 기차 위상 진행 (도착 후 다시 멀리서)
    trainT += dt / LOOP;
    if (trainT >= 1) trainT -= 1;

    // 드래그: 커서 속도를 유동장에 주입
    if (ptr && ptr.inside && ptr.down) {
      stir.x = ptr.x; stir.y = ptr.y;
      stir.vx = ptr.dx / Math.max(dt, 1e-3);
      stir.vy = ptr.dy / Math.max(dt, 1e-3);
      stir.life = 1;
    } else if (stir.life > 0) {
      stir.life -= dt * 1.6;
    }

    // 클릭: 기적 — 증기 뭉게 + 진동 1회
    if (ptr && ptr.justDown) whistle();

    if (shake > 0) shake = Math.max(0, shake - dt * 3);

    render(dt);
  },

  resize(w, h) {
    W = w; H = h; layout();
    // 개수 재조정(가벼운 재생성)
    fog = makeFog(fogCount());
    rain = makeRain(rainCount());
  },

  dispose() {
    ctx = null; fog = []; rain = []; puffs = [];
  },
};

// ---- 화면 비율에 맞춘 소실점/철교 좌표 ----
function layout() {
  vp.x = W * 0.5; vp.y = H * 0.42;
}

function fogCount() {
  // 200~300 (브리프), 화면 픽셀 수 기준 자동 조절
  const base = Math.round(W * H / 5200);
  return Math.max(200, Math.min(300, base));
}
function rainCount() {
  return Math.max(40, Math.min(60, Math.round(W / 24)));
}

// 기적: 굴뚝에서 밝은 입자 30개 상승 확산 + 진동
function whistle() {
  const tr = trainPose(trainT);
  for (let i = 0; i < 30; i++) {
    puffs.push({
      x: tr.stackX + rnd(-tr.s * 6, tr.s * 6),
      y: tr.stackY,
      vx: rnd(-20, 20), vy: rnd(-70, -30),
      r: rnd(6, 16) * (0.6 + tr.s), a: rnd(0.5, 0.85), life: 1,
    });
  }
  if (!reduced) shake = 1;
}

// 기차 자세: 위상 p(0=멀리, 1=도착직전 우하단 통과)
function trainPose(p) {
  // 소실점에서 우하단으로 향하는 경로를 따라 커진다
  const ex = W * 1.02, ey = H * 1.05;          // 화면 밖 도착점(우하단)
  const t = p;
  const x = vp.x + (ex - vp.x) * t;
  const y = vp.y + (ey - vp.y) * t;
  const s = 0.05 + t * t * 1.05;               // 원근 스케일(가까울수록 급증)
  return {
    x, y, s,
    stackX: x - 34 * s,                         // 굴뚝(진행방향 앞쪽)
    stackY: y - 30 * s,
    glow: t,                                    // 화실 글로우 강도
  };
}

// ---- 렌더 ----
function render(dt) {
  const ox = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
  const oy = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
  ctx.save();
  ctx.translate(ox, oy);

  drawBackground();
  // 잔상 트레일: 반투명 배경 덮기로 회화적 붓질감
  paintTrail();

  updateFog(dt);
  drawBridge();             // 안개 뒤 흐릿한 교각(먼저, 아래층)
  drawFog();                // 안개가 다리를 덮어 흐리게
  drawTrain();
  drawRain(dt);
  drawPuffs(dt);

  ctx.restore();
}

// 황토-금-회갈 방사 그라데이션
function drawBackground() {
  const g = ctx.createRadialGradient(vp.x, vp.y, 10, vp.x, vp.y, Math.max(W, H) * 0.9);
  g.addColorStop(0, "#f3d27a");
  g.addColorStop(0.35, "#c8a24e");
  g.addColorStop(0.7, "#8a6a3c");
  g.addColorStop(1, "#4a3a28");
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);
}

// 반투명 트레일 (붓질감) — 배경색 계열로 살짝 덮기
function paintTrail() {
  ctx.fillStyle = "rgba(120,95,55,0.08)";
  ctx.fillRect(-20, -20, W + 40, H + 40);
}

// 안개 입자를 유동장으로 이동
function updateFog(dt) {
  for (let i = 0; i < fog.length; i++) {
    const f = fog[i];
    const v = flow(f.x, f.y, T);
    let vx = v.x, vy = v.y;
    // 커서 교란: 근처 입자에 커서 속도 주입
    if (stir.life > 0) {
      const dx = f.x - stir.x, dy = f.y - stir.y;
      const d2 = dx * dx + dy * dy;
      const R = 160;
      if (d2 < R * R) {
        const k = (1 - Math.sqrt(d2) / R) * stir.life * (reduced ? 0.3 : 1);
        vx += stir.vx * 0.15 * k;
        vy += stir.vy * 0.15 * k;
      }
    }
    const mul = f.sp * (reduced ? 0.5 : 1) * dt;
    f.x += vx * mul; f.y += vy * mul;
    // 래핑
    if (f.x < -f.r) f.x = W + f.r; else if (f.x > W + f.r) f.x = -f.r;
    if (f.y < -f.r) f.y = H + f.r; else if (f.y > H + f.r) f.y = -f.r;
  }
}

// 안개 그리기: 큰 반투명 원, 황토~회갈 보간
function drawFog() {
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < fog.length; i++) {
    const f = fog[i];
    // hue: 0=금빛, 1=회갈
    const r = Math.round(214 - f.hue * 90);
    const g = Math.round(176 - f.hue * 86);
    const b = Math.round(110 - f.hue * 60);
    const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    grd.addColorStop(0, `rgba(${r},${g},${b},${f.a})`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// 철교: 우하단→소실점 원근 사다리꼴 + 교각 아치
function drawBridge() {
  // 다리 상판: 우하단 넓게, 소실점에서 좁게
  const near = { x: W * 1.05, y: H * 0.92 };
  const far = { x: vp.x + W * 0.02, y: vp.y + H * 0.02 };
  const nw = W * 0.34;   // 근경 폭
  const fw = W * 0.02;   // 원경 폭
  // 상판 사다리꼴
  ctx.fillStyle = "rgba(46,34,24,0.85)";
  ctx.beginPath();
  ctx.moveTo(near.x, near.y - nw * 0.28);
  ctx.lineTo(near.x, near.y + nw * 0.14);
  ctx.lineTo(far.x, far.y + fw);
  ctx.lineTo(far.x, far.y - fw);
  ctx.closePath();
  ctx.fill();

  // 교각 아치 3개 (근경→원경으로 작아짐)
  ctx.strokeStyle = "rgba(38,28,20,0.8)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const t = 0.12 + k * 0.26;
    const bx = near.x + (far.x - near.x) * t;
    const by = near.y + (far.y - near.y) * t;
    const w = nw * (1 - t) * 0.5 + 6;
    const h = w * 1.1;
    ctx.fillStyle = `rgba(40,29,20,${0.75 - t * 0.4})`;
    // 교각 기둥
    ctx.fillRect(bx - w * 0.14, by, w * 0.28, H - by);
    // 아치
    ctx.beginPath();
    ctx.arc(bx, by + h, w * 0.5, Math.PI, 0);
    ctx.stroke();
  }
}

// 기차: 검은 덩어리 + 굴뚝 + 화실 글로우
function drawTrain() {
  const tr = trainPose(trainT);
  const s = tr.s;
  const bw = 90 * s, bh = 46 * s;

  // 화실(火室) 주황 글로우 — 접근할수록 강해짐
  const gl = 0.25 + tr.glow * 0.9;
  const gr = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, bw * 1.6);
  gr.addColorStop(0, `rgba(255,150,40,${gl})`);
  gr.addColorStop(0.4, `rgba(230,90,20,${gl * 0.4})`);
  gr.addColorStop(1, "rgba(120,40,10,0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(tr.x, tr.y, bw * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // 검은 기관차 덩어리(원근 방향으로 약간 기울인 사다리꼴 근사)
  ctx.fillStyle = "rgba(12,10,10,0.92)";
  ctx.beginPath();
  ctx.moveTo(tr.x - bw * 0.5, tr.y - bh * 0.5);
  ctx.lineTo(tr.x + bw * 0.5, tr.y - bh * 0.2);
  ctx.lineTo(tr.x + bw * 0.5, tr.y + bh * 0.5);
  ctx.lineTo(tr.x - bw * 0.5, tr.y + bh * 0.4);
  ctx.closePath();
  ctx.fill();

  // 굴뚝
  ctx.fillStyle = "rgba(8,7,7,0.95)";
  ctx.fillRect(tr.stackX - 7 * s, tr.stackY, 14 * s, 30 * s);

  // 화실 개구부(밝은 점)
  ctx.fillStyle = `rgba(255,190,90,${0.6 + tr.glow * 0.4})`;
  ctx.beginPath();
  ctx.arc(tr.x - bw * 0.25, tr.y + bh * 0.1, 6 * s + 2, 0, Math.PI * 2);
  ctx.fill();
}

// 비: 가는 사선 스트릭 우상→좌하 (안개색과 섞이는 따뜻한 톤)
function drawRain(dt) {
  ctx.lineWidth = 1;
  const dxu = -0.5, dyu = 1;            // 방향(좌하)
  const spd = reduced ? 0.4 : 1;
  for (let i = 0; i < rain.length; i++) {
    const r = rain[i];
    r.x += dxu * r.v * dt * spd;
    r.y += dyu * r.v * dt * spd;
    if (r.y > H + 40 || r.x < -40) {
      r.x = rnd(0, 1.2 * W); r.y = rnd(-0.2 * H, 0);
    }
    // 스트릭마다 알파가 달라야 하므로 개별 stroke
    ctx.strokeStyle = `rgba(235,214,164,${r.a})`;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + dxu * r.len, r.y + dyu * r.len);
    ctx.stroke();
  }
}

// 기적 증기 뭉게(상승 확산)
function drawPuffs(dt) {
  ctx.globalCompositeOperation = "lighter";
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy *= 0.98; p.r += 22 * dt; p.life -= dt * 0.5;
    if (p.life <= 0) { puffs.splice(i, 1); continue; }
    const a = p.a * p.life;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(255,245,220,${a})`);
    g.addColorStop(1, "rgba(240,220,180,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
