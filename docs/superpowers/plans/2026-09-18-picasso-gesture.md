# 12번 피카소 「동시의 얼굴」 카메라 손 제스처 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 12번 큐비즘 초상을 카메라 손 제스처로 조종한다 — 카메라 앞에서 손을 좌우로 크게 흔들면 얼굴이 흩어졌다 새 초상으로 재조립되고, 손을 천천히 움직이면 그 위치의 면들이 밀린다. 클릭·드래그는 폴백 유지.

**Architecture:** 09번 마이크 선례의 확장이자 10번 바벨탑 카메라 계획(`docs/superpowers/plans/2026-09-18-babel-camera.md`, `feature/babel-camera` 브랜치)과 공용부를 자구까지 공유한다. 셸 소유 서비스 `js/cam.js`(getUserMedia + MediaPipe HandLandmarker CDN 동적 로드, 세대 가드)와 뷰어 📷 버튼·`opts.cam` getter 묶음은 10번 계획 Task 2·4의 사본이고, 12번 고유분은 순수 손짓 판정 상태 기계(`waveStep` — 좌우 방향 반전 카운트)와 면 밀기 입력원 일반화·손 커서·코너 미러다.

**Tech Stack:** 순수 ES 모듈(빌드 없음), MediaPipe tasks-vision 0.10.14(CDN, request() 내 동적 import만), Canvas 2D, node:test, Playwright MCP.

**Spec:** `docs/superpowers/specs/2026-09-18-picasso-camera-gesture-design.md`

## Global Constraints

- **worktree 격리**: 모든 작업은 절대 경로 `/home/ec2-user/media-art2/.worktrees/picasso-gesture`(브랜치 `feature/picasso-gesture`)에서. 메인 체크아웃에서 `git checkout` 금지 — 다른 세션이 HEAD를 옮긴다. 매 커밋 직후 `git log -1 --format="%h %d"`로 부모가 `feature/picasso-gesture`인지 확인. bare `git stash` 금지(스태시 공유됨).
- **공용부 자구 동일**: `js/cam.js`(Task 2), 셸 배선(Task 4)은 10번 계획서의 코드와 자구까지 동일 — 병합 충돌 시 어느 쪽을 취해도 동작. **유일한 의도적 차이**: 카메라 버튼 성공 라벨은 10번 계획의 "📷 한 손 쌓기 · 두 손 붕괴"(작품 고유 문구 — 두 번째 카메라 작품부터 셸에 있을 수 없음) 대신 범용 "📷 손을 비춰보세요"(10번 스펙 원문). 병합 시 이 한 줄은 범용 쪽을 취한다.
- **선병합 감지**: Task 2·4·6의 파일이 master 병합으로 이미 존재하면(다른 카메라 브랜치 선착) 새로 만들지 말고 `git merge master` 후 기존 구현을 소비한다 — 계약이 같으므로 12번 소비 코드는 무변경.
- MediaPipe는 `request()` 안의 **동적 `import()`만** — 모듈 레벨 정적 import 금지. 버튼 클릭 전 다운로드 0바이트, 모든 js 모듈은 node에서 import-safe 유지.
- 주석·문구는 한국어, 기존 파일의 주석 밀도·스타일을 따른다.
- 기존 탭=재조립·드래그=면 밀기 인터랙션, 다른 15개 작품, 셸의 기존 규약(mic 포함) 무변경.
- CDN·권한·모델 로드 실패 시에도 12번은 클릭·드래그 폴백으로 정상 동작해야 한다.
- 테스트는 `node --test test/` 통과(master 기준 기존 20개 + 신규). 새 순수 로직(waveStep)만 단위 테스트, 캔버스 렌더는 시각 검증.
- data.test.mjs의 cam 플래그 검증은 **타입 단언만**(boolean) — mic처럼 작품 목록을 고정 단언하면 병렬 카메라 브랜치(01·03·10·11)와 병합할 때마다 깨진다.
- 영상은 로컬 추론 전용 — 녹화·전송·저장 금지. `stop()`은 반드시 트랙을 정지(카메라 표시등 소등).
- 커밋 메시지는 기존 스타일(`feat:`/`test:`/`docs:` + 한국어 요약) + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 로컬 서버 8090+ (8080은 무관한 Flask 앱 점유). 시각 검증은 캐시 없는 새 포트(이 계획은 8095).

