// js/pieces/04-mona-lisa.js
// After Leonardo — Mona Lisa (c.1503) · 점묘 안개 초상
// 점(입자)만으로 얼굴을 해상한다. 점 밀도는 전 영역 균일하다(DENSITY_MODE "uniform", 사용자 결정:
// 얼굴 주변만 촘촘한 것을 원치 않음). 대신 전체 밀도를 올린다 — 총 18,000점, 엔진 캡 80px²/점.
// 경계가 지나는 셀은 가장 어두운 픽셀에 점을 스냅해(특징 보존 샘플) 입술선·눈꺼풀이 격자에 묻히지
// 않게 하고, 응집 시 얼굴 점의 명도 대비를 넓히고 밝은 점을 조금 키워 눈·코·입(미소)이 점묘처럼
// 읽히게 한다. 흩어지면 sfumato 연기. ("content" 모드 — 밝기·경계·피부빛 기반 밀도 — 는 보존되어
// 상수 하나로 되돌릴 수 있다.)
//
// 오프닝·재응집 안무: 입자마다 얼굴 중심에서의 거리로 정해지는 지연 뒤에 스프링이
// 살아난다 — 배경·몸이 먼저 응결하고 얼굴이 마지막에 파면처럼 떠오른다. 지연·
// 스프링·렌더 가중치가 모두 연속 필드라 직사각·타원 경계나 구멍이 생기지 않는다.
import { ParticleField } from "../particle-engine.js";

const TAU = Math.PI * 2;
const SPRING = 3.6;            // 기본 복원 강성
const DAMPING = 3.4;
const MONO = [116, 98, 76];   // 안개 상태의 갈색-회갈색 모노톤

// 얼굴 타원(자산 960×1431 실측 · 이마~턱·양 볼의 피부 형상 · u,v 정규화).
// 모든 얼굴 관련 필드(렌더 가중치·스프링·오프닝 지연)는 이 타원의 정규화 거리 d로
// 정의된다: d=0 중심, d=1 타원 경계.
export const FACE_OVAL = { cu: 0.45, cv: 0.225, ru: 0.145, rv: 0.135 };
export const FACE_FADE = 0.6;        // 렌더 가중치 감쇠 대역: d 1.0 → 1.6 에서 1 → 0
// 밀도 모드. "uniform": 균일 격자(총 UNIFORM_COUNT, 캡 AREA_PER_DOT) · "content": 아래 내용 기반 중요도 샘플링.
export const DENSITY_MODE = "uniform";
export const UNIFORM_COUNT = 18000;      // 균일 모드 총 점 수 (reduced 11,000) — 1600×900 캡 18,000 안
export const UNIFORM_COUNT_REDUCED = 11000;
export const AREA_PER_DOT = 80;          // 균일 모드 엔진 캡: 화면 px²/점 (기본 110 → 1600×900에서 13,090 → 18,000)
// 점 밀도 결정(내용 기반, "content" 모드): 미세 격자 셀마다 중요도
//   imp = W_BRIGHT·밝기^BRIGHT_GAMMA + W_EDGE·min(1, 명암폭/EDGE_NORM) + W_FACE·faceWeight·skinness,
// 채택 확률 p = min(1, DENSITY_FLOOR + K·imp). 미세 격자 간격은 step/√DENSITY_MAX 라 p=1 이면 기본
// 밀도의 DENSITY_MAX 배, p=DENSITY_FLOOR 이면 그 DENSITY_FLOOR 배(하한 — 어두운 드레스도 실루엣 유지).
// K 는 총량이 count·DENSITY_TOTAL 이 되도록 이분 탐색으로 정한다. 미소 곡률(≈3px)이 기본 격자 간격
// (≈5px)보다 작아 어딘가는 촘촘해야 하는데, 그 '어딘가'를 얼굴 타원이 아니라 원작의 빛과 경계가 정한다.
export const DENSITY_MAX = 2.8;
export const DENSITY_FLOOR = 0.2;
export const DENSITY_TOTAL = 1.2;    // 기본 count 대비 실제 총량 배율(일반 12,000 → ≈14,400)
export const W_BRIGHT = 1.0;
export const BRIGHT_GAMMA = 1.5;     // 밝기 지수(클수록 가장 밝은 곳에 더 몰림) — 2면 가슴이 얼굴보다 과하게 우세
export const W_EDGE = 0.8;
export const EDGE_NORM = 60;         // 이 명암폭(3×3 평균 명도 최대−최소)에서 경계 항이 1로 포화
export const FEATURE_EDGE = 12;      // 이 명암폭 이상인 셀만 특징 스냅 후보(평탄 셀은 지터)
// 얼굴 피부 항: 얼굴 타원 가중치 × 피부빛(따뜻하고 중간 이상 밝은 색)만 더 촘촘하게. 기하(타원)만으로
// 올리면 머리 옆 하늘·머리카락까지 촘촘해져 고리가 보이므로, 색으로 걸러 얼굴·목 피부에만 걸리게 한다.
export const W_FACE = 1.5;
// 렌더용 상대 밀도 버킷(이동 중 안개 정규화 계수 1/dens 를 몇 단계로만 쓴다). 입자를 이 버킷으로
// 정렬해 두면 이동 중(모두 MONO 색) 연속 입자의 fillStyle 문자열이 같아 캔버스 색 파싱 비용이 준다.
export const DENS_BUCKETS = [0.56, 1.0, 1.7, 2.8];
export function densBucket(d) {
  let best = 0;
  for (let i = 1; i < DENS_BUCKETS.length; i++) if (Math.abs(DENS_BUCKETS[i] - d) < Math.abs(DENS_BUCKETS[best] - d)) best = i;
  return best;
}
export const FEATURE_CONTRAST = 35;  // 특징 셀 판정: 셀 평균 명도 − 최암점 명도(3×3 평균 기준) ≥ 이 값이면
                                     // 선·그늘이 지나는 셀 → 최암점에 스냅. 평탄한 피부 셀은 지터 위치(격자 무늬 방지)
