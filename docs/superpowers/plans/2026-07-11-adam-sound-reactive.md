# 09번 Creation of Adam 소리 반응 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 09번 작품의 "생명의 불꽃" 충전을 마이크 입력(숨·목소리)으로 일으킨다. 커서 근접 충전은 폴백으로 유지.

**Architecture:** 셸(main.js)이 소유하는 공용 마이크 서비스 `js/mic.js`를 신설하고, 작품에 이미 전달 중인 `audio` opts를 `{ enabled, mic: { active(), level() } }`로 확장한다. 09번 피스는 매 프레임 `level()`을 폴링해 기존 상태 기계의 충전 속도에만 반영한다(상태 기계 무변경). 마이크는 뷰어 내 🎤 버튼으로만 활성화된다.

**Tech Stack:** 순수 ES 모듈(빌드 없음), Web Audio API(AnalyserNode), node:test.

**Spec:** `docs/superpowers/specs/2026-07-11-adam-sound-reactive-design.md`

## Global Constraints

- 의존성 추가 금지 — 저장소는 npm 패키지 0개, 브라우저 네이티브 API만 사용.
- 주석·문구는 한국어, 기존 파일의 주석 밀도·스타일을 따른다.
- 테스트는 `node --test test/`로 실행되는 node:test. 피스/서비스 모듈에서 **순수 함수를 export**해 검증한다(브라우저 API는 import 시점에 참조 금지).
- 로컬 확인은 `python3 -m http.server 8090` (8080은 무관한 Flask 앱이 점유).
- 상태 기계(`ready → ignite → cooldown`)와 기존 15개 작품의 동작은 변경 금지.
- 커밋 메시지는 기존 스타일(`feat:`/`fix:`/`docs:` + 한국어 요약).

---

### Task 1: js/mic.js — 레벨 정규화 순수 함수 + 마이크 서비스

**Files:**
- Create: `js/mic.js`
- Test: `test/mic.test.mjs`

**Interfaces:**
- Produces (순수부): `makeLevelState(): {floor:number, smooth:number}`, `normalizeLevel(rms:number, dt:number, s:LevelState): number(0..1)`
- Produces (서비스부, 브라우저 전용): `request(): Promise<boolean>`, `active(): boolean`, `level(): number`, `stop(): void`
- Task 3(main.js)이 `request/active/level/stop`을, Task 4(09번 피스)가 opts 경유로 `active/level`을 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/mic.test.mjs`:

```js
// test/mic.test.mjs — 마이크 레벨 정규화(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLevelState, normalizeLevel } from "../js/mic.js";

// dt 60fps로 sec초 동안 일정 rms를 흘린다
const feed = (s, rms, sec) => {
  let out = 0;
  for (let i = 0; i < Math.round(sec * 60); i++) out = normalizeLevel(rms, 1 / 60, s);
  return out;
};

test("무음이면 레벨은 0으로 수렴한다", () => {
  const s = makeLevelState();
  assert.ok(feed(s, 0, 2) < 0.01);
});

test("또렷한 소리는 빠르게(attack) 레벨을 올린다", () => {
  const s = makeLevelState();
  feed(s, 0, 1);                        // 플로어 안정화
  const lv = feed(s, 0.3, 0.3);         // 0.3초 만에
  assert.ok(lv > 0.5, `attack 후 레벨 ${lv}`);
});

test("소리가 멎으면 천천히(release) 내려간다 — 즉시 0이 아니다", () => {
  const s = makeLevelState();
  feed(s, 0, 1);
  feed(s, 0.3, 1);                      // 충분히 올린 뒤
  const justAfter = feed(s, 0, 0.1);    // 0.1초 무음
  assert.ok(justAfter > 0.2, `release 직후 ${justAfter}`);
  assert.ok(feed(s, 0, 3) < 0.05, "3초 무음이면 거의 0");
});

test("지속 소음은 플로어로 흡수된다 — 웅성거림에 계속 충전되지 않는다", () => {
  const s = makeLevelState();
  const lv = feed(s, 0.15, 60);         // 60초 내내 일정한 배경 소음
  assert.ok(lv < 0.3, `플로어 흡수 후 ${lv}`);
});

