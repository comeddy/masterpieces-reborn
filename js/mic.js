// js/mic.js — 공용 마이크 입력 서비스. 셸(main.js)이 수명을 소유하고,
// 작품은 opts.audio.mic 경유로 active()/level()만 폴링한다.
// 순수 계산부(normalizeLevel)는 node:test 검증을 위해 분리 export.

// ---- 순수 계산부: 노이즈 플로어 추적 + attack/release 스무딩 ----
const FLOOR_RISE = 0.10;  // 플로어 상승 속도(1/s) — 지속 소음을 천천히 흡수
const FLOOR_FALL = 1.2;   // 플로어 하강 속도 — 조용해지면 비교적 빠르게 복귀
const ATTACK = 18;        // 레벨 상승 반응(1/s) — 즉각적
const RELEASE = 1.6;      // 레벨 하강 반응 — 여운을 남김
const GAIN = 6;           // 플로어 제거 후 증폭

export function makeLevelState() { return { floor: 0.04, smooth: 0 }; }

export function normalizeLevel(rms, dt, s) {
  const rate = rms < s.floor ? FLOOR_FALL : FLOOR_RISE;
  s.floor += (rms - s.floor) * Math.min(1, rate * dt);
  const raw = Math.min(1, Math.max(0, (rms - s.floor) * GAIN));
  const k = raw > s.smooth ? ATTACK : RELEASE;
  s.smooth += (raw - s.smooth) * Math.min(1, k * dt);
  return s.smooth;
}

// ---- 서비스부 (브라우저 전용 — import 시점엔 브라우저 API 미참조) ----
let actx = null, analyser = null, stream = null, buf = null;
let state = makeLevelState(), lastT = 0;

export function active() { return !!stream; }

export async function request() {
  if (stream) {                               // 재클릭: suspended 복구만
    if (actx && actx.state === "suspended") await actx.resume();
    return true;
  }
  try {
    // 숨소리("후—")가 지워지지 않도록 브라우저 잡음 억제를 끈다
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: false, echoCancellation: false },
    });
    actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") await actx.resume();
    analyser = actx.createAnalyser();
    analyser.fftSize = 1024;
    buf = new Float32Array(analyser.fftSize);
    actx.createMediaStreamSource(s).connect(analyser);
    stream = s;
    state = makeLevelState();
    lastT = performance.now();
    return true;
  } catch (e) {
    console.warn("마이크 사용 불가", e);
    return false;
  }
}

export function level() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  return normalizeLevel(rms, dt, state);
}

export function stop() {
  if (stream) for (const t of stream.getTracks()) t.stop(); // 마이크 표시등 끄기
  stream = null; analyser = null; buf = null;
  if (actx) { actx.close().catch(() => {}); actx = null; }
}
