// js/pieces/03-pearl-earring.js
// After Vermeer — Girl with a Pearl Earring (c.1665)
// 어둠 속 빛 먼지 입자. 진주가 마지막에 가장 밝게 복원된다.
import { ParticleField } from "../particle-engine.js";

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let field = null;
let pearls = [];          // 진주 위치 입자 인덱스 목록
let flicker = 0;          // 촛불 깜빡임 남은 시간(초)
let flickerAge = 0;       // 깜빡임 경과 시간(초) — 방사형 웨이브 전파용
let waveOrigin = { x: 0, y: 0 };

// 진주의 이미지 내 정규화 좌표(대략) — contain-fit 박스 기준
const PEARL_U = 0.42, PEARL_V = 0.72, PEARL_R = 0.038;

const FLICKER_DUR = 0.6;  // 클릭 깜빡임 지속(초)

// 진주 입자의 절대 강성(전역 spring 4.2의 절반). 절대값으로 할당해
// tagPearls()가 여러 번 호출돼도(예: resize 반복) 누적 반감되지 않도록 한다.
const PEARL_SPRING = 2.1;

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = opts.reducedMotion; T = 0;
    flicker = 0; flickerAge = 0;
    const img = opts && opts.assets ? opts.assets.target : null;

    field = new ParticleField({
      image: img || null,
      points: img ? null : buildFallbackPoints(),
      count: 6500,
      w: W, h: H,
      margin: 0.1,
      spring: 4.2,
      damping: 3.4,
      jitter: 4,
    });

    tagPearls();
  },

  tick(dt, ptr) {
    T += dt;

    // 1) 입력 반영 --------------------------------------------------
    if (ptr && ptr.inside) {
      // 드래그: 촛불 바람 — 약한 scatter + 위쪽 부력
      if (ptr.down && (Math.abs(ptr.dx) > 0.01 || Math.abs(ptr.dy) > 0.01)) {
        const s = reduced ? 22 : 60;
        field.scatter(ptr.x, ptr.y, 90, s);
        applyBuoyancy(ptr.x, ptr.y, 120, reduced ? 30 : 80, dt);
      }
      // 클릭: 촛불 깜빡임 웨이브 시작
      if (ptr.justDown) {
        flicker = FLICKER_DUR;
        flickerAge = 0;
        waveOrigin.x = ptr.x; waveOrigin.y = ptr.y;
      }
    }
    if (flicker > 0) { flicker -= dt; flickerAge += dt; }

    // 2) 시뮬레이션 -------------------------------------------------
    field.step(dt);

    // 3) 렌더 -------------------------------------------------------
    drawBackground();
    drawParticles();
    drawPearls();
  },

  resize(w, h) {
    W = w; H = h;
    if (field) { field.resize(w, h); tagPearls(); }
  },

  dispose() {
    ctx = null; field = null; pearls = [];
  },
};

// --- 진주 입자 식별 -------------------------------------------------
// 목표 좌표(tx,ty)가 진주 위치에 가장 가까운 입자들을 골라
// spring을 절대값(PEARL_SPRING)으로 낮춰(가장 늦게 복원) glow 대상으로 표시.
// 진주 멤버십은 u,v 기반이라 resize와 무관 — 반감이 아닌 절대 할당이라 멱등하다.
function tagPearls() {
  pearls = [];
  const ps = field.particles;
  if (!ps || !ps.length) return;

  // contain-fit 박스 추정: 입자 목표 좌표의 경계에서 역산
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p.tx < minx) minx = p.tx;
    if (p.ty < miny) miny = p.ty;
    if (p.tx > maxx) maxx = p.tx;
    if (p.ty > maxy) maxy = p.ty;
  }
  const bw = maxx - minx, bh = maxy - miny;
  const cx = minx + PEARL_U * bw;
  const cy = miny + PEARL_V * bh;
  const rr = PEARL_R * Math.max(bw, bh);
  const rr2 = rr * rr;

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const dx = p.tx - cx, dy = p.ty - cy;
    if (dx * dx + dy * dy <= rr2) {
      p.spring = PEARL_SPRING; // 절대 강성 할당(멱등) → 가장 늦게 복원
      pearls.push(i);
    }
  }
}

// --- 폴백 절차적 points: 두건 + 얼굴 타원 + 진주 ---------------------
function buildFallbackPoints() {
  const pts = [];
  const N = 5200;
  for (let i = 0; i < N; i++) {
    const u = Math.random(), v = Math.random();
    // 얼굴 타원 (중앙 상단)
    const fx = 0.5, fy = 0.44, frx = 0.19, fry = 0.26;
    const ex = (u - fx) / frx, ey = (v - fy) / fry;
    const inFace = ex * ex + ey * ey <= 1;
    // 두건 (얼굴 위/좌우를 감싸는 넓은 타원)
    const hx = 0.5, hy = 0.4, hrx = 0.34, hry = 0.42;
    const gx = (u - hx) / hrx, gy = (v - hy) / hry;
    const inHood = gx * gx + gy * gy <= 1;

    if (inFace) {
      // 살결: 따뜻한 밝은 톤
      const sh = 0.55 + 0.35 * (1 - ey); // 위쪽이 더 밝음
      pts.push({ u, v, r: 205 * sh + 40, g: 165 * sh + 30, b: 130 * sh + 20 });
    } else if (inHood) {
      // 두건: 청/황 대비 (베르메르 울트라마린 + 옐로우 오커)
      if (v < 0.36 && u > 0.5) {
        pts.push({ u, v, r: 190, g: 150, b: 40 });   // 노란 두건 자락
      } else {
        pts.push({ u, v, r: 30, g: 55, b: 120 });    // 파란 두건
      }
    } else {
      i--; // 배경은 버림(어둠) — 재시도
      continue;
    }
  }
  // 진주: 밝은 흰빛 점군
  const pn = 90;
  for (let i = 0; i < pn; i++) {
    const a = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * PEARL_R;
    pts.push({
      u: PEARL_U + Math.cos(a) * rad,
      v: PEARL_V + Math.sin(a) * rad * 1.1,
      r: 240, g: 240, b: 250,
    });
  }
  return pts;
}