// 입 서브필드(자산 실측 · 입술선과 양 입꼬리 그늘을 감싸는 타원). 미소는 sfumato라 저대비여서
// 이 안에서만 (1) 특징 임계를 낮춰 입꼬리 그늘도 스냅되게 하고 (2) 밝은 점 확대를 줄여 입술선을
// 덮지 않게 한다. 밀도는 올리지 않는다(밀도는 내용 기반 규칙 하나로 통일). 경계는 smoothstep.
export const MOUTH = { cu: 0.455, cv: 0.312, ru: 0.058, rv: 0.026 };
export const MOUTH_FADE = 0.8;               // 가중치 감쇠 대역: d 1.0 → 1.8 (얼굴 타원 안에 머무는 최대)
export const MOUTH_FEATURE_CONTRAST = 18;    // 입 중심 특징 임계(바깥은 FEATURE_CONTRAST로 수렴)
export const FACE_SPRING_MIN = 0.85; // 얼굴 중심 상시 스프링 비율(바깥 1) — 살짝만 느리게(0.6 이하는 수 초 기어감)
export const GATHER_MAX_DELAY = 1.2; // 응집 안무: 얼굴 중심 최대 지연(초) — 감쇠(3.4)상 이후 ~3초 더 걸려 안착
export const GATHER_REACH = 3.0;     // 지연 필드 도달 거리(d) — 이 밖은 지연 0. 넓을수록 기울기가 완만해
                                     // 이동 중 얼굴 필드가 독립된 덩어리로 보이지 않는다
export const GATHER_CORE = 0.35;     // 이 안쪽(d)은 최대 지연 유지
export const GATHER_JITTER = 0.45;   // 입자별 랜덤 지연 가산 상한(초) — 파면을 흩뜨려 얼굴이 강체처럼 함께 움직이지 않게
export const GATHER_RAMP = 0.4;      // 지연 종료 후 전강성 도달 시간(초)
export const GATHER_IDLE_K = 0.2;    // 지연 중 스프링 비율 — 멈추지 않고 연기처럼 계속 목표로 흘러간다

// ── 순수 함수(테스트 대상) ─────────────────────────────────────────
function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// 얼굴 타원 정규화 거리
export function faceDist(u, v) {
  const a = (u - FACE_OVAL.cu) / FACE_OVAL.ru;
  const b = (v - FACE_OVAL.cv) / FACE_OVAL.rv;
  return Math.sqrt(a * a + b * b);
}

// 얼굴 렌더 가중치 0..1: 타원 안 1, 감쇠 대역에서 smoothstep으로 0
export function faceWeight(d) {
  return 1 - smoothstep(1, 1 + FACE_FADE, d);
}

// 상시 스프링 비율: 얼굴 중심 FACE_SPRING_MIN → 바깥 1 (연속)
export function faceSpringScale(d) {
  return 1 - (1 - FACE_SPRING_MIN) * faceWeight(d);
}

// 입 서브필드 정규화 거리·가중치 (입 타원 안 1 → 대역 밖 0)
export function mouthDist(u, v) {
  const a = (u - MOUTH.cu) / MOUTH.ru;
  const b = (v - MOUTH.cv) / MOUTH.rv;
  return Math.sqrt(a * a + b * b);
}
export function mouthWeight(d) {
  return 1 - smoothstep(1, 1 + MOUTH_FADE, d);
}

// 응집 지연(초): 얼굴 중심 GATHER_MAX_DELAY → GATHER_REACH 밖 0, rnd(0..1)로 지터 가산.
// 지터도 같은 기울기 g로 감쇠해 도달 거리에서 계단이 생기지 않는다.
export function gatherDelay(d, rnd) {
  const g = 1 - smoothstep(GATHER_CORE, GATHER_REACH, d);
  return (GATHER_MAX_DELAY + GATHER_JITTER * rnd) * g;
}

