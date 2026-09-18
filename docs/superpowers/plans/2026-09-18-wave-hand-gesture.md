# 01번 Great Wave 손짓 인터랙션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 01번 Great Wave에서 카메라 앞 펼친 손이 마우스 드래그(소용돌이)를, 주먹→펼침이 클릭(물보라)을 대체한다. 마우스는 폴백 유지.

**Architecture:** 공용 카메라 서비스 `js/cam.js`(10번 babel 브랜치가 구현·소유, 이 브랜치는 merge해 소비)의 `landmarks()`를 셸이 매 프레임 읽어, 순수 모듈 `js/hand-pointer.js`가 손바닥 펼침 정도(openness)와 위치를 기존 포인터 규약(`x/y/dx/dy/down/justDown/justUp/inside/downTime`)에 합성한다. `work.handPointer` 플래그로 opt-in — 작품 모듈은 손 인식 코드를 갖지 않는다. 캔버스 위 DOM 링 커서가 손 위치·펼침을 보여준다.

**Tech Stack:** 순수 ES 모듈(빌드 없음), Canvas 2D, node:test, Playwright MCP. MediaPipe는 cam.js 소유(이 브랜치 무관여).

**Spec:** `docs/superpowers/specs/2026-09-18-wave-hand-gesture-design.md`

## Global Constraints

- 작업 위치는 worktree **`/home/ec2-user/media-art2/.worktrees/wave-hand-gesture`**(브랜치 `feature/wave-hand-gesture`). 메인 체크아웃 `/home/ec2-user/media-art2`에서 `git checkout` 금지 — 다른 세션이 HEAD를 공유한다. 커밋 직후 `git log -1`로 브랜치 확인. bare `git stash` 금지(스태시 공유).
- `js/hand-pointer.js`는 브라우저 API를 참조하지 않는 순수 모듈 — node에서 import-safe.
- `js/cam.js`는 이 브랜치에서 **구현·수정하지 않는다**(Task 5 예외 상황만). 계약: `request/active/stop`, `hands()`(추론 트리거, `.x`는 거울 보정), `landmarks(): Array<Array<{x,y,z}>>`(좌표계는 원본/보정 후 어느 쪽이든 — 셸이 자동 판별, 주 손 `[0]`, 없으면 `[]`).
- 기존 마우스 인터랙션, 다른 15개 작품, 셸의 기존 규약(mic 포함) 무변경. 카메라 미사용·실패 시 01번은 마우스로 정상 동작.
- 주석·문구는 한국어, 기존 파일의 주석 밀도·스타일을 따른다. 커밋 메시지는 `feat:`/`fix:`/`docs:` + 한국어 요약, 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 테스트는 `node --test test/` 전부 통과. 순수 로직만 단위 테스트, 캔버스 렌더는 Playwright 시각 검증.
- 로컬 서버는 8090 이상 새 포트(8080은 무관한 Flask 앱 점유). 시각 검증용 사이트 복사본·스크립트·이미지는 scratchpad(`/tmp/claude-1000/-home-ec2-user-media-art2/6af3e924-c612-4f8f-8f42-ebbf91fd522f/scratchpad`)에만 둔다.
- 공용 📷 버튼 문구는 작품 중립(대기 "📷 카메라로 체험하기", 활성 "📷 손을 비춰보세요", 실패 "카메라를 사용할 수 없어요 — 마우스로 체험하세요"). merge된 배선이 10번 전용 문구면 이 브랜치에서 일반화.

---

### Task 1: hand-pointer.js 순수 계산부 — openness · palmCenter · sampleFromLandmarks (TDD)

**Files:**
- Create: `js/hand-pointer.js`
- Test: `test/hand-pointer.test.mjs` (신규)

**Interfaces:**
- Produces: `openness(lm: Array<{x,y}>): number`(0..1), `palmCenter(lm): {x,y}`, `sampleFromLandmarks(lm, mirrored: boolean): {x,y,openness} | null` — Task 2(applyHand 입력)·Task 6(셸 어댑터)가 소비. 테스트 헬퍼 `mkHand(cx, cy, ratio)`는 Task 2·7이 재사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/hand-pointer.test.mjs`:

```js
// test/hand-pointer.test.mjs — 손 랜드마크 → 포인터 합성(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { openness, palmCenter, sampleFromLandmarks } from "../js/hand-pointer.js";

// 합성 손: 손목(0)을 (cx, cy+0.05)에, 중지 뿌리(9)를 손목 위 0.1(= palm)에 두고
// 다섯 손끝(4,8,12,16,20)을 손목에서 palm*ratio 거리에 방사형으로 놓는다.
// 나머지 관절은 손바닥 근처에 채운다(openness 계산에 쓰이지 않음).
export function mkHand(cx, cy, ratio, palm = 0.1) {
  const wrist = { x: cx, y: cy + palm / 2 };
  const lm = Array.from({ length: 21 }, () => ({ x: wrist.x, y: wrist.y, z: 0 }));
  lm[0] = wrist;
  lm[9] = { x: cx, y: wrist.y - palm, z: 0 };                   // 중지 뿌리 = palm 기준
  lm[5] = { x: cx - palm * 0.3, y: wrist.y - palm, z: 0 };      // 검지 뿌리
  lm[13] = { x: cx + palm * 0.3, y: wrist.y - palm, z: 0 };     // 약지 뿌리
  lm[17] = { x: cx + palm * 0.55, y: wrist.y - palm * 0.9, z: 0 }; // 소지 뿌리
  const tips = [4, 8, 12, 16, 20];
  tips.forEach((i, k) => {
    const ang = -Math.PI / 2 + (k - 2) * 0.35;                  // 위쪽으로 부채꼴
    lm[i] = { x: wrist.x + Math.cos(ang) * palm * ratio, y: wrist.y + Math.sin(ang) * palm * ratio, z: 0 };
  });
  return lm;
}

test("펼친 손(손끝 거리비 ≈1.85)은 openness 0.9 이상", () => {
  assert.ok(openness(mkHand(0.5, 0.5, 1.85)) >= 0.9);
});

test("주먹(거리비 ≈1.1)은 openness 0", () => {
  assert.equal(openness(mkHand(0.5, 0.5, 1.1)), 0);
});

test("반쯤 오므린 손(거리비 1.5)은 openness ≈0.5", () => {
  const o = openness(mkHand(0.5, 0.5, 1.5));
  assert.ok(Math.abs(o - 0.5) < 0.05, `openness ${o}`);
});

test("openness는 스케일·거울에 불변이다", () => {
  const base = mkHand(0.5, 0.5, 1.6);
  const scaled = base.map((p) => ({ x: p.x * 2, y: p.y * 2 }));
  const mirrored = base.map((p) => ({ x: 1 - p.x, y: p.y }));
  assert.ok(Math.abs(openness(base) - openness(scaled)) < 1e-9);
  assert.ok(Math.abs(openness(base) - openness(mirrored)) < 1e-9);
});

test("손바닥 크기 0·관절 부족·빈 입력은 openness 0", () => {
  const flat = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  assert.equal(openness(flat), 0);
  assert.equal(openness(mkHand(0.5, 0.5, 1.8).slice(0, 10)), 0);
  assert.equal(openness(null), 0);
  assert.equal(openness([]), 0);
});

