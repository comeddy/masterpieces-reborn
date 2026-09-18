# 03번 After Vermeer — Girl with a Pearl Earring 카메라 손 인터랙션 설계

- 날짜: 2026-09-18
- 대상: `js/cam.js`(신규), `js/main.js`, `js/data.js`, `index.html`, `css/style.css`,
  `js/pieces/03-pearl-earring.js`, `test/cam.test.mjs`(신규),
  `test/pearl-gesture.test.mjs`(신규), `test/data.test.mjs`
- 브랜치: `feature/pearl-camera` (master 기반)
- 관련 스펙: `2026-09-18-babel-camera-design.md`(10번, 같은 `js/cam.js`를 소비),
  `2026-07-11-adam-sound-reactive-design.md`(09번 마이크 — 센서 주입 패턴의 원형)

## 목표

03번의 마우스 인터랙션(드래그=촛불 바람, 클릭=촛불 깜빡임 파동)을 카메라 손
추적으로 구현한다: **관객의 손이 촛불이 된다.** 손을 움직이면 그 속도가 바람이
되어 손 위치의 빛 먼지를 흩뜨리고, 엄지와 검지 끝을 맞대는 **핀치**(손가락을
튕기듯)가 그 지점에서 밝기 파동을 퍼뜨린다. 시각 효과 코드(scatter·부력·파동·
진주 복원)는 손대지 않고 **입력 경로만 추가**한다. 마우스 인터랙션은 폴백이자
병행 입력으로 유지한다.

## 확정된 요구사항 (사용자 선택)

1. **인식 기술**: MediaPipe Hands (CDN 동적 로드). 10번 스펙에서 확정한 공용
   `js/cam.js`를 사용한다. 공용 계층(`cam.js` + 셸 📷 배선)은 **한 브랜치에서만
   구현**하고 나머지 작품 브랜치는 그 커밋을 merge한다 — 소유권은 아래
   "세션 간 조율" 절 참조.
2. **깜빡임 제스처**: 핀치(엄지 끝·검지 끝 맞대기). 히스테리시스와 쿨다운으로
   손떨림·프레임 드랍에 의한 오발화를 억제한다.
3. **마우스 입력**: 카메라가 켜진 동안에도 병행 유지. 권한 거부·CDN 장애·
   비지원 환경에서 작품이 정상 동작해야 한다(09번·10번 스펙과 동일 원칙).

## 아키텍처 (09번 마이크 선례의 확장)

### js/cam.js — 신규 공용 카메라·손 추적 서비스

10번 스펙의 정의를 그대로 따르며, 두 작품이 공통으로 쓰는 코너 미러 렌더를
작품 밖으로 끌어올려 `drawMirror`로 추가한다.

- `request(): Promise<boolean>` — `getUserMedia({ video: { width: 640, height: 480,
  facingMode: "user" } })` + `@mediapipe/tasks-vision` ESM 번들을 jsDelivr CDN에서
  **동적 `import()`** 로 로드, `HandLandmarker`(VIDEO 모드, `numHands: 2`, 모델은
  Google Storage `hand_landmarker.task`) 생성. 모듈 레벨 정적 import 금지 — node
  import-safe 유지. 모든 실패(권한 거부·미지원·비보안 컨텍스트·CDN 장애·모델
  다운로드 실패)는 `false`. 이미 활성이면 즉시 `true`.
- `active(): boolean` — 스트림과 랜드마커가 모두 준비된 상태.
- `hands(): { n: 0|1|2, x: number, y: number }` — 감지된 손 개수(최대 2)와 주
  손(첫 번째 손)의 손바닥 대표점(검지 MCP 5번·중지 MCP 9번 랜드마크의 중점)을
  0..1 정규화한 좌표. **거울 보정: x는 1-x로 반전**. 손이 없으면 `n: 0`이고
  `x`·`y`는 마지막 값을 유지한다(소비자는 `n`으로 판정).
- `landmarks(): Array<Array<{x,y,z}>>` — 감지된 손들의 21점 랜드마크(정규화,
  `hands()`와 같은 거울 보정 좌표계). 손이 없으면 빈 배열.