// 안무 종료 시각(초): 가장 늦은 입자(최대 지연 + 최대 지터)가 램프를 마치는 순간. scale은 reduced 0.5
export function gatherEndFor(scale) {
  return (GATHER_MAX_DELAY + GATHER_JITTER) * scale + GATHER_RAMP;
}

// 피부빛 0..1: 적−청 차(따뜻함)와 명도가 모두 충분할 때 1. 하늘(청록·r−b≈0)·머리카락·드레스(어두움)는 0.
export function skinness(r, g, b) {
  const warm = Math.min(1, Math.max(0, (r - b - 20) / 50));
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  const lit = Math.min(1, Math.max(0, (lum - 70) / 60));
  return warm * lit;
}

// 손 휘젓기 세기(펼침) 0.35..1: 셸의 펼침 판정 문턱(0.5)에서 살랑, 활짝(1)에서 마우스 드래그와 같은 세기.
// 손 위치 지터로 잠시 펼침이 떨어져도 0.35 아래로는 내려가지 않는다(연속·클램프).
export function handStir(openness) {
  const o = Number.isFinite(openness) ? Math.min(1, Math.max(0, openness)) : 1;
  return 0.35 + 0.65 * Math.min(1, Math.max(0, (o - 0.5) / 0.5));
}

// 손 이동 성분 0..1: 손 속도(px/s)가 HAND_SPEED_MIN 이하면 0(멈춤·지터), HAND_SPEED_FULL 이상이면 1. 선형.
export const HAND_STILL = 0.15;        // 멈춘 펼친 손이 남기는 살랑(의사 컬) 세기 비율
export const HAND_SPEED_MIN = 80;
export const HAND_SPEED_FULL = 600;
export function handMotion(speed) {
  const v = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  return Math.min(1, Math.max(0, (v - HAND_SPEED_MIN) / (HAND_SPEED_FULL - HAND_SPEED_MIN)));
}
// 손 세기(속도) HAND_STILL..1 — 살랑 하한 + 이동 성분
export function handSpeedGain(speed) {
  return HAND_STILL + (1 - HAND_STILL) * handMotion(speed);
}

// 셀 중요도: 밝기(0..1)^BRIGHT_GAMMA + 명암폭(0..255)의 포화 항 + 얼굴 피부 항(0..1).
export function importanceOf(bright, edge, face = 0) {
  return W_BRIGHT * Math.pow(bright, BRIGHT_GAMMA) + W_EDGE * Math.min(1, edge / EDGE_NORM) + W_FACE * face;
}

