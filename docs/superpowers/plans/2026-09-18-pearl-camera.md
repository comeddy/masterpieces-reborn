# 03번 진주 귀걸이 카메라 손 인터랙션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 03번 After Vermeer의 마우스 인터랙션(드래그=촛불 바람, 클릭=깜빡임 파동)을 카메라 손 추적(손 속도=바람, 핀치=파동)으로 구현하고, 그 전제인 공용 카메라 계층을 세션 간 계약대로 바로잡는다.

**Architecture:** 공용 `js/cam.js`(MediaPipe Hands, `feature/babel-camera`에 이미 구현됨)를 계약에 맞게 수정(거울 보정 landmarks·프레임당 1회 탐지·`drawMirror`·중립 문구)한 뒤 `feature/pearl-camera`에 merge한다. 03번 피스는 `opts.cam` getter만 읽어 순수 함수 `handWind`/`pinchStep`으로 판정하고, 기존 `field.scatter`/`applyBuoyancy`/`flicker` 경로를 그대로 호출한다. 마우스 경로는 무변경 병행.

**Tech Stack:** 순수 ES 모듈(빌드 없음), MediaPipe tasks-vision 0.10.14(CDN, `request()` 내 동적 import만), Canvas 2D, node:test, Playwright MCP.

**Spec:** `docs/superpowers/specs/2026-09-18-pearl-camera-design.md`

## Global Constraints

- 의존성 추가 금지(npm 패키지 0개). MediaPipe는 `cam.js`의 `request()` 안에서만 동적 `import()`.
- 모든 작품 모듈과 `cam.js`는 node에서 import-safe(모듈 레벨에서 브라우저 API 미참조) — `test/integrity.test.mjs`가 강제.
- 작업 디렉터리: **두 worktree**를 쓴다. 공용 계층(Task 1~3)은 `/home/ec2-user/media-art2/.worktrees/cam-contract`(브랜치 `feature/babel-camera`), 03번(Task 4~8)은 `/home/ec2-user/media-art2/.worktrees/pearl-camera`(브랜치 `feature/pearl-camera`). 메인 체크아웃 `/home/ec2-user/media-art2`에서는 `git checkout`·커밋 금지(다른 세션이 HEAD 공유). bare `git stash` 금지.
- 📷 버튼 문구(작품 중립, 정확히 이 문자열): 대기 `📷 카메라로 체험하기` · 요청 중 `📷 카메라 준비 중…` · 활성 `📷 손을 비춰보세요` · 실패 `카메라를 사용할 수 없어요 — 마우스로 체험하세요`.
- `landmarks()`·`hands()` 좌표계: **거울 보정 후**(x는 1-x) 0..1 정규화. 주 손은 `landmarks()[0]`.
- `test/data.test.mjs`의 `cam` 플래그 검사는 `typeof boolean`만(번호 목록 하드코딩 금지).
- 03번 시각 효과 코드(`drawBackground`/`drawParticles`/`drawPearls`/`applyBuoyancy`/`tagPearls`)는 수정 금지 — 입력 경로와 렌더 2단계만 추가.
- 한국어 주석·UI 문구. 커밋 메시지는 `feat:`/`fix:`/`test:`/`docs:` 접두 + 한국어 요약, 말미에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 로컬 서버는 8090대 포트(`python3 -m http.server 809x --bind 127.0.0.1 -d <worktree>`). 8080 사용 금지.
- 테스트 실행은 항상 해당 worktree 루트에서 `node --test test/`.

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `js/cam.js` (babel) | 공용 카메라 서비스. 순수 헬퍼 `mirrorLandmarks`·`palmPoint` export, 프레임당 1회 `detect()`, `drawMirror` | 2, 3 |
| `js/main.js` (babel) | 📷 버튼 문구 중립화(cherry-pick), `opts.cam`에 `drawMirror` getter 추가 | 1, 3 |
| `index.html` (babel) | `#v-cam` 초기 라벨 중립화(cherry-pick) | 1 |
| `test/data.test.mjs` (babel) | cam 플래그 boolean-only | 1 |
| `test/cam.test.mjs` (babel, 신규) | `mirrorLandmarks`·`palmPoint` 검증 | 2 |
| `js/pieces/10-tower-of-babel.js` (babel) | 거울 보정된 landmarks 소비로 수정, `drawCamMirror` → `cam.drawMirror` | 2, 3 |
| `js/data.js` (pearl) | 03번 `cam: true`, hint·note 갱신 | 4 |
| `js/pieces/03-pearl-earring.js` (pearl) | 순수 함수 `makeHandState`/`handWind`/`pinchRatio`/`makePinchState`/`pinchStep` export, 손 입력 소비, `drawHandCursor`, 미러 호출 | 5, 6, 7 |
| `test/pearl-gesture.test.mjs` (pearl, 신규) | 위 순수 함수 검증 | 5, 6 |
| `test/fixtures/fake-vision/vision_bundle.mjs` (pearl) | 가짜 MediaPipe에 핀치·손 형태 연출 추가 | 8 |

---

### Task 0: worktree 준비

**Files:** 없음(git 메타만)

- [ ] **Step 1: 공용 수정용 브랜치·worktree 생성**

`feature/babel-camera`는 다른 세션의 worktree(`.worktrees/babel-camera`)에 체크아웃돼 있어 같은 브랜치를 두 곳에서 열 수 없다. babel 끝에서 새 브랜치 `feature/cam-contract`를 따서 전용 worktree에서 작업하고, Task 3 끝에 babel로 fast-forward한다.

Run:
```bash
cd /home/ec2-user/media-art2 && git worktree add -b feature/cam-contract .worktrees/cam-contract feature/babel-camera && git -C .worktrees/cam-contract log --oneline -1
```
Expected: `02eb1c0 fix: 10번 탑 높이 상한 MAX_TIERS=40 …` (babel 끝이 더 진행됐으면 그 해시 — 무관). 10번 피스 행 번호는 이 커밋 기준 근사치이므로 함수명으로 찾는다.

- [ ] **Step 2: 두 worktree 기준 테스트**

Run:
```bash
cd /home/ec2-user/media-art2/.worktrees/cam-contract && node --test test/ 2>&1 | tail -4
cd /home/ec2-user/media-art2/.worktrees/pearl-camera && node --test test/ 2>&1 | tail -4
```
Expected: 두 곳 모두 `# fail 0`

---

### Task 1: 공용 📷 문구 중립화 + data.test boolean-only (babel)

