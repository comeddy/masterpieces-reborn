// js/pieces/04-mona-lisa.js
// After Leonardo — Mona Lisa (c.1503) · sfumato 안개 입자
import { ParticleField } from "../particle-engine.js";

const TAU = Math.PI * 2;
const SPRING = 3.6;            // 기본 복원 강성
const MONO = [116, 98, 76];   // 안개 상태의 갈색-회갈색 모노톤

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let field = null;
let bg = null;                 // 오프스크린 배경 그라데이션
let fog = 0;                   // 전역 안개 계수 (0 응집 ~ 1 흩어짐)
let cx0 = 0, cy0 = 0;          // 입자 목표 바운딩 박스 중심
let srcImg = null;             // 원작 이미지 (리빌 크로스페이드용 · 없으면 리빌 비활성)
let reveal = 0;                // 안개 걷힘 계수 (0 안개 ~ 1 선명한 원작)
let revealSmile = 0;           // 미소 밴드 전용 리빌 (main을 늦게 추종 → 미소가 마지막에 완성)

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0; fog = 0;
    reveal = 0; revealSmile = 0;

    const img = opts.assets && opts.assets.target ? opts.assets.target : null;
    srcImg = img;              // 있으면 응집 시 원작이 서서히 드러난다
    const count = reduced ? 3200 : 6200;
    field = new ParticleField({
      image: img,
      points: img ? null : makePortraitPoints(), // null이면 초상 실루엣 절차 points
      count, w: W, h: H, margin: 0.1,
      spring: SPRING, damping: 3.4, jitter: 4,
    });

    buildBackground();
    tagParticles(); // 미소 영역 판별 · 숨쉬기 기준 목표 기록
  },

  tick(dt, ptr) {
    T += dt;

    // 1) 입력 반영
    if (ptr.inside && ptr.justDown) {
      // 클릭 = 안개 폭발: 전체를 방사형으로 밀치고 이후 spring으로 서서히 응결
      field.scatter(ptr.x, ptr.y, Math.min(W, H) * 0.95, reduced ? 130 : 260);
      // 흩뜨리는 순간 원작은 즉시(수백 ms) 안개로 사라진다 — 재응집은 천천히
      reveal *= reduced ? 0.45 : 0.12;
      revealSmile *= reduced ? 0.45 : 0.12;
    } else if (ptr.inside && ptr.down) {
      // 드래그 = sfumato 휘젓기: 소용돌이 + 커서 주변 의사 컬 노이즈
      const sp = Math.hypot(ptr.dx, ptr.dy);
      const rad = Math.min(W, H) * 0.24;
      field.swirl(ptr.x, ptr.y, rad, (reduced ? 70 : 150) + sp * 4);
      stirCurl(ptr.x, ptr.y, rad, sp);
    }

    // 2) 시뮬레이션 (유휴 숨쉬기 → 적분)
    applyBreathing();
    field.step(dt);
    updateFog(dt);
    updateReveal(dt);

    // 3) 렌더
    render();
  },

  resize(w, h) {
    W = w; H = h;
    field.resize(w, h);
    buildBackground();
    tagParticles();
  },

  dispose() { ctx = null; field = null; bg = null; srcImg = null; },
};

// ── 입자 태깅: 미소 영역 spring 감쇠 + 숨쉬기 기준점 ───────────────
function tagParticles() {
  const ps = field.particles;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ps) {
    if (p.tx < minX) minX = p.tx; if (p.tx > maxX) maxX = p.tx;
    if (p.ty < minY) minY = p.ty; if (p.ty > maxY) maxY = p.ty;
  }
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  cx0 = minX + spanX / 2; cy0 = minY + spanY / 2;

  for (const p of ps) {
    const u = (p.tx - minX) / spanX, v = (p.ty - minY) / spanY;
    p.bx = p.tx; p.by = p.ty;                 // 숨쉬기 기준 목표
    p.phase = Math.random() * TAU;            // 개별 위상
    // 미소 영역(입 주변)은 복원이 가장 느림.
    // 원작 04-mona-lisa.jpg 픽셀 측정값(입 중심 u≈0.45, v≈0.31).
    const smile = u > 0.37 && u < 0.53 && v > 0.275 && v < 0.345;
    p.isSmile = smile;
    p.spring = smile ? SPRING * 0.4 : SPRING;
  }
}

