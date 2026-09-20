// js/pieces/01-great-wave.js — After Hokusai, Great Wave off Kanagawa (c.1831)
// 점(입자)만으로 파도가 화면을 가득 채운다(cover-fit). 하늘(상단의 밝고 균일한
// 크림색 부분)은 입자를 비워 어두운 배경 그라데이션이 하늘 역할을 하고, 흰 포말·
// 남색 바다·후지산이 음영 대비로 또렷이 읽힌다. 유휴 상태에서도 바다 전체가
// 진행파로 일렁이고, 파도는 주기적으로 스스로 부서지며(포말 서지), 손길에
// 흩어졌다가, 다시 불멸의 형상으로 돌아온다.
import { ParticleField, samplePoints } from "../particle-engine.js";

const TWO_PI = Math.PI * 2;
const A_DEFAULT = 1280 / 883;          // 자산 종횡비(폴백 포함)

// cover-fit 크롭 중심(정규화 이미지 좌표) — 파도 갈고리와 후지산이 모두 남도록.
// 화면이 원작보다 넓으면 상단(하늘)·하단(전경)이 잘리고, 세로가 남는다.
const COVER_CU = 0.5, COVER_CV = 0.46;

// 후지산: 원작(1280×883)에서 실측한 위치 — 큰 파도 오른쪽 검은 하늘 틈, 작은 파도 뒤.
// 정상(눈) (0.640, 0.644), 기슭 v≈0.73(배·파도에 가려짐), 기슭 반너비 ≈0.06. 원작은 눈이
// 산의 상단 약 70%를 덮고 아래에 남색 수목대가 띠처럼 놓인다. 실픽셀은 성겨서 삼각형으로
// 뭉개지므로 이 자리를 절차적 삼각형으로 또렷이 세운다(uc=정상 u, v0=정상 v, v1=기슭 v,
// wApex/wBase=반너비, snow=눈이 덮는 높이 비율). 좌표가 어긋나면 정지 입자가 움직이는
// 바다 위에 박혀 '멈춘 점'으로 보이므로 자산이 바뀌면 반드시 재실측한다.
const FUJI = { uc: 0.640, v0: 0.644, v1: 0.730, wApex: 0.006, wBase: 0.060, snow: 0.68 };

// 진행파(traveling wave): 왼→오로 흐르는 바다의 일렁임.
const WAVE_PERIOD = 5.5;               // 마루 하나가 지나가는 주기(초) — 느린 너울
const WAVE_AMP = 13;                   // 물 영역 세로 진폭(px)
const WAVE_CYCLES_X = 1.6;             // 화면 가로 방향 파장 수
const WAVE_CYCLES_Y = 0.5;             // 세로로 어긋나는 위상(구르는 느낌)
const FOAM_DRIFT = 7;                  // 포말 수평 드리프트(px)

const CYCLE = 14;                      // 자가 붕괴 주기(초)

// 클래스별 유지 확률(밀도 차별화의 핵심). 하늘=0(비움), 바다·포말=조밀,
// 물안개=극희소(우측 열린 하늘은 완전 제외 → 별밭 방지).
const KEEP = { water: 1, foam: 1, mist: 0.05, dark: 0.8, boat: 0.2, sky: 0 };

let W = 0, H = 0, ctx = null, T = 0, reduced = false;
let field = null;
let cover = { x: 0, y: 0, w: 0, h: 0 };  // cover-fit 박스(화면 가득, 넘침은 화면 밖)
let crashT = 0;                          // 자가 붕괴 사이클 타이머
let crashFlash = 0;                      // 부서진 직후 포말 발광 잔량 0..1
let foam = [];                           // 포말 입자 캐시
let crest = { x: 0, y: 0 };              // 파도 마루(포말 무게중심) — 서지 원점

// ── 픽셀 색+위치로 영역을 분류: 하늘/바다/포말/물안개/심해윤곽/배 ─────────
// 하늘(따뜻한 크림, r≫b)과 포말(중성 흰색, r≈b)은 색으로 구분된다 — 이게
// 밝기만으로 재채색하던 이전 실패(별밭)와의 결정적 차이. 원색은 그대로 둔다.
function classOf(u, v, r, g, b) {
  if (u < 0.14 && v < 0.36) return "sky";   // 제목 카르투슈 — 비움
  if (u < 0.11 && v < 0.52) return "sky";   // 서명 낙관 — 비움
  const L = r * 0.3 + g * 0.59 + b * 0.11;
  const cb = b - r;                          // 청색 크로마
  if (cb < -12) return L >= 150 ? "sky" : "boat";  // 따뜻·밝음=크림 하늘 / 따뜻·어두움=배
  if (cb >= 10) return "water";                    // 남색 바다
  if (L >= 180) return "foam";                     // 중성 흰 포말
  if (L >= 95) return "mist";                      // 회색 물안개(흩날린 물보라)
  return "dark";                                   // 짙은 남색 윤곽·심해
}

