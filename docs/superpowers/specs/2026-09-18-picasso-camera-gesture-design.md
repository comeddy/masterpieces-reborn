# 12번 Hommage à Picasso — Simultaneous Faces 카메라 손 제스처 설계

- 날짜: 2026-09-18
- 대상: `js/cam.js`(공용 규약 — 병합 전략 참조), `js/main.js`, `js/data.js`, `index.html`,
  `css/style.css`, `js/pieces/12-cubist-faces.js`, `test/picasso-gesture.test.mjs`(신규)
- 브랜치: `feature/picasso-gesture` (master 기반, worktree `.worktrees/picasso-gesture`)

## 목표

12번의 마우스 인터랙션(탭=얼굴 재조립, 드래그=면 밀기)을 카메라 손 제스처로
확장한다: **카메라 앞에서 손을 크게 흔들면 얼굴이 흩어졌다 전혀 새로운 초상으로
재조립되고, 손을 천천히 움직이면 그 위치 주변의 면들이 밀리며 시점이 비틀린다.**
마우스·터치 인터랙션은 폴백이자 병행 입력으로 유지한다.

## 확정된 요구사항 (사용자 선택)

1. **폴백 정책**: 카메라 우선 + 커서 폴백 유지 — 09번 마이크와 동일 패턴.
   권한 거부·미지원·CDN 장애 시 클릭·드래그가 그대로 동작.
2. **제스처 매핑**: 큰 손짓(좌우 흔들기) = 재조립 트리거, 손 위치 = 면 밀기
   가상 포인터. 마우스 드래그 중에는 마우스가 우선.
3. **인식 기술**: MediaPipe Hands — 10번(바벨탑)·03번(진주 귀걸이) 스펙에서
   확정된 공용 `js/cam.js` 규약에 정렬. 처음 검토한 프레임 차분 방식은 공용
   서비스 이원화를 피하기 위해 폐기.

## 아키텍처 — 공용 cam.js 규약 준수 (10번 스펙이 정본)

### js/cam.js — 공용 카메라·손 추적 서비스 (규약 재인용)

10번 스펙 `2026-09-18-babel-camera-design.md`의 계약을 그대로 따른다.
이 스펙에서는 규약을 재정의하지 않고 소비만 명세한다:

- `request(): Promise<boolean>` / `active(): boolean` / `stop(): void`
- `hands(): { n: 0|1|2, x, y }` — 주 손 손바닥 대표점, 0..1 정규화, x 거울 보정
- `video(): HTMLVideoElement | null`, `landmarks(): Array` — 코너 미러용
- 세대(gen) 가드, `window.__CAM_CDN__` E2E 시임, MediaPipe `@mediapipe/tasks-vision`
  CDN 동적 import (모듈 레벨 정적 import 금지 — node import-safe)

### 병합 전략 (동시 세션 조정)

카메라 브랜치(01·03·10·11)가 병렬 진행 중이며 각자 cam.js와 셸 배선을 만든다.
- cam.js·셸 배선(📷 버튼, main.js getter 전달)은 **10번 계획서 Task 2·4의
  코드와 자구까지 동일하게** 작성한다 — 병합 충돌 시 어느 쪽을 취해도 동작.
- 이 브랜치 병합 시점에 master에 이미 cam.js가 있으면 우리 사본을 버리고
  master 것을 쓴다(계약이 같으므로 소비 코드 무변경).
- 12번 고유분은 `js/pieces/12-cubist-faces.js`, data.js 12번 항목,
  `test/picasso-gesture.test.mjs`뿐 — 셸·서비스 충돌 면적 최소화.

### js/main.js · index.html · css/style.css — 셸 배선 (10번 Task 4와 동일)

- `work.cam === true`일 때 `#v-cam` 버튼(`viewer__cam`) 노출, `camReqSeq`
  시퀀스 가드, 성공 "📷 손을 비춰보세요" / 실패 "카메라를 사용할 수 없어요 —
  클릭으로 체험하세요", `closeWork()`에서 무조건 `cam.stop()`.
- 작품 opts에 `cam: { active, hands, video, landmarks }` getter 묶음 추가.

### js/data.js — 12번 항목

- `cam: true` 플래그.
- hint: "📷를 켜고 손을 크게 흔들면 얼굴이 새로 조립됩니다 · 손을 천천히
  움직여 면을 밀어보세요 · 클릭·드래그로도 가능합니다".
- note 말미에 카메라 인터랙션 한 문장 추가 (09번 리뷰의 note↔hint 정합성 원칙).

## js/pieces/12-cubist-faces.js — 제스처 소비

### 순수 손짓 판정 상태 기계 (분리·export, node:test 대상)

