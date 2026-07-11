# 09번 After Michelangelo — Creation of Adam 소리 반응 설계

- 날짜: 2026-07-11
- 대상: `js/mic.js`(신규), `js/main.js`, `js/data.js`, `index.html`, `css/`, `js/pieces/09-creation-of-adam.js`, `test/mic.test.mjs`(신규)
- 브랜치: `feature/adam-sound-reactive` (master 기반)

## 목표

09번의 "생명의 불꽃" 충전을 마이크 입력(숨·목소리)으로 일으킨다. 신이 아담에게
생명을 불어넣는 원작 서사를 관객의 실제 소리로 재현한다. 기존 커서 근접 충전은
폴백이자 병행 입력으로 유지한다.

## 확정된 요구사항 (사용자 선택)

1. **소리 반응 방식**: 지속음(숨·목소리)이 정전기를 충전하고, 가득 차면 방전.
   박수 즉발 방식이 아니라 충전 서사를 유지한다.
2. **커서 인터랙션**: 제거하지 않고 폴백/병행으로 유지. 마이크와 커서 중 충전량이
   큰 쪽이 적용된다.
3. **권한 UX**: 뷰어 내 🎤 버튼 클릭 시에만 getUserMedia 요청 (자동 요청 금지).

## 아키텍처 (A안: 셸 공용 마이크 서비스)

### js/mic.js — 신규 공용 서비스

- `request(): Promise<boolean>` — getUserMedia + AudioContext + AnalyserNode 연결.
  suspended면 resume. 성공 여부 반환.
- `active(): boolean` — 스트림 활성 여부.
- `level(): number` — 0..1 정규화된 입력 레벨 (time-domain RMS 기반, 매 프레임 폴링).
- `stop()` — 트랙 정지·해제. 브라우저 마이크 표시등이 반드시 꺼져야 한다.
- **순수 계산부 분리·export**: `normalizeLevel(rms, state)` — 노이즈 플로어를 느리게
  추적해 기준선으로 빼고, attack 빠르게·release 느리게 스무딩, 0..1 클램프.
  node:test 대상.

### js/main.js — 소폭 수정

- 작품 opts 확장: `audio: { enabled, mic: { active(), level() } }`.
  키 추가만이므로 나머지 15개 작품 무영향.
- `work.mic === true`일 때만 뷰어에 🎤 버튼 노출. 클릭 → `mic.request()`.
- `closeWork()`에서 무조건 `mic.stop()` (작품 이동·닫기 시 스트림 누수 방지).

### index.html + css

- 뷰어 힌트 옆 `viewer__mic` 버튼 1개. `aria-pressed`로 켜짐 상태 표시.
- 권한 거부/미지원 시 비활성 스타일 + "마이크를 사용할 수 없어요 — 커서로
  체험하세요" 안내.

### js/data.js

- 09번 항목에 `mic: true` 플래그.
- hint 갱신: "🎤를 켜고 소리로 생명을 불어넣으세요 · 커서로도 가능합니다".

### js/pieces/09-creation-of-adam.js

- `init`에서 `mic = opts.audio?.mic ?? null` 보관.
- `updateState` 충전 입력원 추가 (상태 기계 ready/ignite/cooldown은 무변경):

```
세기(level)  = clamp((level − 0.1) / 0.4, 0, 1)   // 0.1 이하 무시, 0.5 이상 최대
micCharge    = mic.active() ? dt / CHARGE_TIME × 세기(level) : 0
cursorCharge = 기존 근접 충전 (무변경)
charge      += max(micCharge, cursorCharge)
```

- 감각 목표: 속삭임(level≈0.1)은 거의 충전되지 않고, 또렷한 목소리(0.5+)면
  CHARGE_TIME(1.5초) 그대로 — "후—" 부는 숨이 약 2초 안에 방전으로 이어진다.
- 소리 충전 중 시각 피드백: 커서가 없어도 간극 중점을 가상 포인터 삼아
  `drawChargeSparks` 발동. 스파크 굵기·잔가지 수는 charge·level에 비례.

## 에러 처리

- 권한 거부·미지원·비보안 컨텍스트: `request()` → false. 버튼 비활성 + 안내.
  커서 폴백은 항상 동작.
- 탭 백그라운드 복귀로 AudioContext suspended: 버튼 재클릭 시 resume.
- 09번 재진입: 권한이 이미 승인된 경우 팝업 없이 즉시 재활성.
- tick 예외: 기존 셸의 아트리움 복귀 로직에 위임 (변경 없음).

## 테스트

- `test/mic.test.mjs`: `normalizeLevel`의 노이즈 플로어 추적, attack/release 스무딩,
  0..1 클램프를 node:test로 검증 (ssireum 테스트 패턴).
- Playwright 시각 검증: `audio.mic`가 getter 주입 구조인 점을 이용해 가짜 level을
  흘려 충전→방전 렌더 확인.
- 실제 마이크: 배포 전 수동 확인 1회 (HTTPS 필요 — CloudFront·localhost 모두 충족).

## 하지 않는 것 (YAGNI)

- 주파수 대역 분석(피치 감지), 박수 전용 감지, 다른 작품의 마이크 적용은 이번
  범위 밖. mic.js 인터페이스만 재사용 가능하게 남긴다.
- 전역 사운드 토글(출력용)과의 통합은 하지 않는다 — 입력과 출력은 별개 개념.