// 채택 확률 p_i = min(1, DENSITY_FLOOR + K·imp_i) 의 합이 target 이 되는 K (이분 탐색, 단조).
// 모든 p_i 가 1이어도 target 에 못 미치면 상한 K 를 돌려준다(작은 이미지 방어).
export function solveK(imps, target) {
  const expect = (k) => { let sum = 0; for (const v of imps) sum += Math.min(1, DENSITY_FLOOR + k * v); return sum; };
  let lo = 0, hi = 8;
  if (expect(hi) < target) return hi;
  for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (expect(mid) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// 응집 스프링 비율: 지연 전 GATHER_IDLE_K, 지연 뒤 GATHER_RAMP 동안 smoothstep으로 1
export function gatherSpring(t, delay) {
  if (t <= delay) return GATHER_IDLE_K;
  return GATHER_IDLE_K + (1 - GATHER_IDLE_K) * smoothstep(0, GATHER_RAMP, t - delay);
}

let ctx = null, W = 0, H = 0, T = 0, reduced = false;
let field = null;
let bg = null;                 // 오프스크린 배경 그라데이션
let fog = 0;                   // 전역 안개 계수 (0 응집 ~ 1 흩어짐)
let cx0 = 0, cy0 = 0;          // 입자 목표 바운딩 박스 중심
let gatherT = 0;               // 응집 안무 경과 시간(초)
let gathering = false;         // 안무 진행 중이면 입자별 스프링을 매 프레임 갱신
let gatherEnd = 0;             // 안무 종료 시각 — 이후 스프링은 상시값으로 고정
let densMap = null;            // 목표점 픽셀 키 → 상대 밀도(이동 중 안개 밝기 정규화용), 폴백이면 null
let densSorted = false;        // 입자를 밀도 버킷으로 한 번 정렬했는가(init 후 첫 tagParticles)
let imgW = 0, imgH = 0;        // densMap 키 계산용 자산 크기

// 대비 확장 상한: 얼굴 가중치·응집도가 1일 때 명도 대비 배율 1 + FACE_CONTRAST
const FACE_CONTRAST = 0.3;
// 이동 중(목표에서 먼) 입자의 헤일로·코어 알파 감쇠 비율 — 연기 폭풍의 눈부심 완화
const TRANSIT_DIM = 0.45;
// 밝은 얼굴 점 확대 상한: 명도 1인 점이 (1 + FACE_BRIGHT_GROW)배 — 어두운 바탕의 점묘는
// 빛을 찍는 것이라, 피부 점을 키워 톤으로 이어 붙이고 눈·입술선은 작은 어두운 점(틈)으로 남긴다
const FACE_BRIGHT_GROW = 0.6;

export default {
  init(opts) {
    ctx = opts.ctx; W = opts.width; H = opts.height;
    reduced = !!opts.reducedMotion; T = 0; fog = 0;

    const img = opts.assets && opts.assets.target ? opts.assets.target : null;
    const built = buildPoints(img);   // { points, aspect }
    field = new ParticleField({
      points: built.points, aspect: built.aspect, count: built.points.length,
      w: W, h: H, margin: 0.1,
      spring: SPRING, damping: DAMPING, jitter: 2.5,
      sizeMin: 1.1, sizeMax: 2.2,
      areaPerDot: DENSITY_MODE === "uniform" ? AREA_PER_DOT : 110,
    });

    buildBackground();
    densSorted = false;
    tagParticles(); // 얼굴 필드(렌더 가중치·스프링 비율·지연) · 숨쉬기 기준 목표 기록
    startGather();  // 오프닝: 배경·몸 먼저, 얼굴 마지막
  },

  tick(dt, ptr) {
    T += dt;

    // 1) 입력 반영 — 마우스와 카메라 손(셸이 handPointer 규약으로 합성: 펼친 손 = down,
    //    주먹→펼침 = justDown)이 같은 경로를 탄다. 손 좌표가 비정상이면 그 프레임은 무시.
    if (!(Number.isFinite(ptr.x) && Number.isFinite(ptr.y))) ptr = { ...ptr, inside: false };
    const hand = ptr.hand && ptr.hand.visible;
    if (ptr.inside && ptr.justDown) {
      // 클릭 = 안개 폭발: 전체를 방사형으로 밀치고, 같은 안무로 재응집(얼굴이 마지막).
      // 연타는 산란만 누적하고 안무는 0.3초 안에 다시 시작하지 않는다(얼굴 스프링 무한 유예 방지).
      field.scatter(ptr.x, ptr.y, Math.min(W, H) * 0.95, reduced ? 130 : 260);
      if (!(gathering && gatherT < 0.3)) startGather();
    } else if (ptr.inside && ptr.down) {
      const sp = Number.isFinite(ptr.dx) && Number.isFinite(ptr.dy) ? Math.hypot(ptr.dx, ptr.dy) : 0;
      const rad = Math.min(W, H) * 0.24;
      if (hand) {
        // 손 = 손바람. 손은 보이는 동안 늘 "펼침(down)"이라 마우스의 소용돌이(swirl, 프레임마다 속도
        //    누적)를 그대로 쓰면 멈춘 손도 몇 초 만에 거대한 고리를 만든다(E2E 확인). 대신 손 속도에
        //    비례한 방사 밀림(지나간 자리의 안개가 밀려남)과 손 아래 안개의 살랑(의사 컬)만 준다.
        //    멈춘 펼친 손은 살랑만 남아 그 자리 얼굴을 흐리고, 저으면 안개가 밀려난다. dt·60으로
        //    프레임률에 무관하게, 펼침 정도(반쯤 0.35 → 활짝 1)로 세기를 조절.
        const open = handStir(ptr.hand.openness);
        const motion = handMotion(ptr.hand.speed);
        const fps = Math.min(1.5, dt * 60);
        const hrad = rad * 0.75;                 // 손바람 반경(마우스 소용돌이보다 좁게 — 지나간 자리만)
        if (motion > 0) field.scatter(ptr.x, ptr.y, hrad, (reduced ? 35 : 80) * motion * open * fps);
        stirCurl(ptr.x, ptr.y, hrad, sp * open, (HAND_STILL + (1 - HAND_STILL) * motion) * open * fps);
      } else {
        // 마우스 드래그 = sfumato 휘젓기: 소용돌이 + 커서 주변 의사 컬 노이즈 (기존 동작)
        field.swirl(ptr.x, ptr.y, rad, (reduced ? 70 : 150) + sp * 4);
        stirCurl(ptr.x, ptr.y, rad, sp);
      }
    }

    // 2) 시뮬레이션 (유휴 숨쉬기 → 안무 스프링 → 적분)
    applyBreathing();
    updateGather(dt);
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

  dispose() { ctx = null; field = null; bg = null; gathering = false; densMap = null; },
};

// ── 목표점 구성: 단일 균일 격자 + 얼굴 필드 특징 보존 샘플 ─────────────
function buildPoints(img) {
  if (!img) { densMap = null; return { points: makePortraitPoints(), aspect: 0.75 }; } // 폴백: 절차적 실루엣
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  // uniform: 총 UNIFORM_COUNT 를 그대로 균일 격자로. content: 기본 count 12,000(총량은 DENSITY_TOTAL 배 ≈14,400).
  const total = DENSITY_MODE === "uniform" ? (reduced ? UNIFORM_COUNT_REDUCED : UNIFORM_COUNT) : (reduced ? 7400 : 12000);
  const points = samplePortrait(img, total);
  imgW = iw; imgH = ih;
  densMap = new Map();
  for (const q of points) densMap.set(Math.round(q.v * ih) * iw + Math.round(q.u * iw), q.dens);
  shuffle(points); // 화면 면적 캡(w*h/110)이 밝은 곳·어두운 곳을 같은 비율로 자르도록
  return { points, aspect: iw / ih };
}

// 이미지 → 목표점 (DOM 래퍼: 픽셀만 읽고 순수 샘플러에 넘긴다)
function samplePortrait(image, count) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const c = document.createElement("canvas");
  c.width = iw; c.height = ih;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  return samplePixels(g.getImageData(0, 0, iw, ih).data, iw, ih, count, Math.random);
}

// 픽셀 배열 → 목표점 {u,v,r,g,b,dens}[] (순수 · 테스트 대상)
// · 미세 격자(간격 step/√DENSITY_MAX)로 전 영역을 훑어 셀마다 3×3 평균 명도의 평균(밝기)과
//   최대−최소(명암폭)를 재고 중요도 imp 를 만든다. 채택 확률 p = min(1, DENSITY_FLOOR + K·imp),
//   K 는 총량 count·DENSITY_TOTAL 을 맞추는 값(solveK). 밝은 곳·경계가 촘촘, 어두운 평탄부는 성김.
// · 특징 보존: 명암폭이 FEATURE_EDGE 이상인 채택 셀은 3×3 평균 명도를 훑어 셀 평균보다 thr 이상
//   어두운 최암점이 있으면(선·그늘이 지나는 셀) 그 픽셀의 위치·색을 채택한다 — 셀 크기의 입술선·
//   눈꺼풀·손가락 윤곽이 무작위 지터에 묻히지 않고 점 하나로 살아남는다. thr 는 얼굴 밖·안
//   FEATURE_CONTRAST, 입 서브필드 중심에서 MOUTH_FEATURE_CONTRAST(입꼬리 그늘은 저대비).
//   평탄 셀은 지터 위치에 원색 — 최암점 스냅을 평탄 셀에도 적용하면 동률 픽셀(셀 좌상단)로 몰려
//   격자 무늬·군집이 생긴다.
// · dens = p·DENSITY_MAX: 그 자리의 상대 밀도(기본 격자 1 기준). 렌더가 이동 중 안개 밝기를 이 값으로
//   나눠 밀도가 높은 곳이 홀로 밝은 덩어리로 뜨지 않게 한다.
// · 같은 픽셀은 한 번만 넣는다.
export function samplePixels(data, iw, ih, count, rnd, mode = DENSITY_MODE) {
  const step = Math.max(1, Math.sqrt((iw * ih) / count));
  const fstep = step / Math.sqrt(DENSITY_MAX);
  const stride = fstep >= 4 ? 2 : 1;                // 중요도 추정용 픽셀 보폭(비용 1/4)
  const pts = [];
  const seen = new Set();
  const m = [0, 0, 0];
  const mean3 = (x, y) => {                          // 3×3 평균색 (경계 클램프)
    let r = 0, gg = 0, b = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = Math.min(ih - 1, Math.max(0, y + dy));
      for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(iw - 1, Math.max(0, x + dx));
        const i = (yy * iw + xx) * 4;
        r += data[i]; gg += data[i + 1]; b += data[i + 2];
      }
    }
    m[0] = r / 9; m[1] = gg / 9; m[2] = b / 9;
  };
  const push = (xi, yi, r, g, b, dens) => {
    const k = yi * iw + xi;
    if (seen.has(k)) return;
    seen.add(k);
    pts.push({ u: xi / iw, v: yi / ih, r: r | 0, g: g | 0, b: b | 0, dens });
  };
  // 셀 [x,x1)×[y,y1) 하나를 샘플: feature 면 특징 스냅 시도(실패 시 지터+평균색), 아니면 원색 지터
  const cell = (x, y, x1, y1, feature, thr, dens) => {
    const xi = Math.min(iw - 1, (x + rnd() * (x1 - x)) | 0); // 지터로 격자 무늬 방지
    const yi = Math.min(ih - 1, (y + rnd() * (y1 - y)) | 0);
    if (feature) {
      let best = Infinity, bx = 0, by = 0, br = 0, bgc = 0, bb = 0, sum = 0, n = 0;
      for (let yy = y | 0; yy < y1; yy++) {
        for (let xx = x | 0; xx < x1; xx++) {
          mean3(xx, yy);
          const L = 0.3 * m[0] + 0.59 * m[1] + 0.11 * m[2];
          sum += L; n++;
          if (L < best) { best = L; bx = xx; by = yy; br = m[0]; bgc = m[1]; bb = m[2]; }
        }
      }
      if (n === 0) return;
      if (sum / n - best >= thr) { push(bx, by, br, bgc, bb, dens); return; }
      mean3(xi, yi);
      push(xi, yi, m[0], m[1], m[2], dens);
    } else {
      const i = (yi * iw + xi) * 4;
      if (data[i + 3] < 8) return;
      push(xi, yi, data[i], data[i + 1], data[i + 2], dens);
    }
  };
  // 균일 모드: 기본 격자 한 벌 — 셀마다 점 하나(count 개), 얼굴 필드 셀은 특징 스냅 시도, dens 1
  const thrAt = (mw) => FEATURE_CONTRAST - (FEATURE_CONTRAST - MOUTH_FEATURE_CONTRAST) * mw;
  if (mode === "uniform") {
    for (let y = 0; y < ih; y += step) {
      for (let x = 0; x < iw; x += step) {
        const x1 = Math.min(iw, x + step), y1 = Math.min(ih, y + step);
        const cu = (x + x1) / (2 * iw), cv = (y + y1) / (2 * ih);
        const fw = faceWeight(faceDist(cu, cv));
        cell(x, y, x1, y1, fw > 0 && rnd() < fw, thrAt(fw > 0 ? mouthWeight(mouthDist(cu, cv)) : 0), 1);
      }
    }
    return pts;
  }
  // ── content 모드 ──
  // 1) 미세 격자 훑기 → 셀 중요도
  const cells = [];
  for (let y = 0; y < ih; y += fstep) {
    for (let x = 0; x < iw; x += fstep) {
      const x1 = Math.min(iw, x + fstep), y1 = Math.min(ih, y + fstep);
      let lo = Infinity, hi = -Infinity, sum = 0, n = 0, sr = 0, sg = 0, sb = 0;
      for (let yy = y | 0; yy < y1; yy += stride) {
        for (let xx = x | 0; xx < x1; xx += stride) {
          mean3(xx, yy);
          const L = 0.3 * m[0] + 0.59 * m[1] + 0.11 * m[2];
          if (L < lo) lo = L; if (L > hi) hi = L; sum += L; n++;
          sr += m[0]; sg += m[1]; sb += m[2];
        }
      }
      if (n === 0) continue;
      const e = hi - lo;
      const fw = faceWeight(faceDist((x + x1) / (2 * iw), (y + y1) / (2 * ih)));
      const face = fw > 0 ? fw * skinness(sr / n, sg / n, sb / n) : 0;
      cells.push({ x, y, x1, y1, e, imp: importanceOf(sum / n / 255, e, face) });
    }
  }
  // 2) 총량을 맞추는 K
  const K = solveK(cells.map((c) => c.imp), count * DENSITY_TOTAL);
  // 3) 채택·샘플 (특징 임계는 입 서브필드에서 낮아진다)
  for (const c of cells) {
    const p = Math.min(1, DENSITY_FLOOR + K * c.imp);
    if (rnd() >= p) continue;
    const cu = (c.x + c.x1) / (2 * iw), cv = (c.y + c.y1) / (2 * ih);
    const mw = faceWeight(faceDist(cu, cv)) > 0 ? mouthWeight(mouthDist(cu, cv)) : 0;
    cell(c.x, c.y, c.x1, c.y1, c.e >= FEATURE_EDGE, thrAt(mw), p * DENSITY_MAX);
  }
  return pts;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
}

