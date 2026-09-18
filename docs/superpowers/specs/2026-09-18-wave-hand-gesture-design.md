# 01번 After Hokusai — Great Wave 손짓 인터랙션 설계

- 날짜: 2026-09-18
- 대상: `js/hand.js`(신규), `js/main.js`, `js/data.js`, `index.html`, `css/style.css`,
  `js/pieces/01-great-wave.js`, `test/hand.test.mjs`(신규), `README.md`
- 브랜치: `feature/wave-hand-gesture` (master `43f72f4` 기반)

## 목표

01번의 마우스 인터랙션(드래그 = 소용돌이, 클릭 = 물보라)을 카메라 앞 손짓으로 일으킨다.
관객이 펼친 손으로 물을 휘젓고, 주먹을 쥐었다 펼쳐 물보라를 튕긴다. 마우스는 폴백이자
병행 입력으로 유지한다.

## 확정된 요구사항 (사용자 선택)

1. **인식 기술**: MediaPipe Hand Landmarker(손 관절 21점, 한 손). Gesture Recognizer·순수 JS
   모션 감지는 채택하지 않음 — 연속값(펼침 정도)이 필요하고 손/몸 구분이 필요하다.
2. **마우스 폴백**: 09번 마이크와 같은 패턴. 카메라가 켜져 있고 손이 보이면 손이 포인터를
   대체하고, 그 외에는 기존 마우스 드래그·클릭이 그대로 동작한다.
3. **권한 UX**: 뷰어 내 📷 버튼 클릭 시에만 getUserMedia 요청. 자동 요청 금지.
4. **범위**: 01번만 `hand: true`. 다른 작품 적용은 이번 범위 밖(플래그만 켜면 되도록 설계).

## 아키텍처 (A안: 셸 공용 손 서비스 + 포인터 합성)

핵심 아이디어: 손은 "위치 + 누름"이라는 점에서 포인터와 동형이다. 셸이 손 상태를 기존
포인터 스냅샷 규약(`x, y, dx, dy, down, justDown, justUp, inside, downTime`)에 합성하면
작품 모듈 16개 어디에도 손 인식 코드가 들어가지 않는다. 09번 마이크가 작품 폴링 방식을
택한 것과 달리 포인터 합성을 택하는 이유가 이것이다.

### js/hand.js — 신규 공용 서비스

셸(main.js)이 수명을 소유한다. mic.js와 동일한 구조(순수 계산부 + 브라우저 서비스부).

**서비스부 API**

