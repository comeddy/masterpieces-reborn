// js/pieces/13-inwang-after-rain.js
// After Jeong Seon — Inwangjesaekdo, 인왕제색도 (1751, 국보) · 수묵 번짐
// 원작을 한지 톤 여백 위에 contain-fit으로 깔고, 산허리를 수평으로 흐르는
// 반투명 안개 층 2~3겹이 자욱↔걷힘을 반복한다. 화면을 누르면 저해상 격자에서
// 먹 농도 확산을 시뮬레이션해 업스케일·multiply 합성 — 화선지에 스미는 먹 번짐.
// 드래그하면 커서 주변 안개 밀도가 줄고(밀어내기) 손을 떼면 서서히 회복한다.
//
// 규약: dt·pointer만 사용. addEventListener/rAF/타이머/시계 API 없음.
// document는 오프스크린 캔버스 생성에만 사용. 좌표는 CSS px.

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let img = null;                       // 원작 (없으면 null → 절차적 폴백)
let A = null, actx = null;            // 오프스크린: 한지+원작 또는 절차적 산수
let fit = { x: 0, y: 0, w: 0, h: 0 }; // 원작 contain-fit 사각형
const MARGIN = 0.05;                  // 화면 대비 여백 비율

// ---- 먹 확산 격자 (캔버스 1/7 해상도 오프스크린) ----
const CELL = 7;                       // 셀 크기(px). 1/8~1/6 사이, 60fps·번짐 질감 균형
let gW = 0, gH = 0;                   // 격자 칸 수
let cur = null, nxt = null;           // 농도 필드(더블 버퍼, Float32)
let inkC = null, ictx = null, inkImg = null; // 격자 → 이미지 업스케일용
const INK_D = 0.12;                   // 확산 계수(인접 셀로 번짐) — 낮을수록 방울이 형태를 오래 유지
const INK_TAU = 9.5;                  // 증발 시상수(초) — 먹이 서서히 마르며 걷힘
const INK_MAX = 1.4;                  // 농도 상한(같은 자리 반복 클릭 폭주 방지)
const INK_RGB = [26, 24, 30];         // 먹빛(살짝 청먹) — multiply 합성용

// ---- 안개 층 ----
let bands = [];                       // {yc, half, baseA, drift, w, phase, dir, ox}
const FOG_WARM = [242, 239, 230];     // 한지보다 살짝 밝고 찬 안개색

// ---- 안개 밀어내기(드래그) ----
const spots = [];                     // {x,y,s} 밀도 감소 지점, s는 강도(0..1)
let SPOT_R = 150;                     // 감소 반경(px)
const RECOVER = 2.4;                  // 손 뗀 뒤 회복 시상수(초)
let travel = 0;                       // 드래그 이동 누적(스팟 간격 제어)
let pressMoved = false;               // 이번 누름이 드래그로 바뀌었는지(드래그면 먹 안 떨굼)

const PAPER = "#e9e0cb";              // 한지 여백 톤(따뜻한 아이보리)

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}

// 원작 종횡비를 화면에 contain-fit (없으면 인왕제색도 가로 비율 근사)
function computeFit() {
  let iw = img ? (img.naturalWidth || img.width) : 0;
  let ih = img ? (img.naturalHeight || img.height) : 0;
  if (iw <= 0 || ih <= 0) { iw = 1280; ih = 743; }
  const bw = W * (1 - MARGIN * 2), bh = H * (1 - MARGIN * 2);
  const s = Math.min(bw / iw, bh / ih);
  const w = iw * s, h = ih * s;
  fit = { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// 배경 베이크: 한지 여백 → 원작(또는 절차적 산수)
function buildBase() {
  actx.setTransform(1, 0, 0, 1, 0, 0);
  actx.clearRect(0, 0, W, H);
  actx.fillStyle = PAPER;
  actx.fillRect(0, 0, W, H);
  if (img) {
    actx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
  } else {
    proceduralScene();
  }
}

// 절차적 폴백 — 비 갠 인왕산 근사: 중앙 검은 화강암 봉우리 + 좌우 능선 + 전경 수목
function proceduralScene() {
  const { x, y, w, h } = fit;
  // 은은한 상단 하늘빛(비 갠 직후의 습기)
  const sky = actx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, "#dfd8c4");
  sky.addColorStop(1, PAPER);
  actx.fillStyle = sky;
  actx.fillRect(x, y, w, h);

  // 중앙 주봉(적묵법 근사): 어두운 돔 + 수직 텍스처
  const px = x + w * 0.42, ptop = y + h * 0.07, pw = w * 0.34, ph = h * 0.5;
  const dome = actx.createLinearGradient(0, ptop, 0, ptop + ph);
  dome.addColorStop(0, "#2b2a2f");
  dome.addColorStop(1, "#4a4750");
  actx.fillStyle = dome;
  actx.beginPath();
  actx.moveTo(px - pw, ptop + ph);
  actx.quadraticCurveTo(px - pw * 0.6, ptop, px, ptop);
  actx.quadraticCurveTo(px + pw * 0.7, ptop + ph * 0.02, px + pw, ptop + ph);
  actx.closePath();
  actx.fill();
  actx.strokeStyle = "rgba(20,18,24,0.5)";
  actx.lineWidth = Math.max(1, w * 0.0015);
  for (let i = 0; i < 26; i++) {
    const sx = px - pw * 0.85 + (i / 25) * pw * 1.7;
    actx.beginPath();
    actx.moveTo(sx, ptop + ph * 0.18);
    actx.lineTo(sx + (((i * 53) % 7) - 3), ptop + ph * (0.6 + ((i * 31) % 30) / 100));
    actx.stroke();
  }

  // 좌우 보조 능선(중묵)
  drawRidge(x + w * 0.02, y + h * 0.34, w * 0.3, h * 0.26, "#615c62");
  drawRidge(x + w * 0.62, y + h * 0.2, w * 0.38, h * 0.32, "#565159");

  // 전경 수목 무리(농묵 점묘)
  actx.fillStyle = "rgba(30,28,32,0.8)";
  for (let i = 0; i < 260; i++) {
    const tx = x + Math.random() * w;
    const ty = y + h * (0.74 + Math.random() * 0.24);
    const r = 1 + Math.random() * 2.4;
    actx.beginPath();
    actx.arc(tx, ty, r, 0, 6.283);
    actx.fill();
  }
}

function drawRidge(rx, ry, rw, rh, col) {
  actx.fillStyle = col;
  actx.beginPath();
  actx.moveTo(rx, ry + rh);
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    actx.quadraticCurveTo(
      rx + rw * (t - 1 / 12), ry + rh * (0.2 + 0.5 * Math.sin(t * 5 + rx)),
      rx + rw * t, ry + rh * (0.35 + 0.3 * Math.sin(t * 7 + rx * 0.7)),
    );
  }
  actx.lineTo(rx + rw, ry + rh);
  actx.closePath();
  actx.fill();
}

