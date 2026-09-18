// js/cam.js — 공용 카메라·손 추적 서비스. 셸(main.js)이 수명을 소유하고,
// 작품은 opts.cam 경유로 active()/hands()/video()/landmarks()를 폴링한다.
// MediaPipe HandLandmarker는 request() 안에서만 동적 import — 버튼을 누르기
// 전에는 아무것도 내려받지 않고, 이 모듈은 node에서 import-safe다.
// 영상은 로컬 추론 전용 — 녹화·전송·저장하지 않는다.

// E2E 주입 시임: 테스트가 window.__CAM_CDN__으로 가짜 번들 경로를 준다
const cdnBase = () =>
  (typeof window !== "undefined" && window.__CAM_CDN__) ||
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

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

// 매 프레임 폴링 — 새 비디오 프레임에서만 추론(중복 추론 방지)
export function hands() {
  if (!active() || vid.readyState < 2) return last;
  if (vid.currentTime !== lastVT) {
    lastVT = vid.currentTime;
    const res = landmarker.detectForVideo(vid, performance.now());
    lmarks = res.landmarks || [];
    if (lmarks.length) {
      const p = lmarks[0][9];              // 주 손: 중지 기저(손바닥 중심 근사)
      last = { n: Math.min(2, lmarks.length), x: 1 - p.x, y: p.y }; // 거울 보정
    } else {
      last = { n: 0, x: last.x, y: last.y };
    }
  }
  return last;
}

export function landmarks() { return lmarks; }
export function video() { return vid; }

export function stop() {
  gen++;                                    // 대기 중 request()의 늦은 완료 무효화
  if (stream) for (const t of stream.getTracks()) t.stop(); // 카메라 표시등 끄기
  if (vid) vid.srcObject = null;
  if (landmarker) { try { landmarker.close(); } catch (_) {} }
  stream = null; vid = null; landmarker = null;
  lastVT = -1; lmarks = []; last = { n: 0, x: 0.5, y: 0.5 };
}
