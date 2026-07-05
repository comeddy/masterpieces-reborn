// js/pieces/14-ssireum.js
// After Kim Hong-do — Ssireum, 씨름 (단원풍속도첩, c.1780, 국립중앙박물관 · 공개)
// 원작을 한지 톤 여백 위에 contain-fit으로 깔고, 원작에서 크롭한 인물 조각들을
// 개별 위상으로 미세하게 들썩·기울여 "살아있는 군중"을 만든다.
// 중앙 씨름꾼 쌍은 종이 인형극처럼 처리한다:
//  · 원작 실루엣을 근사한 다각형으로 "오려낸" 종이 인형(가위 단면 흰 테두리 + 나무 막대 2개).
//  · 배경에서 살짝 떠 있도록 부드러운 드롭 섀도 — 들리거나 흔들리면 그림자도 함께 변한다.
//  · 유휴에도 두 막대 위에서 서로 밀고 당기듯 조금씩 계속 흔들린다(힘겨루기 리듬).
//  · 클릭 = 들배지기 2단 모션(웅크림→들어올림→안착 바운스), 그림자가 커지고 흐려진다.
//    동시에 클릭 지점에서 방사형 환호 파동이 퍼져 도달한 구경꾼의 들썩임이 일시 증폭.
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

// ---- 씨름꾼 종이 인형(중앙) — 원작 실루엣을 근사한 다각형 오리기 ----
// 두 씨름꾼은 서로 맞잡고 한쪽이 다른 쪽을 들어올리는(들배지기) 자세라
// 팔·다리가 얽혀 있다 → 사각 크롭이 아닌 "한 덩어리 오리기"로 실루엣을 딴다.
// (두 장 겹침은 얽힌 그립을 갈라 이중상이 생기므로 배제.) 좌표는 원작 정규화 u,v.
const PUPPET_POLY = [
  [0.4240,0.3974],[0.4310,0.3646],[0.4590,0.3482],[0.5010,0.3687],[0.5255,0.3441],
  [0.5640,0.3441],[0.5955,0.3564],[0.6235,0.3851],[0.6305,0.4343],[0.6760,0.4630],
  [0.6865,0.4958],[0.6690,0.5368],[0.6620,0.5778],[0.6550,0.6393],[0.6760,0.6762],
  [0.6340,0.7008],[0.5920,0.7049],[0.5500,0.6967],[0.5080,0.7008],[0.4660,0.6926],
  [0.4275,0.6885],[0.4380,0.6270],[0.4345,0.5368],[0.4170,0.4794],[0.4170,0.4343],
  [0.4205,0.4097],
];
// 인형이 매달린 지면 기준점(막대 밑동·회전 피벗) — 발밑 중앙 살짝 아래
const PUPPET_PIVOT = [0.545, 0.712];
// 막대 두 개가 붙는 발밑 지점(정규화)
const STICK_ANCHORS = [[0.478, 0.688], [0.612, 0.700]];

// ---- 구경꾼·엿장수 영역 (정규화 u,v = 원작 픽셀/치수) ----
// kind: "vendor" 엿장수(파동 무시) / "crowd" 구경꾼
// hu,hv: 반폭·반높이(정규화). 크롭·들썩임 타원의 반경.
const REGIONS = [
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

let figs = [];                        // 구경꾼 상태 배열(타일·화면좌표·위상·흥분도)
let puppet = null;                    // 씨름꾼 종이 인형(타일·그림자·화면기하·위상)
let waves = [];                       // 방사형 환호 파동 {x,y,el,speed,maxR,strength}
let pressMoved = false;               // 이번 누름이 드래그로 바뀌었는지
let tech = -1;                        // 씨름꾼 기술 진행 시간(초). <0 = 비활성
const TECH_DUR = 1.2;                 // 들배지기 지속(초) — 웅크림→들기→안착
const PUP_PAD = 26;                   // 인형 타일 여백(가위 단면·그림자 여유, 소스 px)

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}

// ---- 다각형 유틸 ----
function polyBBox(p) {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const q of p) { if (q[0] < a) a = q[0]; if (q[1] < b) b = q[1]; if (q[0] > c) c = q[0]; if (q[1] > d) d = q[1]; }
  return { u0: a, v0: b, u1: c, v1: d };
}
function polyCentroid(p) { let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length]; }
// 결정적 지터(가위 단면의 미세하게 삐뚤한 절단선용) — 인덱스 기반 해시
function jitter(i) { const t = Math.sin(i * 127.1 + 11.7) * 43758.5453; return (t - Math.floor(t)) - 0.5; }

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