// ── 입자 태깅: 얼굴 필드(연속) + 안무 지연 + 숨쉬기 기준점 — 멱등(리사이즈마다 호출) ──
function tagParticles() {
  const ps = field.particles;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ps) {
    if (p.tx < minX) minX = p.tx; if (p.tx > maxX) maxX = p.tx;
    if (p.ty < minY) minY = p.ty; if (p.ty > maxY) maxY = p.ty;
  }
  cx0 = (minX + maxX) / 2; cy0 = (minY + maxY) / 2;

  const scale = reduced ? 0.5 : 1;
  for (const p of ps) {
    p.bx = p.tx; p.by = p.ty;                 // 숨쉬기 기준 목표
    if (p.phase === undefined) p.phase = Math.random() * TAU; // 개별 위상
    const d = faceDist(p.u, p.v);             // 이미지 정규화 좌표 → 얼굴 타원 거리
    p.fw = faceWeight(d);                     // 렌더 가중치(타원 안 1 → 대역 밖 0)
    p.mw = p.fw > 0 ? mouthWeight(mouthDist(p.u, p.v)) : 0; // 입 서브필드 가중치(밝은 점 확대 억제)
    p.dens = densMap ? (densMap.get(Math.round(p.v * imgH) * imgW + Math.round(p.u * imgW)) || 1) : 1;
    p.dq = densBucket(p.dens);                // 렌더용 밀도 버킷
    p.dn = Math.min(1.6, Math.max(0.4, 1 / DENS_BUCKETS[p.dq])); // 이동 중 안개 정규화 계수
    p.lf = 1; p.cq = -1;                      // 이동 계수 캐시·정지 스타일 캐시 키(무효)
    p.faceK = faceSpringScale(d);             // 상시 스프링 비율(얼굴 살짝 느림)
    if (p.delay === undefined) p.delay = gatherDelay(d, Math.random()) * scale;
    p.spring = SPRING * p.faceK * (gathering ? gatherSpring(gatherT, p.delay) : 1);
  }
  if (!densSorted) {                          // 밀도 버킷 정렬(그리기 순서만 바뀜 — 시뮬레이션과 무관)
    ps.sort((a, b) => a.dq - b.dq);
    densSorted = true;
  }
}