// ── 유휴: 아주 느린 숨쉬기 (중심 기준 미세 팽창/수축 + 개별 사인) ──
function applyBreathing() {
  const ps = field.particles;
  const breathe = Math.sin(T * 0.45) * (reduced ? 0.0018 : 0.005);
  const micro = reduced ? 0.12 : 0.4;
  for (const p of ps) {
    const s = 1 + breathe;
    p.tx = cx0 + (p.bx - cx0) * s + Math.cos(p.phase + T * 0.7) * micro;
    p.ty = cy0 + (p.by - cy0) * s + Math.sin(p.phase + T * 0.6) * micro;
  }
}

// ── 드래그 휘젓기: 사인 기반 의사 컬 노이즈로 vx,vy에 회전 성분 부여 ─
function stirCurl(cx, cy, rad, sp) {
  const ps = field.particles;
  const r2 = rad * rad;
  const force = (reduced ? 16 : 40) + sp * 1.4;
  for (const p of ps) {
    const dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const fall = 1 - Math.sqrt(d2) / rad;
    // 의사 컬: 위치·시간의 사인장 → 연기처럼 감기는 회전 방향
    const n = Math.sin(p.x * 0.018 + T * 1.3) + Math.cos(p.y * 0.02 - T * 1.1);
    const a = n * Math.PI;
    p.vx += Math.cos(a) * force * fall;
    p.vy += Math.sin(a) * force * fall;
  }
}

// ── 안개 상태: 평균 목표거리로 전역 fog 계수 갱신 ──────────────────
function updateFog(dt) {
  const ps = field.particles;
  let sum = 0;
  for (const p of ps) sum += Math.hypot(p.tx - p.x, p.ty - p.y);
  const target = Math.min(1, (sum / ps.length) / 55);
  fog += (target - fog) * Math.min(1, dt * 3);
}

// ── 리빌: 응집(낮은 fog)이면 원작이 서서히 드러나고, 흩어지면 빠르게 사라진다 ─
// 비대칭 이징 — 차오름은 느리게(2~4초), 사라짐은 빠르게(수백 ms). 미소는 가장 늦게.
function updateReveal(dt) {
  if (!srcImg) return; // 이미지 없으면 리빌 비활성 (절차적 폴백은 입자만)
  // fog≤0.08 → 완전 선명(1), fog≥0.42 → 안개(0)
  const coherence = Math.max(0, Math.min(1, (0.42 - fog) / 0.34));
  const up = reduced ? 1.3 : 0.85;   // 느린 리빌 (τ≈1.2s → 3~4초에 선명)
  const down = reduced ? 6 : 9;      // 빠른 소멸 (τ≈0.11s → 수백 ms)
  reveal += (coherence - reveal) * Math.min(1, dt * (coherence > reveal ? up : down));
  // 미소 밴드는 main 리빌을 더 느리게 추종 → 얼굴이 돌아올 때 미소가 마지막에 완성
  const sUp = reduced ? 0.9 : 0.42, sDown = reduced ? 6 : 9;
  revealSmile += (reveal - revealSmile) * Math.min(1, dt * (reveal > revealSmile ? sUp : sDown));
}

