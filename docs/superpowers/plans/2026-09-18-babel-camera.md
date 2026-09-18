# 10번 바벨탑 카메라 손 제스처 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 10번 바벨탑을 카메라 손 제스처로 조종한다 — 한 손이 가리키는 곳에 벽돌을 쌓고, 두 손을 0.8초 유지하면 그 지점 위를 무너뜨린다. 클릭은 폴백 유지.

**Architecture:** 09번 마이크 선례의 확장. 셸 소유 서비스 `js/cam.js`(getUserMedia + MediaPipe HandLandmarker CDN 동적 로드, 세대 가드)를 신설하고, 뷰어에 📷 버튼(`work.cam` 플래그), 작품 opts에 `cam: { active, hands, video, landmarks }` getter 묶음을 추가한다. 10번 피스는 순수 제스처 상태 기계(`gestureStep`)로 판정하고 기존 `placeNear`/`collapseAt`을 재사용한다. E2E는 CDN 주입 시임(`window.__CAM_CDN__`)으로 가짜 MediaPipe를 흘려 검증한다.

**Tech Stack:** 순수 ES 모듈(빌드 없음), MediaPipe tasks-vision 0.10.14(CDN, request() 내 동적 import만), Canvas 2D, node:test, Playwright MCP.

**Spec:** `docs/superpowers/specs/2026-09-18-babel-camera-design.md`

## Global Constraints

- MediaPipe는 `request()` 안의 **동적 `import()`만** — 모듈 레벨 정적 import 금지. 버튼 클릭 전 다운로드 0바이트, 모든 js 모듈은 node에서 import-safe 유지.
- 주석·문구는 한국어, 기존 파일의 주석 밀도·스타일을 따른다.
- 기존 클릭/길게 누름 인터랙션, 다른 15개 작품, 셸의 기존 규약(mic 포함) 무변경.
- CDN·권한·모델 로드 실패 시에도 작품은 클릭 폴백으로 정상 동작해야 한다.
- 테스트는 `node --test test/` 통과. 새 순수 로직(제스처 상태 기계)만 단위 테스트, 캔버스 렌더는 시각 검증.
- 영상은 로컬 추론 전용 — 녹화·전송·저장 금지. `stop()`은 반드시 트랙을 정지(카메라 표시등 소등).
- 커밋 메시지는 기존 스타일(`feat:`/`fix:` + 한국어 요약).
- 로컬 서버 8090+ (8080은 무관한 Flask 앱 점유). 시각 검증은 캐시 없는 새 포트.

---

### Task 1: 10번 피스 — 순수 제스처 상태 기계 (TDD)

**Files:**
- Modify: `js/pieces/10-tower-of-babel.js` (상단 상수부에 export 추가)
- Test: `test/babel-gesture.test.mjs` (신규)

**Interfaces:**
- Produces: `BUILD_INTERVAL=0.3`, `COLLAPSE_HOLD=0.8`, `COLLAPSE_COOL=3`, `N_GRACE=0.25`, `makeGesture(): {n,graceT,holdT,coolT,buildT}`, `gestureStep(g, n, dt): {build:boolean, collapse:boolean}` — Task 5가 tick에서 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/babel-gesture.test.mjs`:

```js
// test/babel-gesture.test.mjs — 10번 카메라 제스처 상태 기계(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILD_INTERVAL, COLLAPSE_HOLD, COLLAPSE_COOL, N_GRACE, makeGesture, gestureStep }
  from "../js/pieces/10-tower-of-babel.js";

// n을 유지한 채 sec초 동안 60fps로 돌리고 발화 횟수를 센다
const run = (g, n, sec, dt = 1 / 60) => {
  let builds = 0, collapses = 0;
  for (let t = 0; t < sec - 1e-9; t += dt) {
    const o = gestureStep(g, n, dt);
    if (o.build) builds++;
    if (o.collapse) collapses++;
  }
  return { builds, collapses };
};

test("한 손 유지: BUILD_INTERVAL마다 쌓기 발화", () => {
  const g = makeGesture();
  const r = run(g, 1, 2); // 유예(0.25s) 이후 약 (2-0.25)/0.3 ≈ 5~6회
  assert.ok(r.builds >= 4 && r.builds <= 7, `builds=${r.builds}`);
  assert.equal(r.collapses, 0);
});