- `video(): HTMLVideoElement | null`.
- `drawMirror(ctx, rect)` — `rect = {x, y, w, h}`에 비디오 프레임을 좌우반전으로
  `drawImage` + 랜드마크 점 오버레이 + 1px 테두리. 랜드마크는 이미 거울 보정
  좌표이므로 반전 없이 `rect.x + lm.x·w`, `rect.y + lm.y·h`로 찍는다. `active()`가
  아니면 아무것도 그리지 않는다. 캔버스 상태(transform·alpha·합성 모드)는
  `save/restore`로 원복.
- `stop()` — 트랙 정지·랜드마커 `close()`·비디오 해제. **카메라 표시등이 반드시
  꺼져야 한다.**
- **프레임당 1회 탐지**: `hands()`·`landmarks()`·`drawMirror()`가 같은 프레임에서
  여러 번 호출돼도 `detectForVideo`는 `performance.now()` 타임스탬프가 직전 탐지
  이후 증가했을 때만 실행하고 결과를 캐시한다(MediaPipe는 단조 증가 타임스탬프
  요구).
- **세대(generation) 가드**: `mic.js`와 동일 패턴 — `stop()`·재요청 시 `gen++`,
  `request()`의 각 `await` 경계(getUserMedia → import → 모델 생성)에서 stale 체크
  후 획득 자원 정리. 권한 대기 중 뷰어 닫힘 레이스 봉합.
- **순수 계산부 분리·export** (node:test 대상, 브라우저 API 미참조):
  - `mirrorLandmarks(hands)` → 모든 점 `x → 1 - x` (새 배열)
  - `palmPoint(lm)` → 랜드마크 5·9 중점 `{x, y}` (입력은 이미 거울 보정 좌표)
  - `STALE_MS = 500`, `isStale(nowMs, lastAdvanceMs)` → 프레임 정지 판정
- **프레임 정지·잘린 입력 방어**: 비디오 `currentTime`이 `STALE_MS` 넘게 전진하지
  않으면(트랙 종료·뮤트·카메라 점유) `landmarks()`는 `[]`, `hands()`는 `n: 0`으로
  비운다. 21점 미만 손 배열은 `palmPoint` 전에 버린다.

### js/main.js — 소폭 수정

- `import * as cam from "./cam.js"`.
- `work.cam === true`일 때만 뷰어에 📷 버튼 노출(`#v-cam`, `viewer__cam` 클래스,
  `#v-mic` 바로 뒤). 라벨 3상태(mic 버튼 규약과 동일):
  - 대기: "📷 카메라로 체험하기"
  - 활성(`aria-pressed=true`): "📷 손을 비춰보세요"
  - 실패(`disabled`): "카메라를 사용할 수 없어요 — 마우스로 체험하세요"
    (10번 스펙의 "클릭으로 체험하세요"를 두 작품에 맞게 일반화 — 버튼은 공용)
  - 활성 중 재클릭 → `cam.stop()` + 리셋(토글 오프).
- 시퀀스 가드 `camReqSeq` — `micReqSeq`와 동일. `request()` 대기 중 뷰어가 닫히면
  UI를 건드리지 않고 반환.
- 작품 opts 확장(키 추가만 — 기존 16작품 무영향):

```
cam: {
  active:     () => cam.active(),
  hands:      () => cam.hands(),
  landmarks:  () => cam.landmarks(),
  drawMirror: (ctx, rect) => cam.drawMirror(ctx, rect),
}
```

- `closeWork()`에서 무조건 `camReqSeq++; cam.stop(); resetCamBtn(); camBtn.hidden = true`.

### index.html + css/style.css

- `#v-mic` 다음 줄에
  `<button class="viewer__cam" id="v-cam" hidden aria-pressed="false">📷 카메라로 체험하기</button>`.
- `.viewer__mic` 세 규칙의 선택자를 `.viewer__mic, .viewer__cam`(및 `[aria-pressed]`,
  `:disabled` 변형)으로 확장. 새 규칙은 추가하지 않는다.