// --- 부력: 커서 주변 입자를 위쪽으로 밀어올림 ------------------------
function applyBuoyancy(cx, cy, radius, strength, dt) {
  const ps = field.particles;
  const r2 = radius * radius;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const fall = 1 - Math.sqrt(d2) / radius;
    p.vy -= strength * fall * dt * 60; // 위로 뜨는 힘
    p.vx += (Math.random() - 0.5) * strength * fall * dt * 20; // 옆으로 살랑
  }
}

// --- 배경: 거의 검정 + 미세 비네트 --------------------------------
function drawBackground() {
  // 잔상 트레일: 빛 먼지의 여운을 남긴다
  ctx.fillStyle = "rgba(5,5,7,0.34)";
  ctx.fillRect(0, 0, W, H);

  // 미세 비네트(가장자리를 더 어둡게)
  const g = ctx.createRadialGradient(
    W * 0.46, H * 0.46, Math.min(W, H) * 0.1,
    W * 0.5, H * 0.5, Math.max(W, H) * 0.72
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// --- 입자 렌더 -----------------------------------------------------
// 어두운 색은 작게, 밝은 색은 크게(빛 먼지). 유휴 twinkle.
function drawParticles() {
  const ps = field.particles;
  ctx.globalCompositeOperation = "lighter";

  // 클릭 웨이브: 중심에서 방사형으로 밝기 파동 전파
  const waveActive = flicker > 0;
  const waveR = flickerAge * Math.max(W, H) * 2.4; // 웨이브 반경 확장
  const waveWidth = Math.max(W, H) * 0.28;

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const lum = (p.r * 0.299 + p.g * 0.587 + p.b * 0.114) / 255; // 밝기 0..1

    // 입자별 위상 twinkle (유휴에도 살아있음)
    const tw = 0.72 + 0.28 * Math.sin(T * 2.4 + i * 0.7);
    let bright = 0.45 + lum * 0.75 * tw;

    // 방사형 밝기 웨이브
    if (waveActive) {
      const dx = p.x - waveOrigin.x, dy = p.y - waveOrigin.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const band = 1 - Math.min(1, Math.abs(d - waveR) / waveWidth);
      if (band > 0) {
        const env = flicker / FLICKER_DUR; // 시간 감쇠
        bright += band * env * (reduced ? 0.5 : 1.3);
      }
    }
    if (bright > 1.8) bright = 1.8;

    // 크기: 밝을수록 크게(빛 먼지)
    const sz = (p.size || 1) * (0.6 + lum * 1.7);

    const a = Math.min(1, 0.28 + bright * 0.5);
    ctx.fillStyle = "rgba(" +
      clamp255(p.r * bright) + "," +
      clamp255(p.g * bright) + "," +
      clamp255(p.b * bright) + "," + a.toFixed(3) + ")";

    if (sz <= 1.2) {
      ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

// --- 진주: 복원 완료에 가까울수록 글로우 ----------------------------
// "진주가 마지막에 가장 밝게 돌아온다" — 목표 좌표에 근접할수록 빛난다.
function drawPearls() {
  if (!pearls.length) return;
  const ps = field.particles;
  ctx.globalCompositeOperation = "lighter";

  for (let k = 0; k < pearls.length; k++) {
    const p = ps[pearls[k]];
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 복원도: 목표에 가까울수록 1
    const settle = Math.max(0, 1 - dist / 34);
    const glow = settle * settle; // 마지막 구간에서 급격히 밝아짐

    const pulse = 0.85 + 0.15 * Math.sin(T * 3 + pearls[k]);
    const gr = (p.size || 1) * (2.6 + glow * 6.5) * pulse;

    // 2겹 원: 바깥 halo + 안쪽 코어
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, gr);
    const ha = (0.12 + glow * 0.6);
    halo.addColorStop(0, "rgba(255,252,240," + ha.toFixed(3) + ")");
    halo.addColorStop(0.5, "rgba(230,225,205," + (ha * 0.4).toFixed(3) + ")");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y, gr, 0, Math.PI * 2);
    ctx.fill();

    // 코어 하이라이트
    const ca = 0.5 + glow * 0.5;
    ctx.fillStyle = "rgba(255,255,255," + ca.toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.size || 1) * (0.8 + glow * 1.2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function clamp255(v) {
  v = v | 0;
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