test("palmCenter는 손목·네 손가락 뿌리의 평균", () => {
  const lm = mkHand(0.3, 0.6, 1.8);
  const c = palmCenter(lm);
  const ex = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
  const ey = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;
  assert.ok(Math.abs(c.x - ex) < 1e-9 && Math.abs(c.y - ey) < 1e-9);
});

test("sampleFromLandmarks: 보정 전 좌표(mirrored=false)는 x를 1−x로 뒤집고, 보정 후는 그대로", () => {
  const lm = mkHand(0.3, 0.6, 1.8);
  const c = palmCenter(lm);
  const raw = sampleFromLandmarks(lm, false);
  const done = sampleFromLandmarks(lm, true);
  assert.ok(Math.abs(raw.x - (1 - c.x)) < 1e-9);
  assert.ok(Math.abs(done.x - c.x) < 1e-9);
  assert.ok(Math.abs(raw.y - c.y) < 1e-9);
  assert.ok(raw.openness >= 0.9);
});

test("sampleFromLandmarks: 손 없음(undefined·빈 배열·21개 미만)은 null", () => {
  assert.equal(sampleFromLandmarks(undefined, true), null);
  assert.equal(sampleFromLandmarks([], true), null);
  assert.equal(sampleFromLandmarks(mkHand(0.5, 0.5, 1.8).slice(0, 20), true), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/wave-hand-gesture && node --test test/hand-pointer.test.mjs`
Expected: FAIL — `Cannot find module '../js/hand-pointer.js'`

- [ ] **Step 3: 구현**

`js/hand-pointer.js`:

```js
// js/hand-pointer.js — 손 랜드마크(MediaPipe 21점) → 셸 포인터 규약 합성. 순수 로직.
// 브라우저 API를 참조하지 않으므로 node:test 대상이며, 셸(main.js)이 cam.js의
// landmarks()를 넘겨 매 프레임 호출한다. 작품 모듈은 이 파일을 모른다 — 합성된
// 포인터(x/y/down/justDown…)와 부가 정보 ptr.hand만 읽는다.

// ---- 펼침 정도 ----
// 손목(0)~중지 뿌리(9) 거리를 손바닥 크기로 삼아 손끝 거리를 정규화한다.
// 카메라 거리·거울 보정에 무관. 주먹 ≈1.1, 반쯤 오므림 ≈1.5, 펼침 ≈1.85.
const TIPS = [4, 8, 12, 16, 20];          // 엄지·검지·중지·약지·소지 끝
const PALM = [0, 5, 9, 13, 17];           // 손목 + 네 손가락 뿌리 = 손바닥 중심 표본
const RATIO_FIST = 1.2, RATIO_OPEN = 1.8; // 보정 상수 — 실제 웹캠 검증에서 조정 가능

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const valid = (lm) => Array.isArray(lm) && lm.length >= 21;

export function openness(lm) {
  if (!valid(lm)) return 0;
  const palm = dist(lm[0], lm[9]);
  if (palm <= 0) return 0;
  let sum = 0;
  for (const i of TIPS) sum += dist(lm[0], lm[i]) / palm;
  return clamp01((sum / TIPS.length - RATIO_FIST) / (RATIO_OPEN - RATIO_FIST));
}

export function palmCenter(lm) {
  let x = 0, y = 0;
  for (const i of PALM) { x += lm[i].x; y += lm[i].y; }
  return { x: x / PALM.length, y: y / PALM.length };
}

// cam.js 결과 → 합성기 입력. 결과 x는 항상 관객 기준(오른쪽으로 움직이면 커진다).
// mirrored=false(원본 카메라 좌표)면 여기서 1−x로 뒤집는다.
export function sampleFromLandmarks(lm, mirrored) {
  if (!valid(lm)) return null;
  const c = palmCenter(lm);
  return { x: mirrored ? c.x : 1 - c.x, y: c.y, openness: openness(lm) };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/hand-pointer.test.mjs`
Expected: PASS (8 tests)

- [ ] **Step 5: import-safe 확인 후 커밋**

Run: `node -e "import('./js/hand-pointer.js').then(m => console.log('import-safe:', Object.keys(m).join(',')))"`
Expected: `import-safe: openness,palmCenter,sampleFromLandmarks`

```bash
git add js/hand-pointer.js test/hand-pointer.test.mjs
git commit -m "feat: hand-pointer.js 순수 계산부 — 손바닥 펼침 정도·중심·샘플 어댑터 + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -1   # feature/wave-hand-gesture 위인지 확인
```

---

### Task 2: hand-pointer.js 합성기 — makePointerState · applyHand (TDD)

**Files:**
- Modify: `js/hand-pointer.js` (Task 1 아래에 추가)
- Test: `test/hand-pointer.test.mjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `mkHand`(테스트), `sampleFromLandmarks`.
- Produces: `OPEN_ON=0.5`, `OPEN_OFF=0.3`, `LOST_GRACE=0.4`, `REACH=0.15`, `SMOOTH=14`, `makePointerState(): {seen,sx,sy,open,lostT,downTime}`, `applyHand(pointer, sample|null, state, dt, w, h): boolean` — Task 6(셸)이 소비. `pointer.hand = {visible, openness, speed}`를 항상 갱신.

- [ ] **Step 1: 실패하는 테스트 추가 — `test/hand-pointer.test.mjs` 끝에**

```js
import { OPEN_ON, OPEN_OFF, LOST_GRACE, REACH, SMOOTH, makePointerState, applyHand }
  from "../js/hand-pointer.js";

const DT = 1 / 60, W = 1000, H = 500;
const s = (x, y, o) => ({ x, y, openness: o });               // 합성기 입력 샘플
const mkPointer = () => ({ x: -1e4, y: -1e4, px: -1e4, py: -1e4, dx: 0, dy: 0,
  down: false, justDown: false, justUp: false, downTime: 0, inside: false,
  hand: { visible: false, openness: 0, speed: 0 } });
// sec초 동안 같은 샘플을 흘리고 마지막 반환값을 돌려준다
const feed = (p, st, sample, sec) => {
  let r = false;
  for (let i = 0; i < Math.round(sec / DT); i++) r = applyHand(p, sample, st, DT, W, H);
  return r;
};

test("REACH 매핑: 카메라 중앙 70% 구간이 화면 전체가 되고 바깥은 클램프된다", () => {
  const cases = [[REACH, 0], [1 - REACH, W], [0.05, 0], [0.5, W / 2]];
  for (const [x, ex] of cases) {
    const p = mkPointer(), st = makePointerState();
    assert.equal(applyHand(p, s(x, 0.5, 0.8), st, DT, W, H), true);
    assert.ok(Math.abs(p.x - ex) < 1e-6, `x=${x} → ${p.x} (기대 ${ex})`);
  }
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 1 - REACH, 0.8), st, DT, W, H);
  assert.ok(Math.abs(p.y - H) < 1e-6);
});

test("첫 프레임은 점프(dx=dy=0), 이후엔 EMA로 수렴한다", () => {
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 0.5, 0.8), st, DT, W, H);
  assert.equal(p.x, W / 2); assert.equal(p.dx, 0); assert.equal(p.dy, 0);
  applyHand(p, s(1 - REACH, 0.5, 0.8), st, DT, W, H);      // 목표 1000으로 급변
  assert.ok(p.x > W / 2 && p.x < W, `한 프레임 뒤 ${p.x} — 아직 도달 전`);
  assert.ok(p.dx > 0, "오른쪽으로 이동 중");
  feed(p, st, s(1 - REACH, 0.5, 0.8), 1);
  assert.ok(Math.abs(p.x - W) < 1, `1초 뒤 ${p.x}`);
});

test("주먹→펼침 전환은 justDown을 정확히 한 프레임만 올린다", () => {
  const p = mkPointer(), st = makePointerState();
  feed(p, st, s(0.5, 0.5, 0.1), 0.2);                        // 주먹 유지
  assert.equal(p.down, false); assert.equal(p.justDown, false);
  applyHand(p, s(0.5, 0.5, 0.8), st, DT, W, H);              // 펼침
  assert.equal(p.justDown, true); assert.equal(p.down, true);
  applyHand(p, s(0.5, 0.5, 0.8), st, DT, W, H);
  assert.equal(p.justDown, false); assert.equal(p.down, true);
});

test("처음부터 펼친 손은 down이지만 justDown은 없다(전환이 아니므로)", () => {
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 0.5, 0.9), st, DT, W, H);
  assert.equal(p.down, true); assert.equal(p.justDown, false); assert.equal(p.inside, true);
});

test("히스테리시스: 0.3~0.5 사이에서는 직전 down 상태를 유지한다", () => {
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 0.5, 0.8), st, DT, W, H);
  feed(p, st, s(0.5, 0.5, 0.4), 0.2);
  assert.equal(p.down, true, "펼침에서 0.4로 내려와도 유지");
  feed(p, st, s(0.5, 0.5, 0.1), 0.2);
  feed(p, st, s(0.5, 0.5, 0.4), 0.2);
  assert.equal(p.down, false, "주먹에서 0.4로 올라와도 유지");
  assert.equal(p.justDown, false);
});

test("펼침→주먹 전환은 justUp 한 프레임, downTime은 주먹이면 0", () => {
  const p = mkPointer(), st = makePointerState();
  feed(p, st, s(0.5, 0.5, 0.8), 0.5);
  assert.ok(p.downTime > 0.4, `downTime ${p.downTime}`);
  applyHand(p, s(0.5, 0.5, 0.1), st, DT, W, H);
  assert.equal(p.justUp, true); assert.equal(p.down, false); assert.equal(p.downTime, 0);
  applyHand(p, s(0.5, 0.5, 0.1), st, DT, W, H);
  assert.equal(p.justUp, false);
});

test("손 소실: 유예(LOST_GRACE) 미만은 직전 상태 유지, 이상이면 마우스로 반환한다", () => {
  const p = mkPointer(), st = makePointerState();
  feed(p, st, s(0.5, 0.5, 0.8), 0.3);
  assert.equal(feed(p, st, null, LOST_GRACE / 2), true, "0.2초 소실은 점유 유지");
  assert.equal(p.x, W / 2); assert.equal(p.down, true); assert.equal(p.hand.visible, true);
  const before = { x: 123, y: 456, down: false, justDown: true };
  let released = false;
  for (let i = 0; i < Math.round(0.5 / DT); i++) {
    if (!released) { Object.assign(p, before); }                 // 셸의 마우스 스냅샷을 흉내
    const r = applyHand(p, null, st, DT, W, H);
    if (!r) { released = true; break; }
  }
  assert.ok(released, "0.5초 소실이면 false");
  assert.deepEqual({ x: p.x, y: p.y, down: p.down, justDown: p.justDown }, before,
    "false 반환 시 포인터 필드는 그대로");
  assert.equal(p.hand.visible, false); assert.equal(p.hand.openness, 0);
  applyHand(p, s(1 - REACH, 0.5, 0.8), st, DT, W, H);          // 복귀 → 다시 점프
  assert.equal(p.x, W); assert.equal(p.dx, 0); assert.equal(p.justDown, false);
});

test("한 번도 보이지 않은 상태의 null 샘플은 false이고 포인터를 건드리지 않는다", () => {
  const p = mkPointer(), st = makePointerState();
  p.x = 7; p.down = true;
  assert.equal(applyHand(p, null, st, DT, W, H), false);
  assert.equal(p.x, 7); assert.equal(p.down, true); assert.equal(p.hand.visible, false);
});

test("ptr.hand는 visible·openness·speed(px/s)를 갱신한다", () => {
  const p = mkPointer(), st = makePointerState();
  applyHand(p, s(0.5, 0.5, 0.7), st, DT, W, H);
  assert.equal(p.hand.visible, true); assert.equal(p.hand.openness, 0.7); assert.equal(p.hand.speed, 0);
  applyHand(p, s(0.6, 0.5, 0.7), st, DT, W, H);
  assert.ok(p.hand.speed > 0, `speed ${p.hand.speed}`);
  assert.ok(Math.abs(p.hand.speed - Math.hypot(p.dx, p.dy) / DT) < 1e-6);
});

test("상수는 스펙 값과 같다", () => {
  assert.equal(OPEN_ON, 0.5); assert.equal(OPEN_OFF, 0.3); assert.equal(LOST_GRACE, 0.4);
  assert.equal(REACH, 0.15); assert.equal(SMOOTH, 14);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/hand-pointer.test.mjs`
Expected: FAIL — `makePointerState`/`applyHand` export 없음 (SyntaxError: does not provide an export)

- [ ] **Step 3: 구현 — `js/hand-pointer.js` 끝에 추가**

```js
// ---- 포인터 합성 ----
// 펼친 손 = 물에 담긴 손(down), 주먹 = 뺀 손(up), 주먹→펼침 = 클릭(justDown).
export const OPEN_ON = 0.5;      // 이 이상이면 펼침(down)
export const OPEN_OFF = 0.3;     // 이 이하면 주먹(up) — 사이 구간은 직전 상태 유지(히스테리시스)
export const LOST_GRACE = 0.4;   // 손 소실 유예(초) — 프레임 드랍 깜빡임 억제
export const REACH = 0.15;       // 카메라 프레임 가장자리 제외 비율 — 중앙 70%를 화면 전체로
export const SMOOTH = 14;        // 위치 EMA 반응 속도(1/s)

export function makePointerState() {
  return { seen: false, sx: 0, sy: 0, open: false, lostT: 0, downTime: 0 };
}

const reach = (t) => clamp01((t - REACH) / (1 - 2 * REACH));

function setHand(hand, visible, open, speed) {
  hand.visible = visible; hand.openness = open; hand.speed = speed;
}

// 손이 포인터를 점유하면 pointer 필드를 덮어쓰고 true, 마우스에 맡기면 pointer는
// 건드리지 않고 false. 두 경우 모두 pointer.hand는 갱신한다. sample=null은 '손 안 보임'.
export function applyHand(pointer, sample, state, dt, w, h) {
  const hand = pointer.hand || (pointer.hand = { visible: false, openness: 0, speed: 0 });
  let lost = false;
  if (!sample) {
    if (!state.seen) { setHand(hand, false, 0, 0); return false; }
    state.lostT += dt;
    if (state.lostT >= LOST_GRACE) {                 // 유예 초과 → 마우스로 복귀
      state.seen = false; state.open = false; state.downTime = 0; state.lostT = 0;
      setHand(hand, false, 0, 0);
      return false;
    }
    lost = true;                                     // 유예 중: 직전 위치·상태 유지
  } else {
    state.lostT = 0;
  }

  const first = !state.seen;
  const prevX = state.sx, prevY = state.sy;
  if (!lost) {
    const tx = reach(sample.x) * w, ty = reach(sample.y) * h;
    if (first) { state.sx = tx; state.sy = ty; }     // 첫 프레임은 점프 — 화면 밖에서 끌려오지 않게
    else {
      const k = Math.min(1, SMOOTH * dt);
      state.sx += (tx - state.sx) * k; state.sy += (ty - state.sy) * k;
    }
  }
  state.seen = true;

  let justDown = false, justUp = false;
  if (!lost) {
    const o = sample.openness;
    if (!state.open && o >= OPEN_ON) { justDown = !first; state.open = true; }   // 처음부터 펼침이면 전환 아님
    else if (state.open && o <= OPEN_OFF) { justUp = true; state.open = false; }
    hand.openness = o;
  }

  pointer.px = first ? state.sx : prevX; pointer.py = first ? state.sy : prevY;
  pointer.x = state.sx; pointer.y = state.sy;
  pointer.dx = first ? 0 : state.sx - prevX; pointer.dy = first ? 0 : state.sy - prevY;
  pointer.inside = true;
  pointer.down = state.open;
  pointer.justDown = justDown; pointer.justUp = justUp;
  state.downTime = state.open ? state.downTime + dt : 0;
  pointer.downTime = state.downTime;
  setHand(hand, true, hand.openness, dt > 0 ? Math.hypot(pointer.dx, pointer.dy) / dt : 0);
  return true;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/hand-pointer.test.mjs`
Expected: PASS (18 tests)

- [ ] **Step 5: 전체 테스트 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS (기존 20 + 신규 18 = 38)

```bash
git add js/hand-pointer.js test/hand-pointer.test.mjs
git commit -m "feat: hand-pointer.js 합성기 — 펼침 히스테리시스·주먹→펼침 클릭·소실 유예·EMA + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -1
```

---

### Task 3: data.js — 01번 cam·handPointer 플래그, hint·note 정합화

**Files:**
- Modify: `js/data.js:12-17` (01번 항목)
- Test: `test/data.test.mjs` (검증 1건 추가)

**Interfaces:**
- Produces: `WORKS[0].cam === true`(공용 📷 버튼 노출 조건, merge된 배선이 읽음), `WORKS[0].handPointer === true`(Task 6 합성 조건).

- [ ] **Step 1: 실패하는 테스트 추가 — `test/data.test.mjs` 끝에**

```js
test("handPointer 플래그는 boolean이며, 켜진 작품은 cam도 켜져 있다(버튼 없이는 도달 불가)", () => {
  for (const w of WORKS) {
    if ("handPointer" in w) {
      assert.equal(typeof w.handPointer, "boolean", `${w.no}.handPointer 타입`);
      if (w.handPointer) assert.equal(w.cam, true, `${w.no}: handPointer는 cam: true가 필요`);
    }
    if ("cam" in w) assert.equal(typeof w.cam, "boolean", `${w.no}.cam 타입`);
  }
  assert.ok(WORKS.some((w) => w.handPointer), "handPointer 작품이 하나는 있다");
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/data.test.mjs`
Expected: FAIL — "handPointer 작품이 하나는 있다"

- [ ] **Step 3: data.js 01번 항목 수정** — note 말미 문장 추가, hint 교체, 플래그 2개 추가

```js
    note: "호쿠사이의 파도가 수천 개의 물 입자로 다시 태어난다. 갈고리 같은 물보라는 주기적으로 스스로 부서져 포말로 흩어지고, 후지산은 그 너머에서 미동도 없다. 손으로 휘저으면 파도는 무너졌다가 — 다시 그 불멸의 형상으로 되돌아온다. 카메라 앞에서 펼친 손으로 물을 휘젓고, 주먹을 쥐었다 펼치면 물보라가 튄다.",
    hint: "📷를 켜고 손을 펼쳐 물을 휘저으세요 · 주먹을 쥐었다 펼치면 물보라 · 마우스로도 가능합니다",
    cam: true, handPointer: true,
```

- [ ] **Step 4: 통과 확인 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS (39)

```bash
git add js/data.js test/data.test.mjs
git commit -m "feat: 01번 cam·handPointer 플래그 + 손짓 안내 힌트·note 정합화

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -1
```

---

### Task 4: 01번 피스 — 손 입력 물보라 강화

**Files:**
- Modify: `js/pieces/01-great-wave.js:249-254` (인터랙션 블록)

**Interfaces:**
- Consumes: 셸이 넘기는 `ptr.hand = {visible, openness, speed}` (Task 6 이후 실제 값, 그 전엔 undefined → 계수 1).
- Produces: 없음(작품 내부 변경).

- [ ] **Step 1: 인터랙션 블록 수정** — `if (ptr.justDown) field.scatter(ptr.x, ptr.y, 150, reduced ? 200 : 420);` 한 줄을 아래로 교체

```js
    if (ptr.justDown) {
      // 손 입력(주먹→펼침)이면 물을 손으로 튕기는 감각 — 반경·세기 1.4배
      const k = ptr.hand && ptr.hand.visible ? 1.4 : 1;
      field.scatter(ptr.x, ptr.y, 150 * k, (reduced ? 200 : 420) * k);
    }
```

블록 위 주석도 갱신: `// ---- 인터랙션: 드래그 = 소용돌이, 클릭 = 물보라 ----` → `// ---- 인터랙션: 드래그·펼친 손 = 소용돌이, 클릭·주먹→펼침 = 물보라 (손은 셸이 포인터로 합성) ----`

- [ ] **Step 2: 문법·인터페이스 확인**

Run: `node --check js/pieces/01-great-wave.js && node --test test/integrity.test.mjs`
Expected: 통과(4메서드 export 유지)

- [ ] **Step 3: 커밋**

```bash
git add js/pieces/01-great-wave.js
git commit -m "feat: 01번 손 입력 물보라 강화 — ptr.hand.visible이면 반경·세기 1.4배

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -1
```

---

### Task 5: 공용 cam.js·셸 📷 배선 브랜치 merge (의존성 게이트)

**Files:**
- Merge: `feature/babel-camera`(1순위) 또는 `feature/pearl-camera`(폴백) — cam.js + `#v-cam` + `work.cam` + `opts.cam` + `closeWork` `cam.stop()`을 담은 커밋.
- Modify(충돌·정합만): `js/main.js`, `index.html`, `css/style.css`, `test/data.test.mjs`, `README.md`

**Interfaces:**
- Consumes: 피어 세션 메시지(브랜치명·해시). 없으면 `git log --all --oneline -- js/cam.js`로 탐색.
- Produces: 이 worktree에 `js/cam.js`(`request/active/stop/hands/landmarks`), `#v-cam` 버튼, `import * as cam from "./cam.js"` — Task 6이 소비.

- [ ] **Step 1: cam.js 보유 브랜치 확인**

Run: `git log --all --oneline -- js/cam.js | cat; git log --all --oneline -3 feature/babel-camera feature/pearl-camera | cat`
Expected: cam.js를 추가한 커밋과 그 브랜치가 보인다. 두 브랜치 모두 cam.js가 있으면 셸 배선(`#v-cam`)까지 포함한 쪽을 택한다: `git grep -l 'v-cam' <branch> -- index.html js/main.js`.

- [ ] **Step 2: merge**

```bash
git merge --no-ff <branch> -m "merge: 공용 cam.js·셸 📷 배선(<branch>) 수용 — 01번 손짓 합성의 토대

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
충돌 예상 지점과 해소 원칙:
- `js/data.js`: 01번(이 브랜치)과 10번/03번 항목은 다른 줄 — 자동 병합. 충돌 시 양쪽 항목 모두 유지.
- `test/data.test.mjs`: 상대가 `["10"]` 하드코딩 검사를 넣었으면 typeof boolean 검사로 일반화(Task 3의 테스트가 이미 cam 타입을 검사하므로 상대 테스트는 삭제해도 커버됨).
- `README.md`: 양쪽 문장 모두 유지.

- [ ] **Step 3: 계약 검증**

Run:
```bash
grep -n "^export" js/cam.js
grep -n "v-cam\|viewer__cam" index.html css/style.css js/main.js | head
grep -n "cam.stop()\|camBtn.hidden = !work.cam\|cam: {" js/main.js
grep -n "거울\|mirror\|1 - " js/cam.js | head
node --test test/
```
Expected: export에 `request active stop hands landmarks`(+video/drawMirror 선택) 존재; 버튼·플래그·stop 배선 존재; landmarks 좌표계 주석 확인(원본이든 보정 후든 Task 6의 자동 판별이 흡수 — 기록만); 테스트 전부 PASS.

- [ ] **Step 4: 공용 문구 중립화(필요 시)** — `js/main.js`의 카메라 버튼 문구가 10번 전용이면 교체

```js
const CAM_LABEL = "📷 카메라로 체험하기";
// 성공: camBtn.textContent = "📷 손을 비춰보세요";
// 실패: camBtn.textContent = "카메라를 사용할 수 없어요 — 마우스로 체험하세요";
```
`index.html`의 `#v-cam` 초기 텍스트도 `📷 카메라로 체험하기`로.

- [ ] **Step 5: 커밋(수정이 있었을 때만)**

```bash
git add -A && git commit -m "fix: 공용 📷 버튼 문구 작품 중립화·data.test cam 검사 일반화

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -3
```

**폴백(어느 브랜치에도 cam.js가 없을 때만):** 03번 스펙 계약대로 이 브랜치가 최소 구현을 넣는다. 계약 밖 기능(코너 미러 등)은 넣지 않는다.

`js/cam.js`:
```js
// js/cam.js — 공용 카메라·손 추적 서비스(03·10번 스펙 계약의 최소 구현). 셸이 수명을
// 소유한다. MediaPipe는 request() 안에서만 동적 import — 버튼 전엔 0바이트, node import-safe.
// landmarks()는 hands()와 같은 **거울 보정 후** 좌표(x = 1 − 원본). 영상은 로컬 추론 전용.
const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
let stream = null, vid = null, landmarker = null, gen = 0;
let lastVT = -1, lmarks = [], last = { n: 0, x: -1, y: -1 };
export function active() { return !!(stream && landmarker); }
export async function request() {
  if (active()) return true;
  const my = ++gen; let s = null, lm = null, v = null;
  try {
    s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
    if (my !== gen) throw new Error("stale");
    const vision = await import(`${CDN}/vision_bundle.mjs`);
    if (my !== gen) throw new Error("stale");
    const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    if (my !== gen) throw new Error("stale");
    const mk = (delegate) => vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: "VIDEO", numHands: 2 });
    try { lm = await mk("GPU"); } catch (_) { lm = await mk("CPU"); }
    if (my !== gen) throw new Error("stale");
    v = document.createElement("video"); v.srcObject = s; v.muted = true; v.playsInline = true;
    v.style.cssText = "position:fixed;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(v); await v.play();
    if (my !== gen) throw new Error("stale");
    stream = s; vid = v; landmarker = lm; lastVT = -1; lmarks = []; last = { n: 0, x: -1, y: -1 };
    return true;
  } catch (e) {
    if (s) for (const t of s.getTracks()) t.stop();
    if (v) { v.srcObject = null; v.remove(); }
    if (lm) { try { lm.close(); } catch (_) {} }
    if (e.message !== "stale") console.warn("카메라 사용 불가", e);
    return false;
  }
}
function detect() {   // 새 비디오 프레임에서만 1회 추론, 결과 캐시 — 호출 순서 무관
  if (!active() || vid.readyState < 2 || vid.currentTime === lastVT) return;
  lastVT = vid.currentTime;
  const res = landmarker.detectForVideo(vid, performance.now());
  lmarks = (res.landmarks || []).map((h) => h.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));
  if (lmarks.length) { const a = lmarks[0][5], b = lmarks[0][9];
    last = { n: Math.min(2, lmarks.length), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  else last = { n: 0, x: -1, y: -1 };
}
export function hands() { detect(); return last; }
export function landmarks() { detect(); return lmarks; }
export function video() { return vid; }
export function stop() {
  gen++;
  if (stream) for (const t of stream.getTracks()) t.stop();
  if (vid) { vid.srcObject = null; vid.remove(); }
  if (landmarker) { try { landmarker.close(); } catch (_) {} }
  stream = null; vid = null; landmarker = null; lastVT = -1; lmarks = []; last = { n: 0, x: -1, y: -1 };
}
```
셸 배선 폴백(`js/main.js` — 마이크 블록 아래, 09번 mic 버튼과 같은 패턴):
```js
import * as cam from "./cam.js";
// ---------- 카메라 (cam: true 작품에서만 버튼 노출) ----------
const camBtn = $("#v-cam");
const CAM_LABEL = "📷 카메라로 체험하기";
function resetCamBtn() { camBtn.setAttribute("aria-pressed", "false"); camBtn.disabled = false; camBtn.textContent = CAM_LABEL; }
let camReqSeq = 0;
camBtn.addEventListener("click", async () => {
  if (cam.active()) { cam.stop(); resetCamBtn(); return; }
  const my = ++camReqSeq;
  camBtn.disabled = true; camBtn.textContent = "📷 카메라 준비 중…";
  const ok = await cam.request();
  if (my !== camReqSeq) return;
  camBtn.disabled = false;
  if (ok) { camBtn.setAttribute("aria-pressed", "true"); camBtn.textContent = "📷 손을 비춰보세요"; }
  else { camBtn.disabled = true; camBtn.textContent = "카메라를 사용할 수 없어요 — 마우스로 체험하세요"; }
});
```
`openWork`의 `micBtn.hidden = !work.mic;` 뒤에 `camBtn.hidden = !work.cam;`, `piece.init` opts에
`cam: { active: () => cam.active(), hands: () => cam.hands(), landmarks: () => cam.landmarks(), video: () => cam.video() }`,
`closeWork`의 `mic.stop();` 줄 뒤에 `camReqSeq++; cam.stop(); resetCamBtn(); camBtn.hidden = true;`.
`index.html`의 `#v-mic` 다음 줄에 `<button class="viewer__mic viewer__cam" id="v-cam" hidden aria-pressed="false">📷 카메라로 체험하기</button>`.
커밋: `feat: 공용 cam.js 최소 구현 + 셸 📷 배선(폴백 — 피어 브랜치 부재)`.

---

### Task 6: 셸 손 → 포인터 합성 배선 + 링 커서

**Files:**
- Modify: `js/main.js` (import, 합성 블록, pointer 초기 객체, frame, openWork/resize의 stageW·H, closeWork)
- Modify: `index.html` (`#stage` 다음 줄에 링 커서)
- Modify: `css/style.css` (`.viewer__error` 규칙 앞에 `.hand-cursor`)

**Interfaces:**
- Consumes: Task 2 `makePointerState/applyHand`, Task 1 `sampleFromLandmarks`, Task 3 `work.handPointer`, Task 5 `cam.active/hands/landmarks`.
- Produces: 작품 tick이 받는 `ptr`에 손 합성 값 + `ptr.hand`. DOM `#hand-cursor`(hidden 토글, `--hand-open`, `.is-down`).

- [ ] **Step 1: index.html — `<canvas id="stage"></canvas>` 바로 다음 줄에 추가**

```html
    <div id="hand-cursor" class="hand-cursor" hidden aria-hidden="true"></div>
```

- [ ] **Step 2: css/style.css — `.viewer__error {` 규칙 바로 앞에 추가**

```css
/* 손 위치 링 커서 — 셸이 손을 포인터로 합성하는 작품(handPointer)에서만 보인다.
   펼침 정도(--hand-open 0..1)에 따라 커지고, 물에 담긴 상태(is-down)면 채워진다. */
.hand-cursor {
  position: absolute; left: 0; top: 0; z-index: 4; pointer-events: none;
  width: calc(18px + 26px * var(--hand-open, 0)); height: calc(18px + 26px * var(--hand-open, 0));
  border: 1.5px solid var(--accent); border-radius: 50%;
  transition: width 0.12s, height 0.12s, background 0.12s; will-change: transform;
}
.hand-cursor.is-down { background: color-mix(in srgb, var(--accent) 35%, transparent); }
.hand-cursor[hidden] { display: none; }
```

- [ ] **Step 3: main.js — import** (`import * as cam from "./cam.js";` 아래)

```js
import { palmCenter, sampleFromLandmarks, makePointerState, applyHand } from "./hand-pointer.js";
```

- [ ] **Step 4: main.js — 포인터 규약 블록 수정**

`pointer` 초기 객체에 `hand` 추가:
```js
const pointer = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, dx: 0, dy: 0,
                  down: false, justDown: false, justUp: false, downTime: 0, inside: false,
                  hand: { visible: false, openness: 0, speed: 0 } };   // 손 합성 부가 정보(작품 선택 소비)
```
`snapshotPointer` 함수 바로 아래에 합성 블록 추가:
```js
// ---------- 손 → 포인터 합성 (handPointer: true 작품) ----------
// cam.js 계약: hands().x는 항상 거울 보정(1 − 원본)이지만 landmarks()의 좌표계는 구현에 따라
// 원본일 수도, 보정 후일 수도 있다. 상수로 고정하지 않고 매 프레임 hands().x와 손바닥 중심을
// 비교해 판별한다 — cam.js가 좌표계를 바꿔도 손이 반대로 움직이는 회귀가 생기지 않는다.
const handCursor = $("#hand-cursor");
let handState = makePointerState();
let stageW = 0, stageH = 0;   // sizeCanvas()의 CSS px — 합성 좌표 범위

function landmarksMirrored(h, lm) {
  const cx = palmCenter(lm).x;
  return Math.abs(h.x - cx) <= Math.abs(h.x - (1 - cx));   // 보정 후 좌표면 hands().x가 중심과 가깝다
}

function synthesizeHand(dt) {
  const work = WORKS[current];
  if (!(work && work.handPointer && cam.active())) {
    pointer.hand.visible = false; pointer.hand.openness = 0; pointer.hand.speed = 0;
    return false;
  }
  const h = cam.hands();                                  // 이 프레임의 추론 트리거(1회 캐시는 cam.js 보장)
  const lm = cam.landmarks();
  const primary = lm && lm[0];
  const sample = primary && primary.length >= 21
    ? sampleFromLandmarks(primary, landmarksMirrored(h, primary)) : null;
  return applyHand(pointer, sample, handState, dt, stageW, stageH);
}

function updateHandCursor(owns) {
  handCursor.hidden = !owns;
  if (!owns) return;
  handCursor.style.transform = `translate(${pointer.x}px, ${pointer.y}px) translate(-50%, -50%)`;
  handCursor.style.setProperty("--hand-open", pointer.hand.openness.toFixed(2));
  handCursor.classList.toggle("is-down", pointer.down);
}
```

- [ ] **Step 5: main.js — frame·openWork·resize·closeWork 배선**

`frame(now)`의 `snapshotPointer(dt);` 다음 줄:
```js
  updateHandCursor(synthesizeHand(dt));   // 손이 보이면 이 프레임의 포인터는 손
```
`openWork`의 `const { w, h } = sizeCanvas();` → `const { w, h } = sizeCanvas(); stageW = w; stageH = h;`
`resize` 리스너의 `const { w, h } = sizeCanvas();` → 같은 방식으로 `stageW = w; stageH = h;` 추가.
`closeWork`의 `cam.stop();` 줄 뒤:
```js
  handState = makePointerState(); handCursor.hidden = true;   // 합성 상태·링 커서 초기화
```

- [ ] **Step 6: 문법·회귀 확인**

Run: `node --check js/main.js && node --test test/`
Expected: 통과. (main.js는 브라우저 전용이라 import 테스트는 하지 않는다.)

- [ ] **Step 7: 커밋**

```bash
git add index.html css/style.css js/main.js
git commit -m "feat: 셸 손→포인터 합성 배선 — handPointer 작품에서 cam landmarks를 포인터 규약에 합성 + 링 커서

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -1
```

---

### Task 7: Playwright 시각 검증 — 대본 cam.js로 소용돌이·물보라·링 커서·폴백

**Files:**
- Create(scratchpad, 저장소 밖): `<scratchpad>/site-stub/` (worktree 복사본 + 대본 `js/cam.js`), `<scratchpad>/shots/*.png`
- 저장소 변경 없음(스크린샷은 보고용).

**Interfaces:**
- Consumes: Task 6까지의 전체 브랜치. 대본 모듈은 cam.js와 같은 export(`request/active/stop/hands/landmarks/video`)를 갖고, `request()` 이후 경과 시간으로 시나리오 랜드마크(거울 보정 후 좌표)를 돌려준다.

- [ ] **Step 1: 사이트 복사본 + 대본 cam.js 생성**

```bash
S=/tmp/claude-1000/-home-ec2-user-media-art2/6af3e924-c612-4f8f-8f42-ebbf91fd522f/scratchpad
rm -rf $S/site-stub && mkdir -p $S/site-stub $S/shots
rsync -a --exclude .git --exclude .worktrees --exclude node_modules /home/ec2-user/media-art2/.worktrees/wave-hand-gesture/ $S/site-stub/
cat > $S/site-stub/js/cam.js <<'JS'
// 대본 cam.js — 실제 카메라 대신 시나리오 랜드마크를 흘린다(거울 보정 후 좌표). 테스트 전용.
let on = false, t0 = 0;
export function active() { return on; }
export async function request() { on = true; t0 = performance.now(); return true; }
export function stop() { on = false; }
export function video() { return null; }
function mkHand(cx, cy, ratio, palm = 0.1) {          // test/hand-pointer.test.mjs의 mkHand와 동일 형상
  const wrist = { x: cx, y: cy + palm / 2 };
  const lm = Array.from({ length: 21 }, () => ({ x: wrist.x, y: wrist.y, z: 0 }));
  lm[0] = wrist; lm[9] = { x: cx, y: wrist.y - palm, z: 0 };
  lm[5] = { x: cx - palm * 0.3, y: wrist.y - palm, z: 0 }; lm[13] = { x: cx + palm * 0.3, y: wrist.y - palm, z: 0 };
  lm[17] = { x: cx + palm * 0.55, y: wrist.y - palm * 0.9, z: 0 };
  [4, 8, 12, 16, 20].forEach((i, k) => { const a = -Math.PI / 2 + (k - 2) * 0.35;
    lm[i] = { x: wrist.x + Math.cos(a) * palm * ratio, y: wrist.y + Math.sin(a) * palm * ratio, z: 0 }; });
  return lm;
}
// 시나리오(초): 0~2 펼친 손 좌→우 이동(소용돌이) · 2~2.6 주먹 · 2.6~4 펼침(2.6에 물보라) · 4~5.5 손 없음(마우스 폴백) · 반복
export function landmarks() {
  if (!on) return [];
  const t = ((performance.now() - t0) / 1000) % 5.5;
  if (t < 2) return [mkHand(0.3 + 0.4 * (t / 2), 0.5, 1.85)];
  if (t < 2.6) return [mkHand(0.7, 0.5, 1.1)];
  if (t < 4) return [mkHand(0.7, 0.5, 1.85)];
  return [];
}
export function hands() { const l = landmarks(); return l.length ? { n: 1, x: l[0][9].x, y: l[0][9].y } : { n: 0, x: -1, y: -1 }; }
JS
cd $S/site-stub && (python3 -m http.server 8094 >/dev/null 2>&1 &) && sleep 1 && curl -s -o /dev/null -w "8094: %{http_code}\n" http://127.0.0.1:8094/
```
Expected: `8094: 200`

- [ ] **Step 2: Playwright MCP로 01번 진입 → 📷 켜기**

1. `browser_navigate` → `http://127.0.0.1:8094/`
2. `browser_resize` 1280×800
3. `browser_evaluate`: `document.querySelector('.card[data-no="01"]').click()`
4. `browser_wait_for` 1.5초 → `browser_evaluate`: `document.querySelector('#v-cam').hidden` → Expected `false`(01번은 cam: true)
5. `browser_evaluate`: `document.querySelector('#v-cam').click()` → 0.5초 뒤 `document.querySelector('#v-cam').textContent` → Expected `📷 손을 비춰보세요`

- [ ] **Step 3: 시나리오 구간별 확인·스크린샷**

- 약 1초 시점(펼친 손 이동): `browser_evaluate` → `(() => { const c = document.querySelector('#hand-cursor'); return { hidden: c.hidden, down: c.classList.contains('is-down'), open: c.style.getPropertyValue('--hand-open'), tf: c.style.transform }; })()`
  Expected: `hidden false`, `down true`, `open ≈ 1.00`, transform의 x가 0→1280 사이에서 증가(두 번 읽어 비교). `browser_take_screenshot` → `$S/shots/01-hand-swirl.png`. 손 위치 주변 바다 입자가 소용돌이로 흐트러져 있어야 한다.
- 약 2.3초(주먹): 같은 evaluate → `down false`, `open ≈ 0.00`(링이 작아짐).
- 약 2.7초(펼침 직후 물보라): `browser_take_screenshot` → `01-hand-burst.png`. 손 위치에서 방사형으로 입자가 튄 흔적.
- 약 4.8초(손 없음): evaluate → `hidden true`. 마우스 폴백 확인: `browser_evaluate`로 `canvas.dispatchEvent(new PointerEvent('pointerdown', {clientX: 400, clientY: 400, pointerId: 1, bubbles: true}))` 후 pointerup → 스크린샷 `01-mouse-fallback.png`에 400,400 부근 물보라.

- [ ] **Step 4: 콘솔 에러·닫기/재진입 사이클**

- `browser_console_messages` → 에러 0건(경고 허용: 없음이 이상적).
- `browser_evaluate`: `document.querySelector('.viewer__close').click()` → `document.body.dataset.view === 'atrium'`, `#hand-cursor.hidden === true`, `#v-cam.hidden === true`.
- 다시 01번 진입 → `#v-cam` 텍스트가 초기 `📷 카메라로 체험하기`(대본 stop() 호출됨 = 세션당 리셋) 확인. 📷 재클릭 → 링 커서 다시 표시.
- 다른 작품(예: 02번)으로 `ArrowRight` 이동 → `#hand-cursor.hidden === true`(02번은 handPointer 없음), 콘솔 에러 0.

- [ ] **Step 5: 결과 기록**

스크린샷 3장 경로와 각 확인값을 작업 보고에 기록한다. 실패 항목은 원인을 고쳐 Task 6에 fix 커밋으로 반영 후 재검증. 서버 정리: `pkill -f "http.server 8094"`.

---

### Task 8: 가짜 카메라 E2E — 실제 cam.js 경로(CDN → 검출 → 합성) 헤드리스 1회 시도

**Files:**
- Create(scratchpad): `<scratchpad>/e2e/hand.y4m`, `<scratchpad>/e2e/run.mjs`
- 저장소 변경 없음. 실패해도 브랜치는 완료 가능(결과를 그대로 보고).

**Interfaces:**
- Consumes: Task 5의 실제 `js/cam.js`(CDN 버전은 cam.js가 정함), 시스템 `/usr/bin/google-chrome`, `ffmpeg`(`~/.cache/ms-playwright/ffmpeg-1011` 또는 시스템).

- [ ] **Step 1: 퍼블릭 도메인 손 사진 → y4m**

```bash
S=/tmp/claude-1000/-home-ec2-user-media-art2/6af3e924-c612-4f8f-8f42-ebbf91fd522f/scratchpad
mkdir -p $S/e2e && cd $S/e2e
# Wikimedia Commons의 퍼블릭 도메인/CC0 '펼친 손바닥' 사진 1장을 내려받는다(파일명은 검색 결과로 확정).
# 예: curl -L -o hand.jpg "https://upload.wikimedia.org/wikipedia/commons/<경로>/<파일>.jpg"
python3 - <<'PY'
from PIL import Image
im = Image.open("hand.jpg").convert("RGB")
# 640x480로 레터박스 — 손이 프레임 중앙 70% 안에 오도록 여백 포함
bg = Image.new("RGB", (640, 480), (40, 40, 40)); im.thumbnail((440, 330)); bg.paste(im, ((640-im.width)//2, (480-im.height)//2)); bg.save("hand.png")
PY
FF=$(ls ~/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux 2>/dev/null | head -1); FF=${FF:-ffmpeg}
$FF -y -loop 1 -i hand.png -t 6 -r 30 -pix_fmt yuv420p hand.y4m && ls -la hand.y4m
```
Expected: `hand.y4m` 생성(약 6초 × 30fps × 640×480, ~80MB).

- [ ] **Step 2: playwright-core 확보 후 스크립트 작성**

```bash
cd $S/e2e && (ls node_modules/playwright-core >/dev/null 2>&1 || npm init -y >/dev/null && npm i --no-audit --no-fund playwright-core@1 >/dev/null) && echo ok
```
`run.mjs`:
```js
import { chromium } from "playwright-core";
const S = process.argv[2], site = process.argv[3];   // scratchpad, 사이트 URL(실제 cam.js가 있는 worktree 서버)
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: [
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
  `--use-file-for-fake-video-capture=${S}/e2e/hand.y4m`, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
]});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(site); await page.click('.card[data-no="01"]'); await page.waitForTimeout(1500);
await page.click("#v-cam");
await page.waitForFunction(() => /비춰보세요|사용할 수 없어요/.test(document.querySelector("#v-cam").textContent), null, { timeout: 90000 });
const label = await page.textContent("#v-cam");
await page.waitForTimeout(3000);
const cursor = await page.evaluate(() => { const c = document.querySelector("#hand-cursor"); return { hidden: c.hidden, open: c.style.getPropertyValue("--hand-open"), tf: c.style.transform }; });
await page.screenshot({ path: `${S}/shots/01-e2e-fake-camera.png` });
console.log(JSON.stringify({ label, cursor, errors }, null, 2));
await browser.close();
```
Run: `cd /home/ec2-user/media-art2/.worktrees/wave-hand-gesture && (python3 -m http.server 8095 >/dev/null 2>&1 &) && sleep 1 && cd $S/e2e && node run.mjs $S http://127.0.0.1:8095/`
Expected(성공): `label: 📷 손을 비춰보세요`, `cursor.hidden: false`, `open` 0.7 이상(펼친 손 사진), 스크린샷에 링 커서. 실패 유형별 보고: 라벨이 "사용할 수 없어요"면 콘솔 에러(WebGL/CDN)를 그대로 기록; 라벨은 활성인데 `hidden: true`면 검출 실패(사진·조명) — 다른 사진 1회 재시도 후 보고.

- [ ] **Step 3: 정리·기록**

`pkill -f "http.server 8095"`. 결과 JSON과 스크린샷 경로를 보고에 기록. 이 Task의 실패는 브랜치 완료를 막지 않는다 — **실제 웹캠 검증은 사용자 몫**임을 보고에 명시.

---

### Task 9: README — 카메라 손짓 안내(한/영)

**Files:**
- Modify: `README.md` (Features/주요 기능 목록, Usage/사용법 목록)

**Interfaces:** 없음.

- [ ] **Step 1: 영어 Features 목록의 "Zero-build architecture" 항목 다음 줄에 추가**(cam.js 브랜치가 이미 같은 취지의 항목을 넣었으면 그 항목에 01번 문구만 덧붙인다)

```markdown
- **Hand-gesture works** — pressing the 📷 button in a work loads MediaPipe Hand Landmarker on demand (pinned CDN version) and the shell synthesizes the hand into the pointer contract: in Great Wave an open palm stirs the sea and a fist-to-open flick throws spray. Nothing external is downloaded until the button is pressed; the mouse keeps working as a fallback
```

- [ ] **Step 2: 영어 Usage 목록에 추가**

```markdown
- In Great Wave (No. 01), press 📷 to control the sea by hand: an open palm dragged through the water swirls it, closing a fist and opening it again throws spray
```

- [ ] **Step 3: 한국어 주요 기능·사용법에 대응 문장 추가**

주요 기능:
```markdown
- **손짓 인터랙션 작품** — 작품 안 📷 버튼을 누른 시점에만 MediaPipe Hand Landmarker(CDN, 버전 고정)를 불러오고, 셸이 손을 포인터 규약으로 합성합니다. 가나가와 파도에서는 펼친 손이 바다를 휘젓고 주먹을 쥐었다 펼치면 물보라가 튑니다. 버튼을 누르기 전에는 외부 다운로드가 없고 마우스는 폴백으로 계속 동작합니다
```
사용법:
```markdown
- 01번 가나가와 파도에서 📷를 누르면 손으로 바다를 다룹니다. 펼친 손을 움직이면 소용돌이, 주먹을 쥐었다 펼치면 물보라
```

- [ ] **Step 4: 커밋**

```bash
git add README.md
git commit -m "docs: README — 01번 손짓 인터랙션(📷 MediaPipe 온디맨드 로드·마우스 폴백) 안내 한/영

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log --oneline -1
```

---

### Task 10: 마무리 — 전체 테스트·브랜치 리뷰·보고

**Files:** 변경 없음(리뷰 지적 사항이 있으면 fix 커밋).

- [ ] **Step 1: 전체 테스트·정적 확인**

Run: `node --test test/ && for f in js/*.js js/pieces/*.js; do node --check $f || echo "FAIL $f"; done`
Expected: 전부 PASS, FAIL 없음.

- [ ] **Step 2: 브랜치 전체 코드 리뷰** — superpowers:requesting-code-review로 `master..HEAD`(merge된 cam.js 브랜치 커밋은 그쪽 소유 — 01번 고유 변경 `js/hand-pointer.js`, `js/main.js` 합성 블록, `js/data.js` 01번, `js/pieces/01-great-wave.js`, `test/hand-pointer.test.mjs`, `test/data.test.mjs`, css/html 링 커서, README에 집중). 지적 사항은 fix 커밋으로 반영 후 Step 1 재실행.

- [ ] **Step 3: 사용자 보고(merge·배포는 사용자 결정)**

보고에 반드시 포함: (1) 스크린샷 3장(Task 7) + E2E 결과(Task 8), (2) **실제 웹캠 수동 검증 필요** — 로컬 `python3 -m http.server 8090` 후 01번 → 📷 → 손 펼쳐 이동·주먹→펼침, 펼침 정도 보정 상수(RATIO_FIST/RATIO_OPEN)가 맞는지 관찰, (3) merge 순서 제안: `feature/babel-camera`(또는 cam.js 소유 브랜치) → master 먼저, 그 다음 이 브랜치 → master(다른 카메라 브랜치 03·11번과 `js/main.js`·`js/data.js`·`test/data.test.mjs` 충돌 가능, 각 항목 모두 유지로 해소), (4) 배포 전 콘텐츠 품질 게이트(content-review-agent ≥ 85)와 `./tools/deploy.sh`는 사용자 승인 뒤 진행.
