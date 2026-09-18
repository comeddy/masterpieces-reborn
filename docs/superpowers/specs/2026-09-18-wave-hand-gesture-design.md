# 01번 After Hokusai — Great Wave 손짓 인터랙션 설계

- 날짜: 2026-09-18 (같은 날 개정: 독립 `hand.js` → 공용 `cam.js` 소비 + 순수 합성 모듈)
- 대상: `js/hand-pointer.js`(신규), `js/main.js`, `js/data.js`, `index.html`, `css/style.css`,
  `js/pieces/01-great-wave.js`, `test/hand-pointer.test.mjs`(신규), `test/data.test.mjs`, `README.md`
- 소비하는 공용 계약(다른 브랜치 소유): `js/cam.js` — `2026-09-18-pearl-camera-design.md`(03번)·
  `2026-09-18-babel-camera-design.md`(10번)에서 정의. 이 브랜치는 cam.js를 **구현하지 않고**
  그 브랜치를 merge해 소비한다.
- 브랜치: `feature/wave-hand-gesture` (master `43f72f4` 기반), worktree `.worktrees/wave-hand-gesture`

## 목표

01번의 마우스 인터랙션(드래그 = 소용돌이, 클릭 = 물보라)을 카메라 앞 손짓으로 일으킨다.
관객이 펼친 손으로 물을 휘젓고, 주먹을 쥐었다 펼쳐 물보라를 튕긴다. 마우스는 폴백이자
병행 입력으로 유지한다.

## 확정된 요구사항 (사용자 선택)

1. **인식 기술**: MediaPipe Hand Landmarker(손 관절 21점). 연속값(펼침 정도)이 필요하고
   손/몸 구분이 필요하므로 Gesture Recognizer·순수 JS 모션 감지는 채택하지 않음.
2. **마우스 폴백**: 09번 마이크와 같은 패턴. 카메라가 켜져 있고 손이 보이면 손이 포인터를
   대체하고, 그 외에는 기존 마우스 드래그·클릭이 그대로 동작한다.
3. **권한 UX**: 뷰어 내 📷 버튼 클릭 시에만 getUserMedia 요청. 자동 요청 금지.
4. **범위**: 01번만. 다른 작품 적용은 이번 범위 밖(플래그만 켜면 되도록 설계).

## 개정 사유 (2026-09-18)

같은 날 03번·10번·11번 세션이 공용 카메라 서비스 `js/cam.js`(카메라·MediaPipe 수명, 세대 가드,
CDN 동적 import)와 셸 📷 버튼(`#v-cam`, `work.cam`, `opts.cam`)을 확정했다. 01번이 독립
`hand.js`를 만들면 카메라 서비스가 둘이 되므로, 01번은 **cam.js를 소비**하고 자기 몫인
"손 → 포인터 합성" 순수 로직만 `js/hand-pointer.js`에 둔다. 제스처 매핑·UX·폴백은 승인안 그대로.

## 아키텍처 (셸 포인터 합성)

핵심 아이디어: 손은 "위치 + 누름"이라는 점에서 포인터와 동형이다. 셸이 손 상태를 기존
포인터 스냅샷 규약(`x, y, dx, dy, down, justDown, justUp, inside, downTime`)에 합성하면
작품 모듈 16개 어디에도 손 인식 코드가 들어가지 않는다. 10번이 `opts.cam`을 직접 읽어
자기 제스처 기계를 돌리는 것과 달리, 01번은 포인터 합성을 `work.handPointer` 플래그로
opt-in 한다(10번 같은 작품엔 영향 없음).

### js/cam.js — 소비하는 공용 계약 (이 브랜치는 구현하지 않음)

이 브랜치가 의존하는 최소 계약. 세부는 03번·10번 스펙을 따른다.

- `request(): Promise<boolean>`, `active(): boolean`, `stop(): void` — 셸 📷 버튼이 호출.
- `hands(): { n: 0|1|2, x, y }` — **매 프레임 셸이 먼저 호출**해 추론을 트리거한다
  (추론은 새 비디오 프레임에서만 1회).
