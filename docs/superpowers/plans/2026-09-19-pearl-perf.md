# 03번 반응 지연 개선 구현 계획 (추론 워커 · fps 독립화 · 렌더 경량화)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 03번 After Vermeer에서 손·마우스 움직임에 대한 반응이 "한참 있다가 느리게" 나타나는 증상을 제거한다 — MediaPipe 추론을 워커로 옮겨 렌더 루프 정지를 없애고, 시뮬레이션을 실제 경과 시간으로 진행시켜 저fps 슬로모션을 끊고, 03번 프레임당 렌더 비용을 절반으로 줄인다.

**Architecture:** (A) `js/cam-worker.js`(클래식 Worker + 동적 `import()`)가 HandLandmarker를 소유하고 델리게이트를 벤치로 자동 선택한다. `js/cam.js`는 새 비디오 프레임을 `VideoFrame`/`ImageBitmap`으로 전송하고 결과를 캐시해 기존 `hands()/landmarks()` 동기 계약을 유지하며, 워커 실패 시 현행 메인 스레드 경로로 폴백한다. (B) `js/main.js`가 `tick(dt, ptr, realDt)`로 실제 경과를 추가 전달하고 03번은 20ms 서브스텝·dt 보정 임펄스·dt 보정 잔상으로 벽시계 진행을 보장한다. (C) 03번 렌더는 색 문자열 캐시 + `globalAlpha`, `fillRect` 임계 확대, 비네트·헤일로 오프스크린 스프라이트로 경량화한다.

**Tech Stack:** 순수 ES 모듈(빌드 없음), MediaPipe tasks-vision 0.10.14(CDN, 클래식 Worker 내 동적 import), Canvas 2D + OffscreenCanvas, node:test, 독립 playwright-core 스크립트(headless Chrome).

**Spec:** `docs/superpowers/specs/2026-09-19-pearl-perf-design.md`

## Global Constraints

- 작업 디렉터리는 **항상** `/home/ec2-user/media-art2/.worktrees/pearl-perf`(브랜치 `feature/pearl-perf`). 메인 체크아웃 `/home/ec2-user/media-art2`와 다른 `.worktrees/*`는 건드리지 않는다(다른 세션이 HEAD 공유). bare `git stash` 금지.
- 의존성 추가 금지. `js/cam.js`·`js/pieces/03-pearl-earring.js`는 node import-safe 유지(모듈 레벨에서 브라우저 API 미참조; `Worker`·`OffscreenCanvas`·`VideoFrame`·`performance`는 함수 안에서만). `js/cam-worker.js`는 브라우저 전용이며 테스트가 import하지 않는다.
- 외부 계약 불변: `opts.cam = { active, hands, landmarks, video, drawMirror }` 시그니처·의미, `hands()` → `{n, x, y}`(거울 보정 후 0..1, 손 없으면 `n:0`·좌표 유지), `landmarks()` → 거울 보정 후 21점 배열들, `STALE_MS = 500` 노후화, 21점 미만 필터, `mirrorLandmarks`·`palmPoint`·`isStale` export. 01·10·11·12번 피스 코드 수정 금지.
- 03번의 시각 정체성 유지: 입자 수 6500, 색·twinkle·파동·진주 복원 규칙 동일. 밝기 표현만 `rgb × bright` 채널 스케일에서 `globalAlpha = particleAlpha(bright)`(+ bright > 1.15는 흰색 55% 혼합 문자열)로 바꾼다. 최종 스크린샷을 변경 전과 나란히 사용자 승인 후 병합.
- `main.js` 변경은 두 곳만: `frame()`의 `piece.tick(dt, pointer, Math.min(0.25, real))` 3번째 인자 추가, 📷 클릭의 `cam.request({ numHands: … })`. 기존 15작품은 3번째 인자를 무시한다.
- 상수(스펙 확정): `SIM_MAX = 0.25`, `SUBSTEP = 0.02`, `impulseScale = clamp(sim×60, 0.5, 6)`, `trailAlpha(sim) = 1 − 0.66^(sim×60)`, `particleAlpha(bright) = min(1, bright × min(1, 0.28 + 0.5×bright))`, `HOT_BRIGHT = 1.15`, `RECT_MAX = 2.0`(sz ≤ 2.0은 fillRect), 델리게이트 벤치 `GPU p50 > 40ms → CPU`, 렌더러 정규식 `/SwiftShader|llvmpipe|Software|Basic Render/i`, 워커 ready 타임아웃 20초, in-flight 워치독 3초.
- 한국어 주석·UI 문구. 커밋 메시지 `feat:`/`fix:`/`test:`/`docs:` + 한국어 요약, 말미 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 테스트는 항상 worktree 루트에서 `node --test test/`(기준 87개 통과). E2E·측정은 독립 playwright-core 스크립트(`require("/home/ec2-user/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core")`, `executablePath: "/usr/bin/google-chrome"`, `headless: true`, args `["--no-sandbox","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]`)로, 서버는 `python3 -m http.server 8097 --bind 127.0.0.1 -d /home/ec2-user/media-art2/.worktrees/pearl-perf`, 스크립트·스크린샷은 세션 스크래치 `/tmp/claude-1000/-home-ec2-user-media-art2/8b317a85-4713-4d2d-8e77-f06d6f1a2bef/scratchpad/perf/`에 둔다(저장소에 넣지 않음). 다른 세션의 Chrome/서버 프로세스는 죽이지 않는다(`pkill -f "http.server 809[7]"`만).
- 가짜 카메라 스트림은 `setInterval(50ms)`로 계속 다시 그린 캔버스의 `captureStream(20)`이어야 한다(한 번만 그리면 `video.play()`가 headless에서 대기).

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `js/pieces/03-pearl-earring.js` | 순수 sim/render 헬퍼 export(`simDt`·`substeps`·`impulseScale`·`trailAlpha`·`particleAlpha`·`isHot`), tick의 sim 적용, 렌더 경량화 | 1, 2, 3 |
| `test/pearl-perf.test.mjs` (신규) | 위 순수 헬퍼 검증 | 1 |
| `js/main.js` | `tick` 3번째 인자, `cam.request({numHands})` | 2, 4 |
| `js/data.js` | 01·03·11번 `camHands: 1` | 4 |
| `test/data.test.mjs` | `camHands` 검사 | 4 |
| `js/cam.js` | `applyLandmarks` 순수 함수, `stats()`, `request({numHands})`, 워커 모드 + 메인 폴백 | 4, 5 |
| `test/cam.test.mjs` | `applyLandmarks` 검증 | 4 |
| `js/cam-worker.js` (신규) | HandLandmarker 소유·델리게이트 벤치·프레임 추론 | 5 |
| `test/fixtures/fake-vision/vision_bundle.mjs` | `globalThis.__FAKE_HANDS__` | 5 |
| 스크래치 `perf/*.cjs` | E2E·성능·스크린샷 스크립트(저장소 밖) | 3, 6 |

