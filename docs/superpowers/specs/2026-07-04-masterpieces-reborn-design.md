# Masterpieces Reborn — 다시 살아나는 걸작들 · 설계 스펙

- 날짜: 2026-07-04
- 상태: 승인됨 (사용자 승인 완료)
- 참고: https://d3acb4zouf8s0e.cloudfront.net/ (Generative Hours), making-of.html

## 1. 목적

세계 걸작 명화 12점을 인터랙티브 제너러티브 아트로 재해석한 웹 전시 사이트를 제작한다.
참고 사이트 "Generative Hours"의 검증된 구조(제로-빌드 정적 사이트, 작품별 독립 모듈)를
따르되, 전시 전체를 "명화 재해석" 주제로 구성한다. 사용자가 특히 좋아하는
"After Hokusai — Great Wave"의 **입자 유체 기법**(입자가 원작 형상으로 모임 ↔ 손길에
흩어짐 ↔ 다시 복원)을 Ⅰ관 4개 작품의 공통 기법으로 적용한다.

## 2. 확정된 요구사항

| 항목 | 결정 |
|------|------|
| Hokusai 스타일 해석 | 기법 적용형 — 입자 모임/흩어짐/복원 기법을 다른 명화에 적용 |
| 규모 | 12작품 / 3전시관 |
| 큐레이션 | Claude 큐레이션, 전부 퍼블릭 도메인, 참고 사이트 6점과 중복 회피 (Great Wave만 오마주 앵커로 신규 구현) |
| 아키텍처 | 제로-빌드 바닐라 ES 모듈, Canvas 2D 중심 |
| 배포 | 신규 S3 버킷 + CloudFront(OAC), `aws s3 sync` |
| 품질 게이트 | content-review-agent ≥ 85점 (배포 전 필수) |
| 언어 | 한국어 UI + 영문 작품 제목 (참고 사이트와 동일한 톤) |

## 3. 큐레이션 (12점 / 3관)

전시명: **Masterpieces Reborn — 다시 살아나는 걸작들**

### Ⅰ관 · 파도의 방 (The Wave Hall) — Hokusai 입자 기법 4점

공통 기법: 원작 이미지 픽셀을 샘플링한 목표 좌표로 입자가 응집, 커서 교란 시 흩어지고
스프링 복원력으로 원작 형상 복귀.

| # | 작품 (원작 연도) | 인터랙션 차별점 |
|---|------|----------------|
| 1 | After Hokusai — Great Wave (1831) | 앵커. 파도가 주기적으로 부서지며 물보라가 포말 입자로 폭발 |
| 2 | After Botticelli — Birth of Venus (c.1485) | 바다 거품 입자 응집, 드래그 바람에 머리칼·꽃잎 날림 |
| 3 | After Vermeer — Girl with a Pearl Earring (c.1665) | 어둠 속 빛 먼지 입자, 진주가 마지막에 가장 밝게 복원 |
| 4 | After Leonardo — Mona Lisa (c.1503) | sfumato 안개 입자, 흩어질수록 미소가 사라졌다 서서히 복귀 |

### Ⅱ관 · 빛의 방 (Light & Atmosphere) 4점

| # | 작품 (원작 연도) | 기법 |
|---|------|------|
| 5 | After Monet — Impression, Sunrise (1872) | 일렁이는 수면 반사, 해 고동, 드래그 물결 |
| 6 | After Rembrandt — The Night Watch (1642) | 커서 등불로 어둠 속 인물을 비추는 키아로스쿠로 |
| 7 | After Van Gogh — Sunflowers (1888) | 임파스토 붓질, 해바라기 개화/시듦 사이클, 클릭 개화 |
| 8 | After Turner — Rain, Steam and Speed (1844) | 증기·비·안개 유동장, 기차 접근 연출 |

### Ⅲ관 · 꿈의 방 (Form & Dream) 4점

| # | 작품 (원작 연도) | 기법 |
|---|------|------|
| 9 | After Michelangelo — Creation of Adam (1512) | 두 손끝을 커서로 이으면 생명의 불꽃 |
| 10 | After Bruegel — Tower of Babel (1563) | 클릭 건설 / 길게 눌러 붕괴 |
| 11 | After Kandinsky — Composition VIII (1923) | 기하 도형이 악기처럼 반응 (WebAudio, 음소거 기본) |
| 12 | After Hiroshige — Sudden Shower over Shin-Ōhashi (1857) | 우키요에 빗줄기 입자, 커서 우산 |