### js/data.js

- 03번 항목에 `cam: true`.
- hint: "📷를 켜고 손을 촛불처럼 움직여 빛 먼지를 흩으세요 · 손끝을 맞대면
  촛불이 깜빡입니다 · 마우스로도 가능합니다".
- note 말미에 한 문장 추가: "카메라 앞에서 손을 움직이면 그 손이 촛불이 되고,
  손끝을 맞대면 불꽃이 흔들린다." — note↔hint 정합성 원칙(09번 리뷰 지적).

### js/pieces/03-pearl-earring.js — 손 입력 소비

- `init`에서 `cam = opts.cam ?? null`, `handS = makeHandState()`,
  `pinchS = makePinchState()`, `cursor = null`, `flash = 0` 초기화. `dispose`에서
  `cam = null`. (`cursor`는 손 위치 `{x, y}` 또는 null, `flash`는 핀치 링 잔여
  시간(초) — 둘을 분리해 손이 없는 프레임에 핀치가 잡혀도 안전하다.)
- **순수 함수 분리·export** (node:test 대상):

```
makeHandState(): { x, y, seen: false }          // x,y는 정규화 0..1(직전 스무딩 위치)
handWind(s, hx, hy, dt) → { x, y, k } | null     // hx,hy: 정규화 손 좌표 또는 null
  - hx가 null이면 s.seen=false, null 반환 (손 사라짐)
  - 첫 등장(seen=false): 위치만 기록, null 반환 (점프 속도 방지)
  - 위치 EMA 스무딩: s.x += (hx - s.x) * min(1, SMOOTH·dt),  SMOOTH = 18 (1/s)
  - 속도 = √(Δx² + Δy²) / dt  (정규화 좌표 거리/초 — 해상도 무관)
  - k = clamp((속도 − WIND_MIN) / (WIND_FULL − WIND_MIN), 0, 1)
      WIND_MIN = 0.15/s (랜드마크 지터 흡수), WIND_FULL = 0.9/s
  - k ≤ 0 이면 null, 아니면 { x: s.x, y: s.y, k }

pinchRatio(lm) → number                         // dist(4,8) / dist(0,9), 손 크기 정규화
makePinchState(): { closed: false, cool: 0 }
pinchStep(s, ratio, dt) → { fire: boolean }
  - s.cool = max(0, s.cool − dt)  (ratio와 무관하게 감소)
  - ratio가 null(손 없음)이면 s.closed=false, fire=false
  - !closed && ratio < PINCH_IN(0.30): closed=true, cool==0이면 fire=true·cool=PINCH_COOL(0.4)
  - closed && ratio > PINCH_OUT(0.45): closed=false
  - 그 사이 구간(0.30~0.45)은 상태 유지 (히스테리시스)
```

- `tick` 1) 입력 반영 단계의 기존 `ptr` 블록 **뒤에** 손 블록 추가 — 두 경로가
  같은 `field.scatter`/`applyBuoyancy`/`flicker` 설정을 호출하는 병행 구조:

```
if (cam && cam.active()) {
  const h = cam.hands();
  const hx = h.n ? h.x : null, hy = h.n ? h.y : null;
  const wind = handWind(handS, hx, hy, dt);
  if (wind) {
    const px = wind.x * W, py = wind.y * H;
    const g = 0.35 + 0.65 * wind.k;                             // 살랑(0.35)~세찬(1) 바람
    field.scatter(px, py, 110, (reduced ? 22 : 60) * g);        // 손은 커서보다 넓게
    applyBuoyancy(px, py, 140, (reduced ? 30 : 80) * g, dt);
  }
  const lm = cam.landmarks();
  const ratio = lm.length ? pinchRatio(lm[0]) : null;
  if (pinchStep(pinchS, ratio, dt).fire) {
    flicker = FLICKER_DUR; flickerAge = 0;
    waveOrigin.x = handS.x * W; waveOrigin.y = handS.y * H;
    flash = 0.25;                                               // 핀치 순간 확대 링
  }
  cursor = h.n ? { x: handS.x * W, y: handS.y * H } : null;
} else { cursor = null; }
if (flash > 0) flash -= dt;
```