// 배경 베이크: 한지 여백 → 원작(또는 절차적 씨름판) → 인물 영역 소프트 패치
function buildBase() {
  actx.setTransform(1, 0, 0, 1, 0, 0);
  actx.clearRect(0, 0, W, H);
  actx.fillStyle = PAPER;
  actx.fillRect(0, 0, W, H);
  if (img) { actx.drawImage(img, fit.x, fit.y, fit.w, fit.h); softPatchFigures(); softPatchPuppet(); }
  else proceduralScene();
}

// 씨름꾼 인형이 차지한 자리의 원작 씨름꾼을 지운다(들배지기·흔들림으로 인형이 자리를
// 비워도 배경에 또렷한 원작 씨름꾼이 비치지 않도록). 실루엣 다각형을 살짝 부풀린
// 영역만 강하게 블러한 한지-평균색 패치로 덮는다. (베이크 1회 — 프레임 비용 0)
function softPatchPuppet() {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  // 원작 씨름꾼의 발자국 전체(오려낸 실루엣 밖으로 뻗은 다리·발까지)를 덮는 넉넉한 영역.
  // 씨름꾼은 열린 모래판 한가운데라 주변은 빈 한지 — 넓게 덮어도 다른 인물을 침범하지 않는다.
  const u0 = 0.395, v0 = 0.320, u1 = 0.778, v1 = 0.800;
  const sx = u0 * iw, sy = v0 * ih, sw = (u1 - u0) * iw, sh = (v1 - v0) * ih;
  const dw = Math.max(2, Math.round((u1 - u0) * fit.w));
  const dh = Math.max(2, Math.round((v1 - v0) * fit.h));
  // 1/12 축소 → 확대 + 강한 블러로 색만 남긴다
  const sm = makeCanvas(Math.max(1, Math.round(dw / 12)), Math.max(1, Math.round(dh / 12)));
  sm.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sm.width, sm.height);
  const patch = makeCanvas(dw, dh);
  const pc = patch.getContext("2d");
  pc.imageSmoothingEnabled = true;
  try { pc.filter = "blur(" + Math.max(5, Math.round(Math.min(dw, dh) * 0.11)) + "px)"; } catch (e) {}
  pc.drawImage(sm, 0, 0, sm.width, sm.height, 0, 0, dw, dh);
  try { pc.filter = "none"; } catch (e) {}
  // 타원 페이드 마스크(중심 불투명 → 가장자리 한지로 스밈) — 하드 엣지 없이 스며든다
  pc.globalCompositeOperation = "destination-in";
  pc.translate(dw / 2, dh / 2); pc.scale(dw / 2, dh / 2);
  const g = pc.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.86, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  pc.fillStyle = g; pc.beginPath(); pc.arc(0, 0, 1, 0, 6.283); pc.fill();
  actx.setTransform(1, 0, 0, 1, 0, 0);
  actx.drawImage(patch, Math.round(fit.x + u0 * fit.w), Math.round(fit.y + v0 * fit.h), dw, dh);
}

