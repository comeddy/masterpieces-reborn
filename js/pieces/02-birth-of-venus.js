// js/pieces/02-birth-of-venus.js
// After Botticelli — Birth of Venus (c.1485)
// 입자가 원작(또는 절차적 조개껍질+여신 실루엣)으로 응집하고,
// 드래그=방향성 바람, 클릭=돌풍, 유휴=수평 바람 사인파 + 장미 꽃잎으로 반응한다.
import { ParticleField } from "../particle-engine.js";

const TAU = Math.PI * 2;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let field = null;
let petals = [];
let petalTimer = 3.5;
let bgGrad = null;

/* ---------- 절차적 폴백: 조개껍질 + 여신 실루엣 points ---------- */
// 목표색: 살구/크림 피부, 금빛 머리칼, 크림·분홍 조개. u,v는 0..1 정규화.
function skinCol() {
  const n = (Math.random() - 0.5) * 18;
  return [clamp(241 + n), clamp(207 + n), clamp(178 + n)];
}
function hairCol() {
  if (Math.random() < 0.28) { // 금빛 하이라이트
    const n = (Math.random() - 0.5) * 20;
    return [clamp(226 + n), clamp(188 + n), clamp(126 + n)];
  }
  const n = (Math.random() - 0.5) * 24;
  return [clamp(194 + n), clamp(148 + n), clamp(84 + n)];
}
// 타원 내부 균일 샘플 → points 누적
function pushBlob(arr, cx, cy, rx, ry, n, colFn) {
  for (let i = 0; i < n; i++) {
    const t = Math.random() * TAU;
    const rr = Math.sqrt(Math.random());
    const u = cx + Math.cos(t) * rx * rr;
    const v = cy + Math.sin(t) * ry * rr;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const c = colFn();
    arr.push({ u, v, r: c[0], g: c[1], b: c[2] });
  }
}
function buildFallbackPoints() {
  const pts = [];
  // 여신 몸 (살구/크림) — 머리·목·상체·엉덩이·다리·팔
  pushBlob(pts, 0.500, 0.130, 0.052, 0.072, 220, skinCol); // 머리
  pushBlob(pts, 0.500, 0.215, 0.026, 0.032, 70, skinCol);  // 목
  pushBlob(pts, 0.490, 0.360, 0.088, 0.135, 460, skinCol); // 상체
  pushBlob(pts, 0.500, 0.520, 0.078, 0.105, 360, skinCol); // 엉덩이
  pushBlob(pts, 0.505, 0.680, 0.056, 0.135, 320, skinCol); // 다리
  pushBlob(pts, 0.415, 0.400, 0.030, 0.105, 150, skinCol); // 왼팔(가슴 가림)
  pushBlob(pts, 0.585, 0.440, 0.028, 0.120, 150, skinCol); // 오른팔(내림)
  // 머리칼 (금빛) — 정수리 + 오른쪽으로 흘러내리는 곱슬
  pushBlob(pts, 0.500, 0.095, 0.075, 0.050, 150, hairCol);
  pushBlob(pts, 0.605, 0.240, 0.045, 0.090, 170, hairCol);
  pushBlob(pts, 0.635, 0.400, 0.045, 0.110, 200, hairCol);
  pushBlob(pts, 0.615, 0.550, 0.040, 0.090, 150, hairCol);
  pushBlob(pts, 0.420, 0.200, 0.028, 0.060, 70, hairCol);  // 왼쪽 잔머리
  // 조개껍질 (크림/분홍 부채꼴) — 발 아래, 방사형 능선
  for (let i = 0; i < 760; i++) {
    const rr = Math.sqrt(Math.random());
    const ang = Math.random() * Math.PI;
    const u = 0.5 + Math.cos(ang) * (0.02 + rr * 0.30);
    const v = 0.80 + Math.sin(ang) * (rr * 0.165);
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const rib = 0.5 + 0.5 * Math.sin(ang * 9); // 방사형 능선 음영
    const n = (Math.random() - 0.5) * 12;
    pts.push({
      u, v,
      r: clamp(242 + n - rib * 6),
      g: clamp(224 + n - rib * 20),
      b: clamp(202 + n - rib * 6),
    });
  }
  return pts;
}

/* ---------- 입자별 스프링 튜닝 ---------- */
// 밝은(살구/크림) 입자는 spring 낮게 → 여신의 몸이 가장 늦게 완성되는 연출.
function tuneSprings() {
  const ps = field.particles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const lum = p.r * 0.299 + p.g * 0.587 + p.b * 0.114;
    p.spring = lum > 175 ? 2.3 : 4.4;
  }
}

