# 03번 진주 귀걸이 반응 지연 개선 설계 — 추론 워커 분리 · 시뮬레이션 fps 독립화 · 렌더 경량화

- 날짜: 2026-09-19
- 대상: `js/cam-worker.js`(신규), `js/cam.js`, `js/main.js`, `js/data.js`,
  `js/pieces/03-pearl-earring.js`, `test/fixtures/fake-vision/vision_bundle.mjs`,
  `test/cam.test.mjs`, `test/pearl-perf.test.mjs`(신규), `test/data.test.mjs`
- 브랜치: `feature/pearl-perf` (master 60b024f 기반, worktree `.worktrees/pearl-perf`)
- 선행: `2026-09-18-pearl-camera-design.md`(03번 카메라), 진단 결과는 아래 "근본 원인" 절

## 증상

사용자 보고: 03번에서 움직임(손·마우스)에 대한 반응이 "렌더링이 걸린 것처럼 한참
있다가" 나타난다. Firefox와 Windows에서 무거웠고, 카메라를 켰을 때와 꺼서 마우스만
쓸 때 모두 늦었다.

## 근본 원인 (진단 워크플로·프로파일 실측)

1. **카메라 켜짐 — 동기 추론이 렌더 루프를 멈춘다.** `js/cam.js` `detect()`가
   `landmarker.detectForVideo()`를 rAF 콜백(메인 스레드) 안에서 동기 호출한다. 새
   카메라 프레임마다(초당 최대 30회) 손이 없어도 돈다. 실측(headless CPU 경로):
   손 없음 p50 125ms, 두 손 291ms, 10초 동안 long task 62개. 실제 GPU 노트북도
   8~25ms로 16.7ms 프레임 예산을 넘긴다. 추론 중에는 화면이 멈추고 입력은 그
   사이 짧은 프레임에서만 소비된다.
2. **`dt` 상한이 저fps에서 슬로모션을 만든다(증폭기).** `js/main.js` `frame()`은
   `dt = min(0.05, 실제)`로 캡한다. 프레임이 20fps 아래로 떨어지면 시뮬레이션이
   실시간의 `0.05 × fps` 배속으로 진행된다(실측 2.3~4.5배 슬로모션). 바람 임펄스
   (`field.scatter`)는 dt 미반영 프레임당 상수라 fps에 비례해 약해지고, 잔상
   (알파 0.34/프레임)은 저fps에서 0.5~0.8초 남는다. "늦게, 느리게, 약하게 반응"의
   두 번째 축이다.
3. **소프트웨어 GL 기기에서 GPU 델리게이트가 CPU보다 6배 느린데도 GPU를 고수한다.**
   `cam.js`는 GPU 생성이 예외를 던질 때만 CPU로 폴백한다. SwiftShader 같은 환경은
   GPU 생성이 "성공"하고 p50 320ms(CPU 55ms)가 나온다. 어떤 델리게이트가 선택됐는지
   로그가 없어 현장 판별이 불가하다.
4. **카메라 꺼짐 — 03번의 프레임당 JS 비용이 02번의 2~3배.** 1280×800에서 03번
   6.5~10ms(02번 3.4ms). 입자 6,500개마다 `rgba(…, a.toFixed(3))` 문자열을 만들고
   4,700개를 `arc` 경로로 채우며, 비네트 라디얼 그라디언트를 매 프레임 새로 만들어
   전체 화면을 두 번 채운다. 코드 경로 자체는 60fps에서 입력→화면 1프레임이지만,
   Firefox(Windows D2D 캔버스)처럼 작은 경로 채움이 비싼 환경과 저사양 CPU에서는
   fps가 20 아래로 떨어져 2번의 증폭이 발동한다.

기각된 가설(측정 근거): `lighter` 합성 비용(무력화해도 동일), 그라디언트 객체 생성
비용(동일), 스프라이트 아틀라스 렌더 전환(합성 벤치에서 현행과 동일 틱 — 채택 안 함),
한 프레임 2회 추론(currentTime 캐시로 0회 확인), `handWind` EMA/임계 지연(합쳐도
~150ms), STALE_MS·PINCH_COOL(속도 0에서만 동작), 네트워크 로딩(활성화 1회성).

