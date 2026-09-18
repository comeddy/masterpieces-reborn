# 11번 After Klimt — The Tree of Life 손짓 성장 설계

- 날짜: 2026-09-18 (같은 날 공용 계약 정렬로 개정)
- 대상: `js/pieces/11-tree-of-life.js`, `js/data.js`(11번 항목), `test/klimt-gesture.test.mjs`(신규).
  공용 계층 `js/cam.js`·`js/main.js`·`index.html`·`css/style.css`·`test/data.test.mjs`는
  10번 브랜치 커밋을 **merge로 수용**하며 이 브랜치에서 재작성하지 않는다(아래 병합 전략).
- 브랜치: `feature/klimt-hand-gesture` (master `43f72f4` 기반, worktree `.worktrees/klimt-hand`)
- 선례·정본: `2026-09-18-babel-camera-design.md`(10번 — 공용 `cam.js` 계약 정본),
  `2026-09-18-pearl-camera-design.md`(03번 — "세션 간 조율" 절), `2026-07-11-adam-sound-reactive-design.md`(09번 마이크)

## 목표

11번의 가지 발아·바람 입력을 마우스 대신 카메라 손 추적으로 일으킨다. 관객이 손을
들어 머무는 자리로 클림트의 금빛 가지가 뻗어 나가고, 손을 휘두르면 나무 전체가
바람에 흔들린다. 기존 마우스 인터랙션(클릭 발아·드래그 바람)은 폴백으로 유지한다.

## 확정된 요구사항 (사용자 선택, 2026-09-18)

1. **마우스 폴백 유지**: 카메라가 활성이고 손이 보이면 손이 입력원, 그 외에는 기존
   마우스 코드가 그대로 동작한다. 권한 거부·미지원 환경에서도 작품을 체험할 수 있다.
2. **손짓 매핑**: 손이 머무는 곳으로 자람 + 휘두르면 바람. 클릭→발아, 드래그→바람의
   자연스러운 치환. 핀치·주먹 같은 제스처 분류는 하지 않는다.
3. **손 추적 기술**: MediaPipe Tasks Vision `HandLandmarker`, CDN 지연 로드 — 공용 `js/cam.js`.
4. **카메라 표시**: 영상은 화면에 그리지 않고(코너 미러 없음) 손 위치에 금빛 표식만 그린다.
5. **권한 UX**: 뷰어 내 📷 버튼 클릭 시에만 `getUserMedia` 요청 (자동 요청 금지). 09번 규약 승계.

## 공용 계약 — `js/cam.js` (10번 스펙이 정본, 여기서는 소비만 명세)

같은 날 01(`feature/wave-hand-gesture`)·03(`feature/pearl-camera`)·10(`feature/babel-camera`)·
12(`feature/picasso-gesture`)·11(이 브랜치) 세션이 카메라 작업을 병렬 진행 중이다. 공용 계층은
아래 계약으로 통일하고, 이 스펙은 계약을 재정의하지 않는다.

- `request(): Promise<boolean>` / `active(): boolean` / `stop(): void` — mic.js와 같은 세대(gen) 가드.
  `@mediapipe/tasks-vision` ESM 번들을 `request()` 안에서만 동적 `import()` (node import-safe).
  E2E 시임 `window.__CAM_CDN__`(가짜 번들 경로). GPU 델리게이트 실패 시 CPU 재시도.
- `hands(): { n: 0|1|2, x: number, y: number }` — 주 손(`[0]`)의 손바닥 대표점, **거울 보정 후**
  0..1 정규화(x = 1 − 원시 x). 손이 없으면 `n: 0`(x·y는 정의되지 않은 값으로 취급). `numHands: 2`.
- `landmarks(): Array<Array<{x,y,z}>>` — 감지된 손 전부의 21점, `hands()`와 같은 좌표계. 11번은 쓰지 않는다.
- `video(): HTMLVideoElement | null`, (03번 제안) `drawMirror(ctx, rect)` — 11번은 쓰지 않는다.
- **탐지 트리거**: `hands()`·`landmarks()`·`drawMirror()` 중 어느 것이 먼저 불려도 프레임당 1회만
  `detectForVideo`. 11번은 `tick`마다 `hands()`를 정확히 한 번 호출한다.
- **셸 배선**(10번 계획 Task 4): `#v-cam`(`viewer__cam`, `.viewer__mic` 규칙 선택자 공유), `work.cam`
  플래그로 노출, `camReqSeq` 가드, `closeWork()`에서 무조건 `cam.stop()`, 작품 opts에
  `cam: { active, hands, video, landmarks }` getter 묶음.
