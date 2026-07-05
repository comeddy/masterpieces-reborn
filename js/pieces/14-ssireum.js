// js/pieces/14-ssireum.js
// After Kim Hong-do — Ssireum, 씨름 (단원풍속도첩, c.1780, 국립중앙박물관 · 공개)
// 원작을 한지 톤 여백 위에 contain-fit으로 깔고, 원작에서 크롭한 인물 조각들을
// 개별 위상으로 미세하게 들썩·기울여 "살아있는 군중"을 만든다.
//  · 클릭 = 씨름꾼 쌍이 들배지기로 들렸다 내려오고(0.8초), 클릭 지점에서
//    방사형 환호 파동이 퍼져 도달한 구경꾼의 들썩임이 일시 증폭된다.
//  · 드래그 = 파도응원: 커서가 지나간 구경꾼들이 순차로 크게 들썩인다.
//  · 엿장수만은 어떤 파동에도 반응하지 않는다(무심함 — 제 리듬만).
//
// 규약: dt·pointer만 사용. addEventListener/rAF/타이머/시계 API 없음.
// document는 오프스크린 캔버스 생성에만 사용. 좌표는 CSS px.

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let img = null;                       // 원작 (없으면 null → 절차적 폴백)
let A = null, actx = null;            // 오프스크린: 한지 여백 + 원작(또는 절차적 씨름판)
let fit = { x: 0, y: 0, w: 0, h: 0 }; // 원작 contain-fit 사각형

const MARGIN = 0.06;                  // 화면 대비 여백
const IMG_W = 960, IMG_H = 1142;      // 채택 원작 픽셀 치수(폴백 종횡비·좌표 매핑 기준)
const PAPER = "#e7dcc0";              // 한지 여백 톤
const INK = "rgba(38,32,26,";         // 폴백 먹선 색(알파 접미)

// ---- 인물 영역 (정규화 u,v = 원작 픽셀/치수) — 원작 비교로 좌표 확정 ----
// kind: "wrestler" 씨름꾼 쌍 / "vendor" 엿장수(파동 무시) / "crowd" 구경꾼
// hu,hv: 반폭·반높이(정규화). 크롭·들썩임 타원의 반경.
const REGIONS = [
  // 중앙 — 씨름꾼 쌍(들배지기 직전)
  { u: 0.558, v: 0.505, hu: 0.150, hv: 0.178, kind: "wrestler" },
  // 엿장수 — 좌중앙, 엿판을 메고 바깥을 향함
  { u: 0.190, v: 0.545, hu: 0.090, hv: 0.150, kind: "vendor" },
  // 상단 좌측 무리
  { u: 0.078, v: 0.100, hu: 0.062, hv: 0.078, kind: "crowd" },
  { u: 0.060, v: 0.235, hu: 0.058, hv: 0.075, kind: "crowd" },
  { u: 0.150, v: 0.090, hu: 0.060, hv: 0.082, kind: "crowd" },
  { u: 0.150, v: 0.205, hu: 0.062, hv: 0.082, kind: "crowd" },
  { u: 0.258, v: 0.130, hu: 0.062, hv: 0.090, kind: "crowd" },
  { u: 0.350, v: 0.100, hu: 0.058, hv: 0.078, kind: "crowd" },
  { u: 0.435, v: 0.070, hu: 0.052, hv: 0.066, kind: "crowd" },
  { u: 0.478, v: 0.120, hu: 0.056, hv: 0.072, kind: "crowd" },
  // 상단 우측 무리
  { u: 0.602, v: 0.098, hu: 0.052, hv: 0.072, kind: "crowd" },
  { u: 0.688, v: 0.062, hu: 0.052, hv: 0.066, kind: "crowd" },
  { u: 0.752, v: 0.108, hu: 0.052, hv: 0.070, kind: "crowd" },
  { u: 0.818, v: 0.078, hu: 0.052, hv: 0.066, kind: "crowd" },
  { u: 0.878, v: 0.150, hu: 0.066, hv: 0.086, kind: "crowd" },
  // 하단 좌측 무리
  { u: 0.068, v: 0.775, hu: 0.062, hv: 0.082, kind: "crowd" },
  { u: 0.155, v: 0.855, hu: 0.066, hv: 0.086, kind: "crowd" },
  { u: 0.205, v: 0.905, hu: 0.060, hv: 0.078, kind: "crowd" },
  { u: 0.360, v: 0.940, hu: 0.060, hv: 0.062, kind: "crowd" },
  { u: 0.472, v: 0.958, hu: 0.056, hv: 0.052, kind: "crowd" },
  // 하단 우측 — 뒤로 젖혀 앉은 두 사람
  { u: 0.862, v: 0.802, hu: 0.092, hv: 0.100, kind: "crowd" },
  { u: 0.762, v: 0.872, hu: 0.078, hv: 0.090, kind: "crowd" },
];