- 감각 목표: 손을 천천히 흘려도(속도 0.15/s 이하) 먼지가 움직이지 않고, 손을
  휙 저으면(0.9/s) 마우스 드래그와 같은 세기의 바람이 인다. 핀치는 손을 멈춘 채
  맞대도 한 번만 파동이 일고, 떼었다가 다시 맞대야 다음 파동이 인다.
- **렌더**: `drawPearls()` 뒤에 두 단계 추가.
  - `drawHandCursor()`: `cursor`가 있으면 촛불색 글로우 점(`lighter` 합성,
    `rgba(255,200,120,α)` 방사 그라디언트, 반경 12px). `cursor`가 있고
    `flash > 0`이면 `(1 − flash/0.25)`에 비례해 커지며 옅어지는 링을 겹쳐 그린다.
  - `cam.drawMirror(ctx, mirrorRect())`: 우하단, `w = min(200, W·0.18)`,
    `h = w·0.75`, 여백 18px. `.viewer__info`(좌하단)와 겹치지 않는다.
- 마우스 경로(`ptr` 블록)는 **무변경**. 두 입력이 같은 프레임에 파동을 일으키면
  나중에 쓴 `waveOrigin`이 이긴다 — 의도된 단순화.

## 세션 간 조율 (공용 계약)

같은 날 01번(`feature/wave-hand-gesture`)·10번(`feature/babel-camera`)·11번(Klimt)
세션이 동일한 `js/cam.js`·`#v-cam`·`work.cam`·`opts.cam`을 정의하고 있어, 01번
세션의 요청으로 공용 부분을 아래처럼 맞춘다. 이 절은 조율 결과가 바뀌면 갱신한다.

- **소유권(확정)**: 10번 세션이 `cam.js` + 셸 배선 초안(`feature/babel-camera`
  @02eb1c0)을 남기고 종료되어, 사용자 결정으로 03번 세션이 그 위에 계약 수정을
  맡았다. 수정은 `feature/cam-contract`에서 커밋 후 `feature/babel-camera`로
  fast-forward(298b19c). 01·10·11번은 이 해시를 merge한다.
- **작품 중립 문구**: 대기 "📷 카메라로 체험하기" · 활성 "📷 손을 비춰보세요" ·
  실패 "카메라를 사용할 수 없어요 — 마우스로 체험하세요". 작품별 제스처 설명은
  버튼이 아니라 각 작품의 `hint`에 둔다.
- **`landmarks()` 계약**: 감지된 손 전부(최대 2)의 21점 배열
  `Array<Array<{x,y,z}>>`, `hands()`와 같은 **거울 보정 후** 0..1 정규화 좌표계.
  주 손은 `[0]`. 코드 주석에 좌표계를 명시한다.
- **탐지 트리거**: `hands()`·`landmarks()`·`drawMirror()` 중 어느 것이 먼저 불려도
  프레임당 1회만 `detectForVideo`를 실행하고 캐시 — 호출 순서에 의존하지 않는다.
- **`drawMirror(ctx, rect)`**: 03번이 제안한 가산적 공용 헬퍼. 10번이 `cam.js`를
  먼저 구현하면 03번이 merge 후 추가한다(기존 API 무변경).
- **`data.test.mjs`**: `cam` 플래그는 `typeof boolean` 검사만.

## 에러 처리

- 권한 거부·미지원·비보안 컨텍스트·CDN/모델 로드 실패: `request()` → `false`,
  버튼 비활성 + 안내 문구. 마우스 폴백 항상 동작. 작품 자체는 `cam.active()`가
  `false`인 한 카메라 코드를 전혀 타지 않는다.
- 뷰어 닫기·작품 이동 중 권한 대기 레이스: `cam.js` 세대 가드 + `main.js` 시퀀스
  가드(09번에서 검증된 2중 가드).