// ---- 먹 확산 격자 (재)할당 ----
function buildInk() {
  gW = Math.max(4, Math.ceil(W / CELL));
  gH = Math.max(4, Math.ceil(H / CELL));
  cur = new Float32Array(gW * gH);
  nxt = new Float32Array(gW * gH);
  inkC = makeCanvas(gW, gH);
  ictx = inkC.getContext("2d");
  inkImg = ictx.createImageData(gW, gH);
}

// 먹 방울 스탬프: 격자에 가우시안 농도 주입 (여러 방울은 같은 격자에서 자연히 합쳐짐)
function stampInk(sx, sy, peak, rCells) {
  const cx = sx / CELL, cy = sy / CELL;
  const r = Math.ceil(rCells * 2);
  const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(gW - 1, (cx + r) | 0);
  const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(gH - 1, (cy + r) | 0);
  const inv = 1 / (2 * rCells * rCells);
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const dx = gx - cx, dy = gy - cy;
      const g = peak * Math.exp(-(dx * dx + dy * dy) * inv);
      const i = gy * gW + gx;
      cur[i] = Math.min(INK_MAX, cur[i] + g);
    }
  }
}

// 확산 + 증발 (무플럭스 경계). D는 프레임레이트 보정.
function diffuseInk(cdt) {
  const D = Math.min(0.5, INK_D * Math.min(2, cdt * 60));
  const ev = Math.exp(-cdt / INK_TAU);
  for (let y = 0; y < gH; y++) {
    const row = y * gW;
    for (let x = 0; x < gW; x++) {
      const i = row + x;
      const c = cur[i];
      const l = x > 0 ? cur[i - 1] : c;
      const r = x < gW - 1 ? cur[i + 1] : c;
      const u = y > 0 ? cur[i - gW] : c;
      const d = y < gH - 1 ? cur[i + gW] : c;
      let v = (c + D * ((l + r + u + d) * 0.25 - c)) * ev;
      if (v < 1e-4) v = 0;
      nxt[i] = v;
    }
  }
  const t = cur; cur = nxt; nxt = t;
}