let figs = [];                        // 인물 상태 배열(타일·화면좌표·위상·흥분도)
let waves = [];                       // 방사형 환호 파동 {x,y,el,speed,maxR,strength}
let pressMoved = false;               // 이번 누름이 드래그로 바뀌었는지
let tech = -1;                        // 씨름꾼 기술 진행 시간(초). <0 = 비활성
const TECH_DUR = 0.8;                 // 들배지기 지속(초)

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}

// 원작 종횡비를 화면에 contain-fit
function computeFit() {
  let iw = img ? (img.naturalWidth || img.width) : 0;
  let ih = img ? (img.naturalHeight || img.height) : 0;
  if (iw <= 0 || ih <= 0) { iw = IMG_W; ih = IMG_H; }
  const bw = W * (1 - MARGIN * 2), bh = H * (1 - MARGIN * 2);
  const s = Math.min(bw / iw, bh / ih);
  const w = iw * s, h = ih * s;
  fit = { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// 배경 베이크: 한지 여백 → 원작(또는 절차적 씨름판)
function buildBase() {
  actx.setTransform(1, 0, 0, 1, 0, 0);
  actx.clearRect(0, 0, W, H);
  actx.fillStyle = PAPER;
  actx.fillRect(0, 0, W, H);
  if (img) actx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
  else proceduralScene();
}

// 절차적 폴백 — 모래판(연한 타원 링) + 흩어둔 갓·신발. 인물은 타일로 그려진다.
function proceduralScene() {
  const { x, y, w, h } = fit;
  // 씨름판 바닥(중앙의 옅은 타원)
  const g = actx.createRadialGradient(
    x + w * 0.52, y + h * 0.55, 0,
    x + w * 0.52, y + h * 0.55, w * 0.5,
  );
  g.addColorStop(0, "#efe6cc");
  g.addColorStop(1, PAPER);
  actx.fillStyle = g;
  actx.fillRect(x, y, w, h);
  // 흩어둔 갓 두 개(좌측)와 신발(우측) — 소품
  actx.fillStyle = INK + "0.75)";
  ellipsePath(x + w * 0.12, y + h * 0.40, w * 0.05, h * 0.018); actx.fill();
  ellipsePath(x + w * 0.10, y + h * 0.44, w * 0.045, h * 0.016); actx.fill();
  actx.fillStyle = INK + "0.6)";
  actx.fillRect(x + w * 0.86, y + h * 0.63, w * 0.06, h * 0.012);
  actx.fillRect(x + w * 0.87, y + h * 0.66, w * 0.055, h * 0.012);
}

function ellipsePath(cx, cy, rx, ry) {
  actx.beginPath();
  actx.ellipse(cx, cy, rx, ry, 0, 0, 6.283);
}

// 절차적 인물 실루엣(폴백 전용) — 한복 차림 근사를 타일에 그린다.
function drawProcFigure(c, tw, th, kind) {
  c.clearRect(0, 0, tw, th);
  c.lineJoin = "round";
  const body = "rgba(226,220,203,0.96)";   // 흰 도포 톤
  const line = INK + "0.85)";
  const draw = (cx, headR, bw, bh, topY) => {
    // 몸통(사다리꼴 도포)
    c.fillStyle = body; c.strokeStyle = line; c.lineWidth = Math.max(1.4, tw * 0.03);
    c.beginPath();
    c.moveTo(cx - bw * 0.5, topY + bh);
    c.lineTo(cx - bw * 0.34, topY + headR * 1.5);
    c.quadraticCurveTo(cx, topY + headR, cx + bw * 0.34, topY + headR * 1.5);
    c.lineTo(cx + bw * 0.5, topY + bh);
    c.closePath(); c.fill(); c.stroke();
    // 머리
    c.fillStyle = "rgba(232,224,206,1)";
    c.beginPath(); c.arc(cx, topY + headR * 0.6, headR, 0, 6.283); c.fill(); c.stroke();
    // 상투
    c.fillStyle = INK + "0.8)";
    c.beginPath(); c.arc(cx, topY - headR * 0.05, headR * 0.28, 0, 6.283); c.fill();
  };
  if (kind === "wrestler") {
    // 맞붙은 두 몸통
    draw(tw * 0.40, th * 0.11, tw * 0.42, th * 0.82, th * 0.06);
    draw(tw * 0.62, th * 0.10, tw * 0.40, th * 0.80, th * 0.10);
  } else if (kind === "vendor") {
    draw(tw * 0.5, th * 0.13, tw * 0.5, th * 0.86, th * 0.04);
    // 엿판(가슴 앞 널판)
    c.fillStyle = INK + "0.5)";
    c.fillRect(tw * 0.1, th * 0.42, tw * 0.8, th * 0.14);
    c.strokeStyle = line; c.lineWidth = Math.max(1, tw * 0.02);
    c.strokeRect(tw * 0.1, th * 0.42, tw * 0.8, th * 0.14);
  } else {
    draw(tw * 0.5, th * 0.2, tw * 0.62, th * 0.9, th * 0.06);
  }
}

// 타일에 부드러운 타원 알파 마스크를 적용(가장자리 페더 → 들썩일 때 이음새 은폐)
function featherTile(c, tw, th) {
  c.save();
  c.globalCompositeOperation = "destination-in";
  c.translate(tw / 2, th / 2);
  c.scale(tw / 2, th / 2);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.68, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, 1, 0, 6.283); c.fill();
  c.restore();
}

// 인물 조각 타일 생성(원작 크롭 또는 절차적) — 픽셀은 한 번만 굽는다.
function buildFigures() {
  const iw = img ? (img.naturalWidth || img.width) : IMG_W;
  const ih = img ? (img.naturalHeight || img.height) : IMG_H;
  figs = REGIONS.map((r, i) => {
    const sw = 2 * r.hu * iw, sh = 2 * r.hv * ih;
    const tw = Math.max(4, Math.round(sw)), th = Math.max(4, Math.round(sh));
    const c = makeCanvas(tw, th);
    const cx = c.getContext("2d");
    if (img) {
      // 원작에서 해당 영역을 크롭(경계를 살짝 넘어도 clamp되어 안전)
      cx.drawImage(img, r.u * iw - sw / 2, r.v * ih - sh / 2, sw, sh, 0, 0, tw, th);
    } else {
      drawProcFigure(cx, tw, th, r.kind);
    }
    featherTile(cx, tw, th);
    // 개별 위상 — 서로 다른 리듬으로 웅성거리게(엿장수는 느긋한 제 리듬)
    const slow = r.kind === "vendor";
    return {
      r, tile: c,
      cx: 0, cy: 0, hw: 0, hh: 0,           // 화면 기하(resize 시 갱신)
      ph: (i * 1.7) % 6.283,                 // 위상
      fbob: slow ? 0.7 : 1.5 + (i % 5) * 0.25,   // 상하 들썩 주파수
      frot: slow ? 0.5 : 1.1 + (i % 4) * 0.2,    // 기울임 주파수
      amp: slow ? 1.4 : 1.6 + (i % 4) * 0.45,    // 기본 진폭(px)
      exc: 0,                                 // 흥분도(파동 도달 시 상승)
    };
  });
  computeScreen();
}

// 화면 기하 갱신(fit 변경 시): 정규화 → CSS px
function computeScreen() {
  for (const f of figs) {
    f.cx = fit.x + f.r.u * fit.w;
    f.cy = fit.y + f.r.v * fit.h;
    f.hw = f.r.hu * fit.w;
    f.hh = f.r.hv * fit.h;
  }
}

// 환호 파동을 도달한 인물에게 전파(방사형·시간차). 엿장수는 무시.
function propagate(cdt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const wv = waves[i];
    const prevR = wv.speed * wv.el;
    wv.el += cdt;
    const r = wv.speed * wv.el;
    for (const f of figs) {
      if (f.r.kind === "vendor") continue;         // 엿장수 — 무심함
      const d = Math.hypot(f.cx - wv.x, f.cy - wv.y);
      if (d > prevR && d <= r) {                    // 파면이 막 도달
        const gain = wv.strength * (1 - Math.min(1, d / wv.maxR));
        f.exc = Math.min(2.2, f.exc + 0.9 + gain);
      }
    }
    if (r > wv.maxR) waves.splice(i, 1);
  }
}