- **작품 중립 문구**(03번 조율): 대기 "📷 카메라로 체험하기" · 요청 중(disabled) "📷 카메라 준비 중…" ·
  활성 "📷 손을 비춰보세요" · 실패(disabled) "카메라를 사용할 수 없어요 — 마우스로 체험하세요".
  작품별 설명은 각 작품의 `hint`에 둔다.
- **`test/data.test.mjs`**: `cam` 플래그는 `typeof boolean` 검사만(번호 목록 하드코딩 금지 — 01·03·10·11·12가 모두 `cam: true`).
- 검증 메모(이 세션, 2026-09-18): jsdelivr `@mediapipe/tasks-vision@1.0.1`의 `vision_bundle.mjs`(0.15MB)·
  `wasm/`(11.8MB)와 Google Storage `hand_landmarker.task`(7.8MB, CORS `*`)는 모두 200 OK. 10번 계획의
  `0.10.14` 고정도 동작하지만 1.0.1로 올리는 것을 10번 세션에 제안한다(공용 계층 소유자가 결정).

### 병합 전략

- 10번이 공용 계층(`cam.js` + 셸 배선 + `data.test` boolean 검사 + E2E 가짜 번들
  `test/fixtures/fake-vision/vision_bundle.mjs`)을 구현·커밋하면 이 브랜치가 `feature/babel-camera`의
  해당 커밋을 merge한다. 10번 고유분(10번 피스·data 10번 항목)이 함께 들어와도 11번과 충돌하지 않는다
  (파일 분리; `data.js`는 서로 다른 항목).
- 10번 커밋 전에도 진행 가능한 것: 11번 순수 함수(`handTrackStep`)와 테스트(인터페이스만 의존), 11번 피스의
  소비 코드(계약 기준으로 작성), `data.js` 11번 항목. E2E는 merge 후 수행한다.
- 이 브랜치 병합 시점에 master에 이미 `cam.js`가 있으면 그것을 쓴다(계약이 같으므로 소비 코드 무변경).

## 11번 고유 설계

### js/data.js — 11번 항목

- `cam: true` 플래그.
- hint: "📷를 켜고 손을 들면 그곳으로 가지가 자랍니다 · 휘두르면 바람 · 커서로도 가능합니다"
- note의 "클릭한 자리에서는 새 가지가 돋아 피어난다"를
  "손을 내밀어 머무는 자리에서는 새 가지가 돋아 손을 향해 피어난다"로 갱신(note↔hint 정합성).
- medium: "Golden spiral growth · Hand tracking · WebAudio · after Klimt (1905–09, public domain)".

### js/pieces/11-tree-of-life.js

**상태 추가**: `cam`(opts.cam 또는 null), `track`(아래 `makeHandTrack()`), `handOn`(직전 프레임에 손이
있었는지), `handAcc`(발아 간격 누적), `handShimAcc`(표식 반짝임 누적), `hx, hy`(이번 프레임 손의 캔버스
좌표, 없으면 null). `init`에서 `cam = opts.cam ?? null; track = makeHandTrack()`, `dispose`에서 `cam = null`.

**순수 함수 (export, node:test 대상 — 브라우저 API 미참조)**

```
SMOOTH_RATE = 14      // 1/s, 위치 EMA 반응 속도
VEL_RATE = 10         // 1/s, 속도 EMA
PRESENT_AFTER = 0.05  // s, 연속 검출 후 present (≈30fps 2프레임 — 1프레임 오검출 억제)
LOST_AFTER = 0.35     // s, 연속 미검출 후 부재 (프레임 드랍 흡수)

makeHandTrack() → { present:false, x:0.5, y:0.5, vx:0, vy:0, seenT:0, lostT:0, init:false }

handTrackStep(s, pt | null, dt) → s (제자리 갱신 후 반환)   // pt = cam.hands()가 n≥1이면 {x,y}, 아니면 null
  pt가 있으면:
    - 첫 검출(init=false)이거나 present=false 상태에서의 재등장이면 x,y = pt, vx,vy = 0
      (옛 위치에서 휙 날아오는 현상 방지)
    - 아니면 k = 1 − exp(−SMOOTH_RATE·dt)로 x,y EMA, 순간 속도 Δ(스무딩 좌표)/dt를
      kv = 1 − exp(−VEL_RATE·dt)로 EMA → vx,vy (정규화 단위/초)
    - seenT += dt, lostT = 0; seenT ≥ PRESENT_AFTER 이면 present = true; init = true
  pt가 null이면:
    - lostT += dt, seenT = 0; 위치 유지, vx,vy는 kv로 0을 향해 감쇠
    - lostT ≥ LOST_AFTER 이면 present = false
```