---

### Task 1: 12번 피스 — 순수 손짓 판정 상태 기계 waveStep (TDD)

**Files:**
- Modify: `js/pieces/12-cubist-faces.js` (유틸부 `mulberry32` 아래에 export 추가)
- Test: `test/picasso-gesture.test.mjs` (신규)

**Interfaces:**
- Produces: `WAVE_WINDOW=1.2`, `WAVE_SWINGS=2`, `WAVE_MIN_VX=0.25`, `WAVE_COOL=1.6`, `HAND_GRACE=0.25`, `makeWave(): {lastX,dir,swings,windowT,coolT,graceT}`, `waveStep(w, x, present, dt): {fire:boolean}` — Task 5가 tick에서 소비. x는 0..1 정규화 손 x좌표(거울 보정 후), present는 손 검출 여부.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/picasso-gesture.test.mjs`:

```js
// test/picasso-gesture.test.mjs — 12번 손짓(좌우 흔들기) 판정 상태 기계 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { WAVE_WINDOW, WAVE_SWINGS, WAVE_MIN_VX, WAVE_COOL, HAND_GRACE, makeWave, waveStep }
  from "../js/pieces/12-cubist-faces.js";

// 60fps로 sec초 동안 x(t)를 흘리고 발화 횟수를 센다. present(t)로 손 검출 연출.
const run = (w, xOf, sec, present = () => true, dt = 1 / 60) => {
  let fires = 0;
  for (let t = 0; t < sec - 1e-9; t += dt) {
    if (waveStep(w, xOf(t), present(t), dt).fire) fires++;
  }
  return fires;
};
// 2Hz·진폭 0.25 사인 흔들기 — 피크 |vx| ≈ 3.1 (WAVE_MIN_VX의 12배)
const wave2hz = (t) => 0.5 + 0.25 * Math.sin(2 * Math.PI * 2 * t);

test("좌우 왕복 흔들기: 반전 2회에 1회 발화, 쿨다운 내 재발화 금지", () => {
  const w = makeWave();
  assert.equal(run(w, wave2hz, 1.5), 1); // 첫 발화 ~0.4s, 쿨다운 1.6s가 잔여 1.1s를 덮음
});

test("쿨다운 소진 후 계속 흔들면 다시 발화한다", () => {
  const w = makeWave();
  assert.equal(run(w, wave2hz, 3.0), 2); // ~0.4s 발화 → 쿨다운 → ~2.0s 이후 재발화
});

test("단방향 스침(반전 없음)은 발화하지 않는다", () => {
  const w = makeWave();
  assert.equal(run(w, (t) => 0.2 + 1.2 * t, 0.5), 0); // vx=+1.2 일정 — 방향 반전 0회
});

test("느린 손(|vx| < WAVE_MIN_VX)은 발화하지 않는다", () => {
  const w = makeWave();
  assert.equal(run(w, (t) => 0.5 + 0.02 * Math.sin(2 * Math.PI * t), 3), 0); // 피크 |vx| ≈ 0.13
});

test("시간창 초과: 낡은 스윙은 무효 — 1.3s 간격의 반전 2회는 발화하지 않는다", () => {
  const w = makeWave();
  assert.equal(run(w, (t) => 0.4 + 0.4 * t, 0.15), 0);  // 오른쪽 이동 — dir 설정
  assert.equal(run(w, (t) => 0.46 - 0.4 * t, 0.15), 0); // 반전 1회 (swings=1)
  assert.equal(run(w, () => 0.4, WAVE_WINDOW + 0.1), 0); // 정지 — 창 초과, 리셋
  assert.equal(run(w, (t) => 0.4 + 0.4 * t, 0.15), 0);  // 다시 오른쪽 — dir 재설정뿐(반전 2회째 아님)
});