// 인물 영역 소프트 패치(원작 위에만): 각 타원 영역의 크롭을 강하게 블러/확대한
// 색-평균 패치로 덮어 원작 인물의 또렷한 윤곽을 감춘다. 타일이 제자리에 있으면
// 이 패치는 완전히 가려지고, 큰 동작(들배지기·환호)으로 타일이 비운 자리에서는
// 또렷한 이중상 대신 은은한 색 번짐만 노출된다. (베이크 시 1회만 — 프레임 비용 0)
function softPatchFigures() {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const padX = 1.10, padY = 1.24;                 // 들썩·들배지기로 드러나는 여유 밴드까지 덮도록 확장
  for (const r of REGIONS) {
    const cx = fit.x + r.u * fit.w, cy = fit.y + r.v * fit.h;
    const hw = r.hu * fit.w * padX, hh = r.hv * fit.h * padY;
    const dw = Math.max(2, Math.round(hw * 2)), dh = Math.max(2, Math.round(hh * 2));
    const sw = 2 * r.hu * iw * padX, sh = 2 * r.hv * ih * padY;   // 원작에서의 패치 소스 크기
    // 1-pass: 1/8로 축소해 색을 평균화
    const sm = makeCanvas(Math.max(1, Math.round(dw / 8)), Math.max(1, Math.round(dh / 8)));
    const smx = sm.getContext("2d");
    smx.drawImage(img, r.u * iw - sw / 2, r.v * ih - sh / 2, sw, sh, 0, 0, sm.width, sm.height);
    // 2-pass: 다시 확대(부드러운 색 번짐) — 여력이 되면 가우시안 블러까지(폴백 필수)
    const patch = makeCanvas(dw, dh);
    const pc = patch.getContext("2d");
    pc.imageSmoothingEnabled = true;
    try { pc.filter = "blur(" + Math.max(2, Math.round(Math.min(dw, dh) * 0.05)) + "px)"; } catch (e) {}
    pc.drawImage(sm, 0, 0, sm.width, sm.height, 0, 0, dw, dh);
    try { pc.filter = "none"; } catch (e) {}
    // 부드러운 타원 마스크(중심 불투명 → 가장자리 페이드): 가장자리는 진짜 원작을 남겨
    // 유휴 시 티가 나지 않게 한다.
    pc.globalCompositeOperation = "destination-in";
    pc.translate(dw / 2, dh / 2); pc.scale(dw / 2, dh / 2);
    const g = pc.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.74, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    pc.fillStyle = g;
    pc.beginPath(); pc.arc(0, 0, 1, 0, 6.283); pc.fill();
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.drawImage(patch, Math.round(cx - hw), Math.round(cy - hh));
  }
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

// 절차적 씨름꾼(폴백 전용) — 실루엣 클립 안을 흰 도포 톤으로 채우고 두 상투를 얹는다.
function drawProcWrestlers(c, x, y, w, h) {
  c.fillStyle = "rgba(228,221,203,0.98)"; c.fillRect(x, y, w, h);
  c.fillStyle = INK + "0.85)";
  c.beginPath(); c.arc(x + w * 0.30, y + h * 0.15, w * 0.085, 0, 6.283); c.fill();
  c.beginPath(); c.arc(x + w * 0.60, y + h * 0.13, w * 0.085, 0, 6.283); c.fill();
  c.strokeStyle = INK + "0.55)"; c.lineWidth = Math.max(1.5, w * 0.018); c.lineJoin = "round";
  c.beginPath(); c.moveTo(x + w * 0.46, y + h * 0.22);
  c.quadraticCurveTo(x + w * 0.52, y + h * 0.55, x + w * 0.44, y + h * 0.94); c.stroke();
}

// 씨름꾼 종이 인형 베이크(1회): 원작 실루엣 오리기 + 가위 단면(흰 종이 테두리) + 그림자 타일.
function buildPuppet() {
  const iw = img ? (img.naturalWidth || img.width) : IMG_W;
  const ih = img ? (img.naturalHeight || img.height) : IMG_H;
  const bb = polyBBox(PUPPET_POLY), cen = polyCentroid(PUPPET_POLY);
  const sw = (bb.u1 - bb.u0) * iw, sh = (bb.v1 - bb.v0) * ih;
  const bw = Math.max(4, Math.round(sw)), bh = Math.max(4, Math.round(sh));  // 본체(소스 px)
  const tw = bw + PUP_PAD * 2, th = bh + PUP_PAD * 2;
  const toLocal = (p) => [PUP_PAD + (p[0] - bb.u0) / (bb.u1 - bb.u0) * bw,
                          PUP_PAD + (p[1] - bb.v0) / (bb.v1 - bb.v0) * bh];
  const inner = PUPPET_POLY.map(toLocal);
  const lc = toLocal(cen);
  const rim = Math.max(3, Math.round(Math.min(bw, bh) * 0.03));   // 가위 단면 폭
  // 바깥 다각형(가위 단면) — 중심에서 바깥으로 밀고 미세 지터로 삐뚤하게
  const outer = inner.map((q, i) => {
    const dx = q[0] - lc[0], dy = q[1] - lc[1], d = Math.hypot(dx, dy) || 1;
    return [q[0] + dx / d * rim * (1 + jitter(i) * 0.55) + jitter(i * 3.3) * rim * 0.4,
            q[1] + dy / d * rim * (1 + jitter(i * 1.7) * 0.55) + jitter(i * 5.1) * rim * 0.4];
  });
  const trace = (c, pts) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]); c.closePath(); };

  const tile = makeCanvas(tw, th);
  const c = tile.getContext("2d");
  // 1) 흰 종이(가위 단면) + 절단선
  c.fillStyle = "#f4ecd6"; trace(c, outer); c.fill();
  c.lineJoin = "round"; c.strokeStyle = "rgba(120,104,74,0.5)"; c.lineWidth = Math.max(1, rim * 0.22); c.stroke();
  // 2) 그림(원작 크롭/절차)을 안쪽 실루엣에 클립
  c.save(); trace(c, inner); c.clip();
  if (img) c.drawImage(img, bb.u0 * iw, bb.v0 * ih, sw, sh, PUP_PAD, PUP_PAD, bw, bh);
  else drawProcWrestlers(c, PUP_PAD, PUP_PAD, bw, bh);
  c.restore();
  // 3) 안쪽 가장자리 접힘 그늘(입체감)
  c.strokeStyle = "rgba(58,46,30,0.26)"; c.lineWidth = Math.max(1, rim * 0.2); trace(c, inner); c.stroke();

  // 그림자 타일(바깥 실루엣을 검게 + 블러)
  const shadow = makeCanvas(tw, th);
  const sc = shadow.getContext("2d");
  try { sc.filter = "blur(" + Math.max(3, Math.round(rim * 1.3)) + "px)"; } catch (e) {}
  sc.fillStyle = "rgba(28,22,14,1)"; trace(sc, outer); sc.fill();
  try { sc.filter = "none"; } catch (e) {}

  puppet = { tile, shadow, bb, ph1: 0.4, ph2: 1.9,
             ox: 0, oy: 0, dw: 0, dh: 0, pivotX: 0, pivotY: 0, s: 1 };
  updatePuppetScreen();
}