- `request(): Promise<boolean>` — 아래 순서로 준비하고 성공 여부를 돌려준다.
  1. `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } })`
  2. `<video muted playsinline autoplay>` 생성·재생. `display:none`이면 일부 브라우저가 프레임
     갱신을 멈추므로 `hidden` 대신 `position:fixed; width:2px; height:2px; opacity:0; pointer-events:none`으로
     화면 밖에 둔다(`body`에 부착).
  3. 동적 `import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs")`
  4. `FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm")`
  5. `HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: <모델 URL>, delegate: "GPU" }, runningMode: "VIDEO", numHands: 1 })`
     — 실패 시 `delegate: "CPU"`로 1회 재시도.
  - 모델 URL: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` (7.8MB)
  - 재클릭(이미 활성)이면 즉시 true.
  - 세대(generation) 가드: `stop()`·재요청마다 `gen++`. 각 await 뒤에 `my !== gen`이면
    스트림 트랙 정지·landmarker close·video 제거 후 폐기(mic.js와 동일 원리).
- `active(): boolean` — 스트림과 landmarker가 모두 준비된 상태.
- `poll(nowMs): HandSample | null` — 매 프레임 셸이 호출. `video.currentTime`이 직전 검출
  때와 같으면 새 비디오 프레임이 없으므로 직전 샘플을 그대로 돌려준다(검출은 ~30fps로
  제한). 새 프레임이면 `landmarker.detectForVideo(video, nowMs)`를 실행해 샘플을 갱신한다.
  검출 예외는 `console.warn` 후 `null`(그 프레임은 마우스 폴백).
  ```
  HandSample = { visible: boolean, x: number, y: number, openness: number, t: number }
  // x, y: 카메라 정규화 좌표(0..1, 미러링 이전의 원본). visible=false면 x,y,openness는 직전 값 유지.
  ```
- `stop()` — `gen++`, 트랙 정지(카메라 표시등 소등), landmarker close, video 제거, 상태 초기화.

**순수 계산부 (export, node:test 대상 — import 시점에 브라우저 API를 참조하지 않음)**

- `openness(landmarks): number` — 21개 `{x, y}` 배열을 받아 펼침 정도 0..1을 돌려준다.
  ```
  palm  = dist(landmark[0], landmark[9])                    // 손목 ~ 중지 뿌리 = 손바닥 크기
  tips  = [4, 8, 12, 16, 20]                                // 엄지·검지·중지·약지·소지 끝
  ratio = mean(dist(landmark[0], landmark[tip]) / palm)     // 손목 ~ 손끝 거리 비
  openness = clamp((ratio − 1.2) / (1.8 − 1.2), 0, 1)      // 주먹 ≈ 1.1, 반쯤 오므림 ≈ 1.5, 펼침 ≈ 1.85
  ```
  손바닥 크기로 나누므로 카메라와의 거리에 무관하다. palm이 0이면 0. 1.2·1.8은 보정 상수로,
  실제 웹캠 수동 검증에서 주먹이 0.1 이하·펼침이 0.9 이상으로 읽히지 않으면 조정한다.
- `makePointerState(): HandPointerState` — 합성기 내부 상태(평활 위치, 직전 openness,
  주먹 진입 시각, 손 소실 시각 등) 초기값.
- `applyHand(pointer, sample, state, dt, w, h): boolean` — 아래 "합성 규칙"을 구현한다.
  `sample`이 `null`이면(검출 예외·아직 첫 검출 전) 그 프레임은 '손 안 보임'으로 취급한다.
  손이 포인터를 점유했으면 true, 마우스에 맡겨야 하면 false를 돌려준다. `pointer`의
  기존 필드를 제자리에서 덮어쓰고 `pointer.hand`를 갱신한다.

### 합성 규칙 (applyHand)

상수(초·비율): `OPEN_ON = 0.5`, `OPEN_OFF = 0.3`, `LOST_GRACE = 0.4`,
`REACH = 0.15`(카메라 프레임 가장자리 15%씩 제외), `SMOOTH = 14`(1/s, EMA 반응 속도).

| 손 상태 | 포인터 해석 |
|---|---|
| 손이 보이고 openness ≥ OPEN_ON (펼침) | `inside = true`, `down = true`, 위치 = 평활된 손바닥 중심 |
| 손이 보이고 openness ≤ OPEN_OFF (주먹) | `inside = true`, `down = false` |
| 그 사이(0.3 < openness < 0.5) | 직전 down 상태 유지(히스테리시스) |
| 주먹 → 펼침 전환(문턱 OPEN_OFF 아래에서 OPEN_ON 위로) | 그 프레임에 `justDown = true` 1회 펄스. 시간 제한 없음 — 주먹을 오래 쥐었다 펼쳐도 물보라 |
| 펼침 → 주먹 전환 | 그 프레임에 `justUp = true` 1회 펄스 |
| 손이 LOST_GRACE 이상 안 보임 | 반환 false → 셸이 마우스 상태를 그대로 둔다 |
| 손이 LOST_GRACE 미만으로 잠깐 사라짐 | 직전 손 상태 유지(깜빡임 억제) |

- **위치 매핑**: 셀피 카메라이므로 좌우 반전. `u = clamp((1 − sample.x − REACH) / (1 − 2·REACH), 0, 1)`,
  `v = clamp((sample.y − REACH) / (1 − 2·REACH), 0, 1)`. 팔이 카메라 가장자리까지 닿기
  어려우므로 중앙 70% 구간을 화면 전체로 늘린다. 화면 좌표는 `u·w, v·h`.
- **평활**: `state.sx += (targetX − state.sx) · min(1, SMOOTH·dt)`. 손이 처음 보인 프레임은
  점프(평활 없이 대입)해 화면 밖에서 끌려오는 느낌을 없앤다.
- `dx, dy`는 평활 위치의 프레임 차분. `downTime`은 down 유지 시간 누적(마우스와 동일).
- `pointer.hand = { visible, openness, speed }` — 작품이 선택적으로 읽는 부가 정보.
  손이 포인터를 점유하지 않는 프레임에도 `pointer.hand`는 `{ visible: false, openness: 0, speed: 0 }`으로 존재한다
  (작품이 `ptr.hand?.visible`로만 분기하면 된다).
- **손바닥 중심**: landmark 0(손목)·5·9·13·17(네 손가락 뿌리)의 평균.

### js/main.js — 셸 수정

- `import * as hand from "./hand.js"`.
- 📷 버튼 `#v-hand`: `work.hand === true`일 때만 노출. 클릭 시 토글. 마이크 버튼과 같은
  `reqSeq` 늦은 완료 가드. 문구 4상태:
  - 기본: "📷 손짓으로 파도 다루기"
  - 준비 중(버튼 disabled): "카메라·손 인식 준비 중…"
  - 활성(`aria-pressed=true`): "📷 보는 중 — 손을 펼쳐 흔들어보세요"
  - 실패(disabled): "카메라를 사용할 수 없어요 — 커서로 체험하세요"
