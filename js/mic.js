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
let gen = 0; // stop()·재요청마다 증가 — 대기 중 request()의 늦은 완료 무효화

export function active() { return !!stream; }

export async function request() {
  if (stream) {                               // 재클릭: suspended 복구만
    if (actx && actx.state === "suspended") await actx.resume();
    return true;
  }
  const my = ++gen;                           // 동시 중복 요청도 이전 것을 무효화
  let s = null, ac = null;
  try {
    // 숨소리("후—")가 지워지지 않도록 브라우저 잡음 억제를 끈다
    s = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: false, echoCancellation: false },
    });
    if (my !== gen) throw new Error("stale"); // 대기 중 stop()/재요청됨 — 폐기
    ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") await ac.resume();
    if (my !== gen) throw new Error("stale");
    const an = ac.createAnalyser();
    an.fftSize = 1024;
    buf = new Float32Array(an.fftSize);
    ac.createMediaStreamSource(s).connect(an);
    actx = ac; analyser = an; stream = s;
    state = makeLevelState();
    lastT = performance.now();
    return true;
  } catch (e) {
    if (s) for (const t of s.getTracks()) t.stop(); // 늦은 완료·중간 실패 시 트랙 정리
    if (ac) ac.close().catch(() => {});
    if (e.message !== "stale") console.warn("마이크 사용 불가", e);
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
  gen++; // 대기 중인 request()의 늦은 완료를 무효화
  if (stream) for (const t of stream.getTracks()) t.stop(); // 마이크 표시등 끄기
  stream = null; analyser = null; buf = null;
  if (actx) { actx.close().catch(() => {}); actx = null; }
}
