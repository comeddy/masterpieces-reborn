// js/pieces/15-lovers-moonlight.js
// After Shin Yun-bok — Wolha-jeongin, 월하정인 (c.1793, 간송미술관) · 달빛 내러티브
// 원작을 밤 색조로 깐 위에 두 광원이 산다: 담장 위 눈썹달(아래로 볼록한 원작 형태)이
// 아주 느리게 차고 기울며 장면의 밝기·색온을 바꾸고, 연인 곁 초롱불이 따뜻하게 명멸한다.
// 커서는 구름이 되어 lerp로 따라오다 달과 겹치면 달빛 성분이 스러지고 — 초롱불 하나만
// 남은 어둠 속에서 연인은 서로에게 미세하게 기운다. 클릭하면 초롱불이 한 번 크게 깜빡인다.
//
// 규약: dt·pointer만 사용. addEventListener/rAF/타이머/시계 API 없음.
// document는 오프스크린 캔버스 생성에만 사용. 좌표는 CSS px. assets.target 없으면 절차적 폴백.

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let img = null;                         // 원작 (없으면 null → 절차적 폴백)
let A = null, actx = null;              // 오프스크린 A: 밤 배경 + 원작(또는 절차 근사)
let M = null, mctx = null;              // 오프스크린 M: 눈썹달 크레센트 렌더용
let fit = { x: 0, y: 0, w: 0, h: 0 };   // 원작 contain-fit 사각형
const MARGIN = 0.05;

// ---- 원작 관찰 좌표(이미지 정규화 0..1) — 1280×1015 기준 실측 ----
const MOON = { x: 0.300, y: 0.245 };    // 담장 위 눈썹달 중심
const LANTERN = { x: 0.884, y: 0.635 }; // 남자가 든 초롱(주황 상자)
// 연인 크롭 조각(어두워질수록 서로에게 기우는 미세 오버레이용)
const WOMAN = { x: 0.575, y: 0.31, w: 0.205, h: 0.58, px: 0.685, py: 0.90 }; // 쓰개치마 여인
const MAN = { x: 0.745, y: 0.19, w: 0.245, h: 0.71, px: 0.865, py: 0.90 };  // 갓·도포 남자

// ---- 광원 상태 ----
const MOON_W = (Math.PI * 2) / 60;      // 삭망 주기 60초 — "아주 느리게" 차고 기욺
const MOON_PHASE0 = 0.9;                // 시작 위상(밝은 쪽에서 출발 → 첫 화면이 밤+달)
let moonlight = 0.9;                     // 실효 달빛(0..1), 목표값으로 부드럽게 수렴
let lanternPulse = 0;                    // 클릭 깜빡임 잔여(초)

// ---- 구름(커서) ----
let cx = 0, cy = 0;                      // lerp 추종 구름 중심
let cloudR = 0;                          // 구름 반경(px)
let seeded = false;                      // 첫 프레임에 커서로 순간이동 방지

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}