```
WAVE_WINDOW=1.2   // 반전 카운트 유효 시간창(s)
WAVE_SWINGS=2     // 발화에 필요한 방향 반전 횟수
WAVE_MIN_VX=0.25  // 스윙으로 인정하는 최소 |x속도| (정규화폭/s)
WAVE_COOL=1.6     // 발화 후 쿨다운(s)
HAND_GRACE=0.25   // 손 미검출 유예 — 랜드마커 프레임 드랍 흡수

makeWave(): { lastX, dir, swings, windowT, coolT, graceT }
waveStep(w, x, present, dt) → { fire: boolean }
  - present=false: graceT 누적, HAND_GRACE 초과 시 스윙 상태 리셋
  - dir이 미설정(0)일 때 |vx|≥WAVE_MIN_VX인 첫 유효 이동은 dir만 설정(스윙 0회)
  - vx=(x-lastX)/dt 부호가 dir과 반대이고 |vx|≥WAVE_MIN_VX → swings++, dir 갱신,
    windowT=0 (windowT는 "마지막 스윙 이후 경과 시간")
  - windowT>WAVE_WINDOW → swings·dir 리셋(오래된 스윙 무효)
  - swings≥WAVE_SWINGS && coolT≤0 → fire=true 1회, coolT=WAVE_COOL, 리셋
```

좌우 왕복(진짜 "흔들기")만 발화하므로 손을 스쳐 지나가는 단방향 이동이나
몸 전체 이동으로는 재조립이 오발되지 않는다.

### tick 통합

- `cam.active()`면 `hands()` 폴링. `n===0`이면 present=false로 waveStep만 유지.
- **재조립**: `waveStep(...).fire && state === "idle"` → `state = "out"`
  (기존 탭과 같은 경로 — 상태 기계·전이 속도·reducedMotion 처리 무변경).
- **면 밀기**: 기존 드래그 밀기 루프의 입력원을 일반화 — 우선순위는
  ① 마우스 드래그(ptr) ② 손 검출(n≥1, hx=x*W, hy=y*H). 반경·세기·스프링
  안착 파라미터는 드래그와 동일 재사용.
- **손 커서**: 검출 위치에 팔레트 정합 글로우 점(크림·노랑 계열,
  `rgba(240,207,107,…)` 소프트 래디얼). 쿨다운 중에는 알파를 낮춰
  "장전 안 됨"을 은은히 표현.
- **코너 미러**: 10번 계획서 Task 5와 동일 코드 — 우하단(폭 18%, 최대 200px)
  좌우반전 `video()` 프레임 + `landmarks()` 점 오버레이. `cam.active()`일 때만.
  (카메라 작품이 늘어난 뒤 공용 헬퍼로 리팩터하는 것은 병합 후 후속 과제.)
- `init`에서 `cam = opts.cam ?? null`, `dispose`에서 `cam = null`.

## 에러 처리

- 권한 거부·미지원·비보안 컨텍스트·CDN/모델 로드 실패: `request()` → false,
  버튼 비활성 + 안내 문구, 클릭·드래그 폴백 상시 동작 (셸 공통 규약).
- 뷰어 닫힘/이동 레이스: cam.js 세대 가드 + main.js 시퀀스 가드 (09번 검증 패턴).
- 손 인식 프레임 드랍: HAND_GRACE 유예로 스윙 카운트 유지.
- dt 폭주(탭 복귀): 셸의 dt 캡(0.05s) 아래에서 vx 계산 — 첫 프레임은
  lastX 초기화만 하고 스윙 판정 생략.

## 프라이버시

- 영상은 브라우저 내 로컬 추론에만 사용 — 녹화·전송·저장 없음.
- 버튼 클릭 시에만 권한 요청(자동 요청 금지). 뷰어 닫힘 시 무조건 트랙 해제
  (카메라 표시등 꺼짐 확인).

## 테스트

- `test/picasso-gesture.test.mjs` (node:test): `makeWave`/`waveStep` —
  ① 왕복 2회 → fire 1회 ② 단방향 스침 → 미발화 ③ 쿨다운 중 재발화 금지
  ④ 시간창 초과한 낡은 스윙 무효 ⑤ 손 미검출 유예·초과 리셋 ⑥ 느린 손
  (|vx|<WAVE_MIN_VX) 미발화.
- 12번 모듈 import-safe 유지 (integrity.test.mjs 자동 통과 — 카메라는 opts 주입).
- Playwright 시각 검증: `window.__CAM_CDN__` 가짜 MediaPipe 픽스처(10번 Task 6
  선례)로 hands() 시퀀스를 흘려 재조립 발화·면 밀림·손 커서·코너 미러 렌더 확인.
- 실제 카메라 E2E는 배포 전 로컬(HTTPS/localhost)에서 수동 1회.

## 하지 않는 것 (YAGNI)

- 두 손 제스처, 핀치·주먹 등 추가 제스처 어휘 (10·03번과 어휘 분담 유지).
- 스와이프로 이전/다음 작품 이동 (셸 네비게이션 제스처화).
- 프레임 차분 폴백 경로 (CDN 장애 시 클릭 폴백으로 충분).
- 코너 미러 공용 헬퍼 리팩터 (병합 후 후속).
