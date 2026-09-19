// js/cam.js — 공용 카메라·손 추적 서비스. 셸(main.js)이 수명을 소유하고,
// 작품은 opts.cam 경유로 active()/hands()/video()/landmarks()를 폴링한다.
// MediaPipe HandLandmarker는 request() 안에서만 동적 import — 버튼을 누르기
// 전에는 아무것도 내려받지 않고, 이 모듈은 node에서 import-safe다.
// 추론은 기본적으로 cam-worker.js(클래식 Worker)에서 돌아 렌더 루프가 추론 시간에
// 멈추지 않는다(프레임 전송·결과 캐시). 워커를 못 띄우면 기존 메인 스레드 경로로 폴백.
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

let stream = null, vid = null, landmarker = null;      // landmarker는 메인 스레드 폴백 전용
let worker = null, inFlight = false, inFlightSince = 0;   // 워커 모드 상태(한 프레임만 진행 중)
let seamOn = false;            // E2E 시임(window.__CAM_CDN__) 활성 — frame 메시지에 가짜 손 동봉
const READY_TIMEOUT_MS = 20000, INFLIGHT_WATCHDOG_MS = 3000;
let gen = 0;                   // stop()·재요청마다 증가 — 늦은 완료 무효화
let lastVT = -1, lastAdvanceMs = 0, lmarks = [];
let last = { n: 0, x: 0.5, y: 0.5 };
let info = { mode: null, delegate: null, p50: null, renderer: null }; // stats() 백업 상태

export function active() { return !!(stream && (landmarker || worker)); }
export function stats() { return { ...info }; }

export async function request(opts = {}) {
  if (active()) return true;
  const numHands = opts.numHands === 1 ? 1 : 2; // 03·01·11번처럼 주 손만 쓰면 추론 절반
  const my = ++gen;
  let s = null, lm = null, v = null, w = null, nfo = null;
  try {
    s = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    if (my !== gen) throw new Error("stale");
    const base = cdnBase();
    const seam = typeof window !== "undefined" && !!window.__CAM_CDN__;
    // 1) 워커 경로: 추론을 메인 스레드 밖으로
    const r = await startWorker(base, numHands).catch((e) => { console.warn("[cam] 워커 불가 — 메인 스레드 폴백", e); return null; });
    if (r) { w = r.w; nfo = r.info; }
    if (my !== gen) throw new Error("stale");
    if (!w) {
      // 2) 폴백: 현행 메인 스레드 경로(동기 detect)
      const vision = await import(`${base}/vision_bundle.mjs`);
      if (my !== gen) throw new Error("stale");
      const fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
      if (my !== gen) throw new Error("stale");
      const mk = (delegate) => vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: "VIDEO", numHands,
      });
      let d = "GPU";
      try { lm = await mk("GPU"); } catch (_) { lm = await mk("CPU"); d = "CPU"; } // GPU 불가 환경 폴백
      if (my !== gen) throw new Error("stale");
      nfo = { mode: "main", delegate: d, p50: null, renderer: null };
    }
    v = document.createElement("video");
    v.srcObject = s; v.muted = true; v.playsInline = true;
    await v.play();
    if (my !== gen) throw new Error("stale");
    stream = s; vid = v; landmarker = lm; worker = w; inFlight = false; seamOn = seam;
    lastVT = -1; lastAdvanceMs = performance.now(); lmarks = []; last = { n: 0, x: 0.5, y: 0.5 };
    info = nfo;
    console.info(`[cam] mode=${info.mode} delegate=${info.delegate} p50=${info.p50 ?? "-"}ms renderer=${info.renderer ?? "-"}`);
    return true;
  } catch (e) {
    if (s) for (const t of s.getTracks()) t.stop(); // 늦은 완료·중간 실패 시 정리
    if (v) v.srcObject = null;
    if (lm) { try { lm.close(); } catch (_) {} }
    if (w) { try { w.terminate(); } catch (_) {} }
    if (e.message !== "stale") console.warn("카메라 사용 불가", e);
    return false;
  }
}