// 드래그 = 파도응원: 커서 근방 인물을 순차로 크게 들썩이게
function surf(px, py) {
  const R = Math.min(W, H) * 0.16;
  for (const f of figs) {
    if (f.r.kind === "vendor") continue;
    const d = Math.hypot(f.cx - px, f.cy - py);
    if (d < R) f.exc = Math.max(f.exc, (1 - d / R) * 1.8);
  }
}

// 한 인물 타일을 들썩임·기울임·흥분·기술 변형과 함께 그린다.
function drawFig(f) {
  const half = reduced ? 0.5 : 1;                   // reducedMotion: 진폭 절반
  const excBob = 1 + f.exc * 3.2;                   // 흥분 시 들썩 진폭 증폭
  const bob = f.amp * half * (0.55 * Math.sin(T * f.fbob + f.ph)) * excBob;
  const sway = f.amp * half * 0.4 * Math.sin(T * f.fbob * 0.6 + f.ph * 1.7) * excBob;
  const lift = f.exc * 7.5 * half;                  // 환호 시 솟구침
  let rot = (reduced ? 0.011 : 0.022) * Math.sin(T * f.frot + f.ph) * (1 + f.exc * 1.5);
  const pop = f.r.kind === "crowd" ? f.exc * 0.03 : 0;  // 환호 시 살짝 커짐
  let sx = 1.05 + pop, sy = 1.05 + pop, ox = sway, oy = bob - lift;

  if (f.r.kind === "wrestler" && tech >= 0) {
    // 들배지기: 0.8초에 걸쳐 들렸다 기울고 내려온다(사인 아치 이징)
    const p = Math.min(1, tech / TECH_DUR);
    const arc = Math.sin(p * Math.PI);              // 0→1→0
    const tm = reduced ? 0.45 : 1;                  // reducedMotion: 기술 모션 완화
    oy -= arc * f.hh * 0.42 * tm;                   // 들어올림
    rot += arc * (reduced ? 0.08 : 0.17) * tm;      // 기울임
    sx += arc * 0.05 * tm; sy += arc * 0.05 * tm;   // 살짝 팽창
  }

  ctx.save();
  ctx.translate(f.cx + ox, f.cy + oy);
  ctx.rotate(rot);
  ctx.drawImage(f.tile, -f.hw * sx, -f.hh * sy, f.hw * 2 * sx, f.hh * 2 * sy);
  ctx.restore();
}

