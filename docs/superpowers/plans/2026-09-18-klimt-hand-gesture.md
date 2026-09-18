# 11번 Klimt — 손짓 성장(카메라 손 추적) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 11번 The Tree of Life에서 카메라 앞 손이 머무는 자리로 금빛 가지가 돋고, 손을 휘두르면 바람이 일게 한다. 마우스는 폴백.

**Architecture:** 공용 카메라 서비스 `js/cam.js`와 셸 📷 배선은 10번 브랜치(`feature/babel-camera`)가 구현하고 이 브랜치는 그 커밋을 merge해 받는다. 11번은 `opts.cam.hands()`만 프레임당 1회 폴링하고, 스무딩·속도·존재 히스테리시스는 피스 모듈 안의 순수 함수 `handTrackStep`으로 판정해 기존 `sprout(true, x, y)`(클릭 발아 경로)와 `windV`(드래그 바람)를 그대로 재사용한다. 영상은 그리지 않고 손 위치에 클림트 눈 모티프 금빛 표식만 그린다.

**Tech Stack:** 바닐라 ES 모듈(제로 빌드), Canvas 2D, `node --test`(node 20), MediaPipe Tasks Vision HandLandmarker(공용 cam.js가 CDN 동적 import), Playwright MCP(E2E).

## Global Constraints

- 작업 디렉터리는 격리 worktree `/home/ec2-user/media-art2/.worktrees/klimt-hand` (브랜치 `feature/klimt-hand-gesture`). 메인 체크아웃에서 `git checkout` 금지, bare `git stash` 금지. 모든 git 명령은 이 worktree 안에서 실행하고 커밋 직후 `git log --oneline -1`로 브랜치 확인.
- 공용 파일 `js/cam.js`·`js/main.js`·`index.html`·`css/style.css`는 이 브랜치에서 **작성·수정하지 않는다**(Task 4 merge로 수용). 예외: 병합 후 라벨이 중립 문구가 아니면 컨트롤러에 보고만 한다.
- 공용 계약: `opts.cam = { active(): boolean, hands(): {n:0|1|2, x, y}, video(), landmarks() }`, `hands()`의 x·y는 거울 보정 후 0..1 정규화, 손 없으면 `n: 0`. 11번은 `active()`·`hands()`만 쓰고 `hands()`는 tick당 정확히 1회 호출.
- 중립 버튼 문구(셸 소유): 대기 "📷 카메라로 체험하기" · 요청 중 "📷 카메라 준비 중…" · 활성 "📷 손을 비춰보세요" · 실패 "카메라를 사용할 수 없어요 — 마우스로 체험하세요".
- 상수(스펙 확정): `SMOOTH_RATE=14`, `VEL_RATE=10`, `PRESENT_AFTER=0.05`, `LOST_AFTER=0.35`, `SWEEP=0.6`, 발아 간격 `0.6`s(reduced `1.1`), 근접 반경 `S*0.22`, 가속 `2.5`, 바람 이득 `14`(reduced `6`), 표식 반지름 `S*0.02`.
- `test/data.test.mjs`의 cam 검사는 `typeof boolean`만(번호 하드코딩 금지). 기존 mic 테스트(`["09"]`)는 그대로.
- 커밋 메시지는 프로젝트 관례(`feat:`/`docs:`/`test:`/`merge:` + 한국어 요약) + 마지막 줄 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 로컬 서버 포트: 8080은 다른 앱, 8090·8094는 다른 세션이 쓸 수 있음 → `ss -ltn`으로 빈 포트 확인 후 사용.

---

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `js/pieces/11-tree-of-life.js` | 순수 손 추적 상태 기계(export) + 카메라 소비(입력·가속·표식) | 1, 3 |
| `test/klimt-gesture.test.mjs` (신규) | 상태 기계 단위 테스트 + 스텁 ctx 스모크(hands 1회/틱) | 1, 3 |
| `js/data.js` (11번 항목만) | `cam: true`, hint·note·medium 갱신 | 2 |
| `js/cam.js`, `js/main.js`, `index.html`, `css/style.css`, `test/fixtures/fake-vision/vision_bundle.mjs` | 공용 계층 — 10번 브랜치 merge | 4 |
| `test/data.test.mjs` | cam boolean 검사(merge에 없을 때만 추가) | 4 |

---

### Task 1: 11번 피스 — 순수 손 추적 상태 기계 (TDD)

**Files:**
- Modify: `js/pieces/11-tree-of-life.js` (상수 블록 `const TAU = Math.PI * 2;` 바로 아래에 export 블록 추가)
- Create: `test/klimt-gesture.test.mjs`

**Interfaces:**
- Consumes: 없음.
- Produces: `export const SMOOTH_RATE=14, VEL_RATE=10, PRESENT_AFTER=0.05, LOST_AFTER=0.35`, `export function makeHandTrack(): {present:boolean, x:number, y:number, vx:number, vy:number, seenT:number, lostT:number, init:boolean}`, `export function handTrackStep(s, pt: {x,y}|null, dt: number): s` — Task 3의 tick이 소비. 좌표·속도는 0..1 정규화 단위(속도는 /초).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/klimt-gesture.test.mjs`:

```js
// test/klimt-gesture.test.mjs — 11번 손 추적 상태 기계(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHandTrack, handTrackStep, PRESENT_AFTER, LOST_AFTER } from "../js/pieces/11-tree-of-life.js";

