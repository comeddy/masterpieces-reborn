// js/cam.js — 공용 카메라·손 추적 서비스. 셸(main.js)이 수명을 소유하고,
// 작품은 opts.cam 경유로 active()/hands()/video()/landmarks()를 폴링한다.
// MediaPipe HandLandmarker는 request() 안에서만 동적 import — 버튼을 누르기
// 전에는 아무것도 내려받지 않고, 이 모듈은 node에서 import-safe다.
// 영상은 로컬 추론 전용 — 녹화·전송·저장하지 않는다.
// 좌표계: hands()·landmarks()는 모두 **거울 보정 후**(x → 1-x) 0..1 정규화 좌표다.
// 관객이 오른쪽으로 손을 움직이면 x가 커진다. 주 손은 landmarks()[0].

// E2E 주입 시임: 테스트가 window.__CAM_CDN__으로 가짜 번들 경로를 준다
const cdnBase = () =>
  (typeof window !== "undefined" && window.__CAM_CDN__) ||
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// ---- 순수 헬퍼 (node:test 대상, 브라우저 API 미참조) ----
export function mirrorLandmarks(hands) {
  return hands.map((lm) => lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));
}
export function palmPoint(lm) {           // 검지 MCP(5)·중지 MCP(9) 중점 — 손바닥 대표점
  return { x: (lm[5].x + lm[9].x) * 0.5, y: (lm[5].y + lm[9].y) * 0.5 };
}

let stream = null, vid = null, landmarker = null;
let gen = 0;                   // stop()·재요청마다 증가 — 늦은 완료 무효화
let lastVT = -1, lmarks = [];
let last = { n: 0, x: 0.5, y: 0.5 };

export function active() { return !!(stream && landmarker); }

export async function request() {
  if (active()) return true;
  const my = ++gen;
  let s = null, lm = null, v = null;
  try {
    s = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    if (my !== gen) throw new Error("stale");
    const base = cdnBase();
    const vision = await import(`${base}/vision_bundle.mjs`);
    if (my !== gen) throw new Error("stale");
    const fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
    if (my !== gen) throw new Error("stale");
    const mk = (delegate) => vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO", numHands: 2,
    });
    try { lm = await mk("GPU"); } catch (_) { lm = await mk("CPU"); } // GPU 불가 환경 폴백
    if (my !== gen) throw new Error("stale");
    v = document.createElement("video");
    v.srcObject = s; v.muted = true; v.playsInline = true;
    await v.play();
    if (my !== gen) throw new Error("stale");
    stream = s; vid = v; landmarker = lm;
    lastVT = -1; lmarks = []; last = { n: 0, x: 0.5, y: 0.5 };
    return true;
  } catch (e) {
    if (s) for (const t of s.getTracks()) t.stop(); // 늦은 완료·중간 실패 시 정리
    if (v) v.srcObject = null;
    if (lm) { try { lm.close(); } catch (_) {} }
    if (e.message !== "stale") console.warn("카메라 사용 불가", e);
    return false;
  }
}

// 새 비디오 프레임에서만 추론(중복 추론 방지). hands()/landmarks() 어느 쪽이
// 먼저 불려도 프레임당 1회만 detectForVideo가 돈다. 예외는 직전 결과를 유지.
function detect() {
  if (!active() || vid.readyState < 2 || vid.currentTime === lastVT) return;
  lastVT = vid.currentTime;
  let res;
  try { res = landmarker.detectForVideo(vid, performance.now()); }
  catch (e) { if (!detect.warned) { detect.warned = true; console.warn("손 탐지 실패 — 직전 결과 유지", e); } return; }
  lmarks = mirrorLandmarks(res.landmarks || []);          // 거울 보정 후 저장
  if (lmarks.length) {
    const p = palmPoint(lmarks[0]);
    last = { n: Math.min(2, lmarks.length), x: p.x, y: p.y };
  } else {
    last = { n: 0, x: last.x, y: last.y };
  }
}

export function hands() { detect(); return last; }
export function landmarks() { detect(); return lmarks; }
export function video() { return vid; }

export function stop() {
  gen++;                                    // 대기 중 request()의 늦은 완료 무효화
  if (stream) for (const t of stream.getTracks()) t.stop(); // 카메라 표시등 끄기
  if (vid) vid.srcObject = null;
  if (landmarker) { try { landmarker.close(); } catch (_) {} }
  stream = null; vid = null; landmarker = null;
  lastVT = -1; lmarks = []; last = { n: 0, x: 0.5, y: 0.5 };
}
