// js/pieces/01-great-wave.js — After Hokusai, Great Wave (c.1831)
// 수천 개의 물 입자가 파도의 형상으로 응집해 화면을 가득 채운다(cover-fit).
// 유휴 상태에서도 바다 전체가 진행파로 일렁이고, 파도는 주기적으로 스스로
// 부서지며(포말 서지), 손길에 흩어졌다가, 다시 불멸의 형상으로 돌아온다.
import { ParticleField } from "../particle-engine.js";

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let field = null;
let cover = { x: 0, y: 0, w: 0, h: 0 };  // cover-fit 박스(화면 전체 채움, 넘침은 화면 밖)
let crashT = 0;              // 자가 붕괴 사이클 타이머
let crashFlash = 0;          // 부서진 직후 포말 발광 잔량 0..1
let foam = [];               // 포말(밝은 목표색) 입자 캐시
let crest = { x: 0, y: 0 };  // 파도 마루(포말 무게중심) — 서지 원점
const CYCLE = 14;            // 붕괴 주기(초)

// ---- 진행파(traveling wave): 왼→오로 흐르는 바다의 일렁임 ----
const WAVE_PERIOD = 5.5;     // 마루 하나가 지나가는 주기(초) — 느린 너울
const WAVE_AMP = 16;         // 물 영역 세로 진폭(px)
const WAVE_CYCLES_X = 1.7;   // 화면 가로 방향 파장 수
const WAVE_CYCLES_Y = 0.6;   // 세로로 어긋나는 위상 — 구르는 느낌
const FOAM_DRIFT = 9;        // 포말이 위상 따라 앞으로 쓸려가는 수평 진폭(px)
const TWO_PI = Math.PI * 2;
// cover-fit 크롭 중심(정규화 이미지 좌표): 왼쪽 대파도 갈고리와 중앙 후지산을 살림
const COVER_CU = 0.5, COVER_CV = 0.44;

// 이미지 없을 때: 파도 곡선 + 물보라 갈고리 + 후지산의 절차적 목표점
function fallbackPoints() {
  const pts = [];
  const push = (u, v, r, g, b) => pts.push({ u, v, r, g, b });
  // 큰 파도 몸통 — 왼쪽에서 치솟아 오른쪽으로 말리는 곡선 아래를 채움
  for (let i = 0; i < 4600; i++) {
    const u = Math.random() * 0.72;
    const crestV = 0.18 + 0.30 * Math.pow(u / 0.72, 1.6); // 마루 라인
    const v = crestV + Math.random() * (0.92 - crestV);
    const deep = (v - crestV) / (0.92 - crestV);
    push(u, v, 18 + deep * 20, 52 + deep * 30, 110 + deep * 40); // 프러시안 블루
  }
  // 물보라 갈고리 — 마루를 따라 흩뿌려진 포말
  for (let i = 0; i < 1600; i++) {
    const u = Math.random() * 0.78;
    const crestV = 0.18 + 0.30 * Math.pow(Math.min(1, u / 0.72), 1.6);
    const v = crestV - Math.random() * 0.10;
    push(u, v, 225 + Math.random() * 30, 235 + Math.random() * 20, 245);
  }
  // 후지산 — 오른쪽 원경의 고요한 삼각형
  for (let i = 0; i < 900; i++) {
    const u = 0.62 + Math.random() * 0.26;
    const peak = Math.abs(u - 0.75) / 0.13;               // 0(정상)..1(기슭)
    const v = 0.42 + peak * 0.5 * 0.28 + Math.random() * 0.28 * (1 - peak * 0.4);
    const snow = v < 0.50;
    push(u, Math.min(0.9, v), snow ? 235 : 42, snow ? 240 : 58, snow ? 246 : 96);
  }
  return pts;
}

