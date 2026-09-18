# 10번 After Bruegel — Tower of Babel 카메라 손 제스처 설계

- 날짜: 2026-09-18
- 대상: `js/cam.js`(신규), `js/main.js`, `js/data.js`, `index.html`, `css/style.css`,
  `js/pieces/10-tower-of-babel.js`, `test/babel-gesture.test.mjs`(신규)
- 브랜치: `feature/babel-camera` (master 기반)

## 목표

10번의 마우스 인터랙션(짧은 클릭=쌓기, 길게 누름=붕괴)을 카메라 손 제스처로
확장한다: **한 손이면 탑을 쌓고, 두 손이면 무너뜨린다.** 손의 화면 위치가
조준점이 된다 — 손이 가리키는 층에 벽돌이 놓이고, 두 손이면 그 지점 위가
무너진다. 마우스 인터랙션은 폴백이자 병행 입력으로 유지한다.

## 확정된 요구사항 (사용자 선택)

1. **인식 기술**: MediaPipe Hands (CDN 동적 로드) — 손 개수(1/2)와 랜드마크
   위치를 정확히 인식. 이 프로젝트 최초의 외부 런타임 의존이며, CDN 장애 시에도
   클릭 폴백으로 작품이 정상 동작해야 한다.
2. **제스처 매핑**: 손 위치로 조준 — 기존 `placeNear(sx, sy)`/`collapseAt(sy)`를
   그대로 재사용.
3. **조준 피드백**: 코너 카메라 미러(좌우반전 + 손 랜드마크 오버레이) + 캔버스
   손 커서(글로우 점).

## 아키텍처 (09번 마이크 선례의 확장)

### js/cam.js — 신규 공용 카메라·손 추적 서비스

- `request(): Promise<boolean>` — getUserMedia(video, 640×480, 전면 카메라) +
  MediaPipe HandLandmarker를 CDN에서 **동적 `import()`** 로드(모듈 레벨 정적
  import 금지 — node import-safe 유지). 성공 여부 반환. 모든 실패(권한 거부·
  미지원·CDN 장애·모델 다운로드 실패)는 false.
- `active(): boolean` — 스트림+모델 활성 여부.
- `hands(): { n: 0|1|2, x: number, y: number }` — 매 프레임 폴링. n은 감지된 손
  개수(최대 2), (x,y)는 주 손(첫 번째 손)의 검지-중지 사이 손바닥 대표점을
  0..1 정규화한 좌표. **거울 보정: x는 1-x로 반전**(관객이 오른쪽으로 손을
  움직이면 커서도 오른쪽으로). 손이 없으면 n=0.
- `video(): HTMLVideoElement | null` — 코너 미러 렌더용.
- `landmarks(): Array` — 감지된 손들의 랜드마크(미러 오버레이용, 정규화 좌표).
- `stop()` — 트랙 정지·모델 close·해제. 카메라 표시등이 반드시 꺼져야 한다.
- **세대(generation) 가드**: 09번 mic.js와 동일 패턴 — stop()·재요청 시 gen++,
  request()의 각 await 경계에서 stale 체크 후 획득 자원 정리. 권한 대기 중
  뷰어 닫힘 레이스 봉합.
- MediaPipe 소스: jsDelivr CDN의 `@mediapipe/tasks-vision` ESM 번들 + Google
  Storage의 hand_landmarker.task 모델. 탐지는 `detectForVideo` (VIDEO 모드),
  numHands: 2.

### js/main.js — 소폭 수정

- `work.cam === true`일 때만 뷰어에 📷 버튼 노출(🎤 버튼과 같은 위치 규약,
  `viewer__cam` 클래스·`#v-cam` id). 클릭 → `cam.request()`. 대기 중 disabled,
  성공 시 "📷 한 손 쌓기 · 두 손 붕괴" + aria-pressed=true, 실패 시 "카메라를 사용할 수
  없어요 — 클릭으로 체험하세요" + disabled.
- 시퀀스 가드(`camReqSeq`) — mic 버튼의 `micReqSeq`와 동일 패턴.
- 작품 opts 확장: `cam: { active, hands, video, landmarks }` getter 묶음.
  키 추가만이므로 기존 작품 무영향.
- `closeWork()`에서 무조건 `cam.stop()` + 버튼 리셋.

### js/data.js