## 확정된 요구사항 (사용자 선택)

1. **범위**: 아래 세 갈래를 모두 한 PR로 진행한다 — (A) 추론 워커 분리,
   (B) 시뮬레이션 fps 독립화, (C) 03번 렌더 경량화(모양 유지).
2. **배포**: 구현·측정 후 원작 대조 스크린샷과 수치를 보여 승인받은 뒤 master 병합·
   CloudFront 배포.
3. **계약 유지**: `opts.cam`의 `active/hands/landmarks/video/drawMirror`, 거울 보정
   좌표계, `STALE_MS` 노후화, 21점 필터, `mirrorLandmarks`/`palmPoint`는 그대로.
   01·10·11번 코드는 변경하지 않는다.

## 아키텍처

### (A) js/cam-worker.js — 신규, 클래식 Worker

실측: `@mediapipe/tasks-vision@0.10.14`는 **클래식 Worker 안에서 동적 `import()`**
로만 동작한다(모듈 Worker는 wasm 로더의 `importScripts`가 없어 실패). 워커 추론
56ms 동안 메인 rAF 간격은 16.7ms로 고정됨을 확인했다.

- 메시지 프로토콜(메인 → 워커):
  - `{ type: "init", base, model, numHands, seam }` — `await import(base + "/vision_bundle.mjs")`,
    `FilesetResolver.forVisionTasks(base + "/wasm")`, `HandLandmarker.createFromOptions`
    (VIDEO 모드, `numHands`). **델리게이트 자동 선택**: renderer(`WEBGL_debug_renderer_info`)가
    `/SwiftShader|llvmpipe|Software|Basic Render/i`에 맞으면 GPU 시도를 건너뛰고 바로 CPU
    (구현 중 확인: 소프트웨어 GL에서 GPU 생성+벤치가 15초 이상 걸려 대기 시간을 초과함).
    아니면 GPU로 생성 → 빈 640×480 `OffscreenCanvas` 프레임으로 워밍업 1회 + 6회 벤치 →
    p50 > 40ms면 `close()` 후 CPU로 재생성. GPU 생성 예외도 CPU 폴백. 단계마다
    `{ type: "progress", stage }` 하트비트(import·fileset·create·bench) 전송.
    응답 `{ type: "ready", delegate, p50, renderer }` 또는 `{ type: "fail", msg }`.
  - `{ type: "frame", frame, ts, fake? }` (frame은 transfer) — `ts = max(prevTs + 1, ts)`
    단조 가드 → `detectForVideo(frame, ts)` → `frame.close()` → 응답
    `{ type: "result", landmarks, ts, ms }`. `fake`가 있으면 `globalThis.__FAKE_HANDS__ = fake`
    를 탐지 전에 설정(E2E 시임 — 가짜 번들이 읽음). 예외 메시지에 `timestamp`가
    포함되면 랜드마커를 같은 델리게이트로 재생성한 뒤 `{ type: "result", landmarks: [] }`.
- 워커는 `self.onmessage` 하나, 브라우저 전용 파일(테스트에서 import하지 않음).
  배포 allowlist `js/*`에 포함.

### (A) js/cam.js — 워커 소유 + 메인 스레드 폴백

- `request({ numHands = 2 } = {})`: getUserMedia → `new Worker(new URL("./cam-worker.js", import.meta.url))`
  (클래식) → `init` 전송 → `ready`/`fail` 대기 — 고정 타임아웃이 아니라 **마지막 메시지
  (progress 포함) 이후 25초 무응답**(`READY_IDLE_MS`)일 때 실패 → 실패 시 **기존
  메인 스레드 경로로 폴백**(현행 코드 유지: 동적 import + 동기 detect). 세대 가드는
  `await` 경계마다 유지. 대기 중 워커는 모듈 슬롯(`pendingWorker`/`pendingAbort`)에
  두어 `stop()`이 즉시 종료할 수 있다. 준비 후 워커가 죽으면(`onerror` 또는 연속 3회
  `fail`) 같은 파라미터로 **1회 재시작**, 실패하면 `stop()`으로 비활성화하고 "카메라
  버튼을 다시 눌러 주세요" 경고 1회.