// 원작 JPEG은 저채도(평균 채도 ~36)로 디코드돼 회색 점밭이 되기 쉽다. 그래서
// 휘도+위치로 물/포말/하늘/후지를 판별해 상징적 팔레트(짙은 남색 바다·흰 포말·
// 옅은 하늘)로 다시 칠하고, 그 판별로 진행파 진폭(waveAmp)과 포말 여부를 정한다.
// 결과: p.cr/cg/cb(표시색), p.isFoam, p.waveAmp(0..1) 를 채운다.
function paint(p) {
  const L = p.r * 0.3 + p.g * 0.59 + p.b * 0.11;      // 휘도 0..255
  const fuji = p.u > 0.46 && p.u < 0.67 && p.v > 0.47 && p.v < 0.73; // 원경 후지 삼각형
  const skyRight = p.v < 0.40 && p.u > 0.50 && L > 158;             // 우상단 하늘
  if (skyRight) {                       // 하늘 — 옅고 잔잔
    p.cr = 196; p.cg = 210; p.cb = 228; p.isFoam = false; p.waveAmp = 0.08; return;
  }
  if (fuji) {                           // 후지산 — 눈/산체, 정지에 가깝게
    const snow = p.v < 0.56;
    p.cr = snow ? 226 : 92; p.cg = snow ? 232 : 108; p.cb = snow ? 242 : 140;
    p.isFoam = false; p.waveAmp = 0.06; return;
  }
  if (L > 172) {                        // 파도 마루·물보라 — 흰 포말(크게 일렁임)
    p.cr = 244; p.cg = 249; p.cb = 255; p.isFoam = true; p.waveAmp = 1; return;
  }
  // 바다 — 휘도로 수심 표현(깊을수록 짙은 남색), 크게 일렁임
  const t = Math.max(0, Math.min(1, (L - 108) / 66));
  p.cr = (26 + t * 84) | 0;    // 26..110
  p.cg = (72 + t * 104) | 0;   // 72..176
  p.cb = (140 + t * 100) | 0;  // 140..240 (선명한 남색→하늘색)
  p.isFoam = false; p.waveAmp = 1;
}