// 환호 파동의 파문 링(방사형 전파를 시각적으로 보조) — 밝은 한지에서도 읽히도록
// source-over에 따뜻한 호박빛 파면 + 안쪽 밝은 하이라이트 링을 겹친다.
function drawRipples() {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const wv of waves) {
    const r = wv.speed * wv.el;
    const a = wv.strength * (1 - Math.min(1, r / wv.maxR));
    if (a <= 0.01) continue;
    ctx.strokeStyle = `rgba(150,92,44,${a * 0.42})`;    // 파면(짙은 호박빛 — 한지에서 읽히도록)
    ctx.lineWidth = Math.max(3, Math.min(W, H) * 0.016);
    ctx.beginPath(); ctx.arc(wv.x, wv.y, r, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = `rgba(244,220,168,${a * 0.4})`;   // 안쪽 하이라이트
    ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.009);
    ctx.beginPath(); ctx.arc(wv.x, wv.y, r * 0.82, 0, 6.283); ctx.stroke();
  }
  ctx.restore();
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0;
    img = opts.assets && opts.assets.target ? opts.assets.target : null;
    A = makeCanvas(W, H); actx = A.getContext("2d");
    computeFit(); buildBase(); buildFigures();
    waves = []; pressMoved = false; tech = -1;
  },

  tick(dt, ptr) {
    const cdt = Math.min(dt, 0.05);
    T += cdt;

    // 입력: 탭=기술+환호 파동 / 드래그=파도응원
    if (ptr && ptr.inside) {
      if (ptr.justDown) pressMoved = false;
      const speed = Math.hypot(ptr.dx, ptr.dy);
      if (ptr.down && speed > 1.8) { pressMoved = true; surf(ptr.x, ptr.y); }
      if (ptr.justUp && !pressMoved) {
        tech = 0;                                   // 씨름꾼 들배지기 시작
        waves.push({ x: ptr.x, y: ptr.y, el: 0,
                     speed: Math.hypot(W, H) * 0.42, maxR: Math.hypot(W, H) * 0.95,
                     strength: reduced ? 0.6 : 1 });
        if (waves.length > 6) waves.shift();
      }
    }

    // 기술 진행 / 파동 전파 / 흥분 감쇠
    if (tech >= 0) { tech += cdt; if (tech > TECH_DUR) tech = -1; }
    propagate(cdt);
    const decay = Math.exp(-cdt / 0.55);
    for (const f of figs) if (f.exc > 0) { f.exc *= decay; if (f.exc < 0.002) f.exc = 0; }

    // 렌더: 배경(한지+원작) → 구경꾼 → 씨름꾼(맨 위) → 파문
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(A, 0, 0, W, H);
    for (const f of figs) if (f.r.kind !== "wrestler") drawFig(f);
    for (const f of figs) if (f.r.kind === "wrestler") drawFig(f);
    drawRipples();
  },

  resize(w, h) {
    W = w; H = h;
    A.width = W; A.height = H;
    computeFit(); buildBase(); computeScreen();
    waves = [];
  },

  dispose() {
    ctx = null; actx = null; A = null; img = null;
    figs = []; waves = [];
  },
};