**Files:**
- Modify: `js/main.js:46,63,66`, `index.html:62` (cherry-pick c4138c7)
- Modify: `test/data.test.mjs:48-53`

**Interfaces:**
- Produces: 버튼 문구 4종(Global Constraints 참조). `data.test`는 `cam` 플래그가 있으면 boolean인지만 검사.

- [ ] **Step 1: 01번 세션의 중립화 커밋 cherry-pick**

Run:
```bash
cd /home/ec2-user/media-art2/.worktrees/cam-contract && git cherry-pick c4138c7 && git show --stat --oneline HEAD | head -5
```
Expected: `index.html | 2 +-`, `js/main.js | 8 ++++----`. 충돌 시 `git cherry-pick --abort` 후 아래 문자열로 수동 수정: `CAM_LABEL = "📷 카메라로 체험하기"`, 활성 `"📷 손을 비춰보세요"`, 실패 `"카메라를 사용할 수 없어요 — 마우스로 체험하세요"`, `index.html` 버튼 텍스트 `📷 카메라로 체험하기`.

- [ ] **Step 2: 문구 확인**

Run:
```bash
cd /home/ec2-user/media-art2/.worktrees/cam-contract && grep -n "📷\|카메라를 사용할 수 없어요" js/main.js index.html
```
Expected: 4개 문구가 Global Constraints와 정확히 일치. `쌓기`·`붕괴`·`클릭으로 체험` 문자열은 `main.js`·`index.html`에 없음.

- [ ] **Step 3: data.test를 boolean-only로 수정**

`test/data.test.mjs`의 기존 cam 테스트(`"cam 플래그는 boolean이며 현재는 10번에만 있다"`) 블록 전체를 다음으로 교체. **글자 하나까지 아래와 동일하게** — 01번(480e394)·11번 브랜치가 같은 텍스트를 넣어 master 병합 시 자동 합쳐진다:

```js
test("cam 플래그는 boolean이다", () => {
  for (const w of WORKS) {
    if ("cam" in w) assert.equal(typeof w.cam, "boolean", `${w.no}.cam 타입`);
  }
});
```

- [ ] **Step 4: 테스트**

Run: `cd /home/ec2-user/media-art2/.worktrees/cam-contract && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0`

- [ ] **Step 5: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/cam-contract && git add test/data.test.mjs && git commit -m "$(cat <<'EOF'
test: cam 플래그 검사를 boolean-only로 — 01·03·11번도 cam: true가 되므로 번호 고정 제거

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: cam.js — landmarks 거울 보정 · 프레임당 1회 탐지 · 순수 헬퍼 (babel)

**Files:**
- Modify: `js/cam.js` (전체 구조 유지, 아래 diff 부분만)
- Modify: `js/pieces/10-tower-of-babel.js:283` (`drawHandCursors` 거울 이중 반전 제거)
- Create: `test/cam.test.mjs`

**Interfaces:**
- Produces: `export function mirrorLandmarks(hands)` — `Array<Array<{x,y,z}>>` → 같은 형태, 각 점 `x → 1 - x`. `export function palmPoint(lm)` — 21점 배열 → `{x, y}` (랜드마크 5·9의 중점, 입력이 이미 거울 보정된 좌표라고 가정). `landmarks()`는 이제 **거울 보정 후** 좌표. `hands()`·`landmarks()` 어느 쪽이 먼저 불려도 프레임당 1회만 `detectForVideo`.
- Consumes: 없음.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/cam.test.mjs`

```js
// test/cam.test.mjs — cam.js 순수 헬퍼(거울 보정·손바닥 대표점) 검증. 브라우저 API 미참조.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mirrorLandmarks, palmPoint } from "../js/cam.js";

const pt = (x, y) => ({ x, y, z: 0 });
const hand = (fn) => Array.from({ length: 21 }, (_, i) => fn(i));

test("mirrorLandmarks: 모든 점의 x가 1-x로 반전되고 y·z는 유지된다", () => {
  const raw = [hand((i) => pt(0.1 + i * 0.01, 0.5 + i * 0.01))];
  const m = mirrorLandmarks(raw);
  assert.equal(m.length, 1);
  assert.equal(m[0].length, 21);
  for (let i = 0; i < 21; i++) {
    assert.ok(Math.abs(m[0][i].x - (1 - raw[0][i].x)) < 1e-12, `x[${i}]`);
    assert.equal(m[0][i].y, raw[0][i].y, `y[${i}]`);
    assert.equal(m[0][i].z, 0);
  }
  assert.notEqual(m[0], raw[0], "원본 배열을 변경하지 않고 새 배열을 만든다");
  assert.ok(Math.abs(raw[0][3].x - 0.13) < 1e-12, "원본 값 불변");
});

test("mirrorLandmarks: 빈 입력은 빈 배열", () => {
  assert.deepEqual(mirrorLandmarks([]), []);
});

