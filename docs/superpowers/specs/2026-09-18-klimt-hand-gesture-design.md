# 11번 After Klimt — The Tree of Life 손짓 성장 설계

- 날짜: 2026-09-18
- 대상: `js/hand.js`(신규), `js/main.js`, `js/data.js`, `index.html`, `css/style.css`,
  `js/pieces/11-tree-of-life.js`, `test/hand.test.mjs`(신규), `test/data.test.mjs`
- 브랜치: `feature/klimt-hand-gesture` (master 기반)
- 선례: `2026-07-11-adam-sound-reactive-design.md` (09번 마이크 — 셸 공용 서비스 규약)

## 목표

11번의 가지 발아·바람 입력을 마우스 대신 카메라 손 추적으로 일으킨다. 관객이 손을
들어 머무는 자리로 클림트의 금빛 가지가 뻗어 나가고, 손을 휘두르면 나무 전체가
바람에 흔들린다. 기존 마우스 인터랙션(클릭 발아·드래그 바람)은 폴백으로 유지한다.

## 확정된 요구사항 (사용자 선택, 2026-09-18)

1. **마우스 폴백 유지**: 카메라가 활성이고 손이 보이면 손이 입력원, 그 외에는 기존
   마우스 코드가 그대로 동작한다. 권한 거부·미지원 환경에서도 작품을 체험할 수 있다.
2. **손짓 매핑**: 손이 머무는 곳으로 자람 + 휘두르면 바람. 클릭→발아, 드래그→바람의
   자연스러운 치환. 핀치·주먹 같은 제스처 분류는 하지 않는다.
3. **손 추적 기술**: MediaPipe Tasks Vision `HandLandmarker`를 jsdelivr CDN에서
   📷 버튼 클릭 시에만 지연 로드. 제로-빌드 바닐라 ES 모듈 유지, npm 의존성 없음.
4. **카메라 표시**: 영상은 화면에 그리지 않고 손 위치에 금빛 표식만 그린다.
5. **권한 UX**: 뷰어 내 📷 버튼 클릭 시에만 `getUserMedia` 요청 (자동 요청 금지).
   09번 마이크 규약을 그대로 승계한다.

## 아키텍처 (셸 공용 카메라 서비스 — 09번 마이크와 동형)

### js/hand.js — 신규 공용 서비스

셸(main.js)이 수명을 소유하고, 작품은 `opts.camera.hand` 경유로 `active()`/`sample()`만
폴링한다. 순수 계산부는 node:test 검증을 위해 분리 export한다. import 시점엔 브라우저
API를 참조하지 않는다(node에서 import 가능해야 함).

**외부 의존성 (버전 고정, 번들과 WASM 경로는 반드시 동일 버전)**

| 항목 | URL | 크기 |
|---|---|---|
| ESM 번들 | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs` | 0.15MB |
| WASM 디렉터리 | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm` | 11.8MB |
| 손 모델 | `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` | 7.8MB |

첫 활성화 시 약 20MB를 내려받고 이후엔 브라우저 캐시를 쓴다. 번들은 `import()`로
동적 로드하므로 다른 15작품과 아트리움 로딩엔 영향이 없다.

**공개 API**

- `request(): Promise<boolean>` — 아래 순서로 준비하고 성공 여부를 반환한다.
  1. 번들 동적 import → `FilesetResolver.forVisionTasks(WASM 디렉터리)`.
  2. `HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath, delegate: "GPU" },
     runningMode: "VIDEO", numHands: 1, minHandDetectionConfidence: 0.5,
     minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 })`.
     생성이 실패하면 `delegate: "CPU"`로 한 번 더 시도한다.
     생성된 랜드마커는 모듈 캐시에 보관해 재진입 시 재사용한다(재생성 비용 수 초 절약).
  3. `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 },
     height: { ideal: 480 } }, audio: false })`.
  4. 화면 밖 `<video playsinline muted autoplay>`(`position:fixed; left:-9999px; width:2px;
     height:2px; opacity:0; pointer-events:none`)를 body에 붙이고 `srcObject` 설정 후
     `play()`·`loadedmetadata`를 기다린다. `display:none`은 일부 브라우저에서 프레임을
     내주지 않으므로 쓰지 않는다.
  5. 검출 루프 시작 (아래).
  - 이미 활성이면 즉시 `true`.
  - mic.js와 같은 세대(`gen`) 가드: `stop()`·재요청마다 증가시키고, 각 await 뒤에
    세대가 바뀌었으면 여기까지 얻은 스트림 트랙을 정지하고 `false`를 반환한다.