// ── 렌더: 부드러운 연기 (헤일로 + 코어 2겹, 잔상 트레일) + 원작 리빌 ─
function render() {
  // 반투명 배경 재도포 → 연기 잔상
  ctx.globalAlpha = reduced ? 0.6 : 0.32;
  ctx.drawImage(bg, 0, 0, W, H);
  ctx.globalAlpha = 1;

  // 리빌: 안개가 걷히면 실제 원작이 드러난다. 입자 필드와 동일한
  // contain-fit 박스(field.fit)에 그려 입자·이미지가 정확히 겹친다.
  if (srcImg && reveal > 0.003) {
    const f = field.fit;
    ctx.globalAlpha = reveal;
    ctx.drawImage(srcImg, f.x, f.y, f.w, f.h);
    ctx.globalAlpha = 1;
    // 미소는 가장 늦게 — 남은 안개가 입가에 마지막까지 머문다 (부드러운 원형 베일)
    const gap = reveal - revealSmile;
    if (gap > 0.012) {
      const mx = f.x + 0.45 * f.w, my = f.y + 0.31 * f.h; // 입 중심 (실측 u≈0.45, v≈0.31)
      const mr = f.w * 0.22;
      const veil = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      veil.addColorStop(0, "rgba(26,20,12," + gap + ")");
      veil.addColorStop(0.55, "rgba(26,20,12," + (gap * 0.6) + ")");
      veil.addColorStop(1, "rgba(26,20,12,0)");
      ctx.fillStyle = veil;
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    }
  }

  // 입자: 리빌이 차오를수록 옅어지되 완전히 사라지진 않는다 (안개 잔결)
  const pfade = 1 - reveal * 0.82;
  const ps = field.particles;
  ctx.globalCompositeOperation = "lighter";
  for (const p of ps) {
    // 색: 응집이면 원색, 흩어질수록 모노톤 (전역 fog + 개별 거리)
    const d = Math.hypot(p.tx - p.x, p.ty - p.y);
    const lf = Math.min(1, Math.max(fog, d / 70));
    const r = (p.r + (MONO[0] - p.r) * lf) | 0;
    const g = (p.g + (MONO[1] - p.g) * lf) | 0;
    const b = (p.b + (MONO[2] - p.b) * lf) | 0;
    const s = (p.size || 1.5) * (0.72 + 0.28 * pfade);
    // 헤일로: 큰 원 + 낮은 알파 → 안개
    ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + (0.06 * pfade) + ")";
    ctx.beginPath(); ctx.arc(p.x, p.y, s * 2.6, 0, TAU); ctx.fill();
    // 코어: 작은 원 → 형상의 심
    ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + (0.5 * pfade) + ")";
    ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.8, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// ── 배경: 어두운 갈색 그라데이션 (#1a140c → #0a0806) ───────────────
function buildBackground() {
  bg = document.createElement("canvas");
  bg.width = Math.max(2, Math.round(W));
  bg.height = Math.max(2, Math.round(H));
  const g = bg.getContext("2d");
  const grad = g.createRadialGradient(
    W * 0.5, H * 0.42, Math.min(W, H) * 0.05,
    W * 0.5, H * 0.5, Math.max(W, H) * 0.75
  );
  grad.addColorStop(0, "#1a140c");
  grad.addColorStop(1, "#0a0806");
  g.fillStyle = grad;
  g.fillRect(0, 0, bg.width, bg.height);
}

// ── 절차적 폴백: 초상 실루엣 points (assets.target이 null일 때) ────
function makePortraitPoints() {
  const pts = [];
  const N = 2400;
  while (pts.length < N) {
    const u = Math.random(), v = Math.random();
    const col = portraitColor(u, v);
    if (col) pts.push({ u, v, r: col[0], g: col[1], b: col[2] });
  }
  return pts;
}

function insideOval(u, v, cu, cv, ru, rv) {
  const a = (u - cu) / ru, b = (v - cv) / rv;
  return a * a + b * b <= 1;
}

function tint(r, g, b, f) {
  const k = Math.max(0, Math.min(1, f));
  return [(r * k) | 0, (g * k) | 0, (b * k) | 0];
}

// 레오나르도 팔레트의 반신 초상 근사 (얼굴/머리/목/드레스/모은 손)
function portraitColor(u, v) {
  // 얼굴 (위는 밝고 아래로 그늘 — sfumato)
  if (insideOval(u, v, 0.5, 0.30, 0.135, 0.175)) {
    return tint(206, 176, 140, 1 - (v - 0.13) * 0.5);
  }
  // 목 그늘
  if (u > 0.445 && u < 0.555 && v > 0.45 && v < 0.53) return [150, 120, 92];
  // 머리카락·베일 (얼굴을 감싸는 외곽 타원)
  if (insideOval(u, v, 0.5, 0.30, 0.215, 0.255) && v < 0.56) return [58, 40, 28];
  // 앞으로 모은 두 손
  if (insideOval(u, v, 0.5, 0.82, 0.12, 0.055)) return [176, 146, 112];
  // 상체·드레스 (아래로 넓어지는 사다리꼴, 옷주름 명암)
  if (v > 0.5) {
    const hw = 0.16 + (v - 0.5) * 0.56;
    if (u > 0.5 - hw && u < 0.5 + hw) {
      return tint(48, 35, 25, 0.9 + 0.2 * Math.sin(u * 40 + v * 6));
    }
  }
  return null;
}