test("두 손 유지: COLLAPSE_HOLD 후 붕괴 1회 발화", () => {
  const g = makeGesture();
  const r = run(g, 2, N_GRACE + COLLAPSE_HOLD + 0.2);
  assert.equal(r.collapses, 1);
  assert.equal(r.builds, 0);
});

test("붕괴 직후 쿨다운: COLLAPSE_COOL 동안 재발화 금지, 소진 후 재발화", () => {
  const g = makeGesture();
  run(g, 2, N_GRACE + COLLAPSE_HOLD + 0.05);          // 1회 발화시킴
  const r2 = run(g, 2, 2);                             // 쿨다운(3s) 내 — 금지
  assert.equal(r2.collapses, 0);
  const r3 = run(g, 2, 2.5);                           // 잔여 쿨다운 1s 소진 + 유지 0.8s → 재발화
  assert.equal(r3.collapses, 1);
});

test("짧은 깜빡임(유예 미만)은 손 개수 전환을 일으키지 않는다", () => {
  const g = makeGesture();
  run(g, 1, 1);                                        // 한 손 정착
  run(g, 2, 0.1);                                      // 0.1s 깜빡 — N_GRACE 미만
  assert.equal(g.n, 1);                                // 여전히 한 손 모드
  const r = run(g, 1, 0.35);
  assert.ok(r.builds >= 1, "쌓기 지속");
});