- `active(): boolean` — 스트림이 열려 있는지.
- `sample(): { present: boolean, x: number, y: number, vx: number, vy: number }` —
  최신 추적 상태 스냅샷. `x, y`는 **거울 반전한 0..1 정규화 좌표**(x = 1 − 원시 x, 관객이
  오른손을 오른쪽으로 움직이면 화면에서도 오른쪽으로 감), `vx, vy`는 정규화 단위/초.
  마지막 갱신이 500ms 이상 지났으면(탭 백그라운드로 루프 정지 등) `present: false`.
  비활성이면 `{ present: false, x: 0.5, y: 0.5, vx: 0, vy: 0 }`.
- `stop()` — `gen` 증가, 검출 루프 취소, 트랙 정지(브라우저 카메라 표시등이 반드시
  꺼져야 한다), `<video>` 제거, 추적 상태 초기화. 랜드마커 인스턴스는 남긴다.

**검출 루프**

- `video.requestVideoFrameCallback`으로 비디오 프레임마다(≤30fps) 실행, 미지원이면
  `requestAnimationFrame` 폴백. 렌더 rAF와 분리되어 작품 프레임을 막지 않는다.
- 타임스탬프는 `performance.now()`를 쓰되 MediaPipe가 단조 증가를 요구하므로
  직전 값 이하이면 `직전 + 1`로 보정한다.
- `result.landmarks[0]`이 있으면 `palmCenter`로 점을 얻고, 없으면 `null`로
  `updateTrack(state, pt, dt)`를 호출한다. `detectForVideo` 예외는 최초 1회만
  `console.warn`하고 그 프레임을 건너뛴다(루프는 계속).

**순수 계산부 (export, node:test 대상)**

```
palmCenter(landmarks) → { x, y } | null
  - landmarks 길이 21 미만이면 null
  - 손목(0)·검지 MCP(5)·중지 MCP(9)·약지 MCP(13)·소지 MCP(17) 다섯 점의 평균
  - x는 1 − 평균x (거울 반전), y는 평균y

makeTrackState() → { present:false, x:0.5, y:0.5, vx:0, vy:0, seenT:0, lostT:0, init:false }

updateTrack(state, pt | null, dt) → state (제자리 갱신 후 반환)
  상수: SMOOTH_RATE = 14 (1/s), VEL_RATE = 10 (1/s), PRESENT_AFTER = 0.05 s, LOST_AFTER = 0.35 s
  pt가 있으면:
    - 첫 검출(init=false)이거나 부재 상태에서 재등장이면 x,y를 pt로 즉시 놓고 vx,vy=0
      (옛 위치에서 휙 날아오는 현상 방지)
    - 아니면 k = 1 − exp(−SMOOTH_RATE·dt)로 x,y를 EMA 스무딩,
      순간 속도 (Δ스무딩좌표/dt)를 kv = 1 − exp(−VEL_RATE·dt)로 EMA → vx,vy
    - seenT += dt, lostT = 0; seenT ≥ PRESENT_AFTER 이면 present = true
  pt가 null이면:
    - lostT += dt, seenT = 0; 위치는 유지, vx,vy는 같은 kv로 0을 향해 감쇠
    - lostT ≥ LOST_AFTER 이면 present = false
```

### js/main.js — 소폭 수정

- 작품 opts 확장: `camera: { hand: { active: () => hand.active(), sample: () => hand.sample() } }`.
  키 추가만이므로 나머지 15작품 무영향. `audio.mic`는 그대로 둔다.
- `work.cam === true`일 때만 뷰어에 📷 버튼(`#v-cam`) 노출. 마이크 버튼과 독립.
- 버튼 상태 전이 (라벨은 `textContent`, 상태는 `aria-pressed`·`disabled`):
  - 대기: "📷 손짓으로 나무 키우기" (`aria-pressed="false"`)
  - 요청 중: 비활성, "📷 손 인식 준비 중…" (20MB 로드가 수 초 걸릴 수 있음)
  - 활성: `aria-pressed="true"`, "📷 보는 중 — 손을 들어보세요"
  - 실패(권한 거부·미지원·CDN 장애): 비활성, "카메라를 사용할 수 없어요 — 커서로 체험하세요"
  - 활성 상태에서 재클릭: `hand.stop()` 후 대기 상태로 복귀(토글 오프)
- `camReqSeq` 카운터로 대기 중 뷰어 닫힘/전환 시 늦은 완료가 UI를 건드리지 않게
  한다(mic의 `micReqSeq`와 동일 패턴). `closeWork()`에서 무조건 `hand.stop()`,
  버튼 초기화·숨김.

### index.html + css