// 원작 종횡비를 화면에 contain-fit (없으면 원작 1280×1015 비율 근사)
function computeFit() {
  let iw = img ? (img.naturalWidth || img.width) : 0;
  let ih = img ? (img.naturalHeight || img.height) : 0;
  if (iw <= 0 || ih <= 0) { iw = 1280; ih = 1015; }
  const bw = W * (1 - MARGIN * 2), bh = H * (1 - MARGIN * 2);
  const s = Math.min(bw / iw, bh / ih);
  const w = iw * s, h = ih * s;
  fit = { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// 이미지 정규화 좌표 → 화면 px
const px = (nx) => fit.x + fit.w * nx;
const py = (ny) => fit.y + fit.h * ny;

// 배경 베이크: 깊은 밤 여백 → 원작(또는 절차적 근사)
const NIGHT_BG = "#12131f";             // 레터박스·여백의 밤 바탕
function buildBase() {
  actx.setTransform(1, 0, 0, 1, 0, 0);
  actx.clearRect(0, 0, W, H);
  actx.fillStyle = NIGHT_BG;
  actx.fillRect(0, 0, W, H);
  if (img) actx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
  else proceduralScene();
}

// 절차적 폴백 — 담벼락 + 두 실루엣(쓰개치마 여인·갓 쓴 남자). 달은 광원 레이어가 그린다.
function proceduralScene() {
  const { x, y, w, h } = fit;
  // 은은한 밤하늘 종이 톤
  const sky = actx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, "#2a2c3a");
  sky.addColorStop(1, "#3a3b44");
  actx.fillStyle = sky;
  actx.fillRect(x, y, w, h);

  // 좌측 기와집 지붕 + 담벼락(대각선으로 내려오는 담장)
  actx.fillStyle = "#20222c";
  actx.beginPath();                       // 지붕(맞배 실루엣)
  actx.moveTo(x, y + h * 0.10);
  actx.lineTo(x + w * 0.11, y + h * 0.05);
  actx.lineTo(x + w * 0.27, y + h * 0.33);
  actx.lineTo(x + w * 0.27, y + h * 0.40);
  actx.lineTo(x, y + h * 0.40);
  actx.closePath();
  actx.fill();
  actx.fillStyle = "#4a4b55";             // 밝은 회벽 담장(달빛에 드러남)
  actx.beginPath();
  actx.moveTo(x, y + h * 0.40);
  actx.lineTo(x + w * 0.27, y + h * 0.40);
  actx.lineTo(x + w * 0.55, y + h);
  actx.lineTo(x, y + h);
  actx.closePath();
  actx.fill();

  // 여인(쓰개치마) — 청회색 후드 실루엣
  actx.fillStyle = "#5c6b74";
  actx.beginPath();
  actx.moveTo(px(WOMAN.x + 0.02), py(WOMAN.y + WOMAN.h));
  actx.quadraticCurveTo(px(WOMAN.x - 0.02), py(WOMAN.y), px(WOMAN.x + WOMAN.w * 0.5), py(WOMAN.y - 0.02));
  actx.quadraticCurveTo(px(WOMAN.x + WOMAN.w + 0.02), py(WOMAN.y), px(WOMAN.x + WOMAN.w * 0.78), py(WOMAN.y + WOMAN.h));
  actx.closePath();
  actx.fill();

  // 남자(도포) — 흰 실루엣 + 검은 갓
  actx.fillStyle = "#d7d5cc";
  actx.beginPath();
  actx.moveTo(px(MAN.x + 0.03), py(MAN.y + MAN.h));
  actx.quadraticCurveTo(px(MAN.x), py(MAN.y + 0.18), px(MAN.x + MAN.w * 0.5), py(MAN.y + 0.14));
  actx.quadraticCurveTo(px(MAN.x + MAN.w), py(MAN.y + 0.18), px(MAN.x + MAN.w * 0.82), py(MAN.y + MAN.h));
  actx.closePath();
  actx.fill();
  actx.fillStyle = "#14151b";             // 갓
  actx.beginPath();
  actx.ellipse(px(MAN.x + MAN.w * 0.52), py(MAN.y + 0.10), fit.w * 0.075, fit.h * 0.03, 0, 0, 6.283);
  actx.fill();
  actx.fillRect(px(MAN.x + MAN.w * 0.44), py(MAN.y + 0.02), fit.w * 0.055, fit.h * 0.09);
  // 초롱(주황 상자)
  actx.fillStyle = "#c8703a";
  actx.fillRect(px(LANTERN.x) - fit.w * 0.02, py(LANTERN.y) - fit.h * 0.03, fit.w * 0.04, fit.h * 0.06);
}

// ---- 눈썹달 ----
// 원작의 달은 아래로 볼록한 크레센트(뿔이 위·오른쪽). 흰 원반에서 위·오른쪽으로
// 살짝 밀어낸 원을 destination-out으로 파내 그 형태를 얻는다. 오프스크린 M에 그린 뒤
// 밝기(가시 달빛)를 알파로 실어 lighter 합성한다.
let moonR = 0;                           // 달 반경(px)
function sizeMoon() {
  moonR = Math.max(9, fit.w * 0.021);
  const s = Math.ceil(moonR * 2.6);
  M = makeCanvas(s, s);
  mctx = M.getContext("2d");
}
function bakeMoon() {
  const s = M.width, c = s / 2;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, s, s);
  const g = mctx.createRadialGradient(c, c, 0, c, c, moonR);
  g.addColorStop(0, "rgba(255,252,240,1)");
  g.addColorStop(1, "rgba(238,240,250,0.92)");
  mctx.fillStyle = g;
  mctx.beginPath();
  mctx.arc(c, c, moonR, 0, 6.283);
  mctx.fill();
  // 크레센트 파내기: 위(-y)·오른쪽(+x)으로 밀어낸 원 → 아래로 볼록한 얇은 눈썹달
  mctx.globalCompositeOperation = "destination-out";
  mctx.beginPath();
  mctx.arc(c + moonR * 0.30, c - moonR * 0.42, moonR * 1.06, 0, 6.283);
  mctx.fill();
  mctx.globalCompositeOperation = "source-over";
}