/* ---------- 배경: 바다-하늘 파스텔 그라데이션 ---------- */
function buildBg() {
  bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0.0, "#d7e9e1"); // 연청록 하늘
  bgGrad.addColorStop(0.5, "#e8ecdf");
  bgGrad.addColorStop(1.0, "#f5ecd9"); // 크림 바다거품
}

/* ---------- 장미 꽃잎 (연분홍 삼각형) ---------- */
function spawnBurst() {
  const n = 8 + (Math.random() * 5 | 0); // 8~12개
  const fromLeft = Math.random() < 0.5;
  const dir = fromLeft ? 1 : -1;
  for (let i = 0; i < n; i++) {
    petals.push({
      x: fromLeft ? -20 - Math.random() * 80 : W + 20 + Math.random() * 80,
      y: H * (0.08 + Math.random() * 0.7),
      vx: dir * (34 + Math.random() * 46),
      vy: (Math.random() - 0.5) * 22,
      rot: Math.random() * TAU,
      vr: (Math.random() - 0.5) * 3.2,
      size: 6 + Math.random() * 6,
      ph: Math.random() * TAU,
    });
  }
}
function updatePetals(dt, wind) {
  for (let i = petals.length - 1; i >= 0; i--) {
    const p = petals[i];
    p.ph += dt * 2.4;
    p.x += (p.vx + wind * 2.2) * dt;
    p.y += (p.vy + Math.sin(p.ph) * 12) * dt; // 나풀나풀 상하 흔들림
    p.rot += p.vr * dt;
    if (p.x < -160 || p.x > W + 160 || p.y > H + 80) petals.splice(i, 1);
  }
}
function drawPetals() {
  for (let i = 0; i < petals.length; i++) {
    const p = petals[i];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = "rgba(244,182,196,0.92)"; // 연분홍
    ctx.beginPath();
    ctx.moveTo(0, -p.size);
    ctx.lineTo(p.size * 0.7, p.size * 0.62);
    ctx.lineTo(-p.size * 0.7, p.size * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/* ---------- 입자 렌더: 부드러운 원, 목표색 그대로 ---------- */
function drawParticles() {
  const ps = field.particles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    ctx.fillStyle = "rgb(" + (p.r | 0) + "," + (p.g | 0) + "," + (p.b | 0) + ")";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    petals = []; petalTimer = reduced ? 6 : 3.5;
    const image = opts.assets && opts.assets.target ? opts.assets.target : null;
    const points = image ? null : buildFallbackPoints();
    field = new ParticleField({
      image, points,
      count: 6500,
      w: W, h: H,
      margin: 0.1,
      spring: 4.4,
      damping: 3.4,
      jitter: reduced ? 2 : 4.5,
    });
    tuneSprings();
    buildBg();
  },

  tick(dt, ptr) {
    T += dt;
    const ps = field.particles;

    // 클릭 = 돌풍: 강한 방사형 흩뜨림
    if (ptr.justDown && ptr.inside) {
      field.scatter(ptr.x, ptr.y, reduced ? 130 : 210, reduced ? 260 : 540);
    }

    // 드래그 = 바람: 이동 방향(dx,dy)으로 반경 내 입자를 직접 밀기
    if (ptr.down && ptr.inside) {
      const sp = Math.hypot(ptr.dx, ptr.dy);
      if (sp > 0.02) {
        const R = reduced ? 110 : 155, R2 = R * R;
        const k = reduced ? 6 : 13;
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          const ddx = p.x - ptr.x, ddy = p.y - ptr.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < R2) {
            const fall = 1 - Math.sqrt(d2) / R; // 반경 내 선형 감쇠
            p.vx += ptr.dx * k * fall;
            p.vy += ptr.dy * k * fall;
          }
        }
      }
    }

    // 유휴: 은은한 수평 바람 사인파 (위쪽=머리칼·옷자락일수록 크게 나부낌)
    const windAmp = reduced ? 3 : 9;
    const wind = Math.sin(T * 0.55) * windAmp + windAmp * 0.4;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const up = 1 - p.ty / H;
      p.vx += wind * dt * (0.35 + (up > 0 ? up : 0));
    }

    // 장미 꽃잎: 이따금 가장자리에서 8~12개가 날아와 가로지름
    petalTimer -= dt;
    if (petalTimer <= 0) {
      spawnBurst();
      petalTimer = (reduced ? 14 : 8) * (0.7 + Math.random() * 0.7);
    }
    updatePetals(dt, wind);

    field.step(dt);

    // 렌더
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
    drawParticles();
    drawPetals();
  },

  resize(w, h) {
    W = w; H = h;
    if (field) { field.resize(w, h); tuneSprings(); }
    if (ctx) buildBg();
  },

  dispose() {
    field = null; petals = []; bgGrad = null; ctx = null;
  },
};