// 농도 격자 → 이미지 → 메인에 multiply 업스케일 (bilinear 스무딩 = 부드러운 번짐)
function drawInk() {
  const d = inkImg.data;
  const [ir, ig, ib] = INK_RGB;
  let any = false;
  for (let i = 0; i < cur.length; i++) {
    // 진한 먹도 순수 검정(구멍처럼) 대신 짙은 목탄빛이 되도록 상한을 살짝 눌러 둔다
    let a = cur[i] * 0.82;
    if (a > 0) { any = true; if (a > 0.9) a = 0.9; }
    const o = i * 4;
    d[o] = ir; d[o + 1] = ig; d[o + 2] = ib; d[o + 3] = (a * 255) | 0;
  }
  if (!any) return;
  ictx.putImageData(inkImg, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(inkC, 0, 0, gW, gH, 0, 0, W, H);
  ctx.restore();
}

// ---- 안개 층 배치 (원작 산허리 안개 띠에 맞춤) ----
function buildFog() {
  const F = fit;
  bands = [
    // 주 안개 띠 — 산허리(중앙)
    { yc: F.y + F.h * 0.60, half: F.h * 0.12, baseA: 0.36, drift: 13, w: (Math.PI * 2) / 15, phase: 0.0, dir: 1, ox: 0 },
    // 계곡 안개 — 전경 아래(좌하 웅덩이 포함)
    { yc: F.y + F.h * 0.73, half: F.h * 0.10, baseA: 0.30, drift: 8, w: (Math.PI * 2) / 21, phase: 2.1, dir: -1, ox: 0 },
    // 상단 옅은 띠 — 주봉 아랫자락
    { yc: F.y + F.h * 0.49, half: F.h * 0.075, baseA: 0.24, drift: 17, w: (Math.PI * 2) / 11, phase: 4.0, dir: 1, ox: 0 },
  ];
}

function clearanceMul(x, y) {
  let clear = 0;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < SPOT_R) {
      const k = s.s * (1 - d / SPOT_R);
      if (k > clear) clear = k;
    }
  }
  return 1 - clear * 0.85;
}

function drawFog(cdt) {
  const flow = reduced ? 0.5 : 1;      // reducedMotion: 안개 흐름 속도 절반
  const F = fit;
  const x0 = F.x - F.w * 0.15, x1 = F.x + F.w * 1.15, span = x1 - x0;
  const [fr, fg, fb] = FOG_WARM;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let bi = 0; bi < bands.length; bi++) {
    const b = bands[bi];
    b.ox += b.drift * b.dir * cdt * flow;
    const blobR = b.half * 2.2;
    const step = blobR * 0.55;
    const n = Math.ceil(span / step) + 2;
    const pulse = 0.55 + 0.45 * Math.sin(T * b.w * flow + b.phase);
    const baseA = b.baseA * Math.max(0, pulse);
    for (let k = 0; k < n; k++) {
      let bx = x0 + (((k * step + b.ox) % span) + span) % span;
      const by = b.yc + Math.sin(bx * 0.008 + T * 0.3 * flow + b.phase) * b.half * 0.35;
      const a = baseA * clearanceMul(bx, by);
      if (a <= 0.002) continue;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, blobR);
      g.addColorStop(0, `rgba(${fr},${fg},${fb},${a})`);
      g.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, blobR, 0, 6.283);
      ctx.fill();
    }
  }
  ctx.restore();
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    img = opts.assets && opts.assets.target ? opts.assets.target : null;
    A = makeCanvas(W, H); actx = A.getContext("2d");
    computeFit(); buildBase(); buildFog(); buildInk();
    SPOT_R = Math.min(W, H) * 0.16;
    spots.length = 0; travel = 0; pressMoved = false;
  },

  tick(dt, ptr) {
    const cdt = Math.min(dt, 0.05);
    T += cdt;

    // 입력 분리: 탭=먹 방울(놓을 때), 누른 채 정지=계속 스밈, 움직이며 누름=안개 밀어내기
    if (ptr && ptr.inside) {
      const speed = Math.hypot(ptr.dx, ptr.dy);
      if (ptr.justDown) pressMoved = false;
      if (ptr.down && speed > 1.6) {
        // 드래그 = 안개 밀어내기 (경로를 따라 감소 지점 배치). 드래그 중엔 먹을 떨구지 않음
        pressMoved = true;
        travel += speed;
        if (travel > 26) {
          travel = 0;
          spots.push({ x: ptr.x, y: ptr.y, s: 1 });
          if (spots.length > 32) spots.shift();
        }
      } else if (ptr.down && !pressMoved) {
        // 누른 채 정지 = 먹이 계속 스며 번짐이 커진다(오래 누를수록 짙게)
        stampInk(ptr.x, ptr.y, 2.6 * cdt, 2.2);
      }
      if (ptr.justUp && !pressMoved) stampInk(ptr.x, ptr.y, 1.25, 3.4); // 탭 = 먹 한 방울
    }

    // 밀어낸 안개는 서서히 회복
    for (let i = spots.length - 1; i >= 0; i--) {
      spots[i].s -= cdt / RECOVER;
      if (spots[i].s <= 0) spots.splice(i, 1);
    }

    // 먹 확산·증발
    diffuseInk(cdt);

    // 렌더: 배경 → 안개 → 먹 (변환·DPR은 main이 설정한 상태를 그대로 사용)
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(A, 0, 0, W, H);
    drawFog(cdt);
    drawInk();
  },

  resize(w, h) {
    W = w; H = h;
    A.width = W; A.height = H;
    computeFit(); buildBase(); buildFog(); buildInk();
    SPOT_R = Math.min(W, H) * 0.16;
    spots.length = 0; travel = 0;
  },

  dispose() {
    ctx = null; actx = null; A = null; img = null;
    cur = null; nxt = null; inkC = null; ictx = null; inkImg = null;
    bands = []; spots.length = 0;
  },
};