// 워커 생성 → init → ready 대기(타임아웃). 실패는 throw. 성공 시 { w, info }를 넘기고
// 모듈 상태(info)는 request()가 세대 가드 통과 후에만 반영한다.
function startWorker(base, numHands) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL("./cam-worker.js", import.meta.url)); }   // 클래식 워커(type 없음)
    catch (e) { reject(e); return; }
    const timer = setTimeout(() => { w.terminate(); reject(new Error("worker ready timeout")); }, READY_TIMEOUT_MS);
    w.onerror = (e) => { clearTimeout(timer); w.terminate(); reject(e.error || new Error(e.message || "worker error")); };
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "ready") {
        clearTimeout(timer);
        w.onmessage = onWorkerMessage; w.onerror = (e) => console.warn("[cam] 워커 오류", e.message || e);
        resolve({ w, info: { mode: "worker", delegate: m.delegate, p50: m.p50, renderer: m.renderer } });
      } else if (m.type === "fail") { clearTimeout(timer); w.terminate(); reject(new Error(m.msg)); }
    };
    w.postMessage({ type: "init", base, model: MODEL_URL, numHands });
  });
}

function onWorkerMessage(ev) {
  if (ev.target !== worker) return;                   // stop()·재요청 뒤 늦게 도착한 옛 워커 메시지 무시
  const m = ev.data;
  if (m.type === "result") {
    ({ lmarks, last } = applyLandmarks(m.landmarks, last));
    inFlight = false;
  } else if (m.type === "fail") {
    console.warn("[cam] 워커 추론 실패", m.msg); inFlight = false;
  }
}

// 새 비디오 프레임에서만 추론(중복 추론 방지). hands()/landmarks() 어느 쪽이
// 먼저 불려도 프레임당 1회만 돈다. 워커 모드: 프레임을 넘기고 즉시 반환(결과는 메시지로
// 캐시에 반영, 한 프레임만 진행 중). 메인 폴백: 동기 detectForVideo, 예외는 직전 결과 유지.
function detect() {
  if (!active() || vid.readyState < 2) return;
  const nowMs = performance.now();
  if (vid.currentTime === lastVT) {
    // 프레임 정지(트랙 종료·뮤트·점유): 오래되면 손 결과를 비워 소비자가 소실을 감지하게 한다
    if (lmarks.length && isStale(nowMs, lastAdvanceMs)) { lmarks = []; last = { n: 0, x: last.x, y: last.y }; }
    return;
  }
  lastVT = vid.currentTime; lastAdvanceMs = nowMs;
  if (worker) {
    if (inFlight) {
      if (nowMs - inFlightSince > INFLIGHT_WATCHDOG_MS) {         // 워커 행 회복
        inFlight = false;
        if (!detect.hung) { detect.hung = true; console.warn("[cam] 워커 응답 지연 — 프레임 재전송"); }
      } else return;                                              // 한 프레임만 진행 중(백프레셔)
    }
    inFlight = true; inFlightSince = nowMs;
    sendFrame(nowMs);                                             // 비동기 — detect()는 동기 유지
    return;
  }
  let res;
  try { res = landmarker.detectForVideo(vid, nowMs); }
  catch (e) { if (!detect.warned) { detect.warned = true; console.warn("손 탐지 실패 — 직전 결과 유지", e); } return; }
  ({ lmarks, last } = applyLandmarks(res.landmarks, last));
}

// 현재 비디오 프레임을 워커로 이전(transfer). VideoFrame 우선, 없으면 createImageBitmap.
async function sendFrame(ts) {
  const w = worker, v = vid;
  try {
    let frame;
    if (typeof VideoFrame !== "undefined") { try { frame = new VideoFrame(v); } catch (_) {} }
    if (!frame) frame = await createImageBitmap(v);
    if (worker !== w) { try { frame.close(); } catch (_) {} return; }   // 대기 중 stop()됨
    const msg = { type: "frame", frame, ts };
    if (seamOn && typeof window !== "undefined") msg.fake = window.__FAKE_HANDS__ || { n: 0, x: 0.5, y: 0.5 };
    w.postMessage(msg, [frame]);
  } catch (e) {
    inFlight = false;
    if (!sendFrame.warned) { sendFrame.warned = true; console.warn("[cam] 프레임 전송 실패", e); }
  }
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
  if (worker) { try { worker.terminate(); } catch (_) {} }  // 워커 종료(진행 중 프레임도 함께 폐기)
  stream = null; vid = null; landmarker = null; worker = null; inFlight = false; seamOn = false;
  lastVT = -1; lastAdvanceMs = 0; lmarks = []; last = { n: 0, x: 0.5, y: 0.5 };
  info = { mode: null, delegate: null, p50: null, renderer: null };
}