// 방사형 글로우(가산 합성용 헬퍼)
function glow(x, y, r, r0, g0, b0, a) {
  if (a <= 0.002 || r <= 0) return;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${r0},${g0},${b0},${a})`);
  gr.addColorStop(0.5, `rgba(${r0},${g0},${b0},${a * 0.35})`);
  gr.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// 어두워질수록 연인 크롭 조각을 서로에게 기울인다(미세 2~3px 변위 + 살짝 회전)
function leanCrop(cp, dir, dark, breath) {
  const sx = px(cp.x), sy = py(cp.y), sw = fit.w * cp.w, sh = fit.h * cp.h;
  if (sw <= 0 || sh <= 0) return;
  const kd = reduced ? 0.3 : 1;
  const dxp = dir * (2.6 * kd) * dark * breath;                 // 상대 쪽으로 2~3px 변위
  const rot = dir * (0.012 * kd) * dark * breath;               // 상대 쪽으로 미세 기울기
  const pvx = px(cp.px), pvy = py(cp.py);
  ctx.save();
  ctx.globalAlpha = 0.28 * dark;
  ctx.translate(pvx + dxp, pvy);
  ctx.rotate(rot);
  ctx.translate(-pvx, -pvy);
  ctx.drawImage(A, sx, sy, sw, sh, sx, sy, sw, sh);
  ctx.restore();
}

// 부드러운 구름(여러 겹 방사형 블롭). 달을 가리면 어둠이 내린다.
function drawCloud() {
  const churn = reduced ? 0.25 : 1;
  ctx.globalCompositeOperation = "source-over";
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * 6.283;
    const wob = Math.sin(T * 0.6 + i * 1.7) * cloudR * 0.16 * churn;
    const bx = cx + Math.cos(a) * cloudR * 0.5 + Math.sin(T * 0.4 + i) * cloudR * 0.1 * churn;
    const by = cy + Math.sin(a) * cloudR * 0.34 + wob;
    const br = cloudR * (0.5 + 0.18 * Math.sin(i * 2.1));
    const gr = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    gr.addColorStop(0, "rgba(38,42,58,0.52)");
    gr.addColorStop(1, "rgba(38,42,58,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    img = opts.assets && opts.assets.target ? opts.assets.target : null;
    A = makeCanvas(W, H); actx = A.getContext("2d");
    computeFit(); buildBase(); sizeMoon(); bakeMoon();
    cloudR = Math.min(W, H) * 0.19;
    cx = W * 0.5; cy = H * 0.86;          // 시작 구름은 달에서 멀리 → 첫 화면은 밝은 밤
    seeded = false;
    moonlight = 0.85; lanternPulse = 0;
  },

  tick(dt, ptr) {
    const cdt = Math.min(dt, 0.05);
    T += cdt;

    // 구름이 커서를 부드럽게 추종(lerp 0.09 @60fps, dt 보정)
    if (ptr && ptr.inside) {
      if (!seeded) { cx = ptr.x; cy = ptr.y; seeded = true; }
      const a = 1 - Math.pow(1 - 0.09, cdt * 60);
      cx += (ptr.x - cx) * a;
      cy += (ptr.y - cy) * a;
    }

    // 달 위상: 아주 느리게 차고 기욺 → 기본 달빛·색온
    const phase = 0.5 + 0.5 * Math.sin(T * MOON_W + MOON_PHASE0);
    const moonBase = 0.45 + 0.55 * phase;      // 0.45..1.0

    // 구름-달 겹침 → 가림량(0..1). 구름 중심이 달에 가까울수록 1
    const d = Math.hypot(cx - px(MOON.x), cy - py(MOON.y));
    const cover = smooth(1 - d / cloudR);

    // 실효 달빛: 목표값으로 부드럽게 수렴(걷히면 서서히 복귀)
    const target = moonBase * (1 - cover);
    const ka = 1 - Math.pow(1 - 0.06, cdt * 60);
    moonlight += (target - moonlight) * ka;
    const ml = clamp01(moonlight);
    const dark = 1 - ml;

    // 클릭 = 초롱불 한 번 크게 깜빡임
    if (ptr && ptr.justDown && ptr.inside) lanternPulse = 0.5;
    if (lanternPulse > 0) lanternPulse = Math.max(0, lanternPulse - cdt);

    render(ml, dark, phase);
  },

  resize(w, h) {
    W = w; H = h;
    A.width = W; A.height = H;
    computeFit(); buildBase(); sizeMoon(); bakeMoon();
    cloudR = Math.min(W, H) * 0.19;
    if (!seeded) { cx = W * 0.5; cy = H * 0.86; }
  },

  dispose() {
    ctx = null; actx = null; mctx = null;
    A = null; M = null; img = null;
  },
};

// ---- 프레임 합성 ----
function render(ml, dark, phase) {
  // (0) 밤 배경(원작/절차) — 이후 곱연산으로 밤 색조를 입힌다
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(A, 0, 0, W, H);

  // (1) 어두울수록 연인이 서로에게 기우는 미세 크롭 조각(곱연산 전에 깔아 함께 어두워짐)
  if (dark > 0.05) {
    const breath = 0.7 + 0.3 * Math.sin(T * 1.3);
    leanCrop(WOMAN, +1, dark, breath);       // 여인 → 오른쪽(남자 쪽)
    leanCrop(MAN, -1, dark, breath);         // 남자 → 왼쪽(여인 쪽)
  }

  // (2) 밤 색조: 달빛에 따라 밝기·색온이 변하는 곱연산 오버레이
  //     달빛 강함 → 서늘한 청회색, 약함 → 깊은 남색
  const warm = phase;
  const mr = lerp(26, 104 + 34 * warm, ml);
  const mg = lerp(30, 122 + 24 * warm, ml);
  const mb = lerp(50, 172 - 10 * warm, ml);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgb(${mr | 0},${mg | 0},${mb | 0})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";

  // (3) 달빛 광원: 하늘 글로우 + 눈썹달 원반(가시 달빛 = moonBase·(1-가림))
  const mx = px(MOON.x), my = py(MOON.y);
  const moonVis = ml;                        // 실효 달빛과 동조
  glow(mx, my, moonR * 8.5, 150, 165, 200, 0.16 * moonVis);   // 달무리(원작의 번진 훈)
  glow(mx, my, moonR * 3.4, 200, 210, 235, 0.28 * moonVis);
  ctx.globalAlpha = clamp01(0.35 + 0.65 * moonVis);
  ctx.drawImage(M, mx - M.width / 2, my - M.height / 2);
  ctx.globalAlpha = 1;

  // (4) 초롱불: 따뜻한 국소 글로우 + 플리커(클릭 시 파동). 어둠 속에서도 남는다.
  const lx = px(LANTERN.x), ly = py(LANTERN.y);
  const fl = reduced ? 0.04 : 0.12;
  const flick = 1 + fl * (Math.sin(T * 12) * 0.6 + Math.sin(T * 25.7) * 0.4);
  let pulse = 1;
  if (lanternPulse > 0) {
    const peak = reduced ? 1.5 : 2.4;
    pulse = 1 + (peak - 1) * Math.sin((1 - lanternPulse / 0.5) * Math.PI);
  }
  const lampR = Math.min(W, H) * 0.14 * flick * pulse;
  const lampI = (0.5 + 0.5 * dark) * flick * pulse;            // 어두울수록 상대적으로 도드라짐
  glow(lx, ly, lampR, 255, 176, 92, 0.5 * lampI);
  glow(lx, ly, lampR * 0.42, 255, 214, 150, 0.55 * lampI);     // 밝은 심지

  // (5) 구름(커서) — 달을 가리며 어둠을 부른다
  drawCloud();

  // (6) 밤 비네트
  ctx.globalCompositeOperation = "source-over";
  const vg = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.42,
    W / 2, H / 2, Math.max(W, H) * 0.78,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,6,${0.4 + 0.32 * dark})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}