test("palmPoint: 랜드마크 5·9의 중점", () => {
  const lm = hand((i) => (i === 5 ? pt(0.2, 0.6) : i === 9 ? pt(0.4, 0.8) : pt(0, 0)));
  const p = palmPoint(lm);
  assert.ok(Math.abs(p.x - 0.3) < 1e-12 && Math.abs(p.y - 0.7) < 1e-12, JSON.stringify(p));
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/cam-contract && node --test test/cam.test.mjs 2>&1 | tail -6`
Expected: FAIL — `mirrorLandmarks`/`palmPoint` export 없음(SyntaxError: does not provide an export named …)

- [ ] **Step 3: cam.js 수정**

(a) 파일 상단 주석(1~5행)에 좌표계 한 줄 추가:
```js
// 좌표계: hands()·landmarks()는 모두 **거울 보정 후**(x → 1-x) 0..1 정규화 좌표다.
// 관객이 오른쪽으로 손을 움직이면 x가 커진다. 주 손은 landmarks()[0].
```

(b) `MODEL_URL` 선언 아래에 순수 헬퍼 추가:
```js
// ---- 순수 헬퍼 (node:test 대상, 브라우저 API 미참조) ----
export function mirrorLandmarks(hands) {
  return hands.map((lm) => lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));
}
export function palmPoint(lm) {           // 검지 MCP(5)·중지 MCP(9) 중점 — 손바닥 대표점
  return { x: (lm[5].x + lm[9].x) * 0.5, y: (lm[5].y + lm[9].y) * 0.5 };
}
```

(c) 기존 `hands()`(57~72행)를 `detect()` + `hands()` + `landmarks()`로 교체:
```js
// 새 비디오 프레임에서만 추론(중복 추론 방지). hands()/landmarks() 어느 쪽이
// 먼저 불려도 프레임당 1회만 detectForVideo가 돈다. 예외는 직전 결과를 유지.
function detect() {
  if (!active() || vid.readyState < 2 || vid.currentTime === lastVT) return;
  lastVT = vid.currentTime;
  let res;
  try { res = landmarker.detectForVideo(vid, performance.now()); }
  catch (e) { if (!detect.warned) { detect.warned = true; console.warn("손 탐지 실패 — 직전 결과 유지", e); } return; }
  lmarks = mirrorLandmarks(res.landmarks || []);          // 거울 보정 후 저장
  if (lmarks.length) {
    const p = palmPoint(lmarks[0]);
    last = { n: Math.min(2, lmarks.length), x: p.x, y: p.y };
  } else {
    last = { n: 0, x: last.x, y: last.y };
  }
}

export function hands() { detect(); return last; }
export function landmarks() { detect(); return lmarks; }
```
기존 `export function landmarks() { return lmarks; }` 한 줄은 삭제(중복 export 금지). `video()`·`stop()`·`request()`는 무변경.

- [ ] **Step 4: 10번 피스의 이중 반전 제거**

`js/pieces/10-tower-of-babel.js` `drawHandCursors()` 안 283행:
```js
    const x = (1 - p.x) * W, y = p.y * H;                // 거울 보정
```
→
```js
    const x = p.x * W, y = p.y * H;                      // landmarks()는 이미 거울 보정 좌표
```
(`drawCamMirror`의 316~319행 `(1 - p.x)`는 Task 3에서 함수 자체가 교체되므로 여기서는 두되, Task 3 전까지 미러 점이 좌우 뒤집혀 보이는 것은 정상.)

- [ ] **Step 5: 테스트**

Run: `cd /home/ec2-user/media-art2/.worktrees/cam-contract && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0` (cam.test 3개 추가 통과, integrity의 import-safe 검사 통과)

- [ ] **Step 6: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/cam-contract && git add js/cam.js js/pieces/10-tower-of-babel.js test/cam.test.mjs && git commit -m "$(cat <<'EOF'
feat: cam.js landmarks 거울 보정·프레임당 1회 탐지 공용화 — mirrorLandmarks/palmPoint 순수 헬퍼 + 테스트

세션 간 계약: hands()·landmarks() 모두 거울 보정 후 좌표, 어느 쪽이 먼저 불려도
탐지는 1회. 10번 손 커서의 이중 반전 제거.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: cam.js drawMirror 공용 헬퍼 + opts.cam getter + 10번 소비 교체 (babel)

**Files:**
- Modify: `js/cam.js` (`video()` 아래에 `drawMirror` 추가)
- Modify: `js/main.js:193-194` (`opts.cam`에 `drawMirror` 추가)
- Modify: `js/pieces/10-tower-of-babel.js:301-326` (`drawCamMirror` 본문 교체)

**Interfaces:**
- Produces: `export function drawMirror(ctx, rect)` — `rect = {x, y, w, h}`(캔버스 px). `active()`가 아니거나 비디오 미준비면 아무것도 그리지 않음. 비디오를 좌우반전으로 `drawImage`, 거울 보정된 `landmarks()`를 `rect.x + p.x*w, rect.y + p.y*h`에 점으로, 1px 테두리. `save/restore`로 transform·alpha·합성 모드 원복. `opts.cam.drawMirror(ctx, rect)` getter로 작품에 노출.
- Consumes: Task 2의 `landmarks()`(거울 보정 후).

- [ ] **Step 1: cam.js에 drawMirror 추가** (`export function video()` 바로 아래)

```js
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
```

- [ ] **Step 2: main.js opts.cam getter 확장** (193~194행)

```js
                 cam: { active: () => cam.active(), hands: () => cam.hands(),
                        video: () => cam.video(), landmarks: () => cam.landmarks(),
                        drawMirror: (c, rect) => cam.drawMirror(c, rect) } });
```

- [ ] **Step 3: 10번 피스 drawCamMirror를 공용 호출로 교체** (301~326행 함수 전체)

```js
// --- 코너 카메라 미러: 우하단, 렌더는 공용 cam.drawMirror ---
function drawCamMirror() {
  if (!cam || !cam.active()) return;
  const mw = Math.min(200, W * 0.18);
  const mh = mw * 0.75;                                   // 640×480 비율
  cam.drawMirror(ctx, { x: W - mw - 12, y: H - mh - 12, w: mw, h: mh });
}
```

- [ ] **Step 4: 테스트 + 10번 E2E 스모크**

Run: `cd /home/ec2-user/media-art2/.worktrees/cam-contract && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0`

Run(백그라운드): `python3 -m http.server 8093 --bind 127.0.0.1 -d /home/ec2-user/media-art2/.worktrees/cam-contract`
Playwright: `http://127.0.0.1:8093/` → 버튼 클릭 전 `browser_evaluate`:
```js
window.__CAM_CDN__ = "/test/fixtures/fake-vision";
const c = document.createElement("canvas"); c.width = 640; c.height = 480;
c.getContext("2d").fillRect(0, 0, 640, 480);
navigator.mediaDevices.getUserMedia = async () => c.captureStream(20);
window.__FAKE_HANDS__ = { n: 1, x: 0.3, y: 0.4 };
```
`button[data-no="10"]` 클릭 → `#v-cam` 클릭 → 1초 대기 → 스크린샷.
Expected: 버튼 텍스트 `📷 손을 비춰보세요`; 호박색 손 커서가 **화면 왼쪽 30%**(x=0.3) 위치; 우하단 미러 박스에 점 무리가 **박스 왼쪽 30%**에 보임(커서와 같은 쪽 = 거울 정합). 콘솔 에러 0.

- [ ] **Step 5: 커밋 + 피어 통지**

```bash
cd /home/ec2-user/media-art2/.worktrees/cam-contract && git add js/cam.js js/main.js js/pieces/10-tower-of-babel.js && git commit -m "$(cat <<'EOF'
feat: cam.js drawMirror 공용 헬퍼 — 코너 미러 렌더를 작품 밖으로, opts.cam.drawMirror 노출

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)" && git log --oneline -4
```
- [ ] **Step 6: babel 브랜치로 fast-forward (컨트롤러 수행)**