- 상태: `mode: "worker" | "main" | null`, `worker`, `inFlight: boolean`,
  `inFlightSince`, `stats = { delegate, p50, renderer, mode }`.
- `detect()`(워커 모드): `!active() || vid.readyState < 2` → return. `vid.currentTime === lastVT`
  → 기존 STALE_MS 비우기 유지 → return. 아니면 `lastVT`·`lastAdvanceMs` 갱신 후,
  `inFlight`면 이 프레임은 건너뛴다(one-in-flight 백프레셔). 아니면 `inFlight = true`로
  두고 **비동기 `sendFrame()`을 호출만 하고 즉시 반환**한다(`detect()` 자체는 동기 유지 —
  `hands()`가 동기 계약이므로). `sendFrame()`: `typeof VideoFrame !== "undefined"
  ? new VideoFrame(vid) : await createImageBitmap(vid)` → `postMessage({ type: "frame",
  frame, ts: performance.now(), fake }, [frame])`; 생성 실패 시 `inFlight = false`.
  `inFlight`가 3초 넘게 유지되면 워커 행으로 보고 `inFlight=false` + `console.warn` 1회.
- `onmessage("result")`: `applyLandmarks(raw)` — 기존 21점 필터 + `mirrorLandmarks` +
  `palmPoint` → `lmarks`, `last` 갱신. `inFlight=false`. 순수 함수
  `applyLandmarks(raw, prevLast)` → `{ lmarks, last }`로 분리·export(테스트 대상).
- `hands()`·`landmarks()`·`drawMirror()`는 `detect()`를 호출하고 캐시를 동기 반환
  (외부 계약 동일). `stop()`은 `worker.terminate()`·트랙 정지·상태 초기화.
- `stats()` export 추가(`{ mode, delegate, p50, renderer }`), `ready` 시
  `console.info("[cam] mode=worker delegate=CPU p50=56ms renderer=…")` 1회.
- E2E 시임: `window.__CAM_CDN__`를 `base`로 워커에 전달, `window.__FAKE_HANDS__`를
  매 프레임 메시지의 `fake`로 동봉(`__CAM_CDN__`가 설정된 경우에만).
  `test/fixtures/fake-vision/vision_bundle.mjs`는 `window.__FAKE_HANDS__` 대신
  `globalThis.__FAKE_HANDS__`를 읽도록 1줄 수정(메인 스레드에서는 `window === globalThis`
  라 폴백 경로도 그대로 동작). 상대 경로 `/test/fixtures/...`는 워커에서도 같은 출처
  절대 경로로 해석된다.

### (A) js/main.js · js/data.js — 작품별 numHands

- `data.js`: 선택 필드 `camHands: 1|2`. 03번 `1`(주 손만 사용), 11번 `1`(hands만 소비),
  01번 `1`(한 손 펼침), 10번은 필드 없음 → 기본 2(두 손 붕괴).
- `main.js` 📷 클릭: `cam.request({ numHands: WORKS[current].camHands ?? 2 })`.
- `test/data.test.mjs`: `camHands`가 있으면 1 또는 2, 그리고 `cam: true`인 항목에만.

### (B) 시뮬레이션 fps 독립화 — main.js 3번째 인자 + 03번 서브스텝

- `main.js frame()`: `const real = (now - lastT) / 1000; const dt = Math.min(0.05, real);`
  `piece.tick(dt, pointer, Math.min(0.25, real));` — **세 번째 인자 `realDt` 추가만**.
  기존 15작품은 인자를 무시하므로 무영향. 0.25초 상한은 탭 복귀 폭주 방지.