const F = 1 / 60;
// sec초 동안 매 프레임 fn(i, n)을 호출한다
const feed = (fn, sec, dt = F) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) fn(i, n); };

test("시작 상태와 미검출만 흘린 상태는 present가 아니다", () => {
  const s = makeHandTrack();
  assert.equal(s.present, false);
  feed(() => handTrackStep(s, null, F), 1);
  assert.equal(s.present, false);
});

test("고정점을 1초 흘리면 그 점에 1e-3 안으로 수렴하고 present가 된다", () => {
  const s = makeHandTrack();
  feed(() => handTrackStep(s, { x: 0.2, y: 0.2 }, F), 0.2);
  feed(() => handTrackStep(s, { x: 0.7, y: 0.6 }, F), 1);
  assert.ok(Math.abs(s.x - 0.7) < 1e-3 && Math.abs(s.y - 0.6) < 1e-3, `수렴 (${s.x}, ${s.y})`);
  assert.equal(s.present, true);
});

test("x가 증가하는 점열(0.3→0.7, 0.5초)은 vx>0이고 휘두름 판정(0.6/s) 위다", () => {
  const s = makeHandTrack();
  feed((i, n) => handTrackStep(s, { x: 0.3 + 0.4 * (i + 1) / n, y: 0.5 }, F), 0.5);
  assert.ok(s.vx > 0, `vx ${s.vx}`);
  assert.ok(Math.hypot(s.vx, s.vy) > 0.6, `속도 ${Math.hypot(s.vx, s.vy)}`);
});

test("느린 이동(0.1/s)은 휘두름 판정 아래다 — 머무름으로 취급", () => {
  const s = makeHandTrack();
  feed((i, n) => handTrackStep(s, { x: 0.3 + 0.1 * (i + 1) / n, y: 0.5 }, F), 1);
  assert.ok(Math.hypot(s.vx, s.vy) < 0.6, `속도 ${Math.hypot(s.vx, s.vy)}`);
});

test("히스테리시스: 1프레임(1/30초) 누락은 present 유지, 0.4초 연속 누락은 해제", () => {
  const s = makeHandTrack();
  feed(() => handTrackStep(s, { x: 0.5, y: 0.5 }, F), 0.5);
  handTrackStep(s, null, 1 / 30);
  assert.equal(s.present, true, "1프레임 누락");
  feed(() => handTrackStep(s, null, F), 0.4);
  assert.equal(s.present, false, "0.4초 누락");
  assert.ok(LOST_AFTER < 0.4 && PRESENT_AFTER > F, "상수가 테스트 가정과 맞다");
});

test("단일 프레임 검출(1/60초)만으로는 present가 아니다", () => {
  const s = makeHandTrack();
  handTrackStep(s, { x: 0.5, y: 0.5 }, F);
  assert.equal(s.present, false);
});

