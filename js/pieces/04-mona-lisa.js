// js/pieces/04-mona-lisa.js
// After Leonardo — Mona Lisa (c.1503) · 점묘 안개 초상
// 점(입자)만으로 얼굴을 해상한다: 얼굴 영역을 고밀도로 샘플링해 응집 시
// 눈·코·입(미소)이 쇠라의 점묘처럼 또렷이 읽히게 한다. 흩어지면 sfumato 연기.
import { ParticleField, samplePoints } from "../particle-engine.js";

const TAU = Math.PI * 2;
const SPRING = 3.6;            // 기본 복원 강성
const MONO = [116, 98, 76];   // 안개 상태의 갈색-회갈색 모노톤

// 얼굴 박스(원작 960×1431 자산 실측 · 이미지 정규화 u,v).
// 눈·코·입을 감싸는 영역 — 여기에 입자를 몰아넣어 점만으로 이목구비를 해상한다.
const FACE = { u0: 0.30, u1: 0.68, v0: 0.10, v1: 0.45 };
// 미소 밴드(입 중심 u≈0.46, v≈0.33) — 복원이 가장 느려 미소가 마지막에 맺힌다.
const SMILE = { u0: 0.37, u1: 0.55, v0: 0.30, v1: 0.365 };

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let field = null;
let bg = null;                 // 오프스크린 배경 그라데이션
let fog = 0;                   // 전역 안개 계수 (0 응집 ~ 1 흩어짐)
let cx0 = 0, cy0 = 0;          // 입자 목표 바운딩 박스 중심

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0; fog = 0;

    const img = opts.assets && opts.assets.target ? opts.assets.target : null;
    const built = buildPoints(img);   // { points, aspect }
    field = new ParticleField({
      points: built.points, aspect: built.aspect, count: built.points.length,
      w: W, h: H, margin: 0.1,
      spring: SPRING, damping: 3.4, jitter: 2.5,
      sizeMin: 1.1, sizeMax: 2.2,
    });

    buildBackground();
    tagParticles(); // 얼굴/미소 판별 · 숨쉬기 기준 목표 기록
  },

  tick(dt, ptr) {
    T += dt;

    // 1) 입력 반영
    if (ptr.inside && ptr.justDown) {
      // 클릭 = 안개 폭발: 전체를 방사형으로 밀치고 이후 spring으로 서서히 응결
      field.scatter(ptr.x, ptr.y, Math.min(W, H) * 0.95, reduced ? 130 : 260);
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

    // 3) 렌더
    render();
  },

  resize(w, h) {
    W = w; H = h;
    field.resize(w, h);
    buildBackground();
    tagParticles();
  },

  dispose() { ctx = null; field = null; bg = null; },
};

// ── 목표점 구성: 전체 기본 샘플 + 얼굴 박스 고밀도 샘플 (점만으로 얼굴 해상) ─
function buildPoints(img) {
  if (!img) return { points: makePortraitPoints(), aspect: 0.75 }; // 폴백: 절차적 실루엣
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const baseN = reduced ? 4200 : 7000;
  const faceTarget = reduced ? 3200 : 5000;
  const boxArea = (FACE.u1 - FACE.u0) * (FACE.v1 - FACE.v0); // ≈0.133
  // 얼굴 박스 내부에서 faceTarget개를 얻도록 전체를 큰 count로 샘플 후 필터
  const faceSampleN = Math.round(faceTarget / boxArea);
  const base = samplePoints(img, { count: baseN });
  const face = samplePoints(img, { count: faceSampleN }).filter(inFace);
  const points = base.concat(face);
  shuffle(points); // 화면 면적 캡(w*h/110)이 얼굴·배경을 고르게 자르도록
  return { points, aspect: iw / ih };
}

function inFace(p) {
  return p.u >= FACE.u0 && p.u <= FACE.u1 && p.v >= FACE.v0 && p.v <= FACE.v1;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
}