- 손 인식 프레임 드랍: `handWind`는 손이 사라지면 `seen`을 리셋해 재등장 시
  점프 속도를 만들지 않고, `pinchStep`은 `ratio: null`에서 `closed`를 풀어
  다음 핀치를 정상 인식한다.
- 랜드마커 탐지 예외: `hands()`·`landmarks()`는 `try/catch`로 감싸 직전 캐시를
  반환하고 `console.warn` 1회 — 작품 `tick`을 죽이지 않는다.
- `tick` 예외: 기존 셸의 아트리움 복귀 로직에 위임.

## 프라이버시

- 영상은 브라우저 내 로컬 추론에만 사용 — 녹화·전송·저장 없음. 코너 미러도
  캔버스에 매 프레임 그릴 뿐 캡처하지 않는다.
- 버튼 클릭 시에만 권한 요청(자동 요청 금지). 뷰어 닫힘·작품 이동 시 무조건
  트랙 해제.

## 테스트

- `test/cam.test.mjs`: `mirrorX`, `palmPoint`(5·9 중점 + 거울 보정), `shouldDetect`
  (같은 타임스탬프 재호출 시 false). `cam.js`가 node에서 import-safe인지 확인.
- `test/pearl-gesture.test.mjs`:
  - `handWind`: 손 없음 → null · 첫 등장 프레임 → null · 미세 지터(0.1/s) → null
    · 빠른 이동(1.0/s) → k=1 · 중간 속도 → 0<k<1 · 사라진 뒤 먼 위치 재등장 →
    첫 프레임 null(점프 속도 없음).
  - `pinchStep`: ratio 0.2 진입 → fire 1회 · 유지 → 재발화 없음 · 0.38(중간대)
    → 상태 유지 · 0.5 해제 후 0.2 재진입(쿨다운 경과) → fire · 쿨다운 중 재진입
    → fire 없음 · null → closed 리셋.
  - `pinchRatio`: 손 크기가 2배인 랜드마크에서도 같은 비율.
- `test/data.test.mjs`: "cam 플래그는 있으면 boolean이다" 추가 — mic 테스트처럼
  번호 목록을 하드코딩하지 **않는다**(01·03·10·11이 모두 `cam: true`가 될 예정이라
  merge마다 깨진다).
- `test/integrity.test.mjs`: 무변경 — 03번은 카메라 API를 `opts` 주입으로만 쓰므로
  import-safe 유지.
- Playwright 시각 검증: 10번 브랜치가 만든 E2E 시임을 재사용한다 —
  `window.__CAM_CDN__`으로 `test/fixtures/fake-vision/vision_bundle.mjs`(가짜
  MediaPipe 번들)를 가리키고 `getUserMedia`를 캔버스 `captureStream()`으로 덮으면
  실제 📷 버튼 → `cam.request()` → `hands()/landmarks()` 경로를 그대로 타면서
  손 좌표·핀치 랜드마크 시퀀스를 연출할 수 있다. 바람·파동·손 커서·미러 렌더를
  스크린샷으로 확인하고, 권한 reject 케이스로 실패 문구·disabled를 확인한다.
  원작 대비 구도·진주 위치가 변하지 않았는지 기존 스크린샷과 대조.
- 실제 카메라·MediaPipe: 배포 전 로컬(`python3 -m http.server 8090`, localhost는
  보안 컨텍스트)에서 수동 1회 — 권한 팝업, 손 커서 거울 방향, 핀치 파동, 뷰어
  닫힘 후 카메라 표시등 소등.

## 하지 않는 것 (YAGNI)

- 얼굴 추적·시선 반응, 제스처 추가(주먹·스와이프·손가락 개수), 두 손 구분 동작.
- 10번 바벨탑의 제스처 구현(별도 브랜치에서 이 `cam.js`를 소비).
- MediaPipe 모델 셀프 호스팅(S3) — CDN 시작, 필요 시 후속. 배포 allowlist상
  새 최상위 디렉터리는 업로드되지 않으므로 셀프 호스팅 시 `deploy.sh` 수정 필요.
- 미러 위치·크기 사용자 설정, 카메라 장치 선택 UI.