**입력 규칙 (tick 앞부분 — 기존 포인터 블록을 else로 감싼다)**

```
pt = null
if (cam && cam.active()) { h = cam.hands(); if (h.n >= 1) pt = { x: h.x, y: h.y } }   // 프레임당 hands() 1회
handTrackStep(track, pt, dt)
if (track.present):
  hx = track.x * W;  hy = track.y * H
  speed = hypot(track.vx, track.vy)                   // 정규화 단위/초 — 해상도 무관
  if (!handOn): ensureAudio(); sprout(true, hx, hy); handAcc = 0     // 손 첫 등장 = 클릭 1회
  windV += track.vx * W * dt * (reduced ? 6 : 14)     // 드래그 dx·14와 같은 체감 (dx ≈ vx·W·dt)
  if (speed < SWEEP):                                 // 머무름 → 주기 발아
    handAcc += dt
    if (handAcc >= (reduced ? 1.1 : 0.6)): handAcc = 0; sprout(true, hx, hy)
  else: handAcc = 0                                   // 휘두름 → 바람만
  handOn = true
else:
  handOn = false; hx = hy = null
  (기존 포인터 블록 그대로: justDown → ensureAudio·sprout, down+wasDown → windV += dx·…)
```

- `SWEEP = 0.6` (화면 폭의 60%를 1초에 가로지르는 속도).
- `sprout(true, hx, hy)`는 기존 클릭 경로를 그대로 재사용한다: 가장 가까운 가지 점을 호스트로 잡고,
  뻗는 방향을 손 쪽으로 40% 편향, 길이 1.2배, 성장 속도 1.5배.
- 오디오 컨텍스트: 📷 버튼 클릭이 사용자 제스처로 인정되므로 손 등장 시점의 `ensureAudio()`는
  suspended 없이 시작된다(안 되면 기존 `chime`의 `resume()`이 처리).
- 카메라가 활성이어도 손이 없으면(`present=false`) 마우스 경로가 즉시 동작한다(폴백 규약).

**성장 가속**: 성장 루프에서 `hx`가 있을 때 각 가지의 끝점 `spiralPt(b, b.grow)`와 손 사이 거리가
`S * 0.22` 미만이면 그 프레임의 성장 증분을 2.5배 한다. 손이 다가간 쪽 가지가 먼저 피어나는 체감.
가지 최대 78개 × spiralPt 1회로 비용은 무시할 수준.

**손 표식 `drawHand()`**: 렌더 마지막(새 다음)에 `hx, hy`가 있을 때만. 클림트 눈 모티프 형태 —
바깥 금빛 고리(`GOLD_HI`, 반지름 `S * 0.02`, 굵기 `S * 0.004`, `1 + 0.1·sin(T·3)` 펄스, alpha 0.75),
안쪽 `RING` 색 점(반지름 `S * 0.006`). 표식에는 `swayX`를 적용하지 않는다(손은 바람에 흔들리지 않음).
손 주변 반짝임은 기존 `shimmer` 배열을 재사용해 `handShimAcc`가 0.06초를 넘길 때마다 손 반경 `S * 0.05`
안에 1개 추가(reduced-motion이면 추가하지 않음). 코너 미러는 그리지 않는다(요구사항 4).

## 에러 처리

- 권한 거부·미지원·비보안 컨텍스트·CDN/WASM/모델 로드 실패: `request()` → `false`, 버튼 비활성 + 안내
  (셸 공통). 11번은 `cam.active()`가 `false`인 한 카메라 코드를 전혀 타지 않고 마우스 경로만 동작한다.
- 대기 중 뷰어 닫힘/작품 전환: `cam.js` 세대 가드 + 셸 `camReqSeq`(09번에서 검증된 2중 가드).
- 손 인식 프레임 드랍: `handTrackStep`의 `LOST_AFTER` 유예로 흡수, 재등장 시 점프 속도 없음.
- 탐지 예외: 현재 merge된 cam.js는 detectForVideo를 try/catch로 감싸지 않아 예외가 tick까지 전파되고 셸이 아트리움으로 복귀시킨다(허용 가능한 열화). 계약대로 "직전 캐시 반환"으로 고치는 것은 cam.js 소유자에게 요청함. 11번은 hands()의 x·y가 유한값일 때만 손 입력으로 받는다(NaN 오염 방지).
- `hands()`가 동기 탐지를 렌더 프레임 안에서 수행하므로 CPU 델리게이트 환경에선 프레임이 떨어질 수 있다.
  작품 로직은 `dt` 기반이라 체감 속도는 유지된다(셸 dt 캡 0.05s).