// ── 응집 안무: 지연 뒤 스프링이 살아난다 (오프닝·클릭 산란 후 공통) ─────
function startGather() {
  gatherT = 0; gathering = true;
  gatherEnd = gatherEndFor(reduced ? 0.5 : 1);
}

function updateGather(dt) {
  if (!gathering) return;
  gatherT += dt;
  const ps = field.particles;
  if (gatherT >= gatherEnd) {               // 종료: 상시값으로 고정하고 갱신 중단
    gathering = false;
    for (const p of ps) p.spring = SPRING * p.faceK;
    return;
  }
  for (const p of ps) p.spring = SPRING * p.faceK * gatherSpring(gatherT, p.delay);
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

// ── 드래그 휘젓기: 사인 기반 의사 컬 노이즈로 vx,vy에 회전 성분 부여 (scale: 손 경로의 세기 배율) ─
function stirCurl(cx, cy, rad, sp, scale = 1) {
  const ps = field.particles;
  const r2 = rad * rad;
  const force = ((reduced ? 16 : 40) + sp * 1.4) * scale;
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
// 입자별 이동 계수 p.lf(0 정지 ~ 1 멀리)도 여기서 한 번 계산해 렌더 3패스가 공유한다.
// fog는 직전 프레임 값이지만 dt·3 저역통과라 한 프레임 지연은 보이지 않는다.
function updateFog(dt) {
  const ps = field.particles;
  let sum = 0;
  for (const p of ps) {
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    sum += d;
    p.lf = Math.min(1, Math.max(fog, d / 70));
  }
  const target = Math.min(1, (sum / ps.length) / 55);
  fog += (target - fog) * Math.min(1, dt * 3);
}

// ── 렌더: 점묘 초상 ─────────────────────────────────────────────
// 흩어지면 부드러운 연기(헤일로 additive), 응집하면 얼굴 필드의 입자가 가중치만큼
// 작고 또렷한 source-over 점묘로 전환되어 눈·코·입(미소)이 점의 집합으로 읽힌다.
// 모든 얼굴 처리는 연속 가중치 p.fw로 섞이므로 박스·타원 경계가 보이지 않는다.
//
// 비용: 정지한 입자(p.lf≈0)의 색·알파·크기는 응집도 양자화 키(cq)가 같으면 바뀌지 않으므로
// rgba 문자열과 반지름을 입자에 캐시한다 — fillStyle 문자열 빌드가 프레임 예산의 큰 몫이다.
const STILL = 0.03;            // 이 아래 이동 계수는 정지로 간주(스타일 캐시 사용)
const COH_STEPS = 32;          // 응집도 양자화 단계(캐시 키)

function rgba(c, a) {
  return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + ((a * 1000) | 0) / 1000 + ")";
}

// 정지 입자의 캐시 키를 갱신하고, 키가 바뀌면 세 패스의 문자열을 모두 무효화한다
function touchCache(p, cq) {
  if (p.cq !== cq) { p.cq = cq; p.hs = null; p.cs = null; p.fs = null; }
}

function render() {
  // 반투명 배경 재도포 → 연기 잔상 (정지한 점은 매 프레임 다시 찍혀 또렷이 유지)
  ctx.globalAlpha = reduced ? 0.6 : 0.32;
  ctx.drawImage(bg, 0, 0, W, H);
  ctx.globalAlpha = 1;

  const ps = field.particles;
  const coh = Math.max(0, Math.min(1, 1 - fog)); // 응집도 (0 연기 ~ 1 또렷)
  const cq = Math.round(coh * COH_STEPS);
  // 오프닝 첫 1초는 이동 감쇠를 0→TRANSIT_DIM으로 램프 — 시작 순간부터 점이 보이게
  const dim = TRANSIT_DIM * Math.min(1, T);

  // 패스 1 (additive): 헤일로 — sfumato 안개 글로우. 얼굴은 응집할수록 헤일로가 걷힌다.
  //   이동 중 입자는 dim만큼 어둡게 — 오프닝·산란의 연기가 눈부신 폭풍이 아니라 어스름한
  //   안개에서 형상이 응결해 나오도록. 이동 중 밀도가 높은 곳(밝은 얼굴·가슴)은 면적당 밝기도
  //   그만큼 높다 → 상대 밀도 버킷의 1/dens(p.dn, 0.4~1.6)로 나눠 어디나 같은 안개가 되게 한다(정지하면 1).
  ctx.globalCompositeOperation = "lighter";
  for (const p of ps) {
    const lf = p.lf;
    const densNorm = 1 - lf * (1 - p.dn);
    const ha = 0.05 * (1 - p.fw * coh) * (1 - dim * lf) * densNorm;
    if (ha < 0.003) continue;
    const still = lf < STILL;
    if (still) touchCache(p, cq);
    if (still && p.hs !== null && p.hs !== undefined) {
      if (p.hs === "") continue;               // 캐시: 어두운 점 → 헤일로 생략
      ctx.fillStyle = p.hs;
    } else {
      const c = shade(p, lf);
      // 어두운 점(드레스·머리·그늘)은 additive 글로우에 거의 기여하지 않는다 →
      // 큰 헤일로 원 그리기를 건너뛰어 비용을 줄이고 어두운 영역을 어둡게 유지.
      if (c[0] + c[1] + c[2] < 135) { if (still) p.hs = ""; continue; }
      ctx.fillStyle = rgba(c, ha);
      if (still) p.hs = ctx.fillStyle;
    }
    const s = (p.size || 1.5) * 2.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
  }
  // 패스 2 (additive): 코어 — 부드러운 연기 심 (sfumato 보존). 얼굴 포함 전 입자 동일 처리
  //   → 균일 밀도에서 얼굴 영역만 어두워지는 단차가 없다. 정지·응집한 얼굴 점은 패스 3이
  //   위를 덮으므로 (1 − fw·coh)로 연속 소멸시켜 그리지 않는다(비용).
  for (const p of ps) {
    const lf = p.lf;
    const densNorm = 1 - lf * (1 - p.dn);
    const a = 0.34 * (1 - dim * lf) * (1 - p.fw * coh) * densNorm;
    if (a < 0.01) continue;
    const still = lf < STILL;
    if (still) touchCache(p, cq);
    if (still && p.cs) {
      ctx.fillStyle = p.cs;
    } else {
      ctx.fillStyle = rgba(shade(p, lf), a);
      if (still) p.cs = ctx.fillStyle;
    }
    const s = (p.size || 1.5) * 0.8;
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
  }
  // 패스 3 (source-over): 얼굴 점묘 — 가중치·응집도만큼 불투명하고 대비가 넓어지며,
  //   밝은 점(피부)은 커져 톤으로 이어지고 어두운 점(입술선·눈·콧구멍 그늘)은 작아 틈으로
  //   남는다(하프톤). 입 서브필드에서는 밝은 점 확대를 줄여 입술선을 덮지 않는다.
  //   이동 중(lf→1)에는 (1 − lf)로 사라져 얼굴 입자도 패스 1·2의 안개로만 보인다 — 얼굴이 홀로
  //   밝은 덩어리로 떠 있지 않고, "안개가 걷히며 얼굴이 마지막에 떠오른다"가 렌더에서도 성립한다.
  //   (이동 중 패스 3 생략은 프레임 비용도 줄인다.)
  ctx.globalCompositeOperation = "source-over";
  for (const p of ps) {
    if (p.fw < 0.02) continue;
    const lf = p.lf;
    const a = (0.42 + 0.53 * coh) * p.fw * (1 - lf);
    if (a < 0.01) continue;
    const still = lf < STILL;
    if (still) touchCache(p, cq);
    if (still && p.fs) {
      ctx.fillStyle = p.fs;
    } else {
      const w = coh * p.fw;
      const c = faceShade(p, w, lf);
      const bright = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
      p.fr = (p.size || 1.5) * (0.95 - 0.2 * coh) * (1 + FACE_BRIGHT_GROW * (1 - 0.8 * p.mw) * bright * w);
      ctx.fillStyle = rgba(c, a);
      if (still) p.fs = ctx.fillStyle;
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.fr, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

// 응집이면 원색, 흩어질수록 모노톤 (이동 계수 lf만큼)
function shade(p, lf) {
  if (lf <= 0) return [p.r, p.g, p.b];
  return [
    (p.r + (MONO[0] - p.r) * lf) | 0,
    (p.g + (MONO[1] - p.g) * lf) | 0,
    (p.b + (MONO[2] - p.b) * lf) | 0,
  ];
}

// 얼굴 입자: w(=응집도×얼굴 가중치)만큼 명도 대비를 넓힌다. 모나리자의 이목구비는
// 저대비 sfumato라 그대로면 균일한 살색 덩어리로 뭉갠다 → 눈·코·입(미소) 그늘을
// 어둡게, 광대·이마를 밝게 벌려 점의 명암 패턴만으로 얼굴이 해상되게 한다.
function faceShade(p, w, lf) {
  const c = shade(p, lf);
  if (w < 0.02) return c; // 흩어진 상태·필드 가장자리는 원 거동 유지
  const k = 1 + FACE_CONTRAST * w;           // 대비 확장 계수 (1 → 1 + FACE_CONTRAST)
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