- 10번 항목에 `cam: true` 플래그.
- hint 갱신: "📷를 켜고 한 손으로 쌓고 두 손으로 무너뜨리세요 · 클릭으로도
  가능합니다".
- note 말미 한 문장 추가(카메라 인터랙션 언급) — 09번 리뷰에서 지적된
  note↔hint 정합성 원칙.

### index.html + css/style.css

- `#v-mic` 옆에 `#v-cam` 버튼(hidden 기본, aria-pressed). 스타일은
  `.viewer__mic` 규칙을 `.viewer__mic, .viewer__cam`으로 공유.

### js/pieces/10-tower-of-babel.js — 제스처 소비

- `init`에서 `cam = opts.cam ?? null` 보관.
- **순수 제스처 상태 기계 분리·export** (node:test 대상):

```
makeGesture(): {mode, holdT, coolT, buildT}
gestureStep(g, n, dt) → { build: boolean, collapse: boolean }
  - n===1: buildT 누적, BUILD_INTERVAL(0.3s)마다 build=true 1회 발화
  - n===2: holdT 누적, COLLAPSE_HOLD(0.8s) 도달 시 collapse=true 1회 발화
    후 coolT=COLLAPSE_COOL(3s) 시작 — 쿨다운 중 재발화 금지
  - n 변화 시 holdT 리셋(0.25s 유예 — 랜드마커 프레임 드랍 오인식 방지)
  - 쿨다운은 n과 무관하게 dt로 감소
```

- tick에서: `cam.active()`면 `hands()` 폴링 → 정규화 좌표를 캔버스 픽셀로 변환
  → `gestureStep` 결과에 따라 `placeNear(hx, hy)`(3~5개, 기존 클릭과 동일) 또는
  `collapseAt(hy)` 호출. 기존 클릭/길게 누름 경로는 무변경 병행.
- **캔버스 손 커서**: 감지 위치에 글로우 점(한 손=호박색 `rgba(255,190,90,…)`
  1개, 두 손=경고 붉은색 2개, 두 손일 때 holdT 진행을 링 게이지로 표시).
- **코너 미러**: 캔버스 우하단(폭 W의 18%, 최대 200px)에 `video()` 프레임을
  좌우반전으로 drawImage + `landmarks()` 점 오버레이 + 1px 테두리. `cam.active()`
  일 때만 그린다.
- dispose에서 `cam = null`.

## 에러 처리

- 권한 거부·미지원·비보안 컨텍스트·CDN/모델 로드 실패: `request()` → false,
  버튼 비활성 + 안내 문구. 클릭 폴백 항상 동작.
- 뷰어 닫기/작품 이동 중 권한 대기 레이스: cam.js 세대 가드 + main.js 시퀀스
  가드(09번에서 검증된 2중 가드).
- 손 인식 프레임 드랍: 제스처 상태 기계의 0.25s 유예로 흡수.
- tick 예외: 기존 셸의 아트리움 복귀 로직에 위임.

## 프라이버시

- 영상은 로컬 추론에만 사용 — 녹화·전송·저장 없음. 코너 미러도 캔버스에 매
  프레임 그릴 뿐 캡처하지 않는다.
- 버튼 클릭 시에만 권한 요청(자동 요청 금지). 뷰어 닫힘 시 무조건 트랙 해제.

## 테스트

- `test/babel-gesture.test.mjs`: `makeGesture`/`gestureStep`의 빌드 간격 발화,
  두 손 유지→붕괴 1회 발화, 쿨다운 중 재발화 금지, n 변화 유예를 node:test로
  검증. 10번 모듈은 import-safe 유지(카메라 API는 opts 주입·동적 로드).
- Playwright 시각 검증: `opts.cam`이 getter 주입 구조이므로 가짜 hands()
  시퀀스를 흘려 쌓기/붕괴/커서/쿨다운 렌더 확인 (09번 가짜 마이크 선례).
  실제 카메라·MediaPipe는 배포 전 로컬(HTTPS/localhost)에서 수동 1회.

## 하지 않는 것 (YAGNI)

- 제스처 종류 추가(주먹/핀치/스와이프), 손가락 개수 인식, 다른 작품 카메라 적용.
- MediaPipe 모델 셀프 호스팅(S3) — CDN 시작, 필요 시 후속.
- 미러 위치/크기 사용자 설정.