저작권: 모든 원작은 퍼블릭 도메인(작가 사후 70년 초과 또는 1930년 이전 발표작).
원작 이미지는 Wikimedia Commons에서 다운로드해 256px로 리사이즈 후 `assets/targets/`에
로컬 번들한다 — 런타임 외부 핫링크 없음. 다운로드 실패 시 해당 작품은 절차적
근사 형상으로 구현한다(에러 처리의 폴백과 동일 경로).

## 4. 아키텍처

### 파일 구조

```
media-art2/
├── index.html              # 셸: 아트리움(랜딩) + 뷰어 마크업
├── css/style.css           # 다크 갤러리 톤, 관별 액센트 컬러
├── js/
│   ├── main.js             # 전시 셸: 내비게이션, 작품 로더, 오버레이 UI
│   ├── data.js             # WINGS(3) + WORKS(12) 메타데이터
│   ├── particle-engine.js  # Ⅰ관 공통 입자 엔진
│   └── pieces/01-*.js … 12-*.js   # 작품당 1모듈
└── assets/targets/         # 저해상(256px) 원작 이미지, 로컬 번들
```

### 작품 모듈 공통 인터페이스

각 piece 모듈은 다음을 export:

```js
export default {
  init(canvas, ctx, opts),   // 셋업, 이미지/입자 준비
  tick(dt, pointer),         // rAF 프레임 (pointer: {x, y, down, vx, vy})
  resize(w, h),
  dispose(),                 // rAF·리스너·오디오 정리
};
```

`main.js`는 선택된 작품만 동적 `import()`로 로드, 뷰어 종료 시 `dispose()` 호출.

### 입자 엔진 (Ⅰ관 공통)

1. 목표 이미지(256px)를 오프스크린 캔버스에 그려 픽셀 샘플링
2. 밝기/알파 임계값 통과 픽셀에 입자 목표 좌표·색 부여
3. 매 프레임: `가속도 = 스프링(목표-현재)·k + 커서 교란력 - 감쇠·속도`
4. 입자 수 자동 조절: 모바일 ~2,500 / 데스크톱 ~7,000 (화면 픽셀 수 기준)

### 데이터 흐름

`data.js` → `main.js`(아트리움 카드 렌더) → 클릭 → 뷰어 열기 + 모듈 동적 로드
→ piece 자체 rAF 루프 → 종료 시 dispose.

### 에러 처리

- 모듈 로드 실패: 뷰어에 안내 문구 + 아트리움 복귀 버튼
- 이미지 로드 실패: 절차적 폴백 형상(작품별 단순 기하 근사)으로 대체
- `prefers-reduced-motion`: 입자 속도·교란 강도 감쇠 모드
- WebAudio(11번): 사용자 제스처 후에만 AudioContext 시작, 기본 음소거

## 5. 검증

- 로컬 `python3 -m http.server` 서빙 후 Playwright로 12작품 전부 실제 구동:
  각 작품 열기 → 스크린샷 → 콘솔 에러 0 확인 → 드래그/클릭 시뮬레이션 → 반응 확인
- 작품 전환 반복(열기→닫기→다른 작품)으로 dispose 누수 검증
- 반응형: 데스크톱/모바일 뷰포트 2종 확인

## 6. 품질 게이트 & 배포

1. content-review-agent 리뷰 ≥ 85점 (레이아웃, 한국어 문구, 접근성, 작품 정보 정확성)
2. 신규 S3 버킷(퍼블릭 차단) + CloudFront(OAC) 생성
3. `aws s3 sync`로 업로드, CloudFront URL 확인
4. 배포 후 실제 URL에서 스모크 테스트

## 7. 성공 기준

1. 12작품 모두 콘솔 에러 없이 60fps 근접 구동
2. Ⅰ관 4점에서 "모임↔흩어짐↔복원" 사이클이 명확히 체감
3. content-review ≥ 85점
4. CloudFront URL로 어느 기기에서나 접속 가능

## 8. 범위 제외 (YAGNI)

- 카메라/음성 인터랙션 (참고 사이트에는 있으나 이번 범위 아님)
- three.js 3D 작품, 빌드 도구, 프레임워크
- making-of 페이지 (필요 시 후속 작업)
- 사운드는 11번 작품 한정