// ── 입자 태깅: 얼굴/미소 판별 + 미소 spring 감쇠 + 숨쉬기 기준점 ───────
function tagParticles() {
  const ps = field.particles;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ps) {
    if (p.tx < minX) minX = p.tx; if (p.tx > maxX) maxX = p.tx;
    if (p.ty < minY) minY = p.ty; if (p.ty > maxY) maxY = p.ty;
  }
  cx0 = (minX + maxX) / 2; cy0 = (minY + maxY) / 2;

  for (const p of ps) {
    p.bx = p.tx; p.by = p.ty;                 // 숨쉬기 기준 목표
    p.phase = Math.random() * TAU;            // 개별 위상
    // 이미지 정규화 좌표(p.u,p.v)로 얼굴/미소 판별 — 점만으로 이목구비를 해상
    p.isFace = inFace(p);
    const smile = p.u >= SMILE.u0 && p.u <= SMILE.u1 && p.v >= SMILE.v0 && p.v <= SMILE.v1;
    p.isSmile = smile;
    // 미소 영역(입 주변)은 복원이 가장 느림 → 얼굴이 맺힐 때 미소가 마지막에 완성
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

// ── 렌더: 점묘 초상 ─────────────────────────────────────────────
// 흩어지면 부드러운 연기(헤일로 additive), 응집하면 얼굴 입자가 작고 또렷한
// source-over 점묘로 전환되어 눈·코·입(미소)이 점의 집합으로 읽힌다.
function render() {
  // 반투명 배경 재도포 → 연기 잔상 (정지한 점은 매 프레임 다시 찍혀 또렷이 유지)
  ctx.globalAlpha = reduced ? 0.6 : 0.32;
  ctx.drawImage(bg, 0, 0, W, H);
  ctx.globalAlpha = 1;

  const ps = field.particles;
  const coh = Math.max(0, Math.min(1, 1 - fog)); // 응집도 (0 연기 ~ 1 또렷)

  // 패스 1 (additive): 헤일로 — sfumato 안개 글로우.
  //   배경은 항상 부드럽게, 얼굴은 응집할수록 헤일로가 걷혀 디테일이 드러난다.
  ctx.globalCompositeOperation = "lighter";
  for (const p of ps) {
    const ha = p.isFace ? 0.06 * (1 - coh) : 0.05; // 얼굴 헤일로는 응집 시 소멸
    if (ha < 0.003) continue;
    const c = shade(p);
    // 어두운 점(드레스·머리·그늘)은 additive 글로우에 거의 기여하지 않는다 →
    // 큰 헤일로 원 그리기를 건너뛰어 비용을 줄이고 어두운 영역을 어둡게 유지.
    if (c[0] + c[1] + c[2] < 135) continue;
    const s = (p.size || 1.5) * 2.6;
    ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + ha + ")";
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
  }
  // 패스 2 (additive): 배경 코어 — 부드러운 연기 심 (sfumato 보존).
  //   낮은 알파로 밝은 영역(가슴·하늘)이 additive 합산으로 하얗게 번지는 것을 억제.
  for (const p of ps) {
    if (p.isFace) continue;
    const c = shade(p);
    const s = (p.size || 1.5) * 0.8;
    ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0.34)";
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
  }
  // 패스 3 (source-over): 얼굴 코어 — 응집할수록 작고 조밀·불투명한 점묘.
  //   additive가 아니라 실제 색을 덮으므로 눈·입 그늘이 어둡게 남는다
  //   (사진 리빌이 아니라 점의 집합으로 얼굴이 해상된다).
  ctx.globalCompositeOperation = "source-over";
  for (const p of ps) {
    if (!p.isFace) continue;
    const c = faceShade(p, coh);
    const a = 0.42 + 0.53 * coh;                       // 0.42(연기) → 0.95(응집)
    const s = (p.size || 1.5) * (0.92 - 0.26 * coh);   // 응집할수록 작고 조밀
    ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// 응집이면 원색, 흩어질수록 모노톤 (전역 fog + 개별 목표거리)
function shade(p) {
  const d = Math.hypot(p.tx - p.x, p.ty - p.y);
  const lf = Math.min(1, Math.max(fog, d / 70));
  return [
    (p.r + (MONO[0] - p.r) * lf) | 0,
    (p.g + (MONO[1] - p.g) * lf) | 0,
    (p.b + (MONO[2] - p.b) * lf) | 0,
  ];
}

// 얼굴 입자: 응집할수록 명도 대비를 키운다. 모나리자의 이목구비는 저대비
// sfumato라 그대로면 균일한 살색 덩어리로 뭉갠다 → 눈·코·입(미소) 그늘을
// 어둡게, 광대·이마를 밝게 벌려 점의 명암 패턴만으로 얼굴이 해상되게 한다.
function faceShade(p, coh) {
  const c = shade(p);
  if (coh < 0.02) return c; // 흩어진 상태는 원 거동 유지
  const k = 1 + 0.95 * coh;                 // 대비 확장 계수 (1 → ~1.95)
  const pivot = 150;                         // 살색 중간 명도 기준
  const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const lum2 = pivot + (lum - pivot) * k;    // 명도만 확장 (색조 보존)
  const ratio = Math.max(0, lum2) / Math.max(1, lum);
  return [
    Math.min(255, c[0] * ratio) | 0,
    Math.min(255, c[1] * ratio) | 0,
    Math.min(255, c[2] * ratio) | 0,
  ];
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