- 03번 `tick(dt, ptr, realDt)`: 순수 함수(export, node:test)
  ```
  simDt(realDt, dt)        → Number.isFinite(realDt) ? min(0.25, max(0, realDt)) : dt
  substeps(sim, maxStep=0.02) → 균등 분할 스텝 배열 (예: 0.1 → 5×0.02, 0.05 → 3×0.01667)
  impulseScale(sim)        → clamp(sim × 60, 0.5, 6)   // 60fps에서 1.0
  trailAlpha(sim)          → 1 − (1 − 0.34)^(sim × 60)  // 60fps에서 0.34
  ```
  - `T`, `flicker/flickerAge`, `flash`, `handWind`·`pinchStep`·`applyBuoyancy`의 dt,
    입력 임펄스 모두 `sim` 기준. `field.scatter(x, y, r, s × impulseScale(sim))`.
  - `for (const h of substeps(sim)) field.step(h)` — spring 4.2·damping 3.4·PEARL_SPRING 2.1의
    명시적 오일러 안정성을 20ms 스텝으로 보장.
  - `drawBackground()`의 잔상 알파 = `trailAlpha(sim)`.
  - 감각 목표: fps 10에서도 촛불 파동 0.6초, 진주 복원, 바람 세기가 60fps와 같은
    벽시계 시간으로 진행된다(끊길 수는 있어도 늦거나 약해지지 않음).

### (C) 03번 렌더 경량화 (모양 유지)

- **색 문자열 캐시**: 입자 생성·`resize` 직후 `buildColorCache()`가 입자마다
  `p.css = "rgb(r,g,b)"`와 `p.cssHot = "rgb(r',g',b')"`(흰색 쪽으로 55% 혼합)를 만든다.
  `drawParticles`는 `fillStyle = bright > 1.15 ? p.cssHot : p.css`,
  `globalAlpha = particleAlpha(bright)` 로 밝기를 표현한다.
  ```
  particleAlpha(bright) → min(1, bright × min(1, 0.28 + 0.5 × bright))
  ```
  `lighter` 합성에서 `rgb × alpha`가 더해지므로 bright ≤ 1 구간은 현행
  (`rgb × bright` 채널 스케일 × `0.28 + 0.5 × bright` 알파)과 수치적으로 동일하고,
  bright > 1의 "백열" 구간만 흰색 혼합 문자열로 근사한다. `toFixed`·문자열 결합 0회.
- **경로 채움 축소**: `fillRect` 임계 `sz <= 1.2` → `sz <= 2.0`(대부분의 입자가
  사각형으로; 2px 이하 사각형과 원은 육안 구분 불가). 루프 종료 후 `globalAlpha = 1`.
- **비네트 1회 렌더**: `init`·`resize`에서 W×H 오프스크린 캔버스에 라디얼
  그라디언트를 그려 두고 `drawBackground`는 잔상 `fillRect` 1회 + `drawImage(vig)` 1회.
- **진주 헤일로 스프라이트**: 64×64 오프스크린에 따뜻한 흰색 라디얼 글로우
  (`rgba(255,252,240,1)` → `rgba(230,225,205,0.4)` → 투명)를 1회 렌더. `drawPearls`는
  `globalAlpha = 0.12 + glow × 0.6`로 `drawImage(halo, x−gr, y−gr, 2gr, 2gr)`. 코어
  하이라이트 `arc`(21개)는 유지.
- `drawHandCursor`는 프레임당 1회라 그대로 둔다.
- 시각 승인 기준: 카메라 꺼짐 안정 상태 스크린샷을 변경 전/후로 나란히 놓고
  구도·진주 위치·밝기 분포가 같음을 확인(메모리 규칙: 원작 대조 후 사용자 승인).

## 에러 처리

- 워커 생성·`init` 실패·20초 타임아웃·`fail` 응답: 메인 스레드 경로로 폴백해 현행
  동작 유지(기능 회귀 없음). `console.info`에 `mode=main` 기록.