test("손 미검출 유예: 짧은 깜빡임은 스윙 상태를 보존, 초과하면 리셋한다", () => {
  const a = makeWave();
  run(a, (t) => 0.4 + 0.4 * t, 0.15);                   // dir 설정
  run(a, (t) => 0.46 - 0.4 * t, 0.15);                  // swings=1
  run(a, () => 0.4, 0.1, () => false);                  // 0.1s 깜빡 — HAND_GRACE 미만
  assert.equal(a.swings, 1, "유예 내: 스윙 보존");
  assert.equal(run(a, (t) => 0.4 + 0.4 * t, 0.15), 1);  // 반전 2회째 → 발화

  const b = makeWave();
  run(b, (t) => 0.4 + 0.4 * t, 0.15);
  run(b, (t) => 0.46 - 0.4 * t, 0.15);                  // swings=1
  run(b, () => 0.4, HAND_GRACE + 0.2, () => false);     // 유예 초과 — 리셋
  assert.equal(b.swings, 0, "유예 초과: 스윙 리셋");
  assert.equal(run(b, (t) => 0.4 + 0.4 * t, 0.15), 0);  // dir 재설정뿐 — 미발화
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/picasso-gesture.test.mjs`
Expected: FAIL — `makeWave` export 없음

- [ ] **Step 3: 구현 — 12번 파일 유틸부(`function mulberry32` 아래)에 추가**

```js
// ---- 카메라 손짓 판정 상태 기계 (순수, node:test 대상) ----
// 손 x좌표(0..1)의 좌우 방향 반전을 세어 "흔들기"를 판정한다. 단방향 스침·
// 몸 전체 이동은 반전이 없어 발화하지 않는다. 발화 후 WAVE_COOL 쿨다운,
// 손 미검출은 HAND_GRACE 유예로 랜드마커 프레임 드랍을 흡수한다.
export const WAVE_WINDOW = 1.2;   // 마지막 스윙 이후 유효 시간창(s)
export const WAVE_SWINGS = 2;     // 발화에 필요한 방향 반전 횟수
export const WAVE_MIN_VX = 0.25;  // 스윙으로 인정하는 최소 |x속도|(정규화폭/s)
export const WAVE_COOL = 1.6;     // 발화 후 쿨다운(s)
export const HAND_GRACE = 0.25;   // 손 미검출 유예(s)

export function makeWave() {
  return { lastX: -1, dir: 0, swings: 0, windowT: 0, coolT: 0, graceT: 0 };
}

export function waveStep(w, x, present, dt) {
  w.coolT = Math.max(0, w.coolT - dt);
  if (!present) {                          // 미검출: 유예 초과 시 스윙 상태 리셋
    w.graceT += dt;
    if (w.graceT >= HAND_GRACE) { w.lastX = -1; w.dir = 0; w.swings = 0; w.windowT = 0; }
    return { fire: false };
  }
  w.graceT = 0;
  if (w.lastX < 0 || dt <= 0) { w.lastX = x; return { fire: false }; }  // 첫 프레임: 기준점만
  const vx = (x - w.lastX) / dt;
  w.lastX = x;
  if (w.dir !== 0) {                       // 제스처 진행 중에만 시간창이 흐른다
    w.windowT += dt;
    if (w.windowT > WAVE_WINDOW) { w.swings = 0; w.dir = 0; w.windowT = 0; }
  }
  if (Math.abs(vx) >= WAVE_MIN_VX) {
    const d = vx > 0 ? 1 : -1;
    if (w.dir === 0) { w.dir = d; w.windowT = 0; }            // 첫 유효 이동: 방향만 설정
    else if (d !== w.dir) { w.dir = d; w.swings++; w.windowT = 0; }  // 반전 = 스윙 1회
  }
  if (w.swings >= WAVE_SWINGS && w.coolT <= 0) {
    w.swings = 0; w.dir = 0; w.coolT = WAVE_COOL;
    return { fire: true };
  }
  return { fire: false };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/picasso-gesture.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 5: 전체 테스트 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS (기존 20 + 신규 6 = 26; master 선병합이 있었으면 그 이상)

```bash
git add js/pieces/12-cubist-faces.js test/picasso-gesture.test.mjs
git commit -m "feat: 12번 손짓 판정 상태 기계(좌우 반전 카운트·쿨다운·유예) 순수 로직 + 테스트

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git log -1 --format="%h %d"   # 부모가 feature/picasso-gesture인지 확인
```

---

### Task 2: js/cam.js — 공용 카메라·손 추적 서비스 (10번 계획 Task 2의 사본)

**Files:**
- Create: `js/cam.js`

**Interfaces:**
- Produces: `request(): Promise<boolean>`, `active(): boolean`, `hands(): {n:0|1|2, x:number, y:number}` (0..1 정규화, x는 거울 보정), `landmarks(): Array`, `video(): HTMLVideoElement|null`, `stop(): void` — Task 4(main.js)와 Task 5(피스)가 소비.
- E2E 시임: `window.__CAM_CDN__`이 있으면 CDN 대신 그 경로에서 `vision_bundle.mjs`를 import — Task 6이 사용.

- [ ] **Step 0: 선병합 확인**

Run: `test -f js/cam.js && echo "이미 존재 — git log --oneline -1 js/cam.js 확인 후 이 Task 전체 건너뜀" || echo "신규 작성"`
이미 존재하면(다른 카메라 브랜치 선착) 내용이 아래와 계약 동일한지만 눈으로 확인하고 Task 3으로.

- [ ] **Step 1: 구현**

`js/cam.js` (10번 계획서와 자구 동일):

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
Expected: 전체 PASS (26)

```bash
git add js/cam.js
git commit -m "feat: 공용 카메라·손 추적 서비스 cam.js — MediaPipe 동적 로드 + 세대 가드

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git log -1 --format="%h %d"   # 부모가 feature/picasso-gesture인지 확인
```

---

### Task 3: data.js — 12번 cam 플래그·힌트·note + cam 타입 테스트

**Files:**
- Modify: `js/data.js:96-98` (12번 항목의 note·hint, cam 플래그 추가)
- Modify: `test/data.test.mjs` (cam 타입 단언 테스트 추가)

**Interfaces:**
- Consumes: 없음.
- Produces: `WORKS`의 12번 항목 `cam === true` — Task 4의 버튼 노출 조건.

- [ ] **Step 1: 12번 항목 수정**

`js/data.js`의 12번 항목에서 note·hint 두 줄을 다음으로 교체하고 `cam: true`를 추가한다
(note는 말미 한 문장 추가, 나머지 원문 유지 — 09번 리뷰의 note↔hint 정합성 원칙):

```js
    note: "피카소는 하나의 얼굴을 여러 시점에서 동시에 보았다. 조각난 면들이 정면과 옆모습을 한 화면에 겹쳐 놓고, 클릭할 때마다 얼굴은 전혀 새로운 구성으로 다시 조립된다 — 매 순간이 단 한 번뿐인 초상. 특정 원작의 복제가 아닌, 큐비즘이라는 발명 자체에 바치는 오마주. 카메라 앞에서 손을 크게 흔들면 초상은 관객의 몸짓에 응답해 새로 태어난다.",
    hint: "📷를 켜고 손을 크게 흔들면 얼굴이 새로 조립됩니다 · 손을 천천히 움직여 면을 밀어보세요 · 클릭·드래그로도 가능합니다",
    cam: true,
```

- [ ] **Step 2: data.test.mjs에 cam 타입 테스트 추가 (mic 테스트 아래)**

작품 목록 고정 단언(`deepEqual([...], ["12"])`)은 **금지** — 카메라 브랜치(01·03·10·11)가
병렬 진행 중이라 병합마다 깨진다. 타입 + 12번 존재만 단언한다:

```js
test("cam 플래그는 boolean이며 12번에 켜져 있다 (다른 작품 추가는 허용)", () => {
  for (const w of WORKS) {
    if ("cam" in w) assert.equal(typeof w.cam, "boolean", `${w.no}.cam 타입`);
  }
  assert.equal(WORKS.find((w) => w.no === "12").cam, true);
});
```

- [ ] **Step 3: 전체 테스트 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS (27)

```bash
git add js/data.js test/data.test.mjs
git commit -m "feat: 12번 cam 플래그·손짓 힌트 — note에 카메라 인터랙션 문장 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git log -1 --format="%h %d"
```

---

### Task 4: 뷰어 📷 버튼 — index.html + css + main.js 배선 (10번 계획 Task 4의 사본)

**Files:**
- Modify: `index.html` (`#v-mic` 버튼 다음 줄)
- Modify: `css/style.css:133-139` (`.viewer__mic` 규칙 3개의 셀렉터 확장)
- Modify: `js/main.js` (import, 버튼 로직, openWork 노출 제어, opts 확장, closeWork)

**Interfaces:**
- Consumes: Task 2의 `request/active/hands/video/landmarks/stop`, Task 3의 `work.cam`.
- Produces: 작품 opts에 `cam: { active: () => boolean, hands: () => {n,x,y}, video: () => HTMLVideoElement|null, landmarks: () => Array }` — Task 5가 소비.

- [ ] **Step 0: 선병합 확인**

Run: `grep -c v-cam index.html js/main.js 2>/dev/null || true`
이미 배선돼 있으면(다른 카메라 브랜치 선착) 성공 라벨이 범용 문구인지만 확인하고 Task 5로.

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

(b) 마이크 블록 아래에 카메라 버튼 로직. **주의**: 성공 라벨은 범용 "📷 손을 비춰보세요" —
10번 계획서의 "📷 한 손 쌓기 · 두 손 붕괴"는 작품 고유 문구라 공용 셸에 둘 수 없다
(작품별 조작법은 각 작품의 hint가 안내). 병합 충돌 시 범용 쪽을 취한다:

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
    camBtn.textContent = "📷 손을 비춰보세요";
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

Run: `node --check js/main.js && curl -s http://127.0.0.1:8095/ | grep -c v-cam`
Expected: `1` (서버가 없으면 `python3 -m http.server 8095 --bind 127.0.0.1 -d /home/ec2-user/media-art2/.worktrees/picasso-gesture` 백그라운드 기동 후 — **worktree 경로 주의**)

- [ ] **Step 5: 전체 테스트 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS (27)

```bash
git add index.html css/style.css js/main.js
git commit -m "feat: 뷰어 카메라 버튼과 cam 서비스 배선 — opts.cam 규약 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git log -1 --format="%h %d"
```

---

### Task 5: 12번 피스 — 카메라 소비 (흔들면 재조립·손 위치 면 밀기·커서·코너 미러)

**Files:**
- Modify: `js/pieces/12-cubist-faces.js`

**Interfaces:**
- Consumes: `opts.cam.{active,hands,video,landmarks}` (Task 4), Task 1의 `makeWave`/`waveStep`.

- [ ] **Step 1: 모듈 상태 추가 (`let pressX = 0, pressY = 0, dragging = false;` 행 아래)**

```js
let cam = null, wav = null, handOn = false, handX = 0, handY = 0; // 카메라 손 입력
```

- [ ] **Step 2: init에서 보관·초기화 (`this.resize(W, H);` 직전)**

```js
    cam = opts.cam || null;
    wav = makeWave();
    handOn = false;
```

- [ ] **Step 3: tick 입력부 — 기존 `if (ptr.justUp) { ... }` 블록 바로 뒤에 추가**

```js
    // ---- 카메라 손짓: 좌우로 크게 흔들면 재조립, 손 위치는 면 밀기 가상 포인터 ----
    handOn = false;
    if (cam && cam.active()) {
      const h = cam.hands();
      if (waveStep(wav, h.x, h.n >= 1, dt).fire && state === "idle") state = "out";
      if (h.n >= 1) { handOn = true; handX = h.x * W; handY = h.y * H; }
    }
```

- [ ] **Step 4: 면 밀기 입력원 일반화 — 기존 드래그 블록 교체**

기존:

```js
    const active = dragging && state === "idle";
    const R = baseS * 0.85;
    for (const f of facets) {
      let tox = 0, toy = 0, trot = 0;
      if (active) {
        const cs = toScreen(f.cx, f.cy), d = Math.hypot(cs[0] - ptr.x, cs[1] - ptr.y);
        if (d < R) {
          const fall = 1 - d / R;
          tox = (cs[0] - ptr.x) / baseS * fall * 0.55;
          toy = (cs[1] - ptr.y) / baseS * fall * 0.55;
          trot = ((cs[0] - ptr.x) >= 0 ? 1 : -1) * fall * 0.5;
        }
      }
      const rate = active ? 12 : 7;   // 놓으면 스프링 안착
```

교체(반경·세기·스프링 파라미터는 드래그와 동일 재사용 — 입력원만 ① 드래그 ② 손 순):

```js
    // ---- 면 밀기: 입력원은 ① 마우스 드래그 ② 카메라 손 (드래그 우선) ----
    const drag = dragging && state === "idle";
    const push = drag || (handOn && state === "idle");
    const pushX = drag ? ptr.x : handX, pushY = drag ? ptr.y : handY;
    const R = baseS * 0.85;
    for (const f of facets) {
      let tox = 0, toy = 0, trot = 0;
      if (push) {
        const cs = toScreen(f.cx, f.cy), d = Math.hypot(cs[0] - pushX, cs[1] - pushY);
        if (d < R) {
          const fall = 1 - d / R;
          tox = (cs[0] - pushX) / baseS * fall * 0.55;
          toy = (cs[1] - pushY) / baseS * fall * 0.55;
          trot = ((cs[0] - pushX) >= 0 ? 1 : -1) * fall * 0.5;
        }
      }
      const rate = push ? 12 : 7;   // 놓으면 스프링 안착
```

(블록 나머지 3행 `f.dox/f.doy/f.drot = approach(...)`는 무변경.)

- [ ] **Step 5: 렌더 함수 2개 추가 (`function rebuild()` 정의 바로 위)**

```js
// --- 손 커서: 팔레트 정합 노랑 글로우 점 — 쿨다운 중엔 옅게(장전 안 됨) ---
function drawHandCursor() {
  if (!handOn) return;
  const r = Math.min(W, H) * 0.02;
  const a = wav.coolT > 0 ? 0.35 : 0.85;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(handX, handY, 0, handX, handY, r * 2.2);
  g.addColorStop(0, `rgba(240,207,107,${a})`);   // YELLOW[1] 계열
  g.addColorStop(1, "rgba(240,207,107,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(handX, handY, r * 2.2, 0, 6.283); ctx.fill();
  ctx.restore();
}

// --- 코너 카메라 미러: 우하단 좌우반전 프리뷰 + 손 랜드마크 오버레이 ---
// (10번 계획 Task 5와 자구 동일 — 카메라 작품 4개+ 시 공용 헬퍼 리팩터 후보)
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

- [ ] **Step 6: tick 렌더 말미·dispose 갱신**

tick 말미의 `if (fa > 0.01) drawFeatures(fa);` 다음 줄에 추가:

```js
    drawHandCursor();
    drawCamMirror();
```

dispose를 다음으로 교체:

```js
  dispose() { ctx = null; head = null; facets = []; feat = null; cam = null; wav = null; },
```

- [ ] **Step 7: 문법·전체 테스트 후 커밋**

Run: `node --check js/pieces/12-cubist-faces.js && node --test test/`
Expected: 전체 PASS (integrity 테스트가 모듈 import-safe도 검증)

```bash
git add js/pieces/12-cubist-faces.js
git commit -m "feat: 12번 카메라 소비 — 손 흔들면 재조립, 손 위치 면 밀기, 커서·코너 미러

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git log -1 --format="%h %d"
```

---

### Task 6: E2E — 가짜 MediaPipe 픽스처 + Playwright 시각 검증

**Files:**
- Create: `test/fixtures/fake-vision/vision_bundle.mjs` (E2E 전용, 배포 대상 아님 — 이미 존재하면 Step 1 건너뜀)

**Interfaces:**
- Consumes: Task 2의 `window.__CAM_CDN__` 시임, Task 1~5 전체.

- [ ] **Step 1: 가짜 vision 번들 작성 (10번 계획 Task 6과 자구 동일)**

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

- [ ] **Step 2: 서빙 + 시임 설치 + 12번 진입**

`python3 -m http.server 8095 --bind 127.0.0.1 -d /home/ec2-user/media-art2/.worktrees/picasso-gesture`
(백그라운드, **worktree 경로**) → Playwright로 `http://127.0.0.1:8095/` 접속.

**버튼 클릭 전** 페이지 컨텍스트에서 시임 설치(browser_evaluate):

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
  // 캔버스 서명: 중앙 영역의 샘플별 RGB 배열 — 합산이 아니라 샘플별 비교
  // (합산은 색 재배치가 상쇄돼 플레이키 — 샘플별 평균 차이가 재조립을 확실히 잡는다)
  window.__SIG__ = () => {
    const cv = document.querySelector("#stage"), cx = cv.getContext("2d");
    const d = cx.getImageData(cv.width * 0.25, cv.height * 0.25, cv.width * 0.5, cv.height * 0.5).data;
    const out = [];
    for (let i = 0; i < d.length; i += 397 * 4) out.push(d[i] + d[i + 1] + d[i + 2]);
    return out;
  };
  // 샘플별 평균 채널 차이율(0..1): 재조립이면 면 색이 뒤섞여 크게 변한다
  window.__SIGDIFF__ = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length / 765;
  };
  return "cam seams ready";
}
```

그 후 `button[data-no="12"]` 클릭 → `#v-cam` 보임 확인(11번 등 다른 작품에선 hidden) →
`#v-cam` 클릭 → 라벨 "📷 손을 비춰보세요" + aria-pressed=true 확인.

- [ ] **Step 3: 손짓 재조립 검증 (정량)**

1. 유휴 2초 대기(호흡 진동 안정) 후 `s0 = __SIG__()` 채집. 1초 더 대기 후 `s1 = __SIG__()`,
   `base = __SIGDIFF__(s0, s1)` — 유휴 변동 기준선(호흡·음영 진동, 대략 0.05 미만 예상).
2. 흔들기 연출(browser_evaluate):

```js
() => {
  const t0 = performance.now();
  window.__WAVE_TIMER__ = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    window.__FAKE_HANDS__ = { n: 1, x: 0.5 + 0.3 * Math.sin(2 * Math.PI * 2 * t), y: 0.5 };
    if (t > 1.2) { clearInterval(window.__WAVE_TIMER__); window.__FAKE_HANDS__ = { n: 0, x: 0.5, y: 0.5 }; }
  }, 16);
  return "waving";
}
```

3. 3초 대기(흩어짐→재조립 완료) → `s2 = __SIG__()`.
   Expected: `__SIGDIFF__(s1, s2) > base * 3` 이며 절대값 0.1 이상(면 색 재배치 — 새 초상).
   중간(흔들기 시작 0.5s 후) 스크린샷 1장: 면들이 흩어지는 순간 포착.

- [ ] **Step 4: 손 위치 면 밀기 검증 (정량 + 시각)**

1. `window.__FAKE_HANDS__ = { n: 1, x: 0.3, y: 0.4 }` 고정(흔들지 않음 — 재조립 미발화 확인 겸).
2. 손 위치 주변 밝기 프로브(browser_evaluate) — 글로우 커서는 "lighter" 합성이라 국소 밝기가 오른다:

```js
() => {
  const cv = document.querySelector("#stage"), cx = cv.getContext("2d");
  const px = cv.width * 0.3, py = cv.height * 0.4;
  const d = cx.getImageData(px - 15, py - 15, 30, 30).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4);
}
```

   손 표시 전/후 각 1회 측정. Expected: 후 > 전 (커서 글로우 존재).
3. 2초 대기 후 스크린샷: (0.3W, 0.4H) 주변 면들이 바깥으로 밀려 벌어진 모습 + 우하단
   코너 미러(랜드마크 점 오버레이) 확인. 캔버스 서명 재채집 — `__SIGDIFF__`가 유휴
   기준선 수준(재조립 미발화 — 정지한 손은 흔들기가 아님)인 것도 확인.

- [ ] **Step 5: 정리 동작·폴백·콘솔 확인**

1. `#v-cam` 재클릭(토글 오프) → 라벨 "📷 손으로 조종하기" 원복, 미러·커서 사라짐.
2. 뷰어 닫기 → 재진입: 버튼 초기 상태. `.viewer__nav--next`로 13번 이동 → 버튼 hidden.
3. 새 탭(또는 리로드) 후 `window.__CAM_CDN__ = "/nonexistent"`만 설치하고 12번 진입 →
   `#v-cam` 클릭 → "카메라를 사용할 수 없어요 — 클릭으로 체험하세요" + disabled.
   **클릭 재조립은 여전히 동작**: `s3 = __SIG__()` → 캔버스 중앙 클릭 → 3초 대기 →
   `__SIGDIFF__(s3, __SIG__()) > 0.1`.
4. 콘솔 오류 0건 (폴백 시나리오의 의도된 console.warn 1건은 허용).

- [ ] **Step 6: 마무리**

Run: `node --test test/`
Expected: 전체 PASS (27)

```bash
git add test/fixtures/fake-vision/vision_bundle.mjs
git commit -m "test: E2E용 가짜 MediaPipe 번들 — __CAM_CDN__ 시임으로 손 제스처 연출

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git log -1 --format="%h %d"
```

실제 카메라·실제 MediaPipe 검증은 배포 전 로컬(HTTPS/localhost)에서 수동 1회 — 스펙 명시.
배포는 별도 단계: content-review-agent 품질 게이트(≥85) 통과 후 `tools/deploy.sh` (사용자 지시 시).