- `landmarks(): Array<Array<{x, y, z}>>` — 감지된 손들의 21점(정규화 0..1). `[0]`이 주 손.
  손이 없으면 빈 배열. **좌표계는 원본(거울 보정 전)일 수도 보정 후일 수도 있다** — 셸이
  `hands().x`(계약상 항상 거울 보정)와 손바닥 중심 x를 비교해 판별하되, 중앙 ±0.1 구간에서는
  두 후보가 비슷해 오판할 수 있어 판정을 보류해 계약값(보정 후, true)으로 보고, 손이 충분히
  벗어난 첫 프레임에 한 번만 판정해 래치한다(카메라 재활성화 시 초기화). cam.js가 좌표계를
  바꿔도 손 방향이 뒤집히는 회귀가 없다.
- 셸 배선(`#v-cam` 버튼, `work.cam` 노출 조건, `closeWork`의 `cam.stop()`, `opts.cam` getter)도
  그 브랜치가 가져온다. 01번은 `work.cam: true`로 버튼을 켜고 `work.handPointer: true`로 합성을 켠다.
- 공용 문구는 작품 중립이어야 한다(활성 "📷 손을 비춰보세요", 실패 "카메라를 사용할 수
  없어요 — 마우스로 체험하세요"). merge 시 10번 전용 문구가 남아 있으면 이 브랜치에서 일반화한다.

### js/hand-pointer.js — 신규 순수 합성 모듈 (브라우저 API 미참조, node:test 대상)

- `openness(landmarks): number` — 21개 `{x, y}`를 받아 펼침 정도 0..1.
  ```
  palm  = dist(lm[0], lm[9])                          // 손목 ~ 중지 뿌리 = 손바닥 크기
  tips  = [4, 8, 12, 16, 20]                          // 엄지·검지·중지·약지·소지 끝
  ratio = mean(dist(lm[0], lm[tip]) / palm)           // 손목 ~ 손끝 거리 비
  openness = clamp((ratio − 1.2) / (1.8 − 1.2), 0, 1) // 주먹 ≈ 1.1, 반쯤 오므림 ≈ 1.5, 펼침 ≈ 1.85
  ```
  손바닥 크기로 나누므로 카메라 거리에 무관하고, 거리 기반이라 거울 보정과도 무관하다.
  palm이 0이거나 landmarks가 21개 미만이면 0. 1.2·1.8은 보정 상수 — 실제 웹캠 수동 검증에서
  주먹이 0.1 이하·펼침이 0.9 이상으로 읽히지 않으면 조정한다.
- `palmCenter(landmarks): { x, y }` — 0(손목)·5·9·13·17(네 손가락 뿌리)의 평균.
- `sampleFromLandmarks(lm, mirrored): HandSample | null` — cam.js 결과를 합성기 입력으로 바꾸는
  어댑터. `lm`이 없으면 null. `mirrored`가 false면 `x = 1 − palmCenter.x`로 거울 보정한다
  (결과 x는 항상 **관객 기준**: 관객이 오른쪽으로 손을 움직이면 x가 커진다).
  ```
  HandSample = { x: number, y: number, openness: number }   // 정규화 0..1, 관객 기준
  ```
- `makePointerState(): HandPointerState` — 합성기 내부 상태 초기값:
  `{ seen: false, sx: 0, sy: 0, open: false, lostT: 0, downTime: 0 }`.
- `applyHand(pointer, sample, state, dt, w, h): boolean` — 아래 "합성 규칙". `sample`이 `null`이면
  그 프레임은 '손 안 보임'. 손이 포인터를 점유했으면 `pointer` 필드를 제자리에서 덮어쓰고 true,
  마우스에 맡겨야 하면 `pointer`를 건드리지 않고 false. 두 경우 모두 `pointer.hand`는 갱신한다.
- 상수 export: `OPEN_ON = 0.5`, `OPEN_OFF = 0.3`, `LOST_GRACE = 0.4`, `REACH = 0.15`, `SMOOTH = 14`.

### 합성 규칙 (applyHand)

| 손 상태 | 포인터 해석 |
|---|---|
| 손이 보이고 openness ≥ OPEN_ON (펼침) | `inside = true`, `down = true`, 위치 = 평활된 손바닥 중심 |
| 손이 보이고 openness ≤ OPEN_OFF (주먹) | `inside = true`, `down = false` |
| 그 사이(0.3 < openness < 0.5) | 직전 down 상태 유지(히스테리시스) |
| 주먹 → 펼침 전환(OPEN_OFF 아래에서 OPEN_ON 위로) | 그 프레임에 `justDown = true` 1회 펄스. 시간 제한 없음 — 주먹을 오래 쥐었다 펼쳐도 물보라 |
| 펼침 → 주먹 전환 | 그 프레임에 `justUp = true` 1회 펄스 |
| 손이 처음부터 펼침으로 나타남 | `down = true`지만 `justDown` 없음(전환이 아니므로) |
| 손이 LOST_GRACE 미만으로 잠깐 사라짐 | 직전 손 상태·위치 유지(깜빡임 억제), 반환 true |
| 손이 LOST_GRACE 이상 안 보임 | `state.seen = false`, 반환 false → 셸이 마우스 스냅샷을 그대로 둔다 |

- **위치 매핑**: `u = clamp((sample.x − REACH) / (1 − 2·REACH), 0, 1)`, `v` 동일. 팔이 카메라
  가장자리까지 닿기 어려우므로 중앙 70% 구간을 화면 전체로 늘린다. 화면 좌표는 `u·w, v·h`.
- **평활**: `state.sx += (targetX − state.sx) · min(1, SMOOTH·dt)`. 손이 처음 보인 프레임
  (`state.seen === false` → true)은 점프(평활 없이 대입)해 화면 밖에서 끌려오는 느낌을 없앤다.
- `dx, dy`는 평활 위치의 프레임 차분(첫 프레임은 0). `downTime`은 down 유지 시간 누적, 주먹이면 0.
- `pointer.hand = { visible, openness, speed }` — 작품이 선택적으로 읽는 부가 정보. `speed`는
  `hypot(dx, dy) / dt`(px/s). 손이 포인터를 점유하지 않는 프레임엔 `{ visible: false, openness: 0, speed: 0 }`.
  작품은 `ptr.hand && ptr.hand.visible`로만 분기한다.

### js/main.js — 셸 수정 (cam.js 배선은 merge로 들어오고, 여기서는 합성만 추가)

- `import { sampleFromLandmarks, makePointerState, applyHand, detectMirrored } from "./hand-pointer.js"`.
- `detectMirrored(handState, h.x, lm)`: 순수 모듈의 래치. 손이 중앙 ±0.1 안쪽이면 판정을 보류해
  계약값인 보정 후(true)를 반환하고, 벗어난 첫 프레임에 `|h.x − c.x| ≤ |h.x − (1 − c.x)|`(c = palmCenter)로 한 번
  판정해 `handState.mirrored`에 래치한다. 이후에는 손이 다시 중앙에 와도 래치값을 그대로 쓴다.
- 상태 `let handState = makePointerState(); let stageW = 0, stageH = 0;` — `sizeCanvas()` 결과를 보관
  (`openWork`·`resize`에서 갱신).
- `pointer` 초기 객체에 `hand: { visible: false, openness: 0, speed: 0 }` 추가.
- `frame(now)`: `snapshotPointer(dt)` 직후
  ```
  let handOwns = false;
  if (WORKS[current].handPointer && cam.active()) {
    const h = cam.hands();                                // 추론 트리거(프레임당 1회는 cam.js가 보장)
    const lm = cam.landmarks()[0];
    const sample = sampleFromLandmarks(lm, detectMirrored(handState, h && h.x, lm));
    handOwns = applyHand(pointer, sample, handState, dt, stageW, stageH);
  } else {
    pointer.hand.visible = false; pointer.hand.openness = 0; pointer.hand.speed = 0;
  }
  updateHandCursor(handOwns);
  ```
  실제 구현에서는 `if` 분기 안쪽(`cam.hands()`~`applyHand`)이 통째로 try/catch로 감싸여 있다 —
  검출 예외는 그 프레임만 마우스 폴백으로 넘기고 rAF 루프는 죽지 않는다. `else` 분기(카메라 꺼짐
  또는 handPointer 아닌 작품)에서는 이전 상태가 남아 있으면(`handState.seen || handState.mirrored
  !== null`) `handState`·`handWarned`를 초기화한다 — 재활성화 때 유령 손이 남지 않도록.
  주의: 마우스 `pendingDown/pendingUp`은 `snapshotPointer`가 이미 소비했으므로 손이 점유한
  프레임에서 마우스 클릭은 버려진다(의도 — 손이 보이는 동안 손이 우선).
- 링 커서 `#hand-cursor`: `handOwns`가 true면 `hidden = false`, `style.transform = translate(x px, y px) translate(-50%, -50%)`,
  `style.setProperty("--hand-open", openness)`, `classList.toggle("is-down", pointer.down)`. false면 `hidden = true`.
- `closeWork()`: `handState = makePointerState()`, 링 커서 `hidden = true`. (`cam.stop()`은 merge된 배선이 이미 호출.)

### index.html + css/style.css

- `.viewer` 직계 자식으로 `#stage` 뒤·`.viewer__chrome` 앞에
  `<div id="hand-cursor" class="hand-cursor" hidden aria-hidden="true"></div>`
  (`.viewer`가 `position: fixed`라 그것이 위치 기준. `.viewer__chrome`은 위치 컨텍스트가 아니다).
- 스타일: `position: absolute; left: 0; top: 0; z-index: 4`(버튼 z-index 5 아래);
  `width/height: calc(18px + 26px * var(--hand-open, 0)); border: 1.5px solid var(--accent); border-radius: 50%;
  pointer-events: none; transition: width 0.12s, height 0.12s; will-change: transform`.
  `.hand-cursor.is-down { background: color-mix(in srgb, var(--accent) 35%, transparent); }`
  `.hand-cursor[hidden] { display: none; }`
- 📷 버튼은 공용 `#v-cam`(merge로 들어옴). 이 브랜치는 버튼 마크업을 추가하지 않는다.

### js/data.js

- 01번 항목에 `cam: true, handPointer: true`.
- hint 갱신: "📷를 켜고 손을 펼쳐 물을 휘저으세요 · 주먹을 쥐었다 펼치면 물보라 · 마우스로도 가능합니다".
- note 말미 한 문장 추가(카메라 언급, note↔hint 정합성): "카메라 앞에서 펼친 손으로 물을 휘젓고,
  주먹을 쥐었다 펼치면 물보라가 튄다."
- `test/data.test.mjs`: `handPointer`는 boolean이며 `handPointer`가 켜진 작품은 `cam`도 켜져 있어야
  한다(합성만 켜고 버튼이 없으면 도달 불가능한 기능이 된다).

### js/pieces/01-great-wave.js — 소폭 수정

- 기존 인터랙션 블록은 그대로 유지(합성된 포인터로 그대로 동작).
- 손 입력 강화 1건: `justDown` 물보라에서 `const k = ptr.hand && ptr.hand.visible ? 1.4 : 1;`
  → `field.scatter(ptr.x, ptr.y, 150 * k, (reduced ? 200 : 420) * k)`. 물을 손으로 튕기는
  감각을 위해 반경·세기를 키운다. 그 외 변경 없음.

### README.md

- Features의 제로-빌드 항목 뒤 한 줄(한/영): 카메라 작품은 📷 버튼을 누른 시점에만 MediaPipe
  Hand Landmarker를 CDN에서 동적으로 불러오며, 그 외 경로에서는 외부 런타임 의존성이 없다.
  (cam.js 브랜치가 이미 같은 문장을 넣었으면 중복 추가하지 않는다.)
- Usage 힌트에 "01번은 📷 버튼으로 손짓 인터랙션(펼친 손 = 휘젓기, 주먹→펼침 = 물보라)" 추가.

## 의존성·병합 순서

- cam.js·셸 📷 배선은 03번(`feature/pearl-camera`) 또는 10번(`feature/babel-camera`) 브랜치가
  구현한다(어느 쪽인지는 그 세션들이 정한다). 이 브랜치의 순수 로직·CSS·데이터·01번 수정은
  그와 독립이며, **셸 합성 배선 Task만** 그 브랜치를 merge한 뒤 진행한다.
- merge 시점에 cam.js가 어느 브랜치에도 없다면(예외 상황) 03번 스펙의 계약대로 이 브랜치가
  cam.js를 구현하되, 계약 밖 기능은 넣지 않는다 — 나중에 한쪽을 버려도 동일 API라 소비자가 깨지지 않도록.
- MediaPipe 버전·CDN·모델 URL은 cam.js 소유. 이 브랜치는 관여하지 않는다.

## 에러 처리

- 권한 거부·카메라 없음·CDN·모델 실패·WebGL 없음: cam.js `request()` → false, 공용 버튼이 안내.
  마우스는 항상 동작. 이 브랜치는 `cam.active()`가 false면 합성을 건너뛸 뿐이다.
- `landmarks()`가 빈 배열·`undefined` 반환: `sampleFromLandmarks`가 null → '손 안 보임' 처리.
- 손 소실: LOST_GRACE 이내 깜빡임은 무시, 그 이상이면 마우스로 복귀·링 커서 숨김.
- `applyHand`는 예외를 던지지 않는다(입력 검증 후 조용히 null 처리). 셸 `frame`의 기존 try/catch가
  tick 예외를 아트리움 복귀로 위임하는 구조는 변경 없음.
- 작품 이동·닫기: `closeWork`에서 합성 상태 초기화. 카메라 정지는 공용 배선이 담당.

## 테스트

- `test/hand-pointer.test.mjs` (node:test, mic.test 패턴):
  - `openness`: 합성 관절(펼친 손 ratio≈1.85 → ≥0.9, 주먹 ratio≈1.1 → 0, palm 0 → 0, 21개 미만 → 0),
    스케일 불변(모든 좌표 2배 → 같은 값), 거울 불변(x → 1−x → 같은 값).
  - `sampleFromLandmarks`: null/빈 입력 → null; mirrored=false면 x가 1−palmCenter.x; true면 그대로.
  - `applyHand`: (a) REACH 매핑 — x=0.15 → 화면 x=0, x=0.85 → w; x=0.05 → 클램프 0,
    (b) 첫 프레임 점프(평활 없이 대입, dx=dy=0) 후 EMA 수렴(1초 뒤 목표와 1px 이내),
    (c) 주먹(0.1)→펼침(0.8) 전환에서 justDown이 정확히 한 프레임만 true, 이후 false,
    (d) 처음부터 펼침이면 justDown 없음, (e) 히스테리시스 — 0.4에서 직전 상태 유지,
    (f) 손 소실 0.2초는 true 유지·0.5초는 false 반환, 복귀 후 다시 점프,
    (g) 펼침→주먹에서 justUp 1회, (h) `pointer.hand` 필드(visible/openness/speed) 갱신,
    false 반환 프레임엔 visible=false, (i) sample null 프레임은 '손 안 보임', (j) false 반환 시
    pointer의 x/y/down/justDown은 호출 전 값 그대로.
- Playwright 시각 검증 (로컬 8090+, 새 포트):
  1. `**/js/cam.js` 라우트를 대본 모듈(같은 export, 시나리오 타임라인의 landmarks 반환)로 교체 →
     📷 클릭 → 펼친 손 이동(소용돌이)·주먹→펼침(물보라)·링 커서 렌더 스크린샷, 콘솔 에러 0,
     닫기/재진입 사이클, 손 소실 후 마우스 복귀.
  2. Chrome `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<손 사진 y4m>`(퍼블릭
     도메인 손 사진을 내려받아 ffmpeg로 y4m 변환, scratchpad에만 둔다)로 실제 cam.js 경로(CDN 로드 →
     검출 → 합성)를 헤드리스에서 1회 통과 시도. 헤드리스 GPU 제약으로 실패하면 결과를 그대로 보고한다.
- **실제 웹캠 검증은 이 EC2에서 불가능.** 사용자가 로컬 또는 배포 후 1회 직접 확인해야 한다
  (HTTPS 필요 — CloudFront·localhost 모두 충족). 완료 보고에 명시한다.
- 기존 `node --test test/` 전부 통과 유지.

## 하지 않는 것 (YAGNI)

- 두 손 동시 인식, 핀치·브이·엄지 등 추가 제스처, 다른 작품 `handPointer` 적용, 카메라 미리보기
  (10번·03번의 코너 미러는 그 작품들의 선택 — 01번은 몰입을 위해 링 커서만), 손 궤적 그리기.
- cam.js 자체 구현·수정(예외 상황 제외), MediaPipe 버전 선택, 모델 자체 호스팅.
- 전역 사운드 토글·마이크 서비스와의 통합.