---

### Task 1: 03번 순수 헬퍼 — sim·렌더 수식 (TDD)

**Files:**
- Modify: `js/pieces/03-pearl-earring.js` (핀치 블록 `pinchStep` 아래, `export default {` 위에 블록 추가)
- Create: `test/pearl-perf.test.mjs`

**Interfaces:**
- Produces: `export const SIM_MAX = 0.25, SUBSTEP = 0.02, HOT_BRIGHT = 1.15, RECT_MAX = 2.0;`
  `export function simDt(realDt, dt)`, `export function substeps(sim, maxStep = SUBSTEP)` → number[],
  `export function impulseScale(sim)`, `export function trailAlpha(sim)`, `export function particleAlpha(bright)`,
  `export function isHot(bright)`.
- Consumes: 없음.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/pearl-perf.test.mjs`

```js
// test/pearl-perf.test.mjs — 03번 fps 독립화·렌더 경량화 순수 수식 검증
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIM_MAX, SUBSTEP, HOT_BRIGHT, RECT_MAX, simDt, substeps, impulseScale, trailAlpha, particleAlpha, isHot }
  from "../js/pieces/03-pearl-earring.js";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("simDt: 실제 경과가 유한수면 그것을(상한 SIM_MAX), 아니면 dt로 폴백", () => {
  assert.equal(simDt(0.1, 0.05), 0.1);
  assert.equal(simDt(0.9, 0.05), SIM_MAX);
  assert.equal(simDt(-0.01, 0.05), 0);
  assert.equal(simDt(undefined, 0.05), 0.05);
  assert.equal(simDt(NaN, 0.05), 0.05);
});

test("substeps: 합은 sim과 같고 각 스텝은 SUBSTEP 이하, 균등 분할", () => {
  const s = substeps(0.1);
  assert.equal(s.length, 5);
  assert.ok(s.every((h) => h <= SUBSTEP + 1e-12));
  assert.ok(near(s.reduce((a, b) => a + b, 0), 0.1));
  const t = substeps(0.05);
  assert.equal(t.length, 3);
  assert.ok(near(t[0], 0.05 / 3));
  assert.deepEqual(substeps(0), []);
  assert.equal(substeps(1 / 60).length, 1);
});

test("impulseScale: 60fps=1, 10fps=6(상한), 120fps=0.5(하한)", () => {
  assert.ok(near(impulseScale(1 / 60), 1));
  assert.ok(near(impulseScale(0.1), 6));
  assert.ok(near(impulseScale(0.25), 6));
  assert.ok(near(impulseScale(1 / 120), 0.5));
  assert.ok(near(impulseScale(1 / 240), 0.5));
});

test("trailAlpha: 60fps=0.34, 10fps≈0.917, 단조 증가", () => {
  assert.ok(near(trailAlpha(1 / 60), 0.34));
  assert.ok(near(trailAlpha(0.1), 1 - Math.pow(0.66, 6)));
  assert.ok(trailAlpha(0.05) > trailAlpha(1 / 60));
});

test("particleAlpha: bright≤1 구간은 현행 rgb×bright×(0.28+0.5·bright)와 동일값, 1.5에서 1", () => {
  const legacy = (b) => b * Math.min(1, 0.28 + b * 0.5);
  assert.ok(near(particleAlpha(0.5), legacy(0.5)));
  assert.ok(near(particleAlpha(1.0), legacy(1.0)));
  assert.ok(near(particleAlpha(0.45), legacy(0.45)));
  assert.equal(particleAlpha(1.5), 1);
  assert.equal(particleAlpha(1.8), 1);
});