```bash
cd /home/ec2-user/media-art2/.worktrees/babel-camera && git status --short && git merge --ff-only feature/cam-contract && git log --oneline -1
```
Expected: `status` 출력 없음(다른 세션의 미커밋 변경 없음) 후 ff 성공, babel 끝 = cam-contract 끝. **status가 비어 있지 않거나 ff가 거부되면 시도하지 않고** 피어에게 `feature/cam-contract`를 merge 대상으로 안내한다(babel을 포함하므로 동등).

그 다음 컨트롤러(메인 세션)가 `SendMessage`로 `media-art2-1c`·`media-art2-09`에 "공용 계층 수정 완료 — 브랜치 `feature/cam-contract`(babel ff 성공 시 `feature/babel-camera`도 동일) 최신 해시 `<hash>`(Task 1~3 커밋 4개: c4138c7 cherry-pick, data.test boolean-only, landmarks 거울 보정·1회 탐지, drawMirror). landmarks()는 이제 거울 보정 후 좌표."를 전달한다.

---

### Task 3b: cam.js — 프레임 정지(트랙 종료·뮤트) 시 결과 노후화 방지 (cam-contract)

01번 세션 리뷰 지적: `detect()`는 `vid.currentTime`이 전진할 때만 재검출하므로, OS 프라이버시 스위치·다른 앱의 카메라 점유로 트랙이 끝나거나 뮤트되면 `lmarks`가 마지막 검출값으로 영원히 남아 소비자가 손 소실을 감지할 수 없다.

**Files:**
- Modify: `js/cam.js` (`detect()` 안, 모듈 상태 1개 추가, 순수 헬퍼 1개 export)
- Modify: `test/cam.test.mjs` (append)

**Interfaces:**
- Produces: `export const STALE_MS = 500;` `export function isStale(nowMs, lastAdvanceMs)` → boolean (`nowMs - lastAdvanceMs > STALE_MS`). `detect()`는 21점 미만 손 배열을 버린다. 동작: 비디오 프레임이 STALE_MS 이상 전진하지 않으면 `landmarks()`는 `[]`, `hands()`는 `n: 0`을 돌려준다(위치 x,y는 마지막 값 유지 — 기존 손 없음 규약과 동일).
- Consumes: Task 2의 `detect()`·`lmarks`·`last`.

- [ ] **Step 1: 실패하는 테스트 추가** — `test/cam.test.mjs` import 행을 `import { mirrorLandmarks, palmPoint, STALE_MS, isStale } from "../js/cam.js";`로 바꾸고 끝에 append:

```js
test("isStale: 프레임이 STALE_MS 넘게 전진하지 않으면 노후", () => {
  assert.equal(isStale(1000, 1000), false);
  assert.equal(isStale(1000 + STALE_MS, 1000), false, "경계는 아직 유효");
  assert.equal(isStale(1000 + STALE_MS + 1, 1000), true);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/cam-contract && node --test test/cam.test.mjs 2>&1 | tail -6`
Expected: FAIL — `STALE_MS`/`isStale` export 없음

- [ ] **Step 3: 구현** — `js/cam.js`

(a) 순수 헬퍼 블록(`mirrorLandmarks`·`palmPoint` 옆)에 추가:
```js
export const STALE_MS = 500;  // 비디오 프레임이 이만큼 전진하지 않으면 손 결과를 비운다
export function isStale(nowMs, lastAdvanceMs) { return nowMs - lastAdvanceMs > STALE_MS; }
```
(b) 모듈 상태에 `let lastAdvanceMs = 0;` 추가(`lastVT` 옆). `request()` 성공 시 초기화 블록(`lastVT = -1; lmarks = []; …`)에 `lastAdvanceMs = performance.now();` 추가. `stop()`의 초기화에도 `lastAdvanceMs = 0;` 추가.
(c) `detect()`를 다음으로 교체(기존 본문의 탐지·예외 처리는 그대로, 전진 판정·노후 비우기·21점 미만 손 필터만 추가 — 11번 리뷰 지적):
```js
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
  // 잘린 랜드마크 배열 방어: 21점 미만 손은 버린다(palmPoint가 5·9를 인덱싱)
  lmarks = mirrorLandmarks((res.landmarks || []).filter((lm) => lm && lm.length >= 21));
  if (lmarks.length) {
    const p = palmPoint(lmarks[0]);
    last = { n: Math.min(2, lmarks.length), x: p.x, y: p.y };
  } else {
    last = { n: 0, x: last.x, y: last.y };
  }
}
```

- [ ] **Step 4: 테스트**

Run: `cd /home/ec2-user/media-art2/.worktrees/cam-contract && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0`

- [ ] **Step 5: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/cam-contract && git add js/cam.js test/cam.test.mjs && git commit -m "$(cat <<'EOF'
fix: cam.js 프레임 정지 시 손 결과 노후화 방지 — STALE_MS 초과면 landmarks []·hands n:0

트랙 종료·뮤트·카메라 점유로 currentTime이 멈추면 마지막 검출값이 영원히 남던 문제(01번 리뷰 지적).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: pearl 브랜치에 공용 계층 merge + 03번 data.js (pearl)

**Files:**
- Modify: `js/data.js:25-31` (03번 항목)
- (merge로 유입) `js/cam.js`, `js/main.js`, `index.html`, `css/style.css`, `test/*`, 10번 관련 파일

**Interfaces:**
- Produces: `WORKS[2].cam === true`, 03번 hint/note 갱신. pearl worktree에 `opts.cam = { active, hands, video, landmarks, drawMirror }` 규약 존재.
- Consumes: Task 3까지의 `feature/babel-camera`.

- [ ] **Step 1: merge**

Run:
```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-camera && git merge --no-edit feature/cam-contract && git log --oneline -3 && node --test test/ 2>&1 | tail -4
```
Expected: 충돌 없음(pearl에는 docs 커밋만 있음), `# fail 0`. (`feature/cam-contract`는 babel 전체 + Task 1~3 수정을 포함한다.)

- [ ] **Step 2: data.js 03번 항목 수정**

