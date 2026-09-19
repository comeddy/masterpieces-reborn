# 10번 Tower of Babel 유휴 리셋 설계 — 관객이 떠나면 탑이 스스로 무너진다

- 날짜: 2026-09-19
- 대상: `js/pieces/10-tower-of-babel.js`, `test/babel-gesture.test.mjs`
- 브랜치: `feature/babel-idle-reset` (master 기반)

## 요구 (사용자, 2026-09-19)

3~5초간 반응이 없으면 탑을 부수고 리셋. 확정 선택: **관객이 떠나면 1회 리셋** —
마지막 입력 후 3~5초 무입력 시 전체 붕괴 + 밑동 재건을 한 번만 실행하고, 새 입력이
올 때까지 재발동하지 않는다(자동 건설·MAX_TIERS 상한은 기존대로 유휴를 담당).

## 설계

### 순수 상태 기계 (node:test 대상)

```
IDLE_MIN = 3, IDLE_MAX = 5
makeIdle(): { armed: false, t: 0, limit: 0 }
idleStep(s, engaged, dt, pick): boolean
  - engaged(입력 있는 프레임): 미무장이면 limit = pick()으로 무장, t = 0. false.
  - 무장 상태 유휴: t += dt, t >= limit이면 무장 해제·t=0 후 true(1회 발동).
  - 미무장 유휴: 아무것도 안 함(false) — 재발동 없음.
```

- `engaged` 판정(피스): `(ptr.inside && ptr.down) || ptr.justDown || handPt.n >= 1`
  — 클릭·드래그·카메라 손 감지. 단순 커서 이동은 반응으로 치지 않는다.
- limit은 무장 시점마다 `rand(IDLE_MIN, IDLE_MAX)` — 사이클마다 3~5초 랜덤.

### 리셋 연출 — 기존 경로 재사용

`resetTower()`: `collapseFrom(0)`(전체 파편 붕괴 + 흙먼지) 직후 밑동 3층의 모든
슬롯을 `placeSlot`으로 재배치 — 벽돌이 위에서 떨어져 안착하는 기존 낙하 연출로
재건. 카메라 줌은 매 프레임 `camTarget` 재계산이라 자동 복귀. reduced-motion은
기존 collapse/place 경로의 감쇠를 그대로 상속.

### 무변경

클릭/카메라 인터랙션, 자동 건설, MAX_TIERS 상한, 렌더, 힌트·note 문구(리셋은
서사상 자명 — "무너진 자리에서도 건설은 계속된다"), 다른 작품·셸.

## 검증

node:test 2건(무장→발동 1회·재발동 없음·재무장 시 재발동 / 입력 지속 시 미발동)
+ 전체 회귀. 시각은 삭제·재사용 경로 조합이라 기존 E2E 커버리지에 의존.

## YAGNI

리셋 예고 연출(카운트다운·흔들림), 힌트 문구 추가, 다른 작품 적용 — 범위 밖.