// 후지산 삼각형 판정: 0=바깥, 1=비탈, 2=정상(눈). 위에서 아래로 반너비가 넓어짐.
function fujiPart(u, v) {
  if (v < FUJI.v0 || v > FUJI.v1) return 0;
  const t = (v - FUJI.v0) / (FUJI.v1 - FUJI.v0);        // 0 정상 ~ 1 기슭
  const hw = FUJI.wApex + (FUJI.wBase - FUJI.wApex) * t;
  if (Math.abs(u - FUJI.uc) > hw) return 0;
  return t < FUJI.snow ? 2 : 1;
}
// 봉우리 주변 완충대 — 하늘의 회색 물안개 잔점을 걷어 실루엣을 고립시킨다(배는 원작대로 둔다).
function inFujiHalo(u, v) {
  return u >= 0.56 && u <= 0.72 && v >= 0.60 && v <= 0.745;
}

// 절차적 후지산 점: 자리의 성긴 실픽셀 대신 또렷한 눈 덮인 삼각봉을 만든다.
function fujiPoints() {
  const pts = [];
  const N = 520;   // 주변 바다 밀도(≈0.08)의 1.3~1.5배가 되도록 — 형상은 읽히되 덩어리로 보이지 않게(900은 3배로 과밀)
  for (let i = 0; i < N; i++) {
    const t = Math.sqrt(Math.random());                 // 면적 가중(기슭이 넓다)
    const hw = FUJI.wApex + (FUJI.wBase - FUJI.wApex) * t;
    const u = FUJI.uc + (Math.random() * 2 - 1) * hw;
    const v = FUJI.v0 + t * (FUJI.v1 - FUJI.v0);
    if (t < FUJI.snow) {
      pts.push({ u, v, r: 240, g: 243, b: 247 });        // 눈 덮인 상부(중성 흰=포말)
    } else {
      const d = 0.55 + 0.45 * ((t - FUJI.snow) / (1 - FUJI.snow));   // 아래로 짙어지는 남색 수목대
      pts.push({ u, v, r: (30 * d) | 0, g: (50 * d) | 0, b: (104 * d) | 0 });
    }
  }
  return pts;
}

function keepProb(u, v, r, g, b) {
  const cls = classOf(u, v, r, g, b);
  if (cls === "sky") return 0;
  if (fujiPart(u, v)) return 0;               // 실픽셀 제거 → 절차적 후지산으로 대체
  if (inFujiHalo(u, v) && cls === "mist") return 0;   // 봉우리 배경의 회색 잔점 정리 → 실루엣 고립
  if (cls === "mist" && u >= 0.6) return 0;    // 우측 열린 하늘엔 스프레이 금지
  return KEEP[cls];
}

// 이미지 → 목표점: 조밀 격자로 오버샘플한 뒤 클래스별 확률로 솎아 밀도 차별화.
function buildPoints(img) {
  if (!img) return { points: fallbackPoints(), aspect: A_DEFAULT };
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  // 조밀하게 오버샘플 → 대형(전체화면 cover) 캔버스에서도 밀도 캡(w*h/110)을
  // 채워 파도가 성기지 않게 한다. 클래스 솎기(~0.3)를 감안한 값.
  const dense = samplePoints(img, { count: reduced ? 36000 : 66000 });
  const points = [];
  for (const q of dense) {
    const kp = keepProb(q.u, q.v, q.r, q.g, q.b);
    if (kp > 0 && Math.random() < kp) points.push(q);
  }
  for (const q of fujiPoints()) points.push(q);   // 절차적 후지산 봉우리
  shuffle(points);   // 화면 면적 캡(w*h/110) 슬라이스가 각 영역을 고르게 자르도록
  return { points, aspect: iw / ih };
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
}