- 워커 추론 예외: 결과 `[]`로 응답, `timestamp` 오류면 랜드마커 재생성. 메인은
  `inFlight` 3초 워치독으로 행을 회복.
- 프레임 전송 실패(`VideoFrame` 생성 예외): `createImageBitmap` 재시도, 그것도
  실패하면 해당 프레임 건너뜀.
- 카메라 트랙 종료·뮤트: 기존 STALE_MS 비우기 그대로(currentTime 정지 감지).
- `realDt`가 없거나 비정상(NaN·음수): `simDt`가 `dt`로 폴백 → 현행과 동일.
- 뷰어 닫힘 레이스: 세대 가드가 워커 `terminate()`까지 담당.

## 프라이버시

변경 없음 — 프레임은 같은 출처의 워커로만 전달되며 저장·전송하지 않는다. 워커는
`stop()`에서 종료된다. 콘솔 텔레메트리는 델리게이트·소요 ms·렌더러 문자열만 담는다.

## 테스트

- `test/cam.test.mjs` 추가: `applyLandmarks(raw, prevLast)` — 21점 필터, 거울 보정,
  손 없음 시 `n:0`·좌표 유지, 두 손 `n:2`.
- `test/pearl-perf.test.mjs`(신규): `simDt`(NaN·음수·상한), `substeps`(합이 sim과
  같고 각 스텝 ≤ 0.02), `impulseScale`(60fps=1, 10fps=6, 120fps=0.5), `trailAlpha`
  (60fps=0.34, 10fps≈0.92), `particleAlpha`(bright 0.5·1.0에서 현행 공식과 동일값,
  1.5에서 1.0), `isHot(bright)` 임계.
- `test/data.test.mjs`: `camHands` 검사 추가. 기존 46개 테스트 유지(순수 함수 계약
  무변경). `cam.js`·03번은 여전히 node import-safe(워커·OffscreenCanvas는 함수 안에서만).
- E2E(headless, 독립 playwright-core 스크립트, 저장소 밖):
  1. 가짜 MediaPipe 시임: 워커가 `/test/fixtures/fake-vision/vision_bundle.mjs`를
     import → `fake` 동봉으로 손 좌표·핀치 연출 → 03번 손 커서·바람·파동 재현
     (기존 Task 8 시나리오 재실행).
  2. 실제 CDN(로컬 서버 + jsDelivr): 📷 활성 도달, 콘솔의 `[cam] mode=worker
     delegate=… p50=…` 확인, SwiftShader에서 `delegate=CPU` 자동 선택 확인.
  3. 성능: 진단에 쓴 `lag-measure2.cjs` 방식으로 카메라 켜짐(손 없음·손 있음) 10초 —
     rAF 간격 p90 ≤ 20ms, long task ≤ 2/10초, `simRealRatio` ≥ 0.95(캡 미발동),
     카메라 꺼짐 JS 프레임 비용 ≤ 4ms(현행 6.5).
  4. 시각: 변경 전(master)·후 카메라 꺼짐 안정 상태 스크린샷 나란히 → 사용자 승인.
- 실기: 사용자 노트북(Firefox·Windows 포함)에서 카메라 켠 채 손을 흔들 때 멈춤이
  없는지, 콘솔의 `[cam]` 한 줄을 공유받아 델리게이트 확인.

## 하지 않는 것 (YAGNI)

- 스프라이트 아틀라스로 입자 렌더 전환(벤치에서 이득 없음), WebGL 렌더러 도입.
- `main.js` dt 캡 자체 변경(다른 15작품 물리 튠 보호) — 3번째 인자로만 확장.
- 10번의 numHands 축소(두 손 붕괴 필요), 01·10·11번 피스 코드 변경.
- MediaPipe 1.x 업그레이드(별건), 모델 셀프 호스팅.
- `WIND_MIN`/`WIND_FULL` 등 손 바람 튠 변경(시각·감각 승인이 별도로 필요).