- `frame(now)`: `snapshotPointer(dt)` 직후, `hand.active()`이면 `applyHand(pointer, hand.poll(now), handState, dt, w, h)`.
  true를 돌려주면 손이 그 프레임의 포인터다. false면 마우스 스냅샷이 그대로 간다.
  `pointer.hand`는 항상 갱신(비활성이면 visible=false).
  주의: 마우스 `pendingDown/pendingUp`은 `snapshotPointer`가 이미 소비했으므로 손이 점유한
  프레임에서 마우스 클릭은 버려진다(의도된 동작 — 손이 보이는 동안 손이 우선).
- 링 커서 `#hand-cursor`: `applyHand`가 true인 프레임에 `transform: translate(x, y)`,
  `--hand-open` CSS 변수에 openness를 써서 크기(펼침 클수록 크게)와 채움(down이면 채움)을
  바꾼다. false인 프레임엔 `hidden`.
- `closeWork()`: `handReqSeq++`, `hand.stop()`, 버튼 초기화·숨김, 링 커서 숨김,
  `handState = makePointerState()`.
- 셸의 캔버스 크기 `w, h`는 `sizeCanvas()`가 돌려준 CSS px를 보관해 `applyHand`에 넘긴다
  (resize 시 갱신).

### index.html + css/style.css

- `.viewer__info` 안, 마이크 버튼 아래에 `<button class="viewer__mic" id="v-hand" hidden aria-pressed="false">📷 손짓으로 파도 다루기</button>`.
  마이크 버튼과 스타일을 공유하므로 클래스는 `viewer__mic`를 재사용하고 id만 다르다.
- `.viewer` 직계 자식으로 `#stage` 뒤·`.viewer__chrome` 앞에 `<div id="hand-cursor" class="hand-cursor" hidden aria-hidden="true"></div>`
  (`.viewer`가 `position: fixed`라 그것이 위치 기준. `.viewer__chrome`은 위치 컨텍스트가 아니다).
  스타일: `position: absolute; left: 0; top: 0; z-index: 4`(버튼 z-index 5 아래);
  `width/height: calc(18px + 26px * var(--hand-open, 0)); border: 1.5px solid var(--accent); border-radius: 50%;
  pointer-events: none; transition: width 0.12s, height 0.12s`. JS가 `transform: translate(x px, y px) translate(-50%, -50%)`로 위치를 놓는다.
  down 상태(`.is-down`)면 `background: color-mix(in srgb, var(--accent) 35%, transparent)`.

### js/data.js

- 01번 항목에 `hand: true`.
- hint 갱신: "📷를 켜고 손을 펼쳐 물을 휘저으세요 · 주먹을 쥐었다 펼치면 물보라 · 마우스로도 가능합니다".

### js/pieces/01-great-wave.js — 소폭 수정

- 기존 인터랙션 블록은 그대로 유지(합성된 포인터로 그대로 동작).
- 손 입력 강화 1건: `justDown` 물보라에서 `const k = ptr.hand && ptr.hand.visible ? 1.4 : 1;`
  → `field.scatter(ptr.x, ptr.y, 150 * k, (reduced ? 200 : 420) * k)`. 물을 손으로 튕기는
  감각을 위해 반경·세기를 키운다. 그 외 변경 없음.

### README.md

- Features의 제로-빌드 항목 뒤에 한 줄: 01번 손짓 인터랙션은 📷 버튼을 누른 시점에만
  MediaPipe Hand Landmarker(jsdelivr CDN, 버전 고정)를 동적으로 불러오며, 그 외 경로에서는
  외부 런타임 의존성이 없다(한/영).
- Usage 힌트 항목에 "01번은 📷 버튼으로 손짓 인터랙션" 추가.