test("레벨은 항상 0..1로 클램프된다", () => {
  const s = makeLevelState();
  assert.ok(feed(s, 5, 1) <= 1);
  assert.ok(feed(s, -1, 1) >= 0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/mic.test.mjs`
Expected: FAIL — `Cannot find module '../js/mic.js'`

- [ ] **Step 3: 구현**

`js/mic.js`:

```js
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
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/mic.test.mjs`
Expected: PASS (5 tests). 상수를 조정해야 통과한다면 상수만 조정(구조 변경 금지).

- [ ] **Step 5: 기존 테스트 전체 확인 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS

```bash
git add js/mic.js test/mic.test.mjs
git commit -m "feat: 공용 마이크 서비스 mic.js — 노이즈 플로어·스무딩 순수 로직 + 테스트"
```

---

### Task 2: data.js — 09번 mic 플래그와 힌트

**Files:**
- Modify: `js/data.js` (09번 항목, 72행 부근)
- Test: `test/data.test.mjs` (기존 — 추가 검증 1건)

**Interfaces:**
- Produces: `WORKS[8].mic === true` — Task 3의 버튼 노출 조건.

- [ ] **Step 1: 실패하는 테스트 추가**

`test/data.test.mjs` 끝에 추가:

```js
test("mic 플래그는 boolean이며 현재는 09번에만 있다", () => {
  for (const w of WORKS) {
    if ("mic" in w) assert.equal(typeof w.mic, "boolean", `${w.no}.mic 타입`);
  }
  assert.deepEqual(WORKS.filter(w => w.mic).map(w => w.no), ["09"]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/data.test.mjs`
Expected: FAIL — `deepEqual [] ["09"]`

- [ ] **Step 3: data.js 수정**

09번 항목(`no: "09"`)에서 hint를 바꾸고 `mic: true`를 추가:

```js
    hint: "🎤를 켜고 소리로 생명을 불어넣으세요 · 커서로도 가능합니다",
    mic: true,
    module: "./pieces/09-creation-of-adam.js", asset: "assets/targets/09-creation-of-adam.jpg",
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/data.test.mjs`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add js/data.js test/data.test.mjs
git commit -m "feat: 09번 mic 플래그 + 소리 안내 힌트"
```

---

### Task 3: 뷰어 🎤 버튼 — index.html + css + main.js 배선

**Files:**
- Modify: `index.html:60-61` (`#v-hint` 아래)
- Modify: `css/style.css` (`.viewer__hint` 규칙 아래)
- Modify: `js/main.js` (import, 버튼 로직, opts 확장, closeWork)

**Interfaces:**
- Consumes: Task 1의 `request/active/level/stop`, Task 2의 `work.mic`.
- Produces: 작품 opts `audio: { enabled: () => boolean, mic: { active: () => boolean, level: () => number } }` — Task 4가 소비.

- [ ] **Step 1: index.html에 버튼 추가**

`<p class="viewer__hint" id="v-hint"></p>` 바로 다음 줄:

```html
        <button class="viewer__mic" id="v-mic" hidden aria-pressed="false">🎤 소리로 생명 불어넣기</button>
```

- [ ] **Step 2: css/style.css에 스타일 추가**

`.viewer__hint` 규칙 바로 아래:

```css
.viewer__mic {
  margin-top: 10px; padding: 7px 14px; font: inherit; font-size: 12px;
  color: var(--accent); background: transparent;
  border: 1px solid var(--accent); border-radius: 999px; cursor: pointer;
}
.viewer__mic[aria-pressed="true"] { color: #14141a; background: var(--accent); }
.viewer__mic:disabled { opacity: 0.45; cursor: default; }
```

- [ ] **Step 3: main.js 배선**

(a) 상단 import (2행 `data.js` import 아래):

```js
import * as mic from "./mic.js";
```

(b) "사운드 전역 토글" 블록 아래에 버튼 로직:

```js
// ---------- 마이크 (mic: true 작품에서만 버튼 노출) ----------
const micBtn = $("#v-mic");
const MIC_LABEL = "🎤 소리로 생명 불어넣기";
function resetMicBtn() {
  micBtn.setAttribute("aria-pressed", "false");
  micBtn.disabled = false;
  micBtn.textContent = MIC_LABEL;
}
micBtn.addEventListener("click", async () => {
  if (mic.active()) { mic.stop(); resetMicBtn(); return; } // 토글 오프
  micBtn.disabled = true;
  const ok = await mic.request();
  micBtn.disabled = false;
  if (ok) {
    micBtn.setAttribute("aria-pressed", "true");
    micBtn.textContent = "🎤 듣는 중 — 소리를 내보세요";
  } else {
    micBtn.disabled = true; // 권한 거부/미지원: 커서 폴백 안내
    micBtn.textContent = "마이크를 사용할 수 없어요 — 커서로 체험하세요";
  }
});
```

(c) `openWork` 안에서 `$("#v-hint").textContent = work.hint;` 다음 줄:

```js
  micBtn.hidden = !work.mic;
```

(d) `piece.init` 호출의 audio 인자 확장 (기존 `audio: { enabled: () => soundOn }` 교체):

```js
                 audio: { enabled: () => soundOn,
                          mic: { active: () => mic.active(), level: () => mic.level() } } });
```

(e) `closeWork` 안에서 `piece = null;` 다음 줄:

```js
  mic.stop(); resetMicBtn(); micBtn.hidden = true;
```

- [ ] **Step 4: 수동 스모크 (마이크 없이)**

Run: `python3 -m http.server 8090 --bind 127.0.0.1` (백그라운드) 후 브라우저로 확인:
- 09번 진입 → 🎤 버튼 보임 / 다른 작품(08, 10) 진입 → 버튼 없음
- 뷰어 닫기 → 버튼 상태 초기화, 콘솔 오류 0건 (getUserMedia 없는 환경이면 버튼 클릭 시 "사용할 수 없어요" 문구 확인)

- [ ] **Step 5: 전체 테스트 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS

```bash
git add index.html css/style.css js/main.js
git commit -m "feat: 뷰어 마이크 버튼과 mic 서비스 배선 — opts.audio.mic 규약 추가"
```

---

### Task 4: 09번 피스 — 소리 충전 로직

**Files:**
- Modify: `js/pieces/09-creation-of-adam.js`
- Test: `test/adam.test.mjs` (신규)

**Interfaces:**
- Consumes: `opts.audio.mic.active(): boolean`, `opts.audio.mic.level(): number`
- Produces (순수부 export): `SOUND_GATE = 0.1`, `SOUND_FULL = 0.5`, `soundStrength(level:number): number(0..1)`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/adam.test.mjs`:

```js
// test/adam.test.mjs — 09번 소리→충전 세기 매핑(순수 로직) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { SOUND_GATE, SOUND_FULL, soundStrength } from "../js/pieces/09-creation-of-adam.js";

test("게이트 이하(속삭임)는 충전되지 않는다", () => {
  assert.equal(soundStrength(0), 0);
  assert.equal(soundStrength(SOUND_GATE), 0);
  assert.equal(soundStrength(SOUND_GATE - 0.05), 0);
});

test("FULL 이상(또렷한 소리)은 최대 속도로 충전한다", () => {
  assert.equal(soundStrength(SOUND_FULL), 1);
  assert.equal(soundStrength(1), 1);
});

test("게이트와 FULL 사이는 선형이다", () => {
  const mid = (SOUND_GATE + SOUND_FULL) / 2;
  assert.ok(Math.abs(soundStrength(mid) - 0.5) < 1e-9);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/adam.test.mjs`
Expected: FAIL — `SOUND_GATE` export 없음

- [ ] **Step 3: 피스 수정**

(a) 파일 상단 상수부(`WARM_TIME` 아래)에 순수부 export:

```js
// ---- 소리 → 충전 세기 (순수, node:test 대상) ----
export const SOUND_GATE = 0.1;  // 이하 무시(속삭임·잔류 소음)
export const SOUND_FULL = 0.5;  // 이상 최대 충전 속도
export function soundStrength(level) {
  return Math.max(0, Math.min(1, (level - SOUND_GATE) / (SOUND_FULL - SOUND_GATE)));
}
```

(b) 모듈 상태에 추가 (`let phase = "ready";` 위):

```js
let mic = null, soundRate = 0; // 마이크 getter(없으면 null)와 이번 프레임 소리 세기
```

(c) `init`에서 보관·초기화 (`computeTips();` 직전):

```js
    mic = (opts.audio && opts.audio.mic) || null;
    soundRate = 0;
```

(d) `updateState`의 `ready` 분기를 소리 입력과 병행하도록 교체. 기존:

```js
  if (phase === "ready") {
    if (near) {
      charge = Math.min(1, charge + dt / CHARGE_TIME);
      tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); awayT = 0;
    } else {
      charge = Math.max(0, charge - dt * 0.9);
      awayT += dt; if (awayT > 0.4) { tMin = 1; tMax = 0; }
    }
```

교체 후:

```js
  if (phase === "ready") {
    soundRate = mic && mic.active() ? soundStrength(mic.level()) : 0;
    const rate = Math.max(near ? 1 : 0, soundRate); // 커서·소리 중 큰 쪽
    if (rate > 0) charge = Math.min(1, charge + (dt / CHARGE_TIME) * rate);
    else charge = Math.max(0, charge - dt * 0.9);
    if (near) { tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); awayT = 0; }
    else { awayT += dt; if (awayT > 0.4) { tMin = 1; tMax = 0; } }
```

(`ignite`/`cooldown` 분기와 traverse 판정 `if (charge >= 1 || ...)` 은 그대로.)

(e) `tick`의 효과 렌더에서 소리 충전 중 가상 포인터 스파크. 기존:

```js
    if (phase === "ready") {
      if (P && near && charge > 0.01) drawChargeSparks(P);
```

교체 후:

```js
    if (phase === "ready") {
      if (P && near && charge > 0.01) drawChargeSparks(P);
      else if (soundRate > 0 && charge > 0.01)
        drawChargeSparks({ x: (A.x + B.x) / 2 + Math.sin(T * 7) * 6,
                           y: (A.y + B.y) / 2 + Math.cos(T * 9) * 6 }); // 간극 중점이 숨결에 흔들리듯
```

(f) `dispose`에 `mic = null;` 추가.

- [ ] **Step 4: 통과 확인**

Run: `node --test test/adam.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: 전체 테스트 후 커밋**

Run: `node --test test/`
Expected: 전체 PASS

```bash
git add js/pieces/09-creation-of-adam.js test/adam.test.mjs
git commit -m "feat: 09번 소리 충전 — mic level 폴링으로 정전기 충전, 커서 폴백 병행"
```

---

### Task 5: E2E 시각 검증 (가짜 마이크 주입)

**Files:**
- 없음 (검증 전용 — 코드 수정이 나오면 해당 Task로 돌아가 고친 뒤 재검증)

**Interfaces:**
- Consumes: Task 1–4 전체.

- [ ] **Step 1: 서버 + 브라우저로 09번 진입**

`python3 -m http.server 8090 --bind 127.0.0.1` 실행 후 Playwright로 `http://127.0.0.1:8090/` 접속, `button[data-no="09"]` 클릭.

- [ ] **Step 2: getUserMedia를 오실레이터 스트림으로 오버라이드**

버튼 클릭 **전에** 페이지 컨텍스트에서 실행 (실제 마이크 없이 E2E):

```js
() => {
  const ac = new AudioContext();
  const osc = ac.createOscillator(), g = ac.createGain();
  g.gain.value = 0.4; // normalizeLevel 기준 또렷한 소리
  const dest = ac.createMediaStreamDestination();
  osc.connect(g); g.connect(dest); osc.start();
  navigator.mediaDevices.getUserMedia = async () => dest.stream;
  return "fake mic ready";
}
```

- [ ] **Step 3: 🎤 버튼 클릭 → 충전 → 방전 확인**

`#v-mic` 클릭 후:
- 즉시: `aria-pressed="true"`, 라벨 "듣는 중" 확인
- ~0.5초: 스크린샷 — 손끝 사이 스파크(충전) 보임
- ~2.5초: 스크린샷 — 대형 아크 방전 or 금빛 입자/따뜻한 화면(warmth) 흔적
- 콘솔 오류 0건

- [ ] **Step 4: 정리 동작 확인**

뷰어 닫기(`.viewer__close`) → 다시 09번 진입: 버튼이 초기 라벨·`aria-pressed="false"`로 복원됐는지, 다른 작품(예: 10번) 진입 시 버튼이 숨겨지는지 확인.

- [ ] **Step 5: 마무리**

Run: `node --test test/`
Expected: 전체 PASS

발견된 문제가 없으면 완료. 실제 마이크 최종 확인은 배포 후 사용자가 1회 수행(HTTPS 필요 — CloudFront 충족).
