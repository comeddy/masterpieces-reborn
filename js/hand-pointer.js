// js/hand-pointer.js — 손 랜드마크(MediaPipe 21점) → 셸 포인터 규약 합성. 순수 로직.
// 브라우저 API를 참조하지 않으므로 node:test 대상이며, 셸(main.js)이 cam.js의
// landmarks()를 넘겨 매 프레임 호출한다. 작품 모듈은 이 파일을 모른다 — 합성된
// 포인터(x/y/down/justDown…)와 부가 정보 ptr.hand만 읽는다.

// ---- 펼침 정도 ----
// 손목(0)~중지 뿌리(9) 거리를 손바닥 크기로 삼아 손끝 거리를 정규화한다.
// 카메라 거리·거울 보정에 무관. 주먹 ≈1.1, 반쯤 오므림 ≈1.5, 펼침 ≈1.85.
const TIPS = [4, 8, 12, 16, 20];          // 엄지·검지·중지·약지·소지 끝
const PALM = [0, 5, 9, 13, 17];           // 손목 + 네 손가락 뿌리 = 손바닥 중심 표본
const RATIO_FIST = 1.2, RATIO_OPEN = 1.8; // 보정 상수 — 실제 웹캠 검증에서 조정 가능

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const valid = (lm) => Array.isArray(lm) && lm.length >= 21;

export function openness(lm) {
  if (!valid(lm)) return 0;
  const palm = dist(lm[0], lm[9]);
  if (palm <= 0) return 0;
  let sum = 0;
  for (const i of TIPS) sum += dist(lm[0], lm[i]) / palm;
  return clamp01((sum / TIPS.length - RATIO_FIST) / (RATIO_OPEN - RATIO_FIST));
}

export function palmCenter(lm) {
  let x = 0, y = 0;
  for (const i of PALM) { x += lm[i].x; y += lm[i].y; }
  return { x: x / PALM.length, y: y / PALM.length };
}

// cam.js 결과 → 합성기 입력. 결과 x는 항상 관객 기준(오른쪽으로 움직이면 커진다).
// mirrored=false(원본 카메라 좌표)면 여기서 1−x로 뒤집는다.
export function sampleFromLandmarks(lm, mirrored) {
  if (!valid(lm)) return null;
  const c = palmCenter(lm);
  return { x: mirrored ? c.x : 1 - c.x, y: c.y, openness: openness(lm) };
}

// ---- 포인터 합성 ----
// 펼친 손 = 물에 담긴 손(down), 주먹 = 뺀 손(up), 주먹→펼침 = 클릭(justDown).
export const OPEN_ON = 0.5;      // 이 이상이면 펼침(down)
export const OPEN_OFF = 0.3;     // 이 이하면 주먹(up) — 사이 구간은 직전 상태 유지(히스테리시스)
export const LOST_GRACE = 0.4;   // 손 소실 유예(초) — 프레임 드랍 깜빡임 억제
export const REACH = 0.15;       // 카메라 프레임 가장자리 제외 비율 — 중앙 70%를 화면 전체로
export const SMOOTH = 14;        // 위치 EMA 반응 속도(1/s)

export function makePointerState() {
  return { seen: false, sx: 0, sy: 0, open: false, lostT: 0, downTime: 0, mirrored: null };
}

// cam.js의 landmarks() 좌표계 판별(래치). cam.js 계약은 거울 보정 후 좌표(세션 중 불변)이므로
// 미확정·중앙 구간·무효 입력에서는 계약대로 보정 후(true)로 본다. 래치는 계약 위반(원본 좌표
// 회귀)을 잡는 안전망 — hands().x는 계약상 항상 거울 보정 후이므로 손바닥 중심 cx와 비교해
// 보정 후(cx에 가깝다) / 원본(1−cx에 가깝다)을 가른다. 중앙 근처(|cx−0.5| ≤ MIRROR_MARGIN)에서는
// 두 후보가 비슷해 오판할 수 있어 판정하지 않고, 손이 충분히 벗어난 첫 프레임에 한 번 판정해 래치한다.
// 래치는 makePointerState()로 상태가 초기화될 때 함께 풀린다.
export const MIRROR_MARGIN = 0.1;

export function detectMirrored(state, handX, lm) {
  if (state.mirrored !== null) return state.mirrored;
  if (!valid(lm) || typeof handX !== "number") return true;
  const cx = palmCenter(lm).x;
  if (Math.abs(cx - 0.5) <= MIRROR_MARGIN) return true;
  state.mirrored = Math.abs(handX - cx) <= Math.abs(handX - (1 - cx));
  return state.mirrored;
}

const reach = (t) => clamp01((t - REACH) / (1 - 2 * REACH));

function setHand(hand, visible, open, speed) {
  hand.visible = visible; hand.openness = open; hand.speed = speed;
}

// 손이 포인터를 점유하면 pointer 필드를 덮어쓰고 true, 마우스에 맡기면 pointer는
// 건드리지 않고 false. 두 경우 모두 pointer.hand는 갱신한다. sample=null은 '손 안 보임'.
export function applyHand(pointer, sample, state, dt, w, h) {
  const hand = pointer.hand || (pointer.hand = { visible: false, openness: 0, speed: 0 });
  let lost = false;
  if (!sample) {
    if (!state.seen) { setHand(hand, false, 0, 0); return false; }
    state.lostT += dt;
    if (state.lostT >= LOST_GRACE) {                 // 유예 초과 → 마우스로 복귀
      state.seen = false; state.open = false; state.downTime = 0; state.lostT = 0;
      setHand(hand, false, 0, 0);
      return false;
    }
    lost = true;                                     // 유예 중: 직전 위치·상태 유지
  } else {
    state.lostT = 0;
  }

  const first = !state.seen;
  const prevX = state.sx, prevY = state.sy;
  if (!lost) {
    const tx = reach(sample.x) * w, ty = reach(sample.y) * h;
    if (first) { state.sx = tx; state.sy = ty; }     // 첫 프레임은 점프 — 화면 밖에서 끌려오지 않게
    else {
      const k = Math.min(1, SMOOTH * dt);
      state.sx += (tx - state.sx) * k; state.sy += (ty - state.sy) * k;
    }
  }
  state.seen = true;

  let justDown = false, justUp = false;
  if (!lost) {
    const o = sample.openness;
    if (!state.open && o >= OPEN_ON) { justDown = !first; state.open = true; }   // 처음부터 펼침이면 전환 아님
    else if (state.open && o <= OPEN_OFF) { justUp = true; state.open = false; }
    hand.openness = o;
  }

  pointer.px = first ? state.sx : prevX; pointer.py = first ? state.sy : prevY;
  pointer.x = state.sx; pointer.y = state.sy;
  pointer.dx = first ? 0 : state.sx - prevX; pointer.dy = first ? 0 : state.sy - prevY;
  pointer.inside = true;
  pointer.down = state.open;
  pointer.justDown = justDown; pointer.justUp = justUp;
  state.downTime = state.open ? state.downTime + dt : 0;
  pointer.downTime = state.downTime;
  setHand(hand, true, hand.openness, dt > 0 ? Math.hypot(pointer.dx, pointer.dy) / dt : 0);
  return true;
}