// 입자의 u,v를 cover-fit(종횡비 유지, scale=max(W/iw,H/ih), 중앙 정렬)으로
// 화면 픽셀 홈 좌표(bx,by)에 재매핑 — 파도가 화면을 가득 채운다.
function applyCoverFit(w, h) {
  const A = field.aspect;                 // iw/ih (또는 폴백 aspect)
  const s = Math.max(w / A, h);           // (A×1) 가상 이미지를 (w×h)에 cover
  const bw = A * s, bh = s;
  const x0 = w / 2 - COVER_CU * bw;       // 크롭 중심을 화면 중앙에 정렬
  const y0 = h / 2 - COVER_CV * bh;
  cover.x = x0; cover.y = y0; cover.w = bw; cover.h = bh;
  for (const p of field.particles) {
    p.bx = x0 + p.u * bw;                 // 진행파 오프셋 이전의 홈 좌표
    p.by = y0 + p.v * bh;
    p.tx = p.bx; p.ty = p.by;             // 초기 목표(첫 tick 전)
  }
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = opts.reducedMotion; T = 0; crashT = CYCLE * 0.6; crashFlash = 0;
    // 화면 전체(cover)를 채우려면 밀도가 필요 — 입자 수를 늘린다(엔진이 소형
    // 화면에선 자동 감축). 파도 형상은 색으로 읽히므로 대비도 끌어올린다.
    field = new ParticleField(
      opts.assets.target
        ? { image: opts.assets.target, count: 13000, w: W, h: H,
            spring: 20, damping: 6.5, jitter: reduced ? 2 : 7 }
        : { points: fallbackPoints(), aspect: 1.4474, count: 13000, w: W, h: H,
            spring: 20, damping: 6.5, jitter: reduced ? 2 : 7 }
    );
    // 상징적 팔레트로 재채색 + 진행파 파라미터 사전 계산(u,v 고정)
    for (const p of field.particles) {
      paint(p);                               // p.cr/cg/cb, p.isFoam, p.waveAmp
      p.phX = TWO_PI * WAVE_CYCLES_X * p.u;    // 가로 진행 위상
      p.phY = TWO_PI * WAVE_CYCLES_Y * p.v;    // 세로 어긋남 위상
      p.drift = p.isFoam ? FOAM_DRIFT : 0;     // 포말만 위상 따라 앞으로 쓸림
      p.size *= 1.6;                           // 점을 키워 화면을 물로 가득 채움
    }
    // 포말 입자: 살짝 크고, 복원이 느려 물거품처럼 늦게 가라앉는다
    foam = field.particles.filter((p) => p.isFoam);
    for (const p of foam) { p.size *= 1.5; p.spring = 13; }
    applyCoverFit(W, H);   // contain 대신 cover로 재매핑(화면 전체 채움)
    this._updateCrest();
  },

  _updateCrest() { // 포말 무게중심(왼쪽 2/3 우선) = 파도 마루
    let sx = 0, sy = 0, n = 0;
    for (const p of foam) {
      if (p.u > 0.7) continue;   // 후지산·원경 포말 제외
      sx += p.bx; sy += p.by; n++;
    }
    crest.x = n ? sx / n : W * 0.35;
    crest.y = n ? sy / n : H * 0.35;
  },

  tick(dt, ptr) {
    T += dt;

    // ---- 진행파: 유휴 상태에서도 바다 전체가 일렁인다 ----
    // 목표(tx,ty)에 시변 오프셋을 더하면 스프링이 부드럽게 따라온다.
    const omega = TWO_PI / WAVE_PERIOD;
    const amp = reduced ? WAVE_AMP * 0.5 : WAVE_AMP;   // reducedMotion: 진폭 절반
    const driftK = reduced ? 0.5 : 1;
    for (const p of field.particles) {
      const phase = p.phX - omega * T + p.phY;         // 왼→오로 흐르는 위상
      p.ty = p.by + p.waveAmp * amp * Math.sin(phase);
      p.tx = p.bx + p.drift * driftK * Math.cos(phase);
    }

    // ---- 자가 붕괴 사이클: 마루가 부풀었다가 포말이 서지로 터진다 ----
    crashT += dt;
    const pre = CYCLE - crashT; // 붕괴까지 남은 시간
    if (pre < 1 && pre > 0 && !reduced) {
      for (const p of foam) p.vy -= 26 * dt; // 붕괴 직전 1초: 마루가 치솟는 숨 고르기
    }
    if (crashT >= CYCLE) {
      crashT = 0; crashFlash = 1;
      const power = reduced ? 0.4 : 1;
      for (const p of foam) { // 갈고리 방향(오른쪽-아래)으로 무너져 내리는 서지
        p.vx += (60 + Math.random() * 180) * power;
        p.vy += (120 + Math.random() * 220) * power;
      }
      field.scatter(crest.x, crest.y, Math.min(W, H) * 0.33, 320 * power);
    }
    crashFlash = Math.max(0, crashFlash - dt * 0.5);

    // ---- 인터랙션: 드래그 = 소용돌이, 클릭 = 물보라 ----
    if (ptr.inside && ptr.down) {
      const speed = Math.hypot(ptr.dx, ptr.dy);
      field.swirl(ptr.x, ptr.y, 130 + speed * 3, 40 + speed * 22);
    }
    if (ptr.justDown) field.scatter(ptr.x, ptr.y, 150, reduced ? 200 : 420);

    field.step(dt);

    // ---- 렌더 ----
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#091220");
    bg.addColorStop(0.55, "#0a1524");
    bg.addColorStop(1, "#03060e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = crashFlash * crashFlash; // 붕괴 직후 포말 발광
    for (const p of field.particles) {
      const f = p.isFoam;
      const a = f ? 0.95 : 0.85;
      ctx.fillStyle = f && glow > 0.02
        ? `rgba(255,255,255,${Math.min(1, a + glow * 0.5)})`
        : `rgba(${p.cr},${p.cg},${p.cb},${a})`;
      const s = p.size * (f && glow > 0.02 ? 1 + glow * 0.8 : 1);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }

    // 수면 위 안개 한 겹 — 원작의 옅은 하늘빛
    ctx.fillStyle = "rgba(190,205,220,0.03)";
    ctx.fillRect(0, H * 0.12, W, H * 0.1);
  },

  resize(w, h) { W = w; H = h; field.resize(w, h); applyCoverFit(w, h); this._updateCrest(); },
  dispose() { ctx = null; field = null; foam = []; },
};