// ── 입자 태깅: 표시색(원색 톤 보정)·클래스·진행파 파라미터·크기 ──────────
function tagParticles() {
  for (const p of field.particles) {
    const cls = classOf(p.u, p.v, p.r, p.g, p.b);
    const fp = fujiPart(p.u, p.v);
    const fuji = fp > 0;
    p.isFuji = fuji;
    p.isFoam = cls === "foam";
    const isSnow = fp === 2;
    const isSlope = fp === 1;
    // 표시색: 원색(색조) 보존. 짙은 남색 바다는 어두운 배경에 묻히므로 채널을
    // 균일 배율로 톤만 올려 가시성 확보(색조·명암순서 유지, 상징 팔레트 재채색 아님).
    // 후지산은 눈(밝은 흰)·비탈(또렷한 남색)로 대비를 세워 작은 봉우리를 읽히게 한다.
    if (isSnow) {
      p.cr = p.r; p.cg = p.g; p.cb = p.b;               // 절차적 눈(240,243,247)
    } else if (isSlope) {
      p.cr = Math.min(255, (p.r * 1.55) | 0);
      p.cg = Math.min(255, (p.g * 1.55) | 0);
      p.cb = Math.min(255, (p.b * 1.55) | 0);
    } else if (cls === "water" || cls === "dark") {
      p.cr = Math.min(255, (p.r * 1.42) | 0);
      p.cg = Math.min(255, (p.g * 1.42) | 0);
      p.cb = Math.min(255, (p.b * 1.42) | 0);
    } else if (cls === "foam") {
      p.cr = Math.min(255, p.r + 6); p.cg = Math.min(255, p.g + 6); p.cb = Math.min(255, p.b + 8);
    } else {
      p.cr = p.r; p.cg = p.g; p.cb = p.b;
    }
    // 진행파 진폭: 물/윤곽 크게, 포말 중간, 후지·안개 거의 정지.
    p.waveAmp = fuji ? 0
      : (cls === "water" || cls === "dark") ? 1
      : cls === "foam" ? 0.45
      : cls === "mist" ? 0.25 : 0.5;
    p.drift = (cls === "foam" && !fuji) ? FOAM_DRIFT : 0;
    // 크기: 후지산 봉우리는 크게(작은 형상을 세움), 포말 큼, 나머지 중간.
    const base = isSnow ? 2.7 : isSlope ? 2.4
      : cls === "foam" ? 2.7
      : cls === "mist" ? 2.3 : 2.2;
    p.size = base * (0.85 + Math.random() * 0.4);
    // 진행파 위상(u,v 고정)
    p.phX = TWO_PI * WAVE_CYCLES_X * p.u;
    p.phY = TWO_PI * WAVE_CYCLES_Y * p.v;
  }
}

// 입자의 u,v를 cover-fit(종횡비 유지, scale=max(W/iw,H/ih), 크롭 중심 정렬)으로
// 화면 픽셀 홈 좌표(bx,by)에 재매핑 — 파도가 화면을 가득 채운다.
function applyCoverFit(w, h) {
  const A = field.aspect;                 // iw/ih
  const scale = Math.max(w / A, h);       // 가상 이미지(A×1)를 (w×h)에 cover
  const bw = A * scale, bh = scale;
  const x0 = w / 2 - COVER_CU * bw;
  const y0 = h / 2 - COVER_CV * bh;
  cover = { x: x0, y: y0, w: bw, h: bh };
  for (const p of field.particles) {
    p.bx = x0 + p.u * bw;                  // 진행파 오프셋 이전의 홈 좌표
    p.by = y0 + p.v * bh;
    p.tx = p.bx; p.ty = p.by;
  }
}

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0; crashT = CYCLE * 0.6; crashFlash = 0;

    const img = opts.assets && opts.assets.target ? opts.assets.target : null;
    const built = buildPoints(img);
    field = new ParticleField({
      points: built.points, aspect: built.aspect, count: built.points.length,
      w: W, h: H, margin: 0,
      spring: 20, damping: 6.5, jitter: reduced ? 2 : 6,
      sizeMin: 1.1, sizeMax: 2.4,
    });

    tagParticles();          // 표시색·클래스·진행파 파라미터·크기
    applyCoverFit(W, H);     // contain 대신 cover로 홈 좌표 재매핑(화면 가득)
    foam = field.particles.filter((p) => p.isFoam && !p.isFuji);  // 후지 눈은 서지 제외
    for (const p of foam) { p.spring = 13; }  // 포말은 복원이 느려 늦게 가라앉는다
    this._updateCrest();
  },

  _updateCrest() { // 큰 파도(좌측) 포말 무게중심 = 마루 · 서지 원점
    let sx = 0, sy = 0, n = 0;
    for (const p of foam) {
      if (p.u > 0.55 || p.isFuji) continue;   // 후지산·우측 원경 포말 제외
      sx += p.bx; sy += p.by; n++;
    }
    crest.x = n ? sx / n : W * 0.32;
    crest.y = n ? sy / n : H * 0.3;
  },

  tick(dt, ptr) {
    T += dt;

    // ---- 진행파: 유휴 상태에서도 바다 전체가 일렁인다 ----
    // 목표(tx,ty)에 시변 오프셋을 더하면 스프링이 부드럽게 따라온다.
    const omega = TWO_PI / WAVE_PERIOD;
    const amp = reduced ? WAVE_AMP * 0.5 : WAVE_AMP;
    const driftK = reduced ? 0.5 : 1;
    for (const p of field.particles) {
      const phase = p.phX - omega * T + p.phY;   // 왼→오로 흐르는 위상
      p.ty = p.by + p.waveAmp * amp * Math.sin(phase);
      p.tx = p.bx + p.drift * driftK * Math.cos(phase);
    }

    // ---- 자가 붕괴 사이클: 마루가 부풀었다가 포말이 서지로 터진다 ----
    crashT += dt;
    const pre = CYCLE - crashT;
    if (pre < 1 && pre > 0 && !reduced) {
      for (const p of foam) p.vy -= 26 * dt;   // 붕괴 직전 1초: 마루가 치솟는 숨 고르기
    }
    if (crashT >= CYCLE) {
      crashT = 0; crashFlash = 1;
      const power = reduced ? 0.4 : 1;
      for (const p of foam) {   // 갈고리 방향(오른쪽-아래)으로 무너져 내리는 서지
        p.vx += (60 + Math.random() * 180) * power;
        p.vy += (120 + Math.random() * 220) * power;
      }
      field.scatter(crest.x, crest.y, Math.min(W, H) * 0.33, 320 * power);
    }
    crashFlash = Math.max(0, crashFlash - dt * 0.5);

    // ---- 인터랙션: 드래그·펼친 손 = 소용돌이, 클릭·주먹→펼침 = 물보라 (손은 셸이 포인터로 합성) ----
    if (ptr.inside && ptr.down) {
      const speed = Math.hypot(ptr.dx, ptr.dy);
      field.swirl(ptr.x, ptr.y, 130 + speed * 3, 40 + speed * 22);
    }
    if (ptr.justDown) {
      // 손 입력(주먹→펼침)이면 물을 손으로 튕기는 감각 — 반경·세기 1.4배
      const k = ptr.hand && ptr.hand.visible ? 1.4 : 1;
      field.scatter(ptr.x, ptr.y, 150 * k, (reduced ? 200 : 420) * k);
    }

    field.step(dt);
    render();
  },

  resize(w, h) { W = w; H = h; applyCoverFit(w, h); this._updateCrest(); },
  dispose() { ctx = null; field = null; foam = []; },
};