// 인형 화면 기하 갱신(fit 변경 시)
function updatePuppetScreen() {
  if (!puppet) return;
  const iw = img ? (img.naturalWidth || img.width) : IMG_W;
  const s = fit.w / iw, bb = puppet.bb;
  puppet.s = s;
  puppet.dw = puppet.tile.width * s;
  puppet.dh = puppet.tile.height * s;
  puppet.ox = fit.x + bb.u0 * fit.w - PUP_PAD * s;
  puppet.oy = fit.y + bb.v0 * fit.h - PUP_PAD * s;
  puppet.pivotX = fit.x + PUPPET_PIVOT[0] * fit.w;
  puppet.pivotY = fit.y + PUPPET_PIVOT[1] * fit.h;
}

// 들배지기 들림 곡선: t∈[0,1] → 웅크림(-0.18)→들어올림(1)→안착 바운스(0)
function techLift(t) {
  if (t < 0.15) { const k = t / 0.15; return -0.18 * Math.sin(k * Math.PI * 0.5); }
  if (t < 0.58) { const k = (t - 0.15) / 0.43, e = 1 - Math.pow(1 - k, 3); return -0.18 * (1 - e) + e; }
  const k = (t - 0.58) / 0.42;
  return (1 - Math.pow(k, 1.4)) + Math.sin(k * Math.PI * 2.2) * 0.1 * (1 - k);
}

// 나무 막대 두 개 — 발밑 앵커에서 화면 아래로 뻗는다(인형 뒤에 붙어 함께 기운다).
function drawSticks() {
  const p = puppet, w0 = Math.max(2.5, Math.min(W, H) * 0.011);
  const bottomY = (H - p.pivotY) + 160;
  for (const a of STICK_ANCHORS) {
    const ax = (fit.x + a[0] * fit.w) - p.pivotX;
    const ay = (fit.y + a[1] * fit.h) - p.pivotY;
    const g = ctx.createLinearGradient(ax - w0, 0, ax + w0, 0);
    g.addColorStop(0, "#5c3d22"); g.addColorStop(0.45, "#8a6238"); g.addColorStop(1, "#4f341e");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ax - w0 * 0.5, ay); ctx.lineTo(ax + w0 * 0.5, ay);
    ctx.lineTo(ax + w0 * 0.42, bottomY); ctx.lineTo(ax - w0 * 0.42, bottomY);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(224,192,142,0.5)"; ctx.lineWidth = Math.max(1, w0 * 0.16);
    ctx.beginPath(); ctx.moveTo(ax - w0 * 0.12, ay); ctx.lineTo(ax - w0 * 0.1, bottomY); ctx.stroke();
  }
}