test("isHot: HOT_BRIGHT 초과만 참, RECT_MAX는 2.0", () => {
  assert.equal(isHot(1.0), false);
  assert.equal(isHot(HOT_BRIGHT), false);
  assert.equal(isHot(1.2), true);
  assert.equal(RECT_MAX, 2.0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-perf && node --test test/pearl-perf.test.mjs 2>&1 | tail -6`
Expected: FAIL — export 없음(SyntaxError)

- [ ] **Step 3: 구현** — `03-pearl-earring.js`의 `pinchStep` 함수 바로 아래(`export default {` 위)에 추가

```js
// ---- fps 독립화·렌더 경량화 순수 수식 (node:test 대상) ----------------
// 셸의 dt는 0.05s로 캡되어 저fps에서 슬로모션이 된다. 실제 경과(realDt)로 진행하되
// 서브스텝으로 스프링 안정성을 지키고, 프레임당 임펄스·잔상은 dt에 맞춰 보정한다.
export const SIM_MAX = 0.25;    // 탭 복귀 폭주 방지 상한(초)
export const SUBSTEP = 0.02;    // 물리 서브스텝 최대(초) — spring 4.2·damping 3.4 안정 영역
export const HOT_BRIGHT = 1.15; // 이 밝기 초과는 흰색 혼합(백열) 문자열 사용
export const RECT_MAX = 2.0;    // 이 크기(px) 이하 입자는 arc 대신 fillRect

export function simDt(realDt, dt) {
  if (!Number.isFinite(realDt)) return dt;
  return Math.min(SIM_MAX, Math.max(0, realDt));
}

export function substeps(sim, maxStep = SUBSTEP) {
  if (!(sim > 0)) return [];
  const n = Math.ceil(sim / maxStep - 1e-9);
  return Array.from({ length: n }, () => sim / n);
}

// 프레임당 임펄스(scatter)를 60fps 기준으로 정규화: 10fps면 6배(상한), 120fps면 0.5배(하한)
export function impulseScale(sim) {
  return Math.min(6, Math.max(0.5, sim * 60));
}

// 잔상 알파: 60fps에서 0.34였던 페이드를 같은 벽시계 속도로 유지
export function trailAlpha(sim) {
  return 1 - Math.pow(1 - 0.34, sim * 60);
}

// lighter 합성에서 rgb×alpha가 더해지므로, 현행 "rgb×bright 채널 스케일 × 알파(0.28+0.5·bright)"와
// 같은 기여량을 alpha 하나로 표현한다. bright>1 구간은 1로 포화(흰색 혼합 문자열이 백열을 근사).
export function particleAlpha(bright) {
  return Math.min(1, bright * Math.min(1, 0.28 + 0.5 * bright));
}

export function isHot(bright) { return bright > HOT_BRIGHT; }
```

- [ ] **Step 4: 테스트**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-perf && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0` (6개 추가 → 93)

- [ ] **Step 5: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-perf && git add js/pieces/03-pearl-earring.js test/pearl-perf.test.mjs && git commit -m "$(cat <<'EOF'
feat: 03번 fps 독립화·렌더 경량화 순수 수식 — simDt/substeps/impulseScale/trailAlpha/particleAlpha + 테스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 셸 realDt 전달 + 03번 tick의 벽시계 진행 (서브스텝·임펄스·잔상)

**Files:**
- Modify: `js/main.js` `frame()` (현재 `const dt = Math.min(0.05, (now - lastT) / 1000);` … `piece.tick(dt, pointer);`)
- Modify: `js/pieces/03-pearl-earring.js` `tick(dt, ptr)` 전체와 `drawBackground()`의 잔상 알파

**Interfaces:**
- Consumes: Task 1의 `simDt`·`substeps`·`impulseScale`·`trailAlpha`.
- Produces: `piece.tick(dt, ptr, realDt)` 셸 규약(3번째 인자, 0.25 상한 실제 경과). 03번 모듈 상태 `let sim = 0;`(직전 tick의 sim — `drawBackground`가 읽음).

- [ ] **Step 1: main.js frame() 수정**

```js
function frame(now) {
  const real = (now - lastT) / 1000;
  const dt = Math.min(0.05, real);          // 탭 복귀 시 폭주 방지 캡(기존 작품 규약)
  lastT = now;
  snapshotPointer(dt);
  updateHandCursor(synthesizeHand(dt));   // 손이 보이면 이 프레임의 포인터는 손
  try {
    piece.tick(dt, pointer, Math.min(0.25, real)); // 3번째: 실제 경과(초) — fps 독립 진행이 필요한 작품용
  } catch (err) {
```
(`catch` 이하와 나머지는 무변경.)

- [ ] **Step 2: 03번 모듈 상태·tick 수정** — 모듈 상태에 `let sim = 0; // 이번 프레임의 시뮬레이션 진행(초, 실제 경과 기준)` 추가(`let flash = 0;` 아래). `tick`을 다음으로 교체(입력 블록의 로직은 동일, dt → sim, scatter에 impulseScale, step을 서브스텝으로):

```js
  tick(dt, ptr, realDt) {
    sim = simDt(realDt, dt);            // 실제 경과로 진행 — 저fps에서도 슬로모션 없음
    T += sim;
    const imp = impulseScale(sim);      // 프레임당 임펄스를 60fps 기준으로 정규화

    // 1) 입력 반영 --------------------------------------------------
    if (ptr && ptr.inside) {
      // 드래그: 촛불 바람 — 약한 scatter + 위쪽 부력
      if (ptr.down && (Math.abs(ptr.dx) > 0.01 || Math.abs(ptr.dy) > 0.01)) {
        const s = reduced ? 22 : 60;
        field.scatter(ptr.x, ptr.y, 90, s * imp);
        applyBuoyancy(ptr.x, ptr.y, 120, reduced ? 30 : 80, sim);
      }
      // 클릭: 촛불 깜빡임 웨이브 시작
      if (ptr.justDown) {
        flicker = FLICKER_DUR;
        flickerAge = 0;
        waveOrigin.x = ptr.x; waveOrigin.y = ptr.y;
      }
    }
    // 손(카메라): 손 속도 = 촛불 바람, 핀치 = 깜빡임 파동 — 마우스와 병행
    if (cam && cam.active()) {
      const h = cam.hands();
      const wind = handWind(handS, h.n ? h.x : null, h.n ? h.y : null, sim);
      if (wind) {
        const px = wind.x * W, py = wind.y * H;
        const g = 0.35 + 0.65 * wind.k;                     // 살랑(0.35)~세찬(1)
        field.scatter(px, py, 110, (reduced ? 22 : 60) * g * imp); // 손은 커서보다 넓게
        applyBuoyancy(px, py, 140, (reduced ? 30 : 80) * g, sim);
      }
      const lm = cam.landmarks();
      // cam.js가 21점 미만 손을 필터링하므로 lm[0]은 항상 21점 — pinchRatio는 0·4·8·9를 인덱싱
      const ratio = lm.length ? pinchRatio(lm[0]) : null;
      if (pinchStep(pinchS, ratio, sim).fire) {
        flicker = FLICKER_DUR; flickerAge = 0;
        waveOrigin.x = handS.x * W; waveOrigin.y = handS.y * H;
        flash = 0.25;
      }
      cursor = h.n ? { x: handS.x * W, y: handS.y * H } : null;
    } else {
      // 카메라 꺼짐: 손 없음으로 흘려 seen·closed를 풀고 쿨다운은 계속 감소 — 재활성 시 점프 속도 방지
      handWind(handS, null, null, sim);
      pinchStep(pinchS, null, sim);
      cursor = null;
    }
    if (flash > 0) flash -= sim;
    if (flicker > 0) { flicker -= sim; flickerAge += sim; }

    // 2) 시뮬레이션 — 20ms 서브스텝으로 스프링 안정성 유지 -------------
    for (const h of substeps(sim)) field.step(h);

    // 3) 렌더 -------------------------------------------------------
    drawBackground();
    drawParticles();
    drawPearls();
    drawHandCursor();
  },
```

- [ ] **Step 3: drawBackground 잔상 알파 dt 보정** — 첫 두 줄을

```js
  // 잔상 트레일: 빛 먼지의 여운 — 60fps에서 0.34였던 페이드를 실제 경과에 맞춰 보정
  ctx.fillStyle = "rgba(5,5,7," + trailAlpha(sim).toFixed(3) + ")";
  ctx.fillRect(0, 0, W, H);
```
로 교체(비네트 부분은 Task 3에서 바뀌므로 여기서는 그대로).

- [ ] **Step 4: 테스트 + 스모크**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-perf && node --test test/ 2>&1 | tail -4`
Expected: `# fail 0`

스모크(독립 스크립트, 서버 8097): 03번을 열고 3초 뒤 (a) 마우스 드래그 → 입자 흩어짐(드래그 영역 픽셀 분산 증가) 확인, (b) `CDP Emulation.setCPUThrottlingRate(6)`으로 저fps를 강제한 뒤 클릭 파동이 벽시계 0.6±0.1초에 소멸하는지(밝기 합이 파동 전 수준으로 복귀하는 시각) 확인 — 스로틀 전과 같아야 한다. 콘솔 에러 0.

- [ ] **Step 5: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-perf && git add js/main.js js/pieces/03-pearl-earring.js && git commit -m "$(cat <<'EOF'
feat: 03번 시뮬레이션 fps 독립화 — 셸 tick 3번째 인자 realDt, 20ms 서브스텝, 임펄스·잔상 dt 보정

저fps에서 dt 캡(0.05)이 만들던 슬로모션·약한 바람·긴 잔상을 제거. 기존 15작품은 3번째 인자 무시.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 03번 렌더 경량화 — 색 캐시·globalAlpha·fillRect 임계·비네트/헤일로 스프라이트 (+ 전/후 스크린샷)

**Files:**
- Modify: `js/pieces/03-pearl-earring.js` — `init`(캐시·스프라이트 생성), `resize`, `drawBackground`, `drawParticles`, `drawPearls`, 새 헬퍼 `buildColorCache`·`buildVignette`·`buildHalo`

**Interfaces:**
- Consumes: Task 1의 `particleAlpha`·`isHot`·`RECT_MAX`, Task 2의 `sim`·`trailAlpha`.
- Produces: 없음(렌더 내부). 시각 결과는 사용자 승인 대상.

- [ ] **Step 1: 모듈 상태·헬퍼 추가** — 모듈 상태에 `let vig = null, halo = null; // 오프스크린 스프라이트(비네트·진주 헤일로)` 추가. 파일 끝(`clamp255` 위)에 헬퍼 3개:

```js
// --- 오프스크린 스프라이트·색 캐시 (init/resize 시 1회) ---------------
// 입자 색 문자열을 매 프레임 만들지 않는다: 기본색과 백열(흰색 55% 혼합)색을 캐시.
function buildColorCache() {
  const ps = field.particles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p.css) continue;                              // resize 후 재호출 시 멱등
    const r = p.r | 0, g = p.g | 0, b = p.b | 0;
    p.css = "rgb(" + r + "," + g + "," + b + ")";
    const mix = (c) => (c + (255 - c) * 0.55) | 0;   // 백열: 흰색 쪽으로 55%
    p.cssHot = "rgb(" + mix(r) + "," + mix(g) + "," + mix(b) + ")";
  }
}

// 비네트: 매 프레임 라디얼 그라디언트 전체 화면 채움 대신 1회 렌더 후 drawImage
function buildVignette() {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = Math.max(1, W | 0); c.height = Math.max(1, H | 0);
  const g2 = c.getContext("2d");
  const g = g2.createRadialGradient(
    W * 0.46, H * 0.46, Math.min(W, H) * 0.1,
    W * 0.5, H * 0.5, Math.max(W, H) * 0.72
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  g2.fillStyle = g;
  g2.fillRect(0, 0, c.width, c.height);
  return c;
}

// 진주 헤일로: 따뜻한 흰색 글로우 스프라이트 64×64 (중심 1 → 0.5에서 0.4 → 가장자리 0)
function buildHalo() {
  if (typeof document === "undefined") return null;
  const S = 64, c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g2 = c.getContext("2d");
  const g = g2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,252,240,1)");
  g.addColorStop(0.5, "rgba(230,225,205,0.4)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  g2.fillStyle = g;
  g2.fillRect(0, 0, S, S);
  return c;
}
```

- [ ] **Step 2: init/resize 배선** — `init` 끝의 `tagPearls();` 뒤에 `buildColorCache(); vig = buildVignette(); halo = buildHalo();` 추가. `resize`를

```js
  resize(w, h) {
    W = w; H = h;
    if (field) { field.resize(w, h); tagPearls(); buildColorCache(); vig = buildVignette(); }
  },
```
로 교체. `dispose`에 `vig = null; halo = null;` 추가.

- [ ] **Step 3: drawBackground 교체** (Task 2에서 바꾼 잔상 줄은 유지)

```js
function drawBackground() {
  // 잔상 트레일: 빛 먼지의 여운 — 60fps에서 0.34였던 페이드를 실제 경과에 맞춰 보정
  ctx.fillStyle = "rgba(5,5,7," + trailAlpha(sim).toFixed(3) + ")";
  ctx.fillRect(0, 0, W, H);
  // 미세 비네트: 1회 렌더한 스프라이트를 덮는다(매 프레임 그라디언트 생성·채움 제거)
  if (vig) ctx.drawImage(vig, 0, 0, W, H);
}
```

- [ ] **Step 4: drawParticles 루프 교체** — `lum`·`tw`·`bright`·파동·`sz` 계산은 그대로 두고, 색/알파/채움 부분만:

```js
    // 밝기는 globalAlpha로(lighter 합성에서 rgb×alpha가 더해짐), 백열 구간은 흰색 혼합색
    ctx.globalAlpha = particleAlpha(bright);
    ctx.fillStyle = isHot(bright) ? p.cssHot : p.css;

    if (sz <= RECT_MAX) {
      ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
```
(기존 `const a = …; ctx.fillStyle = "rgba(" + clamp255(…) …` 5줄과 `if (sz <= 1.2)`를 위 코드로 대체. `clamp255`는 다른 곳에서 안 쓰면 삭제.)

- [ ] **Step 5: drawPearls 헤일로 교체** — 루프 안의 `const halo = ctx.createRadialGradient(...)` … `ctx.fill();`(헤일로 부분)을

```js
    // 2겹: 바깥 halo(스프라이트) + 안쪽 코어
    if (halo) {
      ctx.globalAlpha = 0.12 + glow * 0.6;
      ctx.drawImage(halo, p.x - gr, p.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
    }
```
로 교체. 코어 하이라이트(`rgba(255,255,255,ca)` arc)는 유지. 지역 변수명 `halo`가 모듈 변수와 겹치지 않게 그라디언트 코드가 완전히 사라졌는지 확인.

- [ ] **Step 6: 테스트 + 전/후 스크린샷**

Run: `cd /home/ec2-user/media-art2/.worktrees/pearl-perf && node --test test/ 2>&1 | tail -4` → `# fail 0`

독립 스크립트 `perf/shots.cjs`: 두 서버를 띄운다 — 변경 전 `python3 -m http.server 8098 --bind 127.0.0.1 -d /home/ec2-user/media-art2`(master), 변경 후 8097(worktree). 각각 03번을 열고 8초 대기(응집 완료) → 1280×800 스크린샷 `perf/before-03.png`·`perf/after-03.png`. 이어 두 이미지의 (a) 밝은 픽셀(luma>60) 수, (b) 진주 위치(0.61,0.55 부근 60px 박스) 평균 밝기, (c) 전체 평균 luma를 표로 보고. 기대: (a)(c) ±15% 이내, (b) 진주가 양쪽 모두 주변보다 뚜렷히 밝음. 그리고 8097에서 rAF 콜백 JS 시간(`--disable-frame-rate-limit --disable-gpu-vsync`, 카메라 꺼짐, 8초) 중앙값 보고 — 목표 ≤ 4ms(현행 6.5).

- [ ] **Step 7: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-perf && git add js/pieces/03-pearl-earring.js && git commit -m "$(cat <<'EOF'
feat: 03번 렌더 경량화 — 입자 색 문자열 캐시+globalAlpha, fillRect 임계 2px, 비네트·진주 헤일로 오프스크린 스프라이트

프레임당 6,500회 rgba/toFixed 문자열 생성과 전체 화면 그라디언트 채움 제거. 시각 규칙(twinkle·파동·진주 복원)은 동일.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: cam.js 순수 함수 `applyLandmarks` + `stats()` + `request({numHands})` + data.js `camHands` (TDD)

**Files:**
- Modify: `js/cam.js` (순수 함수 추출, `stats`, `request` 시그니처), `js/main.js`(📷 클릭), `js/data.js`(01·03·11), `test/cam.test.mjs`, `test/data.test.mjs`

**Interfaces:**
- Produces: `export function applyLandmarks(raw, prevLast)` → `{ lmarks, last }` (raw: MediaPipe 원본 랜드마크 배열들, 미반전). `export function stats()` → `{ mode, delegate, p50, renderer }`. `export async function request({ numHands = 2 } = {})`. `data.js` 선택 필드 `camHands: 1|2`.
- Consumes: 기존 `mirrorLandmarks`·`palmPoint`.

- [ ] **Step 1: 실패하는 테스트** — `test/cam.test.mjs` import에 `applyLandmarks` 추가 후 append:

```js
test("applyLandmarks: 21점 미만 손은 버리고, 거울 보정 후 5·9 중점을 last로", () => {
  const raw = [
    Array.from({ length: 21 }, (_, i) => ({ x: i === 5 ? 0.2 : i === 9 ? 0.4 : 0.3, y: 0.6, z: 0 })),
    Array.from({ length: 10 }, () => ({ x: 0.9, y: 0.9, z: 0 })),          // 잘린 손 → 제거
  ];
  const { lmarks, last } = applyLandmarks(raw, { n: 0, x: 0.1, y: 0.1 });
  assert.equal(lmarks.length, 1);
  assert.equal(last.n, 1);
  assert.ok(Math.abs(last.x - (1 - 0.3)) < 1e-12 && Math.abs(last.y - 0.6) < 1e-12);
});

test("applyLandmarks: 손 없음이면 n:0에 직전 좌표 유지, 두 손이면 n:2", () => {
  const prev = { n: 1, x: 0.33, y: 0.44 };
  const none = applyLandmarks([], prev);
  assert.deepEqual(none.lmarks, []);
  assert.deepEqual(none.last, { n: 0, x: 0.33, y: 0.44 });
  const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  assert.equal(applyLandmarks([hand, hand], prev).last.n, 2);
  assert.equal(applyLandmarks(undefined, prev).last.n, 0, "undefined 입력도 손 없음");
});
```
`test/data.test.mjs` append:
```js
test("camHands는 있으면 1 또는 2이고 cam: true인 작품에만 있다", () => {
  for (const w of WORKS) {
    if ("camHands" in w) {
      assert.ok(w.camHands === 1 || w.camHands === 2, `${w.no}.camHands`);
      assert.equal(w.cam, true, `${w.no}: camHands는 cam: true가 필요`);
    }
  }
  assert.equal(WORKS.find((w) => w.no === "03").camHands, 1, "03번은 주 손만 사용");
});
```

- [ ] **Step 2: 실패 확인** — `node --test test/cam.test.mjs test/data.test.mjs 2>&1 | tail -6` → FAIL(export 없음 / camHands 없음)

- [ ] **Step 3: cam.js 구현** — (a) 순수 헬퍼 블록에 추가:

```js
// 워커/메인 어느 경로든 원본 랜드마크를 같은 규칙으로 캐시에 반영한다:
// 21점 미만 손 제거 → 거울 보정 → 주 손 5·9 중점. 손 없으면 n:0에 직전 좌표 유지.
export function applyLandmarks(raw, prevLast) {
  const lmarks = mirrorLandmarks((raw || []).filter((lm) => lm && lm.length >= 21));
  if (!lmarks.length) return { lmarks, last: { n: 0, x: prevLast.x, y: prevLast.y } };
  const p = palmPoint(lmarks[0]);
  return { lmarks, last: { n: Math.min(2, lmarks.length), x: p.x, y: p.y } };
}
```
(b) 모듈 상태에 `let info = { mode: null, delegate: null, p50: null, renderer: null };` 추가, `export function stats() { return { ...info }; }`.
(c) `request(opts = {})`: `const numHands = opts.numHands === 1 ? 1 : 2;` 를 첫 줄에 두고 `createFromOptions`의 `numHands: 2` → `numHands`. 성공 시 `info = { mode: "main", delegate: <선택된 것>, p50: null, renderer: null }`(GPU 시도 성공이면 "GPU", 폴백이면 "CPU"). `stop()`에서 `info = { mode: null, delegate: null, p50: null, renderer: null }`.
(d) `detect()`의 결과 반영 6줄(`lmarks = mirrorLandmarks(...)` … `else { last = … }`)을 `({ lmarks, last } = applyLandmarks(res.landmarks, last));` 한 줄로 교체.

- [ ] **Step 4: main.js·data.js** — 📷 클릭 핸들러의 `const ok = await cam.request();`를 `const ok = await cam.request({ numHands: (WORKS[current] && WORKS[current].camHands) || 2 });`로(`WORKS`·`current`는 main.js 모듈 스코프에 이미 있음 — 없으면 `current` 정의 위치 확인). `data.js`: 01번 `cam: true, handPointer: true,` → `cam: true, handPointer: true, camHands: 1,`; 03번 `cam: true,` → `cam: true, camHands: 1,`; 11번 `cam: true,` → `cam: true, camHands: 1,`. 10·12번은 그대로(기본 2).

- [ ] **Step 5: 테스트** — `node --test test/ 2>&1 | tail -4` → `# fail 0`

- [ ] **Step 6: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-perf && git add js/cam.js js/main.js js/data.js test/cam.test.mjs test/data.test.mjs && git commit -m "$(cat <<'EOF'
feat: cam.js applyLandmarks 순수화·stats()·request({numHands}) + 01·03·11번 camHands:1

두 손이 필요한 10·12번만 numHands 2 — 주 손만 쓰는 작품의 추론 비용 절반.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 추론 워커 — `js/cam-worker.js` 신규 + `cam.js` 워커 모드(메인 폴백) + 픽스처 시임

**Files:**
- Create: `js/cam-worker.js`
- Modify: `js/cam.js` (`request`, `detect`, `stop`, 상태), `test/fixtures/fake-vision/vision_bundle.mjs`(1줄)

**Interfaces:**
- Consumes: Task 4의 `applyLandmarks`·`info`/`stats()`·`request({numHands})`.
- Produces: 워커 프로토콜 — 메인→워커 `{type:"init", base, model, numHands}`, `{type:"frame", frame, ts, fake?}`; 워커→메인 `{type:"ready", delegate, p50, renderer}`, `{type:"fail", msg}`, `{type:"result", landmarks, ts, ms}`. `stats().mode`는 `"worker"`(정상) 또는 `"main"`(폴백). 외부 계약(`hands/landmarks/video/drawMirror/stop/active`) 불변.

- [ ] **Step 1: `js/cam-worker.js` 작성** (클래식 Worker — `type` 옵션 없이 생성됨. 0.10.14 wasm 로더가 `importScripts`를 쓰므로 모듈 워커는 불가; 동적 `import()`는 클래식 워커에서 허용.)

```js
// js/cam-worker.js — 손 추적 추론 전용 워커(클래식). 메인 스레드는 프레임만 넘기고
// 결과를 캐시하므로 렌더 루프가 추론 시간에 멈추지 않는다. 브라우저 전용(테스트 미import).
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
  try {
    landmarker = await create("GPU"); delegate = "GPU";
    p50 = await bench(landmarker);
    if (p50 > GPU_SLOW_MS || SW_RENDERER.test(renderer)) {   // 소프트웨어 GL: GPU가 CPU보다 느리다
      try { landmarker.close(); } catch (_) {}
      landmarker = await create("CPU"); delegate = "CPU"; p50 = await bench(landmarker);
    }
  } catch (_) {
    landmarker = await create("CPU"); delegate = "CPU"; p50 = await bench(landmarker);
  }
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
```

- [ ] **Step 2: `cam.js` 워커 모드** — 상태 추가(모듈 상태 옆):

```js
let worker = null, inFlight = false, inFlightSince = 0;   // 워커 모드 상태
const READY_TIMEOUT_MS = 20000, INFLIGHT_WATCHDOG_MS = 3000;
```
`request(opts)` 본문을 다음 구조로 교체(세대 가드·트랙 정리 규약 유지). 워커 시도 → 실패 시 기존 메인 스레드 생성 코드로 폴백:

```js
export async function request(opts = {}) {
  if (active()) return true;
  const numHands = opts.numHands === 1 ? 1 : 2;
  const my = ++gen;
  let s = null, lm = null, v = null, w = null;
  try {
    s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
    if (my !== gen) throw new Error("stale");
    const base = cdnBase();
    const seam = typeof window !== "undefined" && !!window.__CAM_CDN__;
    // 1) 워커 경로: 추론을 메인 스레드 밖으로
    w = await startWorker(base, numHands).catch((e) => { console.warn("[cam] 워커 불가 — 메인 스레드 폴백", e); return null; });
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
      try { lm = await mk("GPU"); } catch (_) { lm = await mk("CPU"); d = "CPU"; }
      if (my !== gen) throw new Error("stale");
      info = { mode: "main", delegate: d, p50: null, renderer: null };
    }
    v = document.createElement("video");
    v.srcObject = s; v.muted = true; v.playsInline = true;
    await v.play();
    if (my !== gen) throw new Error("stale");
    stream = s; vid = v; landmarker = lm; worker = w; inFlight = false; seamOn = seam;
    lastVT = -1; lastAdvanceMs = performance.now(); lmarks = []; last = { n: 0, x: 0.5, y: 0.5 };
    console.info(`[cam] mode=${info.mode} delegate=${info.delegate} p50=${info.p50 ?? "-"}ms renderer=${info.renderer ?? "-"}`);
    return true;
  } catch (e) {
    if (s) for (const t of s.getTracks()) t.stop();
    if (v) v.srcObject = null;
    if (lm) { try { lm.close(); } catch (_) {} }
    if (w) { try { w.terminate(); } catch (_) {} }
    if (e.message !== "stale") console.warn("카메라 사용 불가", e);
    return false;
  }
}

// 워커 생성 → init → ready 대기(타임아웃). 실패는 throw.
function startWorker(base, numHands) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL("./cam-worker.js", import.meta.url)); }
    catch (e) { reject(e); return; }
    const timer = setTimeout(() => { w.terminate(); reject(new Error("worker ready timeout")); }, READY_TIMEOUT_MS);
    w.onerror = (e) => { clearTimeout(timer); w.terminate(); reject(e.error || new Error(e.message || "worker error")); };
    w.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === "ready") {
        clearTimeout(timer);
        info = { mode: "worker", delegate: m.delegate, p50: m.p50, renderer: m.renderer };
        w.onmessage = onWorkerMessage; w.onerror = (e) => console.warn("[cam] 워커 오류", e.message || e);
        resolve(w);
      } else if (m.type === "fail") { clearTimeout(timer); w.terminate(); reject(new Error(m.msg)); }
    };
    w.postMessage({ type: "init", base, model: MODEL_URL, numHands });
  });
}

function onWorkerMessage(ev) {
  const m = ev.data;
  if (m.type === "result") {
    ({ lmarks, last } = applyLandmarks(m.landmarks, last));
    inFlight = false;
  } else if (m.type === "fail") {
    console.warn("[cam] 워커 추론 실패", m.msg); inFlight = false;
  }
}
```
`active()`는 `!!(stream && (landmarker || worker))`로. 모듈 상태에 `let seamOn = false;` 추가.

`detect()`를 다음으로 교체(메인 폴백 경로는 기존 동기 코드 유지):

```js
function detect() {
  if (!active() || vid.readyState < 2) return;
  const nowMs = performance.now();
  if (vid.currentTime === lastVT) {
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
```
`stop()`에 `if (worker) { try { worker.terminate(); } catch (_) {} } worker = null; inFlight = false; seamOn = false;`와 `info` 초기화 추가.

- [ ] **Step 3: 픽스처 시임** — `test/fixtures/fake-vision/vision_bundle.mjs`의
`const s = (typeof window !== "undefined" && window.__FAKE_HANDS__) || …` 를
`const s = (typeof globalThis !== "undefined" && globalThis.__FAKE_HANDS__) || …` 로 교체하고 헤더 주석에 "워커에서는 cam.js가 frame 메시지의 fake로 globalThis에 주입" 한 줄 추가.

- [ ] **Step 4: 테스트 + 워커 E2E 스모크**

Run: `node --test test/ 2>&1 | tail -4` → `# fail 0` (`cam.js`가 여전히 node import-safe: `Worker`·`VideoFrame` 참조는 함수 안).

독립 스크립트 `perf/worker-smoke.cjs`(서버 8097): (a) 가짜 시임 — `window.__CAM_CDN__="/test/fixtures/fake-vision"`, getUserMedia 캔버스 스트림, `window.__FAKE_HANDS__={n:1,x:0.25,y:0.5}` → 03번 📷 → 활성 문구 → 콘솔에 `[cam] mode=worker` 확인 → 2초 후 손 커서 글로우가 화면 x≈25%에 있는지 픽셀 확인 → `pinch:true`로 파동 발생 확인. (b) 실제 CDN — 시임 없이 📷 → 활성 도달·`[cam] mode=worker delegate=CPU`(SwiftShader에서 벤치가 CPU를 고르는지) 확인, 콘솔 에러 0. (c) 폴백 — `window.Worker = undefined`로 덮은 뒤 📷 → `[cam] mode=main`으로 활성 도달(회귀 없음).

- [ ] **Step 5: 커밋**

```bash
cd /home/ec2-user/media-art2/.worktrees/pearl-perf && git add js/cam-worker.js js/cam.js test/fixtures/fake-vision/vision_bundle.mjs && git commit -m "$(cat <<'EOF'
feat: 손 추적 추론을 워커로 분리 — cam-worker.js(클래식 Worker+동적 import, 델리게이트 자동 벤치), cam.js 프레임 전송·결과 캐시·메인 스레드 폴백·[cam] 텔레메트리

추론 시간이 렌더 루프를 멈추던 근본 원인 제거. 소프트웨어 GL에서는 GPU(320ms)→CPU(55ms) 자동 선택.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 검증 — 성능 측정·E2E 재실행·전/후 스크린샷 패키지

**Files:** 저장소 변경 없음(스크래치 `perf/*.cjs`, 결과 `perf/report.md`). 회귀가 발견되면 해당 Task로 되돌려 수정.

**Interfaces:**
- Consumes: Task 1~5 전체. 진단에 쓴 하네스 `/tmp/claude-1000/-home-ec2-user-media-art2/8b317a85-4713-4d2d-8e77-f06d6f1a2bef/scratchpad/lag-measure2.cjs`(읽기 참고; 서버 포트·경로만 8097/worktree로 바꿔 복사해 사용).

- [ ] **Step 1: 성능 측정 (카메라 켜짐, 실제 CDN, 손 없음·손 있음 각 10초)** — 지표: rAF 간격 p50/p90/max, 50ms 초과 long task 수, `simRealRatio`(시뮬레이션 진행/벽시계 — 03번이 콘솔에 노출하지 않으므로 페이지에서 `performance.now()` 기반 rAF 간격 합과 `Math.min(0.25, real)` 합을 비교해 계산), 콘솔의 `[cam]` 줄. 손 있음은 진단 하네스의 손 사진(`lag-hand.jpg`)을 가짜 스트림 캔버스에 그려 재현.
  기대: p90 ≤ 20ms, long task ≤ 2/10초, simRealRatio ≥ 0.95, `mode=worker delegate=CPU`.
  변경 전(master, 서버 8098) 같은 측정을 1회 돌려 표에 나란히 둔다.

- [ ] **Step 2: 카메라 꺼짐 JS 프레임 비용** — `--disable-frame-rate-limit --disable-gpu-vsync`로 03번 8초, rAF 콜백 시간 중앙값: 변경 전 vs 후(목표 ≤ 4ms).

- [ ] **Step 3: 기능 E2E 재실행** — Task 8(2026-09-18 계획)의 8부 시나리오를 워커 시임으로 재실행: 손 커서 위치·스윕 바람·핀치 1회 발화/유지 무발화/해제 후 재발화·손 제거·마우스 병행·CDN 실패 폴백 문구·Escape 리셋·구도 불변. 10번(두 손 붕괴 — `numHands` 기본 2 유지)과 01번(handPointer)도 📷 활성·콘솔 에러 0만 스모크.

- [ ] **Step 4: 전/후 스크린샷 패키지** — Task 3 Step 6의 `before-03.png`/`after-03.png`에 더해, 카메라 켜짐 상태 `after-03-cam.png`. 세 장의 경로와 밝은 픽셀 수·진주 밝기·평균 luma 표를 `perf/report.md`에 정리. **여기서 멈추고 사용자 승인을 받는다**(원작 대조 → 병합·배포는 승인 후).

- [ ] **Step 5: 승인 후** — `git merge --no-edit feature/pearl-perf`는 메인 체크아웃(master)에서, 병합 결과 `node --test test/` 통과 확인 → `git push origin master` → `./tools/deploy.sh` → 라이브 파일 sha256 대조 → 01·11번 세션(media-art2-1c·media-art2-09)에 `cam.js` 변경(워커 모드·`request({numHands})`·`camHands`) 통지.