- 마이크 버튼 바로 아래에 `<button class="viewer__cam" id="v-cam" hidden aria-pressed="false">📷 손짓으로 나무 키우기</button>`.
- `css/style.css`: 기존 `.viewer__mic` 세 규칙의 선택자에 `.viewer__cam`을 추가해
  스타일을 공유한다(새 규칙 없음).

### js/data.js

- 11번 항목에 `cam: true` 플래그.
- hint: "📷를 켜고 손을 들면 그곳으로 가지가 자랍니다 · 휘두르면 바람 · 커서로도 가능합니다"
- note의 "클릭한 자리에서는 새 가지가 돋아 피어난다"를
  "손을 내밀어 머무는 자리에서는 새 가지가 돋아 손을 향해 피어난다"로 갱신.
- medium에 "Hand tracking" 추가: "Golden spiral growth · Hand tracking · WebAudio · after Klimt (1905–09, public domain)".

### js/pieces/11-tree-of-life.js

**상태 추가**: `hand`(getter 객체 또는 null), `handOn`(직전 프레임에 손이 있었는지),
`handAcc`(발아 간격 누적), `hx, hy`(이번 프레임 손의 캔버스 좌표, 없으면 null).

**입력 규칙 (tick 앞부분, 기존 포인터 블록을 감싼다)**

```
h = hand && hand.active() ? hand.sample() : null
if (h && h.present):
  hx = h.x * W;  hy = h.y * H
  speed = hypot(h.vx, h.vy)                        // 정규화 단위/초
  if (!handOn):                                    // 손 첫 등장 = 클릭 1회
    ensureAudio(); sprout(true, hx, hy); handAcc = 0
  windV += h.vx * W * dt * (reduced ? 6 : 14)      // 드래그 dx·14 와 같은 체감 (dx ≈ vx·W·dt)
  if (speed < SWEEP):                              // 머무름 → 주기 발아
    handAcc += dt
    if (handAcc >= (reduced ? 1.1 : 0.6)): handAcc = 0; sprout(true, hx, hy)
  else: handAcc = 0                                // 휘두름 → 바람만
  handOn = true
else:
  handOn = false; hx = hy = null
  (기존 포인터 블록 그대로: justDown → ensureAudio·sprout, down+wasDown → windV += dx·…)
```

- `SWEEP = 0.6` (화면 폭의 60%를 1초에 가로지르는 속도). 해상도 무관.
- `sprout(true, hx, hy)`는 기존 클릭 경로를 그대로 재사용한다: 가장 가까운 가지 점을
  호스트로 잡고, 뻗는 방향을 손 쪽으로 40% 편향, 길이 1.2배, 성장 속도 1.5배.
- 손이 사라지면 `ensureAudio` 조건 등 기존 마우스 경로가 즉시 복귀한다. 오디오
  컨텍스트는 📷 버튼 클릭이 사용자 제스처로 인정되므로 손 등장 시점에 생성해도
  suspended 없이 시작된다(안 되면 기존 `chime`의 `resume()`이 처리).

**성장 가속**: 성장 루프에서 `hx`가 있을 때 각 가지의 끝점 `spiralPt(b, b.grow)`와
손 사이 거리가 `S * 0.22` 미만이면 그 프레임의 성장 증분을 2.5배 한다. 손이 다가간
쪽 가지가 먼저 피어나는 체감을 준다. 가지 78개 × spiralPt 1회로 비용은 무시할 수준.

**손 표식 `drawHand()`**: 렌더 마지막(새 다음)에 `hx, hy`가 있을 때만 그린다.
클림트 눈 모티프 형태 — 바깥 금빛 고리(`GOLD_HI`, 반지름 `S * 0.02`, 굵기 `S * 0.004`,
`1 + 0.1·sin(T·3)` 펄스, alpha 0.75), 안쪽 `RING` 색 점(반지름 `S * 0.006`). 표식에도
`swayX`는 적용하지 않는다(손은 바람에 흔들리지 않음). 손 주변 반짝임은 기존
`shimmer` 배열을 재사용해 0.06초마다 손 반경 `S * 0.05` 안에 1개씩 추가한다
(reduced-motion이면 추가하지 않음).

**dispose**: `hand = null; hx = hy = null; handOn = false`.

## 에러 처리

- 번들·WASM·모델 로드 실패, GPU·CPU 랜드마커 생성 모두 실패, 권한 거부, `getUserMedia`
  미지원, 비보안 컨텍스트(http): `request()` → `false`. 버튼 비활성 + 안내. 커서 폴백은
  항상 동작. `stale` 외 실패는 `console.warn("카메라 사용 불가", e)`.
- 대기 중 뷰어 닫힘/작품 전환: `hand.js`의 `gen` 가드가 늦게 도착한 스트림의 트랙을
  정지하고, 셸의 `camReqSeq`가 UI 갱신을 막는다.
