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

// 워커/메인 어느 경로든 원본 랜드마크를 같은 규칙으로 캐시에 반영한다:
// 21점 미만 손 제거 → 거울 보정 → 주 손 5·9 중점. 손 없으면 n:0에 직전 좌표 유지.
export function applyLandmarks(raw, prevLast) {
  const lmarks = mirrorLandmarks((raw || []).filter((lm) => lm && lm.length >= 21));
  if (!lmarks.length) return { lmarks, last: { n: 0, x: prevLast.x, y: prevLast.y } };
  const p = palmPoint(lmarks[0]);
  return { lmarks, last: { n: Math.min(2, lmarks.length), x: p.x, y: p.y } };
}

export const STALE_MS = 500;  // 비디오 프레임이 이만큼 전진하지 않으면 손 결과를 비운다
export function isStale(nowMs, lastAdvanceMs) { return nowMs - lastAdvanceMs > STALE_MS; }

let stream = null, vid = null, landmarker = null;
let gen = 0;                   // stop()·재요청마다 증가 — 늦은 완료 무효화
let lastVT = -1, lastAdvanceMs = 0, lmarks = [];
let last = { n: 0, x: 0.5, y: 0.5 };
let info = { mode: null, delegate: null, p50: null, renderer: null }; // stats() 백업 상태

export function active() { return !!(stream && landmarker); }
export function stats() { return { ...info }; }

export async function request(opts = {}) {
  if (active()) return true;
  const numHands = opts.numHands === 1 ? 1 : 2; // 03·01·11번처럼 주 손만 쓰면 추론 절반
  const my = ++gen;
  let s = null, lm = null, v = null, delegate = null;
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
    const mk = (d) => vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: d },
      runningMode: "VIDEO", numHands,
    });
    try { lm = await mk("GPU"); delegate = "GPU"; }
    catch (_) { lm = await mk("CPU"); delegate = "CPU"; } // GPU 불가 환경 폴백
    if (my !== gen) throw new Error("stale");
    v = document.createElement("video");
    v.srcObject = s; v.muted = true; v.playsInline = true;
    await v.play();
    if (my !== gen) throw new Error("stale");
    stream = s; vid = v; landmarker = lm;
    lastVT = -1; lastAdvanceMs = performance.now(); lmarks = []; last = { n: 0, x: 0.5, y: 0.5 };
    info = { mode: "main", delegate, p50: null, renderer: null };
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
  if (!active() || vid.readyState < 2) return;
  const nowMs = performance.now();
  if (vid.currentTime === lastVT) {
    // 프레임 정지(트랙 종료·뮤트·점유): 오래되면 손 결과를 비워 소비자가 소실을 감지하게 한다
    if (lmarks.length && isStale(nowMs, lastAdvanceMs)) { lmarks = []; last = { n: 0, x: last.x, y: last.y }; }
    return;
  }
  lastVT = vid.currentTime; lastAdvanceMs = nowMs;
  let res;
  try { res = landmarker.detectForVideo(vid, nowMs); }
  catch (e) { if (!detect.warned) { detect.warned = true; console.warn("손 탐지 실패 — 직전 결과 유지", e); } return; }
  ({ lmarks, last } = applyLandmarks(res.landmarks, last));
}

export function hands() { detect(); return last; }
export function landmarks() { detect(); return lmarks; }
export function video() { return vid; }

// 코너 카메라 미러(공용): rect에 비디오를 좌우반전으로 그리고 거울 보정된
// 랜드마크 점 + 1px 테두리. 작품은 자리(rect)만 정한다. 캔버스 상태는 원복.
export function drawMirror(ctx, rect) {
  if (!active() || !vid || vid.readyState < 2) return;
  const { x, y, w, h } = rect;
  detect();                                               // 같은 프레임 결과 보장
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.92;
  ctx.translate(x + w, y); ctx.scale(-1, 1);              // 좌우반전 미러
  ctx.drawImage(vid, 0, 0, w, h);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(255,210,63,0.9)";                 // 랜드마크 점(이미 거울 좌표)
  for (const hand of lmarks) {
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(x + p.x * w, y + p.y * h, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

export function stop() {
  gen++;                                    // 대기 중 request()의 늦은 완료 무효화
  if (stream) for (const t of stream.getTracks()) t.stop(); // 카메라 표시등 끄기
  if (vid) vid.srcObject = null;
  if (landmarker) { try { landmarker.close(); } catch (_) {} }
  stream = null; vid = null; landmarker = null;
  lastVT = -1; lastAdvanceMs = 0; lmarks = []; last = { n: 0, x: 0.5, y: 0.5 };
  info = { mode: null, delegate: null, p50: null, renderer: null };
}