`js/data.js` 03번 객체를 다음으로 교체(`title`·`ko`·`medium`·`year`·`module`·`asset`은 그대로):
```js
  {
    no: "03", wing: "wave", title: "After Vermeer — Girl with a Pearl Earring", ko: "진주 귀걸이를 한 소녀",
    medium: "Light-dust particles · after Vermeer (c.1665, public domain)", year: "2026",
    note: "페르메이르의 소녀가 어둠 속 빛 먼지로 나타난다. 촛불 바람에 먼지가 흩날려도 소녀는 언제나 되돌아오는데 — 진주만은 늘 마지막에, 가장 밝게 돌아온다. 어둠이 깊을수록 빛나는 단 하나의 점. 카메라 앞에서 손을 움직이면 그 손이 촛불이 되고, 손끝을 맞대면 불꽃이 흔들린다.",
    hint: "📷를 켜고 손을 촛불처럼 움직여 빛 먼지를 흩으세요 · 손끝을 맞대면 촛불이 깜빡입니다 · 마우스로도 가능합니다",
    cam: true,
    module: "./pieces/03-pearl-earring.js", asset: "assets/targets/03-pearl-earring.jpg",
  },
```

- [ ] **Step 3: 테스트**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-camera && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0` (data.test의 cam boolean-only 검사 통과, 10번·03번 두 작품 `cam: true`)

- [ ] **Step 4: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-camera && git add js/data.js && git commit -m "$(cat <<'EOF'
feat: 03번 cam 플래그 + 손 촛불·핀치 안내 힌트·note 정합화

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 03번 순수 함수 — handWind (pearl, TDD)

**Files:**
- Modify: `js/pieces/03-pearl-earring.js` (상단 상수 아래에 순수 함수 블록 추가·export)
- Create: `test/pearl-gesture.test.mjs`

**Interfaces:**
- Produces: `export const WIND_MIN = 0.15, WIND_FULL = 0.9, HAND_SMOOTH = 18;` `export function makeHandState()` → `{ x: 0, y: 0, seen: false }`. `export function handWind(s, hx, hy, dt)` → `{ x, y, k } | null` (x,y는 정규화 0..1 스무딩 위치, k는 0..1 바람 세기). `hx`/`hy`가 유한수가 아니면(null·undefined·NaN) 손 없음.
- Consumes: 없음.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/pearl-gesture.test.mjs`

```js
// test/pearl-gesture.test.mjs — 03번 손 입력 순수 로직(바람·핀치) 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { WIND_MIN, WIND_FULL, makeHandState, handWind } from "../js/pieces/03-pearl-earring.js";

const DT = 1 / 60;
// 손을 (x0,y0)에서 초당 speed(정규화 거리/초)로 +x 방향 이동시키며 frames 프레임 돌린 마지막 결과
function sweep(s, x0, y0, speed, frames) {
  let out = null;
  for (let i = 0; i < frames; i++) out = handWind(s, x0 + speed * DT * i, y0, DT);
  return out;
}

test("handWind: 손이 없으면 null이고 seen이 풀린다", () => {
  const s = makeHandState();
  handWind(s, 0.5, 0.5, DT);
  assert.equal(s.seen, true);
  assert.equal(handWind(s, null, null, DT), null);
  assert.equal(s.seen, false);
});

test("handWind: NaN 좌표는 손 없음으로 취급한다 (NaN이 스프링에 스며들지 않게)", () => {
  const s = makeHandState();
  handWind(s, 0.5, 0.5, DT);
  assert.equal(handWind(s, NaN, 0.5, DT), null);
  assert.equal(s.seen, false);
});

test("handWind: 첫 등장 프레임은 위치만 기록하고 null", () => {
  const s = makeHandState();
  assert.equal(handWind(s, 0.3, 0.6, DT), null);
  assert.equal(s.x, 0.3); assert.equal(s.y, 0.6); assert.equal(s.seen, true);
});

test("handWind: 미세 지터(0.1/s)는 임계 미만이라 null", () => {
  const s = makeHandState();
  assert.equal(sweep(s, 0.5, 0.5, 0.1, 30), null);
});

test("handWind: 빠른 이동(1.2/s)은 k=1", () => {
  const s = makeHandState();
  const w = sweep(s, 0.2, 0.5, 1.2, 30);
  assert.ok(w, "바람 발생");
  assert.equal(w.k, 1);
  assert.ok(w.x > 0.2 && w.x < 0.8, `스무딩 위치 x=${w.x}`);
  assert.ok(Math.abs(w.y - 0.5) < 1e-9);
});

test("handWind: 중간 속도는 0<k<1이고 WIND_MIN~WIND_FULL 사이에서 단조 증가", () => {
  const mid = (WIND_MIN + WIND_FULL) / 2;
  const a = sweep(makeHandState(), 0.2, 0.5, mid, 30);
  const b = sweep(makeHandState(), 0.2, 0.5, mid + 0.2, 30);
  assert.ok(a && a.k > 0 && a.k < 1, `a.k=${a && a.k}`);
  assert.ok(b && b.k > a.k, `b.k=${b && b.k} > a.k=${a.k}`);
});

test("handWind: 사라진 뒤 먼 위치 재등장은 첫 프레임 null(점프 속도 없음)", () => {
  const s = makeHandState();
  sweep(s, 0.1, 0.1, 0.5, 10);
  handWind(s, null, null, DT);
  assert.equal(handWind(s, 0.9, 0.9, DT), null);
  assert.equal(s.x, 0.9);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-camera && node --test test/pearl-gesture.test.mjs 2>&1 | tail -6`
Expected: FAIL — export 없음(SyntaxError)

- [ ] **Step 3: 구현** — `03-pearl-earring.js`의 `const PEARL_SPRING = 2.1;` 아래에 추가

```js
// ---- 손 입력 순수 로직 (node:test 대상) ----------------------------
// 손 속도가 촛불 바람이 된다. 좌표는 0..1 정규화(해상도 무관), 속도는 정규화 거리/초.
export const WIND_MIN = 0.15;   // 이 속도 미만은 랜드마크 지터로 보고 무시
export const WIND_FULL = 0.9;   // 이 속도 이상이면 마우스 드래그와 같은 세기(k=1)
export const HAND_SMOOTH = 18;  // 위치 EMA 반응(1/s)

export function makeHandState() { return { x: 0, y: 0, seen: false }; }

// 반환: { x, y, k } (스무딩 위치·세기 0..1) 또는 null(손 없음·첫 등장·임계 미만)
export function handWind(s, hx, hy, dt) {
  if (!Number.isFinite(hx) || !Number.isFinite(hy)) { s.seen = false; return null; } // null·undefined·NaN 모두 손 없음
  if (!s.seen) { s.x = hx; s.y = hy; s.seen = true; return null; } // 점프 속도 방지
  const px = s.x, py = s.y;
  const a = Math.min(1, HAND_SMOOTH * dt);
  s.x += (hx - s.x) * a;
  s.y += (hy - s.y) * a;
  const speed = Math.hypot(s.x - px, s.y - py) / Math.max(dt, 1e-6);
  const k = Math.min(1, Math.max(0, (speed - WIND_MIN) / (WIND_FULL - WIND_MIN)));
  return k > 0 ? { x: s.x, y: s.y, k } : null;
}
```