- 탭 백그라운드: `requestVideoFrameCallback`이 멈추면 `sample()`의 500ms 신선도 검사로
  `present: false` → 작품은 마우스 경로로 복귀. 탭 복귀 시 자동 재개.
- `detectForVideo` 런타임 예외: 최초 1회 경고 후 프레임 스킵. 루프는 유지.
- 11번 재진입: 랜드마커가 캐시돼 있으면 스트림만 다시 열어 1초 내 재활성. 권한이
  이미 승인된 경우 팝업 없음.
- tick 예외: 기존 셸의 아트리움 복귀 로직에 위임 (변경 없음).

## 성능

- 검출은 640×480, 한 손, GPU 델리게이트 우선. 데스크톱 Chrome 기준 프레임당 수 ms.
- 검출 루프와 렌더 rAF가 분리되어 있어 검출이 느려도 작품 프레임은 60fps를 유지하고
  손 위치만 늦게 갱신된다. 스무딩(14/s)이 30fps 갱신의 계단을 메운다.
- 모바일(`facingMode: "user"`)은 동작하되 느릴 수 있다. 실패하면 터치(포인터) 폴백.

## 프라이버시

- 카메라 프레임은 화면에 그리지 않고, 저장하지 않고, 어디로도 전송하지 않는다.
  추론은 브라우저 안(WASM)에서만 일어난다.
- 뷰어를 닫거나 다른 작품으로 이동하면 트랙이 정지되어 브라우저 카메라 표시등이 꺼진다.
- 버튼을 누르기 전에는 어떤 카메라 API도 호출하지 않는다.

## 테스트

- `test/hand.test.mjs` (node:test, mic.test.mjs 패턴):
  1. `palmCenter`: 21점 입력의 다섯 기준점 평균이 나오고 x가 거울 반전된다(원시 x 0.2 → 0.8);
     길이 부족이면 null.
  2. `updateTrack` 스무딩: 고정점을 1초 흘리면 x,y가 그 점에 1e-3 안으로 수렴한다.
  3. 속도 부호: 거울 좌표에서 x가 증가하는 점열을 흘리면 vx > 0.
  4. 히스테리시스: 검출 후 1프레임(1/30초) 누락은 present 유지, 0.4초 연속 누락은 해제.
  5. 시작 상태와 미검출만 흘린 상태는 present=false.
  6. 재등장 시 위치가 새 점으로 즉시 놓이고(스무딩 없이) 속도가 0이다.
- `test/data.test.mjs`: 기존 mic 테스트 유지 + "cam 플래그는 boolean이며 현재는 11번에만 있다".
- `test/integrity.test.mjs`: 무변경(11번은 여전히 4메서드 export). `hand.js`는 브라우저
  API를 import 시점에 참조하지 않으므로 node에서 import 가능해야 한다.
- E2E (Playwright, 구현 계획에서 수행): `python3 -m http.server 8090`(8080은 다른 앱이
  점유)에서 `button[data-no="11"]` 진입. 📷 클릭 **전에** `navigator.mediaDevices.getUserMedia`를
  퍼블릭 도메인 손 사진(`test/fixtures/hand.jpg`, 배포 allowlist 밖)을 캔버스에 위치를
  바꿔 그리는 `canvas.captureStream(30)`으로 덮어쓴다. 확인 항목: 버튼이 "준비 중" →
  "보는 중"으로 전이, 손 위치에 금빛 표식과 그쪽으로 돋는 가지(스크린샷), 콘솔 오류 0,
  뷰어 닫기 후 스트림 트랙 `readyState === "ended"`, 재진입 시 버튼 초기화, 10번 진입 시
  버튼 숨김. 헤드리스에서 GPU 델리게이트가 실패하면 CPU 폴백이 동작하는지도 함께 본다.
- 실제 카메라: 배포 전 HTTPS(`https://reborn.zerojin.art/`)에서 수동 확인 1회 —
  손을 들었을 때 발아 방향이 손 쪽인지(거울 반전 확인), 휘두르면 바람, 닫으면 표시등 소등.

## 하지 않는 것 (YAGNI)

- 핀치·주먹·손바닥 등 제스처 분류(`GestureRecognizer`), 두 손 추적, 손가락 개별 사용.
- 카메라 미리보기(PiP), 손 궤적 그리기.
- 다른 작품에 카메라 적용 — `hand.js` 인터페이스만 재사용 가능하게 남긴다.
- MediaPipe 번들·WASM·모델의 로컬 호스팅(S3 업로드). CDN 장애는 커서 폴백으로 흡수.
- 기존 마우스 코드 제거, 포인터 규약 변경, 마이크 서비스와의 통합.
