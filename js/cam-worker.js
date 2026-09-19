// js/cam-worker.js — 손 추적 추론 전용 워커(클래식). 메인 스레드는 프레임만 넘기고
// 결과를 캐시하므로 렌더 루프가 추론 시간에 멈추지 않는다. 브라우저 전용(테스트 미import).
// 클래식 Worker인 이유: tasks-vision 0.10.14의 wasm 로더가 importScripts를 쓰므로
// 모듈 워커({type:"module"})에서는 로드가 실패한다. 동적 import()는 클래식 워커에서도 허용.
// 영상 프레임은 이 워커 안에서만 소비되고 저장·전송하지 않는다.
let vision = null, landmarker = null, delegate = null, numHands = 2, model = "", fileset = null;
let prevTs = -1;
const SW_RENDERER = /SwiftShader|llvmpipe|Software|Basic Render/i;
const GPU_SLOW_MS = 40;   // GPU 델리게이트 벤치 p50이 이보다 크면 CPU로

function rendererName() {
  try {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
  } catch (_) { return "unknown"; }
}

async function create(d) {
  const lm = await vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: model, delegate: d },
    runningMode: "VIDEO", numHands,
  });
  return lm;
}

// 빈 640×480 프레임으로 워밍업 1회 + 6회 벤치 → p50(ms)
async function bench(lm) {
  const c = new OffscreenCanvas(640, 480);
  c.getContext("2d").fillRect(0, 0, 640, 480);
  const frame = await createImageBitmap(c);
  let ts = performance.now();
  lm.detectForVideo(frame, ts); // 워밍업
  const t = [];
  for (let i = 0; i < 6; i++) {
    ts = Math.max(ts + 1, performance.now());
    const a = performance.now(); lm.detectForVideo(frame, ts); t.push(performance.now() - a);
  }
  frame.close();
  t.sort((x, y) => x - y);
  return t[Math.floor(t.length / 2)];
}

async function init(m) {
  model = m.model; numHands = m.numHands === 1 ? 1 : 2;
  vision = await import(`${m.base}/vision_bundle.mjs`);
  fileset = await vision.FilesetResolver.forVisionTasks(`${m.base}/wasm`);
  const renderer = rendererName();
  let p50 = null;
  // 소프트웨어 GL(SwiftShader·llvmpipe 등)에서는 GPU 델리게이트가 CPU보다 느릴 뿐 아니라
  // 생성+워밍업만 수 초(부하 시 13초 측정)라 ready 타임아웃을 넘길 수 있다 → GPU 시도 자체를 건너뛴다.
  // 그 외 환경은 GPU를 벤치해 p50이 느리면(>GPU_SLOW_MS) CPU로, 생성·벤치 예외도 CPU로.
  if (!SW_RENDERER.test(renderer)) {
    try {
      landmarker = await create("GPU"); delegate = "GPU";
      p50 = await bench(landmarker);
      if (p50 > GPU_SLOW_MS) { try { landmarker.close(); } catch (_) {} landmarker = null; }
    } catch (_) {
      if (landmarker) { try { landmarker.close(); } catch (_) {} }  // GPU 생성 후 벤치 실패 시 누수 방지
      landmarker = null;
    }
  }
  if (!landmarker) { landmarker = await create("CPU"); delegate = "CPU"; p50 = await bench(landmarker); }
  prevTs = -1;
  self.postMessage({ type: "ready", delegate, p50: Math.round(p50), renderer });
}

async function onFrame(m) {
  if (m.fake !== undefined) globalThis.__FAKE_HANDS__ = m.fake;   // E2E 시임(가짜 번들이 읽음)
  const ts = Math.max(prevTs + 1, m.ts); prevTs = ts;              // MediaPipe 단조 타임스탬프 요구
  const a = performance.now();
  let landmarks = [];
  try {
    const res = landmarker.detectForVideo(m.frame, ts);
    landmarks = res.landmarks || [];
  } catch (e) {
    if (/timestamp/i.test(String(e && e.message))) {                // 타임스탬프 오류는 인스턴스가 망가짐 → 재생성
      try { landmarker.close(); } catch (_) {}
      landmarker = await create(delegate); prevTs = -1;
    }
  } finally {
    try { m.frame.close(); } catch (_) {}
  }
  self.postMessage({ type: "result", landmarks, ts: m.ts, ms: performance.now() - a });
}

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === "init") await init(m);
    else if (m.type === "frame") { if (landmarker) await onFrame(m); else { try { m.frame.close(); } catch (_) {} } }
  } catch (e) {
    self.postMessage({ type: "fail", msg: String(e && e.message || e) });
  }
};
