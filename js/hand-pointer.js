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