test("부재 후 먼 위치 재등장: 첫 프레임에 위치가 즉시 놓이고 속도는 0", () => {
  const s = makeHandTrack();
  feed(() => handTrackStep(s, { x: 0.2, y: 0.2 }, F), 0.5);
  feed(() => handTrackStep(s, null, F), 0.5);
  assert.equal(s.present, false);
  handTrackStep(s, { x: 0.9, y: 0.8 }, F);
  assert.equal(s.x, 0.9); assert.equal(s.y, 0.8);
  assert.equal(s.vx, 0); assert.equal(s.vy, 0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/klimt-hand && node --test test/klimt-gesture.test.mjs`
Expected: FAIL — `SyntaxError: The requested module '../js/pieces/11-tree-of-life.js' does not provide an export named 'makeHandTrack'`

- [ ] **Step 3: 구현 — `js/pieces/11-tree-of-life.js`의 `const TAU = Math.PI * 2;` 줄 바로 아래에 추가**

```js

// ── 손 추적 순수 계산부 (export — node:test 대상, 브라우저 API 미참조) ────────
// pt는 공용 cam.hands()의 주 손 좌표 {x,y}(거울 보정 후 0..1) 또는 null(손 없음).
// 위치는 EMA 스무딩, 속도는 스무딩 위치의 차분을 다시 EMA(정규화 단위/초).
// present는 PRESENT_AFTER초 연속 검출 후 켜지고 LOST_AFTER초 연속 미검출 후 꺼진다(프레임 드랍 흡수).
export const SMOOTH_RATE = 14, VEL_RATE = 10, PRESENT_AFTER = 0.05, LOST_AFTER = 0.35;

export function makeHandTrack() {
  return { present: false, x: 0.5, y: 0.5, vx: 0, vy: 0, seenT: 0, lostT: 0, init: false };
}

export function handTrackStep(s, pt, dt) {
  if (dt <= 0) return s;
  const kv = 1 - Math.exp(-VEL_RATE * dt);
  if (pt) {
    if (!s.init || !s.present) {          // 첫 검출·부재 후 재등장: 옛 위치에서 날아오지 않도록 점프, 속도 0
      s.x = pt.x; s.y = pt.y; s.vx = 0; s.vy = 0; s.init = true;
    } else {
      const k = 1 - Math.exp(-SMOOTH_RATE * dt);
      const nx = s.x + (pt.x - s.x) * k, ny = s.y + (pt.y - s.y) * k;
      s.vx += ((nx - s.x) / dt - s.vx) * kv;
      s.vy += ((ny - s.y) / dt - s.vy) * kv;
      s.x = nx; s.y = ny;
    }
    s.seenT += dt; s.lostT = 0;
    if (s.seenT >= PRESENT_AFTER) s.present = true;
  } else {
    s.lostT += dt; s.seenT = 0;
    s.vx -= s.vx * kv; s.vy -= s.vy * kv;   // 위치는 유지, 속도만 0으로 감쇠
    if (s.lostT >= LOST_AFTER) s.present = false;
  }
  return s;
}
```

- [ ] **Step 4: 통과 확인 + 기존 테스트 무영향**

Run: `cd /home/ec2-user/media-art2/.worktrees/klimt-hand && node --test test/`
Expected: 전체 PASS (기존 20 + 신규 7 = 27). integrity 테스트가 11번 모듈을 import하므로 export 추가로 깨지지 않았음을 함께 확인.

- [ ] **Step 5: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/klimt-hand
git add js/pieces/11-tree-of-life.js test/klimt-gesture.test.mjs
git commit -m "feat: 11번 손 추적 상태 기계 — EMA 스무딩·속도·존재 히스테리시스 순수 로직 + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -1   # feature/klimt-hand-gesture 위인지 확인
```

---

### Task 2: data.js — 11번 항목 `cam` 플래그·hint·note·medium

**Files:**
- Modify: `js/data.js:86-92` (11번 항목만 — 10번 항목은 건드리지 않는다, Task 4 merge와 충돌 면적 최소화)

**Interfaces:**
- Consumes: 없음.
- Produces: `WORKS.find(w => w.no === "11").cam === true` — 셸(Task 4 merge)의 `camBtn.hidden = !work.cam`이 소비.

- [ ] **Step 1: 11번 항목 4줄 교체**

`js/data.js`의 11번 항목에서 아래 세 줄을

```js
    medium: "Golden spiral growth · WebAudio · after Klimt (1905–09, public domain)", year: "2026",
    note: "클림트의 생명의 나무가 금빛 나선을 뻗으며 자라난다. 가지는 하늘을 향해 감아 올라가 저마다의 소용돌이로 말리고, 클릭한 자리에서는 새 가지가 돋아 피어난다. 가지 사이에 클림트의 검은 새가 내려앉는 — 삶과 죽음과 재생이 한 그루에 감긴 나무.",
    hint: "클릭한 곳에서 새 가지가 자랍니다 · 드래그로 바람 · 사운드를 켜면 가지가 필 때 울림",
```

다음으로 바꾼다(`cam: true` 한 줄 추가 포함, `module:` 줄은 그대로):

```js
    medium: "Golden spiral growth · Hand tracking · WebAudio · after Klimt (1905–09, public domain)", year: "2026",
    note: "클림트의 생명의 나무가 금빛 나선을 뻗으며 자라난다. 가지는 하늘을 향해 감아 올라가 저마다의 소용돌이로 말리고, 손을 내밀어 머무는 자리에서는 새 가지가 돋아 손을 향해 피어난다. 가지 사이에 클림트의 검은 새가 내려앉는 — 삶과 죽음과 재생이 한 그루에 감긴 나무.",
    hint: "📷를 켜고 손을 들면 그곳으로 가지가 자랍니다 · 휘두르면 바람 · 커서로도 가능합니다",
    cam: true,
```

- [ ] **Step 2: 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/klimt-hand && node --test test/ && node -e "import('./js/data.js').then(m => { const w = m.WORKS.find(w => w.no === '11'); console.log('cam', w.cam === true, 'hint', w.hint.startsWith('📷'), 'note', w.note.includes('손을 내밀어')); })"`
Expected: 전체 PASS(27), 출력 `cam true hint true note true`. (data.test의 mic 검사 `["09"]`는 영향 없음.)

- [ ] **Step 3: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/klimt-hand
git add js/data.js
git commit -m "feat: 11번 cam 플래그 + 손짓 힌트·노트·medium 갱신

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -1
```

---

### Task 3: 11번 피스 — 카메라 소비 (손 입력·근접 가속·금빛 표식) + 스텁 ctx 스모크

**Files:**
- Modify: `js/pieces/11-tree-of-life.js` (상태 선언, `init`, `tick` 입력 블록·성장 루프·반짝임, 렌더 순서, `dispose`, `drawHand` 신설)
- Modify: `test/klimt-gesture.test.mjs` (스모크 테스트 1건 추가)

**Interfaces:**
- Consumes: Task 1의 `makeHandTrack()`, `handTrackStep(s, pt, dt)`; 공용 계약 `opts.cam.{active(), hands()}` (Task 4 merge 전에는 테스트의 가짜 객체로만 주입).
- Produces: 없음(피스 내부). 기존 `sprout(fromClick, x, y)`·`windV`·`shimmer`·`spiralPt` 재사용.

- [ ] **Step 1: 실패하는 스모크 테스트 추가 — `test/klimt-gesture.test.mjs` 끝에**

```js

// ── 스텁 ctx 스모크: 브라우저 없는 node에서 렌더 코드까지 실행한다 ──
// 모든 프로퍼티 읽기·호출·대입을 흡수하는 Proxy — document.createElement("canvas").getContext("2d") 등 전부 stub
const stub = new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : stub),
  set: () => true, apply: () => stub, construct: () => stub,
});

test("가짜 cam으로 init→tick→dispose가 예외 없이 돌고 hands()는 tick당 정확히 1회 불린다", async () => {
  globalThis.document = stub;
  try {
    const piece = (await import("../js/pieces/11-tree-of-life.js")).default;
    let calls = 0, hand = { n: 0, x: 0.5, y: 0.5 };
    const cam = { active: () => true, hands: () => { calls++; return hand; }, video: () => null, landmarks: () => [] };
    piece.init({ canvas: stub, ctx: stub, width: 1280, height: 720, reducedMotion: false, audio: null, assets: {}, cam });
    const ptr = { x: 640, y: 300, px: 640, py: 300, dx: 0, dy: 0, down: false, justDown: false, justUp: false, downTime: 0, inside: true };
    for (let i = 0; i < 60; i++) piece.tick(1 / 60, ptr);        // 손 없음 1초 — 마우스 경로
    hand = { n: 1, x: 0.3, y: 0.35 };
    for (let i = 0; i < 120; i++) piece.tick(1 / 60, ptr);       // 손 머무름 2초 — 발아·가속·표식
    for (let i = 0; i < 30; i++) { hand = { n: 1, x: i % 2 ? 0.2 : 0.8, y: 0.35 }; piece.tick(1 / 60, ptr); } // 휘두름 0.5초 — 바람
    hand = { n: 0, x: 0.3, y: 0.35 };
    for (let i = 0; i < 60; i++) piece.tick(1 / 60, null);       // 손 사라짐, ptr null도 허용
    piece.resize(800, 600); piece.tick(1 / 60, ptr);
    piece.dispose();
    assert.equal(calls, 271, "hands() 호출 수 = tick 수");
  } finally { delete globalThis.document; }
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/klimt-hand && node --test test/klimt-gesture.test.mjs`
Expected: 신규 테스트만 FAIL — `hands() 호출 수 = tick 수` (실제 0, 기대 271). 다른 7건 PASS.

- [ ] **Step 3: 상태 선언 추가 — `let spawnAcc = 0, shimAcc = 0, birdAcc = 0, nextSpawn = 2, nextBird = 8;` 줄 바로 아래**

```js
let cam = null, track = null;           // 공용 카메라 getter(opts.cam)와 손 추적 상태(makeHandTrack)
let handOn = false, handAcc = 0, handShimAcc = 0;
let hx = null, hy = null;               // 이번 프레임 손의 캔버스 좌표(없으면 null)
const SWEEP = 0.6;                      // 휘두름 판정 속도(정규화 단위/초) — 이상이면 발아 대신 바람만
const NEAR_R = 0.22, NEAR_BOOST = 2.5;  // 손 반경 S*NEAR_R 안 가지의 성장 가속
```

- [ ] **Step 4: `init` — `nextSpawn = rnd(1.2, 2.4); nextBird = rnd(7, 12);` 줄 바로 아래**

```js
    cam = opts.cam || null; track = makeHandTrack();
    handOn = false; handAcc = 0; handShimAcc = 0; hx = hy = null;
```

- [ ] **Step 5: `tick` 입력 블록 교체 — 기존**

```js
    // ── 입력 ──
    if (ptr) {
      if (ptr.justDown) ensureAudio();
      if (ptr.justDown && ptr.inside) sprout(true, ptr.x, ptr.y);   // 클릭 = 새 가지 발아
      if (ptr.down && ptr.inside && wasDown)                        // 드래그 = 바람
        windV += ptr.dx * (reduced ? 6 : 14);
      wasDown = ptr.down;
    }
```

을 아래로 바꾼다:

```js
    // ── 입력: 카메라 손이 보이면 손이 입력원, 아니면 마우스 폴백 ──
    let pt = null;
    if (cam && cam.active()) {                                      // hands()는 tick당 정확히 1회(프레임당 1회 탐지 계약)
      const h = cam.hands();
      if (h && h.n >= 1) pt = { x: h.x, y: h.y };
    }
    handTrackStep(track, pt, dt);
    if (track.present) {
      hx = track.x * W; hy = track.y * H;
      const speed = Math.hypot(track.vx, track.vy);                 // 정규화 단위/초 — 해상도 무관
      if (!handOn) { ensureAudio(); sprout(true, hx, hy); handAcc = 0; }   // 손 첫 등장 = 클릭 1회
      windV += track.vx * W * dt * (reduced ? 6 : 14);              // 드래그 dx·14와 같은 체감 (dx ≈ vx·W·dt)
      if (speed < SWEEP) {                                          // 머무름 → 주기 발아
        handAcc += dt;
        if (handAcc >= (reduced ? 1.1 : 0.6)) { handAcc = 0; sprout(true, hx, hy); }
      } else handAcc = 0;                                           // 휘두름 → 바람만
      handOn = true;
      if (ptr) wasDown = ptr.down;                                  // 마우스 복귀 시 stale 드래그 방지
    } else {
      handOn = false; hx = hy = null;
      if (ptr) {
        if (ptr.justDown) ensureAudio();
        if (ptr.justDown && ptr.inside) sprout(true, ptr.x, ptr.y); // 클릭 = 새 가지 발아
        if (ptr.down && ptr.inside && wasDown)                      // 드래그 = 바람
          windV += ptr.dx * (reduced ? 6 : 14);
        wasDown = ptr.down;
      }
    }
```

- [ ] **Step 6: 성장 루프 — 손 근접 가속. 기존**

```js
      if (b.grow < 1) {
        b.grow = Math.min(1, b.grow + b.rate * dt);
```

을

```js
      if (b.grow < 1) {
        let rate = b.rate;
        if (hx !== null) {                                          // 손 가까운 가지가 먼저 피어난다
          const q = spiralPt(b, b.grow);
          if (Math.hypot(q.x - hx, q.y - hy) < S * NEAR_R) rate *= NEAR_BOOST;
        }
        b.grow = Math.min(1, b.grow + rate * dt);
```

로 바꾼다(그 아래 `if (b.grow >= 1 && !b.chimed) ...` 줄은 그대로).

- [ ] **Step 7: 손 주변 반짝임 — 기존 `// 금박 반짝임` 블록(`if (!reduced) { shimAcc += dt; ... }`)의 닫는 `}` 바로 다음, `for (const s of shimmer) s.life -= dt / 0.9;` 앞에 추가**

```js
    if (!reduced && hx !== null) {                                  // 손 주변 금가루 — 기존 shimmer 재사용
      handShimAcc += dt;
      if (handShimAcc >= 0.06) {
        handShimAcc = 0;
        const a = rnd(0, TAU), r = rnd(0, S * 0.05);
        shimmer.push({ x: hx + Math.cos(a) * r, y: hy + Math.sin(a) * r, life: 1, sz: rnd(1.5, 3.5) * (S / 700) });
      }
    }
```

- [ ] **Step 8: 렌더 순서 — `if (bird) drawBird();` 줄 바로 아래**

```js
    if (hx !== null) drawHand();
```

- [ ] **Step 9: `dispose` — `branches = []; shimmer = []; trunk = []; bird = null;` 줄 바로 아래**

```js
    cam = null; track = null; hx = hy = null; handOn = false;
```

- [ ] **Step 10: `drawHand` 신설 — 파일 끝 `drawBird` 함수 뒤에**

```js

// 손 표식: 클림트 눈 모티프 — 금빛 고리(펄스) + 검은 중심점. 바람(swayX)은 적용하지 않는다(손은 흔들리지 않음).
function drawHand() {
  const r = S * 0.02 * (1 + 0.1 * Math.sin(T * 3));
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(1.5, S * 0.004); ctx.strokeStyle = GOLD_HI;
  ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = RING;
  ctx.beginPath(); ctx.arc(hx, hy, S * 0.006, 0, TAU); ctx.fill();
  ctx.restore();
}
```

- [ ] **Step 11: 통과 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/klimt-hand && node --check js/pieces/11-tree-of-life.js && node --test test/`
Expected: 전체 PASS(28). 스모크에서 `calls === 271`(60+120+30+60+1).

- [ ] **Step 12: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/klimt-hand
git add js/pieces/11-tree-of-life.js test/klimt-gesture.test.mjs
git commit -m "feat: 11번 손짓 성장 — 손 머무름 발아·휘두름 바람·근접 가지 가속·금빛 손 표식 (마우스 폴백 유지)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -1
```

---

### Task 4: 공용 카메라 계층 merge (10번 브랜치) + 중립 문구 cherry-pick + data.test 일반화

**Files:**
- Merge: `feature/babel-camera` (가져오는 것: `js/cam.js`, `js/main.js`·`index.html`·`css/style.css` 📷 배선, `test/fixtures/fake-vision/vision_bundle.mjs`, 10번 피스·data 10번 항목·`test/babel-gesture.test.mjs` 등 10번 고유분)
- Cherry-pick: `c4138c7` (01번 브랜치 `feature/wave-hand-gesture`의 "fix: 공용 📷 버튼 문구 작품 중립화" — `index.html` 1줄, `js/main.js` 4줄)
- Modify: `test/data.test.mjs` (10번이 하드코딩한 `["10"]` 검사를 01번 브랜치와 **동일 문구**의 boolean 검사로 교체)

**Interfaces:**
- Consumes: 10번 브랜치의 `js/cam.js` `{ request(), active(), hands(), landmarks(), video(), stop() }`, `main.js`의 `opts.cam` 전달·`#v-cam` 노출(`work.cam`)·`closeWork()`의 `cam.stop()`; 01번의 중립 문구 커밋.
- Produces: 이 브랜치에서 `cam: true` 작품(10·11)에 📷 버튼이 뜨고 11번 `init`에 `opts.cam`이 주입됨, 버튼 문구가 중립 4종 — Task 5의 전제.

배경: 10번 세션은 종료됐고 공용 계층은 `feature/babel-camera`에 커밋돼 있다(4c45704 cam.js, d5de7fb 배선, d8729de 가짜 번들). 계약과 어긋난 두 곳(10번 전용 문구, data.test `["10"]` 하드코딩)은 01번이 c4138c7과 자기 merge 커밋에서 고쳤다. 같은 패치를 각 브랜치가 적용하면 master 병합 때 충돌 없이 합쳐지므로 여기서도 **동일 커밋 cherry-pick + 동일 테스트 문구**를 쓴다. `cam.js` 자체는 수정하지 않는다.

- [ ] **Step 1: 준비 상태 확인**

Run:
```bash
cd /home/ec2-user/media-art2/.worktrees/klimt-hand
git ls-tree -r --name-only feature/babel-camera -- js/cam.js test/fixtures/fake-vision/vision_bundle.mjs
git grep -n "import \* as cam\|v-cam\|cam.stop()\|cam: {" feature/babel-camera -- js/main.js index.html
git show --stat --oneline c4138c7 | tail -3
```
Expected: `js/cam.js`·가짜 번들 존재, `main.js`에 `import * as cam from "./cam.js"`·`#v-cam` 처리·`cam: { active:`·`closeWork` 안 `cam.stop()`, c4138c7은 `index.html`·`js/main.js` 두 파일만. 하나라도 다르면 멈추고 컨트롤러에 보고.

- [ ] **Step 2: merge (직후 data.test 1건 실패는 예상된 상태)**

```bash
cd /home/ec2-user/media-art2/.worktrees/klimt-hand
git merge --no-ff feature/babel-camera -m "merge: 10번 공용 카메라 계층(cam.js·📷 버튼·opts.cam 배선) 수용

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
충돌이 나면 예상 지점은 `js/data.js` 하나(10번 항목과 11번 항목이 인접). 해결: 두 항목의 변경을 **모두** 남긴다 — 10번 항목은 10번 쪽(`cam: true`, 갱신된 hint·note), 11번 항목은 Task 2 내용(`medium`에 `Hand tracking`, `note` "손을 내밀어 머무는 자리…", `hint` "📷를 켜고 손을 들면…", `cam: true`). 충돌 마커 제거 후:
```bash
node -e "import('./js/data.js').then(m => console.log(m.WORKS.filter(w => w.cam).map(w => w.no)))"   # [ '10', '11' ]
git add js/data.js && git commit --no-edit
```
`js/data.js` 외 파일에서 충돌이 나면 해결하지 말고 `git merge --abort` 후 컨트롤러에 보고.
merge 직후 `node --test test/data.test.mjs`는 "cam 플래그는 boolean이며 현재는 10번에만 있다" 1건이 `["10","11"]≠["10"]`으로 **실패해야 정상**(Step 4에서 고침).

- [ ] **Step 3: 중립 문구 cherry-pick**

```bash
git cherry-pick c4138c7
grep -n "📷\|카메라를 사용할 수 없어요" js/main.js index.html
```
Expected: 충돌 없이 적용(두 파일). grep 결과가 정확히 — `main.js`: `CAM_LABEL = "📷 카메라로 체험하기"`, `"📷 카메라 준비 중…"`, `"📷 손을 비춰보세요"`, `"카메라를 사용할 수 없어요 — 마우스로 체험하세요"`; `index.html`: 초기 라벨 `📷 카메라로 체험하기`. 충돌이 나면 `git cherry-pick --abort` 후 컨트롤러에 보고.

- [ ] **Step 4: data.test cam 검사를 01번과 동일 문구로 교체**

`test/data.test.mjs`에서 10번이 넣은 테스트 블록 전체(제목 "cam 플래그는 boolean이며 현재는 10번에만 있다", `assert.deepEqual(... ["10"])` 포함)를 아래 블록으로 **정확히** 바꾼다(01번 브랜치 480e394와 글자까지 동일 — master 병합 시 충돌 방지):

```js
test("cam 플래그는 boolean이다", () => {
  for (const w of WORKS) {
    if ("cam" in w) assert.equal(typeof w.cam, "boolean", `${w.no}.cam 타입`);
  }
});
```
Run: `node --test test/` → 전체 PASS(10번 테스트 포함). 커밋:
```bash
git add test/data.test.mjs
git commit -m "test: data.js cam 플래그 검사 일반화 — boolean만 (01번 브랜치와 동일 문구)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: 병합 결과 검증·계보 확인**

Run:
```bash
cd /home/ec2-user/media-art2/.worktrees/klimt-hand
node --test test/
node -e "import('./js/cam.js').then(m => console.log('cam import-safe:', typeof m.request, typeof m.hands, m.active()))"
grep -c "v-cam" index.html js/main.js
git log --oneline --graph -12
git -C /home/ec2-user/media-art2 branch --show-current
```
Expected: 전체 PASS, `cam import-safe: function function false`, `v-cam`이 두 파일 모두 1 이상, merge 커밋의 첫 부모가 Task 3 커밋·둘째 부모가 `feature/babel-camera` 끝, 그 위에 cherry-pick 커밋과 test 커밋. 메인 체크아웃 브랜치는 이 작업 전과 동일(건드리지 않았음).

---

### Task 5: E2E — 가짜 MediaPipe 시임으로 손 발아·바람·폴백·버튼 흐름 시각 검증

**Files:**
- Create (merge에 없을 때만): `test/fixtures/fake-vision/vision_bundle.mjs` (E2E 전용, `deploy.sh` allowlist 밖이라 배포되지 않음)
- 코드 수정 없음 — 문제가 나오면 해당 Task로 돌아가 고친 뒤 재검증.

**Interfaces:**
- Consumes: `cam.js`의 `window.__CAM_CDN__` 시임(가짜 번들 경로), 가짜 번들의 `window.__FAKE_HANDS__ = { n, x, y }`(x,y는 **화면 기준** 0..1 — 번들이 1−x로 역반전해 넣고 cam.js가 다시 1−x 반전), Task 1~4 전체.

- [ ] **Step 1: 가짜 번들 확인/생성**

`ls test/fixtures/fake-vision/vision_bundle.mjs`가 없으면 아래 내용으로 생성(10번 Task 6과 동일):

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
생성했다면 커밋: `git add test/fixtures/fake-vision/vision_bundle.mjs && git commit -m "test: E2E용 가짜 MediaPipe 번들 — __CAM_CDN__ 시임으로 손 연출"` (+ Co-Authored-By 줄).

- [ ] **Step 2: 빈 포트로 worktree 서빙**

Run(백그라운드):
```bash
PORT=$(for p in 8095 8096 8097 8098; do ss -ltn | grep -q ":$p " || { echo $p; break; }; done); echo "PORT=$PORT"
python3 -m http.server $PORT --bind 127.0.0.1 -d /home/ec2-user/media-art2/.worktrees/klimt-hand
```
Expected: `curl -s http://127.0.0.1:$PORT/ | grep -c v-cam` → `1`.

- [ ] **Step 3: 시임 설치 → 11번 진입 → 📷 켜기**

Playwright(`mcp__plugin_playwright_playwright__*`)로 `http://127.0.0.1:$PORT/` 이동 후, **버튼 클릭 전에** `browser_evaluate`:

```js
() => {
  window.__CAM_CDN__ = "/test/fixtures/fake-vision";
  window.__FAKE_HANDS__ = { n: 0, x: 0.5, y: 0.5 };
  const c = document.createElement("canvas"); c.width = 640; c.height = 480;
  const g = c.getContext("2d");
  setInterval(() => {                                    // 비디오 currentTime 전진용 프레임 갱신
    g.fillStyle = "#3a3f44"; g.fillRect(0, 0, 640, 480);
    g.fillStyle = "#888"; g.fillRect((performance.now() / 10) % 640, 200, 40, 80);
  }, 50);
  navigator.mediaDevices.getUserMedia = async () => c.captureStream(20);
  // 금빛 픽셀 비율 측정 헬퍼: 중심 (cx,cy) CSS px, 안쪽 반지름 rIn 제외, 바깥 rOut까지의 고리
  window.__gold = (cx, cy, rIn, rOut) => {
    const cv = document.querySelector("#stage"), g2 = cv.getContext("2d");
    const dpr = cv.width / innerWidth;
    const x0 = Math.round((cx - rOut) * dpr), y0 = Math.round((cy - rOut) * dpr), sz = Math.round(2 * rOut * dpr);
    const d = g2.getImageData(x0, y0, sz, sz).data;
    let gold = 0, tot = 0;
    for (let j = 0; j < sz; j++) for (let i = 0; i < sz; i++) {
      const dist = Math.hypot(i / dpr - rOut, j / dpr - rOut);
      if (dist < rIn || dist > rOut) continue;
      const k = (j * sz + i) * 4, r = d[k], gg = d[k + 1], b = d[k + 2];
      tot++; if (r > 140 && gg > 100 && b < 120 && r - b > 60) gold++;   // 금·청동 계열, 크림 배경(b≈185) 제외
    }
    return gold / tot;
  };
  return "seams ready";
}
```
이어서 `button[data-no="11"]` 클릭 → `browser_evaluate`로 `!document.querySelector("#v-cam").hidden` → `true` 확인 → `#v-cam` 클릭 → `browser_wait_for`로 텍스트 "📷 손을 비춰보세요" 대기 → `document.querySelector("#v-cam").getAttribute("aria-pressed") === "true"` 확인. 준비 중엔 "📷 카메라 준비 중…"이 잠깐 보일 수 있다.

- [ ] **Step 4: 손 머무름 → 그쪽으로 발아 (정량 + 스크린샷)**

`browser_evaluate`:
```js
() => { const S = Math.min(innerWidth, innerHeight); window.__H = { cx: innerWidth * 0.3, cy: innerHeight * 0.35, rIn: S * 0.03, rOut: S * 0.15 };
        window.__before = window.__gold(__H.cx, __H.cy, __H.rIn, __H.rOut); window.__FAKE_HANDS__ = { n: 1, x: 0.3, y: 0.35 }; return __before; }
```
3.5초 대기(`browser_wait_for` time 3.5) 후:
```js
() => { const a = window.__gold(__H.cx, __H.cy, __H.rIn, __H.rOut); return { before: __before, after: a, ok: a >= Math.max(__before * 1.3, __before + 0.01) }; }
```
Expected: `ok: true` — 손 주변 고리(표식 자체는 rIn으로 제외)의 금빛 비율이 유의미하게 증가. 스크린샷을 찍어 손 위치(좌상단 30%,35%)에 금빛 고리 표식과 그쪽으로 뻗은 새 가지가 보이는지 육안 확인. 발아 방향은 무작위 요소가 있으므로 `ok: false`면 스크린샷을 보고 판단하되, 표식이 없거나 가지가 전혀 늘지 않으면 Task 3으로 돌아간다.

- [ ] **Step 5: 휘두름 → 바람 (스크린샷)**

`browser_evaluate`:
```js
() => { let i = 0; window.__wave = setInterval(() => { window.__FAKE_HANDS__ = { n: 1, x: (i++ % 2) ? 0.2 : 0.8, y: 0.35 }; }, 300); return "waving"; }
```
1.2초 대기 후 스크린샷 → 나무 윗부분(줄기 끝·가지들)이 한쪽으로 기울어 있는지 육안 확인(정지 상태 스크린샷과 비교). 이어서 `() => { clearInterval(window.__wave); window.__FAKE_HANDS__ = { n: 1, x: 0.3, y: 0.35 }; return "stopped"; }`.

- [ ] **Step 6: 손 사라짐 → 표식 소멸 + 마우스 폴백**

```js
() => { window.__FAKE_HANDS__ = { n: 0, x: 0.3, y: 0.35 }; return "gone"; }
```
0.8초 대기(LOST_AFTER 0.35 + 여유) 후 `() => { const S = Math.min(innerWidth, innerHeight); return window.__gold(innerWidth * 0.3, innerHeight * 0.35, 0, S * 0.012); }` → 표식 중심 원판의 금빛 비율이 낮음(`< 0.15`, 표식 고리 소멸; 가지가 지나가면 일부 금빛은 남을 수 있음). 그 다음 캔버스 클릭을 포인터 이벤트로 합성:
```js
() => { const cv = document.querySelector("#stage"); const x = innerWidth * 0.7, y = innerHeight * 0.4;
        const ev = (t, extra) => cv.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 1, bubbles: true, ...extra }));
        ev("pointermove"); ev("pointerdown", { buttons: 1 }); ev("pointerup"); window.__C = { x, y }; return "clicked"; }
```
1.5초 대기 후 스크린샷 — 클릭 지점(우측 70%,40%) 근처에 새 가지. 콘솔 오류 없음.

- [ ] **Step 7: 버튼 흐름·다른 작품·실패 경로**

1. `#v-cam` 클릭(토글 오프) → 라벨 "📷 카메라로 체험하기", `aria-pressed="false"`.
2. `.viewer__close` 클릭 → `button[data-no="11"]` 다시 클릭 → `#v-cam` 라벨이 초기 문구, `hidden === false`.
3. `.viewer__nav--prev` 클릭(10번) → `#v-cam.hidden === false`(10번도 cam). `.viewer__nav--next` 두 번(12번) → `#v-cam.hidden === true`.
4. 11번으로 돌아와 `() => { window.__CAM_CDN__ = "/nonexistent"; return 1; }` 후 `#v-cam` 클릭 → 라벨 "카메라를 사용할 수 없어요 — 마우스로 체험하세요", `disabled === true`. 캔버스 클릭 발아는 여전히 동작(Step 6 방식으로 확인).
5. `browser_console_messages` → 오류 0건(4번 실패 경로의 의도된 `console.warn` 1건은 허용).

- [ ] **Step 8: 정리**

서버 프로세스 종료(`kill %1` 또는 해당 PID). 코드 변경이 없었으면 커밋 없음. 스크린샷 3장(발아·바람·폴백)의 경로를 컨트롤러 보고에 포함.

---

### Task 6: 마무리 — 전체 검증·스펙 대조·보고

**Files:** 없음(검증·보고 전용).

- [ ] **Step 1: 전체 테스트·문법·상태**

Run:
```bash
cd /home/ec2-user/media-art2/.worktrees/klimt-hand
node --test test/ && node --check js/pieces/11-tree-of-life.js && node --check js/data.js && git status --short && git log --oneline master..HEAD
```
Expected: 전체 PASS, 작업 트리 clean, 커밋 목록에 스펙 2건·계획 1건·feat 3건(Task 1·2·3)·merge 1건·(조건부) test 커밋이 보인다.

- [ ] **Step 2: 스펙 요구사항 대조 체크리스트**

- 마우스 폴백 유지: Task 3 Step 5의 else 분기 + Task 5 Step 6.
- 손 머무름 발아·휘두름 바람: Task 3 Step 5 + Task 5 Step 4·5.
- MediaPipe CDN 지연 로드(공용 cam.js): Task 4 merge(`cam import-safe` 확인).
- 영상 미표시·금빛 표식만: Task 3 Step 10(`drawHand`), 코너 미러 호출 없음(`grep -n "drawMirror\|video()" js/pieces/11-tree-of-life.js` → 0건).
- 버튼 클릭 시에만 권한 요청: 셸(merge) — Task 5 Step 3에서 클릭 전 `getUserMedia` 미호출은 시임 설치 시점으로 간접 확인.
- `hands()` tick당 1회: Task 3 스모크(`calls === 271`).

- [ ] **Step 3: 컨트롤러 보고 (완료 보고에 반드시 포함)**

- 실제 카메라·실제 MediaPipe 검증은 이 EC2에서 불가 — 사용자가 로컬 서버 또는 배포 URL(`https://reborn.zerojin.art/`, HTTPS)에서 1회 확인: (a) 손을 들면 발아 방향이 손 쪽인지(거울 보정), (b) 휘두르면 바람, (c) 뷰어 닫으면 카메라 표시등 소등.
- master 병합은 공용 `cam.js`가 master에 먼저 들어간 뒤(10번 브랜치 병합 후) `superpowers:finishing-a-development-branch`로 진행 — 다른 카메라 브랜치(01·03·12)와 순서 조율 필요.
- 배포(`./tools/deploy.sh`)는 사용자 승인 후 메인 체크아웃 master에서만.