- tick 예외: 기존 셸의 아트리움 복귀 로직에 위임 (변경 없음).

## 프라이버시

- 카메라 프레임은 화면에 그리지 않고(11번은 코너 미러도 없음), 저장하지 않고, 어디로도 전송하지 않는다.
  추론은 브라우저 안(WASM)에서만 일어난다.
- 뷰어를 닫거나 다른 작품으로 이동하면 트랙이 정지되어 브라우저 카메라 표시등이 꺼진다.
- 버튼을 누르기 전에는 어떤 카메라 API도 호출하지 않는다.

## 테스트

- `test/klimt-gesture.test.mjs` (node:test, mic.test.mjs 패턴 — 11번 모듈에서 `makeHandTrack`·`handTrackStep` import):
  1. 시작 상태와 null만 흘린 상태는 `present=false`.
  2. 고정점을 1초 흘리면 x,y가 그 점에 1e-3 안으로 수렴하고 `present=true`.
  3. x가 증가하는 점열(0.3→0.7, 0.5초)을 흘리면 `vx > 0`이고 `hypot(vx,vy) > 0.6`(휘두름 판정 영역).
  4. 히스테리시스: 검출 후 1프레임(1/30초) null은 `present` 유지, 0.4초 연속 null은 해제.
  5. 단일 프레임 검출(dt=1/60 한 번)만으로는 `present=false`(PRESENT_AFTER 미달).
  6. 부재 후 먼 위치 재등장: 첫 프레임에 x,y가 새 점으로 즉시 놓이고 vx,vy=0.
- `test/data.test.mjs`: `cam` 플래그 boolean 검사 — 10번 merge에 포함되면 그대로, 없으면 추가.
  기존 mic 테스트(`["09"]`)는 유지.
- `test/integrity.test.mjs`: 무변경 — 11번은 카메라를 `opts` 주입으로만 쓰므로 import-safe.
- E2E (Playwright, merge 후): 10번 Task 6의 `window.__CAM_CDN__` 가짜 번들 + `window.__FAKE_HANDS__`
  시임을 그대로 사용. `python3 -m http.server <빈 포트> -d .worktrees/klimt-hand`(8080은 다른 앱, 8090·8094는
  다른 세션이 쓸 수 있으므로 먼저 확인)로 `button[data-no="11"]` 진입 → 시임 설치 → `#v-cam` 클릭 →
  라벨 "📷 손을 비춰보세요"·`aria-pressed=true` 확인. 시나리오:
  (a) `{n:1, x:0.3, y:0.35}` 3초 유지 → 손 위치에 금빛 고리, 그 주변 금빛 픽셀 비율이 유지 전보다 증가(발아).
  (b) x를 0.2↔0.8로 0.3초마다 번갈아 1.5초 → 줄기 상단 x 오프셋이 흔들림(바람) 스크린샷.
  (c) `n:0` → 표식 사라짐, 캔버스 클릭으로 발아 여전히 동작(폴백).
  (d) `#v-cam` 재클릭 → 라벨 원복. 뷰어 닫기 → 재진입 버튼 초기화. 10번으로 이동 시 버튼 보임·12번 등
  cam 없는 작품에서 hidden. 콘솔 오류 0(폴백 시나리오의 의도된 warn 1건 허용).
- 실제 카메라: 이 EC2에서는 불가. 사용자가 로컬 또는 배포(`https://reborn.zerojin.art/`)에서 수동 1회 —
  손을 들었을 때 발아 방향이 손 쪽인지(거울 보정), 휘두르면 바람, 닫으면 표시등 소등. 완료 보고에 명시.

## 하지 않는 것 (YAGNI)

- 핀치·주먹·손바닥 등 제스처 분류, 두 손 구분 동작, 손가락 개별 사용(01·03·10번과 어휘 분담).
- 카메라 코너 미러·PiP, 손 궤적 그리기.
- 공용 `cam.js`·셸 배선의 재작성(10번 브랜치 merge로 수용), MediaPipe 로컬 호스팅.
- 기존 마우스 코드 제거, 포인터 규약 변경, 마이크 서비스와의 통합.