## 의존성 로딩 결정

- **CDN 고정 버전 로드, 저장소 미동봉.** 이유: WASM 11.7MB는 CloudFront 자동 압축 상한(10MB)을
  넘어 자체 호스팅이 CDN brotli(약 4MB)보다 느리고, GitHub 저장소에 20MB 바이너리가 들어간다.
- 📷 버튼을 누르기 전에는 1바이트도 받지 않는다(동적 import). 제로-빌드(번들러 없음)는 유지.
- 버전은 `1.0.1`로 고정. 업그레이드는 URL 상수 한 곳만 바꾼다.

## 에러 처리

- 권한 거부·카메라 없음·비보안 컨텍스트·CDN 실패·모델 로드 실패·WebGL 없음(CPU 재시도도
  실패): `request()` → false. 버튼 비활성 + 안내. 마우스는 항상 동작.
- 권한·모델 대기 중 뷰어 닫힘/작품 이동: 세대 가드로 늦은 완료를 폐기하고 트랙을 정지해
  카메라 표시등이 반드시 꺼진다(mic.js 09번 레이스 수정과 동일).
- `detectForVideo` 예외: 그 프레임 `null` → 마우스 폴백, `console.warn` 1회(연속 스팸 방지 플래그).
- 손 소실: LOST_GRACE 이내 깜빡임은 무시, 그 이상이면 마우스로 복귀. 링 커서 숨김.
- tick 예외: 기존 셸의 아트리움 복귀 로직에 위임(변경 없음).
- 탭 백그라운드 복귀: video 요소가 재생을 멈췄으면 `poll`에서 `video.paused`를 감지해
  `play()`를 다시 호출한다.

## 테스트

- `test/hand.test.mjs` (node:test, mic.test 패턴):
  - `openness`: 합성 관절(펼친 손 ratio≈2.1 → ≥0.9, 주먹 ratio≈1.2 → 0, palm 0 → 0), 스케일
    불변(모든 좌표 2배 → 같은 값).
  - `applyHand`: (a) 미러링 — sample.x=0.15 → 화면 오른쪽 끝(u=1), (b) REACH 클램프 — x=0.05 → u=1,
    (c) 첫 프레임 점프 후 EMA 수렴, (d) 주먹(0.1)→펼침(0.8) 전환에서 justDown이 정확히 한
    프레임만 true, 이후 프레임 false, (e) 손이 처음부터 펼침으로 나타나면 justDown 없음(전환이
    아니므로), (f) 히스테리시스 — 0.4에서 직전 상태 유지, (g) 손 소실 0.2초는 유지·0.5초는 false
    반환, (h) 펼침→주먹에서 justUp 1회, (i) `pointer.hand` 필드 존재, (j) sample이 null이면
    그 프레임은 '손 안 보임'으로 취급.
- Playwright 시각 검증 (로컬 8090):
  1. `**/js/hand.js` 라우트를 대본 모듈(같은 export, 시나리오 타임라인 반환)로 교체 →
     📷 클릭 → 소용돌이·물보라·링 커서 렌더 스크린샷, 콘솔 에러 0 확인, 닫기/재진입 사이클.
  2. Chrome `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<손 사진 y4m>`(퍼블릭
     도메인 손 사진을 내려받아 ffmpeg로 y4m 변환, 저장소엔 넣지 않고 scratchpad에만 둔다)로
     CDN 로드부터 실제 검출까지 전체 파이프라인 헤드리스 1회 통과 시도. 헤드리스 GPU 제약으로
     실패하면 CPU delegate 경로가 동작하는지 확인하고 결과를 그대로 보고한다.
- **실제 웹캠 검증은 이 EC2에서 불가능.** 사용자가 로컬 8090 또는 배포 후 1회 직접 확인해야
  한다(HTTPS 필요 — CloudFront·localhost 모두 충족). 완료 보고에 명시한다.
- 기존 `node --test test/` 전부 통과 유지.

## 하지 않는 것 (YAGNI)

- 두 손 동시 인식, 핀치·브이·엄지 등 추가 제스처, 다른 작품 `hand: true` 적용, 카메라
  미리보기 썸네일, 손 궤적 그리기, 모델 자체 호스팅. `hand.js` 인터페이스와 `hand` 플래그만
  재사용 가능하게 남긴다.
- 전역 사운드 토글·마이크 서비스와의 통합은 하지 않는다 — 별개 입력 채널.