// ── 렌더: 어두운 배경(=하늘) 위로 파도가 점으로 떠오른다 ─────────────────
function render() {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#070d18");
  bg.addColorStop(0.5, "#060b16");
  bg.addColorStop(1, "#02040a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = crashFlash * crashFlash;   // 붕괴 직후 포말 발광
  for (const p of field.particles) {
    const f = p.isFoam;
    const a = f ? 0.95 : 0.82;
    if (f && glow > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, a + glow * 0.5)})`;
    } else {
      ctx.fillStyle = `rgba(${p.cr},${p.cg},${p.cb},${a})`;
    }
    const s = p.size * (f && glow > 0.02 ? 1 + glow * 0.8 : 1);
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
}

// ── 절차적 폴백: 이미지 없을 때 파도 곡선 + 포말 갈고리 + 후지산 + 전경 파도 ─
// 하늘은 만들지 않는다(어두운 배경이 하늘). 색은 classOf가 바다·포말·후지로
// 정확히 분류하도록 프러시안 블루·크림·눈으로 부여한다.
function fallbackPoints() {
  const pts = [];
  const push = (u, v, r, g, b) => pts.push({ u, v, r, g, b });
  // 큰 파도 몸통 — 왼쪽에서 치솟아 오른쪽으로 말리는 곡선 아래를 채움
  for (let i = 0; i < 4200; i++) {
    const u = Math.random() * 0.72;
    const crestV = 0.16 + 0.30 * Math.pow(u / 0.72, 1.6);
    const v = crestV + Math.random() * (0.86 - crestV);
    const deep = (v - crestV) / (0.86 - crestV);
    push(u, v, 18 + deep * 20, 52 + deep * 30, 110 + deep * 40);   // 프러시안 블루
  }
  // 물보라 갈고리 — 마루를 따라 흩뿌려진 포말
  for (let i = 0; i < 1500; i++) {
    const u = Math.random() * 0.78;
    const crestV = 0.16 + 0.30 * Math.pow(Math.min(1, u / 0.72), 1.6);
    const v = crestV - Math.random() * 0.1;
    push(u, v, 232 + Math.random() * 22, 238 + Math.random() * 16, 246);
  }
  // 후지산 — 중앙 원경의 작은 눈 덮인 삼각봉(이미지 경로와 동일한 절차 생성)
  for (const q of fujiPoints()) pts.push(q);
  // 전경 파도 — 하단 전폭을 채워 화면이 비지 않게(오른쪽 포함)
  for (let i = 0; i < 2400; i++) {
    const u = Math.random();
    const band = 0.82 + Math.sin(u * Math.PI * 1.5) * 0.06;
    const v = band + Math.random() * (1 - band) * 1.1;
    if (v > 1) continue;
    const foamy = Math.random() < 0.28;
    if (foamy) push(u, v, 232, 238, 246);
    else push(u, v, 22, 58, 118 + Math.random() * 30);
  }
  return pts;
}