// 씨름꾼 종이 인형: 유휴 미세 흔들림(힘겨루기) + 들배지기 2단 모션 + 드롭 섀도.
function drawPuppet() {
  if (!puppet) return;
  const p = puppet, half = reduced ? 0.45 : 1;
  // 유휴: 두 리듬을 겹친 회전·상하(막대 위에서 서로 밀고 당기는 느낌)
  let rock = (0.020 * Math.sin(T * 0.9 + p.ph1) + 0.012 * Math.sin(T * 1.7 + p.ph2)) * half;
  let bob = (2.0 * Math.sin(T * 1.3 + p.ph2) + 1.1 * Math.sin(T * 2.3)) * half;
  let up = 0;
  if (tech >= 0) {
    const tm = reduced ? 0.5 : 1;
    up = techLift(Math.min(1, tech / TECH_DUR)) * tm;
    rock += up * 0.15;                          // 들면서 기울임
  }
  const lift = up * p.dh * 0.34 - bob;          // 화면 px(위=음수 처리 아래에서)
  const L = Math.max(0, up);                    // 그림자 확대·흐림 기준

  // ---- 드롭 섀도(배경 위) — 유휴엔 살짝 떠 있고, 들릴수록 커지고 옅게 퍼진다 ----
  const shScale = 1.03 + L * 0.14;              // 확대(업스케일 → 흐려짐)
  const shAlpha = (reduced ? 0.16 : 0.26) * (1 - L * 0.32);
  const shDX = rock * 80 + 9, shDY = 12 + L * 32;
  ctx.save();
  ctx.globalAlpha = Math.max(0, shAlpha);
  ctx.translate(p.pivotX, p.pivotY);
  ctx.rotate(rock * 0.6);
  ctx.translate(shDX, shDY);
  ctx.scale(shScale, shScale);
  ctx.drawImage(p.shadow, p.ox - p.pivotX, p.oy - p.pivotY, p.dw, p.dh);
  ctx.restore();

  // ---- 인형 본체(막대 위) ----
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.translate(p.pivotX, p.pivotY - lift);
  ctx.rotate(rock);
  drawSticks();
  ctx.drawImage(p.tile, p.ox - p.pivotX, p.oy - p.pivotY, p.dw, p.dh);
  ctx.restore();
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

// 한 구경꾼 타일을 들썩임·기울임·흥분 변형과 함께 그린다.
function drawFig(f) {
  const half = reduced ? 0.5 : 1;                   // reducedMotion: 진폭 절반
  const excBob = 1 + f.exc * 3.2;                   // 흥분 시 들썩 진폭 증폭
  const bob = f.amp * half * (0.55 * Math.sin(T * f.fbob + f.ph)) * excBob;
  const sway = f.amp * half * 0.4 * Math.sin(T * f.fbob * 0.6 + f.ph * 1.7) * excBob;
  const lift = f.exc * 7.5 * half;                  // 환호 시 솟구침
  const rot = (reduced ? 0.011 : 0.022) * Math.sin(T * f.frot + f.ph) * (1 + f.exc * 1.5);
  const pop = f.r.kind === "crowd" ? f.exc * 0.03 : 0;  // 환호 시 살짝 커짐
  const sx = 1.05 + pop, sy = 1.05 + pop, ox = sway, oy = bob - lift;

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
    computeFit(); buildBase(); buildFigures(); buildPuppet();
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

    // 렌더: 배경(한지+원작) → 구경꾼 → 씨름꾼 종이 인형(그림자+본체, 맨 위) → 파문
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(A, 0, 0, W, H);
    for (const f of figs) drawFig(f);
    drawPuppet();
    drawRipples();
  },

  resize(w, h) {
    W = w; H = h;
    A.width = W; A.height = H;
    computeFit(); buildBase(); computeScreen(); updatePuppetScreen();
    waves = [];
  },

  dispose() {
    ctx = null; actx = null; A = null; img = null;
    figs = []; waves = []; puppet = null;
  },
};