- [ ] **Step 4: 테스트**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-camera && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0` (6개 추가 통과, integrity 통과 — 03번 모듈 여전히 import-safe)

- [ ] **Step 5: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-camera && git add js/pieces/03-pearl-earring.js test/pearl-gesture.test.mjs && git commit -m "$(cat <<'EOF'
feat: 03번 손 바람 순수 로직 handWind — EMA 스무딩·지터 임계·속도→세기 + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 03번 순수 함수 — pinchRatio / pinchStep (pearl, TDD)

**Files:**
- Modify: `js/pieces/03-pearl-earring.js` (Task 5 블록 바로 아래)
- Modify: `test/pearl-gesture.test.mjs` (append)

**Interfaces:**
- Produces: `export const PINCH_IN = 0.30, PINCH_OUT = 0.45, PINCH_COOL = 0.4;` `export function pinchRatio(lm)` → number (dist(4,8)/dist(0,9); 손 크기 0이면 1=열림). `export function makePinchState()` → `{ closed: false, cool: 0 }`. `export function pinchStep(s, ratio, dt)` → `{ fire: boolean }`; `ratio`가 `null`이면 손 없음.
- Consumes: 없음.

- [ ] **Step 1: 실패하는 테스트 추가** — `test/pearl-gesture.test.mjs` 끝에 append. import 행을 다음으로 교체:

```js
import { WIND_MIN, WIND_FULL, makeHandState, handWind,
         PINCH_IN, PINCH_OUT, PINCH_COOL, pinchRatio, makePinchState, pinchStep }
  from "../js/pieces/03-pearl-earring.js";
```
그리고 append:
```js
// 21점 손: 손목(0)·중지 MCP(9)로 손 크기, 엄지 끝(4)·검지 끝(8) 거리로 핀치
function handLm(size, tipGap) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5, y: 0.5 + size, z: 0 };
  lm[9] = { x: 0.5, y: 0.5, z: 0 };
  lm[4] = { x: 0.5 - tipGap / 2, y: 0.4, z: 0 };
  lm[8] = { x: 0.5 + tipGap / 2, y: 0.4, z: 0 };
  return lm;
}

test("pinchRatio: 손 크기에 무관한 비율", () => {
  assert.ok(Math.abs(pinchRatio(handLm(0.2, 0.04)) - 0.2) < 1e-9);
  assert.ok(Math.abs(pinchRatio(handLm(0.4, 0.08)) - 0.2) < 1e-9);
  assert.equal(pinchRatio(handLm(0, 0.1)), 1, "크기 0이면 열림(1)");
});

const stepN = (s, ratio, n) => { let fires = 0; for (let i = 0; i < n; i++) if (pinchStep(s, ratio, DT).fire) fires++; return fires; };

test("pinchStep: 진입 시 1회 발화, 유지 중 재발화 없음", () => {
  const s = makePinchState();
  assert.equal(stepN(s, 0.6, 5), 0);
  assert.equal(stepN(s, 0.2, 30), 1);
  assert.equal(s.closed, true);
});

test("pinchStep: 중간대(0.38)는 상태 유지(히스테리시스)", () => {
  const s = makePinchState();
  assert.equal(stepN(s, 0.38, 10), 0, "열린 상태에서 중간대는 진입 아님");
  stepN(s, 0.2, 1);
  stepN(s, 0.38, 10);
  assert.equal(s.closed, true, "닫힌 상태에서 중간대는 해제 아님");
});

test("pinchStep: 해제 후 쿨다운 경과하면 다시 발화", () => {
  const s = makePinchState();
  stepN(s, 0.2, 1);
  stepN(s, 0.6, Math.ceil(PINCH_COOL / DT) + 2);
  assert.equal(s.closed, false);
  assert.equal(stepN(s, 0.2, 1), 1);
});

test("pinchStep: 쿨다운 중 재진입은 발화 없음", () => {
  const s = makePinchState();
  stepN(s, 0.2, 1);
  stepN(s, 0.6, 3);              // 즉시 해제(0.05s)
  assert.equal(stepN(s, 0.2, 1), 0);
  assert.equal(s.closed, true, "발화는 없지만 닫힘 상태는 기록");
});