test("손 없음(n=0)은 아무것도 발화하지 않는다", () => {
  const g = makeGesture();
  const r = run(g, 0, 3);
  assert.equal(r.builds + r.collapses, 0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/babel-gesture.test.mjs`
Expected: FAIL — `makeGesture` export 없음

- [ ] **Step 3: 구현 — 10번 파일 상단 상수부(`const rand = ...` 위)에 추가**

```js
// ---- 카메라 제스처 상태 기계 (순수, node:test 대상) ----
// 한 손: BUILD_INTERVAL마다 쌓기 발화 / 두 손: COLLAPSE_HOLD 유지 시 붕괴 1회
// 발화 후 COLLAPSE_COOL 쿨다운. 손 개수 변화는 N_GRACE 유예로 프레임 드랍 흡수.
export const BUILD_INTERVAL = 0.3;
export const COLLAPSE_HOLD = 0.8;
export const COLLAPSE_COOL = 3;
export const N_GRACE = 0.25;

export function makeGesture() {
  return { n: 0, graceT: 0, holdT: 0, coolT: 0, buildT: 0 };
}

export function gestureStep(g, n, dt) {
  const out = { build: false, collapse: false };
  g.coolT = Math.max(0, g.coolT - dt);
  if (n !== g.n) {
    g.graceT += dt;                       // 다른 값이 유예 이상 지속돼야 전환
    if (g.graceT >= N_GRACE) { g.n = n; g.graceT = 0; g.holdT = 0; g.buildT = 0; }
  } else {
    g.graceT = 0;
  }
  if (g.n === 1) {
    g.buildT += dt;
    if (g.buildT >= BUILD_INTERVAL) { g.buildT = 0; out.build = true; }
  } else if (g.n === 2 && g.coolT <= 0) {
    g.holdT += dt;
    if (g.holdT >= COLLAPSE_HOLD) { g.holdT = 0; g.coolT = COLLAPSE_COOL; out.collapse = true; }
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/babel-gesture.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: 전체 테스트 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS (기존 20 + 신규 5 = 25)

```bash
git add js/pieces/10-tower-of-babel.js test/babel-gesture.test.mjs
git commit -m "feat: 10번 카메라 제스처 상태 기계(한 손 쌓기·두 손 붕괴) 순수 로직 + 테스트"
```

---

### Task 2: js/cam.js — 공용 카메라·손 추적 서비스

**Files:**
- Create: `js/cam.js`

**Interfaces:**
- Produces: `request(): Promise<boolean>`, `active(): boolean`, `hands(): {n:0|1|2, x:number, y:number}` (0..1 정규화, x는 거울 보정), `landmarks(): Array`, `video(): HTMLVideoElement|null`, `stop(): void` — Task 4(main.js)와 Task 5(피스)가 소비.
- E2E 시임: `window.__CAM_CDN__`이 있으면 CDN 대신 그 경로에서 `vision_bundle.mjs`를 import — Task 6이 사용.

- [ ] **Step 1: 구현**

`js/cam.js`:

```js
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
```

- [ ] **Step 2: 문법·import-safe 확인**

Run: `node --check js/cam.js && node -e "import('./js/cam.js').then(m => console.log('import-safe:', typeof m.request, typeof m.hands, m.active()))"`
Expected: `import-safe: function function false` (모듈 레벨에서 브라우저 API 미참조 증명)

- [ ] **Step 3: 전체 테스트 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS (25)

```bash
git add js/cam.js
git commit -m "feat: 공용 카메라·손 추적 서비스 cam.js — MediaPipe 동적 로드 + 세대 가드"
```

---

### Task 3: data.js — 10번 cam 플래그·힌트·note

**Files:**
- Modify: `js/data.js` (10번 항목, 79-85행 부근)
- Test: `test/data.test.mjs` (검증 1건 추가)

**Interfaces:**
- Produces: `WORKS[9].cam === true` — Task 4의 버튼 노출 조건.

- [ ] **Step 1: 실패하는 테스트 추가 — `test/data.test.mjs` 끝에**

```js
test("cam 플래그는 boolean이며 현재는 10번에만 있다", () => {
  for (const w of WORKS) {
    if ("cam" in w) assert.equal(typeof w.cam, "boolean", `${w.no}.cam 타입`);
  }
  assert.deepEqual(WORKS.filter(w => w.cam).map(w => w.no), ["10"]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/data.test.mjs`
Expected: FAIL — `deepEqual [] ["10"]`

- [ ] **Step 3: data.js 10번 항목 수정**

note 끝에 카메라 문장 추가 + hint 교체 + `cam: true` 추가:

```js
    note: "브뤼헐의 바벨탑은 완성되지 못할 것을 알면서도 쌓아 올려진다. 벽돌은 저절로 한 장씩 놓이고, 당신은 클릭으로 건설을 거들 수도, 길게 눌러 무너뜨릴 수도 있다. 무너진 자리에서도 건설은 계속된다 — 인간의 끝없는 오만과 열망. 카메라 앞에 한 손을 들면 탑이 자라고, 두 손을 들면 무너진다.",
    hint: "📷를 켜고 한 손으로 쌓고 두 손으로 무너뜨리세요 · 클릭으로도 가능합니다",
    cam: true,
```

- [ ] **Step 4: 통과 확인 후 커밋**

Run: `node --test test/data.test.mjs`
Expected: PASS

```bash
git add js/data.js test/data.test.mjs
git commit -m "feat: 10번 cam 플래그 + 카메라 안내 힌트·note 정합화"
```

---

### Task 4: 뷰어 📷 버튼 — index.html + css + main.js 배선

**Files:**
- Modify: `index.html` (`#v-mic` 버튼 다음 줄)
- Modify: `css/style.css` (`.viewer__mic` 규칙 3개의 셀렉터 확장)
- Modify: `js/main.js` (import, 버튼 로직, openWork 노출 제어, opts 확장, closeWork)

**Interfaces:**
- Consumes: Task 2의 `request/active/hands/video/landmarks/stop`, Task 3의 `work.cam`.
- Produces: 작품 opts에 `cam: { active: () => boolean, hands: () => {n,x,y}, video: () => HTMLVideoElement|null, landmarks: () => Array }` — Task 5가 소비.

- [ ] **Step 1: index.html — `#v-mic` 버튼 바로 다음 줄에 추가**

```html
        <button class="viewer__cam" id="v-cam" hidden aria-pressed="false">📷 손으로 조종하기</button>
```

- [ ] **Step 2: css/style.css — 기존 `.viewer__mic` 규칙 3개의 셀렉터에 `.viewer__cam` 추가**

```css
.viewer__mic, .viewer__cam {
  margin-top: 10px; padding: 7px 14px; font: inherit; font-size: 12px;
  color: var(--accent); background: transparent;
  border: 1px solid var(--accent); border-radius: 999px; cursor: pointer;
}
.viewer__mic[aria-pressed="true"], .viewer__cam[aria-pressed="true"] { color: #14141a; background: var(--accent); }
.viewer__mic:disabled, .viewer__cam:disabled { opacity: 0.45; cursor: default; }
```

- [ ] **Step 3: main.js 배선**

(a) 상단 import (`import * as mic from "./mic.js";` 아래):

```js
import * as cam from "./cam.js";
```

(b) 마이크 블록 아래에 카메라 버튼 로직:

```js
// ---------- 카메라 (cam: true 작품에서만 버튼 노출) ----------
const camBtn = $("#v-cam");
const CAM_LABEL = "📷 손으로 조종하기";
function resetCamBtn() {
  camBtn.setAttribute("aria-pressed", "false");
  camBtn.disabled = false;
  camBtn.textContent = CAM_LABEL;
}
let camReqSeq = 0; // 대기 중인 권한·모델 로드의 늦은 완료 무효화용
camBtn.addEventListener("click", async () => {
  if (cam.active()) { cam.stop(); resetCamBtn(); return; } // 토글 오프
  const my = ++camReqSeq;
  camBtn.disabled = true;
  camBtn.textContent = "📷 카메라 준비 중…";               // 모델 ~10MB 로드 피드백
  const ok = await cam.request();
  if (my !== camReqSeq) return; // 대기 중 뷰어 닫힘/전환 — cam.js가 자원 정리함
  camBtn.disabled = false;
  if (ok) {
    camBtn.setAttribute("aria-pressed", "true");
    camBtn.textContent = "📷 한 손 쌓기 · 두 손 붕괴";
  } else {
    camBtn.disabled = true; // 권한 거부/미지원/CDN 실패: 클릭 폴백 안내
    camBtn.textContent = "카메라를 사용할 수 없어요 — 클릭으로 체험하세요";
  }
});
```

(c) `openWork` 안 `micBtn.hidden = !work.mic;` 다음 줄:

```js
  camBtn.hidden = !work.cam;
```

(d) `piece.init` 호출의 opts 확장 — 기존 `audio:` 인자 뒤에 `cam:` 추가:

```js
    piece.init({ canvas, ctx, width: w, height: h,
                 assets: { target }, reducedMotion,
                 audio: { enabled: () => soundOn,
                          mic: { active: () => mic.active(), level: () => mic.level() } },
                 cam: { active: () => cam.active(), hands: () => cam.hands(),
                        video: () => cam.video(), landmarks: () => cam.landmarks() } });
```

(e) `closeWork` 안 `mic.stop(); resetMicBtn(); micBtn.hidden = true;` 다음 줄:

```js
  camReqSeq++; cam.stop(); resetCamBtn(); camBtn.hidden = true;
```

- [ ] **Step 4: 문법·서빙 스모크**

Run: `node --check js/main.js && curl -s http://127.0.0.1:8090/ | grep -c v-cam`
Expected: `1` (서버가 없으면 `python3 -m http.server 8090 --bind 127.0.0.1 -d /home/ec2-user/media-art2` 백그라운드 기동 후)

- [ ] **Step 5: 전체 테스트 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS

```bash
git add index.html css/style.css js/main.js
git commit -m "feat: 뷰어 카메라 버튼과 cam 서비스 배선 — opts.cam 규약 추가"
```

---

### Task 5: 10번 피스 — 카메라 소비 (조준·커서·코너 미러)

**Files:**
- Modify: `js/pieces/10-tower-of-babel.js`

**Interfaces:**
- Consumes: `opts.cam.{active,hands,video,landmarks}` (Task 4), Task 1의 `makeGesture`/`gestureStep`.

- [ ] **Step 1: 모듈 상태 추가 (`let buildTimer = ...` 행 아래)**

```js
let cam = null, gest = null, handPt = { x: 0, y: 0, n: 0 }; // 카메라 제스처 입력
```

- [ ] **Step 2: init에서 보관·초기화 (`initClouds();` 직전)**

```js
    cam = opts.cam || null;
    gest = makeGesture();
    handPt = { x: 0, y: 0, n: 0 };
```

- [ ] **Step 3: update()의 입력 처리 — 기존 클릭 처리 블록 뒤(`buildTimer += dt;` 직전)에 추가**

```js
  // 카메라 제스처: 한 손=조준 지점에 쌓기 / 두 손=유지 시 그 위 붕괴 (클릭과 병행)
  if (cam && cam.active()) {
    const h = cam.hands();
    handPt = { x: h.x * W, y: h.y * H, n: h.n };
    const act = gestureStep(gest, h.n, dt);
    if (act.build) {
      const c = 3 + (Math.random() * 3 | 0);             // 클릭과 동일한 3~5개
      for (let k = 0; k < c; k++) placeNear(handPt.x + rand(-8, 8), handPt.y + rand(-6, 6));
    }
    if (act.collapse) collapseAt(handPt.y);
  } else {
    handPt.n = 0;
  }
```

- [ ] **Step 4: 렌더 함수 2개 추가 (`drawTower` 함수 뒤)**

```js
// --- 캔버스 손 커서: 한 손=호박색, 두 손=붉은색 + 유지 진행 링 ---
function drawHandCursors() {
  if (!cam || !cam.active()) return;
  const L = cam.landmarks();
  if (!L.length) return;
  const two = L.length >= 2;
  const col = two ? "rgba(255,90,70," : "rgba(255,190,90,";
  const r = Math.min(W, H) * 0.02;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < Math.min(2, L.length); i++) {
    const p = L[i][9];                                   // 손바닥 중심 근사
    const x = (1 - p.x) * W, y = p.y * H;                // 거울 보정
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    g.addColorStop(0, col + "0.85)");
    g.addColorStop(1, col + "0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 6.283); ctx.fill();
    if (two && i === 0 && gest.coolT <= 0 && gest.holdT > 0) { // 붕괴 유지 진행 링
      ctx.strokeStyle = col + "0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.4, -Math.PI / 2,
        -Math.PI / 2 + 6.283 * Math.min(1, gest.holdT / COLLAPSE_HOLD));
      ctx.stroke();
    }
  }
  ctx.restore();
}

// --- 코너 카메라 미러: 우하단 좌우반전 프리뷰 + 손 랜드마크 오버레이 ---
function drawCamMirror() {
  if (!cam || !cam.active()) return;
  const v = cam.video();
  if (!v || v.readyState < 2) return;
  const mw = Math.min(200, W * 0.18);
  const mh = mw * ((v.videoHeight / v.videoWidth) || 0.75);
  const mx = W - mw - 12, my = H - mh - 12;
  ctx.save();
  ctx.translate(mx + mw, my); ctx.scale(-1, 1);          // 좌우반전 미러
  ctx.globalAlpha = 0.92;
  ctx.drawImage(v, 0, 0, mw, mh);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "rgba(255,210,63,0.9)";                // 랜드마크 점
  for (const hand of cam.landmarks()) {
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(mx + (1 - p.x) * mw, my + p.y * mh, 1.5, 0, 6.283);
      ctx.fill();
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, mw, mh);
  ctx.restore();
}
```

- [ ] **Step 5: tick·dispose 갱신**

tick을 다음으로 교체:

```js
  tick(dt, ptr) { update(dt, ptr); drawSky(); drawTower(); drawHandCursors(); drawCamMirror(); },
```

dispose에 `cam = null; gest = null;` 추가:

```js
  dispose() { ctx = null; tiers = []; blocks = []; debris = []; dust = []; clouds = []; cam = null; gest = null; },
```

- [ ] **Step 6: 문법·전체 테스트 후 커밋**

Run: `node --check js/pieces/10-tower-of-babel.js && node --test test/`
Expected: 전체 PASS (integrity 테스트가 모듈 import-safe도 검증)

```bash
git add js/pieces/10-tower-of-babel.js
git commit -m "feat: 10번 카메라 소비 — 손 조준 쌓기/붕괴, 캔버스 커서, 코너 미러"
```

---

### Task 6: E2E — 가짜 MediaPipe 픽스처 + Playwright 시각 검증

**Files:**
- Create: `test/fixtures/fake-vision/vision_bundle.mjs` (E2E 전용, 배포 대상 아님)

**Interfaces:**
- Consumes: Task 2의 `window.__CAM_CDN__` 시임, Task 1~5 전체.

- [ ] **Step 1: 가짜 vision 번들 작성**

`test/fixtures/fake-vision/vision_bundle.mjs`:

```js
// test/fixtures/fake-vision/vision_bundle.mjs — E2E용 가짜 MediaPipe.
// cam.js가 window.__CAM_CDN__ 시임으로 이 번들을 로드하면, 테스트가
// window.__FAKE_HANDS__ = { n, x, y } (x,y는 화면 기준 0..1)로 손을 연출한다.
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export class HandLandmarker {
  static async createFromOptions() { return new HandLandmarker(); }
  detectForVideo() {
    const s = (typeof window !== "undefined" && window.__FAKE_HANDS__) || { n: 0, x: 0.5, y: 0.5 };
    const mk = (x, y) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
    const landmarks = [];
    if (s.n >= 1) landmarks.push(mk(1 - s.x, s.y));      // cam.js가 1-x 반전하므로 역반전 주입
    if (s.n >= 2) landmarks.push(mk(Math.max(0, 1 - s.x - 0.2), s.y));
    return { landmarks };
  }
  close() {}
}
```

- [ ] **Step 2: 캐시 없는 새 포트로 서빙 + 10번 진입**

`python3 -m http.server 8094 --bind 127.0.0.1 -d /home/ec2-user/media-art2` (백그라운드) → Playwright로 `http://127.0.0.1:8094/` 접속.

**버튼 클릭 전** 페이지 컨텍스트에서 시임 설치:

```js
() => {
  window.__CAM_CDN__ = "/test/fixtures/fake-vision";
  window.__FAKE_HANDS__ = { n: 0, x: 0.5, y: 0.5 };
  const c = document.createElement("canvas"); c.width = 640; c.height = 480;
  const g = c.getContext("2d");
  setInterval(() => {                                    // 프레임 갱신(currentTime 전진용)
    g.fillStyle = "#3a3f44"; g.fillRect(0, 0, 640, 480);
    g.fillStyle = "#888"; g.fillRect((performance.now() / 10) % 640, 200, 40, 80);
  }, 50);
  navigator.mediaDevices.getUserMedia = async () => c.captureStream(20);
  return "cam seams ready";
}
```

그 후 `button[data-no="10"]` 클릭 → `#v-cam` 보임 확인(다른 작품에선 hidden) → `#v-cam` 클릭 → 라벨 "📷 한 손 쌓기 · 두 손 붕괴" + aria-pressed=true 확인.

- [ ] **Step 3: 한 손 쌓기 검증 (정량)**

탑 최상단 벽돌 y를 측정하는 헬퍼(캔버스 중앙 열에서 BRICK 색역 스캔) 실행 → `window.__FAKE_HANDS__ = { n: 1, x: 0.5, y: 0.3 }` 설정 → 4초 대기 → 재측정. Expected: 최상단 y가 유의미하게 상승(탑이 자람 — 4초면 쌓기 발화 ~13회 × 3~5개). 코너 미러(우하단)와 호박색 커서 존재를 스크린샷으로 확인.

- [ ] **Step 4: 두 손 붕괴 검증 (정량)**

`window.__FAKE_HANDS__ = { n: 2, x: 0.5, y: 0.25 }` 설정 → 1.5초 대기(유예 0.25 + 유지 0.8 + 여유) → 탑 최상단 y 재측정. Expected: 최상단 y가 하락(상부 붕괴) + 파편·먼지 렌더 스크린샷. 이어서 2초 내 재붕괴가 없는지(쿨다운) 확인: n=2 유지한 채 2초 후 측정 → 추가 하락 없음(자동 건설분 제외 오차 허용).

- [ ] **Step 5: 정리 동작·폴백·콘솔 확인**

1. `#v-cam` 재클릭(토글 오프) → 라벨 원복, 미러 사라짐.
2. 뷰어 닫기 → 재진입: 버튼 초기 상태. `.viewer__nav--next`로 11번 이동 → 버튼 hidden.
3. `window.__CAM_CDN__ = "/nonexistent"`로 재시도 → 버튼이 "카메라를 사용할 수 없어요 — 클릭으로 체험하세요" + disabled, **클릭 쌓기는 여전히 동작**(캔버스 클릭 → 벽돌 증가).
4. 콘솔 오류 0건 (폴백 시나리오의 의도된 console.warn 1건은 허용).

- [ ] **Step 6: 마무리**

Run: `node --test test/`
Expected: 전체 PASS

```bash
git add test/fixtures/fake-vision/vision_bundle.mjs
git commit -m "test: E2E용 가짜 MediaPipe 번들 — __CAM_CDN__ 시임으로 손 제스처 연출"
```

실제 카메라·실제 MediaPipe 검증은 배포 전 로컬(HTTPS/localhost)에서 수동 1회 — 스펙 명시.