test("pinchStep: ratio null(손 없음)은 closed 리셋", () => {
  const s = makePinchState();
  stepN(s, 0.2, 1);
  assert.equal(pinchStep(s, null, DT).fire, false);
  assert.equal(s.closed, false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-camera && node --test test/pearl-gesture.test.mjs 2>&1 | tail -6`
Expected: FAIL — `pinchRatio` 등 export 없음

- [ ] **Step 3: 구현** — Task 5 블록 바로 아래

```js
// 핀치(엄지 끝 4·검지 끝 8 맞대기) = 손가락 튕기기 → 촛불 깜빡임 파동
export const PINCH_IN = 0.30;   // 이 비율 미만이면 닫힘 진입
export const PINCH_OUT = 0.45;  // 이 비율 초과면 해제 (사이 구간은 상태 유지)
export const PINCH_COOL = 0.4;  // 발화 후 재발화 금지(초)

// 엄지 끝-검지 끝 거리를 손 크기(손목 0 ↔ 중지 MCP 9)로 나눈 비율. 크기 0이면 열림(1).
export function pinchRatio(lm) {
  const size = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
  if (size <= 1e-9) return 1;
  return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / size;
}

export function makePinchState() { return { closed: false, cool: 0 }; }

export function pinchStep(s, ratio, dt) {
  s.cool = Math.max(0, s.cool - dt);
  if (ratio === null || ratio === undefined) { s.closed = false; return { fire: false }; }
  if (!s.closed && ratio < PINCH_IN) {
    s.closed = true;
    if (s.cool <= 0) { s.cool = PINCH_COOL; return { fire: true }; }
    return { fire: false };
  }
  if (s.closed && ratio > PINCH_OUT) s.closed = false;
  return { fire: false };
}
```

- [ ] **Step 4: 테스트**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-camera && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0`

- [ ] **Step 5: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-camera && git add js/pieces/03-pearl-earring.js test/pearl-gesture.test.mjs && git commit -m "$(cat <<'EOF'
feat: 03번 핀치 순수 로직 pinchRatio/pinchStep — 히스테리시스·쿨다운 + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 03번 tick 손 입력 소비 + 손 커서 + 코너 미러 (pearl)

**Files:**
- Modify: `js/pieces/03-pearl-earring.js` — 모듈 상태(6~11행), `init`(24~42행), `tick`(44~71행), `dispose`(78~80행), 렌더 함수 2개 추가

**Interfaces:**
- Consumes: `opts.cam = { active(), hands(), landmarks(), drawMirror(ctx, rect) }`(Task 3/4), Task 5·6 순수 함수, 기존 `field.scatter(x, y, radius, strength)`·`applyBuoyancy(cx, cy, radius, strength, dt)`·`flicker/flickerAge/waveOrigin/FLICKER_DUR`.
- Produces: 없음(최종 소비자).

- [ ] **Step 1: 모듈 상태 추가** — 11행 `let waveOrigin = { x: 0, y: 0 };` 아래

```js
let cam = null;                          // opts.cam getter 묶음(없으면 마우스만)
let handS = null, pinchS = null;         // 순수 로직 상태
let cursor = null;                       // 손 위치 {x,y}(캔버스 px) 또는 null
let flash = 0;                           // 핀치 링 잔여 시간(초)
```

- [ ] **Step 2: init/dispose** — `init` 끝(`tagPearls();` 앞)에 추가:
```js
    cam = opts.cam || null;
    handS = makeHandState(); pinchS = makePinchState();
    cursor = null; flash = 0;
```
`dispose`를 다음으로 교체:
```js
  dispose() {
    ctx = null; field = null; pearls = []; cam = null; cursor = null;
  },
```

- [ ] **Step 3: tick 손 입력 블록** — 기존 `ptr` 블록(48~61행) **뒤**, `if (flicker > 0) …`(62행) **앞**에 삽입:

```js
    // 손(카메라): 손 속도 = 촛불 바람, 핀치 = 깜빡임 파동 — 마우스와 병행
    if (cam && cam.active()) {
      const h = cam.hands();
      const wind = handWind(handS, h.n ? h.x : null, h.n ? h.y : null, dt);
      if (wind) {
        const px = wind.x * W, py = wind.y * H;
        const g = 0.35 + 0.65 * wind.k;                     // 살랑(0.35)~세찬(1)
        field.scatter(px, py, 110, (reduced ? 22 : 60) * g); // 손은 커서보다 넓게
        applyBuoyancy(px, py, 140, (reduced ? 30 : 80) * g, dt);
      }
      const lm = cam.landmarks();
      const ratio = lm.length ? pinchRatio(lm[0]) : null;
      if (pinchStep(pinchS, ratio, dt).fire) {
        flicker = FLICKER_DUR; flickerAge = 0;
        waveOrigin.x = handS.x * W; waveOrigin.y = handS.y * H;
        flash = 0.25;
      }
      cursor = h.n ? { x: handS.x * W, y: handS.y * H } : null;
    } else { cursor = null; }
    if (flash > 0) flash -= dt;
```

- [ ] **Step 4: 렌더 2단계** — `tick`의 `drawPearls();` 뒤에 `drawHandCursor(); drawMirror();` 추가하고, 파일 끝(`clamp255` 앞)에 함수 추가:

```js
// --- 손 커서: 촛불색 글로우 점 + 핀치 순간 확대 링 ------------------
function drawHandCursor() {
  if (!cursor) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const r = 12;
  const g = ctx.createRadialGradient(cursor.x, cursor.y, 0, cursor.x, cursor.y, r * 2);
  g.addColorStop(0, "rgba(255,200,120,0.85)");
  g.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cursor.x, cursor.y, r * 2, 0, Math.PI * 2); ctx.fill();
  if (flash > 0) {                                  // 핀치: 커지며 옅어지는 링
    const t = 1 - flash / 0.25;
    ctx.strokeStyle = "rgba(255,220,160," + (0.8 * (1 - t)).toFixed(3) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cursor.x, cursor.y, r + t * 40, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// --- 코너 미러: 우하단, 렌더는 공용 cam.drawMirror --------------------
function drawMirror() {
  if (!cam || !cam.active() || !cam.drawMirror) return;
  const mw = Math.min(200, W * 0.18), mh = mw * 0.75;   // 640×480 비율
  cam.drawMirror(ctx, { x: W - mw - 18, y: H - mh - 18, w: mw, h: mh });
}
```

- [ ] **Step 5: 테스트 + 마우스 회귀 스모크**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-camera && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0`

Run(백그라운드): `python3 -m http.server 8092 --bind 127.0.0.1 -d /home/ec2-user/media-art2/.worktrees/pearl-camera`
Playwright `http://127.0.0.1:8092/` → `button[data-no="03"]` 클릭 → 2초 대기 → 스크린샷 A(입자가 소녀 형상으로 응집, 진주 글로우) → 캔버스 중앙 드래그 → 스크린샷 B(먼지 흩어짐) → 클릭 → 콘솔 에러 0. `#v-cam` 버튼이 `📷 카메라로 체험하기`로 보임. Expected: 카메라 없이 마우스 경로가 이전과 동일 동작.

- [ ] **Step 6: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-camera && git add js/pieces/03-pearl-earring.js && git commit -m "$(cat <<'EOF'
feat: 03번 카메라 소비 — 손 속도 촛불 바람·핀치 깜빡임 파동, 손 커서·코너 미러 (마우스 병행)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: E2E — 가짜 MediaPipe 핀치 연출 + Playwright 시각 검증 (pearl)

**Files:**
- Modify: `test/fixtures/fake-vision/vision_bundle.mjs` (손 형태·핀치 연출 추가, 기존 `{n,x,y}` 호환 유지)

**Interfaces:**
- Produces: `window.__FAKE_HANDS__ = { n, x, y, pinch?: boolean }`. 각 손은 실제 손 형태 근사 — 손목(0) 아래쪽, MCP 5·9 손바닥, 엄지 끝(4)·검지 끝(8) 간격은 `pinch`면 손 크기의 0.1, 아니면 0.8.
- Consumes: Task 7 전체, cam.js의 `mirrorLandmarks`(가짜는 원본 좌표를 주고 cam.js가 반전).

- [ ] **Step 1: 가짜 번들 확장** — `detectForVideo`의 `mk`를 교체

```js
  detectForVideo() {
    const s = (typeof window !== "undefined" && window.__FAKE_HANDS__) || { n: 0, x: 0.5, y: 0.5 };
    // 손 형태 근사(원본=미반전 좌표 — cam.js가 1-x 반전하므로 화면 x를 역반전해 넣는다)
    const mk = (sx, y, pinch) => {
      const x = 1 - sx, size = 0.12, gap = pinch ? size * 0.1 : size * 0.8;
      const lm = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
      lm[0] = { x, y: y + size, z: 0 };                    // 손목: 손바닥 아래
      lm[5] = { x: x - 0.02, y, z: 0 }; lm[9] = { x: x + 0.02, y, z: 0 };
      lm[4] = { x: x - gap / 2, y: y - 0.06, z: 0 };       // 엄지 끝
      lm[8] = { x: x + gap / 2, y: y - 0.06, z: 0 };       // 검지 끝
      return lm;
    };
    const landmarks = [];
    if (s.n >= 1) landmarks.push(mk(s.x, s.y, !!s.pinch));
    if (s.n >= 2) landmarks.push(mk(Math.min(1, s.x + 0.2), s.y, false));
    return { landmarks };
  }
```
(주 손 대표점은 이제 5·9 중점 = `sx` 그대로이므로 10번 E2E 기대값도 유지된다.)

- [ ] **Step 2: Playwright 시나리오** (서버 8092 재사용)

Playwright MCP 브라우저가 다른 세션에 잠겨 있으면(`Browser is already in use`) 기다리지 말고 독립 스크립트로 우회한다: `require("/home/ec2-user/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core")` + `chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })`. 스크립트는 세션 스크래치 디렉터리에 두고 저장소에 넣지 않는다. Task 3 스모크가 이 방식으로 통과했다(`.playwright-mcp/task3-smoke.png`).

버튼 클릭 전 `page.evaluate`/`browser_evaluate`로 시임 설치. **가짜 카메라 캔버스는 한 번만 그리면 headless Chrome에서 `video.play()`가 영원히 대기한다 — 반드시 `setInterval`로 계속 다시 그린다**:
```js
window.__CAM_CDN__ = "/test/fixtures/fake-vision";
const c = document.createElement("canvas"); c.width = 640; c.height = 480;
const g = c.getContext("2d");
setInterval(() => { g.fillStyle = "#333"; g.fillRect(0, 0, 640, 480); g.fillStyle = "#777"; g.fillRect((Date.now() / 20) % 600, 200, 40, 40); }, 50);
navigator.mediaDevices.getUserMedia = async () => c.captureStream(20);
window.__FAKE_HANDS__ = { n: 1, x: 0.25, y: 0.5, pinch: false };
```
손 커서 판정은 색 임계 대신 **배경 대비 밝기 핫스팟**으로 한다(03번 커서도 `lighter` 합성이라 가산 발광으로 보임): 예상 x 구간(폭 20~30%)의 최대 밝기 픽셀이 반대편(70~80%)보다 뚜렷히 밝은지 `getImageData`로 확인.
1. `button[data-no="03"]` → `#v-cam` 클릭 → 1.5초 대기 → 스크린샷 C. Expected: 버튼 `📷 손을 비춰보세요`, **화면 왼쪽 25%** 에 촛불색 글로우 점, 우하단 미러 박스(점 무리 박스 왼쪽 25%), 먼지는 정지(손 정지 = 바람 없음).
2. 손 스윕: `browser_evaluate`로 `let i=0; const id=setInterval(()=>{ i++; window.__FAKE_HANDS__={n:1,x:0.25+i*0.02,y:0.5}; if(i>=25) clearInterval(id); },33)` → 1초 후 스크린샷 D. Expected: 손이 지나간 띠를 따라 먼지가 흩어지고 위로 떠오름(부력).
3. 핀치: `window.__FAKE_HANDS__={n:1,x:0.75,y:0.5,pinch:true}` → 150ms 후 스크린샷 E. Expected: 손 위치에 확대 링 + 방사형 밝기 파동. 이어서 `pinch:true` 유지 1초 후 스크린샷 F: 파동 소멸, 재발화 없음. `pinch:false` 200ms → `pinch:true` → 파동 다시 발생.
4. 손 제거 `{n:0}` → 커서·미러 점 사라짐, 먼지는 진주부터 마지막에 밝게 복원.
5. 마우스 병행: 카메라 활성 상태에서 캔버스 드래그·클릭 → 여전히 동작.
6. 실패 경로: 새로고침 후 `window.__CAM_CDN__ = "/nonexistent"` → `#v-cam` 클릭 → 버튼 `카메라를 사용할 수 없어요 — 마우스로 체험하세요` + disabled, 드래그·클릭은 동작.
7. 뷰어 닫기(Escape) → 재진입 시 버튼이 `📷 카메라로 체험하기`로 리셋.
8. 원작 대조: 스크린샷 A(Task 7)와 `assets/targets/03-pearl-earring.jpg`를 나란히 — 구도·진주 위치(우측 목 옆) 불변.

각 단계 콘솔 에러 0. 스크린샷은 `.playwright-mcp/`에 저장(gitignore).

- [ ] **Step 3: 테스트 + 커밋**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-camera && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0`

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-camera && git add test/fixtures/fake-vision/vision_bundle.mjs && git commit -m "$(cat <<'EOF'
test: 가짜 MediaPipe에 손 형태·핀치 연출 추가 — 03번 E2E(바람·핀치·폴백) 검증용

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 실기 수동 확인(배포 전 1회, 사용자 또는 컨트롤러)**

`python3 -m http.server 8092 --bind 127.0.0.1 -d /home/ec2-user/media-art2/.worktrees/pearl-camera` 로 `http://127.0.0.1:8092/` 접속(localhost는 보안 컨텍스트) → 03번 → 📷 → 권한 허용. 확인: 손을 오른쪽으로 움직이면 커서도 오른쪽(거울 정합), 휙 저으면 먼지가 흩날리고 천천히 흘리면 정지, 엄지·검지 맞대면 파동 1회, 뷰어 닫으면 카메라 표시등 소등. 결과를 사용자에게 스크린샷과 함께 보고하고 승인 후 master merge·`./tools/deploy.sh`(메인 체크아웃에서, 다른 세션과 조율 후).
